import type { StoryModules } from '../../services/settings.js'
import { chat, hasChatBridge } from '../../platform/index.js'
import { DEFAULT_STORY_MODULES, useSettings } from '../../services/settings.js'

/** 当前故事模块配置（懒读，保证设置页改完下一次请求立即生效） */
export const storyModules = (): StoryModules =>
  useSettings.getState().storyModules ?? DEFAULT_STORY_MODULES

/**
 * 会话归属的角色 id；导入历史 / 老会话没有可用的角色归属时返回空串。
 * 故事 canon 必须按会话实际归属走，不能用“当前激活角色”兜底，
 * 否则切换角色时旧会话会被注入新角色的故事。
 */
export const storyRoleOf = (sessionId: string): string => {
  if (!hasChatBridge() || !sessionId) {
    return ''
  }
  const session = chat().getSession(sessionId)
  if (!session || session.noPersona) {
    return ''
  }
  return session.roleIds?.[0] ?? ''
}

export const storyEligible = (sessionId: string): boolean => storyRoleOf(sessionId) !== ''
