import { Slot } from '../../../platform/index.js'
import styles from '../shell.module.css'

/**
 * 第四页「我」：用户身份卡 + 各积木注册的入口行（设置 / 余额 / 服务商 / 主题商城 / 记忆 / 诊断 / 数据 / 公告）。
 * 行样式由壳统一给（[data-shell-row]），积木只写文案和点击，不用care间距。
 */
export const MePage = () => (
  <>
    <header className={styles.nav}>
      <div className={styles.navTitle}>我</div>
    </header>
    <div className={styles.scroll}>
      <Slot name="shell.me.header" payload={{}} fallback={null} />
      <div className={styles.rows}>
        <Slot name="shell.me.item" payload={{}} fallback={null} />
      </div>
    </div>
  </>
)
