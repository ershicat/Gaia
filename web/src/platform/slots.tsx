import { Component, type ReactNode } from 'react'
import { isEnabled } from './flags.js'
import type { SlotEntry, SlotMode, SlotName, SlotPayloads, SlotRenderer } from './types.js'

interface Registered {
  id: string
  blockId: string
  order: number
  mode: SlotMode
  render: (payload: unknown) => ReactNode
}

const registry = new Map<SlotName, Registered[]>()

/** 由 compose() 调用；积木不直接注册 */
export const registerSlot = <K extends SlotName>(
  name: K,
  blockId: string,
  entry: SlotEntry<K>
): void => {
  const list = registry.get(name) ?? []
  list.push({
    id: `${blockId}:${entry.id}`,
    blockId,
    order: entry.order ?? 0,
    mode: entry.mode ?? 'append',
    render: entry.render as SlotRenderer<K> as (payload: unknown) => ReactNode,
  })
  registry.set(name, list)
}

/** 当前某个槽位里有哪些渲染项（按 order 排序），供排查用 */
export const slotSnapshot = (name: SlotName): string[] =>
  [...(registry.get(name) ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((entry) => `${entry.id}(${entry.mode})`)

/** 单个积木渲染出错只让该槽位空白，不影响页面其余部分 */
class SlotBoundary extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  override state: { failed: boolean } = { failed: false }

  override componentDidCatch(error: unknown): void {
    console.error(`[slot ${this.props.id}]`, error)
    this.setState({ failed: true })
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * 页面锚点。fallback 是上游原本要渲染的内容：
 * - 没有积木注册：渲染 fallback
 * - 有 replace：fallback 不渲染，由积木接管整个槽位
 * - before / after / append：fallback 两侧追加
 */
export const Slot = <K extends SlotName>({
  name,
  payload,
  fallback,
}: {
  name: K
  payload: SlotPayloads[K]
  fallback?: ReactNode
}): ReactNode => {
  const list = [...(registry.get(name) ?? [])]
    .filter((entry) => isEnabled(entry.blockId))
    .sort((a, b) => a.order - b.order)
  if (list.length === 0) {
    return fallback ?? null
  }
  const before = list.filter((entry) => entry.mode === 'before')
  const replacing = list.filter((entry) => entry.mode === 'replace')
  const after = list.filter(
    (entry) => entry.mode !== 'before' && entry.mode !== 'replace'
  )
  const withPayload = (entries: Registered[]): ReactNode =>
    entries.map((entry) => (
      <SlotBoundary key={entry.id} id={entry.id}>
        {entry.render(payload)}
      </SlotBoundary>
    ))
  if (replacing.length > 0) {
    return (
      <>
        {withPayload(before)}
        {withPayload(replacing)}
        {withPayload(after)}
      </>
    )
  }
  return (
    <>
      {withPayload(before)}
      {fallback ?? null}
      {withPayload(after)}
    </>
  )
}
