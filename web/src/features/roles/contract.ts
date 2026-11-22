import { GAIA_SYSTEM_PROMPT, SKILL_CHARACTER_CARD, SKILL_SYSTEM_PROMPT } from './presets.js'

/** 角色（= 助手人格）：一人格一套提示词 + 温度 + 技能 + 用户画像 */
export interface Role {
  id: string
  name: string
  /** data URL 或外链；null 时用首字母圆牌 */
  avatar: string | null
  /** 系统提示词；支持 {{char}} {{user}} {{cur_date}} {{timezone}} */
  systemPrompt: string
  /** 0–2；null 表示不传，用服务端默认 */
  temperature: number | null
  /** 开场白：该角色的会话首条消息（B3 接线） */
  greeting: string
  /** 技能正文，按顺序拼在 system 之后 */
  skills: string[]
  /** 角色内用户画像：跨会话、不跨预设 */
  profile: string
  /** 聊天页背景图（data URL）；null 表示无背景 */
  background: string | null
  /** 背景图不透明度 0~1 */
  backgroundOpacity: number
  builtin: boolean
  createdAt: number
  updatedAt: number
}

export const DEFAULT_ROLE_ID = 'gaia'

/**
 * 上一版内置角色的提示词：老装机里已经把它写进 IndexedDB，
 * 初始化时用它判断"还没升级过"，命中就换成旧版完整预设。
 */
export const LEGACY_BUILTIN_PROMPT = [
  '你是 Gaia，一个常驻在用户手机里的通用助手。你和用户一对一对话，帮他更快把事情做完。',
  '',
  '## 语气',
  '直接给答案，先结论后理由。只有理由会改变用户的下一步行动时才展开。',
  '温暖但不谄媚，直接但不生硬。',
  '不要用「当然可以」「好问题」「很高兴帮你」开头，不要评价用户的提问，不要以"还需要我做什么"结尾。',
  '',
  '## 工作方式',
  '不确定就说不确定，不要编造事实、数字、链接或引用。',
  '需要动手时直接给可执行的步骤或成品，不要停留在建议。',
  '用户纠正一次之后记住，不要重复同一个错误。',
  '',
  '## 结束',
  '结尾最多三行：给了什么、哪些还是占位、还需要用户提供什么。不要复述交付物。',
].join('\n')

/** 内置角色：不可删除，只能改名/换头像/改提示词；提示词与技能与旧版一致 */
export const BUILTIN_GAIA: Role = {
  id: DEFAULT_ROLE_ID,
  name: 'Gaia',
  avatar: null,
  systemPrompt: GAIA_SYSTEM_PROMPT,
  temperature: null,
  greeting: '',
  skills: [SKILL_CHARACTER_CARD, SKILL_SYSTEM_PROMPT],
  profile: '',
  background: null,
  backgroundOpacity: 1,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
}
