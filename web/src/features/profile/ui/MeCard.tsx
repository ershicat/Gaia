import styles from '../profile.module.css'
import { openProfileEditor, useProfile } from '../store.js'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '我')

/** 微信壳「我」页顶部的身份卡：大头像 + 昵称，点开就是原来的资料编辑 */
export const MeCard = () => {
  const name = useProfile((state) => state.name)
  const avatar = useProfile((state) => state.avatar)
  const display = name || '我'

  return (
    <button type="button" data-shell-header="" className={styles.meCard} onClick={openProfileEditor}>
      <span className={styles.meAvatar}>
        {avatar ? <img className={styles.avatarImg} src={avatar} alt="" /> : initial(display)}
      </span>
      <span className={styles.meText}>
        <span className={styles.meName}>{display}</span>
        <span className={styles.meHint}>点头像和昵称可修改</span>
      </span>
    </button>
  )
}
