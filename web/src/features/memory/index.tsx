import {
  defineBlock,
  on,
  registerBackHandler,
  registerBeforeReplyHandler,
  registerCommand,
  registerTurnCompleteHandler,
} from '../../platform/index.js'
import { memoryMiddleware } from './middleware.js'
import {
  closeMemoryPanel,
  applyCardExtras,
  compressIfNeeded,
  flushPendingDream,
  initMemory,
  maybeBuildCard,
  openMemoryPanel,
  scheduleDream,
  seedInitialCard,
  useMemory,
} from './store.js'
import { MemoryPanel } from './ui/MemoryPanel.js'

/**
 * 记忆积木：单会话滚动摘要（压缩）+ 长期记忆文件库（整理/做梦）+ 回看面板。
 * 面板由命令打开（设置页「记忆」那一行），挂在 app.overlay 上。
 */
export const memory = defineBlock({
  id: 'memory',
  order: 0,
  flags: { memory: true },
  init: () => {
    void initMemory()
    // 角色卡导入时夹带的档案卡 / 记忆文件：roles 广播，这里落地（积木间不互相 import）
    on('roles:cardExtras', (payload) => {
      void applyCardExtras(payload)
    })
    registerTurnCompleteHandler((sessionId) => {
      void compressIfNeeded(sessionId)
      // 做梦：这轮结束后空闲两分钟，把新内容整理进长期记忆
      scheduleDream(sessionId)
    })
    // 会话档案卡：发送前先落「角色卡预置卡」，再按需建立/更新（默认关，只在设置里打开后才跑）
    registerBeforeReplyHandler(async (sessionId) => {
      await seedInitialCard(sessionId)
      await maybeBuildCard(sessionId)
    })
    // WebView 里没有真正的后台服务：切回前台时补跑上次没来得及做的整理
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        flushPendingDream()
      }
    })
    registerCommand('memory.openPanel', openMemoryPanel)
    registerBackHandler('memory', 55, () => {
      if (!useMemory.getState().panelOpen) {
        return false
      }
      closeMemoryPanel()
      return true
    })
  },
  middleware: [{ order: 0, fn: memoryMiddleware }],
  slots: {
    'app.overlay': [{ id: 'panel', order: 25, render: () => <MemoryPanel /> }],
    'shell.me.item': [
      {
        id: 'memory',
        order: 40,
        render: () => (
          <button type="button" data-shell-row="" onClick={openMemoryPanel}>
            记忆
          </button>
        ),
      },
    ],
  },
})
