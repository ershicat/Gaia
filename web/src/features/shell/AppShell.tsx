import { Component, type ReactNode } from 'react'
import { setLayout, useLayout } from '../../platform/index.js'
import { useMobileViewport, usePreventPageScroll } from '../../app/viewport.js'
import { ChatListPage } from './pages/ChatListPage.js'
import { ChatPage } from './pages/ChatPage.js'
import { ContactsPage } from './pages/ContactsPage.js'
import { MePage } from './pages/MePage.js'
import { MomentsPage } from './pages/MomentsPage.js'
import { ChatIcon, ContactsIcon, MeIcon, MomentsIcon } from './icons.js'
import { setTab, useShell, type ShellTab } from './store.js'
import styles from './shell.module.css'

/**
 * 壳崩了不能白屏：接住渲染错误，把界面切回经典壳（一次），并留日志。
 * 不弹 toast 是因为文案要进 i18n，且这里已经在异常路径上，简单点更稳。
 */
class ShellBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('[shell] 微信壳渲染失败，已切回经典界面', error)
    setLayout('classic')
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

const TABS: { id: ShellTab; label: string; icon: ReactNode }[] = [
  { id: 'chat', label: '微信', icon: <ChatIcon /> },
  { id: 'contacts', label: '通讯录', icon: <ContactsIcon /> },
  { id: 'moments', label: '朋友圈', icon: <MomentsIcon /> },
  { id: 'me', label: '我', icon: <MeIcon /> },
]

const Page = ({
  active,
  chat = false,
  children,
}: {
  active: boolean
  chat?: boolean
  children: ReactNode
}) => (
  <div
    className={
      chat
        ? `${styles.page} ${styles.pageChat} ${active ? styles.pageActive : ''}`
        : active
          ? `${styles.page} ${styles.pageActive}`
          : styles.page
    }
  >
    {children}
  </div>
)

/**
 * 微信式外壳：底栏四页 + 聊天页压栈。
 * 内容不在这里写死——通讯录、我页的入口都由各积木注册到槽位里，壳只提供骨架。
 * 非当前页用显示/隐藏而不是卸载，回来时列表滚动位置还在。
 */
export const AppShell = () => {
  const layout = useLayout((state) => state.layout)
  const { tab, chatOpen } = useShell()
  const frameRef = useMobileViewport(true)
  usePreventPageScroll(true)

  // 切回经典壳的瞬间不要留一个半截的壳在屏幕上
  if (layout !== 'wechat') {
    return null
  }

  return (
    <ShellBoundary>
      <div className={styles.root} ref={frameRef} data-shell-root="">
        <div className={styles.stage}>
          <Page active={!chatOpen && tab === 'chat'}>
            <ChatListPage />
          </Page>
          <Page active={!chatOpen && tab === 'contacts'}>
            <ContactsPage />
          </Page>
          <Page active={!chatOpen && tab === 'moments'}>
            <MomentsPage />
          </Page>
          <Page active={!chatOpen && tab === 'me'}>
            <MePage />
          </Page>
          <Page active={chatOpen} chat>
            <ChatPage />
          </Page>
        </div>
        {chatOpen ? null : (
          <nav className={styles.tabbar} aria-label="主导航">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                className={id === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                aria-current={id === tab ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {icon}
                <span className={styles.tabLabel}>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </ShellBoundary>
  )
}
