/**
 * 发送前的异步准备点。
 *
 * 上游 store 在发出请求之前 await runBeforeReply，积木可以在这里做一次性的、
 * 需要调用模型或读写 IndexedDB 的准备工作（例如为长会话建立档案卡）。
 * 与 memory 的中间件（同步、只读）分开：这里允许慢，允许失败，失败只记日志不拦发送。
 */
export type BeforeReplyHandler = (sessionId: string) => Promise<void> | void

const handlers: BeforeReplyHandler[] = []

export const registerBeforeReplyHandler = (handler: BeforeReplyHandler): void => {
  handlers.push(handler)
}

export const runBeforeReply = async (sessionId: string): Promise<void> => {
  for (const handler of handlers) {
    try {
      await handler(sessionId)
    } catch (error) {
      console.error('[before reply]', error)
    }
  }
}
