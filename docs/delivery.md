# Gaia 交付说明

## 这是什么

一个 WebView 应用：**web 层是 chat-demo 0.1.1 的干净 fork**（唯一真源），**原生壳只做浏览器做不到的事**。
没有任何 DOM 注入、没有 CSS Module hash 选择器、没有"两套界面"。

## 目录

```
<repo>\
├─ web\        chat-demo fork（React + rspack，含 platform 与 features）
├─ android\    最小壳：WebView + LocalServer + 桥（2 个 Java 文件）
├─ scripts\    build-all.ps1（tsc→边界检查→web 构建→APK）、check-deps.mjs
├─ docs\       architecture.md（架构与契约）、acceptance.md（实测验收）
└─ out\        gaia-1.0.2.apk
```

## 出包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File <repo>\scripts\build-all.ps1 `
  -VersionName 1.5.0 -VersionCode 1150
```

### 版本号规则（固定）

- **版本名**：`主.次.补`，每次出包 **+0.0.1**，补号到 9 进位：`1.5.9 → 1.6.0`。
- **版本码**：`1000 + 主次补三位` —— `1.5.0 → 1150`、`1.5.9 → 1159`、`1.6.0 → 1160`。
- **基线**：必须高于旧版 `1.4.7 / 1147`，因此从 **1.5.0 / 1150** 起算。只增不减，否则 `INSTALL_FAILED_VERSION_DOWNGRADE`。

## 手机运维通道

```powershell
# 写 API Key / 接口地址（只写非空值，其余不动）
adb shell am start -n com.gaia.app/.MainActivity --es apiKey sk-xxx
# 记忆阈值调参（默认 30 轮 / 保留 8 轮）；-1 恢复默认
adb shell am start -n com.gaia.app/.MainActivity --ei memoryTriggerTurns 2 --ei memoryKeepTurns 1
adb shell am start -n com.gaia.app/.MainActivity --ei memoryTriggerTurns -1 --ei memoryKeepTurns -1
# 调试：直接看运行期配置
adb forward tcp:47999 tcp:47831
curl http://127.0.0.1:47999/__gaia/config.js
```

## 坐标换算

预览截图（878 宽）× **1.64** = 设备像素（1440 宽）。adb 的 `tap/swipe` 用设备像素。

## 改一个功能时怎么不碰到别的

1. 只动 `web\src\features\<那一块>\`；
2. 跨块只能走：类型化事件（`platform/events`）、插槽（`platform/slots`）、装配注入（`app/compose.ts`）；
3. 改完跑 `build-all.ps1`，`check-deps.mjs` 会拦住任何跨块 import；
4. 单块可关闭：把它的 flag 置 false，应用照常启动，只剩这一块消失。

## 已知约束

- **端口固定 47831**：origin 变了 IndexedDB 就看不到历史，不要改。
- `android\build.ps1`、`scripts\build-all.ps1` 必须存成 **UTF-8 with BOM**（PowerShell 5.1 否则按 ANSI 读中文注释会吃掉下一行）。
- APK 里塞 assets 用 JDK 的 `jar --update --file`（aapt2 的 `-A` 在 Windows 写反斜杠；.NET ZipFile 在部分宿主类型不可用）。
- 安装前先 `am force-stop`，否则 `adb install -r` 可能"成功但没换版本"。
