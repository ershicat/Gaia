import { defineBlock, registerBackHandler } from '../../platform/index.js'
import { closeIntro, openIntro, syncIntro, useIntro } from './store.js'
import { IntroOverlay } from './ui/IntroPage.js'

/**
 * 开屏公告积木：装上含新版本号的包后，第一次打开满屏列出这一版改了什么。
 * 只占一个 app.overlay 位；关掉后按「版本号」记住，同一版本不再自动弹。
 */
export const intro = defineBlock({
  id: 'intro',
  order: 900,
  flags: { intro: true },
  init: () => {
    // 宿主片的 init 更早，这里能拿到真实版本号
    syncIntro()
    // 返回键先关公告，不要直接退到桌面
    registerBackHandler('intro', 80, () => {
      if (!useIntro.getState().open) {
        return false
      }
      closeIntro()
      return true
    })
  },
  slots: {
    'app.overlay': [
      {
        id: 'page',
        order: 0,
        render: () => <IntroOverlay />,
      },
    ],
    'shell.me.item': [
      {
        id: 'intro',
        order: 60,
        render: () => (
          <button type="button" data-shell-row="" onClick={openIntro}>
            更新公告
          </button>
        ),
      },
    ],
  },
})
