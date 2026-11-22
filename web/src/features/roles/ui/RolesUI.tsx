import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/base/Button.js'
import { Modal } from '../../../components/base/Modal.js'
import { showToast } from '../../../components/base/toastState.js'
import {
  downloadJson,
  parseRoleCardBundle,
  safeFileName,
  serializeRoleCard,
} from '../cardFile.js'
import { emit } from '../../../platform/index.js'
import type { Role } from '../contract.js'
import styles from '../roles.module.css'
import {
  closePage,
  createRole,
  openEditor,
  openPage,
  removeRole,
  setActiveRole,
  upsertRole,
  useRoles,
} from '../store.js'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '?')

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

const downscale = (file: File, size: number): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read image failed'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('decode image failed'))
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('canvas unavailable'))
          return
        }
        const side = Math.min(image.width, image.height)
        context.drawImage(
          image,
          (image.width - side) / 2,
          (image.height - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size
        )
        resolve(canvas.toDataURL('image/jpeg', 0.86))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })

/** 背景图：等比缩到最长边不超过 maxSide，避免把几十 MB 的图塞进 IndexedDB */
const resizeImage = (file: File, maxSide: number): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read image failed'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('decode image failed'))
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('canvas unavailable'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })

/** 角色域的全部弹层：切换 / 管理 / 编辑。挂在 app.overlay 上，不随侧栏开合消失 */
export const RolesOverlay = () => {
  const page = useRoles((state) => state.page)
  const roles = useRoles((state) => state.roles)
  const activeId = useRoles((state) => state.activeId)
  const editingId = useRoles((state) => state.editingId)
  const [draft, setDraft] = useState<Role | null>(null)
  const cardImportRef = useRef<HTMLInputElement>(null)

  /**
   * 导入角色卡：接受 ST V2 / V1 / Gaia 导出；同名不合并，每次新建一个角色。
   * 卡里若夹带 extensions.gaia.sessionCard / memoryFiles，一并广播给 memory 落地，
   * 用户看到的只是「导一次」。
   *
   * 每一步失败都单独提示：Android WebView 里读 content:// 文件可能静默 reject，
   * 不提示的话用户看到的就是「点了没反应」。
   */
  const importCards = async (files: File[]): Promise<void> => {
    let written = 0
    for (const file of files) {
      let text = ''
      try {
        text = await readFileText(file)
      } catch (error) {
        console.error('[roles] 读取角色卡失败', error)
        showToast(`读不了「${file.name}」`)
        continue
      }
      if (!text.trim()) {
        showToast(`「${file.name}」是空文件`)
        continue
      }
      const bundle = parseRoleCardBundle(text)
      if (!bundle) {
        showToast(`「${file.name}」不是角色卡（JSON 解析失败或缺 name）`)
        continue
      }
      try {
        await upsertRole(bundle.role)
      } catch (error) {
        console.error('[roles] 保存角色失败', error)
        showToast(`「${bundle.role.name}」保存失败`)
        continue
      }
      written += 1
      const { sessionCard, memoryFiles } = bundle.extras
      if (sessionCard || memoryFiles.length > 0) {
        emit('roles:cardExtras', {
          roleId: bundle.role.id,
          roleName: bundle.role.name,
          sessionCard,
          memoryFiles,
        })
      }
    }
    if (written > 0) {
      showToast(`已导入 ${written} 张角色卡`)
    } else {
      showToast('没有导入任何角色卡')
    }
  }

  useEffect(() => {
    if (page !== 'edit') {
      setDraft(null)
      return
    }
    const found = editingId ? roles.find((role) => role.id === editingId) : undefined
    setDraft(found ? { ...found } : createRole())
  }, [page, editingId, roles])

  if (page === 'pick') {
    return (
      <Modal
        title="切换角色"
        closable
        onClose={closePage}
        footer={
          <Button variant="outlined" size="m" onClick={() => openPage('manage')}>
            管理角色
          </Button>
        }
      >
        <div className={styles.sheet}>
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={styles.row}
              onClick={() => {
                void setActiveRole(role.id).then(closePage)
              }}
            >
              <span className={styles.avatar}>
                {role.avatar ? <img className={styles.avatarImg} src={role.avatar} alt="" /> : initial(role.name)}
              </span>
              <span className={styles.grow}>
                <div className={styles.name}>{role.name}</div>
                {role.builtin ? <div className={styles.hint}>内置</div> : null}
              </span>
              {role.id === activeId ? <span>✓</span> : null}
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  if (page === 'manage') {
    return (
      <Modal
        title="管理角色"
        closable
        onClose={closePage}
        footer={
          <>
            <Button variant="outlined" size="m" onClick={() => cardImportRef.current?.click()}>
              导入角色卡
            </Button>
            <Button size="m" onClick={() => openEditor(null)}>
              新建角色
            </Button>
          </>
        }
      >
        <input
          ref={cardImportRef}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(event) => {
            // 必须先拷成数组再清空 input.value：WebView 里清空会让刚取到的那份 FileList 一起变空
            const picked = event.target.files ? Array.from(event.target.files) : []
            event.target.value = ''
            if (picked.length > 0) {
              void importCards(picked)
            } else {
              showToast('没选到文件（选择器没返回文件）')
            }
          }}
        />
        <div className={styles.sheet}>
          {roles.map((role) => (
            <div key={role.id} className={styles.rowWrap}>
              <button
                type="button"
                className={styles.rowFlex}
                onClick={() => openEditor(role.id)}
              >
                <span className={styles.avatar}>
                  {role.avatar ? <img className={styles.avatarImg} src={role.avatar} alt="" /> : initial(role.name)}
                </span>
                <span className={styles.grow}>
                  <div className={styles.name}>{role.name}</div>
                  <div className={styles.hint}>
                    {role.builtin ? '内置 · 不可删除' : '点击编辑'}
                    {role.id === activeId ? ' · 当前使用' : ''}
                  </div>
                </span>
              </button>
              <button
                type="button"
                className={styles.danger}
                disabled={role.builtin}
                onClick={() => {
                  void removeRole(role.id)
                }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </Modal>
    )
  }

  if (page === 'edit' && draft) {
    return <RoleEditor draft={draft} onChange={setDraft} />
  }

  return null
}

const RoleEditor = ({
  draft,
  onChange,
}: {
  draft: Role
  onChange: (next: Role) => void
}) => {
  const fileRef = useRef<HTMLInputElement>(null)
  const bgRef = useRef<HTMLInputElement>(null)
  const patch = (fields: Partial<Role>): void => onChange({ ...draft, ...fields })
  const followDefault = draft.temperature === null

  return (
    <Modal
      title={draft.builtin ? '角色设置' : '角色设置'}
      closable
      onClose={closePage}
      footer={
        <>
          <Button
            variant="outlined"
            size="m"
            onClick={() => {
              const stamp = new Date().toISOString().slice(0, 10)
              downloadJson(
                `${safeFileName(draft.name)}.card-${stamp}.json`,
                serializeRoleCard(draft)
              )
              showToast('角色卡已导出')
            }}
          >
            导出角色卡
          </Button>
          <Button variant="outlined" size="m" onClick={closePage}>
            取消
          </Button>
          <Button
            size="m"
            onClick={() => {
              void upsertRole(draft).then(closePage)
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.field}>
          <div className={styles.avatarRow}>
          <span className={styles.avatar} style={{ width: 64, height: 64, fontSize: 22 }}>
            {draft.avatar ? (
              <img className={styles.avatarImg} src={draft.avatar} alt="" />
            ) : (
              initial(draft.name)
            )}
          </span>
          <div>
            <Button variant="outlined" size="s" onClick={() => fileRef.current?.click()}>
              换头像
            </Button>
            {draft.avatar ? (
              <button type="button" className={styles.danger} onClick={() => patch({ avatar: null })}>
                移除
              </button>
            ) : null}
            <div className={styles.tip}>图片会缩到 160×160 再存</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) {
                return
              }
              void downscale(file, 160)
                .then((dataUrl) => patch({ avatar: dataUrl }))
                .catch(() => undefined)
            }}
          />
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>名称</div>
        <input
          className={styles.input}
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.switchRow}>
          <div className={styles.label}>温度</div>
          <label className={styles.hint}>
            <input
              type="checkbox"
              checked={followDefault}
              onChange={(event) => patch({ temperature: event.target.checked ? null : 1 })}
            />{' '}
            跟随默认（不传参）
          </label>
        </div>
        <input
          className={styles.range}
          type="range"
          min={0}
          max={2}
          step={0.1}
          disabled={followDefault}
          value={draft.temperature ?? 1}
          onChange={(event) => patch({ temperature: Number(event.target.value) })}
        />
        <div className={styles.tip}>
          当前：{followDefault ? '不传' : draft.temperature?.toFixed(1)} · 越低越稳定，越高越发散；只影响措辞
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>系统提示词</div>
        <textarea
          className={styles.textarea}
          rows={12}
          value={draft.systemPrompt}
          onChange={(event) => patch({ systemPrompt: event.target.value })}
        />
        <div className={styles.tip}>
          可用变量：{'{{char}}'} 角色名 · {'{{user}}'} 用户名 · {'{{cur_date}}'} 日期 ·{' '}
          {'{{timezone}}'} 时区
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>开场白</div>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="你好，我是……"
          value={draft.greeting}
          onChange={(event) => patch({ greeting: event.target.value })}
        />
        <div className={styles.tip}>新建该角色的会话时作为第一条消息出现；留空则不插入</div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>聊天背景</div>
        <div className={styles.avatarRow}>
          <Button variant="outlined" size="s" onClick={() => bgRef.current?.click()}>
            {draft.background ? '更换图片' : '选择图片'}
          </Button>
          {draft.background ? (
            <button
              type="button"
              className={styles.danger}
              onClick={() => patch({ background: null })}
            >
              移除
            </button>
          ) : null}
        </div>
        <input
          ref={bgRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) {
              return
            }
            void resizeImage(file, 1600)
              .then((dataUrl) => patch({ background: dataUrl }))
              .catch(() => undefined)
          }}
        />
        <input
          className={styles.range}
          type="range"
          min={0}
          max={1}
          step={0.05}
          disabled={!draft.background}
          value={draft.backgroundOpacity}
          onChange={(event) => patch({ backgroundOpacity: Number(event.target.value) })}
        />
        <div className={styles.tip}>
          只作用于聊天页 · 图片不透明度 {Math.round(draft.backgroundOpacity * 100)}%
          （图片会缩到最长边 1600px）
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>技能</div>
        <textarea
          className={styles.textarea}
          rows={5}
          placeholder="每段技能之间用单独一行 --- 分隔"
          value={draft.skills.join('\n---\n')}
          onChange={(event) =>
            patch({
              skills: event.target.value
                .split(/\n\s*---\s*\n/)
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
        <div className={styles.tip}>
          技能按需挂载：这轮问到相关的事才把全文拼进系统提示词，没用上就不带；没有触发词表的自定义技能保持常驻
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>用户画像</div>
        <textarea
          className={styles.textarea}
          rows={4}
          placeholder="这个角色的用户是谁、在意什么、有什么习惯"
          value={draft.profile}
          onChange={(event) => patch({ profile: event.target.value })}
        />
        <div className={styles.tip}>跨会话生效，不跨角色</div>
      </div>
      </div>
    </Modal>
  )
}
