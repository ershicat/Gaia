import { create } from 'zustand'
import { emit, setActiveRoleId } from '../../platform/index.js'
import type { SessionAttribution, SessionSource } from '../../platform/index.js'
import { BUILTIN_GAIA, DEFAULT_ROLE_ID, LEGACY_BUILTIN_PROMPT, type Role } from './contract.js'
import {
  deleteRole,
  loadActiveRoleId,
  loadRoles,
  saveActiveRoleId,
  saveRole,
} from './storage.js'

/** 角色域自己的状态切片（命名空间隔离，别的积木不读它） */
export type RolesPage = 'pick' | 'manage' | 'edit' | null

interface RolesState {
  loaded: boolean
  roles: Role[]
  activeId: string
  page: RolesPage
  editingId: string | null
}

export const useRoles = create<RolesState>(() => ({
  loaded: false,
  roles: [BUILTIN_GAIA],
  activeId: DEFAULT_ROLE_ID,
  page: null,
  editingId: null,
}))

const setState = useRoles.setState

/** 老数据没有背景字段：读出来补齐默认值，界面上就不用到处判空 */
const normalizeRole = (role: Role): Role => ({
  ...role,
  background: role.background ?? null,
  backgroundOpacity:
    typeof role.backgroundOpacity === 'number' ? role.backgroundOpacity : 1,
})

/** 首次载入：补齐内置角色、修掉指向已删除角色的 activeId、升级旧版内置提示词 */
export const initRoles = async (): Promise<void> => {
  const stored = (await loadRoles()).map(normalizeRole)
  const builtin = stored.find((role) => role.id === DEFAULT_ROLE_ID)
  if (!builtin) {
    const now = Date.now()
    const seeded: Role = { ...BUILTIN_GAIA, createdAt: now, updatedAt: now }
    await saveRole(seeded)
    stored.unshift(seeded)
  } else if (builtin.systemPrompt === LEGACY_BUILTIN_PROMPT) {
    // 老装机里存的是上一版的内置提示词：整体换成旧版完整预设（提示词 + 两个技能）
    const upgraded: Role = {
      ...builtin,
      systemPrompt: BUILTIN_GAIA.systemPrompt,
      skills: BUILTIN_GAIA.skills,
      updatedAt: Date.now(),
    }
    await saveRole(upgraded)
    stored[stored.indexOf(builtin)] = upgraded
  }
  const storedActive = await loadActiveRoleId()
  const active = stored.some((role) => role.id === storedActive)
    ? (storedActive as string)
    : DEFAULT_ROLE_ID
  if (active !== storedActive) {
    await saveActiveRoleId(active)
  }
  // 同步给平台：新建会话要用它打戳（会话归属 + 侧栏徽标 + 过滤都依赖它）
  setActiveRoleId(active)
  setState({ loaded: true, roles: stored, activeId: active })
}

export const activeRole = (): Role =>
  useRoles.getState().roles.find((role) => role.id === useRoles.getState().activeId) ??
  BUILTIN_GAIA

export const roleById = (id: string | null): Role | undefined =>
  id === null ? undefined : useRoles.getState().roles.find((role) => role.id === id)

export const setActiveRole = async (id: string): Promise<void> => {
  const changed = useRoles.getState().activeId !== id
  await saveActiveRoleId(id)
  setActiveRoleId(id)
  setState({ activeId: id })
  if (changed) {
    // 角色切换 = 换一套会话空间：装配层收到后回到首页，避免停在上一个角色的会话里
    emit('roles:activeChanged', id)
  }
}

/**
 * 会话归属规则（由 services 在新建会话 / 导入历史时调用）：
 * - 你在用的角色新建的会话归当前角色；
 * - 导入的历史会话一律归系统自带角色，并且不注入人格提示词。
 */
export const roleAttribution = (source: SessionSource): SessionAttribution =>
  source === 'import'
    ? { roleIds: [DEFAULT_ROLE_ID], noPersona: true }
    : { roleIds: [useRoles.getState().activeId] }

export const openPage = (page: RolesPage): void => setState({ page })

export const openEditor = (id: string | null): void =>
  setState({ page: 'edit', editingId: id })

export const closePage = (): void => setState({ page: null, editingId: null })

export const upsertRole = async (role: Role): Promise<void> => {
  const stamped: Role = { ...role, updatedAt: Date.now() }
  await saveRole(stamped)
  const roles = useRoles.getState().roles
  const exists = roles.some((item) => item.id === stamped.id)
  setState({
    roles: exists
      ? roles.map((item) => (item.id === stamped.id ? stamped : item))
      : [...roles, stamped],
  })
}

export const removeRole = async (id: string): Promise<boolean> => {
  const role = roleById(id)
  if (!role || role.builtin) {
    return false
  }
  await deleteRole(id)
  const roles = useRoles.getState().roles.filter((item) => item.id !== id)
  const activeId = useRoles.getState().activeId === id ? DEFAULT_ROLE_ID : useRoles.getState().activeId
  if (activeId !== useRoles.getState().activeId) {
    await saveActiveRoleId(activeId)
  }
  setState({ roles, activeId })
  return true
}

export const createRole = (): Role => {
  const now = Date.now()
  return {
    id: `role-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: '新角色',
    avatar: null,
    systemPrompt: '',
    temperature: null,
    greeting: '',
    skills: [],
    profile: '',
    background: null,
    backgroundOpacity: 1,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }
}
