import { create } from 'zustand'

/**
 * 用户身份（昵称 / 头像）的可订阅状态。
 *
 * 之前只在平台里放普通变量，改完昵称后已经渲染的消息不会重绘；
 * 这里用最小的 zustand slice 承载，谁读谁订阅。
 */
interface UserIdentity {
  name: string
  avatar: string | null
}

export const useUser = create<UserIdentity>(() => ({ name: '', avatar: null }))

export const setUserName = (name: string): void => {
  useUser.setState({ name })
}

export const setUserAvatar = (avatar: string | null): void => {
  useUser.setState({ avatar })
}

export const userName = (): string => useUser.getState().name

export const userAvatar = (): string | null => useUser.getState().avatar
