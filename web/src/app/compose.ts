import { account } from '../features/account/index.js'
import { cast } from '../features/cast/index.js'
import { diagnostics } from '../features/diagnostics/index.js'
import { host } from '../features/host/index.js'
import { intro } from '../features/intro/index.js'
import { memory } from '../features/memory/index.js'
import { profile } from '../features/profile/index.js'
import { providers } from '../features/providers/index.js'
import { roles } from '../features/roles/index.js'
import { settings } from '../features/settings/index.js'
import { shell } from '../features/shell/index.js'
import { theme } from '../features/theme/index.js'
import { usage } from '../features/usage/index.js'
import { compose, on, registerBackHandler, setChatBridge } from '../platform/index.js'
import { useChatStore, newChat } from '../services/chat/store.js'
import { useSettings } from '../services/settings.js'
import { closeSearchPanel, useSearchPanel } from '../components/search/searchPanelState.js'
import { closeMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'

/**
 * 装配表：全应用唯一同时知道多个积木（以及上游 store）的地方。
 *
 * 三件事：
 * 1. 把上游 store 的「只读」能力注入平台，供 memory / roles 等积木使用（它们不 import chat）
 * 2. 注册积木
 * 3. 从这里可以一眼看全"装了哪些块"
 */
export const bootstrap = (): void => {
  // 只读句柄：积木不能通过它写会话
  setChatBridge({
    listSessions: () => useChatStore.getState().sessions,
    activeSessionId: () => useChatStore.getState().activeId,
    getSession: (sessionId) => useChatStore.getState().sessionCache[sessionId],
    getMessages: (sessionId) => useChatStore.getState().sessionCache[sessionId]?.messages ?? [],
    apiKey: () => useSettings.getState().apiKey ?? null,
  })

  // 上游的两层浮层也纳入返回栈：搜索结果面板 > 移动端抽屉
  registerBackHandler('searchPanel', 30, () => {
    if (useSearchPanel.getState().entry === null) {
      return false
    }
    closeSearchPanel()
    return true
  })
  registerBackHandler('mobileSider', 20, () => {
    if (!useMobileSider.getState().open) {
      return false
    }
    closeMobileSider()
    return true
  })

  compose([host, profile, roles, cast, memory, usage, account, providers, settings, theme, intro, diagnostics, shell])

  // 切换角色 = 换一套会话空间：回到首页，不留在上一个角色的会话里
  on('roles:activeChanged', () => {
    newChat()
  })
}
