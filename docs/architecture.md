# Gaia 架构（积木式）

## 1. 三层，依赖单向

```
L0  platform/     插槽 / 事件 / 请求管线 / 会话过滤器 / 对话只读句柄 / 开关 / 运行期参数
L1  features/*/   每块功能一个目录，互相禁止 import
L2  app/compose   唯一允许同时看见多块（和上游 store）的地方
```

工具强制：

- `scripts/check-deps.mjs`：`features/A` 引用 `features/B` 直接构建失败；
  `platform` 不许引用 `features/`、`components/`，对 `services/` 只许 `import type`。
- 运行时：每个槽位独立 `ErrorBoundary` + 积木开关；一块崩了只那一块空白。

## 2. 积木模板

```
features/<name>/
├─ index.ts      register(ctx) 的入口（导出 defineBlock 结果）
├─ contract.ts   对外类型（别人只许 import 这个）
├─ store.ts      自己的状态切片
├─ storage.ts    自己的库名（gaia.<name>），别人不许碰
├─ middleware.ts 插入请求管线的部分
├─ slots.tsx     往哪个槽位渲染什么
└─ __tests__/    契约测试
```

## 3. 插槽语义（B0 定稿）

| mode | 行为 |
|---|---|
| `append`（默认） | 追加在上游内容之后 |
| `before` / `after` | 排在上游内容前/后，上游仍渲染 |
| `replace` | **上游原内容不渲染**，由积木接管整个槽位 |

`Slot` 的第三个参数 `fallback` 就是"上游原本要渲染的东西"；只要该槽位出现一个 `replace`，`fallback` 整体让位。

**已埋锚点**（上游一共只有这几处改动）：

| 槽位 | 位置 | 用处 |
|---|---|---|
| `sider.top` | Sider 顶部 | 用户行 |
| `sider.bottom` | Sider 底部 | 角色三件套 |
| `sider.item` | 会话行之后 | 角色徽标（**不用于过滤**） |
| `header.actions` | MobileHeader 右侧 | 预留 |
| `chat.aboveInput` | 输入区上方 | 语音条 / 附件面板等附加物 |
| `chat.input` | 整个 ChatInput（带 fallback） | **replace 覆盖上游输入区**（要自绘 ⊕/语音时用这一处） |
| `chat.belowInput` | 输入区下方 | 状态栏 |
| `message.*` | 消息组件内 | B3 接入时补锚点 |

## 4. 请求管线契约（B0 定稿）

上游只有一个请求装配点：`services/chat/store.ts` 的 `streamReply`。中间件**只允许做三类改写**：

1. 往 `system` 追加段落（角色提示词、技能正文、记忆摘要）
2. 声明丢弃"最早若干完整轮次"（`dropTurns`）+ 提供摘要正文（`compactedSummary`）
3. 设置 `temperature` / `model` / `safetyCheck` / `search` / `thinking`

**禁止**：
- 改动最近 8 轮与最后一条 assistant（续写与分支切换依赖它们）
- 直接改 `messages` 数组（只能用 `dropTurns` 表达，由 store 统一执行）

**续写互斥**：`prefixEnabled=false` 时 store 不传续写前缀。压缩或任何重写历史的中间件必须同时置 `false`，否则会出现"续写内容重复"。

> 状态：字段与 `prefixEnabled` 已生效；`dropTurns`/`compactedSummary` 的实际执行在 B4（memory 积木）落地，届时加单测锁住"最近 8 轮不动"。

## 5. 只读句柄：对话数据（B0 定稿）

`memory`/`roles` 需要读会话历史，但不能 import `chat` 积木，也不能 import 上游 store。

由 `app/compose.ts` 注入：

```ts
setChatBridge({
  listSessions, activeSessionId, getSession, getMessages,   // 全部只读
})
```

积木侧只 `import { chat } from '../../platform/index.js'`。写操作一律回到上游 store 既有 API。

## 6. 会话过滤器（数据层，B0 定稿）

"按角色过滤会话"不是槽位，是数据层：

```ts
// features/roles/index.ts
sessionFilters: [ (list) => list.filter(s => roleOf(s) === activeRole()) ]
```

上游 `Sider` 在 `groupSessions` **之前**套用 `applySessionFilters`，所以不会出现"先渲染再隐藏"的闪烁。
`sider.item` 只负责角色徽标这类渲染增强。

## 7. 宿主契约

原生只提供能力，不画 UI：

```ts
window.__GAIA_CONFIG__  // 只读：apiBase / apiKey(仅有无) / roles / activeRole / user / flags / appVersion
window.__GAIA_BRIDGE__  // 命令：share / pickAttach / navigate / log / appVersion（全部可选）
window.__GAIA_EVENTS__  // 事件：rolesChanged / userChanged / prefsChanged / importProgress
```

原生代码：`MainActivity`（唯一 Activity）+ `LocalServer`（静态资源 + `/__gaia/config.js`）。
端口固定 **47831**：origin 变了 IndexedDB 就"看不见"，所以必须固定；刻意避开旧包的 47821，防止两个包同机抢端口导致 origin 漂移。

**运维通道**：启动时可以用 intent extra 写入配置，免去在手机上逐字输入。
```powershell
adb shell am start -n com.gaia.app/.MainActivity --es apiKey sk-xxx --es apiBase https://api.deepseek.com
# 记忆阈值调参（默认 30 轮 / 保留 8 轮）；传 -1 清除调参回到默认
adb shell am start -n com.gaia.app/.MainActivity --ei memoryTriggerTurns 2 --ei memoryKeepTurns 1
adb shell am start -n com.gaia.app/.MainActivity --ei memoryTriggerTurns -1 --ei memoryKeepTurns -1
```
只写非空值，其余配置不受影响。原生侧有 Key 时，`host` 积木会自动登记到上游设置里（用户只需在任意一端配置一次）。

**调试通道**：`adb forward tcp:47999 tcp:47831` 后可直接 `curl http://127.0.0.1:47999/__gaia/config.js` 看运行期配置（密钥会被回显，注意别贴出去）。

## 8. 构建

```powershell
# 一条命令：tsc → 依赖图检查 → web 构建 → APK
powershell -NoProfile -ExecutionPolicy Bypass -File <repo>\scripts\build-all.ps1 `
  -VersionName 0.1.0 -VersionCode 100
```

坑（已踩过，写死在这）：

- `.ps1` 必须存成 **UTF-8 with BOM**，否则 Windows PowerShell 5.1 按 ANSI 解码，中文注释会把后面整行吃进字符串里。
- APK 里塞 assets 用 **JDK 的 `jar --update --file`**：`aapt2 -A` 在 Windows 上写反斜杠条目，`.NET ZipFile` 在部分宿主下类型不可用。
- `apksigner verify` 的输出要先收集成变量再截取，直接管道 `Select-Object -First N` 会提前断管道导致退出码非 0。

## 9. 当前进度

| 批 | 内容 | 状态 |
|---|---|---|
| B0 | 平台层（插槽/事件/管线/过滤器/只读句柄/轮次通知）+ 空装配 | ✅ 装包 0.1.0，界面=官方 |
| B1 | `host` 真桥（原生只提供能力：分享/选图/日志/版本） | ✅ 随 B0 落地 |
| B2 | `roles`：IndexedDB 存储、内置 Gaia、注入中间件、切换/管理/编辑、消息角色标识 | ✅ 0.2.0/0.2.1 真机 |
| B3-1 | `usage`：底部状态栏（token / 缓存命中 / 上下文） | ✅ 0.3.0 |
| B3-2 | `account`：余额页 + 设置入口（`settings.extra` 锚点） | ✅ 0.4.0 真机 |
| B4-1 | `memory`：滚动抽取式摘要 + 关键词召回 + 预算表 + `dropTurns`/prefix 互斥 | ✅ 0.4.0 |
| B4-2 | 群组口子：`session.kind` / `session.roleIds` / `message.senderRoleId` / `buildPersonaBlocks` | ✅ 类型与签名就位 |
| B4-3 | 用户画像每轮沉淀 | ⬜ 下一批 |
| B4-4 | 记忆面板（回看/编辑摘要） | ⬜ 下一批 |

已装配积木：`host, roles, memory, usage, account`。

**记忆实现选择**：M1 用**抽取式摘要**（每轮压成「问 → 答要点」，超 2000 token 丢最旧），不额外调 API——零成本、零延迟、不会失败。要换成模型摘要只需替换 `features/memory/summarize.ts` 的 `buildSummaryText`，中间件与存储不用动。

**说明**：长按菜单、⊕ 面板、语音条**不复刻**——上游自带完整实现。需要整块覆盖时用 `chat.input` 的 `replace` 语义。
