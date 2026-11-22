import type { Role } from './contract.js'

const pad = (value: number): string => (value < 10 ? `0${value}` : String(value))

const today = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const timezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/** {{char}} {{user}} {{cur_date}} {{timezone}}；未知变量原样保留，便于排查 */
export const substitute = (template: string, role: Role, userName: string): string => {
  const vars: Record<string, string> = {
    char: role.name,
    user: userName || '我',
    cur_date: today(),
    timezone: timezone(),
  }
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) =>
    key in vars ? vars[key] : whole
  )
}

/**
 * 组合本轮的 system 段落，用与旧版一致的分隔符逐段拼接：
 *   [角色提示词] --- [挂载的技能] --- [关于用户]
 * 技能由调用方按需挑好（见 skills.ts），这里不负责判定要不要带。
 * 返回空串表示不注入（例如导入的历史会话保持原样）。
 */
export const buildPersona = (
  role: Role,
  userName: string,
  options?: { inject?: boolean; skills?: string[] }
): string => {
  if (options?.inject === false) {
    return ''
  }
  const blocks: string[] = []
  const prompt = substitute(role.systemPrompt, role, userName).trim()
  if (prompt) {
    blocks.push(prompt)
  }
  for (const skill of options?.skills ?? role.skills) {
    const body = substitute(skill, role, userName).trim()
    if (body) {
      blocks.push(body)
    }
  }
  const profile = substitute(role.profile, role, userName).trim()
  if (profile) {
    blocks.push(`## 关于用户\n${profile}`)
  }
  return blocks.join('\n\n---\n\n')
}

/** 群组口子：多角色同场时按顺序拼人格块（暂不实现调度） */
export const buildPersonaBlocks = (roles: Role[], userName: string): string[] =>
  roles.map((role) => buildPersona(role, userName)).filter(Boolean)
