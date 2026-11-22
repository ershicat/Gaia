import { defineBlock, registerBackHandler, registerCommand } from '../../platform/index.js'
import { useSettings } from '../../services/settings.js'
import { ProviderPage } from './ProviderPage.js'
import { goBackProviders, initProviders, openProviders, syncKeyFromSettings } from './store.js'

/**
 * 服务商预设积木：设置 → 接入 → 服务商。
 * 只负责"选谁、填哪把 Key、用哪个模型"，协议与地址由注册表写死；
 * 平台层只拿到一个 ApiTarget，services/api 不认识"服务商"这个概念。
 */
export const providers = defineBlock({
  id: 'providers',
  order: 210,
  flags: { providers: true },
  init: () => {
    initProviders()
    registerCommand('providers.open', openProviders)
    // 返回键优先级高于设置页（设置是 70）
    registerBackHandler('providers', 75, () => goBackProviders())
    // 上游「API Key」页改的是当前服务商的 Key：镜像进服务商表
    useSettings.subscribe(() => syncKeyFromSettings())
  },
  slots: {
    'app.overlay': [{ id: 'page', order: 40, render: () => <ProviderPage /> }],
    'shell.me.item': [
      {
        id: 'providers',
        order: 20,
        render: () => (
          <button type="button" data-shell-row="" onClick={openProviders}>
            服务商
          </button>
        ),
      },
    ],
  },
})
