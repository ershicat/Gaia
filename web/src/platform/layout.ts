import { create } from 'zustand'

/**
 * 界面范式（不是配色，是整套骨架）。
 *
 * classic：侧栏 + 聊天主区（现在的样子，默认）
 * wechat ：微信式四页底栏（会话 / 通讯录 / 朋友圈 / 我），内容由各积木往槽位注入
 *
 * 只放一个枚举：选哪套壳由 theme 积木写（它管外观），壳本身由 features/shell 读，
 * 两者互不 import，走平台这一层。
 */
export type AppLayout = 'classic' | 'wechat'

interface LayoutState {
  layout: AppLayout
}

export const useLayout = create<LayoutState>(() => ({ layout: 'classic' }))

export const setLayout = (layout: AppLayout): void => {
  useLayout.setState({ layout })
}

export const currentLayout = (): AppLayout => useLayout.getState().layout
