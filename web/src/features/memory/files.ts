/**
 * 长期记忆的文件式存储。
 *
 * 一个记忆 = 一个 Markdown 文件（磁盘上就存在 IndexedDB 里）：
 *   /profile.md       用户是谁
 *   /preferences.md   希望 AI 怎么回答
 *   /topics/*.md      按领域的事实
 *   /areas/*.md       进行中的事
 *   /people/*.md      重要的人
 *
 * 文件正文一行一条事实；标题/描述/别名放在 meta 里，供清单展示与注入。
 */
export interface MemoryFile {
  /** 以 / 开头的路径，作为主键 */
  path: string
  /** 界面上显示的名字 */
  title: string
  /** 一句话说明，用于清单与召回 */
  description: string
  aliases: string[]
  /** 正文：一行一条事实，不带 frontmatter */
  content: string
  updatedAt: number
}

export const PROFILE_PATH = '/profile.md'
export const PREFERENCES_PATH = '/preferences.md'

// 单独的库：摘要在 gaia.memory，长期记忆文件在这里，避免两个模块共用同一个库导致建表冲突
const DB_NAME = 'gaia.memory.files'
const DB_VERSION = 1
const STORE_FILES = 'files'
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
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'path' })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open gaia.memory failed'))
  })
  return opening
}

const run = async <T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = fn(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('gaia.memory request failed'))
  })
}

export const loadMemoryFiles = async (): Promise<MemoryFile[]> =>
  (await run<MemoryFile[]>(STORE_FILES, 'readonly', (s) => s.getAll())).sort((a, b) =>
    a.path.localeCompare(b.path)
  )

export const saveMemoryFile = async (file: MemoryFile): Promise<void> => {
  await run<IDBValidKey>(STORE_FILES, 'readwrite', (s) => s.put(file))
}

export const deleteMemoryFile = async (path: string): Promise<void> => {
  await run<undefined>(STORE_FILES, 'readwrite', (s) => s.delete(path))
}

/** 每个会话已整理到第几条消息；下次只整理它之后的新内容 */
export const loadWatermarks = async (): Promise<Record<string, number>> =>
  (await run<Record<string, number> | undefined>(STORE_META, 'readonly', (s) =>
    s.get('watermarks')
  )) ?? {}

export const saveWatermarks = async (watermarks: Record<string, number>): Promise<void> => {
  await run<IDBValidKey>(STORE_META, 'readwrite', (s) => s.put(watermarks, 'watermarks'))
}

export const loadLastRun = async (): Promise<Record<string, number>> =>
  (await run<Record<string, number> | undefined>(STORE_META, 'readonly', (s) => s.get('lastRun'))) ??
  {}

export const saveLastRun = async (lastRun: Record<string, number>): Promise<void> => {
  await run<IDBValidKey>(STORE_META, 'readwrite', (s) => s.put(lastRun, 'lastRun'))
}

/** 路径规范化：保证以 / 开头、以 .md 结尾，防止越界写 */
export const normalizePath = (raw: string): string => {
  const trimmed = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  const withoutDot = trimmed.split('/').filter((part) => part && part !== '.' && part !== '..')
  if (withoutDot.length === 0) {
    return ''
  }
  const joined = withoutDot.join('/')
  return `/${joined.endsWith('.md') ? joined : `${joined}.md`}`
}

export const pathTitle = (path: string): string =>
  (path.split('/').pop() ?? path).replace(/\.md$/, '')
