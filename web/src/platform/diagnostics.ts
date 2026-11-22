/**
 * 诊断日志（L0）：环形缓冲区 + 全局错误捕获。
 *
 * 业务代码只管调 diagRecord()；怎么展示、怎么导出由 diagnostics 积木决定。
 * 这里不 import 任何业务代码，避免日志系统绑进某一块。
 */
export type DiagLevel = 'info' | 'warn' | 'error'

export interface DiagEntry {
  /** 毫秒时间戳 */
  time: number
  level: DiagLevel
  /** 来源：import / settings / apiKey / window / console… */
  scope: string
  message: string
}

/** 缓冲区上限：够还原一次操作的前因后果，又不至于把内存吃满 */
const MAX_ENTRIES = 600
/** 单条上限：堆栈保留头部，避免一条记录顶掉整个缓冲区 */
const MAX_MESSAGE = 1500

const entries: DiagEntry[] = []
const listeners = new Set<() => void>()
let version = 0
let installed = false

const notify = (): void => {
  version += 1
  for (const listener of [...listeners]) {
    listener()
  }
}

/** 把任意抛出的值展开成一行可读文本 */
export const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

const clip = (value: string): string =>
  value.length > MAX_MESSAGE ? `${value.slice(0, MAX_MESSAGE)}…` : value

export const diagRecord = (
  level: DiagLevel,
  scope: string,
  message: string,
  detail?: unknown
): void => {
  const tail = detail === undefined || detail === '' ? '' : ` ${describeError(detail)}`
  entries.push({ time: Date.now(), level, scope, message: clip(`${message}${tail}`) })
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }
  notify()
}

/** 异常专用入口：带上错误名、消息与堆栈 */
export const diagError = (scope: string, error: unknown, message = '出错了'): void => {
  diagRecord('error', scope, message, error)
}

export const diagEntries = (): readonly DiagEntry[] => entries

/** 版本号：界面用它判断要不要重渲染，不用每次比较整个数组 */
export const diagVersion = (): number => version

export const diagClear = (): void => {
  entries.length = 0
  notify()
}

export const diagSubscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 挂全局钩子：未捕获异常、未处理的 Promise、console.error / warn 都进缓冲区 */
export const diagInstall = (): void => {
  if (installed || typeof window === 'undefined') {
    return
  }
  installed = true
  window.addEventListener(
    'error',
    (event) => {
      // 图片/脚本加载失败没有 error 对象，靠 target 分辨
      const target = event.target as (EventTarget & { tagName?: string; src?: string }) | null
      if (event.error === undefined && target?.tagName) {
        diagRecord('error', 'resource', `${target.tagName} 加载失败`, target.src ?? '')
        return
      }
      diagError('window', event.error ?? event.message, '未捕获异常')
    },
    true
  )
  window.addEventListener('unhandledrejection', (event) => {
    diagError('promise', event.reason, '未处理的 Promise 拒绝')
  })
  const wrap = (level: DiagLevel, original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        diagRecord(
          level,
          'console',
          args.map((arg) => (typeof arg === 'string' ? arg : describeError(arg))).join(' ')
        )
      } catch {
        // 记录本身失败不能影响原日志
      }
      original(...args)
    }
  console.error = wrap('error', console.error.bind(console))
  console.warn = wrap('warn', console.warn.bind(console))
}
