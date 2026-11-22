/**
 * 设置页接管点。
 *
 * 上游的 SettingsDialog 是网页弹窗；本应用要的是整屏竖排设置页。
 * 设置积木启动时注册一个 opener，上游任何地方调 openSettings() 都会被转到我们的页面，
 * 弹窗组件本身则直接不渲染——不会出现两套设置。
 */
export type SettingsSection = 'general' | 'data'
export type SettingsOpener = (section?: SettingsSection) => void

let opener: SettingsOpener | null = null

export const registerSettingsOpener = (fn: SettingsOpener): void => {
  opener = fn
}

export const hasSettingsOpener = (): boolean => opener !== null

/** 上游调用入口：有接管方就转过去，返回 true 表示已处理 */
export const requestSettings = (section?: SettingsSection): boolean => {
  if (!opener) {
    return false
  }
  opener(section)
  return true
}
