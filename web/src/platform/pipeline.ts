import { isEnabled } from './flags.js'
import type { RequestContext, RequestMiddleware } from './types.js'

interface Entry {
  blockId: string
  order: number
  fn: RequestMiddleware
}

const entries: Entry[] = []

/** 由 compose() 调用；积木不直接注册 */
export const registerMiddleware = (
  blockId: string,
  fn: RequestMiddleware,
  order = 0
): void => {
  entries.push({ blockId, order, fn })
}

/**
 * 按 order 串行执行；被关闭的积木整体跳过。
 * 中间件抛错只影响它自己那一步，不中断整条管线。
 */
export const runPipeline = (input: RequestContext): RequestContext => {
  let ctx = input
  for (const entry of [...entries].sort((a, b) => a.order - b.order)) {
    if (!isEnabled(entry.blockId)) {
      continue
    }
    try {
      const next = entry.fn(ctx)
      if (next) {
        ctx = next
      }
    } catch (error) {
      console.error(`[middleware ${entry.blockId}]`, error)
    }
  }
  return ctx
}

export const middlewareCount = (): number => entries.length
