import type { Message, Session, SessionSummary } from '../services/chat/types.js'

/**
 * 对话只读句柄（L0 契约）。
 *
 * 存在的理由：memory / roles 这些积木需要读会话历史，但积木之间禁止互相 import。
 * 由装配层（app/compose.ts）把上游 store 的读方法注入进来，积木只依赖 platform。
 * 只读：任何写操作都必须回到上游 store 的既有 API。
 */
export interface ChatBridge {
  listSessions: () => SessionSummary[]
  activeSessionId: () => string | null
  getSession: (sessionId: string) => Session | undefined
  getMessages: (sessionId: string) => Message[]
  /** 当前 API Key（本地存储里的值）；没有则 null */
  apiKey: () => string | null
}

let current: ChatBridge | null = null

export const setChatBridge = (bridge: ChatBridge): void => {
  current = bridge
}

export const chat = (): ChatBridge => {
  if (!current) {
    throw new Error('[platform] chat bridge 未注入：请在 app/compose.ts 里调用 setChatBridge')
  }
  return current
}

export const hasChatBridge = (): boolean => current !== null
