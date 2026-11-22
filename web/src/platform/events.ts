/**
 * 类型化事件总线：积木之间唯一的通信方式（禁止互相 import）。
 * 事件名统一带前缀，例如 host: / roles: / memory:
 */
export interface PlatformEvents {
  'host:rolesChanged': void
  'host:userChanged': void
  'host:prefsChanged': void
  'host:importProgress': { done: number; total: number; phase: string }
  /** 角色切换（新角色 id）：会话空间随之切换，装配层用它回到首页 */
  'roles:activeChanged': string
  /**
   * 角色卡导入时夹带的附加档案（会话档案卡 + 记忆文件）。
   * 角色卡格式见 roles/cardFile.ts 的 extensions.gaia.sessionCard / memoryFiles；
   * 承载方是 memory 积木（它拥有卡片与记忆文件的存储），roles 只负责广播。
   */
  'roles:cardExtras': {
    roleId: string
    roleName: string
    sessionCard: unknown
    memoryFiles: unknown[]
  }
}

type AnyHandler = (payload: unknown) => void

const handlers = new Map<string, Set<AnyHandler>>()

/** 订阅事件，返回取消订阅函数 */
export const on = <K extends keyof PlatformEvents>(
  name: K,
  handler: (payload: PlatformEvents[K]) => void
): (() => void) => {
  const set = handlers.get(name) ?? new Set<AnyHandler>()
  const wrapped = handler as AnyHandler
  set.add(wrapped)
  handlers.set(name, set)
  return () => {
    set.delete(wrapped)
  }
}

/** 广播事件；无载荷事件不传第二个参数 */
export const emit = <K extends keyof PlatformEvents>(
  name: K,
  ...payload: PlatformEvents[K] extends void ? [] : [PlatformEvents[K]]
): void => {
  const set = handlers.get(name)
  if (!set) {
    return
  }
  const arg = (payload as unknown[])[0]
  for (const handler of [...set]) {
    handler(arg)
  }
}
