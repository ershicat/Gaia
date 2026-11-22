import { currentApiTarget } from '../../platform/index.js'
import type { Message } from '../../services/chat/types.js'

/** 上下文上限：deepseek-flash 1,048,576；其它服务商按注册表上限算 */
export const CONTEXT_LIMIT = 1048576

/** 当前服务商的上下文上限（状态栏百分比用） */
export const contextLimit = (): number => currentApiTarget()?.contextLimit ?? CONTEXT_LIMIT

export interface UsageStats {
  /** 本轮累计输出 token */
  outputTokens: number
  /** 输入 token（含缓存命中） */
  inputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  /** 缓存命中率（0–1）；没有输入时为 null */
  cacheRate: number | null
  /** 上下文占用率（输出/上限），仅作参考 */
  contextRate: number
}

const EMPTY: UsageStats = {
  outputTokens: 0,
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  cacheRate: null,
  contextRate: 0,
}

/** 取最后一条带用量的助手消息（= 最近一轮的真实开销） */
export const lastUsage = (messages: Message[]): UsageStats => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant' || !message.usage) {
      continue
    }
    const usage = message.usage
    const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    const hit = usage.cache_read_input_tokens
    return {
      outputTokens: usage.output_tokens,
      inputTokens: input,
      cacheReadTokens: hit,
      cacheCreationTokens: usage.cache_creation_input_tokens,
      cacheRate: input > 0 ? hit / input : null,
      contextRate: usage.output_tokens / contextLimit(),
    }
  }
  return EMPTY
}

/** 人读的 token 数：1234 → 1.2k */
export const formatTokens = (value: number): string => {
  if (value < 1000) {
    return String(value)
  }
  if (value < 1000000) {
    return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`
  }
  return `${(value / 1000000).toFixed(2)}M`
}

export const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`
