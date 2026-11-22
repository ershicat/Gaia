import { defineBlock, registerBackHandler, registerCommand } from '../../platform/index.js'
import { closeThemeMarket, initTheme, openThemeMarket, useThemeStore } from './store.js'
import { ThemeMarketPage } from './ui/ThemeMarketPage.js'

/**
 * 主题积木：主题商城（主题 / 气泡 / 背景）。
 * 只往 <html> 上写 data 属性，样式在 theme.module.css 里用 :global() 挂上去；
 * 默认项不写任何规则，等于保持当前的 DeepSeek 观感。
 */
export const theme = defineBlock({
  id: 'theme',
  order: 0,
  init: () => {
    initTheme()
    registerCommand('theme.openMarket', openThemeMarket)
    registerBackHandler('theme', 60, () => {
      if (!useThemeStore.getState().open) {
        return false
      }
      closeThemeMarket()
      return true
    })
  },
  slots: {
    'app.overlay': [{ id: 'market', order: 30, render: () => <ThemeMarketPage /> }],
    'shell.me.item': [
      {
        id: 'market',
        order: 30,
        render: () => (
          <button type="button" data-shell-row="" onClick={openThemeMarket}>
            主题商城
          </button>
        ),
      },
    ],
  },
})
