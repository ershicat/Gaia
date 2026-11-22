/**
 * OpenAI Chat Completions 兼容协议：请求体转换 + 流式解析。
 *
 * 上层（chat/store）本来只会拼 Anthropic 形请求体（system / messages / thinking / tools），
 * 这里把它翻译成 OpenAI 形；响应再翻译回 MessageStreamEvent，回复归并层完全不用改。
 *
 * 已知取舍（P1）：
 * - 附件不发：图片/文档块降级为「[图片]」「[文件]」文字占位（OpenAI 侧没有 Files API 的 file_id）；
 * - 历史思考块按用户确认的方案以纯文本并入 assistant 正文（不带 signature）；
 * - latest_reminder 是 DeepSeek 专属角色，合并进下一条 user 消息。
 */
import type { ApiTarget } from '../../platform/index.js'
import { readServerSentEvents } from './sse.js'
import type {
  CreateMessageRequest,
  MessageStreamEvent,
  MessageUsage,
  StopReason,
} from './types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** 单个内容块 → 纯文本；不认识的服务端块直接丢弃 */
const blockText = (block: unknown): string => {
  if (!isRecord(block)) {
    return ''
  }
  switch (block.type) {
    case 'text':
      return typeof block.text === 'string' ? block.text : ''
    case 'thinking':
      return typeof block.thinking === 'string' ? block.thinking : ''
    case 'image':
      return '[图片]'
    case 'document':
      return '[文件]'
    default:
      return ''
  }
}

/** 消息内容（字符串或内容块数组）→ 纯文本 */
const contentText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(blockText)
    .filter((part) => part !== '')
    .join('\n\n')
}

type PlainMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type OpenAiBody = {
  model: string
  messages: PlainMessage[]
  stream: true
  temperature?: number
  stream_options?: { include_usage: boolean }
}

/**
 * Anthropic 形请求体 → OpenAI 请求体。
 * withUsage 控制是否带 stream_options（个别服务商不认这个字段，失败时由调用方重试一次不带它的）。
 */
export const toOpenAiBody = (body: CreateMessageRequest, withUsage: boolean): OpenAiBody => {
  const messages: PlainMessage[] = []
  if (body.system.trim()) {
    messages.push({ role: 'system', content: body.system.trim() })
  }
  // latest_reminder 只能紧跟下一条 user 消息落地（DeepSeek 专属角色，OpenAI 侧没有）
  let reminder = ''
  for (const message of body.messages) {
    if (message.role === 'latest_reminder') {
      reminder = contentText(message.content)
      continue
    }
    const text = contentText(message.content)
    const merged = reminder && text ? `${reminder}\n\n${text}` : reminder || text
    if (message.role === 'user') {
      reminder = ''
      if (merged.trim()) {
        messages.push({ role: 'user', content: merged })
      }
      continue
    }
    if (message.role === 'assistant' && merged.trim()) {
      messages.push({ role: 'assistant', content: merged })
    }
  }
  const request: OpenAiBody = { model: body.model, messages, stream: true }
  if (typeof body.temperature === 'number') {
    request.temperature = body.temperature
  }
  if (withUsage) {
    request.stream_options = { include_usage: true }
  }
  return request
}

/** 聊天地址：baseUrl 已含版本段（如 /v1），chatPath 为 /chat/completions */
export const openAiUrl = (target: ApiTarget): string => `${target.baseUrl}${target.chatPath}`

const mapStopReason = (reason: string): StopReason => {
  if (reason === 'length') {
    return 'max_tokens'
  }
  if (reason === 'content_filter') {
    return 'refusal'
  }
  return 'end_turn'
}

/**
 * OpenAI usage → 我们的 usage：prompt_tokens 含命中部分，所以未命中 = prompt - cached。
 */
const readUsage = (value: unknown): MessageUsage | null => {
  if (!isRecord(value) || typeof value.prompt_tokens !== 'number') {
    return null
  }
  const details = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : {}
  const cached = typeof details.cached_tokens === 'number' ? details.cached_tokens : 0
  return {
    input_tokens: Math.max(0, value.prompt_tokens - cached),
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cached,
    output_tokens: typeof value.completion_tokens === 'number' ? value.completion_tokens : 0,
  }
}

/**
 * 把 OpenAI 的增量流翻译成 MessageStreamEvent。
 * 文本与 reasoning_content 各占一个内容块；结束时补 content_block_stop 与 message_stop。
 */
export async function* parseOpenAiStream(
  stream: ReadableStream<Uint8Array>,
  model: string,
  signal?: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  let textIndex = -1
  let thinkingIndex = -1
  let next = 0
  let usage: MessageUsage | undefined
  let stopReason: StopReason = 'end_turn'

  const openThinking = (): MessageStreamEvent => {
    thinkingIndex = next
    next += 1
    return { type: 'content_block_start', index: thinkingIndex, content_block: { type: 'thinking', thinking: '', signature: '' } }
  }
  const closeThinking = (): MessageStreamEvent | null => {
    if (thinkingIndex < 0) {
      return null
    }
    const event: MessageStreamEvent = { type: 'content_block_stop', index: thinkingIndex }
    thinkingIndex = -1
    return event
  }
  const openText = (): MessageStreamEvent => {
    textIndex = next
    next += 1
    return { type: 'content_block_start', index: textIndex, content_block: { type: 'text', text: '' } }
  }
  const closeText = (): MessageStreamEvent | null => {
    if (textIndex < 0) {
      return null
    }
    const event: MessageStreamEvent = { type: 'content_block_stop', index: textIndex }
    textIndex = -1
    return event
  }

  yield { type: 'message_start', message: { id: '', model } }

  for await (const { data } of readServerSentEvents(stream, signal)) {
    if (data === '[DONE]') {
      break
    }
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      continue
    }
    if (!isRecord(payload)) {
      continue
    }
    if ('error' in payload) {
      const error = payload.error
      const message = isRecord(error) && typeof error.message === 'string' ? error.message : ''
      throw new Error(message || '服务商在流中返回了错误')
    }
    const parsedUsage = readUsage(payload.usage)
    if (parsedUsage) {
      usage = parsedUsage
    }
    const choices = payload.choices
    if (!Array.isArray(choices) || choices.length === 0) {
      continue
    }
    const choice = choices[0]
    if (!isRecord(choice)) {
      continue
    }
    if (isRecord(choice.delta)) {
      const delta = choice.delta
      const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : ''
      if (reasoning) {
        const closed = closeText()
        if (closed) {
          yield closed
        }
        if (thinkingIndex < 0) {
          yield openThinking()
        }
        yield {
          type: 'content_block_delta',
          index: thinkingIndex,
          delta: { type: 'thinking_delta', thinking: reasoning },
        }
      }
      const text = typeof delta.content === 'string' ? delta.content : ''
      if (text) {
        const closed = closeThinking()
        if (closed) {
          yield closed
        }
        if (textIndex < 0) {
          yield openText()
        }
        yield {
          type: 'content_block_delta',
          index: textIndex,
          delta: { type: 'text_delta', text },
        }
      }
    }
    if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
      stopReason = mapStopReason(choice.finish_reason)
    }
  }

  const closedThinking = closeThinking()
  if (closedThinking) {
    yield closedThinking
  }
  const closedText = closeText()
  if (closedText) {
    yield closedText
  }
  yield {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage,
  }
  yield { type: 'message_stop' }
}
