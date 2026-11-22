import { Slot } from '../../../platform/index.js'
import styles from '../shell.module.css'

/**
 * 第二页「通讯录」：壳只负责顶栏和滚动容器，
 * 「添加联系人」「群聊（暂不可点）」「角色卡列表」全部由角色积木注入。
 */
export const ContactsPage = () => (
  <>
    <header className={styles.nav}>
      <div className={styles.navTitle}>通讯录</div>
    </header>
    <div className={styles.scroll}>
      <Slot name="shell.contacts" payload={{}} fallback={<div className={styles.empty}>通讯录没加载出来</div>} />
    </div>
  </>
)
