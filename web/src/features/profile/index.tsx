import { defineBlock } from '../../platform/index.js'
import { applyProfile } from './store.js'
import { MeCard } from './ui/MeCard.js'
import { ProfileEditor, UserRow } from './ui/UserRow.js'

/**
 * 用户资料积木：侧栏顶部显示头像+昵称，可改；改完消息里的用户标识立即跟着变。
 * 数据存本地（localStorage），启动时同步给平台，供 {{user}} 与消息头像读取。
 */
export const profile = defineBlock({
  id: 'profile',
  order: 5,
  flags: { profile: true },
  init: () => {
    applyProfile()
  },
  slots: {
    'sider.title': [
      {
        id: 'user',
        order: 0,
        mode: 'replace',
        render: () => <UserRow />,
      },
    ],
    'app.overlay': [{ id: 'editor', order: 40, render: () => <ProfileEditor /> }],
    // 微信壳「我」页顶部身份卡
    'shell.me.header': [{ id: 'card', order: 0, mode: 'replace', render: () => <MeCard /> }],
  },
})
