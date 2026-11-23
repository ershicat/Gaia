import type { RequestMiddleware } from '../../platform/index.js'
import { chat, hasChatBridge, numberOption } from '../../platform/index.js'
import { useSettings } from '../../services/settings.js'
import {
  ARCHIVE_PREFIX,
  KEEP_RECENT_TURNS,
  RECALL_BUDGET_TOKENS,
  clip,
  estimateTokens,
  sessionTokens,
} from './budget.js'
import { renderCard } from './card.js'
import {
  recallArchive,
  recallMemoryFiles,
  renderArchiveHits,
  renderMemoryHits,
  renderStoryHits,
} from './memoryRecall.js'
import { recall } from './recall.js'
import { isStoryPath, parseStoryPath, renderStoryBrief, storyFilesForRole, storyIndexFor } from './story.js'
import { storyModules, storyRoleOf } from './storySession.js'
import { cardOf, memoryFiles, summaryOf } from './store.js'

const sessionCardEnabled = (): boolean => useSettings.getState().sessionCard

/**
 * 记忆中间件：只做五件事
 *   1. 往 system 追加「早前摘要 + 长期记忆」——这两样只在压缩/做梦后变，属于字节稳定段
 *   2. 把「与本次提问相关的历史片段」放进 tailNotes——它每轮都变，绝不能进 system，
 *      否则提示词缓存从第一个字节起就作废（长会话会因此每轮按未命中计费）
 *   3. 把长期记忆文件里「与本次提问相关的行」也放进 tailNotes（行级检索，命中才注入）；
 *      除 /profile.md 与 /preferences.md 之外的文件正文原本永远到不了模型手里
 *   4. 把原文档案（/archive/*）里「与本次提问相关的原话」成段放进 tailNotes（命中才注入）；
 *      没有这一段，模型只能用提炼证据推断细节，一问就对不上 —— 用户体感是失忆
 *   5. 声明丢掉已被摘要覆盖的前 N 轮（dropTurns）；被压缩时同时关掉续写前缀
 * 不碰 messages 数组，也不碰最近 8 轮。
 */
export const memoryMiddleware: RequestMiddleware = (ctx) => {
  if (!hasChatBridge()) {
    return
  }
  // 记忆召回不依赖历史条数：新会话的第一条消息也该带上相关事实与原话
  const allFiles = memoryFiles()
  const roleId = storyRoleOf(ctx.sessionId)
  const modules = storyModules()
  const scopedStoryPaths = new Set(
    roleId ? storyFilesForRole(allFiles, roleId, modules).map((file) => file.path) : []
  )
  // 只让当前角色的故事文件进入上下文；其它角色/导入会话的故事一律不可见
  const visibleFiles = allFiles.filter(
    (file) => !isStoryPath(file.path) || scopedStoryPaths.has(file.path)
  )
  const personalFiles = visibleFiles.filter((file) => !isStoryPath(file.path))
  const storyRecallFiles = visibleFiles.filter((file) => {
    const info = parseStoryPath(file.path)
    return (
      !!info &&
      info.roleId === roleId &&
      (info.module === 'events' || info.module === 'world')
    )
  })

  const storyNote = roleId
    ? renderStoryBrief(storyIndexFor(allFiles, roleId, modules), modules)
    : ''
  const memoryNote = renderMemoryHits(recallMemoryFiles(personalFiles, ctx.question))
  const storyRecallNote = renderStoryHits(
    recallMemoryFiles(storyRecallFiles, ctx.question, {
      limit: 1,
      linesPerFile: 3,
      budget: 300,
    })
  )
  const archiveNote = renderArchiveHits(recallArchive(visibleFiles, ctx.question))
  const recallNotes = [memoryNote, storyRecallNote, archiveNote].filter(Boolean)
  const messages = chat().getMessages(ctx.sessionId)
  if (messages.length === 0) {
    if (!storyNote && recallNotes.length === 0) {
      return
    }
    return {
      ...ctx,
      tailNotes: [...ctx.tailNotes, ...recallNotes],
      cardNote: storyNote,
    }
  }
  const record = summaryOf(ctx.sessionId)
  const compressed = record?.turns ?? 0
  const addons: string[] = []
  // 有档案卡的长会话不再注入抽取式摘要、也不再按摘要丢历史：那段摘要只有十几行，
  // 既帮不上理解，又会在每次改写时让整轮提示词缓存失效。长度交给固定窗口。
  const cardMode = sessionCardEnabled() && cardOf(ctx.sessionId) !== undefined

  if (!cardMode && record && compressed > 0 && record.text.trim()) {
    addons.push(`## 早前对话摘要（已压缩 ${compressed} 轮，原文仍可回看）\n${record.text}`)
  }

  // 长期记忆：画像与偏好全文注入，其它文件只给清单（描述只是索引，不是内容）。
  // 原文档案不进清单：43 个文件会把 system 常驻段撑大，它们只在命中时按段注入。
  if (personalFiles.length > 0) {
    const profile = personalFiles.find((file) => file.path === '/profile.md')
    const preferences = personalFiles.find((file) => file.path === '/preferences.md')
    const others = personalFiles.filter(
      (file) =>
        file.path !== '/profile.md' &&
        file.path !== '/preferences.md' &&
        !file.path.startsWith(ARCHIVE_PREFIX)
    )
    const sections: string[] = [
      '## 长期记忆（跨会话）',
      '只在能改变这次回答时使用；不要主动说「我记得」或「根据我的记忆」。',
    ]
    if (profile?.content.trim()) {
      sections.push(`### 用户画像\n${profile.content.trim()}`)
    }
    if (preferences?.content.trim()) {
      sections.push(`### 回答偏好\n${preferences.content.trim()}`)
    }
    if (others.length > 0) {
      sections.push(
        [
          '### 其它记忆（只有标题和描述，需要细节时按描述判断）',
          ...others.map((file) => `- ${file.title}：${file.description || '无描述'}`),
        ].join('\n')
      )
    }
    addons.push(sections.join('\n\n'))
  }

  const tailNotes = recallNotes.length > 0 ? [...ctx.tailNotes, ...recallNotes] : [...ctx.tailNotes]
  const hits = recall(messages, ctx.question, {
    keepRecent: numberOption('memoryKeepTurns', KEEP_RECENT_TURNS),
  })
  if (hits.length > 0) {
    const lines = hits.map((hit) => `（第 ${hit.turn} 轮）${hit.snippet}`)
    const text = clip(lines.join('\n'), RECALL_BUDGET_TOKENS)
    tailNotes.push(`## 与本次提问相关的历史片段\n${text}`)
  }

  // 会话档案 + 故事简报：放在窗口之后、召回之前。它们是动态的，所以不进 system；
  // 但也不跟当前提问挤在同一条里。故事简报在前，档案的“当前剧情”优先级更高。
  const card = sessionCardEnabled() ? cardOf(ctx.sessionId) : undefined
  const cardNote = [storyNote, card ? renderCard(card) : ''].filter(Boolean).join('\n\n')
  // 有档案卡时不丢历史（长度交给固定窗口），也不关续写前缀
  const dropTurns = cardMode ? 0 : compressed

  if (addons.length === 0 && tailNotes.length === ctx.tailNotes.length && !cardNote) {
    return
  }

  return {
    ...ctx,
    system: addons.length > 0 ? `${ctx.system}\n\n${addons.join('\n\n')}`.trim() : ctx.system,
    tailNotes,
    cardNote,
    dropTurns,
    // 压缩重写了历史：续写前缀必须关掉，否则内容会重复
    prefixEnabled: dropTurns > 0 ? false : ctx.prefixEnabled,
  }
}

/** 给界面/日志看的估算，不放上下文 */
export const memoryFootprint = (sessionId: string): { tokens: number; compressed: number } => {
  if (!hasChatBridge()) {
    return { tokens: 0, compressed: 0 }
  }
  const messages = chat().getMessages(sessionId)
  return {
    tokens: sessionTokens(messages) + estimateTokens(summaryOf(sessionId)?.text ?? ''),
    compressed: summaryOf(sessionId)?.turns ?? 0,
  }
}
