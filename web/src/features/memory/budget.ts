import { currentApiTarget } from '../../platform/index.js'
import type { Message } from '../../services/chat/types.js'

/** 粗略 token 估算：中文约 1 字 ≈ 0.7 token，英文按 4 字符 ≈ 1 token 取中 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 1.6)

/** 上下文上限与预算表（给"该不该压缩"提供唯一口径） */
export const CONTEXT_LIMIT = 1048576

/** 当前服务商的上下文上限：切到 128k 的服务商时压缩阈值要跟着变，否则会先撞上限 */
export const contextLimit = (): number => currentApiTarget()?.contextLimit ?? CONTEXT_LIMIT
export const KEEP_RECENT_TURNS = 8
export const TRIGGER_TURNS = 30
export const SUMMARY_BUDGET_TOKENS = 2000
export const RECALL_BUDGET_TOKENS = 1200
/** 记忆文件召回：最多几个文件、每个文件几行、合起来多少 token、打分门槛 */
export const MEMORY_RECALL_FILES = 2
export const MEMORY_RECALL_LINES = 4
export const MEMORY_RECALL_BUDGET_TOKENS = 600
export const MEMORY_RECALL_MIN_SCORE = 2

/**
 * 原文档案（/archive/*）召回：与「提炼证据」分开一条战线。
 * 证据是一行一条事实，够回答"他是谁"；原文是一段对话，够回答"当时到底说了什么"。
 * 所以这里给的是「命中行的前后几条」而不是孤零零一行，预算也单独算。
 */
export const ARCHIVE_PREFIX = '/archive/'
export const MEMORY_ARCHIVE_FILES = 1
/** 命中行前后各取几条（一个来回通常是 2 条） */
export const MEMORY_ARCHIVE_NEIGHBORS = 2
export const MEMORY_ARCHIVE_BUDGET_TOKENS = 750
/** 门槛比证据高：原文量大，泛词命中一次不该把整段原文拉进来 */
export const MEMORY_ARCHIVE_MIN_SCORE = 3
/**
 * 锚点要求：命中的词里至少有一个「稀有词」（权重 ≥ 1.5，即 df ≤ 3，
 * 或 4 字以上的词 df ≤ 8）。为什么必须有：角色扮演语料里"惩罚""地下""手术台"
 * 这类词本身就出现在几十上百行，每个只值 0.5 分；而"你觉得我是个什么样的人"
 * 这种泛问句能靠 7 个虚词累加到 3.5 分。只按总分判定，结果就是
 * 「泛问句拉一整段原文，真问专名的反而一句都不给」。
 * 所以除总分门槛外，还必须有一个"问的就是这个东西"的锚点。
 */
export const MEMORY_ARCHIVE_ANCHOR_WEIGHT = 1.5
/** 单段原文的字符上限 */
export const MEMORY_ARCHIVE_CLIP = 1200

export const textOf = (message: Message): string => {
  if (message.role === 'user') {
    return message.content
  }
  return message.blocks
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}

export const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}…`

/** 会话当前占用估算（只用于展示与阈值判断，不追求精确） */
export const sessionTokens = (messages: Message[]): number =>
  messages.reduce((total, message) => total + estimateTokens(textOf(message)), 0)
