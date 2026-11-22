import clsx from 'clsx'
import { useRef, useState, useSyncExternalStore } from 'react'
import {
  DeleteAllConfirm,
  ImportConfirm,
  useHistoryDelete,
  useHistoryImport,
} from '../../../components/settings/SettingsDialog.js'
import { useTranslate } from '../../../i18n/index.js'
import {
  HISTORY_IMPORT_TASK,
  progressOf,
  saveFile,
  subscribeProgress,
} from '../../../platform/index.js'
import { exportHistory } from '../../../services/chat/backup.js'
import { useChatStore } from '../../../services/chat/store.js'
import styles from '../settings.module.css'
import { Row } from './rows.js'

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/** 导入进度：进度条只在真正读取归档期间存在，读完后清空，换成结果提示 */
const subscribeImport = (listener: () => void) => subscribeProgress(HISTORY_IMPORT_TASK, () => listener())
const importProgress = () => progressOf(HISTORY_IMPORT_TASK)

/** 数据管理：版式对齐旧版 DataManageActivity（无图标白卡 + 右侧箭头） */
export const DataPage = () => {
  const t = useTranslate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const sessionCount = useChatStore((state) => state.sessions.length)
  const progress = useSyncExternalStore(subscribeImport, importProgress)
  const busy = historyImport.busy || historyDelete.busy || replacingHistory

  const onExport = async (): Promise<void> => {
    if (exporting || sessionCount === 0) {
      return
    }
    setExporting(true)
    setStatus('')
    try {
      const { name, blob } = await exportHistory()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (saveFile(name, toBase64(bytes))) {
        setStatus('已保存到「下载/Gaia」')
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        setStatus('已开始下载')
      }
    } catch (error) {
      setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setExporting(false)
    }
  }

  // 导入结果：成功给出会话数，失败给出原因（预期的错误翻译成文案，其余直接显示错误信息）
  const imported = historyImport.status
  const importedText = imported ? t(imported.key, imported.params) : ''
  const importedReason = imported?.reason
    ? t(imported.reason)
    : ((imported?.params as { message?: string } | undefined)?.message ?? '')

  return (
    <>
      <div className={styles.card} style={{ marginTop: 16 }}>
        <Row label="我共享的链接" value="暂无共享链接" />
        <Row
          label="上传历史文件"
          value="从 DeepSeek 导出的 ZIP"
          onClick={() => {
            if (!busy) {
              fileRef.current?.click()
            }
          }}
        />
        <Row
          label={exporting ? '正在打包…' : '导出所有历史对话'}
          value={status || undefined}
          onClick={() => void onExport()}
        />
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <Row
          label="删除所有历史对话"
          danger
          onClick={() => {
            if (!busy) {
              historyDelete.open()
            }
          }}
        />
      </div>

      <div className={styles.tip}>
        导入会覆盖当前全部本地对话与附件；导出文件不包含 API Key。
      </div>

      {progress ? (
        <div className={styles.dock}>
          <div className={styles.dockHead}>
            <span className={styles.dockLabel}>{progress.label}</span>
            <span className={styles.dockPercent}>{Math.round(progress.percent * 100)}%</span>
          </div>
          <div className={styles.track}>
            <div
              className={styles.fill}
              style={{ width: `${Math.max(2, Math.round(progress.percent * 100))}%` }}
            />
          </div>
        </div>
      ) : imported ? (
        <div className={clsx(styles.dock, imported.error && styles.dockError)}>
          <div className={styles.dockHead}>
            <span className={clsx(styles.dockLabel, !imported.error && styles.dockOk)}>
              {importedText}
            </span>
          </div>
          {importedReason ? <div className={styles.dockReason}>{importedReason}</div> : null}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            historyImport.select(file)
          }
        }}
      />

      {historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}
