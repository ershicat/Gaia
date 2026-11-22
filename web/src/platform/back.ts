/**
 * 分级返回栈。
 *
 * 安卓返回键 → 原生 onBackPressed → 调 window.__gaiaBack()
 *   · 返回 true ：页面自己消费了（关弹层 / 回上一级 / 收抽屉）
 *   · 返回 false：没人处理，原生才退到桌面
 *
 * 每个积木注册自己的返回处理，priority 越大越先问（弹层 > 页面 > 抽屉）。
 */
export type BackHandler = () => boolean

interface Entry {
  name: string
  priority: number
  handle: BackHandler
}

const entries: Entry[] = []

export const registerBackHandler = (name: string, priority: number, handle: BackHandler): void => {
  entries.push({ name, priority, handle })
}

/** 从高优先级到低优先级依次询问；任何一个返回 true 即停止 */
export const handleBack = (): boolean => {
  for (const entry of [...entries].sort((a, b) => b.priority - a.priority)) {
    try {
      if (entry.handle()) {
        return true
      }
    } catch (error) {
      console.error(`[back ${entry.name}]`, error)
    }
  }
  return false
}

export const backHandlerNames = (): string[] =>
  [...entries].sort((a, b) => b.priority - a.priority).map((entry) => entry.name)
