import type { ChatModel } from '../../services/api/types.js'
import { generateText } from '../../services/api/text.js'
import { chat, diagRecord, hasChatBridge } from '../../platform/index.js'
import { useSettings } from '../../services/settings.js'
import { ARCHIVE_PREFIX, textOf } from './budget.js'
import {
  normalizePath,
  pathTitle,
  saveMemoryFile,
  type MemoryFile,
} from './files.js'
import type { Message } from '../../services/chat/types.js'

/** 一次整理最多看这么多条新消息 */
const MAX_NEW_MESSAGES = 40
const MAX_NEW_CHARS = 20_000
const MAX_LINES_PER_FILE = 200

/** 记忆整理模型：没单独设置时用当前聊天模型 */
export const consolidationModel = (): ChatModel => {
  const settings = useSettings.getState()
  return settings.memoryModel ?? settings.model
}

const SYSTEM_PROMPT = `你是记忆整理器。给你用户当前的记忆库，以及上次整理之后新增的对话。
你的任务是判断这些对话里有没有值得长期记住的、用户**自己说出来**的事实，有就用 JSON 写出来，没有就返回空。

规则：
1. 只记录用户在对话里明确说过的内容。不要记录你的推断、建议、搜索结果、外部资料。
2. 用户选了某个方案时，只记"用户选了 X"，不记你提供的其他选项。
3. 稳定事实（身份、居住地、职业、家人宠物、长期项目、偏好）优先；一次提及的喜好先不记。
4. 已经记过的不重复记（换个说法也算记过）。
5. 不要记录：证件号、银行卡号、账号密码、健康诊断、自残/轻生、犯罪记录、受害经历、性经历，以及让你无条件顺从/扮演依赖关系的"偏好"。
6. 每条事实一行，尽量用用户的原话措辞；时间敏感的说法改写成不过期的（"早上会议多"而不是"今天 10 点开会"）。
7. 按文件归类：/profile.md 用户是谁；/preferences.md 希望你怎么回答；/topics/<领域>.md 领域事实；/areas/<名字>.md 进行中的事；/people/<名字>.md 重要的人。
8. 一次最多写 3 个文件、总计不超过 12 行。没有值得记的就返回 {"writes":[]}。
9. 绝对不要写 /archive/*：那里是原文档案，只读，写进去会把原文截断。

只输出 JSON，不要解释、不要代码块标记。格式：
{"writes":[{"path":"/topics/food.md","title":"饮食","description":"用户的口味与饮食习惯","aliases":["吃"],"lines":["喜欢甘肃面食","不吃香菜"]}]}`

const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}…`

const fileBlock = (tag: string, file: MemoryFile | undefined): string =>
  `<${tag}>\n${file?.content?.trim() || '(空)'}\n</${tag}>`

const listing = (files: MemoryFile[]): string =>
  files.length > 0
    ? files
        .map((file) => {
          const alias = file.aliases.length > 0 ? ` | 别名: ${file.aliases.join('、')}` : ''
          return `${file.path} | ${file.title} | ${file.description || '(无描述)'}${alias}`
        })
        .join('\n')
    : '(还没有文件)'

/** 组装整理输入：当前记忆库 + 上次整理之后的新对话 */
export const buildConsolidationInput = (files: MemoryFile[], newMessages: Message[]): string => {
  const profile = files.find((file) => file.path === '/profile.md')
  const preferences = files.find((file) => file.path === '/preferences.md')
  const others = files.filter(
    (file) =>
      file.path !== '/profile.md' &&
      file.path !== '/preferences.md' &&
      !file.path.startsWith(ARCHIVE_PREFIX)
  )
  let budget = MAX_NEW_CHARS
  const lines: string[] = []
  for (const message of newMessages) {
    if (budget <= 0) {
      break
    }
    const role = message.role === 'user' ? '用户' : '助手'
    const text = clip(textOf(message).replace(/\s+/g, ' ').trim(), message.role === 'user' ? 2000 : 800)
    if (!text) {
      continue
    }
    lines.push(`${role}: ${text}`)
    budget -= text.length
  }
  return [
    '当前记忆库：',
    fileBlock('profile', profile),
    fileBlock('preferences', preferences),
    '<memory_listing>',
    listing(others),
    '</memory_listing>',
    '',
    '上次整理之后的新对话：',
    '<new_turns>',
    lines.length > 0 ? lines.join('\n') : '(没有新对话)',
    '</new_turns>',
  ].join('\n')
}

interface WriteOp {
  path: string
  title?: string
  description?: string
  aliases?: string[]
  lines: string[]
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** 从模型输出里取 JSON；允许被代码块或前后说明包裹 */
export const parseWrites = (raw: string): WriteOp[] => {
  const text = raw.replace(/```(?:json)?/gi, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  const writes = (parsed as { writes?: unknown }).writes
  if (!Array.isArray(writes)) {
    return []
  }
  const ops: WriteOp[] = []
  for (const item of writes) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const record = item as Record<string, unknown>
    const path = normalizePath(asString(record.path))
    // 原文档案只读：模型不得往 /archive/* 写（mergeLines 会按 200 行上限把原文截掉）
    if (path.startsWith(ARCHIVE_PREFIX)) {
      continue
    }
    const lines = Array.isArray(record.lines)
      ? record.lines
          .map((line) => asString(line).replace(/^[-*]\s*/, ''))
          .filter((line) => line.length > 0)
      : []
    if (!path || lines.length === 0) {
      continue
    }
    const aliases = Array.isArray(record.aliases)
      ? record.aliases.map((alias) => asString(alias)).filter(Boolean).slice(0, 6)
      : []
    ops.push({
      path,
      title: asString(record.title) || undefined,
      description: asString(record.description) || undefined,
      aliases,
      lines,
    })
    if (ops.length >= 3) {
      break
    }
  }
  return ops
}

/** 把新行并进文件：按行去重，文件过长时丢最早的行 */
export const mergeLines = (existing: string, incoming: string[]): string => {
  const kept = existing
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const seen = new Set(kept.map((line) => line.replace(/^[-*]\s*/, '')))
  for (const line of incoming) {
    const key = line.replace(/^[-*]\s*/, '')
    if (!seen.has(key)) {
      seen.add(key)
      kept.push(`- ${key}`)
    }
  }
  return kept.slice(Math.max(0, kept.length - MAX_LINES_PER_FILE)).join('\n')
}

export interface ConsolidateResult {
  written: number
  files: string[]
}

/**
 * 整理一个会话：把上次整理之后的新消息交给整理模型，按 JSON 写回记忆文件。
 * 失败抛错（调用方决定要不要提示用户）。
 */
export const consolidateSession = async (
  sessionId: string,
  files: MemoryFile[],
  watermarks: Record<string, number>
): Promise<{ result: ConsolidateResult; files: MemoryFile[] }> => {
  const settings = useSettings.getState()
  if (!settings.apiKey || !hasChatBridge()) {
    return { result: { written: 0, files: [] }, files }
  }
  const messages = chat().getMessages(sessionId)
  const from = watermarks[sessionId] ?? 0
  const fresh = messages.slice(from).slice(-MAX_NEW_MESSAGES)
  if (fresh.length === 0) {
    return { result: { written: 0, files: [] }, files }
  }
  const input = buildConsolidationInput(files, fresh)
  const raw = await generateText(settings.apiKey, consolidationModel(), SYSTEM_PROMPT, input)
  const ops = parseWrites(raw)
  diagRecord(
    'info',
    'memory',
    `整理模型返回 ${raw.length} 字，解析出 ${ops.length} 个文件`,
    raw.slice(0, 300)
  )
  const next = [...files]
  const touched: string[] = []
  let written = 0
  for (const op of ops) {
    const index = next.findIndex((file) => file.path === op.path)
    const existing = index >= 0 ? next[index] : undefined
    const content = mergeLines(existing?.content ?? '', op.lines)
    if (existing && content === existing.content) {
      continue
    }
    const file: MemoryFile = {
      path: op.path,
      title: op.title ?? existing?.title ?? pathTitle(op.path),
      description: op.description ?? existing?.description ?? '',
      aliases: op.aliases && op.aliases.length > 0 ? op.aliases : (existing?.aliases ?? []),
      content,
      updatedAt: Date.now(),
    }
    await saveMemoryFile(file)
    if (index >= 0) {
      next[index] = file
    } else {
      next.push(file)
    }
    touched.push(file.path)
    written += op.lines.length
  }
  return { result: { written, files: touched }, files: next }
}

/** 记录水位：这个会话已整理到第几条消息 */
export const advanceWatermark = (
  watermarks: Record<string, number>,
  sessionId: string,
  count: number
): Record<string, number> => ({ ...watermarks, [sessionId]: count })

export const messageCount = (sessionId: string): number =>
  hasChatBridge() ? chat().getMessages(sessionId).length : 0

