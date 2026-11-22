import styles from './account.module.css'
import { openBalance, useAccount } from './store.js'

/** 设置弹窗里的入口行（放在「数据管理」分组的 API Key 下面） */
export const BalanceEntry = () => {
  const snapshot = useAccount((state) => state.snapshot)
  const first = snapshot?.infos[0]
  return (
    <button type="button" className={styles.entry} onClick={openBalance}>
      <span>API 余额</span>
      <span className={styles.entryValue}>{first ? `${first.total} ${first.currency}` : '查看 ›'}</span>
    </button>
  )
}
