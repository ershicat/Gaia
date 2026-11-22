import { hasFileSink, saveFile } from '../../platform/index.js'
import type { CastMember } from './contract.js'

/**
 * 配角库文件格式（可跨会话搬运）：
 *   { schema: 'gaia.cast', version: 1, sessionId?, title?, exportedAt, members: [...] }
 * 导入时 sessionId 会被忽略 —— 一律落到当前会话（配角是会话级的）。
 */
export const CAST_SCHEMA = 'gaia.cast'

export interface CastFile {
  schema: typeof CAST_SCHEMA
  version: 1
  sessionId?: string
  title?: string
  exportedAt: string
  members: CastMember[]
}

const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** 有原生落盘通道就用它（手机会写到「下载/Gaia」）；浏览器里退回 Blob 下载 */
export const downloadText = (name: string, text: string, mime = 'application/json'): void => {
  if (hasFileSink() && saveFile(name, toBase64(text))) {
    return
  }
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export const serializeCastFile = (
  members: CastMember[],
  meta: { sessionId: string; title: string }
): string => {
  const payload: CastFile = {
    schema: CAST_SCHEMA,
    version: 1,
    sessionId: meta.sessionId,
    title: meta.title,
    exportedAt: new Date().toISOString(),
    members: members.map((member) => ({
      ...member,
      // 导出不保留目标会话 id：导入方自己决定落到哪条会话
      sessionId: '',
    })),
  }
  return JSON.stringify(payload, null, 2)
}

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const asList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : typeof value === 'string'
      ? value
          .split(/[,，、\s]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : []

/** 解析导入文件：接受 {members:[...]} 或直接一维数组；解析不了返回 null */
export const parseCastFile = (raw: string): CastMember[] | null => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { members?: unknown }).members)
      ? (value as { members: unknown[] }).members
      : null
  if (!rows) {
    return null
  }
  const members: CastMember[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const item = row as Record<string, unknown>
    const name = asString(item.name).trim()
    if (!name) {
      continue
    }
    members.push({
      id: asString(item.id) || `cast-import-${members.length}`,
      sessionId: '',
      name,
      aliases: asList(item.aliases ?? item.keys),
      identity: asString(item.identity),
      speech: asString(item.speech),
      address: asString(item.address),
      relation: asString(item.relation),
      notes: asString(item.notes),
      always: Boolean(item.always),
      enabled: item.enabled !== false,
      order: typeof item.order === 'number' ? item.order : 0,
      updatedAt: Date.now(),
    })
  }
  return members
}
