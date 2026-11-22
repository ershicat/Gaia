import {
  appVersion,
  defineBlock,
  diagInstall,
  diagRecord,
  registerBackHandler,
  registerCommand,
} from '../../platform/index.js'
import { closeDiagnostics, openDiagnostics, useDiagnostics } from './store.js'
import { DiagnosticsPage } from './ui/DiagnosticsPage.js'

/**
 * 诊断日志积木：环形缓冲区 + 设备摘要 + 导出文件。
 *
 * 入口在 设置 → 反馈 → 诊断日志（由设置积木发命令打开），
 * 现场出问题时用户导出 txt 发给开发者，就能看到版本、WebView 能力、跳转与导入的完整过程。
 */
export const diagnostics = defineBlock({
  id: 'diagnostics',
  order: 100,
  flags: { diagnostics: true },
  init: () => {
    // 先挂钩子，之后的异常与 console 才进缓冲区
    diagInstall()
    diagRecord('info', 'boot', `v${appVersion()} 启动`)
    registerCommand('diagnostics.open', openDiagnostics)
    registerBackHandler('diagnostics', 76, () => {
      if (!useDiagnostics.getState().open) {
        return false
      }
      closeDiagnostics()
      return true
    })
  },
  slots: {
    'app.overlay': [{ id: 'page', order: 40, render: () => <DiagnosticsPage /> }],
    'shell.me.item': [
      {
        id: 'diagnostics',
        order: 50,
        render: () => (
          <button type="button" data-shell-row="" onClick={openDiagnostics}>
            诊断日志
          </button>
        ),
      },
    ],
  },
})
