import { useEffect, useMemo, useState } from 'react'
import { applySessionFilters } from '../../../platform/index.js'
import { useTranslate } from '../../../i18n/index.js'
import { groupSessions } from '../../../services/chat/sessionGroups.js'
import { newChat, selectSession, useChatStore } from '../../../services/chat/store.js'
import type { SessionSummary } from '../../../services/chat/types.js'
import { PlusIcon } from '../icons.js'
import { openChat } from '../store.js'
import styles from '../shell.module.css'

const pad = (value: number): string => String(value).padStart(2, '0')

/** 会话行右侧时间：今天给时分，昨天给「昨天」，一周内给星期，更早给日期 */
const listTime = (ts: number, now: number): string => {
  const date = new Date(ts)
  const sameDay = date.toDateString() === new Date(now).toDateString()
  if (sameDay) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }
  if (now - ts < 7 * 86400000) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const initial = (title: string): string => (title.trim() ? title.trim()[0] : '#')

/** 第一页「微信」：会话列表 + 右上「＋」（新建会话并直接进聊天页） */
export const ChatListPage = () => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const groups = useMemo(
    () => groupSessions(applySessionFilters(sessions), now, t),
    [sessions, now, t]
  )

  const open = (session: SessionSummary) => {
    selectSession(session.id)
    openChat()
  }

  return (
    <>
      <header className={styles.nav}>
        <div className={styles.navTitle}>微信</div>
        <button
          type="button"
          className={styles.navAction}
          aria-label={t('newChat')}
          onClick={() => {
            newChat()
            openChat()
          }}
        >
          <PlusIcon />
        </button>
      </header>
      <div className={styles.list}>
        {groups.length === 0 ? (
          <div className={styles.empty}>还没有会话，点右上角「＋」开始</div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className={styles.group}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={
                    session.id === activeId ? `${styles.row} ${styles.rowActive}` : styles.row
                  }
                  onClick={() => open(session)}
                >
                  <span className={styles.avatar}>{initial(session.title || t('untitledChat'))}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{session.title || t('untitledChat')}</span>
                  </span>
                  <span className={styles.rowTime}>{listTime(session.updatedAt, now)}</span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </>
  )
}
