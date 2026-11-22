import { create } from 'zustand'
import { appVersion } from '../../platform/index.js'

/** 记录「哪个版本已经看过更新公告」：装新版本后自动再弹一次 */
const SEEN_KEY = 'gaia:update.seen'

const readSeen = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(SEEN_KEY) === appVersion()
  } catch {
    return false
  }
}

const writeSeen = (): void => {
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, appVersion())
  } catch {
    // 存不了就每次开都显示，不影响使用
  }
}

export const useIntro = create<{ open: boolean }>(() => ({ open: false }))

/** 由积木 init 调用：此时宿主已经写入版本号，才能按版本判断看没看过 */
export const syncIntro = (): void => {
  useIntro.setState({ open: !readSeen() })
}

export const closeIntro = (): void => {
  writeSeen()
  useIntro.setState({ open: false })
}

/** 手动再打开一次（微信壳「我」页的更新公告入口用） */
export const openIntro = (): void => {
  useIntro.setState({ open: true })
}
