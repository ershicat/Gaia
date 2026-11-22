import { defineBlock, registerBackHandler, registerCommand } from '../../platform/index.js'
import { BalanceEntry } from './BalanceEntry.js'
import { BalancePage } from './BalancePage.js'
import { closeBalance, openBalance, useAccount } from './store.js'

/** 账户积木：官方余额页 + 设置入口 */
export const account = defineBlock({
  id: 'account',
  order: 200,
  flags: { account: true },
  init: () => {
    registerCommand('account.openBalance', openBalance)
    registerBackHandler('account', 50, () => {
      if (!useAccount.getState().open) {
        return false
      }
      closeBalance()
      return true
    })
  },
  slots: {
    'settings.extra': [{ id: 'entry', order: 0, render: () => <BalanceEntry /> }],
    'app.overlay': [{ id: 'page', order: 20, render: () => <BalancePage /> }],
    'shell.me.item': [
      {
        id: 'balance',
        order: 10,
        render: () => (
          <button type="button" data-shell-row="" onClick={openBalance}>
            余额
          </button>
        ),
      },
    ],
  },
})
