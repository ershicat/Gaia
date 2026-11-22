/**
 * 宿主契约（L1 积木对外的唯一接口形状）。
 * 原生壳负责实现，web 侧只读这里；改契约要同时改原生与这里。
 */

export interface HostRoleDTO {
  id: string
  name: string
  avatar: string | null
}

export interface HostConfig {
  /** 接口地址；null 表示用构建期默认值 */
  apiBase: string | null
  /** 只表示“有没有配 Key”，值不出原生 */
  apiKey: string | null
  roles: HostRoleDTO[]
  activeRole: string
  user: { name: string; avatar: string | null }
  /** 积木开关，缺省全部开启 */
  flags: Record<string, boolean>
  /** 记忆压缩阈值（轮）；缺省用内置默认 30，调试时可调小 */
  memoryTriggerTurns?: number
  /** 压缩时保留最近多少轮原文；缺省 8 */
  memoryKeepTurns?: number
  appVersion: string
}

/** 命令桥：web → 原生；一切方法可选，缺省时静默降级 */
export interface HostBridge {
  openSettings?: () => void
  openRolePicker?: () => void
  openRoleEdit?: (roleId: string) => void
  openRoleManager?: () => void
  openUserProfile?: () => void
  pickAttach?: (kind: 'camera' | 'gallery' | 'file') => void
  /** 把字节落盘到手机（base64），用于导出历史 ZIP */
  saveFile?: (name: string, base64: string) => void
  /** 落盘后立刻拉起系统转发面板（诊断日志发给开发者用） */
  shareFile?: (name: string, base64: string) => void
  speak?: (text: string) => void
  share?: (text: string) => void
  navigate?: (to: 'balance' | 'memory') => void
  log?: (message: string) => void
}

/** 事件回调：原生 → web（由本积木挂到全局对象上） */
export interface HostEventSink {
  rolesChanged?: () => void
  userChanged?: () => void
  prefsChanged?: () => void
  importProgress?: (payload: { done: number; total: number; phase: string }) => void
}

export interface HostWindow {
  __GAIA_CONFIG__?: HostConfig
  __GAIA_BRIDGE__?: HostBridge
  __GAIA_EVENTS__?: HostEventSink
}
