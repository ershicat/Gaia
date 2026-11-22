import { chat, hasChatBridge, log } from '../../platform/index.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { DEFAULT_ROLE_ID } from './contract.js'
import { activeRole, upsertRole, useRoles } from './store.js'

/**
 * 按角色归属过滤会话（数据层，在分组之前生效）：角色之间互相看不到对方的会话。
 * 没有 roleIds 的会话（导入的历史、更早版本留下的）算系统自带角色的，不再到处都显示。
 */
export const roleSessionFilter = (sessions: SessionSummary[]): SessionSummary[] => {
  const active = useRoles.getState().activeId || DEFAULT_ROLE_ID
  return sessions.filter((session) => {
    const owners =
      session.roleIds && session.roleIds.length > 0 ? session.roleIds : [DEFAULT_ROLE_ID]
    return owners.includes(active)
  })
}

/** 「我叫…」「我是…」「我喜欢…」这类自述句，作为画像素材（中英都收） */
const PATTERNS: RegExp[] = [
  /我叫[^，。,.!?！？;；\s]{1,12}/,
  /我是[^，。,.!?！？;；\s]{1,16}/,
  /我在[^，。,.!?！？;；\s]{1,16}/,
  /我(?:们)?(?:公司|团队|项目)叫[^，。,.!?！？;；\s]{1,16}/,
  /我(?:主要)?(?:做|负责)[^，。,.!?！？;；\s]{1,16}/,
  /我(?:喜欢|不喜欢|习惯|偏好|在意)[^，。,.!?！？;；\s]{1,16}/,
  /\bmy name is [A-Za-z][A-Za-z .]{1,20}/i,
  /\bi(?:'m| am) (?:a |an )?[A-Za-z][A-Za-z .]{1,20}/i,
  /\bi work (?:at|on|for) [A-Za-z][A-Za-z .]{1,20}/i,
  /\bi (?:like|prefer|hate) [A-Za-z][A-Za-z .]{1,20}/i,
]

export const extractFacts = (text: string): string[] => {
  const found: string[] = []
  for (const pattern of PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      found.push(match[0].trim())
    }
  }
  return [...new Set(found)].slice(0, 4)
}

const MAX_PROFILE_LINES = 20

/**
 * 每轮结束把用户自述句沉淀进当前角色的画像。
 * 纯本地启发式：不额外调 API、不会失败；用户随时可以在角色编辑页改。
 */
export const sedimentProfile = async (sessionId: string): Promise<void> => {
  if (!hasChatBridge()) {
    return
  }
  const messages = chat().getMessages(sessionId)
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  if (!lastUser || lastUser.role !== 'user') {
    return
  }
  const facts = extractFacts(lastUser.content)
  if (facts.length === 0) {
    return
  }
  // 诊断用：只在真的提取到画像素材时打一行，便于线上排查沉淀为什么不生效
  log(`profile sediment +${facts.length}: ${facts.join(' | ')}`)
  const role = activeRole()
  const existing = role.profile
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const added = facts.filter((fact) => !existing.some((line) => line.includes(fact)))
  if (added.length === 0) {
    return
  }
  const nextProfile = [...existing, ...added.map((fact) => `- ${fact}`)]
    .slice(-MAX_PROFILE_LINES)
    .join('\n')
  await upsertRole({ ...role, profile: nextProfile })
}
