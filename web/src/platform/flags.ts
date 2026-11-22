/**
 * 积木开关：未登记的一律视为开启。
 * 关闭某个积木 = 它的槽位不渲染、中间件不执行，其余积木不受影响。
 */
const states = new Map<string, boolean>()

export const isEnabled = (blockId: string): boolean => states.get(blockId) ?? true

export const setFlags = (flags: Record<string, boolean>): void => {
  for (const [id, on] of Object.entries(flags)) {
    states.set(id, on)
  }
}

export const resetFlags = (): void => {
  states.clear()
}

/** 只读快照，便于排查当前哪些积木被关闭 */
export const flagSnapshot = (): Record<string, boolean> => Object.fromEntries(states)
