import { create } from 'zustand'
import { showToast } from '../../components/base/toastState.js'
import type { CastMember } from './contract.js'
import { deleteCastMember, loadCast, saveCastMember } from './storage.js'

/** 配角库切片：状态只在本积木内读，别的块走命令/槽位 */
interface CastState {
  loaded: boolean
  members: CastMember[]
  panelOpen: boolean
}

export const useCast = create<CastState>(() => ({ loaded: false, members: [], panelOpen: false }))

const setState = useCast.setState

export const initCast = async (): Promise<void> => {
  try {
    const members = await loadCast()
    setState({ loaded: true, members })
  } catch (error) {
    console.error('[cast] init failed', error)
    setState({ loaded: true })
  }
}

/** 某会话的配角，按 order / 更新时间稳定排序（渲染顺序可预期） */
export const castOf = (sessionId: string | null): CastMember[] => {
  if (!sessionId) {
    return []
  }
  return useCast
    .getState()
    .members.filter((member) => member.sessionId === sessionId)
    .sort((a, b) => a.order - b.order || a.updatedAt - b.updatedAt)
}

export const createCastMember = (sessionId: string): CastMember => ({
  id: `cast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  sessionId,
  name: '新配角',
  aliases: [],
  identity: '',
  speech: '',
  address: '',
  relation: '',
  notes: '',
  always: false,
  enabled: true,
  order: 0,
  updatedAt: Date.now(),
})

export const upsertCast = async (member: CastMember): Promise<void> => {
  const stamped: CastMember = { ...member, updatedAt: Date.now() }
  await saveCastMember(stamped)
  const members = useCast.getState().members
  const exists = members.some((item) => item.id === stamped.id)
  setState({
    members: exists
      ? members.map((item) => (item.id === stamped.id ? stamped : item))
      : [...members, stamped],
  })
}

export const removeCast = async (id: string): Promise<void> => {
  await deleteCastMember(id)
  setState({ members: useCast.getState().members.filter((item) => item.id !== id) })
}

/**
 * 一次性导入：按「名字」去重，同名的覆盖字段、不新增。
 * 返回写入条数，供提示文案用。
 */
export const importCast = async (
  sessionId: string,
  incoming: CastMember[]
): Promise<number> => {
  const current = [...useCast.getState().members]
  let written = 0
  for (const raw of incoming) {
    const name = raw.name?.trim()
    if (!name) {
      continue
    }
    const existing = current.find(
      (item) => item.sessionId === sessionId && item.name.trim() === name
    )
    const next: CastMember = {
      ...(existing ?? createCastMember(sessionId)),
      ...raw,
      id: existing?.id ?? `cast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      name,
      updatedAt: Date.now(),
    }
    await saveCastMember(next)
    const index = current.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      current[index] = next
    } else {
      current.push(next)
    }
    written += 1
  }
  setState({ members: current })
  return written
}

export const openCastPanel = (): void => setState({ panelOpen: true })

export const closeCastPanel = (): void => setState({ panelOpen: false })

export const castCountOf = (sessionId: string | null): number => castOf(sessionId).length

/** 给界面用的轻提示（与记忆面板保持同一套 toast） */
export const notifyCast = (message: string): void => showToast(message)
