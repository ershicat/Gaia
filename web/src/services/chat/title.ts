import type { ChatModel } from '../api/types.js'
import { generateText } from '../api/text.js'

/** 默认标题提示词：`{content}` 会被替换成最近的对话内容 */
export const DEFAULT_TITLE_PROMPT = `把 <content> 里的对话总结成一个短标题：
1. 标题语言与用户主语言一致
2. 不加标点、不加引号、不要解释
3. 直接输出标题，不超过 10 个字

<content>
{content}
</content>`

const clean = (raw: string): string =>
  raw
    .replace(/^["'“”「」\s]+/u, '')
    .replace(/["'“”「」\s]+$/u, '')
    .replace(/\s+/gu, ' ')
    .slice(0, 30)

export const buildTitlePrompt = (template: string, content: string): string =>
  (template.trim() || DEFAULT_TITLE_PROMPT).replaceAll('{content}', content)

/**
 * 用当前模型生成会话标题：只发一条 user 消息、不展示流式过程。
 * 失败（网络/超时/格式）返回空串，调用方保持原标题不动。
 */
export const generateTitle = async (
  apiKey: string,
  model: ChatModel,
  template: string,
  content: string
): Promise<string> => {
  try {
    return clean(await generateText(apiKey, model, '', buildTitlePrompt(template, content), 30_000))
  } catch {
    return ''
  }
}
