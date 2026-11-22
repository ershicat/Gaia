import { activeRole, useRoles } from '../store.js'
import styles from '../roles.module.css'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '?')

/** 助手消息左上角的角色标识：小头像 + 名字 */
export const MessageMeta = () => {
  const roles = useRoles((state) => state.roles)
  const activeId = useRoles((state) => state.activeId)
  const role = roles.find((item) => item.id === activeId) ?? activeRole()

  return (
    <div className={styles.meta}>
      <span className={styles.avatarXs}>
        {role.avatar ? <img className={styles.avatarImg} src={role.avatar} alt="" /> : initial(role.name)}
      </span>
      <span className={styles.metaName}>{role.name}</span>
    </div>
  )
}
