/**
 * 平台层（L0）：插槽 / 事件 / 请求管线 / 会话过滤器 / 对话只读句柄 / 开关 / 运行期参数。
 * 谁都可以 import 它，它不 import 任何业务实现（只允许 import type）。
 */
export { blockIds, compose, defineBlock } from './blocks.js'
export { registerBeforeReplyHandler, runBeforeReply } from './beforeReply.js'
export type { BeforeReplyHandler } from './beforeReply.js'
export { backHandlerNames, handleBack, registerBackHandler } from './back.js'
export type { BackHandler } from './back.js'
export { commandNames, registerCommand, runCommand } from './commands.js'
export type { Command } from './commands.js'
export { chat, hasChatBridge, setChatBridge } from './chat.js'
export type { ChatBridge } from './chat.js'
export {
  describeError,
  diagClear,
  diagEntries,
  diagError,
  diagInstall,
  diagRecord,
  diagSubscribe,
  diagVersion,
} from './diagnostics.js'
export type { DiagEntry, DiagLevel } from './diagnostics.js'
export { emit, on } from './events.js'
export { applySessionFilters, registerSessionFilter, sessionFilterCount } from './filters.js'
export type { SessionFilter } from './filters.js'
export { flagSnapshot, isEnabled, resetFlags, setFlags } from './flags.js'
export { hasFileSink, hasFileSharer, registerFileSharer, registerFileSink, saveFile, shareFile } from './files.js'
export type { FileSink } from './files.js'
export { currentLayout, setLayout, useLayout } from './layout.js'
export type { AppLayout } from './layout.js'
export { middlewareCount, registerMiddleware, runPipeline } from './pipeline.js'
export {
  clearProgress,
  HISTORY_IMPORT_TASK,
  progressOf,
  reportProgress,
  subscribeProgress,
} from './progress.js'
export type { ProgressState } from './progress.js'
export {
  activeRoleId,
  apiOrigin,
  appVersion,
  attributeSession,
  booleanOption,
  currentApiTarget,
  log,
  numberOption,
  registerSessionAttributor,
  safetyCheckEnabled,
  setActiveRoleId,
  setApiOrigin,
  setApiTarget,
  setAppVersion,
  setBooleanOption,
  setLogger,
  setNumberOption,
  setSafetyCheck,
  setTextOption,
  textOption,
} from './runtime.js'
export type { ApiAuth, ApiProtocol, ApiTarget, SessionAttribution, SessionSource } from './runtime.js'
export { Slot, slotSnapshot } from './slots.js'
export { setUserAvatar, setUserName, useUser, userAvatar, userName } from './user.js'
export {
  hasSettingsOpener,
  registerSettingsOpener,
  requestSettings,
} from './settings.js'
export type { SettingsOpener, SettingsSection } from './settings.js'
export { notifyTurnComplete, registerTurnCompleteHandler } from './turn.js'
export type { TurnCompleteHandler } from './turn.js'
export type {
  Block,
  RequestContext,
  RequestMiddleware,
  SlotEntry,
  SlotMode,
  SlotName,
  SlotPayloads,
  SlotRenderer,
} from './types.js'
