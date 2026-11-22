import { defineBlock, registerBackHandler, registerSettingsOpener } from '../../platform/index.js'
import { SettingsPage } from './SettingsPage.js'
import { goBack, initSettingsUi, openSettingsPage, useSettingsUi } from './store.js'

/**
 * 设置积木：整屏竖排设置页（账户/应用/语音/位置/接入/其他）。
 * 注册接管点后，上游 SettingsDialog 不再渲染，任何 openSettings() 都转到这一页。
 */
export const settings = defineBlock({
  id: 'settings',
  order: 900,
  flags: { settings: true },
  init: () => {
    initSettingsUi()
    registerSettingsOpener((section) => {
      openSettingsPage(section === 'data' ? 'data' : 'root')
    })
    // 返回键：先回上一级，根页再退才交回原生
    registerBackHandler('settings', 70, () => {
      if (!useSettingsUi.getState().open) {
        return false
      }
      goBack()
      return true
    })
  },
  slots: {
    'app.overlay': [{ id: 'page', order: 30, render: () => <SettingsPage /> }],
    'shell.me.item': [
      {
        id: 'data',
        order: 45,
        render: () => (
          <button type="button" data-shell-row="" onClick={() => openSettingsPage('data')}>
            数据管理
          </button>
        ),
      },
      {
        id: 'settings',
        order: 90,
        render: () => (
          <button type="button" data-shell-row="" onClick={() => openSettingsPage('root')}>
            设置
          </button>
        ),
      },
    ],
  },
})
