/**
 * 积木间命令注册表。
 *
 * 跨块跳转（比如"设置页里点余额"）不能直接 import 对方积木，
 * 由各自的积木注册一个命令，调用方只认命令名。
 */
export type Command = () => void

const commands = new Map<string, Command>()

export const registerCommand = (name: string, run: Command): void => {
  commands.set(name, run)
}

/** 返回 false 表示没有积木注册这个命令（调用方可降级） */
export const runCommand = (name: string): boolean => {
  const run = commands.get(name)
  if (!run) {
    return false
  }
  try {
    run()
    return true
  } catch (error) {
    console.error(`[command ${name}]`, error)
    return false
  }
}

export const commandNames = (): string[] => [...commands.keys()]
