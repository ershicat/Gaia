import clsx from 'clsx'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { Slot } from '../../platform/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './SessionView.module.css'

/** 会话页：标题栏（移动端为顶栏）+ 消息列表，输入框吸底；bare 时顶栏交给外壳画 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
  bare = false,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
  bare?: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const title = session.title || t('untitledChat')
  return (
    <div className={styles.view} data-chat-surface="">
      {bare ? null : isMobile ? (
        <MobileHeader title={title} />
      ) : (
        <div className={styles.header}>
          <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}>
            {title}
          </div>
        </div>
      )}
      <MessageList
        session={session}
        streaming={streaming}
        footer={
          <div className={styles.inputContainer} data-gaia-input-dock="">
            <Slot name="chat.aboveInput" payload={{ sessionId: session.id }} />
            <Slot
              name="chat.input"
              payload={{ sessionId: session.id }}
              fallback={<ChatInput sessionId={session.id} />}
            />
            <Slot
              name="chat.belowInput"
              payload={{ sessionId: session.id, streaming }}
            />
          </div>
        }
      />
    </div>
  )
}
