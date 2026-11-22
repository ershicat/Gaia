import clsx from 'clsx'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  IconGlobeLanguageOutline14,
  IconMicOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import { setSearch, setThinking, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { sendMessage, stopReply, useChatStore } from '../../services/chat/store.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { AttachPanel, type AttachKind } from './AttachPanel.js'
import { IconCloseOutline24, IconKeyboardOutline24, IconPlusOutline24 } from './inputIcons.js'
import { useVoiceInput } from './useVoiceInput.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'

/**
 * 输入框：自适应高度的文本框 + 附件入口（+）+ 深度思考与智能搜索开关 + 语音输入 / 发送。
 * 空输入时右侧是「+ / 语音」，有内容时语音换成发送；语音模式里输入区变成「按住说话」。
 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** 附件面板（拍照 / 相册 / 文件）是否展开 */
  const [attachOpen, setAttachOpen] = useState(false)
  /** 输入区是否处于「按住说话」模式 */
  const [voiceMode, setVoiceMode] = useState(false)
  /** 松手时麦克风授权还没返回：等录音真正开始后立刻结束 */
  const releaseRef = useRef(false)
  /** 当前是否按着「按住说话」；抬手监听挂在 document 上，不依赖指针捕获 */
  const pressingRef = useRef(false)
  const detachPressRef = useRef<(() => void) | null>(null)
  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    const error = addDraftFiles(sessionId, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, useSettings.getState().apiKey ?? '')
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 真正提交：文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿 */
  const submit = () => {
    if (
      useChatStore.getState().importingHistory ||
      !prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    ) {
      return
    }
    if (!ensureApiKey() || !sendMessage(sessionId)) {
      return
    }
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  /** 转写结果接着已有文字一起发出去，与旧版「松手即发送」一致 */
  const voice = useVoiceInput((transcript) => {
    const current = getDraft(sessionId).text
    setText(current ? `${current}${transcript}` : transcript)
    submit()
  })

  const recording = voice.status === 'recording'
  const hasContent = text.trim().length > 0 || attachments.length > 0
  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend = !importingHistory && !streaming && voice.status === 'idle' && draftReady

  const send = () => {
    if (voice.status !== 'idle') {
      return
    }
    submit()
  }

  // document 上的抬手监听要拿到最新一帧的 endHold，用 ref 保证不读到旧状态
  const endHoldRef = useRef<() => void>(() => {})

  const startHold = () => {
    if (pressingRef.current || !voice.available || voice.status !== 'idle') {
      return
    }
    pressingRef.current = true
    releaseRef.current = false
    // 抬手可能落在输入区之外，手势统一用 document 上的监听收尾
    const fire = () => endHoldRef.current()
    document.addEventListener('pointerup', fire, true)
    document.addEventListener('pointercancel', fire, true)
    detachPressRef.current = () => {
      document.removeEventListener('pointerup', fire, true)
      document.removeEventListener('pointercancel', fire, true)
    }
    void voice.begin()
  }

  const endHold = () => {
    if (!pressingRef.current) {
      return
    }
    pressingRef.current = false
    detachPressRef.current?.()
    detachPressRef.current = null
    if (voice.status === 'recording') {
      void voice.finish()
    } else {
      releaseRef.current = true
    }
  }

  endHoldRef.current = endHold

  // 授权慢于手势：录音一建立就立刻结束，避免一直录下去
  useEffect(() => {
    if (voice.status === 'recording' && releaseRef.current) {
      releaseRef.current = false
      void voice.finish()
    }
  }, [voice.status, voice.finish])

  // 离开页面时收起手势监听
  useEffect(
    () => () => {
      detachPressRef.current?.()
      detachPressRef.current = null
    },
    []
  )

  const pickAttach = (kind: AttachKind) => {
    setAttachOpen(false)
    const input =
      kind === 'camera'
        ? cameraRef.current
        : kind === 'gallery'
          ? galleryRef.current
          : fileInputRef.current
    input?.click()
  }

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  return (
    <>
      <div
        className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
        data-gaia-input=""
        onClick={(event) => {
          if (!voiceMode && event.target === event.currentTarget) {
            textareaRef.current?.focus({ preventScroll: true })
          }
        }}
      >
        <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
        <div className={styles.textareaWrapper}>
          <textarea
            ref={textareaRef}
            className={clsx(
              styles.textarea,
              (voiceMode || (recording && isMobile)) && styles.textareaHidden
            )}
            placeholder={t('chatInputPlaceholderChat')}
            rows={2}
            // 移动端不自动聚焦，避免一打开就弹出键盘
            autoFocus={!isMobile}
            disabled={importingHistory}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onMouseDown={(event) => {
              // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
              if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
                event.preventDefault()
                event.currentTarget.focus({ preventScroll: true })
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send()
              }
            }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length > 0) {
                event.preventDefault()
                acceptFiles(files)
              }
            }}
          />
          {voiceMode ? (
            <div
              className={clsx(styles.holdBar, recording && styles.holdBarRecording)}
              role="button"
              aria-label={t('chatInputHoldToTalk')}
              onPointerDown={(event) => {
                event.preventDefault()
                // 长按不要触发选中/上下文菜单，否则手势会被系统接管
                window.getSelection()?.removeAllRanges()
                startHold()
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              {t('chatInputHoldToTalk')}
            </div>
          ) : null}
          {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
          {voiceMode ? null : (
            <div className={styles.mirror} aria-hidden>
              {`${text}\n`}
            </div>
          )}
        </div>
        <div className={styles.functionRow}>
          {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
          <div className={styles.toggles}>
            <Tooltip content={t('deactivatedThinkTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, thinking && styles.selected)}
                aria-label={t('thinkingSwitch')}
                aria-pressed={thinking}
                onClick={() => setThinking(!thinking)}
              >
                <IconThinkOutline14 />
                <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
              </button>
            </Tooltip>
            <Tooltip content={t('deactivatedSearchTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, search && styles.selected)}
                aria-label={t('search')}
                aria-pressed={search}
                onClick={() => setSearch(!search)}
              >
                <IconGlobeLanguageOutline14 />
                <span className={styles.toggleLabel}>{t('search')}</span>
              </button>
            </Tooltip>
          </div>
          <div className={styles.right}>
            <Tooltip content={t('uploadFile')}>
              <button
                type="button"
                className={styles.roundButton}
                aria-label={t('uploadFile')}
                aria-expanded={attachOpen}
                onClick={() => setAttachOpen((open) => !open)}
              >
                {attachOpen ? <IconCloseOutline24 /> : <IconPlusOutline24 />}
              </button>
            </Tooltip>
            {streaming && sessionId ? (
              <button
                type="button"
                className={styles.sendButton}
                aria-label={t('chatInputStopButtonTooltip')}
                onClick={() => {
                  stopReadAloud()
                  stopReply(sessionId)
                }}
              >
                <IconStopFill16 />
              </button>
            ) : voiceMode ? (
              <Tooltip content={t('chatInputSwitchToKeyboard')}>
                <button
                  type="button"
                  className={styles.roundButton}
                  aria-label={t('chatInputSwitchToKeyboard')}
                  onClick={() => {
                    setVoiceMode(false)
                    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
                  }}
                >
                  <span className={styles.glyph22}>
                    <IconKeyboardOutline24 />
                  </span>
                </button>
              </Tooltip>
            ) : hasContent ? (
              <button
                type="button"
                className={clsx(styles.sendButton, !canSend && styles.disabled)}
                aria-label={t('send')}
                aria-disabled={!canSend}
                onClick={send}
              >
                <IconSendOutline16 />
              </button>
            ) : (
              <Tooltip content={t('voiceInput')}>
                <button
                  type="button"
                  className={styles.roundButton}
                  aria-label={t('voiceInput')}
                  onClick={() => {
                    setAttachOpen(false)
                    setVoiceMode(true)
                    textareaRef.current?.blur()
                  }}
                >
                  <span className={styles.glyph22}>
                    <IconMicOutline16 />
                  </span>
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        {dragging ? <DragMask /> : null}
      </div>
      {attachOpen ? <AttachPanel onPick={pickAttach} /> : null}
    </>
  )
}
