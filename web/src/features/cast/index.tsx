import { defineBlock, registerBackHandler, registerCommand } from '../../platform/index.js'
import { castMiddleware } from './middleware.js'
import { closeCastPanel, initCast, openCastPanel, useCast } from './store.js'
import { CastPanel } from './ui/CastPanel.js'

/**
 * 配角库积木：会话级的配角档案（酒馆 lorebook 的最小等价物）。
 * 主角在角色提示词里；配角在这里按关键词注入 tailNotes，常驻/停用可调。
 */
export const cast = defineBlock({
  id: 'cast',
  order: -50,
  flags: { cast: true },
  init: () => {
    void initCast()
    registerCommand('cast.openPanel', openCastPanel)
    registerBackHandler('cast', 56, () => {
      if (!useCast.getState().panelOpen) {
        return false
      }
      closeCastPanel()
      return true
    })
  },
  middleware: [{ order: 10, fn: castMiddleware }],
  slots: {
    'app.overlay': [{ id: 'panel', order: 26, render: () => <CastPanel /> }],
    'shell.me.item': [
      {
        id: 'cast',
        order: 41,
        render: () => (
          <button type="button" data-shell-row="" onClick={openCastPanel}>
            配角库
          </button>
        ),
      },
    ],
  },
})
