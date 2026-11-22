import { apiOrigin, currentApiTarget } from '../../platform/index.js'

export interface BalanceInfo {
  currency: string
  total: string
  granted: string
  toppedUp: string
}

export interface BalanceSnapshot {
  available: boolean
  infos: BalanceInfo[]
  fetchedAt: number
}

interface RawBalanceInfo {
  currency?: unknown
  total_balance?: unknown
  granted_balance?: unknown
  topped_up_balance?: unknown
}

interface RawBalance {
  is_available?: unknown
  balance_infos?: unknown
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

const parseInfo = (raw: RawBalanceInfo): BalanceInfo => ({
  currency: text(raw.currency) || 'CNY',
  total: text(raw.total_balance) || '0',
  granted: text(raw.granted_balance) || '0',
  toppedUp: text(raw.topped_up_balance) || '0',
})

/** GET /user/balance：官方余额（不需要 stream）；非 DeepSeek 服务商没有这个接口 */
export const fetchBalance = async (apiKey: string): Promise<BalanceSnapshot> => {
  const target = currentApiTarget()
  const path = target ? target.balancePath : '/user/balance'
  if (!path) {
    throw new Error('当前服务商不提供余额查询')
  }
  const base = target ? target.baseUrl : apiOrigin(__API_ORIGIN__)
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`)
  }
  const body = (await response.json()) as RawBalance
  const list = Array.isArray(body.balance_infos) ? body.balance_infos : []
  return {
    available: body.is_available !== false,
    infos: list.map((item) => parseInfo(item as RawBalanceInfo)),
    fetchedAt: Date.now(),
  }
}
