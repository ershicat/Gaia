import type { CastMember } from './contract.js'

/**
 * 配角库存储：独立库 gaia.cast。
 * 与 gaia.roles / gaia.memory / gaia.memory.card 分开，删一块不碰别的。
 */
const DB_NAME = 'gaia.cast'
const DB_VERSION = 1
const STORE = 'members'

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
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('sessionId', 'sessionId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open gaia.cast failed'))
  })
  return opening
}

const run = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = action(transaction.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('gaia.cast 读写失败'))
  })
}

/** 老记录补默认值：导入的数据可能缺字段，界面上就不用到处判空 */
const normalize = (member: CastMember): CastMember => ({
  ...member,
  aliases: Array.isArray(member.aliases) ? member.aliases.filter(Boolean) : [],
  identity: member.identity ?? '',
  speech: member.speech ?? '',
  address: member.address ?? '',
  relation: member.relation ?? '',
  notes: member.notes ?? '',
  always: Boolean(member.always),
  enabled: member.enabled !== false,
  order: typeof member.order === 'number' ? member.order : 0,
  updatedAt: typeof member.updatedAt === 'number' ? member.updatedAt : Date.now(),
})

export const loadCast = async (): Promise<CastMember[]> =>
  (await run<CastMember[]>('readonly', (store) => store.getAll())).map(normalize)

export const saveCastMember = async (member: CastMember): Promise<void> => {
  await run('readwrite', (store) => store.put(normalize(member)))
}

export const deleteCastMember = async (id: string): Promise<void> => {
  await run<undefined>('readwrite', (store) => store.delete(id))
}
