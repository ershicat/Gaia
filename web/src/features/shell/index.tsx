import { defineBlock, registerBackHandler, registerCommand } from '../../platform/index.js'
import { AppShell } from './AppShell.js'
import { closeChat, openChat, useShell } from './store.js'

/**
 * 微信外壳积木：整套应用骨架（底栏四页 + 聊天页压栈）。
 *
 * 只在「界面=微信」时接管整屏（app.root 槽位的 replace）；经典壳不受影响。
 * 页内容一律走槽位：通讯录由角色积木注入，我页入口由各功能积木各注册一行 ——
 * 壳不认识任何具体积木，以后加功能只往槽里塞，壳不用动。
 */
export const shell = defineBlock({
  id: 'shell',
  order: -200,
  flags: { shell: true },
  init: () => {
    // 别的积木（通讯录）要进聊天页时走这个命令，不直接 import 壳的状态
    registerCommand('shell.openChat', openChat)
    // 返回键：聊天页 → 列表。压在所有弹层之下（设置 70 / 服务商 75 …）、搜索面板 30 之下，
    // 高于抽屉 20 —— 也就是"先关弹层，再退页，最后才退应用"。
    registerBackHandler('shell', 25, () => {
      if (!useShell.getState().chatOpen) {
        return false
      }
      closeChat()
      return true
    })
  },
  slots: {
    'app.root': [
      {
        id: 'root',
        order: 0,
        mode: 'replace',
        render: () => <AppShell />,
      },
    ],
  },
})
