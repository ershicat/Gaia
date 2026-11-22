import { chat, hasChatBridge, type RequestMiddleware } from '../../platform/index.js'
import type { Message } from '../../services/chat/types.js'
import { CAST_SCAN_MESSAGES, castMatches, renderCastBlock } from './contract.js'
import { castOf } from './store.js'

/** 与 memory/budget 同口径：用户消息取 content，助手消息取 text 块 */
const textOf = (message: Message): string =>
  message.role === 'user'
    ? message.content
    : message.blocks
        .map((block) => (block.type === 'text' ? block.text : ''))
        .filter(Boolean)
        .join('\n')

/**
 * 配角中间件：只做一件事 —— 把「本轮出场的那几个配角」贴到提问前的附注里。
 *
 * 为什么不去 system：配角会随剧情进退场，写进 system 会让每轮提示词从第一个字节
 * 起就失配（缓存全废）；也不并进历史，免得历史被改写。tailNotes 本来就是每轮变的段。
 *
 * 命中规则：常驻（always）无条件带；其余按名字/别名在「最近 6 条消息 + 本轮提问」里
 * 做大小写无关的子串命中（中文两字别名也能中）。
 */
export const castMiddleware: RequestMiddleware = (ctx) => {
  if (!hasChatBridge()) {
    return
  }
  const members = castOf(ctx.sessionId).filter((member) => member.enabled)
  if (members.length === 0) {
    return
  }
  const recent = chat()
    .getMessages(ctx.sessionId)
    .slice(-CAST_SCAN_MESSAGES)
  const scan = [ctx.question, ...recent.map(textOf)].join('\n')
  if (!scan.trim()) {
    return
  }
  const matched = members.filter((member) => member.always || castMatches(member, scan))
  if (matched.length === 0) {
    return
  }
  return { ...ctx, tailNotes: [...ctx.tailNotes, renderCastBlock(matched)] }
}
