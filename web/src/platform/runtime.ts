/**
 * 运行期参数：由宿主积木在启动时写入，上游代码只读。
 * 上游文件不许直接读宿主全局对象，统一从这里取。
 */

let apiOriginOverride: string | null = null
// 本应用默认不发送风控字段；需要时由宿主显式打开（chat-demo 原版默认是 true）
let safetyCheck = false
let currentRoleId = ''

/** 当前角色 id：新建会话时由 store 打戳，过滤器据此归属 */
export const setActiveRoleId = (id: string): void => {
  currentRoleId = id
}

export const activeRoleId = (): string => currentRoleId

/** 宿主下发的接口地址；传 null 表示回到构建期默认值 */
export const setApiOrigin = (origin: string | null): void => {
  apiOriginOverride = origin ? origin.replace(/\/+$/, '') : null
}

/** 取当前接口地址；fallback 是构建期注入的默认值 */
export const apiOrigin = (fallback: string): string => apiOriginOverride ?? fallback

/** 应用版本号：宿主在启动时写入，用于「本次更新」这类按版本只出现一次的内容 */
let version = 'dev'

export const setAppVersion = (value: string): void => {
  if (value.trim()) {
    version = value.trim()
  }
}

export const appVersion = (): string => version

/** 是否随请求发送 safety_check；宿主可关闭风控字段 */
export const setSafetyCheck = (on: boolean): void => {
  safetyCheck = on
}

export const safetyCheckEnabled = (): boolean => safetyCheck

/**
 * 当前接口目标（服务商预设）：协议、地址、路径与能力位。
 * services/api 只认这个结构，不认识"服务商"这个概念；由 features/providers 写入。
 * 为 null 时按构建期默认（DeepSeek 的 Anthropic 兼容接口）走。
 */
export type ApiProtocol = 'anthropic' | 'openai'

/** 鉴权头：Anthropic 系用 x-api-key，OpenAI 系用 Bearer */
export type ApiAuth = 'x-api-key' | 'bearer'

export interface ApiTarget {
  /** 显示名，只用于提示文案 */
  name: string
  protocol: ApiProtocol
  /** 例如 https://api.deepseek.com、https://api.openai.com/v1 */
  baseUrl: string
  /** 相对 baseUrl 的聊天路径，例如 /anthropic/v1/messages、/chat/completions */
  chatPath: string
  /** 相对 baseUrl 的模型列表路径，例如 /models */
  modelsPath: string
  auth: ApiAuth
  /** 附件上传路径前缀（仅 DeepSeek Files API）；没有则该服务商不发文件块 */
  filePath?: string
  /** 语音接口前缀（仅 DeepSeek /v1/tools）；没有则该服务商不支持语音 */
  voiceBase?: string
  /** 余额查询路径（仅 DeepSeek /user/balance）；没有则该服务商不支持余额 */
  balancePath?: string
  /** 该服务商可选的模型 id（预设表或运行时拉到的列表），供设置页的模型选择跟随服务商 */
  models?: string[]
  /** 上下文上限（token），供状态栏与压缩阈值参考 */
  contextLimit: number
  /** 是否发送 DeepSeek 专属的服务端工具（deepseek_read_url / deepseek_web_search） */
  serverTools: boolean
}

let apiTarget: ApiTarget | null = null

export const setApiTarget = (target: ApiTarget | null): void => {
  apiTarget = target
}

export const currentApiTarget = (): ApiTarget | null => apiTarget

/** 用户名：卡片变量 {{user}} 与"关于用户"段落用 */
/** 统一日志出口：host 积木把它接到原生日志，其余积木只调 log() */
let logger: ((message: string) => void) | null = null

export const setLogger = (fn: (message: string) => void): void => {
  logger = fn
}

export const log = (message: string): void => {
  logger?.(message)
}

/** 数值型运行期参数：宿主可以下发调参项（例如记忆阈值），积木带默认值读取 */
const numbers = new Map<string, number>()

export const setNumberOption = (key: string, value: number): void => {
  if (Number.isFinite(value)) {
    numbers.set(key, value)
  }
}

export const numberOption = (key: string, fallback: number): number => numbers.get(key) ?? fallback

/** 布尔型运行期参数（例如"思考内容自动折叠"），由设置积木写入、上游组件读取 */
const booleans = new Map<string, boolean>()

export const setBooleanOption = (key: string, value: boolean): void => {
  booleans.set(key, value)
}

export const booleanOption = (key: string, fallback: boolean): boolean => booleans.get(key) ?? fallback

/** 文本型运行期参数（例如设置页上显示的当前服务商名），由设置积木写入、其它块读取 */
const texts = new Map<string, string>()

export const setTextOption = (key: string, value: string): void => {
  texts.set(key, value)
}

export const textOption = (key: string, fallback: string): string => texts.get(key) ?? fallback

/**
 * 会话归属（角色域）：新建会话、导入历史时由 roles 积木决定写哪些归属字段。
 * services 层只调 attributeSession()，它自己不知道"角色"这个概念。
 */
export type SessionSource = 'user' | 'import'

export type SessionAttribution = {
  /** 会话属于哪些角色；导入的历史会话归到系统自带角色 */
  roleIds?: string[]
  /** true 表示该会话不注入角色提示词（导入的历史会话保持原样） */
  noPersona?: boolean
}

let attributor: ((source: SessionSource) => SessionAttribution) | null = null

export const registerSessionAttributor = (
  fn: (source: SessionSource) => SessionAttribution
): void => {
  attributor = fn
}

export const attributeSession = (source: SessionSource): SessionAttribution =>
  attributor?.(source) ?? {}
