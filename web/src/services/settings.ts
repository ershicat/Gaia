import { create } from 'zustand'
import { DEFAULT_MODEL, MODELS } from './api/models.js'
import type { ChatModel } from './api/types.js'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本机设置，存 localStorage：API Key、模型、语言、主题、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态 */
type Settings = {
  apiKey: string | null
  /** 当前选择的模型；请求按这个值下发 */
  model: ChatModel
  /** 上下文轮次上限：0 表示不限；超过后按滞回策略丢掉最早的轮次 */
  contextRoundLimit: number
  /** 是否自动生成会话标题 */
  autoTitle: boolean
  /** 标题提示词；留空表示用服务端默认标题 */
  titlePrompt: string
  /** 是否自动压缩上下文（超出阈值时把最早的历史压成摘要） */
  autoCompress: boolean
  /** 压缩触发比例（百分比，1~98）：上下文占用达到该比例就压缩 */
  compressThreshold: number
  /** 记忆整理（做梦）用的模型；null 表示跟随聊天模型 */
  memoryModel: ChatModel | null
  /** 会话档案卡（防 OOC）：默认关；打开后 ≥40 轮的长会话在首次发送时建一次档案 */
  sessionCard: boolean
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  model: 'gaia:model',
  contextRoundLimit: 'gaia:context-rounds',
  autoTitle: 'gaia:auto-title',
  titlePrompt: 'gaia:title-prompt',
  autoCompress: 'gaia:auto-compress',
  compressThreshold: 'gaia:compress-threshold',
  memoryModel: 'gaia:memory-model',
  sessionCard: 'gaia:session-card',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

/**
 * 存过什么就用什么。
 * 第三方服务商的模型 id 不在内置表里，这里不能拿内置表过滤，否则重启后会被打回内置模型，
 * 请求就带着 DeepSeek 的模型名打到别家去了。
 */
const initialModel = (): ChatModel => {
  const saved = read(KEYS.model)
  return saved ? (saved as ChatModel) : DEFAULT_MODEL
}

/**
 * 固定上下文长度片段：默认 30 轮。
 * 不设上限时，导入的长会话每轮都会把全部历史重发一遍；设成固定窗口后前缀稳定、
 * 缓存可命中，且旧轮次仍可回看，只是不进上下文。0 表示不限（保留给需要的人）。
 */
const DEFAULT_ROUND_LIMIT = 30

/** 没设过时用默认窗口；显式设成 0 视为不限 */
const initialRoundLimit = (): number => {
  const raw = read(KEYS.contextRoundLimit)
  if (raw === null) {
    return DEFAULT_ROUND_LIMIT
  }
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** 未显式关掉就默认自动生成标题 */
const initialAutoTitle = (): boolean => read(KEYS.autoTitle) !== 'false'

/** 默认开启自动压缩 */
const initialAutoCompress = (): boolean => read(KEYS.autoCompress) !== 'false'

/** 压缩阈值夹在 1~98 之间，默认 80% */
const initialCompressThreshold = (): number => {
  const value = Number(read(KEYS.compressThreshold) ?? 80)
  return Number.isFinite(value) ? Math.min(98, Math.max(1, Math.round(value))) : 80
}

/** 记忆整理模型：没设过或已下线时跟随聊天模型 */
const initialMemoryModel = (): ChatModel | null => {
  const saved = read(KEYS.memoryModel)
  return saved && MODELS.some((item) => item.id === saved) ? (saved as ChatModel) : null
}

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  model: initialModel(),
  contextRoundLimit: initialRoundLimit(),
  autoTitle: initialAutoTitle(),
  titlePrompt: read(KEYS.titlePrompt) ?? '',
  autoCompress: initialAutoCompress(),
  compressThreshold: initialCompressThreshold(),
  memoryModel: initialMemoryModel(),
  sessionCard: read(KEYS.sessionCard) === 'true',
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setModel = (model: ChatModel) => {
  write(KEYS.model, model)
  useSettings.setState({ model })
}

export const setContextRoundLimit = (limit: number) => {
  const value = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0
  // 显式写 0（不限）与「从未设置过」（取默认窗口）要能区分，所以不删键
  write(KEYS.contextRoundLimit, String(value))
  useSettings.setState({ contextRoundLimit: value })
}

export const setAutoTitle = (autoTitle: boolean) => {
  write(KEYS.autoTitle, String(autoTitle))
  useSettings.setState({ autoTitle })
}

export const setTitlePrompt = (titlePrompt: string) => {
  write(KEYS.titlePrompt, titlePrompt.trim() ? titlePrompt : null)
  useSettings.setState({ titlePrompt })
}

export const setAutoCompress = (autoCompress: boolean) => {
  write(KEYS.autoCompress, String(autoCompress))
  useSettings.setState({ autoCompress })
}

export const setCompressThreshold = (threshold: number) => {
  const value = Number.isFinite(threshold) ? Math.min(98, Math.max(1, Math.round(threshold))) : 80
  write(KEYS.compressThreshold, String(value))
  useSettings.setState({ compressThreshold: value })
}

export const setSessionCard = (sessionCard: boolean) => {
  write(KEYS.sessionCard, String(sessionCard))
  useSettings.setState({ sessionCard })
}

export const setMemoryModel = (memoryModel: ChatModel | null) => {
  write(KEYS.memoryModel, memoryModel)
  useSettings.setState({ memoryModel })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}
