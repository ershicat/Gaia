# Gaia

一个 Android WebView 应用：前端是 DeepSeek 官方 [chat-demo](https://github.com/deepseek-ai/chat-demo) 0.1.1 的干净 fork，
自己重写了平台层与全部功能块；原生壳只做浏览器做不到的事（本地静态服务、录音权限、文件落盘、返回键分级）。

**本仓库公开可查看，但不授予任何开源许可**（见下方「许可与版权」）。

---

## 它现在能做什么

| 域 | 能力 |
|---|---|
| 角色 | 内置角色 + 自建角色（头像、温度、系统提示词、开场白、技能、画像）；角色卡按 SillyTavern V2 导入导出 |
| 记忆 | 摘要压缩 / 长期记忆文件库（`/profile.md`、`/topics/*`、`/people/*`…）/ 会话档案卡（防 OOC）/ 原文档案召回 |
| 配角 | 每个会话一套配角档案，命中触发词或标「常驻」才进上下文，不进 system |
| 主题 | 5 套配色 + 5 种气泡（含透明毛玻璃）+ 5 种背景 + 两套界面骨架（经典 / 微信四页壳） |
| 接入 | 13 家服务商预设 + 自定义网关；OpenAI 兼容与 Anthropic 原生两套协议 |
| 运维 | 诊断日志、API 余额、数据导入导出、更新公告 |

功能全表、默认值、已知坑与版本日志都在 [`docs/功能库.md`](docs/功能库.md)——那份文件是唯一真源。

## 架构：三层积木，依赖单向

```
L0  web/src/platform/     插槽 / 事件 / 请求管线 / 会话过滤器 / 只读句柄 / 开关 / 运行期参数
L1  web/src/features/*/   每块功能一个目录，互相禁止 import
L2  web/src/app/compose   唯一允许同时看见多块（和上游 store）的地方
```

约束由工具强制：`scripts/check-deps.mjs` 会在跨块 import 时直接让构建失败。
每个槽位独立 `ErrorBoundary` + 积木开关，一块崩了只那一块空白。

已装积木（13 块）：`host` `profile` `roles` `cast` `memory` `usage` `account` `providers`
`settings` `theme` `intro` `diagnostics` `shell`。

细节见 [`docs/architecture.md`](docs/architecture.md)、[`docs/delivery.md`](docs/delivery.md)。

## 目录

```
web/               前端（React 18 + rspack + zustand + TypeScript strict）
  src/platform/    L0 平台层
  src/features/    L1 积木
  src/app/         L2 装配 + 启动兜底
  src/components/  上游组件
  src/services/    上游服务（chat store / api / settings / db）
android/           壳：WebView + LocalServer + 桥（2 个 Java 文件），+ 资源 + 构建脚本
scripts/           build-all.ps1（tsc → 边界检查 → web 构建 → APK）、check-deps.mjs
docs/              架构 / 交付 / 验收 / 实现方案 / 功能库
```

## 构建

前置：Node 22.12+、pnpm、**JDK 17**（`JAVA_HOME`）、**Android SDK**（`ANDROID_HOME`，需 build-tools 36 与 android-36）、PowerShell。

```powershell
cd web
pnpm install
cd ..

# 只构建前端（产物在 web/dist）
cd web; pnpm run build

# 出 APK：签名材料不在仓库里，必须自己传
pwsh ./scripts/build-all.ps1 -VersionName 1.8.15 -VersionCode 1208 `
  -Keystore C:\path\to\your.jks -KsPass <storepass> -KsAlias <alias>
```

`scripts/build-all.ps1` 与本仓所有 `.ps1` **必须保存为 UTF-8 with BOM**，
否则 PowerShell 5.1 会按 ANSI 读中文注释，把下一行吃掉。

## 版本规则

- **版本名** `主.次.补`，正式版 `+0.0.1`；过程版不动版本名，只标 `beta.N`。
- **版本码**只增不减（否则 `INSTALL_FAILED_VERSION_DOWNGRADE`）。
  早期用 `1000 + 主次补三位`，现在是在此之上顺 beta 递增。
- 版本日志见 [`docs/功能库.md` §6](docs/功能库.md)。

## 许可与版权

**本仓库不附带任何开源许可证，保留所有权利。**

- 代码公开是为了可查看、可审阅、可讨论，**不构成**再分发、商用、改作或衍生作品的授权。
- `web/` 目录源自 DeepSeek 的 chat-demo（MIT），该部分仍受其原始 MIT 条款约束；
  请以 <https://github.com/deepseek-ai/chat-demo> 的 LICENSE 为准。
- 应用名「Gaia」、图标与提示词文案不随代码一并授权。

如需引用或二次使用，请先开 issue 联系。
