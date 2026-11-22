import type { ChatModel } from './types.js'

export type ModelOption = {
  id: ChatModel
  /** 选择器里显示的短名 */
  label: string
  /** 一行说明 */
  desc: string
}

/**
 * 可选模型表。
 * 以后上新模型（例如 V4.1 Pro）只需要在这个数组里加一项，
 * 设置页的模型列表会自动跟着出现，不要把选项写死到界面里。
 */
export const MODELS: ModelOption[] = [
  { id: 'deepseek-flash', label: 'V4.1 Flash', desc: '响应快' },
  { id: 'deepseek-v4-pro', label: 'V4 Pro', desc: '推理更强' },
]

export const DEFAULT_MODEL: ChatModel = 'deepseek-flash'

export const modelLabel = (id: ChatModel): string =>
  MODELS.find((item) => item.id === id)?.label ?? id
