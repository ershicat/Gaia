import { create } from 'zustand'
import { activeRoleId, chat, diagError, diagRecord, hasChatBridge, numberOption } from '../../platform/index.js'
import { showToast } from '../../components/base/toastState.js'
import { setSessionCard, useSettings } from '../../services/settings.js'
import { contextLimit, KEEP_RECENT_TURNS, TRIGGER_TURNS, sessionTokens } from './budget.js'
import { advanceWatermark, consolidateSession, messageCount } from './consolidate.js'
import {
  deleteMemoryFile,
  loadLastRun,
  loadMemoryFiles,
  loadWatermarks,
  normalizePath,
  pathTitle,
  saveLastRun,
  saveMemoryFile,
  saveWatermarks,
  type MemoryFile,
} from './files.js'
import { deleteSummary, loadSummaries, saveSummary, splitTurns, type SummaryRecord } from './storage.js'
import { buildSummaryText, turnsToCompress } from './summarize.js'
import { CARD_SYSTEM_PROMPT, buildCardInput, parseCard, type SessionCard } from './card.js'
import { deleteCard, loadCards, loadSeedCards, saveCard, saveSeedCard } from './cardStore.js'
import { generateText } from '../../services/api/text.js'

interface MemoryState {
  loaded: boolean
  summaries: Record<string, SummaryRecord>
  running: string[]
  /** 长期记忆文件（profile / preferences / topics…） */
  files: MemoryFile[]
  /** 每个会话已整理到第几条消息 */
  watermarks: Record<string, number>
  /** 每个会话上次整理时间 */
  lastRun: Record<string, number>
  /** 正在整理长期记忆（同一时间只跑一个） */
  consolidating: boolean
  /** 记忆面板是否打开（由命令打开，挂在 app.overlay 上） */
  panelOpen: boolean
  /** 会话档案卡：会话 id → 卡片 */
  cards: Record<string, SessionCard>
  /** 角色卡导入时夹带的初始档案卡：角色 id → 卡片（等该角色的新会话首次发送时落地） */
  seeds: Record<string, SessionCard>
  /** 正在建立/更新档案卡的会话 */
  cardBuilding: string[]
}

export const useMemory = create<MemoryState>(() => ({
  loaded: false,
  summaries: {},
  running: [],
  files: [],
  watermarks: {},
  lastRun: {},
  consolidating: false,
  panelOpen: false,
  cards: {},
  seeds: {},
  cardBuilding: [],
}))

const setState = useMemory.setState

export const openMemoryPanel = (): void => setState({ panelOpen: true })
export const closeMemoryPanel = (): void => setState({ panelOpen: false })

export const initMemory = async (): Promise<void> => {
  const [records, files, watermarks, lastRun, cards, seeds] = await Promise.all([
    loadSummaries(),
    loadMemoryFiles(),
    loadWatermarks(),
    loadLastRun(),
    loadCards(),
    loadSeedCards(),
  ])
  setState({
    loaded: true,
    summaries: Object.fromEntries(records.map((record) => [record.sessionId, record])),
    files,
    watermarks,
    lastRun,
    cards,
    seeds,
  })
}

export const memoryFiles = (): MemoryFile[] => useMemory.getState().files

/** 会话档案卡（没有就是 undefined） */
export const cardOf = (sessionId: string): SessionCard | undefined =>
  useMemory.getState().cards[sessionId]

const pickText = (value: unknown): string => (typeof value === 'string' ? value : '')

const pickList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []

/**
 * 记忆文件导入（角色卡夹带 / 面板用）：按 path 去重。
 * 已存在同名文件一律跳过 —— 导入是「补一份新档案」，不该覆盖用户自己攒的记忆。
 */
export const importMemoryFiles = async (
  incoming: unknown[]
): Promise<{ written: number; skipped: number }> => {
  const current = [...useMemory.getState().files]
  let written = 0
  let skipped = 0
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const item = raw as Record<string, unknown>
    const path = normalizePath(pickText(item.path) || pickText(item.title))
    if (!path) {
      continue
    }
    const content = pickText(item.content).trim()
    if (!content) {
      continue
    }
    if (current.some((file) => file.path === path)) {
      skipped += 1
      continue
    }
    const file: MemoryFile = {
      path,
      title: pickText(item.title).trim() || pathTitle(path),
      description: pickText(item.description).trim(),
      aliases: pickList(item.aliases),
      content,
      updatedAt: Date.now(),
    }
    await saveMemoryFile(file)
    current.push(file)
    written += 1
  }
  if (written > 0) {
    setState({ files: current })
  }
  return { written, skipped }
}

/** 把角色卡夹带的档案卡挂到这个角色上（还没落进任何会话） */
export const seedCardForRole = async (
  roleId: string,
  card: SessionCard
): Promise<boolean> => {
  if (!roleId) {
    return false
  }
  await saveSeedCard(roleId, card)
  setState({ seeds: { ...useMemory.getState().seeds, [roleId]: card } })
  return true
}

/**
 * 新会话首次发送前：该角色有预置档案卡、这张会话又还没有卡，就把它写进去。
 * 只认「这张会话归属的角色」，所以导入的历史会话不会被塞卡。
 */
export const seedInitialCard = async (sessionId: string): Promise<void> => {
  if (!sessionId || !hasChatBridge()) {
    return
  }
  if (useMemory.getState().cards[sessionId]) {
    return
  }
  const seeds = useMemory.getState().seeds
  const roleId = chat().getSession(sessionId)?.roleIds?.[0] ?? activeRoleId()
  const seed = roleId ? seeds[roleId] : undefined
  if (!seed) {
    return
  }
  await saveCard(sessionId, seed)
  setState({ cards: { ...useMemory.getState().cards, [sessionId]: seed } })
  diagRecord('info', 'memory', `会话档案卡就位（角色卡预置，覆盖到第 ${seed.covered} 条）`)
}

/** 等首次读取落盘完成：导入事件可能比 initMemory 更早到，别让随后的 setState 把它覆盖掉 */
const waitLoaded = async (): Promise<void> => {
  if (useMemory.getState().loaded) {
    return
  }
  await new Promise<void>((resolve) => {
    let guard: ReturnType<typeof setTimeout> | undefined
    const tick = setInterval(() => {
      if (useMemory.getState().loaded) {
        clearInterval(tick)
        if (guard) {
          clearTimeout(guard)
        }
        resolve()
      }
    }, 50)
    guard = setTimeout(() => {
      clearInterval(tick)
      resolve()
    }, 3000)
  })
}

/**
 * 事件入口：角色卡导入时夹带的附件，一次把档案卡与记忆文件落到本地 */
export const applyCardExtras = async (payload: {
  roleId: string
  roleName: string
  sessionCard: unknown
  memoryFiles: unknown[]
}): Promise<void> => {
  await waitLoaded()
  let seeded = false
  if (payload.sessionCard && typeof payload.sessionCard === 'object') {
    const raw = payload.sessionCard as Record<string, unknown>
    const covered = typeof raw.covered === 'number' ? raw.covered : 0
    const card = parseCard(JSON.stringify(raw), covered)
    if (card) {
      seeded = await seedCardForRole(payload.roleId, card)
    }
  }
  const result = await importMemoryFiles(payload.memoryFiles)
  // 预置卡只有在「会话档案卡」开关打开时才注入：导入时就替用户打开，省得他以为没生效
  if (seeded && !useSettings.getState().sessionCard) {
    setSessionCard(true)
  }
  const bits: string[] = []
  if (seeded) {
    bits.push('档案卡')
  }
  if (result.written > 0) {
    bits.push(`记忆 ${result.written} 条`)
  }
  if (result.skipped > 0) {
    bits.push(`跳过 ${result.skipped} 条（已存在）`)
  }
  if (bits.length > 0) {
    showToast(`${payload.roleName}：${bits.join(' · ')} 已就位`)
  }
}

/** 少于这个轮数不建档：短会话本来就不会被窗口截断，建了纯浪费钱 */
const CARD_MIN_TURNS = 40
/** 距上次建档新增这么多条消息就更新一次（约 20 轮） */
const CARD_REFRESH_MESSAGES = 40

/**
 * 首次发送前 / 每 20 轮更新一次会话档案。
 * 成本边界：只取「首 8k + 末 16k token」的样本，一次一两分钱，绝不喂全历史。
 */
export const maybeBuildCard = async (sessionId: string, force = false): Promise<void> => {
  if (!sessionId || !hasChatBridge()) {
    return
  }
  const settings = useSettings.getState()
  if (!settings.sessionCard || !settings.apiKey) {
    return
  }
  const state = useMemory.getState()
  if (state.cardBuilding.includes(sessionId)) {
    return
  }
  const messages = chat().getMessages(sessionId)
  if (splitTurns(messages).length < CARD_MIN_TURNS) {
    return
  }
  const existing = state.cards[sessionId]
  if (!force && existing && messages.length - existing.covered < CARD_REFRESH_MESSAGES) {
    return
  }
  setState({ cardBuilding: [...useMemory.getState().cardBuilding, sessionId] })
  const first = !existing
  if (first) {
    showToast('正在建立会话档案（首次会多等几秒）')
  }
  try {
    const input = buildCardInput(messages, existing ?? null)
    const raw = await generateText(
      settings.apiKey,
      settings.memoryModel ?? settings.model,
      CARD_SYSTEM_PROMPT,
      input,
      90_000
    )
    const card = parseCard(raw, messages.length)
    if (!card) {
      diagRecord('warn', 'memory', '会话档案解析失败，保留原档案', raw.slice(0, 200))
      return
    }
    await saveCard(sessionId, card)
    setState({ cards: { ...useMemory.getState().cards, [sessionId]: card } })
    diagRecord(
      'info',
      'memory',
      `会话档案${first ? '建立' : '更新'}完成：输入约 ${Math.round(input.length / 1.6)} token，覆盖到第 ${card.covered} 条`
    )
    if (first) {
      showToast('会话档案已建立')
    }
  } catch (error) {
    diagError('memory', error, '会话档案失败')
    if (first) {
      showToast('会话档案没建成，这一轮先照常发')
    }
  } finally {
    setState({
      cardBuilding: useMemory.getState().cardBuilding.filter((id) => id !== sessionId),
    })
  }
}

/** 删掉某个会话的档案（下次发送会按当前开关重新生成） */
export const removeCard = async (sessionId: string): Promise<void> => {
  await deleteCard(sessionId)
  const cards = { ...useMemory.getState().cards }
  delete cards[sessionId]
  setState({ cards })
}

/**
 * 整理长期记忆（「做梦」）：把会话里上次整理之后的新内容交给整理模型，
 * 按模型返回的 JSON 写进记忆文件。返回写入了多少条。
 */
export const runConsolidation = async (
  sessionId: string,
  mode: 'auto' | 'manual' = 'manual'
): Promise<number> => {
  const state = useMemory.getState()
  if (state.consolidating || !sessionId) {
    return 0
  }
  const count = messageCount(sessionId)
  setState({ consolidating: true })
  diagRecord('info', 'memory', `开始整理记忆（${mode}）`, `已整理到 ${state.watermarks[sessionId] ?? 0} / 共 ${count} 条`)
  try {
    const { result, files } = await consolidateSession(sessionId, state.files, state.watermarks)
    const watermarks = advanceWatermark(state.watermarks, sessionId, count)
    const lastRun = { ...state.lastRun, [sessionId]: Date.now() }
    await Promise.all([saveWatermarks(watermarks), saveLastRun(lastRun)])
    setState({ files, watermarks, lastRun })
    diagRecord('info', 'memory', `整理完成：写入 ${result.written} 条`, result.files.join(' '))
    if (result.written > 0) {
      showToast(`已整理 ${result.written} 条记忆到 ${result.files.length} 个文件`)
    } else if (mode === 'manual') {
      showToast('这次没有值得记住的新内容')
    }
    return result.written
  } catch (error) {
    diagError('memory', error, '整理失败')
    if (mode === 'manual') {
      showToast(`整理失败：${error instanceof Error ? error.message : String(error)}`)
    }
    return 0
  } finally {
    setState({ consolidating: false })
  }
}

/** 手动改一个记忆文件（面板里编辑后保存） */
export const upsertMemoryFile = async (file: MemoryFile): Promise<void> => {
  const next = { ...file, updatedAt: Date.now() }
  await saveMemoryFile(next)
  const files = useMemory.getState().files
  setState({
    files: files.some((item) => item.path === next.path)
      ? files.map((item) => (item.path === next.path ? next : item))
      : [...files, next],
  })
}

export const removeMemoryFile = async (path: string): Promise<void> => {
  await deleteMemoryFile(path)
  setState({ files: useMemory.getState().files.filter((item) => item.path !== path) })
}

/** 空闲后自动整理（做梦）：每轮结束重新计时，2 分钟没新动静就跑一次 */
let dreamTimer: ReturnType<typeof setTimeout> | null = null
const DREAM_DELAY_MS = 120_000

export const scheduleDream = (sessionId: string): void => {
  if (dreamTimer) {
    clearTimeout(dreamTimer)
  }
  dreamTimer = setTimeout(() => {
    dreamTimer = null
    void runConsolidation(sessionId, 'auto')
  }, DREAM_DELAY_MS)
}

/** 切到前台时补跑：上次没跑完/被挂起的整理在这里继续 */
export const flushPendingDream = (): void => {
  if (!hasChatBridge()) {
    return
  }
  const sessionId = chat().activeSessionId()
  if (!sessionId) {
    return
  }
  const state = useMemory.getState()
  const pending = messageCount(sessionId) > (state.watermarks[sessionId] ?? 0)
  if (pending) {
    void runConsolidation(sessionId, 'auto')
  }
}

export const summaryOf = (sessionId: string): SummaryRecord | undefined =>
  useMemory.getState().summaries[sessionId]

/**
 * 一轮结束后调用：轮次够多就把最早的若干轮压进摘要。
 * 压缩只影响"下一轮请求带上什么"，原文一律不动。
 */
export const compressIfNeeded = async (
  sessionId: string,
  mode: 'auto' | 'manual' = 'auto'
): Promise<void> => {
  if (!hasChatBridge()) {
    return
  }
  if (useMemory.getState().running.includes(sessionId)) {
    return
  }
  const messages = chat().getMessages(sessionId)
  const manual = mode === 'manual'
  // 自动压缩：关闭后只剩手动压缩（记忆面板）
  const { autoCompress, compressThreshold } = useSettings.getState()
  if (!autoCompress && !manual) {
    return
  }
  // 已建会话档案的长会话不再做抽取式压缩：
  //   窗口（30 轮）管住了上下文长度，档案管住了人设与剧情进度，
  //   而这份摘要只有十几行、还会每次改写都让整轮提示词缓存失效。
  if (!manual && useSettings.getState().sessionCard && cardOf(sessionId)) {
    return
  }
  // 触发条件二选一：未压缩轮次攒够一批（宿主可下发调参），或上下文占用达到设置的比例
  const turnThreshold = numberOption('memoryTriggerTurns', TRIGGER_TURNS)
  const ratioHit = (sessionTokens(messages) / contextLimit()) * 100 >= compressThreshold
  const previous = summaryOf(sessionId)
  const already = previous?.turns ?? 0
  const keep = numberOption('memoryKeepTurns', KEEP_RECENT_TURNS)
  const pending = turnsToCompress(messages, already, keep)
  // 合批：摘要一旦改写，system 就换一份字节，提示词缓存从那里往后全部失效。
  // 所以自动触发要攒够一批：平时整批，占用逼近上限时降到半批（至少 8 轮）。
  // 否则"每轮压 1 轮"会让长会话永远 0 命中——这正是导入长会话后烧钱的那个坑。
  // 手动点「压缩摘要」是用户明确要求，不按批次门槛拦。
  const batch = ratioHit ? Math.max(8, Math.round(turnThreshold / 2)) : turnThreshold
  if (!manual && pending.length < batch) {
    return
  }
  if (pending.length === 0) {
    if (manual) {
      showToast('没有需要压缩的历史')
    }
    return
  }

  setState({ running: [...useMemory.getState().running, sessionId] })
  try {
    const text = buildSummaryText(pending, previous?.text ?? '')
    const record: SummaryRecord = {
      sessionId,
      turns: already + pending.length,
      text,
      updatedAt: Date.now(),
    }
    await saveSummary(record)
    setState({ summaries: { ...useMemory.getState().summaries, [sessionId]: record } })
    // 只提示一次：第一次把历史压成摘要时说明一下；之后每次压缩都提示会把聊天框顶满，
    // 而且它本来就是后台行为（诊断日志与记忆面板里都查得到）。
    if (manual) {
      showToast(`已压缩 ${pending.length} 轮`)
    } else if (!previous) {
      showToast('已把较早的历史压成摘要，原文仍可回看')
    }
  } finally {
    setState({ running: useMemory.getState().running.filter((id) => id !== sessionId) })
  }
}

export const clearSummary = async (sessionId: string): Promise<void> => {
  const next = { ...useMemory.getState().summaries }
  delete next[sessionId]
  setState({ summaries: next })
  await deleteSummary(sessionId)
}
