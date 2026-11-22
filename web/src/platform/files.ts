/**
 * 落盘能力（L0 契约）。
 *
 * 导出 ZIP 需要把字节写到手机里；具体实现由 host 积木注册，
 * 业务积木只调 saveFile()，互相不 import。
 */
export type FileSink = (name: string, base64: string) => void

let sink: FileSink | null = null
let sharer: FileSink | null = null

export const registerFileSink = (fn: FileSink): void => {
  sink = fn
}

/** 返回 false 表示没有可用的落盘通道（浏览器里），调用方自行降级 */
export const saveFile = (name: string, base64: string): boolean => {
  if (!sink) {
    return false
  }
  sink(name, base64)
  return true
}

export const hasFileSink = (): boolean => sink !== null

/**
 * 落盘并转发：宿主先写文件，再拉起系统转发面板（选 QQ 就能直接发出去）。
 * 没有这个通道时调用方回落到 saveFile()。
 */
export const registerFileSharer = (fn: FileSink): void => {
  sharer = fn
}

export const shareFile = (name: string, base64: string): boolean => {
  if (!sharer) {
    return false
  }
  sharer(name, base64)
  return true
}

export const hasFileSharer = (): boolean => sharer !== null
