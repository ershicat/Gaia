import type { Role } from './contract.js'
import { useRoles } from './store.js'

/**
 * 把当前角色的聊天背景写进 CSS 变量，由聊天页（SessionView / Welcome）的 ::before 层消费。
 * 用 CSS 变量而不是插槽，是因为背景必须落在页面最底层、随页面切换天然生效，不需要跨积木渲染。
 */
export const applyChatBackground = (role: Role | undefined): void => {
  if (typeof document === 'undefined') {
    return
  }
  const style = document.documentElement.style
  if (!role?.background) {
    style.removeProperty('--gaia-chat-bg')
    style.removeProperty('--gaia-chat-bg-opacity')
    return
  }
  style.setProperty('--gaia-chat-bg', `url("${role.background}")`)
  style.setProperty('--gaia-chat-bg-opacity', String(role.backgroundOpacity ?? 1))
}

/** 按当前选中的角色刷新一次 */
export const applyActiveBackground = (): void => {
  const { roles, activeId } = useRoles.getState()
  applyChatBackground(roles.find((role) => role.id === activeId))
}
