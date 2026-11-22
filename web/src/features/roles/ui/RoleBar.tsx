import styles from '../roles.module.css'
import { activeRole, openPage, useRoles } from '../store.js'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '?')

/** 侧栏底部：当前角色（点头像/名字打开切换半屏） */
export const RoleBar = () => {
  const roles = useRoles((state) => state.roles)
  const activeId = useRoles((state) => state.activeId)
  const role = roles.find((item) => item.id === activeId) ?? activeRole()

  return (
    <button type="button" className={styles.bar} onClick={() => openPage('pick')}>
      <span className={styles.avatarS}>
        {role.avatar ? (
          <img className={styles.avatarImg} src={role.avatar} alt="" />
        ) : (
          initial(role.name)
        )}
      </span>
      <span className={styles.name}>{role.name}</span>
    </button>
  )
}
