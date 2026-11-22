import { MomentsIcon } from '../icons.js'
import styles from '../shell.module.css'

/** 第三页「朋友圈」：本期只放占位，不请求网络、不生成内容 */
export const MomentsPage = () => (
  <>
    <header className={styles.nav}>
      <div className={styles.navTitle}>朋友圈</div>
    </header>
    <div className={styles.scroll}>
      <div className={styles.moments}>
        <span className={styles.momentsIcon}>
          <MomentsIcon />
        </span>
        <div className={styles.momentsTitle}>朋友圈还没做</div>
        <div className={styles.momentsTip}>这一页会留给你和角色发动态，现在先占个位子</div>
      </div>
    </div>
  </>
)
