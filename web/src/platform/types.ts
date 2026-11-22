import type { ReactNode } from 'react'
import type { ChatModel } from '../services/api/types.js'
import type { Message, SessionSummary } from '../services/chat/types.js'
import type { SessionFilter } from './filters.js'

/**
 * 插槽（slot）：上游页面里预留的渲染位。
 * 上游只在页面里留锚点，业务组件全部由 features/ 下的积木注册进来。
 */
export type SlotName =
  | 'sider.top'
  | 'sider.bottom'
  | 'sider.item'
  /** 侧栏顶部标题位（旧版这里是用户头像+昵称） */
  | 'sider.title'
  /** 会话行内部（紧贴标题前），用于徽标这类必须同排的装饰 */
  | 'sider.item.inline'
  | 'header.actions'
  | 'chat.aboveInput'
  | 'chat.belowInput'
  /** 整个输入区：replace 时上游 ChatInput 不渲染（覆盖上游的 ⊕ / 语音用这一处，不在按钮级打补丁） */
  | 'chat.input'
  | 'message.avatar'
  | 'message.meta'
  | 'message.meta.user'
  | 'message.actions'
  | 'message.footer'
  /** 设置弹窗内的追加位（余额、备份等） */
  | 'settings.extra'
  /** 应用根部的覆盖层：弹窗、半屏、整页，常驻挂载点（不随侧栏开合消失） */
  | 'app.overlay'
  /** 整个应用骨架：replace 时由 shell 积木接管整屏（界面=微信） */
  | 'app.root'
  /** 微信壳「通讯录」页内容：角色积木注入角色卡列表 */
  | 'shell.contacts'
  /** 微信壳「我」页顶部：用户身份卡 */
  | 'shell.me.header'
  /** 微信壳「我」页入口行：各积木各注册一行 */
  | 'shell.me.item'

/**
 * 槽位语义：
 * - append（默认）：追加在上游原内容之后
 * - before / after：排在原内容前/后，原内容仍渲染
 * - replace：上游原内容不渲染，只渲染注册进来的积木（覆盖上游 UI 用这个）
 * 同一槽位只要有一个 replace，原内容就整体让位；因此 replace 只能有一个积木使用，check-deps 之外靠 review 保证。
 */
export type SlotMode = 'append' | 'before' | 'after' | 'replace'

/** 每个槽位渲染时拿到的数据；只读快照，积木不得修改 */
export interface SlotPayloads {
  'sider.top': { mobile: boolean }
  'sider.bottom': { mobile: boolean }
  'sider.item': { session: SessionSummary; active: boolean }
  'sider.title': { mobile: boolean }
  'sider.item.inline': { session: SessionSummary; active: boolean }
  'header.actions': { title: string }
  'chat.aboveInput': { sessionId: string }
  'chat.belowInput': { sessionId: string; streaming: boolean }
  'chat.input': { sessionId: string }
  'message.avatar': { message: Message }
  'message.meta': { message: Message; sessionId: string }
  /** 用户消息上方（右侧）的标识位 */
  'message.meta.user': { message: Message; sessionId: string }
  'message.actions': { message: Message; sessionId: string }
  'message.footer': { message: Message; sessionId: string }
  'settings.extra': Record<string, never>
  'app.overlay': Record<string, never>
  'app.root': Record<string, never>
  'shell.contacts': Record<string, never>
  'shell.me.header': Record<string, never>
  'shell.me.item': Record<string, never>
}

export type SlotRenderer<K extends SlotName> = (payload: SlotPayloads[K]) => ReactNode

/** 单个槽位的渲染项；id 只用于排查，order 决定先后 */
export interface SlotEntry<K extends SlotName> {
  id: string
  order?: number
  mode?: SlotMode
  render: SlotRenderer<K>
}

/**
 * 请求管线上下文：上游只负责填初值，积木只改自己关心的字段。
 * 新增功能一律通过中间件改写这里，不直接改 store。
 */
export interface RequestContext {
  sessionId: string
  roleId: string | null
  model: ChatModel
  system: string
  temperature: number | null
  safetyCheck: boolean
  search: boolean
  thinking: boolean
  /** 本轮用户提问原文（只读参考，供召回挑关键词用） */
  question: string
  /**
   * 丢弃最早的 N 个完整轮次（user+assistant 对）并替换为摘要；0 表示不压缩。
   * 禁止改动最近 8 轮与最后一条 assistant——续写与分支切换依赖它们。
   */
  dropTurns: number
  /** 被丢弃轮次的摘要正文；dropTurns > 0 时生效 */
  compactedSummary: string | null
  /** 本轮是否允许沿用「续写前缀」；压缩或重写历史时必须置 false */
  prefixEnabled: boolean
  /**
   * 会话档案卡：人物与剧情的固化成文。
   * 位置固定在「固定窗口之后、本轮召回之前」——它是动态的（会随剧情更新），
   * 所以既不能进 system（一改就把整段缓存作废），也不能贴到当前提问上（会被当成这一轮的话）。
   */
  cardNote: string
  /**
   * 尾部注记：按顺序贴在当前提问之前的 latest_reminder 消息里。
   * 每轮都会变的内容（时间读数、按本轮提问召回的记忆片段）只能放这里：
   * system 与历史必须字节稳定，否则提示词缓存会从变化的那个字节起全部作废。
   */
  tailNotes: string[]
}

/** 中间件：返回新上下文表示已改写，返回 void 表示不处理 */
export type RequestMiddleware = (ctx: RequestContext) => RequestContext | void

/**
 * 积木：所有功能块的统一形状。
 * 新功能 = 一个新目录 + 一个 defineBlock，装配层加一行。
 */
export interface Block {
  id: string
  order?: number
  /** 本积木的开关默认值；也可由宿主运行时覆盖 */
  flags?: Record<string, boolean>
  slots?: { [K in SlotName]?: SlotEntry<K>[] }
  middleware?: { order?: number; fn: RequestMiddleware }[]
  /** 数据层过滤器（例如按角色过滤会话），按注册顺序串行 */
  sessionFilters?: SessionFilter[]
  /** 同步执行，保证首次渲染前完成注册 */
  init?: () => void
}
