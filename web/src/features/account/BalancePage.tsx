import { Button } from '../../components/base/Button.js'
import { Modal } from '../../components/base/Modal.js'
import styles from './account.module.css'
import { closeBalance, loadBalance, useAccount } from './store.js'

/** 余额页：只看官方 /user/balance，其余统计等记忆积木上来再合并展示 */
export const BalancePage = () => {
  const open = useAccount((state) => state.open)
  const loading = useAccount((state) => state.loading)
  const error = useAccount((state) => state.error)
  const snapshot = useAccount((state) => state.snapshot)

  if (!open) {
    return null
  }

  return (
    <Modal
      title="API 余额"
      closable
      onClose={closeBalance}
      footer={
        <Button variant="outlined" size="m" disabled={loading} onClick={() => void loadBalance()}>
          {loading ? '刷新中…' : '刷新'}
        </Button>
      }
    >
      <div className={styles.page}>
        {error ? <div className={styles.err}>{error}</div> : null}
        {snapshot
          ? snapshot.infos.map((info) => (
              <div key={info.currency} className={styles.card}>
                <div className={styles.sub}>剩余额度（{info.currency}）</div>
                <div className={styles.big}>{info.total}</div>
                <div className={styles.row}>
                  <span>赠送</span>
                  <span>{info.granted}</span>
                </div>
                <div className={styles.row}>
                  <span>充值</span>
                  <span>{info.toppedUp}</span>
                </div>
              </div>
            ))
          : null}
        {snapshot && !snapshot.available ? (
          <div className={styles.err}>账户不可用</div>
        ) : null}
        {snapshot ? (
          <div className={styles.sub}>
            更新于 {new Date(snapshot.fetchedAt).toLocaleTimeString()} · 数据来自官方接口
          </div>
        ) : null}
        {!snapshot && !error && loading ? <div className={styles.sub}>读取中…</div> : null}
      </div>
    </Modal>
  )
}
