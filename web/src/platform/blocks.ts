import { setFlags } from './flags.js'
import { registerSessionFilter } from './filters.js'
import { registerMiddleware } from './pipeline.js'
import { registerSlot } from './slots.js'
import type { Block, SlotEntry, SlotName } from './types.js'

const composed: Block[] = []

/** 定义一个积木；只做类型收敛，不产生副作用 */
export const defineBlock = (block: Block): Block => block

/**
 * 唯一装配入口：按 order 注册开关、槽位、中间件，最后执行 init。
 * 全应用只在 app/compose.ts 调用一次，且必须早于首次渲染。
 */
export const compose = (blocks: Block[]): void => {
  composed.length = 0
  for (const block of [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    composed.push(block)
    if (block.flags) {
      setFlags(block.flags)
    }
    const slots = (block.slots ?? {}) as { [K in SlotName]?: SlotEntry<K>[] }
    for (const name of Object.keys(slots) as SlotName[]) {
      const list = slots[name] as SlotEntry<SlotName>[] | undefined
      for (const entry of list ?? []) {
        registerSlot(name, block.id, entry)
      }
    }
    for (const mw of block.middleware ?? []) {
      registerMiddleware(block.id, mw.fn, mw.order ?? 0)
    }
    for (const filter of block.sessionFilters ?? []) {
      registerSessionFilter(filter)
    }
    block.init?.()
  }
}

/** 已装配的积木 id，按装配顺序 */
export const blockIds = (): string[] => composed.map((block) => block.id)
