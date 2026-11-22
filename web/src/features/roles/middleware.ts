import { chat, hasChatBridge, type RequestMiddleware, userName } from '../../platform/index.js'
import { buildPersona } from './persona.js'
import { mountedSkills } from './skills.js'
import { activeRole } from './store.js'

/**
 * 会话是否走人格提示词：
 * - 导入的历史会话带 noPersona 标记，继续聊时保持原有上下文，不套人格；
 * - 更早版本留下的、没有归属的会话同样按"历史"处理。
 */
const injectsPersona = (sessionId: string): boolean => {
  if (!hasChatBridge()) {
    return true
  }
  const session = chat().getSession(sessionId)
  if (!session) {
    return true
  }
  return !session.noPersona && (session.roleIds?.length ?? 0) > 0
}

/**
 * 角色注入：把当前角色的提示词 + 已挂载的技能 + 画像拼进 system，并带上温度。
 * 技能按需挂载（见 skills.ts），没命中的这一轮不进 system。
 * 只改写允许的字段（system / temperature / roleId），不动 messages。
 */
export const rolesMiddleware: RequestMiddleware = (ctx) => {
  const role = activeRole()
  if (!role) {
    return
  }
  const persona = injectsPersona(ctx.sessionId)
    ? buildPersona(role, userName(), {
        skills: mountedSkills(role, ctx.sessionId, ctx.question),
      })
    : ''
  return {
    ...ctx,
    roleId: role.id,
    // 角色的提示词就是人格本体：替换上游的默认一句话，而不是叠在后面
    system: persona || ctx.system,
    temperature: role.temperature,
  }
}
