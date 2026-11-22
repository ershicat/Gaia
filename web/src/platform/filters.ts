import type { SessionSummary } from '../services/chat/types.js'

/**
 * 会话列表过滤器（数据层，不是渲染层）。
 *
 * 「按角色过滤会话」必须在这里做：先渲染再隐藏会出现闪烁，
 * 上一版就是因为把过滤放在 DOM 层被踩过。
 * 顺序：先过滤再分组，所以注入点在上游 Sider 取 sessions 的位置。
 */
export type SessionFilter = (sessions: SessionSummary[]) => SessionSummary[]

const filters: SessionFilter[] = []

export const registerSessionFilter = (filter: SessionFilter): void => {
  filters.push(filter)
}

/** 逐个套用已注册的过滤器；任何一层抛错都不影响后面的层 */
export const applySessionFilters = (sessions: SessionSummary[]): SessionSummary[] => {
  let result = sessions
  for (const filter of filters) {
    try {
      result = filter(result)
    } catch (error) {
      console.error('[session filter]', error)
    }
  }
  return result
}

export const sessionFilterCount = (): number => filters.length
