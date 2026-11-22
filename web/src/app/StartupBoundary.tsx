import { Component, type CSSProperties, type ReactNode } from 'react'
import { diagRecord, saveFile, setLayout } from '../platform/index.js'
import { buildDiagText, diagFileName } from '../features/diagnostics/collect.js'
import { copyText } from '../utils/clipboard.js'

const LAYOUT_KEY = 'gaia:theme-layout'

const toBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

const download = (name: string, text: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 清空全部本地数据：先确认，再删 localStorage 与所有 IndexedDB，最后重启 */
const wipeLocalData = async (): Promise<void> => {
  try {
    globalThis.localStorage?.clear()
  } catch {
    // 删不掉就继续删 IndexedDB
  }
  try {
    const factory = globalThis.indexedDB as
      | (IDBFactory & { databases?: () => Promise<{ name?: string | null }[]> })
      | undefined
    const databases = await factory?.databases?.()
    await Promise.all(
      (databases ?? [])
        .map((info) => info.name)
        .filter((name): name is string => typeof name === 'string')
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = globalThis.indexedDB.deleteDatabase(name)
              request.onsuccess = () => resolve()
              request.onerror = () => resolve()
              request.onblocked = () => resolve()
            })
        )
    )
  } catch {
    // 删不掉就交给用户去系统设置里清，至少 localStorage 已经清了
  }
  globalThis.location?.reload()
}

const describe = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`
  }
  return String(error)
}

const buttonStyle = (primary = false): CSSProperties => ({
  display: 'block',
  width: '100%',
  padding: '12px 16px',
  marginTop: 8,
  borderRadius: 12,
  border: primary ? 'none' : '1px solid #D9D9D9',
  background: primary ? '#1F2329' : '#FFFFFF',
  color: primary ? '#FFFFFF' : '#1F2329',
  fontSize: 15,
  fontFamily: 'inherit',
  textAlign: 'center',
  cursor: 'pointer',
})

/**
 * 启动失败时唯一能看到的一屏。
 *
 * 白屏时应用内所有入口（设置、反馈、诊断导出）都不存在，用户只能去系统设置清数据，
 * 我们也拿不到堆栈；所以这一屏必须自带：原因（可截图）、诊断导出、重试、逃生按钮。
 */
export const StartupFallback = ({ error }: { error: unknown }) => {
  const text = describe(error)

  const copyDiag = async (): Promise<void> => {
    try {
      const diag = await buildDiagText()
      await copyText(`${diag}\n--- 启动错误 ---\n${text}`)
      globalThis.alert?.('诊断已复制，粘贴发给开发者即可')
    } catch (failure) {
      globalThis.alert?.(`复制失败，请直接截图本页：${String(failure)}`)
    }
  }

  const saveDiag = async (): Promise<void> => {
    try {
      const diag = `${await buildDiagText()}\n--- 启动错误 ---\n${text}`
      const name = diagFileName()
      if (!saveFile(name, toBase64(diag))) {
        download(name, diag)
      }
      globalThis.alert?.(`诊断已保存：${name}`)
    } catch (failure) {
      globalThis.alert?.(`保存失败，请直接截图本页：${String(failure)}`)
    }
  }

  const backToClassic = (): void => {
    try {
      globalThis.localStorage?.setItem(LAYOUT_KEY, 'classic')
    } catch {
      // 存不进去也要把内存里的布局切回来
    }
    setLayout('classic')
    globalThis.location?.reload()
  }

  const wipe = (): void => {
    const sure = globalThis.confirm?.(
      '会删除这台手机上的全部对话、角色、记忆和 API Key，无法恢复。继续？'
    )
    if (sure) {
      void wipeLocalData()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        padding: '24px 20px 40px',
        background: '#F8F8F8',
        color: '#1F2329',
        fontSize: 14,
        lineHeight: 1.6,
        fontFamily: 'inherit',
        WebkitTextSizeAdjust: 'none',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 600 }}>Gaia 启动失败</div>
      <div style={{ marginTop: 8, color: '#5A5F66' }}>
        界面没能画出来。可以先重试；一直这样的话，把诊断发给开发者，或清空本地数据后重新导入。
      </div>
      <pre
        style={{
          margin: '12px 0 0',
          padding: 12,
          maxHeight: 180,
          overflow: 'auto',
          borderRadius: 12,
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          color: '#A33',
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {text}
      </pre>
      <button type="button" style={buttonStyle(true)} onClick={() => globalThis.location?.reload()}>
        重试
      </button>
      <button type="button" style={buttonStyle()} onClick={() => void copyDiag()}>
        复制诊断
      </button>
      <button type="button" style={buttonStyle()} onClick={() => void saveDiag()}>
        保存诊断文件
      </button>
      <button type="button" style={buttonStyle()} onClick={backToClassic}>
        改用经典界面并重启
      </button>
      <button type="button" style={buttonStyle()} onClick={wipe}>
        清空本地数据并重启
      </button>
      <div style={{ marginTop: 16, color: '#8A8F99', fontSize: 12 }}>
        截图这一页也可以：上面那段红色文字就是崩溃原因。
      </div>
    </div>
  )
}

type State = { error: Error | null }

/** 渲染期异常兜底：接住就换成 StartupFallback，绝不留在 React 卸载后的白屏上 */
export class StartupBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('[startup] 渲染失败', error)
    diagRecord('error', 'boot', '渲染失败', error)
  }

  override render(): ReactNode {
    return this.state.error ? <StartupFallback error={this.state.error} /> : this.props.children
  }
}
