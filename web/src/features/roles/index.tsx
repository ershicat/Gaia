import {
  defineBlock,
  registerBackHandler,
  registerCommand,
  registerSessionAttributor,
  registerTurnCompleteHandler,
} from '../../platform/index.js'
import { rolesMiddleware } from './middleware.js'
import { applyActiveBackground } from './background.js'
import { roleSessionFilter, sedimentProfile } from './sediment.js'
import {
  activeRole,
  closePage,
  initRoles,
  openEditor,
  openPage,
  roleAttribution,
  useRoles,
} from './store.js'
import { MessageMeta } from './ui/MessageMeta.js'
import { ContactsList } from './ui/ContactsList.js'
import { RoleBar } from './ui/RoleBar.js'
import { RolesOverlay } from './ui/RolesUI.js'
import { SessionRoleBadge } from './ui/SessionRoleBadge.js'
import { UserMeta } from './ui/UserMeta.js'

/**
 * 角色积木：存储 + 注入 + 归属过滤 + 画像沉淀 + 切换/管理/编辑界面。
 * 对外只暴露中间件、过滤器与三个槽位；状态在 roles/store.ts 里，别的积木不读它。
 */
export const roles = defineBlock({
  id: 'roles',
  order: -100,
  flags: { roles: true },
  init: () => {
    void initRoles().then(() => {
      // 聊天背景：进应用先套用一次，之后跟着角色切换/编辑实时刷新
      applyActiveBackground()
      useRoles.subscribe(applyActiveBackground)
    })
    // 会话归属：新建会话绑当前角色；导入的历史会话归系统自带角色且不注入人格
    registerSessionAttributor(roleAttribution)
    registerTurnCompleteHandler((sessionId) => {
      void sedimentProfile(sessionId)
    })
    registerCommand('roles.manage', () => openPage('manage'))
    registerCommand('roles.pick', () => openPage('pick'))
    registerCommand('roles.editActive', () => openEditor(activeRole().id))
    // 返回键：编辑页先回管理页，其余弹层直接关
    registerBackHandler('roles', 60, () => {
      const page = useRoles.getState().page
      if (page === null) {
        return false
      }
      if (page === 'edit') {
        openPage('manage')
      } else {
        closePage()
      }
      return true
    })
  },
  middleware: [{ order: -100, fn: rolesMiddleware }],
  sessionFilters: [roleSessionFilter],
  slots: {
    'sider.bottom': [{ id: 'bar', order: 0, render: () => <RoleBar /> }],
    // 微信壳「通讯录」页：添加联系人 + 群聊占位 + 角色卡列表
    'shell.contacts': [{ id: 'contacts', order: 0, mode: 'replace', render: () => <ContactsList /> }],
    'app.overlay': [{ id: 'overlay', order: 0, render: () => <RolesOverlay /> }],
    'message.meta': [
      {
        id: 'meta',
        order: 0,
        render: ({ message }) => (message.role === 'assistant' ? <MessageMeta /> : null),
      },
    ],
    'message.meta.user': [
      {
        id: 'usermeta',
        order: 0,
        render: () => <UserMeta />,
      },
    ],
    'sider.item.inline': [
      {
        id: 'badge',
        order: 0,
        render: ({ session }) => <SessionRoleBadge session={session} />,
      },
    ],
  },
})
