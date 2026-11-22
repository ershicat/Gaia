/**
 * 会话内配角库（酒馆 lorebook 的最小等价物）。
 *
 * 主角进角色提示词（system，稳定段，吃缓存）；配角放在这里，按会话存，
 * 命中关键词才注入到 tailNotes（<附注>），不进 system、不改历史 —— 所以每轮只有
 * 真正出场的那几条会花钱，也不会击穿提示词缓存。
 */
export interface CastMember {
  id: string
  /** 归属会话；配角只在它出现的那条会话里生效 */
  sessionId: string
  name: string
  /** 触发词：名字、别称、称呼；空数组时只靠常驻（always）注入 */
  aliases: string[]
  /** 身份，一句话 */
  identity: string
  /** 说话方式 */
  speech: string
  /** 对「我」的称呼 */
  address: string
  /** 与主角/我的关系 */
  relation: string
  /** 其它要点（可多行，渲染时压成一段） */
  notes: string
  /** 常驻：每轮都带（仍受总字符预算限制） */
  always: boolean
  enabled: boolean
  /** 注入顺序，越小越靠前 */
  order: number
  updatedAt: number
}

/** 关键词扫描范围：最近几条消息 */
export const CAST_SCAN_MESSAGES = 6

/** 一次注入的总字符预算：超出的条目不进上下文 */
export const CAST_BUDGET_CHARS = 900

/** 单个配角正文最多这么多字，防止一条把预算吃光 */
export const CAST_MEMBER_CHARS = 260

export const castTriggers = (member: CastMember): string[] => {
  const keys = [member.name, ...member.aliases].map((key) => key.trim()).filter(Boolean)
  return [...new Set(keys)]
}

export const castMatches = (member: CastMember, text: string): boolean => {
  const lower = text.toLowerCase()
  return castTriggers(member).some((key) => lower.includes(key.toLowerCase()))
}

const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}…`

export const renderCastMember = (member: CastMember): string => {
  const bits = [
    member.identity && `身份：${member.identity}`,
    member.speech && `说话：${member.speech}`,
    member.address && `对「我」的称呼：${member.address}`,
    member.relation && `关系：${member.relation}`,
  ].filter(Boolean)
  const head = `- ${member.name}${bits.length > 0 ? `（${bits.join('；')}）` : ''}`
  const notes = member.notes.trim().replace(/\s+/g, ' ')
  const body = notes ? `\n  补充：${notes}` : ''
  return clip(head + body, CAST_MEMBER_CHARS)
}

/** 渲染成注入 tailNotes 的一段；超出预算的条目不进（先出的先留） */
export const renderCastBlock = (members: CastMember[]): string => {
  const lines = ['## 本会话配角（出场时按此设定写，未出场不要主动提起）']
  let used = lines[0].length
  for (const member of members) {
    const text = renderCastMember(member)
    if (used + text.length > CAST_BUDGET_CHARS) {
      break
    }
    lines.push(text)
    used += text.length
  }
  return lines.join('\n')
}
