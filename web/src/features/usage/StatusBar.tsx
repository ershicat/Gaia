import { useEffect, useRef, useState } from 'react'
import { chat } from '../../platform/index.js'
import { formatPercent, formatTokens, lastUsage } from './compute.js'
import styles from './usage.module.css'

/**
 * 底部状态栏：本轮 token · 缓存命中率 · 上下文占用。
 * 数据只从平台的只读句柄拿，不碰会话 store。
 */
export const StatusBar = ({ sessionId, streaming }: { sessionId: string; streaming: boolean }) => {
  const [stats, setStats] = useState(() => lastUsage(chat().getMessages(sessionId)))
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const read = (): void => setStats(lastUsage(chat().getMessages(sessionId)))
    read()
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
    if (streaming) {
      // 流式期间用量每秒刷新一次，避免跟着每个增量重渲染
      timer.current = setInterval(read, 1000)
    }
    return () => {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }
  }, [sessionId, streaming])

  const parts = [
    `${formatTokens(stats.inputTokens + stats.outputTokens)} tok`,
    `缓存命中 ${formatPercent(stats.cacheRate)}`,
    `上下文 ${formatPercent(stats.contextRate)}`,
  ]
  if (streaming) {
    parts.unshift('生成中')
  }

  return (
    <div className={styles.bar} role="status" aria-live="off">
      {parts.join(' · ')}
    </div>
  )
}
