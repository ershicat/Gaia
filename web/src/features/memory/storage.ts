import type { Message } from '../../services/chat/types.js'

/**
 * 记忆存储：独立库 gaia.memory，只放"摘要"。
 * 原文永远留在会话库（chat-demo），这里不复制正文，只记录压缩到第几轮 + 摘要文本。
 */
const DB_NAME = 'gaia.memory'
const DB_VERSION = 1
const STORE_SUMMARY = 'summaries'

export interface SummaryRecord {
  sessionId: string
  /** 已经压缩进摘要的完整轮次数（从最早的轮次算起） */
  turns: number
  /** 摘要正文（纯文本，逐行要点） */
  text: string
  updatedAt: number
}

let opening: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (opening) {
    return opening
  }
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_SUMMARY)) {
        db.createObjectStore(STORE_SUMMARY, { keyPath: 'sessionId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open gaia.memory failed'))
  })
  return opening
}

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_SUMMARY, mode)
    const request = run(transaction.objectStore(STORE_SUMMARY))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('gaia.memory request failed'))
  })
}

export const loadSummaries = async (): Promise<SummaryRecord[]> =>
  await withStore<SummaryRecord[]>('readonly', (store) => store.getAll())

export const saveSummary = async (record: SummaryRecord): Promise<void> => {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(record))
}

export const deleteSummary = async (sessionId: string): Promise<void> => {
  await withStore<undefined>('readwrite', (store) => store.delete(sessionId))
}

/** 把消息切成完整轮次：以 assistant 消息作为一轮的结尾 */
export interface Turn {
  user: Message | null
  assistant: Message
}

export const splitTurns = (messages: Message[]): Turn[] => {
  const turns: Turn[] = []
  let pendingUser: Message | null = null
  for (const message of messages) {
    if (message.role === 'user') {
      pendingUser = message
      continue
    }
    turns.push({ user: pendingUser, assistant: message })
    pendingUser = null
  }
  return turns
}
