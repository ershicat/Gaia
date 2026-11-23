import { useState } from 'react'
import { Button } from '../../../components/base/Button.js'
import { Modal } from '../../../components/base/Modal.js'
import { chat, hasChatBridge, numberOption, runCommand } from '../../../platform/index.js'
import { useSettings } from '../../../services/settings.js'
import { KEEP_RECENT_TURNS, TRIGGER_TURNS } from '../budget.js'
import type { MemoryFile } from '../files.js'
import styles from '../memory.module.css'
import { splitTurns } from '../storage.js'
import {
  clearSummary,
  closeMemoryPanel,
  compressIfNeeded,
  maybeBuildCard,
  removeCard,
  removeMemoryFile,
  runConsolidation,
  summaryOf,
  upsertMemoryFile,
  useMemory,
} from '../store.js'
import { renderCard } from '../card.js'
import { isStoryPath, renderCanonIndex, storyFilesForRole, storyIndexFor } from '../story.js'
import { storyRoleOf } from '../storySession.js'

/** 单个记忆文件：查看/编辑标题、描述、正文，或删除整个文件 */
const FileEditor = ({ file, onClose }: { file: MemoryFile; onClose: () => void }) => {
  const [draft, setDraft] = useState<MemoryFile>({ ...file })
  return (
    <Modal
      title={`记忆 · ${draft.title || draft.path}`}
      closable
      onClose={onClose}
      footer={
        <>
          <Button
            variant="dangerOutlined"
            size="m"
            onClick={() => {
              void removeMemoryFile(draft.path).then(onClose)
            }}
          >
            删除
          </Button>
          <Button
            size="m"
            onClick={() => {
              void upsertMemoryFile(draft).then(onClose)
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        <div className={styles.tip}>{draft.path}</div>
        <input
          className={styles.input}
          value={draft.title}
          placeholder="标题（界面上显示的名字）"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <input
          className={styles.input}
          value={draft.description}
          placeholder="一句话描述"
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
        <textarea
          className={styles.textarea}
          rows={10}
          value={draft.content}
          placeholder="一行一条事实"
          onChange={(event) => setDraft({ ...draft, content: event.target.value })}
        />
        <div className={styles.tip}>只影响发给模型的内容，不会修改历史对话。</div>
      </div>
    </Modal>
  )
}

/** 记忆面板：摘要压缩 + 长期记忆（文件库）+ 手动触发整理 */
export const MemoryPanel = () => {
  const open = useMemory((state) => state.panelOpen)
  const summaries = useMemory((state) => state.summaries)
  const files = useMemory((state) => state.files)
  const consolidating = useMemory((state) => state.consolidating)
  const lastRun = useMemory((state) => state.lastRun)
  const autoCompress = useSettings((state) => state.autoCompress)
  const compressThreshold = useSettings((state) => state.compressThreshold)
  const sessionCard = useSettings((state) => state.sessionCard)
  const storyModules = useSettings((state) => state.storyModules)
  const cards = useMemory((state) => state.cards)
  const cardBuilding = useMemory((state) => state.cardBuilding)
  const [editing, setEditing] = useState<string | null>(null)
  const sessionId = hasChatBridge() ? chat().activeSessionId() : null
  const record = sessionId ? summaries[sessionId] ?? summaryOf(sessionId) : undefined
  const card = sessionId ? cards[sessionId] : undefined
  const building = sessionId ? cardBuilding.includes(sessionId) : false
  const turns = sessionId && hasChatBridge() ? splitTurns(chat().getMessages(sessionId)).length : 0
  const trigger = numberOption('memoryTriggerTurns', TRIGGER_TURNS)
  const keep = numberOption('memoryKeepTurns', KEEP_RECENT_TURNS)
  const edited = editing ? files.find((file) => file.path === editing) : undefined
  const roleId = sessionId ? storyRoleOf(sessionId) : ''
  const storyFiles = roleId ? storyFilesForRole(files, roleId, storyModules) : []
  const personalFiles = files.filter((file) => !isStoryPath(file.path))
  const storyIndex = roleId ? storyIndexFor(files, roleId, storyModules) : null
  // 面板用 canon 索引，不带 <story_memory> 提示词标签
  const storyPreview = storyIndex ? renderCanonIndex(storyIndex, storyModules, 2000) : ''

  if (!open) {
    return null
  }

  return (
    <>
      <Modal
        title="记忆"
        closable
        onClose={closeMemoryPanel}
        footer={
          <>
            <Button
              variant="outlined"
              size="m"
              disabled={!sessionId}
              onClick={() => {
                if (sessionId) {
                  void compressIfNeeded(sessionId, 'manual')
                }
              }}
            >
              压缩摘要
            </Button>
            <Button
              size="m"
              disabled={!sessionId || consolidating}
              onClick={() => {
                if (sessionId) {
                  void runConsolidation(sessionId, 'manual')
                }
              }}
            >
              {consolidating ? '整理中…' : '立即整理'}
            </Button>
          </>
        }
      >
        <div className={styles.page}>
          {!sessionId ? <div className={styles.tip}>当前没有打开的会话</div> : null}
          {sessionId ? (
            <div className={styles.tip}>
              当前会话 {turns} 轮 · 保留最近 {keep} 轮 · 自动压缩
              {autoCompress ? `：达到 ${compressThreshold}% 或超过 ${trigger} 轮时触发` : '已关闭'}
            </div>
          ) : null}
          {record ? (
            <>
              <div className={styles.tip}>
                摘要：已压缩 {record.turns} 轮 · 更新于{' '}
                {new Date(record.updatedAt).toLocaleString()}
              </div>
              <pre className={styles.body}>{record.text}</pre>
            </>
          ) : (
            <div className={styles.tip}>本会话还没有摘要。</div>
          )}

          <div className={styles.tip}>
            会话档案（防 OOC）{sessionCard ? '' : '· 设置里已关闭，不再新建也不再注入'}
          </div>
          {card ? (
            <>
              <div className={styles.tip}>
                覆盖到第 {card.covered} 条 · 更新于 {new Date(card.updatedAt).toLocaleString()}
              </div>
              <pre className={styles.body}>{renderCard(card)}</pre>
              <button
                type="button"
                className={styles.hint}
                disabled={building}
                onClick={() => {
                  if (sessionId) {
                    void maybeBuildCard(sessionId, true)
                  }
                }}
              >
                {building ? '重建中…' : '用当前对话重建档案'}
              </button>
              <button
                type="button"
                className={styles.hint}
                onClick={() => {
                  if (sessionId) {
                    void removeCard(sessionId)
                  }
                }}
              >
                删除本会话档案
              </button>
            </>
          ) : (
            <div className={styles.tip}>
              还没有档案。打开「设置 → 聊天 → 会话档案」后，超过 40 轮的会话会在下次发送前自动建一张。
            </div>
          )}

          <div className={styles.tip}>
            故事记忆（当前角色）
            {storyModules.enabled ? '' : ' · 设置里已关闭'}
          </div>
          <div className={styles.tip}>
            人物 {storyModules.characters ? '开' : '关'} · 大纲 {storyModules.outline ? '开' : '关'} ·
            事件 {storyModules.events ? '开' : '关'} · 世界观 {storyModules.world ? '开' : '关'}
            {' · 按角色隔离'}
          </div>
          {!roleId ? (
            <div className={styles.tip}>
              本会话没有角色归属（导入/历史会话），不启用故事记忆。
            </div>
          ) : !storyModules.enabled ? (
            <div className={styles.tip}>
              已关闭：不再注入也不再整理，已有故事文件仍保留。
            </div>
          ) : storyPreview ? (
            <pre className={styles.body}>{storyPreview}</pre>
          ) : (
            <div className={styles.tip}>
              还没有故事记忆。默认聊几轮后空闲两分钟自动整理；也可以在设置 → 聊天里只开需要的模块。
            </div>
          )}
          {storyFiles.map((file) => (
            <button
              key={file.path}
              type="button"
              className={styles.fileRow}
              onClick={() => setEditing(file.path)}
            >
              <span className={styles.fileTitle}>{file.title || file.path}</span>
              <span className={styles.hint}>{file.description || file.path}</span>
            </button>
          ))}

          <div className={styles.tip}>会话配角（本会话）· 命中触发词才注入，不进系统提示词</div>
          <button
            type="button"
            className={styles.hint}
            onClick={() => runCommand('cast.openPanel')}
          >
            打开配角库
          </button>

          <div className={styles.tip}>
            长期记忆（个人）{personalFiles.length > 0 ? ` · ${personalFiles.length} 个文件` : ''}
            {sessionId && lastRun[sessionId]
              ? ` · 上次整理 ${new Date(lastRun[sessionId]).toLocaleTimeString()}`
              : ''}
          </div>
          {personalFiles.length === 0 ? (
            <div className={styles.tip}>
              还没有长期记忆。聊完空闲两分钟后会自动整理（「做梦」），也可以点下面的「立即整理」。
            </div>
          ) : (
            personalFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                className={styles.fileRow}
                onClick={() => setEditing(file.path)}
              >
                <span className={styles.fileTitle}>{file.title || file.path}</span>
                <span className={styles.hint}>{file.description || file.path}</span>
              </button>
            ))
          )}
          {record ? (
            <button
              type="button"
              className={styles.hint}
              onClick={() => {
                if (sessionId) {
                  void clearSummary(sessionId).then(closeMemoryPanel)
                }
              }}
            >
              清除本会话摘要
            </button>
          ) : null}
        </div>
      </Modal>
      {edited ? <FileEditor file={edited} onClose={() => setEditing(null)} /> : null}
    </>
  )
}
