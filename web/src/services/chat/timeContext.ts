import type { Message } from './types.js'

/**
 * 时间读数（借 DSH `@deepseek-ai/dsh-time-context` 的形制）。
 *
 * 位置要求：只追加在当前提问之前，绝不进 system。
 * 时间每秒都在变，写进 system 会把提示词缓存从开头作废；落在尾部则命中率不受影响。
 */

/** 带数字偏移与 IANA 时区的 ISO 时间戳 */
const stamp = (now: Date, zone: string): string => {
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number): string => String(Math.floor(Math.abs(value))).padStart(2, '0')
  const local = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-')
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(':')
  return `${local}T${time}${sign}${pad(offset / 60)}:${pad(offset % 60)} [${zone}]`
}

/** 紧凑整秒：<1s / 42s / 3m 5s / 2h 7m */
export const formatElapsed = (ms: number): string => {
  if (!Number.isFinite(ms)) {
    return 'unavailable'
  }
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 1) {
    return '<1s'
  }
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

/** 当前会话的浏览器时区；取不到时给 UTC */
const timeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * 三行读数：当前时间、本请求的浏览器时区、距上一条模型可见消息的经过时长。
 * 没有可比的基线时如实写 unavailable，不猜。
 */
export const createTimeContext = (history: Message[], now = new Date()): string => {
  const zone = timeZone()
  const previous = history.at(-1)?.createdAt
  const elapsed =
    typeof previous === 'number' && previous > 0 ? formatElapsed(now.getTime() - previous) : 'unavailable'
  return [
    `Time sampled while preparing this request: ${stamp(now, zone)}`,
    `Browser time zone for this request: ${zone}`,
    `Elapsed since the preceding model-visible message: ${elapsed}`,
  ].join('\n')
}
