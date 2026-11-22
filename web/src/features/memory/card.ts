import type { Message } from '../../services/chat/types.js'
import { estimateTokens, textOf } from './budget.js'

/**
 * 会话档案卡：把「这是谁 / 我们什么关系 / 剧情到哪」固化成一张小卡。
 *
 * 为什么需要它：上下文只带固定窗口后，窗口外的"人是谁、剧情到哪"就丢了，模型开始 OOC。
 * 为什么不能读全历史：3450 轮的会话全量提炼要几百万 token（几块钱）。
 * 所以只取有界样本：开头一段（人物初登场、设定交代）+ 最近一段（当前进度）。
 */

/** 开头采样预算（token）：人物与设定通常在前几轮交代 */
const HEAD_TOKENS = 8000
/** 结尾采样预算（token）：当前剧情进度 */
const TAIL_TOKENS = 16000

export interface CardCharacter {
  name: string
  age: string
  role: string
  speech: string
  address: string
}

export interface SessionCard {
  characters: CardCharacter[]
  relation: string
  world: string[]
  plot: string
  threads: string[]
  /** 生成时看到的消息条数，用于判断是否该更新 */
  covered: number
  updatedAt: number
}

const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}…`

/** 取开头一段：从最早开始累计，不超过预算 */
const headSlice = (messages: Message[], budget: number): Message[] => {
  let used = 0
  const picked: Message[] = []
  for (const message of messages) {
    const cost = estimateTokens(textOf(message)) + 8
    if (used + cost > budget) {
      break
    }
    used += cost
    picked.push(message)
  }
  return picked
}

/** 取结尾一段：从最新往回累计，不超过预算 */
const tailSlice = (messages: Message[], budget: number): Message[] => {
  let used = 0
  const picked: Message[] = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const cost = estimateTokens(textOf(messages[index])) + 8
    if (used + cost > budget) {
      break
    }
    used += cost
    picked.unshift(messages[index])
  }
  return picked
}

const renderLine = (message: Message): string =>
  `${message.role === 'user' ? '我' : '角色'}：${clip(textOf(message).replace(/\s+/g, ' ').trim(), 400)}`

/** 组装一次建档/更新的输入 */
export const buildCardInput = (messages: Message[], previous: SessionCard | null): string => {
  const head = headSlice(messages, HEAD_TOKENS)
  const tail = tailSlice(messages, TAIL_TOKENS)
  const headEnd = head.length
  const tailStart = messages.length - tail.length
  const sections = [
    previous ? `<已有档案>\n${renderCard(previous)}\n</已有档案>` : '',
    head.length > 0 ? `<开头 ${head.length} 条>\n${head.map(renderLine).join('\n')}\n</开头>` : '',
    tail.length > 0
      ? `<最近 ${tail.length} 条（第 ${tailStart + 1}–${messages.length} 条）>\n${tail
          .map(renderLine)
          .join('\n')}\n</最近>`
      : '',
    headEnd < tailStart ? `（开头与最近之间的 ${tailStart - headEnd} 条未提供，按已有档案与最近内容推断即可，不要编造细节）` : '',
  ]
  return sections.filter(Boolean).join('\n\n')
}

export const CARD_SYSTEM_PROMPT = `你是会话档案整理器。根据给定的对话片段，输出一张供模型长期使用的人物与剧情档案卡。
规则：
1. 只写对话里明确出现过的信息。没提到的字段写"未知"，绝不推测、绝不编造。
2. 人物：只写反复出现或明确是主要角色的人（最多 4 个）。姓名、年龄、身份、说话风格、对"我"的称呼都要来自原文。
3. 关系：一句话说清"角色与我的关系"（如"上下级兼暧昧对象"）。
4. 世界要点：世界观硬设定（朝代、地点、规则、禁忌），最多 6 条，每条不超过 30 字。
5. 剧情进度：用 3–6 句话写清当前推进到哪、刚刚发生了什么、我处在什么处境。
6. 未完成线索：最多 5 条，是还没收束的悬念或待办。
7. 不要写露骨的性描写，剧情进度里点到"亲密"即可。
8. 若给了已有档案，保留仍然成立的内容，只更新变化的部分；姓名与年龄这类稳定信息不要改，除非新对话明确推翻。

只输出 JSON，不要解释、不要代码块标记。格式：
{"characters":[{"name":"","age":"","role":"","speech":"","address":""}],"relation":"","world":[""],"plot":"","threads":[""]}`

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const asList = (value: unknown, limit: number): string[] =>
  Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean).slice(0, limit)
    : []

/** 从模型输出里解析档案；解析不了返回 null（不写入半成品） */
export const parseCard = (raw: string, covered: number): SessionCard | null => {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const characters: CardCharacter[] = Array.isArray(record.characters)
    ? record.characters
        .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
        .map((item) => ({
          name: asString(item.name),
          age: asString(item.age),
          role: asString(item.role),
          speech: asString(item.speech),
          address: asString(item.address),
        }))
        .filter((item) => item.name)
        .slice(0, 4)
    : []
  const plot = asString(record.plot)
  if (characters.length === 0 && !plot) {
    return null
  }
  return {
    characters,
    relation: asString(record.relation),
    world: asList(record.world, 6),
    plot,
    threads: asList(record.threads, 5),
    covered,
    updatedAt: Date.now(),
  }
}

/** 渲染成注入上下文的样子（尾部注记） */
export const renderCard = (card: SessionCard): string => {
  const lines = ['## 会话档案（人物与剧情，供保持人设与连贯）']
  if (card.characters.length > 0) {
    lines.push('### 人物')
    for (const item of card.characters) {
      const bits = [item.age && `年龄：${item.age}`, item.role && `身份：${item.role}`, item.speech && `说话：${item.speech}`, item.address && `称呼：${item.address}`]
        .filter(Boolean)
        .join('；')
      lines.push(`- ${item.name}${bits ? `（${bits}）` : ''}`)
    }
  }
  if (card.relation) {
    lines.push(`### 关系\n${card.relation}`)
  }
  if (card.world.length > 0) {
    lines.push(`### 世界要点\n${card.world.map((item) => `- ${item}`).join('\n')}`)
  }
  if (card.plot) {
    lines.push(`### 剧情进度\n${card.plot}`)
  }
  if (card.threads.length > 0) {
    lines.push(`### 未完成线索\n${card.threads.map((item) => `- ${item}`).join('\n')}`)
  }
  lines.push('（档案来自更早的对话；与最近对话冲突时以最近对话为准，不要主动提及这份档案。）')
  return lines.join('\n')
}
