/**
 * 一轮对话结束的通知点。
 *
 * 上游 store 在回复落定（done / stopped / error）后调用 notifyTurnComplete，
 * 积木用 registerTurnCompleteHandler 订阅；这样记忆、画像这类"事后处理"
 * 不需要中间件、也不需要直接改 store。
 */
export type TurnCompleteHandler = (sessionId: string) => void

const handlers: TurnCompleteHandler[] = []

export const registerTurnCompleteHandler = (handler: TurnCompleteHandler): void => {
  handlers.push(handler)
}

export const notifyTurnComplete = (sessionId: string): void => {
  for (const handler of handlers) {
    try {
      handler(sessionId)
    } catch (error) {
      console.error('[turn complete]', error)
    }
  }
}
