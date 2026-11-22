import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  diagClear,
  diagEntries,
  diagSubscribe,
  diagVersion,
  saveFile,
  shareFile,
} from '../../../platform/index.js'
import { copyText } from '../../../utils/clipboard.js'
import { buildDiagText, clockOf, collectSummary, diagFileName, type DiagRow } from '../collect.js'
import { closeDiagnostics, useDiagnostics } from '../store.js'
import styles from '../diagnostics.module.css'

const toBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/** 浏览器里没有落盘通道时的兜底：直接下载 */
const download = (name: string, text: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 挂在 app.overlay 上：关闭时不渲染 */
export const DiagnosticsPage = () => {
  const open = useDiagnostics((state) => state.open)
  return open ? <DiagnosticsSheet /> : null
}

const DiagnosticsSheet = () => {
  const version = useSyncExternalStore(diagSubscribe, diagVersion)
  const entries = useMemo(() => diagEntries(), [version])
  const [rows, setRows] = useState<DiagRow[]>([])
  const [note, setNote] = useState('')

  // 打开时才探测：数值反映的是这次进来的真实状态
  useEffect(() => {
    let live = true
    void collectSummary().then((next) => {
      if (live) {
        setRows(next)
      }
    })
    return () => {
      live = false
    }
  }, [])

  const onSave = async (): Promise<void> => {
    const text = await buildDiagText()
    const name = diagFileName()
    const base64 = toBase64(text)
    // 存到下载目录后直接拉起转发面板，选 QQ 就能发给开发者
    if (shareFile(name, base64)) {
      setNote('已保存到「下载/Gaia」，正在打开转发，选 QQ 发给我即可')
    } else if (saveFile(name, base64)) {
      setNote('已保存到「下载/Gaia」')
    } else {
      download(name, text)
      setNote('已开始下载')
    }
  }

  const onCopy = async (): Promise<void> => {
    const ok = await copyText(await buildDiagText())
    setNote(ok ? '已复制全部内容' : '复制失败，请改用「保存日志文件」')
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label="诊断日志">
      <div className={styles.header}>
        <button
          type="button"
          className={styles.back}
          aria-label="返回"
          onClick={closeDiagnostics}
        >
          ‹
        </button>
        <div className={styles.title}>诊断日志</div>
        <button
          type="button"
          className={styles.clear}
          onClick={() => {
            diagClear()
            setNote('已清空')
          }}
        >
          清空
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.card}>
          {rows.map((row) => (
            <div key={row.label} className={styles.row}>
              <span className={styles.rowLabel}>{row.label}</span>
              <span className={styles.rowValue}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => void onSave()}>
            保存并转发
          </button>
          <button type="button" className={styles.button} onClick={() => void onCopy()}>
            复制全部
          </button>
        </div>
        <div className={styles.note}>
          {note || '把文件发给开发者即可定位问题；日志不含对话正文与 API Key。'}
        </div>

        <div className={styles.logCard}>
          {entries.length === 0 ? (
            <div className={styles.empty}>还没有记录</div>
          ) : (
            entries.map((entry, index) => (
              <div
                key={`${entry.time}-${index}`}
                className={`${styles.logLine} ${entry.level === 'error' ? styles.logError : entry.level === 'warn' ? styles.logWarn : ''}`}
              >
                <span className={styles.logTime}>{clockOf(entry.time)}</span>
                <span className={styles.logScope}>{entry.scope}</span>
                <span className={styles.logMessage}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
