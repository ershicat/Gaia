import {
  ARCHIVE_PREFIX,
  MEMORY_ARCHIVE_ANCHOR_WEIGHT,
  MEMORY_ARCHIVE_BUDGET_TOKENS,
  MEMORY_ARCHIVE_CLIP,
  MEMORY_ARCHIVE_FILES,
  MEMORY_ARCHIVE_MIN_SCORE,
  MEMORY_ARCHIVE_NEIGHBORS,
  MEMORY_RECALL_BUDGET_TOKENS,
  MEMORY_RECALL_FILES,
  MEMORY_RECALL_LINES,
  MEMORY_RECALL_MIN_SCORE,
  estimateTokens,
} from './budget.js'
import { PREFERENCES_PATH, PROFILE_PATH, type MemoryFile } from './files.js'
import { keywords } from './recall.js'

/** 单行裁剪，避免一条过长的行挤占整个预算 */
const LINE_LIMIT = 140
const clipLine = (line: string): string =>
  line.length <= LINE_LIMIT ? line : `${line.slice(0, LINE_LIMIT)}…`
/** 一行至少要凑到这个分才算命中，避免「哥哥」这种泛词把整份文件带进来 */
const LINE_MIN_SCORE = 1.5
/** 标题/描述/别名命中时的固定加分 */
const META_BONUS = 2

export interface MemoryRecallHit {
  path: string
  title: string
  lines: string[]
  score: number
}

/** 角色扮演里的称呼词：满篇都是，不构成「问的就是这条」的证据 */
const GENERIC_ADDRESS = new Set(['哥哥', '姐姐', '宝宝', '亲爱', '老公', '老婆', '主人', '大人'])
/** 虚词：两个都是虚词的 2 字片段（「得我」「了你」「把被」）只是碰巧连在一起，不算证据 */
const GLUE_CHARS = new Set([...('的了是我你他她它在有不也都这那得把被给让吗呢啊吧与或而但还又很太更最')])
const isGlueWord = (word: string): boolean => {
  const chars = [...word]
  return chars.length >= 2 && chars.every((char) => GLUE_CHARS.has(char))
}

/**
 * 词权重：越少见的词越能说明「问的就是这个」。
 * 只按 2 字/4 字长度给固定权重是不够的——角色扮演里「哥哥」满篇都是，
 * 而「周砚」「沈清」这种专名才是真正的指针。
 */
const wordWeight = (word: string, documentFrequency: number): number => {
  if (GENERIC_ADDRESS.has(word) || isGlueWord(word)) {
    return 0
  }
  const base =
    documentFrequency <= 1 ? 2 : documentFrequency <= 3 ? 1.5 : documentFrequency <= 8 ? 1 : 0.5
  return word.length >= 4 ? base * 1.5 : base
}

/**
 * 记忆文件召回：把长期记忆里与本次提问相关的「行」捡出来。
 *
 * 为什么需要它：`/profile.md` 与 `/preferences.md` 的全文进 system，
 * 其余文件（/people /topics /areas）原先只有一行「标题：描述」进上下文，
 * 正文永远到不了模型手里——写进去等于没写。这里对正文做行级检索，
 * 命中才注入，注入的是动态段（tailNotes），不进 system，不会击穿提示词缓存。
 */
export const recallMemoryFiles = (
  files: MemoryFile[],
  question: string,
  options?: {
    limit?: number
    linesPerFile?: number
    budget?: number
    minScore?: number
  }
): MemoryRecallHit[] => {
  const words = keywords(question)
  if (words.length === 0 || files.length === 0) {
    return []
  }

  const limit = options?.limit ?? MEMORY_RECALL_FILES
  const linesPerFile = options?.linesPerFile ?? MEMORY_RECALL_LINES
  const budget = options?.budget ?? MEMORY_RECALL_BUDGET_TOKENS
  const minScore = options?.minScore ?? MEMORY_RECALL_MIN_SCORE

  // 只检索「不进 system」的文件；它们才是当前到不了模型手里的那部分。
  // 原文档案（/archive/*）单独一条战线（见 recallArchive），这里排除掉：
  // 一是它的量级会把「提炼证据」的档文档频率带偏，二是它需要的是成段上下文而不是单行。
  const candidates = files
    .filter((file) => file.path !== PROFILE_PATH && file.path !== PREFERENCES_PATH)
    .filter((file) => !file.path.startsWith(ARCHIVE_PREFIX))
    .map((file) => ({
      file,
      body: file.content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    }))
    .filter((item) => item.body.length > 0)
  if (candidates.length === 0) {
    return []
  }

  // 文档频率：一个词出现在多少行里。用来给泛词降权、给专名提权。
  const documentFrequency = new Map<string, number>()
  for (const word of words) {
    let count = 0
    for (const item of candidates) {
      for (const line of item.body) {
        if (line.toLowerCase().includes(word)) {
          count += 1
        }
      }
    }
    documentFrequency.set(word, count)
  }
  const weightOf = (word: string): number => wordWeight(word, documentFrequency.get(word) ?? 0)

  const hits: MemoryRecallHit[] = []
  for (const { file, body } of candidates) {
    // 标题/描述/别名命中：说明整份文件就是问的对象；泛词不算
    const meta = [file.title, file.description, ...(file.aliases ?? [])].join(' ').toLowerCase()
    // 标题算强信号：问某个名字时，名字本身就在正文里的「别人文件」会抢走命中，得让本人文件优先
    const titleHit = words.some((word) => weightOf(word) >= 1 && file.title.toLowerCase().includes(word))
    const metaHit =
      titleHit || words.some((word) => weightOf(word) >= LINE_MIN_SCORE && meta.includes(word))

    const matched: { line: string; hits: number }[] = []
    let score = 0
    for (const line of body) {
      const lower = line.toLowerCase()
      let lineScore = 0
      for (const word of words) {
        if (lower.includes(word)) {
          lineScore += weightOf(word)
        }
      }
      if (lineScore > 0) {
        matched.push({ line, hits: lineScore })
        score += lineScore
      }
    }

    if (matched.length === 0) {
      // 正文没有逐行命中，但整份文件就是问的对象：给开头几行当概览
      if (metaHit) {
        hits.push({
          path: file.path,
          title: file.title,
          lines: body.slice(0, linesPerFile).map((line) => clipLine(line)),
          score: META_BONUS,
        })
      }
      continue
    }

    if (metaHit) {
      score += META_BONUS
    }
    if (score < minScore) {
      continue
    }

    matched.sort((a, b) => b.hits - a.hits)
    // 单行够分的才取；只有「整份文件相关」时，才降级给最相关的几行
    const strong = matched.filter((item) => item.hits >= LINE_MIN_SCORE)
    const picked = strong.length > 0 ? strong : metaHit ? matched : []
    if (picked.length === 0) {
      continue
    }
    hits.push({
      path: file.path,
      title: file.title,
      lines: picked.slice(0, linesPerFile).map((item) => clipLine(item.line)),
      score,
    })
  }

  hits.sort((a, b) => b.score - a.score)
  const result: MemoryRecallHit[] = []
  let used = 0
  for (const hit of hits.slice(0, limit)) {
    const cost = estimateTokens(hit.lines.join('\n'))
    // 第一条无论如何给，后面的超预算就跳过（宁可少一条，不要挤掉历史召回）
    if (result.length > 0 && used + cost > budget) {
      continue
    }
    result.push(hit)
    used += cost
  }
  return result
}

/** 渲染成注入块；没有命中返回空串 */
export const renderMemoryHits = (hits: MemoryRecallHit[]): string => {
  if (hits.length === 0) {
    return ''
  }
  const lines = ['## 长期记忆·相关条目（只在与本次提问有关时使用，不要主动说「我记得」）']
  for (const hit of hits) {
    lines.push(`### ${hit.title}（${hit.path}）`)
    for (const line of hit.lines) {
      lines.push(`- ${line}`)
    }
  }
  return lines.join('\n')
}

export interface ArchiveHit {
  /** 文件标题（含日期与段号，例如「原文 2026-11-13（2/4）」） */
  title: string
  /** 命中那段原文：命中行前后各若干条 */
  text: string
  score: number
}

/**
 * 原文档案召回：把「与本次提问相关的原话」整段捡出来。
 *
 * 为什么单独一条战线：
 *   `/people` `/topics` `/areas` 是一行一条的提炼事实，能回答"他是谁"；
 *   但用户问"上次你到底怎么说的""那天发生了什么"时，只有原话对得上。
 *   记忆库长期只有提炼证据、没有正文，一问细节模型就只能编 —— 用户体感是失忆。
 *
 * 与证据召回的三点不同：
 *   1. 命中行前后各取几条（原文是对话，单行脱离上下文没有意义）
 *   2. 门槛更高（原文量级大，一个泛词命中不该把整段拉进来）
 *   3. 预算单独算（不让它挤掉证据条目与历史片段）
 */
export const recallArchive = (
  files: MemoryFile[],
  question: string,
  options?: {
    limit?: number
    neighbors?: number
    budget?: number
    minScore?: number
    clipChars?: number
  }
): ArchiveHit[] => {
  const words = keywords(question)
  if (words.length === 0) {
    return []
  }
  const limit = options?.limit ?? MEMORY_ARCHIVE_FILES
  const neighbors = options?.neighbors ?? MEMORY_ARCHIVE_NEIGHBORS
  const budget = options?.budget ?? MEMORY_ARCHIVE_BUDGET_TOKENS
  const minScore = options?.minScore ?? MEMORY_ARCHIVE_MIN_SCORE
  const clipChars = options?.clipChars ?? MEMORY_ARCHIVE_CLIP

  const candidates = files
    .filter((file) => file.path.startsWith(ARCHIVE_PREFIX))
    .map((file) => ({
      file,
      body: file.content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    }))
    .filter((item) => item.body.length > 0)
  if (candidates.length === 0) {
    return []
  }

  // 档文档频率只在原文语料里算，和证据战线互不影响
  const documentFrequency = new Map<string, number>()
  for (const word of words) {
    let count = 0
    for (const item of candidates) {
      for (const line of item.body) {
        if (line.toLowerCase().includes(word)) {
          count += 1
        }
      }
    }
    documentFrequency.set(word, count)
  }
  const weightOf = (word: string): number => wordWeight(word, documentFrequency.get(word) ?? 0)

  const scored: { file: MemoryFile; body: string[]; index: number; score: number }[] = []
  for (const item of candidates) {
    let best = -1
    let bestScore = 0
    let bestAnchored = false
    item.body.forEach((line, index) => {
      const lower = line.toLowerCase()
      let score = 0
      let anchored = false
      for (const word of words) {
        if (!lower.includes(word)) {
          continue
        }
        const weight = weightOf(word)
        score += weight
        // 锚点：这个词在原文语料里够罕见（df 小），说明问的就是它
        if (weight >= MEMORY_ARCHIVE_ANCHOR_WEIGHT) {
          anchored = true
        }
      }
      if (score > bestScore) {
        bestScore = score
        best = index
        bestAnchored = anchored
      }
    })
    if (best >= 0 && bestScore >= minScore && bestAnchored) {
      scored.push({ ...item, index: best, score: bestScore })
    }
  }
  if (scored.length === 0) {
    return []
  }
  scored.sort((a, b) => b.score - a.score)

  const hits: ArchiveHit[] = []
  let used = 0
  for (const item of scored.slice(0, limit)) {
    const from = Math.max(0, item.index - neighbors)
    const to = Math.min(item.body.length, item.index + neighbors + 1)
    let text = item.body.slice(from, to).join('\n')
    if (text.length > clipChars) {
      text = `${text.slice(0, clipChars)}…`
    }
    const cost = estimateTokens(text)
    // 第一条无论多长都给：否则原文战线可能一次都不生效
    if (hits.length > 0 && used + cost > budget) {
      continue
    }
    hits.push({ title: item.file.title, text, score: item.score })
    used += cost
  }
  return hits
}

/** 渲染原文片段；没有命中返回空串 */
export const renderArchiveHits = (hits: ArchiveHit[]): string => {
  if (hits.length === 0) {
    return ''
  }
  const lines = ['## 原文片段（历史对话的原话；细节、台词、动作以这里为准，可直接引用，不要改写）']
  for (const hit of hits) {
    lines.push(`### ${hit.title}`)
    lines.push(hit.text)
  }
  return lines.join('\n')
}
