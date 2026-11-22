import {
  clearProgress,
  diagError,
  diagRecord,
  HISTORY_IMPORT_TASK,
  reportProgress,
} from '../../platform/index.js'
import { formatDate } from '../../utils/format.js'
import * as db from './db.js'
import { replaceHistory, useChatStore } from './store.js'
import type { Session } from './types.js'

export { BackupError } from './history/errors.js'

// 导入、导出与全部删除串行处理，避免读取归档时数据被清空或两个替换事务交错。
let backupQueue: Promise<unknown> = Promise.resolve()

const enqueueBackup = <T>(run: () => Promise<T>): Promise<T> => {
  const task = backupQueue.then(run)
  backupQueue = task.catch(() => {})
  return task
}

const backupFileName = (date: Date) => `deepseek_data-${formatDate(date)}.zip`

/** 导出为历史会话导出格式的 ZIP，可再次导入。 */
export const exportHistory = (): Promise<{ name: string; blob: Blob }> =>
  enqueueBackup(async () => {
    // 列表和已加载内容保留导出开始时的快照；未打开的会话逐条读取，不填满详情缓存。
    const { sessions, sessionCache } = useChatStore.getState()
    async function* readSessions(): AsyncGenerator<Session> {
      for (const summary of sessions) {
        const session = Object.hasOwn(sessionCache, summary.id)
          ? sessionCache[summary.id]
          : await db.loadSession(summary.id)
        if (!session) {
          throw new Error(`History session disappeared during export: ${summary.id}`)
        }
        // 详情读取期间可能重命名，归档标题与开始时的列表保持一致。
        yield { ...session, ...summary }
      }
    }
    const { exportArchive } = await import('./history/exportArchive.js')
    const now = new Date()
    const blob = await exportArchive(readSessions())
    return { name: backupFileName(now), blob }
  })

/**
 * 确认覆盖后调用：先检查 ZIP 格式与版本，校验失败时保留正在生成的回答；
 * 通过后从 ZIP 流式写入暂存，成功才替换原有会话与图片原件。返回导入的会话数。
 * 读取过程中按字节上报进度，界面在下方显示百分比。
 */
export const importHistory = (file: File): Promise<number> =>
  enqueueBackup(async () => {
    diagRecord('info', 'import', `开始导入 ${file.name}`, `${file.size} 字节 · ${file.type || '未知类型'}`)
    reportProgress(HISTORY_IMPORT_TASK, 0, '正在校验历史文件')
    try {
      const { checkArchiveFormat, importArchive } = await import('./history/importArchive.js')
      await checkArchiveFormat(file)
      reportProgress(HISTORY_IMPORT_TASK, 0.03, '正在导入历史会话')
      const count = await replaceHistory(() =>
        importArchive(file, (consumedBytes, totalBytes) => {
          const ratio = totalBytes > 0 ? consumedBytes / totalBytes : 1
          reportProgress(HISTORY_IMPORT_TASK, 0.03 + 0.87 * ratio, '正在导入历史会话')
        })
      )
      reportProgress(HISTORY_IMPORT_TASK, 1, '正在导入历史会话')
      diagRecord('info', 'import', `导入完成，共 ${count} 个会话`)
      return count
    } catch (error) {
      diagError('import', error, '导入失败')
      throw error
    } finally {
      clearProgress(HISTORY_IMPORT_TASK)
    }
  })

/** 确认删除后调用：以空历史原子替换全部本地会话与附件，保留 API Key 和其他设置。 */
export const clearHistory = (): Promise<void> =>
  enqueueBackup(async () => {
    await replaceHistory(async () => {})
  })
