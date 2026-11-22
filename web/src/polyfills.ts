/**
 * 老机型兼容层：必须排在所有业务 import 之前，晚于它就来不及了。
 *
 * 底线是 Android 11 自带的 WebView（Chromium 87）——2020–2021 年的机器常年不更新，
 * 高版本才有的少量 API 在这里补齐。缺了它们的后果不是"少个功能"：
 * 首屏渲染里就会抛 TypeError，整页白屏，连诊断日志都导不出来。
 */

/** 往原型上补一个方法；已存在（新机器）就什么都不做，保持原生实现。 */
const define = (target: object, name: string, value: unknown): void => {
  if (typeof (target as Record<string, unknown>)[name] !== 'function') {
    Object.defineProperty(target, name, { value, writable: true, configurable: true })
  }
}

// Chromium 93：会话缓存查表、i18n 词典查表都在首屏就被调用
if (typeof Object.hasOwn !== 'function') {
  define(Object, 'hasOwn', (object: unknown, key: PropertyKey): boolean =>
    Object.prototype.hasOwnProperty.call(object, key)
  )
}

// Chromium 92：消息列表、回复区都用 arr.at(-1) 取最后一项
define(Array.prototype, 'at', function at(this: unknown[], index: number): unknown {
  const length = this.length
  let value = Math.trunc(index) || 0
  if (value < 0) {
    value += length
  }
  return value < 0 || value >= length ? undefined : this[value]
})

// Chromium 110：导入历史按 id 排序、发送前倒序遍历上下文，缺了必崩
define(Array.prototype, 'toSorted', function toSorted<T>(
  this: T[],
  compare?: (a: T, b: T) => number
): T[] {
  return [...this].sort(compare)
})

define(Array.prototype, 'toReversed', function toReversed<T>(this: T[]): T[] {
  return [...this].reverse()
})

// Chromium 100：发送前的中断检查
if (typeof AbortSignal !== 'undefined') {
  define(AbortSignal.prototype, 'throwIfAborted', function throwIfAborted(this: AbortSignal): void {
    if (this.aborted) {
      throw new DOMException('This operation was aborted', 'AbortError')
    }
  })
}
