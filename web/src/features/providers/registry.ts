/**
 * 服务商注册表：一行 = 一家服务商。
 *
 * 规矩（写死在这，别破）：
 * 1. 只有**核对过官方文档**的地址才写进来，`verified` 记核对日期；
 * 2. 地址与模型会变，模型列表优先运行时拉 /models，fixedModels 只给 DeepSeek 用；
 * 3. 聊天路径与协议绑定：OpenAI 兼容 = /chat/completions，Anthropic 原生 = /v1/messages。
 */
import type { ApiProtocol } from '../../platform/index.js'

export type ProviderGroup = 'official-cn' | 'official-intl' | 'aggregator'

export interface Provider {
  id: string
  name: string
  group: ProviderGroup
  protocol: ApiProtocol
  baseUrl: string
  /** 相对 baseUrl 的聊天路径 */
  chatPath: string
  /** 相对 baseUrl 的模型列表路径 */
  modelsPath: string
  auth: 'x-api-key' | 'bearer'
  filePath?: string
  voiceBase?: string
  balancePath?: string
  contextLimit: number
  /** 是否发送 DeepSeek 专属服务端工具 */
  serverTools: boolean
  fixedModels?: string[]
  /** 允许用户改地址与协议（只有"自定义网关"） */
  editable?: boolean
  note?: string
  /** 地址核对日期（yyyy-mm-dd） */
  verified: string
}

export const DEEPSEEK: Provider = {
  id: 'deepseek',
  name: 'DeepSeek 官方',
  group: 'official-cn',
  protocol: 'anthropic',
  baseUrl: 'https://api.deepseek.com',
  chatPath: '/anthropic/v1/messages',
  modelsPath: '/models',
  auth: 'x-api-key',
  filePath: '/anthropic/v1/files',
  voiceBase: '/v1/tools',
  balancePath: '/user/balance',
  contextLimit: 1048576,
  serverTools: true,
  fixedModels: ['deepseek-flash', 'deepseek-v4-pro'],
  verified: '2026-11-20',
}

const openAi = (
  id: string,
  name: string,
  group: ProviderGroup,
  baseUrl: string,
  contextLimit: number,
  extra: Partial<Provider> = {}
): Provider => ({
  id,
  name,
  group,
  protocol: 'openai',
  baseUrl,
  chatPath: '/chat/completions',
  modelsPath: '/models',
  auth: 'bearer',
  contextLimit,
  serverTools: false,
  verified: '2026-11-20',
  ...extra,
})

export const PROVIDERS: Provider[] = [
  DEEPSEEK,
  openAi('siliconflow', '硅基流动 SiliconFlow', 'aggregator', 'https://api.siliconflow.cn/v1', 131072),
  openAi('moonshot', '月之暗面 Kimi', 'official-cn', 'https://api.moonshot.cn/v1', 131072),
  openAi('zhipu', '智谱 GLM', 'official-cn', 'https://open.bigmodel.cn/api/paas/v4', 131072),
  openAi('dashscope', '阿里通义千问', 'official-cn', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 131072),
  openAi('ark', '火山方舟（豆包）', 'official-cn', 'https://ark.cn-beijing.volces.com/api/v3', 131072, {
    note: '模型名要填推理接入点或模型 ID',
  }),
  openAi('openai', 'OpenAI', 'official-intl', 'https://api.openai.com/v1', 128000),
  openAi('gemini', 'Google Gemini', 'official-intl', 'https://generativelanguage.googleapis.com/v1beta/openai', 1000000),
  openAi('groq', 'Groq', 'official-intl', 'https://api.groq.com/openai/v1', 131072),
  openAi('mistral', 'Mistral', 'official-intl', 'https://api.mistral.ai/v1', 128000),
  openAi('openrouter', 'OpenRouter', 'aggregator', 'https://openrouter.ai/api/v1', 128000, {
    note: '模型名形如 vendor/model',
  }),
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    group: 'official-intl',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    chatPath: '/v1/messages',
    modelsPath: '/v1/models',
    auth: 'x-api-key',
    contextLimit: 200000,
    serverTools: false,
    note: '不走 DeepSeek 的服务端工具；输出上限固定 8192',
    verified: '2026-11-20',
  },
  {
    id: 'custom',
    name: '自定义网关',
    group: 'aggregator',
    protocol: 'openai',
    baseUrl: '',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    auth: 'bearer',
    contextLimit: 131072,
    serverTools: false,
    editable: true,
    note: '自建或小众中转站：自填地址，只支持 OpenAI 兼容与 Anthropic 原生两种协议',
    verified: '2026-11-20',
  },
]

export const providerById = (id: string): Provider =>
  PROVIDERS.find((provider) => provider.id === id) ?? DEEPSEEK

export const GROUP_LABELS: Record<ProviderGroup, string> = {
  'official-cn': '国内官方',
  'official-intl': '国际官方',
  aggregator: '聚合与中转',
}
