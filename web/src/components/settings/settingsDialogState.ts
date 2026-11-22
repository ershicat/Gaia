import { create } from 'zustand'
import { diagRecord, requestSettings } from '../../platform/index.js'
import { useSettings } from '../../services/settings.js'

/** 设置弹窗的分组：通用设置 / 数据管理 */
export type SettingsSection = 'general' | 'data'

/** 设置弹窗：侧边栏底部、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

/** 有接管方（整屏设置页）时转到那里，否则回落到上游自己的弹窗 */
export const openSettings = (section: SettingsSection) => {
  diagRecord('info', 'settings', `openSettings(${section})`)
  if (requestSettings(section)) {
    return
  }
  useSettingsDialog.setState({ open: true, section })
}

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 没有 API Key 时打开设置并选中 API Key 所在的「数据管理」，返回是否已有 Key */
export const ensureApiKey = () => {
  if (useSettings.getState().apiKey) {
    return true
  }
  // 这条日志能证明「跳转数据管理」是缺 Key 触发的，而不是误触
  diagRecord('warn', 'apiKey', '没有 API Key，打开设置·数据管理')
  openSettings('data')
  return false
}
