import { runCommand } from '../../../platform/index.js'
import { selectSession, useChatStore } from '../../../services/chat/store.js'
import type { SessionSummary } from '../../../services/chat/types.js'
import { openEditor, setActiveRole, useRoles } from '../store.js'
import styles from '../roles.module.css'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '?')

/** 该角色最近的一条会话（按 updatedAt）；没有就返回 null，由调用方开新会话 */
const latestSessionOf = (roleId: string): SessionSummary | null =>
  useChatStore
    .getState()
    .sessions.filter((session) => (session.roleIds ?? []).includes(roleId))
    .reduce<SessionSummary | null>(
      (best, session) => (!best || session.updatedAt > best.updatedAt ? session : best),
      null
    )

/**
 * 微信壳「通讯录」页内容（由角色积木注入）。
 *
 * 结构照微信：最上面「添加联系人」= 新建角色卡；「群聊」暂时不能点（功能库 §10 未开工）；
 * 下面是角色卡列表，点一个 = 切到该角色并进入与他的最近一条会话（没有则进新会话页）。
 */
export const ContactsList = () => {
  const roles = useRoles((state) => state.roles)
  const activeId = useRoles((state) => state.activeId)

  const openRole = async (roleId: string): Promise<void> => {
    const target = latestSessionOf(roleId)
    await setActiveRole(roleId)
    if (target) {
      selectSession(target.id)
    }
    runCommand('shell.openChat')
  }

  return (
    <>
      <button
        type="button"
        data-shell-row=""
        className={styles.contactRow}
        onClick={() => openEditor(null)}
      >
        <span className={`${styles.contactBadge} ${styles.contactBadgeAdd}`}>＋</span>
        <span className={styles.contactLabel}>添加联系人</span>
      </button>
      <button type="button" data-shell-row="" className={styles.contactRow} disabled>
        <span className={`${styles.contactBadge} ${styles.contactBadgeMuted}`}>⋯</span>
        <span className={styles.contactLabel}>群聊</span>
        <span className={styles.contactHint}>还没做</span>
      </button>
      <div className={styles.contactSectionLabel}>联系人</div>
      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          data-shell-row=""
          className={styles.contactRow}
          onClick={() => {
            void openRole(role.id)
          }}
        >
          <span className={styles.avatar}>
            {role.avatar ? (
              <img className={styles.avatarImg} src={role.avatar} alt="" />
            ) : (
              initial(role.name)
            )}
          </span>
          <span className={styles.contactLabel}>{role.name}</span>
          {role.id === activeId ? <span className={styles.contactHint}>当前</span> : null}
        </button>
      ))}
    </>
  )
}
