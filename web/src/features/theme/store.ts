import { create } from 'zustand'
import { setLayout } from '../../platform/index.js'
import { itemOf, type ThemeGroup } from './catalog.js'

/**
 * 主题选择：skin（主题）/ bubble（气泡）/ background（背景）/ layout（界面骨架）。
 * 前三组只往 <html> 上写 data 属性，具体长相全在 theme.module.css 里；
 * layout 不写属性，而是通过平台写 AppLayout —— 壳的渲染由 shell 积木接手。
 * 切换零成本、可随时回默认。
 */
const KEYS: Record<ThemeGroup, string> = {
  skin: 'gaia:theme-skin',
  bubble: 'gaia:theme-bubble',
  background: 'gaia:theme-background',
  layout: 'gaia:theme-layout',
}

const read = (group: ThemeGroup): string | null => {
  try {
    return localStorage.getItem(KEYS[group])
  } catch {
    return null
  }
}

/** 没存过或存了已下线的 id 时回到默认项 */
const initial = (group: ThemeGroup): string => itemOf(group, read(group) ?? 'ds').id

interface ThemeState {
  skin: string
  bubble: string
  background: string
  /** 界面骨架：classic / wechat */
  layout: string
  /** 商城页是否打开 */
  open: boolean
}

export const useThemeStore = create<ThemeState>(() => ({
  skin: initial('skin'),
  bubble: initial('bubble'),
  background: initial('background'),
  layout: initial('layout'),
  open: false,
}))

const apply = (state: Pick<ThemeState, 'skin' | 'bubble' | 'background' | 'layout'>): void => {
  const root = document.documentElement
  root.dataset.gaiaSkin = state.skin
  root.dataset.gaiaBubble = state.bubble
  root.dataset.gaiaBackground = state.background
  root.dataset.gaiaLayout = state.layout
  setLayout(state.layout === 'wechat' ? 'wechat' : 'classic')
}

/** 启动时应用一次；默认项也写属性，CSS 里靠属性选择器区分 */
export const initTheme = (): void => {
  const { skin, bubble, background, layout } = useThemeStore.getState()
  apply({ skin, bubble, background, layout })
}

export const selectTheme = (group: ThemeGroup, id: string): void => {
  const next = itemOf(group, id).id
  try {
    localStorage.setItem(KEYS[group], next)
  } catch {
    // 存储不可用时只在本次运行生效
  }
  const state = { ...useThemeStore.getState(), [group]: next }
  useThemeStore.setState({ [group]: next })
  apply(state)
}

export const openThemeMarket = (): void => useThemeStore.setState({ open: true })
export const closeThemeMarket = (): void => useThemeStore.setState({ open: false })
