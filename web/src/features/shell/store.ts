import { create } from 'zustand'

/**
 * 微信壳自己的页面状态：底栏停在哪一页、聊天页有没有压栈打开。
 *
 * 只放"看到哪"，不放业务数据：会话 / 角色 / 设置各自还是由原本的 store 管。
 * 之所以独立一份：经典壳里没有"页"的概念，两套壳不能共用同一份导航状态。
 */
export type ShellTab = 'chat' | 'contacts' | 'moments' | 'me'

interface ShellState {
  tab: ShellTab
  /** 聊天页是否压栈打开（打开时底栏隐藏） */
  chatOpen: boolean
}

export const useShell = create<ShellState>(() => ({ tab: 'chat', chatOpen: false }))

export const setTab = (tab: ShellTab): void => {
  useShell.setState({ tab, chatOpen: false })
}

export const openChat = (): void => useShell.setState({ chatOpen: true })

export const closeChat = (): void => useShell.setState({ chatOpen: false })
