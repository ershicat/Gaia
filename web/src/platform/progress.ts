/**
 * 长任务进度（L0 契约）。
 *
 * 服务层按任务名上报「已经处理了多少」，界面层订阅同名任务画百分比。
 * 没有界面订阅时上报是空操作，不持有任何业务状态。
 */
export interface ProgressState {
  /** 0 ~ 1 */
  percent: number
  /** 阶段文案，例如「正在导入历史会话」 */
  label: string
}

/** 导入历史会话的任务名 */
export const HISTORY_IMPORT_TASK = 'history.import'

type Listener = (state: ProgressState | null) => void

const states = new Map<string, ProgressState>()
const listeners = new Map<string, Set<Listener>>()

const emit = (task: string): void => {
  const state = states.get(task) ?? null
  for (const listener of [...(listeners.get(task) ?? [])]) {
    listener(state)
  }
}

/** 上报进度；percent 会被夹到 0~1，变化不足 1% 时不通知界面 */
export const reportProgress = (task: string, percent: number, label: string): void => {
  const next = Number.isFinite(percent) ? Math.min(1, Math.max(0, percent)) : 0
  const previous = states.get(task)
  if (
    previous &&
    previous.label === label &&
    Math.round(previous.percent * 100) === Math.round(next * 100)
  ) {
    return
  }
  states.set(task, { percent: next, label })
  emit(task)
}

export const clearProgress = (task: string): void => {
  if (!states.has(task)) {
    return
  }
  states.delete(task)
  emit(task)
}

export const progressOf = (task: string): ProgressState | null => states.get(task) ?? null

export const subscribeProgress = (task: string, listener: Listener): (() => void) => {
  const set = listeners.get(task) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(task, set)
  return () => {
    set.delete(listener)
  }
}
