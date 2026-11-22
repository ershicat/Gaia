import {
  apiOrigin,
  appVersion,
  chat,
  diagEntries,
  flagSnapshot,
  hasChatBridge,
} from '../../platform/index.js'
import { useSettings } from '../../services/settings.js'

/** 诊断页顶部的一行「标签 + 值」 */
export interface DiagRow {
  label: string
  value: string
}

const chromeVersion = (ua: string): string => /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? '未知'

const systemName = (ua: string): string => {
  const android = /Android\s([\d.]+)/.exec(ua)?.[1]
  return android ? `Android ${android}` : '未知'
}

/**
 * 运行时能力探针：老系统 WebView 缺 toSorted / toReversed 时，
 * 导入会在解压后解析会话那一步抛 TypeError，这里的 ✗ 就是现场证据。
 */
const capability = (): string => {
  const probe = (name: string, run: () => unknown): string => {
    try {
      run()
      return `${name} ✓`
    } catch {
      return `${name} ✗`
    }
  }
  return [
    probe('toSorted', () => ([] as number[]).toSorted((a, b) => a - b)),
    probe('toReversed', () => ([] as number[]).toReversed()),
    probe('Object.hasOwn', () => Object.hasOwn({}, 'x')),
  ].join(' · ')
}

const megabytes = (bytes: number | undefined): string =>
  typeof bytes === 'number' ? `${Math.round((bytes / 1048576) * 10) / 10} MB` : '未知'

const storageLine = async (): Promise<string> => {
  let local = '不可用'
  try {
    localStorage.setItem('gaia:diag-probe', '1')
    localStorage.removeItem('gaia:diag-probe')
    local = '可用'
  } catch {
    local = '不可用'
  }
  const indexed = typeof indexedDB === 'undefined' ? '不可用' : '可用'
  let quota = ''
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (estimate) {
      quota = ` · 已用 ${megabytes(estimate.usage)} / 配额 ${megabytes(estimate.quota)}`
    }
  } catch {
    // 拿不到配额不影响结论
  }
  return `IndexedDB ${indexed} · localStorage ${local}${quota}`
}

const maskedKey = (): string => {
  const key = useSettings.getState().apiKey
  return key ? `已设置（尾号 ${key.slice(-4)}）` : '未设置'
}

const flagLine = (): string => {
  const entries = Object.entries(flagSnapshot())
  return entries.length > 0 ? entries.map(([id, on]) => `${id}=${on ? '开' : '关'}`).join(' ') : '默认'
}

export const sessionCount = (): string => {
  if (!hasChatBridge()) {
    return '未知'
  }
  return `${chat().listSessions().length} 个会话`
}

/** 当前设备与运行环境摘要，诊断页和导出文件共用 */
export const collectSummary = async (): Promise<DiagRow[]> => {
  const ua = navigator.userAgent
  return [
    { label: '版本', value: `v${appVersion()}` },
    { label: '系统', value: `${systemName(ua)} · WebView Chrome/${chromeVersion(ua)}` },
    { label: '运行时能力', value: capability() },
    {
      label: '屏幕',
      value: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}（物理 ${screen.width}×${screen.height}）`,
    },
    { label: '语言', value: `${navigator.language} / 界面 ${document.documentElement.lang}` },
    { label: '存储', value: await storageLine() },
    { label: 'API Key', value: maskedKey() },
    { label: '接口地址', value: apiOrigin('官方默认') },
    { label: '会话', value: sessionCount() },
    { label: '积木开关', value: flagLine() },
  ]
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

/** 日志行时间：本地 HH:MM:SS.mmm */
export const clockOf = (time: number): string => {
  const date = new Date(time)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** 导出用的纯文本：摘要 + 全部事件 */
export const buildDiagText = async (): Promise<string> => {
  const rows = await collectSummary()
  const entries = diagEntries()
  const now = new Date()
  return [
    'Gaia 诊断日志',
    `导出时间: ${now.toLocaleString('zh-CN')}`,
    `UA: ${navigator.userAgent}`,
    ...rows.map((row) => `${row.label}: ${row.value}`),
    '',
    `--- 事件（共 ${entries.length} 条）---`,
    ...entries.map((entry) => `[${clockOf(entry.time)}] ${entry.level} ${entry.scope} ${entry.message}`),
    '',
  ].join('\n')
}

/** 文件名带时间，多次导出不会互相覆盖 */
export const diagFileName = (): string => {
  const date = new Date()
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `gaia-diag-${stamp}.txt`
}
