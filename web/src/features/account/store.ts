import { create } from 'zustand'
import { chat } from '../../platform/index.js'
import { fetchBalance, type BalanceSnapshot } from './api.js'

interface AccountState {
  open: boolean
  loading: boolean
  error: string
  snapshot: BalanceSnapshot | null
}

export const useAccount = create<AccountState>(() => ({
  open: false,
  loading: false,
  error: '',
  snapshot: null,
}))

const setState = useAccount.setState

export const closeBalance = (): void => setState({ open: false })

export const loadBalance = async (): Promise<void> => {
  const apiKey = chat().apiKey()
  if (!apiKey) {
    setState({ loading: false, error: '还没有配置 API Key', snapshot: null })
    return
  }
  setState({ loading: true, error: '' })
  try {
    const snapshot = await fetchBalance(apiKey)
    setState({ loading: false, snapshot, error: '' })
  } catch (error) {
    setState({
      loading: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const openBalance = (): void => {
  setState({ open: true })
  void loadBalance()
}
