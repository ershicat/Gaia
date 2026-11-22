import {
  defineBlock,
  emit,
  handleBack,
  registerFileSink,
  registerFileSharer,
  setApiOrigin,
  setAppVersion,
  setFlags,
  setLogger,
  setNumberOption,
  setSafetyCheck,
  setUserName,
  setUserAvatar,
} from '../../platform/index.js'
import { setApiKey, useSettings } from '../../services/settings.js'
import type { HostBridge, HostConfig, HostWindow } from './contract.js'

const hostWindow = (): HostWindow => window as unknown as HostWindow

/** 没有壳（浏览器直开）时的默认值：接口走构建期默认地址，其余全部降级为空 */
const FALLBACK: HostConfig = {
  apiBase: null,
  apiKey: null,
  roles: [],
  activeRole: '',
  user: { name: '', avatar: null },
  flags: {},
  appVersion: 'dev',
}
let config: HostConfig = FALLBACK

export const hostConfig = (): HostConfig => config

export const bridge = (): HostBridge => hostWindow().__GAIA_BRIDGE__ ?? {}

export const hasApiKey = (): boolean => Boolean(config.apiKey)

const applyConfig = (next: HostConfig): void => {
  config = { ...FALLBACK, ...next }
  setApiOrigin(config.apiBase)
  setAppVersion(config.appVersion)
  setUserName(config.user.name)
  setUserAvatar(config.user.avatar)
  if (next.flags) {
    setFlags(next.flags)
  }
  if (typeof next.memoryTriggerTurns === 'number') {
    setNumberOption('memoryTriggerTurns', next.memoryTriggerTurns)
  }
  if (typeof next.memoryKeepTurns === 'number') {
    setNumberOption('memoryKeepTurns', next.memoryKeepTurns)
  }
}

/**
 * 宿主积木：把原生下发的配置与事件接到平台层。
 * 它不渲染任何界面，也不持有业务状态。
 */
export const host = defineBlock({
  id: 'host',
  order: -1000,
  flags: { host: true },
  init: () => {
    applyConfig(hostWindow().__GAIA_CONFIG__ ?? FALLBACK)
    setLogger((message) => bridge().log?.(message))
    // 安卓返回键：交给页面分级处理，没人处理才让原生退到桌面
    const hostWindowRef = hostWindow()
    ;(hostWindowRef as unknown as { __gaiaBack?: () => boolean }).__gaiaBack = () => handleBack()
    // 落盘能力：导出 ZIP 时由设置积木调用
    registerFileSink((name, base64) => {
      bridge().saveFile?.(name, base64)
    })
    // 落盘后直接拉起转发（诊断日志发给开发者）
    registerFileSharer((name, base64) => {
      bridge().shareFile?.(name, base64)
    })
    // 本应用不发送风控字段；这是全局策略，由装配层决定
    setSafetyCheck(false)
    // 原生已经存了 Key 时，把它登记到上游设置里（用户只需在任意一端配置一次）
    const hostKey = config.apiKey
    if (hostKey && !useSettings.getState().apiKey) {
      setApiKey(hostKey)
    }
    const sink = hostWindow().__GAIA_EVENTS__
    if (sink) {
      sink.rolesChanged = () => {
        applyConfig(hostWindow().__GAIA_CONFIG__ ?? config)
        emit('host:rolesChanged')
      }
      sink.userChanged = () => {
        applyConfig(hostWindow().__GAIA_CONFIG__ ?? config)
        emit('host:userChanged')
      }
      sink.prefsChanged = () => {
        applyConfig(hostWindow().__GAIA_CONFIG__ ?? config)
        emit('host:prefsChanged')
      }
      sink.importProgress = (payload) => emit('host:importProgress', payload)
    }
  },
})

/** 供其他积木在运行期覆盖配置（例如角色切换后原生重下发） */
export const refreshHostConfig = (): void => {
  applyConfig(hostWindow().__GAIA_CONFIG__ ?? config)
}
