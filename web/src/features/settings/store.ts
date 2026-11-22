import { create } from 'zustand'
import { diagRecord, setApiOrigin, setBooleanOption } from '../../platform/index.js'

const FONT_KEY = 'gaia:font-scale'
const ENDPOINT_KEY = 'gaia:api-base'
const THINK_KEY = 'gaia:collapse-thinking'

export type SettingsPage =
  | 'root'
  | 'data'
  | 'model'
  | 'chat'
  | 'locale'
  | 'theme'
  | 'font'
  | 'think'
  | 'voice'
  | 'location'
  | 'endpoint'
  | 'apiKey'
  | 'feedback'

/** 字号档位对齐旧版：标准 / 大(115%) / 特大(130%) */
export const FONT_SCALES = [
  { label: '标准', value: 1 },
  { label: '大', value: 1.15 },
  { label: '特大', value: 1.3 },
] as const

const readNumber = (key: string, fallback: number): number => {
  const raw = globalThis.localStorage?.getItem(key)
  const value = raw ? Number(raw) : Number.NaN
  return Number.isFinite(value) ? value : fallback
}

const applyFontScale = (scale: number): void => {
  document.body.style.zoom = String(scale)
}

interface SettingsUiState {
  open: boolean
  page: SettingsPage
  fontScale: number
  endpoint: string
  collapseThinking: boolean
}

export const useSettingsUi = create<SettingsUiState>(() => ({
  open: false,
  page: 'root',
  fontScale: readNumber(FONT_KEY, 1),
  endpoint: globalThis.localStorage?.getItem(ENDPOINT_KEY) ?? '',
  collapseThinking: globalThis.localStorage?.getItem(THINK_KEY) !== 'false',
}))

const setState = useSettingsUi.setState

export const openSettingsPage = (page: SettingsPage = 'root'): void => {
  diagRecord('info', 'settings', `打开设置页 ${page}`)
  setState({ open: true, page })
}

export const goBack = (): void => {
  if (useSettingsUi.getState().page === 'root') {
    setState({ open: false })
    return
  }
  setState({ page: 'root' })
}

export const closeSettingsPage = (): void => {
  diagRecord('info', 'settings', '关闭设置页')
  setState({ open: false })
}

export const setFontScale = (scale: number): void => {
  globalThis.localStorage?.setItem(FONT_KEY, String(scale))
  applyFontScale(scale)
  setState({ fontScale: scale })
}

export const setCollapseThinking = (value: boolean): void => {
  globalThis.localStorage?.setItem(THINK_KEY, String(value))
  setBooleanOption('collapseThinking', value)
  setState({ collapseThinking: value })
}

export const setEndpoint = (value: string): void => {
  const trimmed = value.trim()
  if (trimmed) {
    globalThis.localStorage?.setItem(ENDPOINT_KEY, trimmed)
  } else {
    globalThis.localStorage?.removeItem(ENDPOINT_KEY)
  }
  // 空串表示回到构建期默认地址
  setApiOrigin(trimmed || null)
  setState({ endpoint: trimmed })
}

/** 启动时应用已保存的字号、接口地址与折叠偏好 */
export const initSettingsUi = (): void => {
  const { fontScale, endpoint, collapseThinking } = useSettingsUi.getState()
  if (fontScale !== 1) {
    applyFontScale(fontScale)
  }
  if (endpoint) {
    setApiOrigin(endpoint)
  }
  // 必须在上游渲染消息之前写进平台，ReplyArea 才能读到初始折叠状态
  setBooleanOption('collapseThinking', collapseThinking)
}
