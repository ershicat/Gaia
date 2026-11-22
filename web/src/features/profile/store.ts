import { create } from 'zustand'
import { setUserAvatar, setUserName } from '../../platform/index.js'

const NAME_KEY = 'gaia:user-name'
const AVATAR_KEY = 'gaia:user-avatar'

interface UserProfileState {
  name: string
  avatar: string | null
  editing: boolean
}

const read = (key: string): string => globalThis.localStorage?.getItem(key) ?? ''

export const useProfile = create<UserProfileState>(() => ({
  name: read(NAME_KEY),
  avatar: read(AVATAR_KEY) || null,
  editing: false,
}))

const setState = useProfile.setState

/** 把本地保存的用户资料同步给平台（消息头像、{{user}} 变量都读它） */
export const applyProfile = (): void => {
  const { name, avatar } = useProfile.getState()
  setUserName(name)
  setUserAvatar(avatar)
}

export const openProfileEditor = (): void => setState({ editing: true })
export const closeProfileEditor = (): void => setState({ editing: false })

export const saveProfile = (name: string, avatar: string | null): void => {
  const trimmed = name.trim()
  if (trimmed) {
    globalThis.localStorage?.setItem(NAME_KEY, trimmed)
  } else {
    globalThis.localStorage?.removeItem(NAME_KEY)
  }
  if (avatar) {
    globalThis.localStorage?.setItem(AVATAR_KEY, avatar)
  } else {
    globalThis.localStorage?.removeItem(AVATAR_KEY)
  }
  setState({ name: trimmed, avatar, editing: false })
  applyProfile()
}
