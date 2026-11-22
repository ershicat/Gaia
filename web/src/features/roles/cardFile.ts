import { hasFileSink, saveFile } from '../../platform/index.js'
import type { Role } from './contract.js'

/**
 * 角色卡导入导出（SillyTavern Character Card V2 兼容）。
 *
 * 导出：Gaia 的 Role → chara_card_v2。systemPrompt 放 description（ST 的永久段），
 *       greeting 放 first_mes；profile / temperature / skills 打包进 extensions.gaia。
 * 导入：V2 / V1 / Gaia 自己导出的文件都能吃；不认识的字段忽略，不编造。
 */
export interface RoleCardExtensions {
  gaia?: {
    profile?: string
    temperature?: number | null
    skills?: string[]
    /** 可选：随卡带来的会话档案卡（结构见 memory/card.ts 的 SessionCard，这里只透传） */
    sessionCard?: unknown
    /** 可选：随卡带来的记忆文件（path / title / description / aliases / content） */
    memoryFiles?: unknown[]
  }
}

/** 角色卡里夹带的附加档案；缺省时为空，导入流程照旧 */
export interface RoleCardExtras {
  sessionCard: Record<string, unknown> | null
  memoryFiles: unknown[]
}

export interface RoleCardBundle {
  role: Role
  extras: RoleCardExtras
}

const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** 手机走原生落盘（下载/Gaia），浏览器退回 Blob 下载 */
export const downloadJson = (name: string, text: string): void => {
  if (hasFileSink() && saveFile(name, toBase64(text))) {
    return
  }
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export const safeFileName = (value: string): string =>
  value.replace(/[\\/:*?"<>|]/g, '_').trim() || '角色'

export const serializeRoleCard = (role: Role): string => {
  const payload = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: role.name,
      description: role.systemPrompt,
      personality: '',
      scenario: '',
      first_mes: role.greeting,
      mes_example: '',
      creator_notes: '导出自 Gaia（角色卡）。description 即该角色的系统提示词。',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      character_book: null,
      tags: ['gaia'],
      creator: '',
      character_version: '1.0',
      extensions: {
        gaia: {
          profile: role.profile,
          temperature: role.temperature,
          skills: role.skills,
        },
      } satisfies RoleCardExtensions,
    },
  }
  return JSON.stringify(payload, null, 2)
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const asStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean)
    : []

const asTemperature = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return Math.min(2, Math.max(0, value))
}

interface CardFields {
  name: string
  description: string
  personality: string
  scenario: string
  firstMes: string
  systemPrompt: string
  extensions: RoleCardExtensions
}

const readFields = (value: Record<string, unknown>): CardFields => {
  const data =
    value.data && typeof value.data === 'object'
      ? (value.data as Record<string, unknown>)
      : value
  const extensions =
    data.extensions && typeof data.extensions === 'object'
      ? (data.extensions as RoleCardExtensions)
      : value.extensions && typeof value.extensions === 'object'
        ? (value.extensions as RoleCardExtensions)
        : {}
  return {
    name: asString(data.name),
    description: asString(data.description),
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    firstMes: asString(data.first_mes),
    systemPrompt: asString(data.system_prompt),
    extensions,
  }
}

/** 解析一张角色卡；解析不了或没有名字返回 null */
export const parseRoleCard = (raw: string): Role | null => parseRoleCardBundle(raw)?.role ?? null

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const asObjectList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value.filter((item) => item !== null && typeof item === 'object') : []

/**
 * 解析一张角色卡，连同它夹带的附加档案：
 *   extensions.gaia.sessionCard    → 会话档案卡（该角色的新会话首次发送前写入）
 *   extensions.gaia.memoryFiles    → 记忆文件（全局，按 path 去重，已存在则跳过）
 * 两个字段都是可选的，普通 SillyTavern 角色卡照样能导入。
 */
export const parseRoleCardBundle = (raw: string): RoleCardBundle | null => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const fields = readFields(value as Record<string, unknown>)
  const name = fields.name || asString((value as Record<string, unknown>).name)
  if (!name) {
    return null
  }
  // 优先用系统提示词；没有就把 ST 的永久段按顺序拼起来（描述 → 性格 → 场景）
  const parts = [
    fields.systemPrompt || fields.description,
    fields.personality ? `# 性格\n${fields.personality}` : '',
    fields.scenario ? `# 场景\n${fields.scenario}` : '',
  ].filter(Boolean)
  const now = Date.now()
  const gaia = fields.extensions.gaia
  return {
    role: {
      id: `role-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      avatar: null,
      systemPrompt: parts.join('\n\n'),
      temperature: asTemperature(gaia?.temperature),
      greeting: fields.firstMes,
      skills: asStringList(gaia?.skills),
      profile: gaia?.profile ?? '',
      background: null,
      backgroundOpacity: 1,
      builtin: false,
      createdAt: now,
      updatedAt: now,
    },
    extras: {
      sessionCard: asRecord(gaia?.sessionCard),
      memoryFiles: asObjectList(gaia?.memoryFiles),
    },
  }
}
