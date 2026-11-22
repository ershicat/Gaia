import { translate, type TranslationMessage } from '../../i18n/index.js'
import { apiOrigin, currentApiTarget, type ApiTarget } from '../../platform/index.js'
import { openAiUrl, parseOpenAiStream, toOpenAiBody } from './openai.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import type {
  ApiErrorBody,
  CreateMessageRequest,
  FileObject,
  FilePurpose,
  MessageStreamEvent,
} from './types.js'

/** 构建期默认接口地址（https://api.deepseek.com）；运行期由宿主下发的地址覆盖 */
const DEFAULT_ORIGIN = __API_ORIGIN__
/** 引用 Files API 上传的图片、调用 Anthropic 兼容 Files API 时必须携带 */
const FILES_BETA = 'files-api-2025-04-14'
/** 第三方 Anthropic 原生接口要求的版本头 */
const ANTHROPIC_VERSION = '2023-06-01'
/** 第三方 Anthropic 原生接口必填 max_tokens；DeepSeek 侧不传，走服务端默认 */
const FOREIGN_ANTHROPIC_MAX_TOKENS = 8192

/** 当前接口地址：宿主下发优先，否则用构建期默认值 */
export const apiBase = (): string => apiOrigin(DEFAULT_ORIGIN)
/** Anthropic 兼容接口的前缀（DeepSeek 专有布局） */
const anthropicBase = (): string => `${apiBase()}/anthropic/v1`

/** 当前接口目标；null 表示按构建期默认的 DeepSeek 走 */
const target = (): ApiTarget | null => currentApiTarget()

const baseOf = (api: ApiTarget | null): string => api?.baseUrl ?? apiBase()

/** 模型列表地址：服务商预设优先，否则用 DeepSeek 的 /models */
const modelsUrl = (api: ApiTarget | null): string => `${baseOf(api)}${api?.modelsPath ?? '/models'}`

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export const request = async (url: string, init: RequestInit): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readErrorResponse(response)
  }
  return response
}

const anthropicHeaders = (apiKey: string, beta: boolean): Record<string, string> => ({
  // DeepSeek 兼容接口的鉴权方式，也可使用 Authorization: Bearer。
  'x-api-key': apiKey,
  // Files API 和通过 file_id 引用图片时必传；纯文本聊天无需携带。
  ...(beta ? { 'anthropic-beta': FILES_BETA } : {}),
})

/** 校验与拉模型用的鉴权头：第三方 Anthropic 原生要 x-api-key + 版本头，其余用 Bearer */
const modelHeaders = (api: ApiTarget | null, apiKey: string): Record<string, string> =>
  api?.protocol === 'anthropic' && !api.serverTools
    ? { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
    : { Authorization: `Bearer ${apiKey}` }

/** 用 GET /models 校验 API Key（不产生费用） */
export const verifyApiKey = async (apiKey: string, signal?: AbortSignal): Promise<void> => {
  const api = target()
  await request(modelsUrl(api), {
    method: 'GET',
    headers: modelHeaders(api, apiKey),
    signal,
  })
}

/** 拉服务商模型列表；返回 id 数组，失败抛 ApiError 由调用方提示 */
export const listModels = async (apiKey: string, signal?: AbortSignal): Promise<string[]> => {
  const api = target()
  const response = await request(modelsUrl(api), {
    method: 'GET',
    headers: modelHeaders(api, apiKey),
    cache: 'no-store',
    signal,
  })
  const body: unknown = await response.json().catch(() => null)
  const list =
    body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data as unknown[])
      : []
  return list
    .map((item) =>
      item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
        ? ((item as { id: string }).id)
        : ''
    )
    .filter((id) => id !== '')
}

/**
 * POST /anthropic/v1/files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * purpose 为 null 时不传该字段（图片）；purpose 必须排在 file 之前。
 */
export const uploadFile = async (
  apiKey: string,
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', file)
  const response = await request(`${anthropicBase()}/files`, {
    method: 'POST',
    headers: anthropicHeaders(apiKey, true),
    body: form,
    signal,
  })
  return (await response.json()) as FileObject
}

/** DELETE /anthropic/v1/files/{file_id} */
export const deleteFile = async (apiKey: string, fileId: string): Promise<void> => {
  await request(`${anthropicBase()}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: anthropicHeaders(apiKey, true),
  })
}

const hasFile = (body: CreateMessageRequest) =>
  body.messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/** 逐个消费 SSE 事件并产出可识别的流事件，收到 message_stop 时结束 */
async function* streamAnthropicEvents(
  response: Response,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      if (eventName !== 'error') {
        continue
      }
    }
    if (isErrorBody(payload)) {
      throw new ApiError('stream', payload.error.message)
    }
    if (eventName === 'error') {
      throw new ApiError('stream', data)
    }
    const event = readMessageEvent(payload)
    if (!event) {
      continue
    }
    yield event
    if (event.type === 'message_stop') {
      return
    }
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}

/**
 * POST {chatPath}（stream: true）：
 * - 未选服务商 / DeepSeek：原样发 Anthropic 兼容请求体（含服务端工具）；
 * - 其它 Anthropic 原生服务商：消息转纯文本、去掉 DeepSeek 专属字段、补 max_tokens 与版本头；
 * - OpenAI 兼容服务商：走 openai.ts 的转换与解析。
 * 中止请求时抛出 signal 的 AbortError。
 */
export async function* streamMessage(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const api = target()

  if (api?.protocol === 'openai') {
    yield* streamOpenAi(api, apiKey, body, signal)
    return
  }

  const url = api ? `${api.baseUrl}${api.chatPath}` : `${anthropicBase()}/messages`

  if (!api || api.serverTools) {
    const response = await request(url, {
      method: 'POST',
      headers: {
        ...anthropicHeaders(apiKey, hasFile(body)),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    })
    yield* streamAnthropicEvents(response, signal)
    return
  }

  // 第三方 Anthropic 原生：纯文本消息 + 必填 max_tokens
  const plain = toOpenAiBody(body, false)
  const response = await request(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: body.model,
      system: body.system,
      messages: plain.messages.filter((message) => message.role !== 'system'),
      max_tokens: FOREIGN_ANTHROPIC_MAX_TOKENS,
      stream: true,
      ...(plain.temperature === undefined ? {} : { temperature: plain.temperature }),
    }),
    signal,
  })
  yield* streamAnthropicEvents(response, signal)
}

/** OpenAI 兼容服务商：先按标准带 stream_options，个别服务商 400 时去掉它重试一次 */
async function* streamOpenAi(
  api: ApiTarget,
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const url = openAiUrl(api)
  const send = async (withUsage: boolean): Promise<Response> =>
    request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(toOpenAiBody(body, withUsage)),
      signal,
    })

  let response: Response
  try {
    response = await send(true)
  } catch (error) {
    // 400 常见于不认 stream_options 的服务商；只在这种情况下降级重试一次
    if (error instanceof ApiError && error.status === 400) {
      response = await send(false)
    } else {
      throw error
    }
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  try {
    yield* parseOpenAiStream(response.body, body.model, signal)
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError('stream', error instanceof Error ? error.message : String(error))
  }
}
