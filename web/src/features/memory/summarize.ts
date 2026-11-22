import type { Message } from '../../services/chat/types.js'
import { clip, SUMMARY_BUDGET_TOKENS, estimateTokens, textOf } from './budget.js'
import { splitTurns, type Turn } from './storage.js'

const firstLine = (text: string): string => {
  const line = text.split('\n').find((item) => item.trim())
  return (line ?? '').trim()
}

/**
 * 抽取式摘要：不额外调 API，零成本、零延迟、不会失败。
 * 每轮压成「问 → 答要点」，超预算就从头丢最旧的要点。
 * 想换成模型摘要时只替换本函数即可（中间件与存储不用动）。
 */
export const buildSummaryText = (turns: Turn[], previous: string): string => {
  const fresh = turns.map((turn) => {
    const question = turn.user ? clip(textOf(turn.user).replace(/\s+/g, ' ').trim(), 60) : '（续写）'
    const answer = clip(firstLine(textOf(turn.assistant)), 120)
    return `- 问：${question} → 答：${answer}`
  })
  const lines = [...previous.split('\n').filter(Boolean), ...fresh]
  let text = lines.join('\n')
  while (estimateTokens(text) > SUMMARY_BUDGET_TOKENS && lines.length > 1) {
    lines.shift()
    text = lines.join('\n')
  }
  return text
}

export const turnsToCompress = (
  messages: Message[],
  alreadyCompressed: number,
  keepRecent: number
): Turn[] => {
  const turns = splitTurns(messages)
  const end = Math.max(alreadyCompressed, turns.length - keepRecent)
  return turns.slice(alreadyCompressed, end)
}
