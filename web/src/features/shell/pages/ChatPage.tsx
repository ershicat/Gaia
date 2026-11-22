import { useTranslate } from '../../../i18n/index.js'
import { useChatStore } from '../../../services/chat/store.js'
import { SessionView } from '../../../components/session/SessionView.js'
import { ChatInput } from '../../../components/chatInput/ChatInput.js'
import { BackIcon } from '../icons.js'
import { closeChat } from '../store.js'
import styles from '../shell.module.css'

/**
 * 聊天页（压栈页）：顶栏自己画（返回 + 标题），正文交给上游的 SessionView。
 * 没有会话（刚点「＋」或刚选完角色）时走空白页：一句问候 + 输入框，发第一条就建会话。
 */
export const ChatPage = () => {
  const t = useTranslate()
  const activeId = useChatStore((state) => state.activeId)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  // 会话还在加载时 activeId 已经有值、session 还没有：先别画空白页，等它到
  const loading = activeId !== null && !session
  const title = session?.title || t('untitledChat')

  return (
    <>
      <header className={styles.nav}>
        <button type="button" className={styles.navBack} aria-label="返回" onClick={closeChat}>
          <BackIcon />
        </button>
        <div className={styles.navTitle}>{title}</div>
      </header>
      <div className={styles.chatBody}>
        {session ? (
          <SessionView session={session} streaming={streaming} siderCollapsed={false} bare />
        ) : loading ? (
          <div className={styles.empty}>{t('sessionLoading')}</div>
        ) : (
          <div className={styles.blankChat}>
            <div className={styles.blankGreeting}>{t('welcomeMessageChat250808')}</div>
            <div className={styles.blankInput}>
              <ChatInput sessionId={null} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
