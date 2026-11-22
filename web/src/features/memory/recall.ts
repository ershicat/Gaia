import type { Message } from '../../services/chat/types.js'
import { clip, textOf } from './budget.js'
import { splitTurns } from './storage.js'

/** 过于常见的词不参与打分 */
const STOP = new Set([
  '的',
  '了',
  '我',
  '你',
  '他',
  '她',
  '是',
  '在',
  '有',
  '和',
  '就',
  '不',
  '也',
  '都',
  '这',
  '那',
  '什么',
  '怎么',
  '为什么',
  'the',
  'and',
  'for',
  'with',
  'you',
  'are',
])

/** 极简分词：英文/数字按词，中文按 2 字滑窗 */
export const keywords = (text: string): string[] => {
  const found = new Set<string>()
  for (const word of text.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []) {
    if (!STOP.has(word)) {
      found.add(word)
    }
  }
  for (const chunk of text.match(/[\u4e00-\u9fa5]{2,}/g) ?? []) {
    for (let index = 0; index + 2 <= chunk.length; index += 1) {
      const bigram = chunk.slice(index, index + 2)
      if (!STOP.has(bigram)) {
        found.add(bigram)
      }
    }
  }
  return [...found]
}

export interface RecallHit {
  turn: number
  score: number
  snippet: string
}

/**
 * 关键词召回：在最近 8 轮之外的历史里找命中最多的片段。
 * 不删除原文，只把最相关的几段拼进上下文（可回看）。
 */
export const recall = (
  messages: Message[],
  question: string,
  options?: { keepRecent?: number; limit?: number }
): RecallHit[] => {
  const words = keywords(question)
  if (words.length === 0) {
    return []
  }
  const keepRecent = options?.keepRecent ?? 8
  const limit = options?.limit ?? 3
  const turns = splitTurns(messages)
  const pool = turns.slice(0, Math.max(0, turns.length - keepRecent))
  const hits: RecallHit[] = []
  pool.forEach((turn, index) => {
    const text = [turn.user ? textOf(turn.user) : '', textOf(turn.assistant)].filter(Boolean).join('\n')
    const lower = text.toLowerCase()
    let score = 0
    for (const word of words) {
      if (lower.includes(word)) {
        score += word.length >= 4 ? 2 : 1
      }
    }
    if (score > 0) {
      hits.push({ turn: index + 1, score, snippet: clip(text.trim().replace(/\s+\n/g, '\n'), 400) })
    }
  })
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
