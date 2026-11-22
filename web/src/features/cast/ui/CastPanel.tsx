import { useRef, useState } from 'react'
import { Button } from '../../../components/base/Button.js'
import { Modal } from '../../../components/base/Modal.js'
import { chat, hasChatBridge } from '../../../platform/index.js'
import styles from '../cast.module.css'
import type { CastMember } from '../contract.js'
import { downloadText, parseCastFile, serializeCastFile } from '../format.js'
import {
  castOf,
  closeCastPanel,
  createCastMember,
  importCast,
  notifyCast,
  removeCast,
  upsertCast,
  useCast,
} from '../store.js'

const splitAliases = (raw: string): string[] =>
  raw
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

const safeName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, '_').trim() || '会话'

const CastEditor = ({
  draft,
  isNew,
  onChange,
  onClose,
}: {
  draft: CastMember
  isNew: boolean
  onChange: (next: CastMember) => void
  onClose: () => void
}) => {
  const patch = (fields: Partial<CastMember>): void => onChange({ ...draft, ...fields })
  const [aliasText, setAliasText] = useState(draft.aliases.join('、'))
  return (
    <Modal
      title={isNew ? '新建配角' : `配角 · ${draft.name || '未命名'}`}
      closable
      onClose={onClose}
      footer={
        <>
          {isNew ? null : (
            <Button
              variant="dangerOutlined"
              size="m"
              onClick={() => {
                void removeCast(draft.id).then(onClose)
              }}
            >
              删除
            </Button>
          )}
          <Button variant="outlined" size="m" onClick={onClose}>
            取消
          </Button>
          <Button
            size="m"
            onClick={() => {
              if (!draft.name.trim()) {
                notifyCast('配角要有名字')
                return
              }
              void upsertCast({ ...draft, aliases: splitAliases(aliasText) }).then(onClose)
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        <div className={styles.field}>
          <div className={styles.label}>名字</div>
          <input
            className={styles.input}
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>触发词（别名 / 称呼，逗号分隔）</div>
          <input
            className={styles.input}
            value={aliasText}
            placeholder="小艾、艾艾、艾研究员"
            onChange={(event) => setAliasText(event.target.value)}
          />
          <div className={styles.tip}>
            最近 6 条消息或本轮提问里出现任一词，就把这条贴进附注；留空则只能靠「常驻」。
          </div>
        </div>
        <div className={styles.field}>
          <div className={styles.label}>身份</div>
          <input
            className={styles.input}
            value={draft.identity}
            placeholder="研究员，实验室搭档"
            onChange={(event) => patch({ identity: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>说话方式</div>
          <input
            className={styles.input}
            value={draft.speech}
            placeholder="直来直去，爱吐槽，偶尔损人"
            onChange={(event) => patch({ speech: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>对「我」的称呼</div>
          <input
            className={styles.input}
            value={draft.address}
            placeholder="阿明 / 小明"
            onChange={(event) => patch({ address: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>与主角 / 我的关系</div>
          <input
            className={styles.input}
            value={draft.relation}
            placeholder="同事；比较在意你"
            onChange={(event) => patch({ relation: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>补充要点</div>
          <textarea
            className={styles.textarea}
            rows={4}
            value={draft.notes}
            placeholder="一行一条：口头禅、禁区、已经发生过的事……"
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </div>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={draft.always}
            onChange={(event) => patch({ always: event.target.checked })}
          />
          常驻（每轮都带上，别滥用）
        </label>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          启用
        </label>
      </div>
    </Modal>
  )
}

/** 读文件正文：优先 Blob.text()，Android WebView 对 content:// 有时会 reject，兜底 FileReader */
const readFileText = async (file: File): Promise<string> => {
  if (typeof file.text === 'function') {
    try {
      return await file.text()
    } catch {
      // 落到 FileReader
    }
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

/** 配角库面板：列表 + 导入导出 + 编辑；按当前会话过滤 */
export const CastPanel = () => {
  const open = useCast((state) => state.panelOpen)
  const members = useCast((state) => state.members)
  const [editing, setEditing] = useState<CastMember | null>(null)
  const [isNew, setIsNew] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const sessionId = hasChatBridge() ? chat().activeSessionId() : null
  const session = sessionId && hasChatBridge() ? chat().getSession(sessionId) : undefined
  const list = castOf(sessionId)

  if (!open) {
    return null
  }

  const onImport = async (file: File): Promise<void> => {
    if (!sessionId) {
      notifyCast('先打开一条会话')
      return
    }
    let text = ''
    try {
      text = await readFileText(file)
    } catch (error) {
      console.error('[cast] 读取配角库失败', error)
      notifyCast(`读不了「${file.name}」`)
      return
    }
    if (!text.trim()) {
      notifyCast(`「${file.name}」是空文件`)
      return
    }
    const parsed = parseCastFile(text)
    if (!parsed) {
      notifyCast('文件不是配角库格式')
      return
    }
    const written = await importCast(sessionId, parsed)
    notifyCast(written > 0 ? `导入 ${written} 个配角` : '没有可导入的配角')
  }

  const onExport = (): void => {
    if (!sessionId || list.length === 0) {
      notifyCast('这个会话还没有配角')
      return
    }
    const title = session?.title ?? '会话'
    const text = serializeCastFile(list, { sessionId, title })
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(`配角库-${safeName(title)}-${stamp}.json`, text)
    notifyCast(`已导出 ${list.length} 个配角`)
  }

  return (
    <>
      <Modal
        title="会话配角库"
        closable
        onClose={closeCastPanel}
        footer={
          <>
            <Button
              variant="outlined"
              size="m"
              disabled={!sessionId}
              onClick={() => importRef.current?.click()}
            >
              导入
            </Button>
            <Button variant="outlined" size="m" disabled={!sessionId} onClick={onExport}>
              导出
            </Button>
            <Button
              size="m"
              disabled={!sessionId}
              onClick={() => {
                if (!sessionId) {
                  return
                }
                setEditing(createCastMember(sessionId))
                setIsNew(true)
              }}
            >
              新建配角
            </Button>
          </>
        }
      >
        <div className={styles.page}>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                void onImport(file)
              }
            }}
          />
          {!sessionId ? <div className={styles.tip}>当前没有打开的会话</div> : null}
          {sessionId ? (
            <div className={styles.tip}>
              {list.length > 0
                ? `${list.length} 个配角 · 只有命中触发词或标记「常驻」的才会进上下文`
                : '还没有配角。配角只在命中触发词时注入，不进系统提示词，不会击穿缓存。'}
            </div>
          ) : null}
          {list.length > 0 ? (
            <div className={styles.list}>
              {list.map((member) => (
                <div key={member.id} className={styles.row}>
                  <button
                    type="button"
                    className={styles.rowMain}
                    onClick={() => {
                      setEditing({ ...member })
                      setIsNew(false)
                    }}
                  >
                    <span className={styles.name}>
                      {member.name}
                      {member.always ? <span className={styles.badge}>常驻</span> : null}
                      {member.enabled ? null : <span className={styles.badge}>已停用</span>}
                    </span>
                    <span className={styles.hint}>
                      {[
                        member.identity,
                        member.relation,
                        member.aliases.length > 0 ? `触发：${member.aliases.join('、')}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ') || '点击编辑'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => {
                      void removeCast(member.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {members.length > 0 && list.length === 0 ? (
            <div className={styles.tip}>别的会话里有 {members.length - list.length} 个配角，不会在本会话生效。</div>
          ) : null}
        </div>
      </Modal>
      {editing ? (
        <CastEditor
          draft={editing}
          isNew={isNew}
          onChange={setEditing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
