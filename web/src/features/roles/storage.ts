import type { Role } from './contract.js'

/**
 * 角色存储：独立库 gaia.roles。
 * 与会话库分开是为了"删一块不碰会话"；导出/导入以后按库整体打包。
 */
const DB_NAME = 'gaia.roles'
const DB_VERSION = 1
const STORE_ROLES = 'roles'
const STORE_META = 'meta'

let opening: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (opening) {
    return opening
  }
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_ROLES)) {
        db.createObjectStore(STORE_ROLES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open gaia.roles failed'))
  })
  return opening
}

const tx = async <T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = run(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('gaia.roles request failed'))
  })
}

export const loadRoles = async (): Promise<Role[]> =>
  (await tx<Role[]>(STORE_ROLES, 'readonly', (s) => s.getAll())).sort(
    (a, b) => a.createdAt - b.createdAt
  )

export const saveRole = async (role: Role): Promise<void> => {
  await tx<IDBValidKey>(STORE_ROLES, 'readwrite', (s) => s.put(role))
}

export const deleteRole = async (id: string): Promise<void> => {
  await tx<undefined>(STORE_ROLES, 'readwrite', (s) => s.delete(id))
}

export const loadActiveRoleId = async (): Promise<string | null> =>
  (await tx<string | undefined>(STORE_META, 'readonly', (s) => s.get('activeRoleId'))) ?? null

export const saveActiveRoleId = async (id: string): Promise<void> => {
  await tx<IDBValidKey>(STORE_META, 'readwrite', (s) => s.put(id, 'activeRoleId'))
}
