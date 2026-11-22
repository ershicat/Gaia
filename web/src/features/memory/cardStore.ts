import type { SessionCard } from './card.js'

/**
 * 会话档案卡的存储：一条会话一张卡。
 * 单独一个库，避免与摘要（gaia.memory）、长期记忆文件（gaia.memory.files）抢同一个库。
 *
 * v2 起多一个 seeds 表：角色卡导入时夹带的「初始档案卡」，按角色 id 存；
 * 该角色的新会话首次发送前由 seedInitialCard() 落到那张会话上。
 * 卡片是「生成一次、按批更新」的派生数据：删掉它只会让下一次发送重新生成，
 * 不会丢任何对话原文。
 */
const DB_NAME = 'gaia.memory.card'
const DB_VERSION = 2
const STORE = 'cards'
const STORE_SEEDS = 'seeds'

let opening: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (opening) {
    return opening
  }
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionId' })
      }
      if (!db.objectStoreNames.contains(STORE_SEEDS)) {
        db.createObjectStore(STORE_SEEDS, { keyPath: 'roleId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open gaia.memory.card failed'))
  })
  return opening
}

const run = async <T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = action(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('gaia.memory.card 读写失败'))
  })
}

interface StoredCard {
  sessionId: string
  card: SessionCard
}

interface StoredSeed {
  roleId: string
  card: SessionCard
}

export const loadCards = async (): Promise<Record<string, SessionCard>> => {
  const rows = await run<StoredCard[]>(STORE, 'readonly', (store) => store.getAll())
  return Object.fromEntries(rows.map((row) => [row.sessionId, row.card]))
}

export const saveCard = async (sessionId: string, card: SessionCard): Promise<void> => {
  await run(STORE, 'readwrite', (store) => store.put({ sessionId, card }))
}

export const deleteCard = async (sessionId: string): Promise<void> => {
  await run(STORE, 'readwrite', (store) => store.delete(sessionId))
}

/** 角色 → 初始档案卡（角色卡导入时写入） */
export const loadSeedCards = async (): Promise<Record<string, SessionCard>> => {
  const rows = await run<StoredSeed[]>(STORE_SEEDS, 'readonly', (store) => store.getAll())
  return Object.fromEntries(rows.map((row) => [row.roleId, row.card]))
}

export const saveSeedCard = async (roleId: string, card: SessionCard): Promise<void> => {
  await run(STORE_SEEDS, 'readwrite', (store) => store.put({ roleId, card }))
}

export const deleteSeedCard = async (roleId: string): Promise<void> => {
  await run(STORE_SEEDS, 'readwrite', (store) => store.delete(roleId))
}
