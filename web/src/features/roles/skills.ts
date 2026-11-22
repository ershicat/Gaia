import type { Role } from './contract.js'

/** 技能名取正文第一行的「# xxx」；没有标题的技能拿不到触发词表 */
export const skillTitle = (body: string): string => {
  const match = body.match(/^\s*#\s+(.+?)\s*$/m)
  return match ? match[1].trim() : ''
}

/**
 * 内置技能的挂载触发词：用户这一轮问到相关的事才把技能全文挂进 system，
 * 没问到就不带，省 token。没登记触发词的技能（自定义技能）保持常驻，
 * 行为与以前一致。
 */
const TRIGGERS: Record<string, string[]> = {
  'character-card': [
    '角色卡',
    '角色扮演',
    '角色设定',
    '人设',
    '扮演',
    '捏一个角色',
    '写个角色',
    'sillytavern',
    'character card',
    'character-card',
    'persona card',
    'roleplay',
  ],
  'system-prompt': [
    '系统提示词',
    '提示词',
    'system prompt',
    'system-prompt',
    'system message',
    '人设提示词',
    '改写提示词',
    '诊断提示词',
  ],
}

/** 同一会话里挂上的技能保持挂着：多轮任务不会因为第二句「继续」就丢掉手册 */
const mounted = new Map<string, Set<string>>()

const hit = (question: string, word: string): boolean =>
  question.toLowerCase().includes(word.toLowerCase())

/**
 * 本轮要带上哪些技能正文（按角色里的顺序返回）。
 * 判定：已在本会话挂过 → 带；否则看这轮提问是否命中触发词。
 */
export const mountedSkills = (role: Role, sessionId: string, question: string): string[] => {
  const active: string[] = []
  for (const body of role.skills) {
    const title = skillTitle(body)
    const triggers = TRIGGERS[title]
    if (!triggers) {
      // 自定义技能：没有触发词表，保持常驻
      active.push(body)
      continue
    }
    const kept = mounted.get(sessionId)
    if (kept?.has(title) || triggers.some((word) => hit(question, word))) {
      if (kept) {
        kept.add(title)
      } else {
        mounted.set(sessionId, new Set([title]))
      }
      active.push(body)
    }
  }
  return active
}
