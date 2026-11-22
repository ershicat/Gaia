// 老机型兼容层必须是第一个 import：老 WebView 缺的 API 要在任何业务代码之前补好
import './polyfills.js'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { bootstrap } from './app/compose.js'
import { StartupBoundary, StartupFallback } from './app/StartupBoundary.js'
import { setupTheme } from './app/theme.js'
import { bridge } from './features/host/index.js'
import { diagRecord } from './platform/index.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

// 页面级的错误交给原生日志：WebView 的 console 不会进 logcat，这里是唯一出口
// 同时写进诊断：白屏时应用内导不出日志，这份是事后唯一的现场
window.addEventListener('error', (event) => {
  bridge().log?.(`error: ${event.message} @${event.filename}:${event.lineno}`)
  diagRecord('error', 'boot', `未捕获异常：${event.message}`)
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason)
  bridge().log?.(`unhandledrejection: ${reason}`)
  diagRecord('error', 'boot', '未处理的 Promise 拒绝', event.reason)
})

// 启动流程（主题、积木装配）跑在 React 之外：它抛错时错误边界接不住，会直接白屏，
// 所以这里自己兜住，把它交给同一屏兜底界面
let startupError: unknown = null
try {
  ensureKatex()
  setupTheme()
  // 装配积木必须在首次渲染之前完成：槽位、中间件与开关都在这一步注册
  bootstrap()
} catch (error) {
  startupError = error
  // eslint-disable-next-line no-console
  console.error('[startup] 装配失败', error)
  diagRecord('error', 'boot', '启动装配失败', error)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  startupError === null ? (
    <StartupBoundary>
      <App />
    </StartupBoundary>
  ) : (
    <StartupFallback error={startupError} />
  )
)
