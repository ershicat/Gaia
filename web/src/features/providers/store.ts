import { create } from 'zustand'
import {
  setApiTarget,
  setBooleanOption,
  setTextOption,
  type ApiProtocol,
  type ApiTarget,
} from '../../platform/index.js'
import { listModels } from '../../services/api/client.js'
import { setApiKey, setModel, useSettings } from '../../services/settings.js'
import { DEEPSEEK, providerById, type Provider } from './registry.js'

const STORAGE_KEY = 'gaia:providers'

type Persisted = {
  providerId: string
  /** 每个服务商各存一把 Key：切换回来不用重填 */
  keys: Record<string, string>
  /** 每个服务商各记一个模型 */
  models: Record<string, string>
  customBase: string
  customProtocol: ApiProtocol
}

export type ProvidersStep = 'list' | 'detail'

interface ProvidersState extends Persisted {
  open: boolean
  step: ProvidersStep
  /** 当前正在编辑详情的服务商（列表页不显示详情） */
  detailId: string
  loading: boolean
  error: string
  modelList: string[]
}

const emptyPersisted: Persisted = {
  providerId: DEEPSEEK.id,
  keys: {},
  models: {},
  customBase: '',
  customProtocol: 'openai',
}

const readStored = (): Persisted => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...emptyPersisted }
    }
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') {
      return { ...emptyPersisted }
    }
    const value = parsed as Partial<Persisted>
    return {
      providerId: typeof value.providerId === 'string' ? value.providerId : DEEPSEEK.id,
      keys: typeof value.keys === 'object' && value.keys !== null ? value.keys : {},
      models: typeof value.models === 'object' && value.models !== null ? value.models : {},
      customBase: typeof value.customBase === 'string' ? value.customBase : '',
      customProtocol: value.customProtocol === 'anthropic' ? 'anthropic' : 'openai',
    }
  } catch {
    return { ...emptyPersisted }
  }
}

const stored = readStored()

export const useProviders = create<ProvidersState>(() => ({
  ...stored,
  open: false,
  step: 'list',
  detailId: stored.providerId,
  loading: false,
  error: '',
  modelList: [],
}))

const setState = useProviders.setState
const get = useProviders.getState

/** 写入服务商时不要回写 settings 的 apiKey，避免来回抖 */
let applying = false

const persist = (): void => {
  const { providerId, keys, models, customBase, customProtocol } = get()
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ providerId, keys, models, customBase, customProtocol })
    )
  } catch {
    // 存不下就只在本次会话生效，不打断主流程
  }
}

/** 可选模型：拉取到的列表优先，其次预设表，最后是已经选过的那个 */
const modelChoices = (state: ProvidersState, provider: Provider): string[] => {
  if (state.modelList.length > 0) {
    return [...state.modelList]
  }
  if (provider.fixedModels) {
    return [...provider.fixedModels]
  }
  const picked = state.models[provider.id]
  return picked ? [picked] : []
}

/** 服务商 → 平台层接口目标（custom 用用户填的地址与协议） */
const buildTarget = (state: ProvidersState): ApiTarget => {
  const provider: Provider = providerById(state.providerId)
  const protocol: ApiProtocol = provider.editable ? state.customProtocol : provider.protocol
  const anthropicNative = protocol === 'anthropic'
  return {
    name: provider.name,
    protocol,
    baseUrl: provider.editable ? state.customBase.trim() : provider.baseUrl,
    chatPath: provider.editable
      ? anthropicNative
        ? '/v1/messages'
        : '/chat/completions'
      : provider.chatPath,
    modelsPath: provider.editable
      ? anthropicNative
        ? '/v1/models'
        : '/models'
      : provider.modelsPath,
    auth: provider.editable ? (anthropicNative ? 'x-api-key' : 'bearer') : provider.auth,
    filePath: provider.filePath,
    voiceBase: provider.voiceBase,
    balancePath: provider.balancePath,
    models: modelChoices(state, provider),
    contextLimit: provider.contextLimit,
    serverTools: provider.serverTools,
  }
}

/** 把当前选择同步给平台层与上游设置：Key、模型、接口目标、能力位 */
export const applyProvider = (): void => {
  const state = get()
  const provider = providerById(state.providerId)
  const key = state.keys[state.providerId] ?? ''
  const model = state.models[state.providerId] ?? provider.fixedModels?.[0] ?? ''
  applying = true
  try {
    setApiKey(key || null)
    if (model) {
      setModel(model)
    }
    setApiTarget(buildTarget(state))
    setTextOption('providerLabel', provider.name)
    setBooleanOption('voiceAvailable', Boolean(provider.voiceBase))
  } finally {
    applying = false
  }
}

/** 启动时调用一次：老用户把现有 Key 迁入 DeepSeek 那一格，然后应用当前服务商 */
export const initProviders = (): void => {
  const current = get()
  if (!current.keys[DEEPSEEK.id]) {
    const legacyKey = useSettings.getState().apiKey
    if (legacyKey) {
      setState({ keys: { ...current.keys, [DEEPSEEK.id]: legacyKey } })
    }
  }
  if (!get().models[DEEPSEEK.id] && useSettings.getState().model) {
    setState({ models: { ...get().models, [DEEPSEEK.id]: useSettings.getState().model } })
  }
  applyProvider()
  persist()
}

/** 上游「API Key」页改的是当前服务商的 Key，这里镜像进服务商表 */
export const syncKeyFromSettings = (): void => {
  if (applying) {
    return
  }
  const value = useSettings.getState().apiKey ?? ''
  const state = get()
  if ((state.keys[state.providerId] ?? '') === value) {
    return
  }
  setState({ keys: { ...state.keys, [state.providerId]: value } })
  persist()
}

export const openProviders = (): void => {
  setState({ open: true, step: 'list', error: '', detailId: get().providerId })
}

export const closeProviders = (): void => {
  setState({ open: false, step: 'list', error: '' })
}

/** 返回：详情 → 列表 → 关闭 */
export const goBackProviders = (): boolean => {
  const { open, step } = get()
  if (!open) {
    return false
  }
  if (step === 'detail') {
    setState({ step: 'list', error: '' })
  } else {
    closeProviders()
  }
  return true
}

export const openProviderDetail = (id: string): void => {
  setState({ step: 'detail', detailId: id, error: '', modelList: [] })
}

export const pickProvider = (id: string): void => {
  // 换服务商时把上一家的列表丢掉，免得模型选择里出现别家的模型
  setState({ providerId: id, modelList: [] })
  persist()
  applyProvider()
}

export const saveProviderKey = (value: string): void => {
  const state = get()
  const keys = { ...state.keys, [state.providerId]: value.trim() }
  setState({ keys })
  persist()
  applyProvider()
}

export const pickProviderModel = (model: string): void => {
  const state = get()
  const models = { ...state.models, [state.providerId]: model }
  setState({ models })
  persist()
  applyProvider()
}

export const updateCustomBase = (value: string): void => {
  setState({ customBase: value.trim() })
  persist()
  applyProvider()
}

export const updateCustomProtocol = (protocol: ApiProtocol): void => {
  setState({ customProtocol: protocol })
  persist()
  applyProvider()
}

/** 拉当前服务商的模型列表；失败把原因留在 error 里，不抛 */
export const refreshModels = async (): Promise<void> => {
  const state = get()
  const key = state.keys[state.providerId] ?? ''
  if (!key) {
    setState({ error: '先填 API Key，再拉模型列表' })
    return
  }
  if (state.providerId === 'custom' && !state.customBase.trim()) {
    setState({ error: '自定义网关要先填地址' })
    return
  }
  setState({ loading: true, error: '' })
  try {
    const list = await listModels(key)
    setState({ loading: false, modelList: list, error: list.length ? '' : '服务商返回了空列表，可手动填写模型名' })
    // 拉到的列表要同步给平台层，设置页的模型选择才会跟着这家服务商走
    applyProvider()
  } catch (error) {
    setState({
      loading: false,
      modelList: [],
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
