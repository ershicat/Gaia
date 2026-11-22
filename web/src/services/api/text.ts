import { streamMessage } from './client.js'
import type { ChatModel } from './types.js'

/** 后台任务用的单轮文本生成：不展示流式过程，超时直接放弃 */
export const generateText = async (
  apiKey: string,
  model: ChatModel,
  system: string,
  prompt: string,
  timeoutMs = 60_000
): Promise<string> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let text = ''
    const events = streamMessage(
      apiKey,
      {
        model,
        system,
        messages: [{ role: 'user', content: prompt }],
        thinking: { type: 'disabled' },
        tools: [],
      },
      controller.signal
    )
    for await (const event of events) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text
      }
      if (event.type === 'message_stop') {
        break
      }
    }
    return text.trim()
  } finally {
    clearTimeout(timer)
  }
}
