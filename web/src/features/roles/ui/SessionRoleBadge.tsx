import type { SessionSummary } from '../../../services/chat/types.js'
import styles from '../roles.module.css'
import { useRoles } from '../store.js'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '?')

/**
 * 侧栏会话行上的角色徽标：颜色圆点 + 首字母。
 * 没有归属的历史会话不显示，避免旧数据被"贴标签"。
 */
export const SessionRoleBadge = ({ session }: { session: SessionSummary }) => {
  const roles = useRoles((state) => state.roles)
  const roleId = session.roleIds?.[0]
  if (!roleId) {
    return null
  }
  const role = roles.find((item) => item.id === roleId)
  if (!role) {
    return null
  }
  return (
    <span className={styles.badge} title={role.name}>
      {role.avatar ? (
        <img className={styles.avatarImg} src={role.avatar} alt={role.name} />
      ) : (
        initial(role.name)
      )}
    </span>
  )
}
