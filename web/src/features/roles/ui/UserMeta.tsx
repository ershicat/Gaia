import { useUser } from '../../../platform/index.js'
import styles from '../roles.module.css'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '我')

/** 用户消息右上角的标识：有昵称时显示昵称 + 头像，否则只显示头像（订阅式，改完立刻生效） */
export const UserMeta = () => {
  const name = useUser((state) => state.name)
  const avatar = useUser((state) => state.avatar)
  const display = name || '我'

  return (
    <div className={styles.userMeta}>
      {name ? <span className={styles.userMetaName}>{name}</span> : null}
      <span className={styles.avatarXs}>
        {avatar ? (
          <img className={styles.avatarImg} src={avatar} alt={display} />
        ) : (
          initial(display)
        )}
      </span>
    </div>
  )
}
