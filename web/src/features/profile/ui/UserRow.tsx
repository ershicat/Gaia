import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/base/Button.js'
import { Modal } from '../../../components/base/Modal.js'
import styles from '../profile.module.css'
import { applyProfile, closeProfileEditor, openProfileEditor, saveProfile, useProfile } from '../store.js'

const initial = (name: string): string => (name.trim() ? name.trim()[0] : '我')

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

/** 侧栏顶部的用户行：头像 + 昵称，点击打开编辑 */
export const UserRow = () => {
  const name = useProfile((state) => state.name)
  const avatar = useProfile((state) => state.avatar)
  const display = name || '我'

  return (
    <button type="button" className={styles.row} onClick={openProfileEditor}>
      <span className={styles.avatar}>
        {avatar ? <img className={styles.avatarImg} src={avatar} alt="" /> : initial(display)}
      </span>
      <span className={styles.name}>{display}</span>
    </button>
  )
}

/** 用户资料编辑：昵称 + 头像（存在本地，保存后消息里立即生效） */
export const ProfileEditor = () => {
  const editing = useProfile((state) => state.editing)
  const name = useProfile((state) => state.name)
  const avatar = useProfile((state) => state.avatar)
  const [draftName, setDraftName] = useState(name)
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatar)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraftName(useProfile.getState().name)
      setDraftAvatar(useProfile.getState().avatar)
      applyProfile()
    }
  }, [editing])

  if (!editing) {
    return null
  }

  return (
    <Modal
      title="个人信息"
      closable
      onClose={closeProfileEditor}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={closeProfileEditor}>
            取消
          </Button>
          <Button size="m" onClick={() => saveProfile(draftName, draftAvatar)}>
            保存
          </Button>
        </>
      }
    >
      <div className={styles.field}>
        <div className={styles.avatarRow}>
          <span className={`${styles.avatar} ${styles.avatarLarge}`}>
            {draftAvatar ? (
              <img className={styles.avatarImg} src={draftAvatar} alt="" />
            ) : (
              initial(draftName || '我')
            )}
          </span>
          <div>
            <Button variant="outlined" size="s" onClick={() => fileRef.current?.click()}>
              换头像
            </Button>
            {draftAvatar ? (
              <button type="button" className={styles.danger} onClick={() => setDraftAvatar(null)}>
                移除
              </button>
            ) : null}
            <div className={styles.hint}>图片会缩到 160×160 再存</div>
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
                .then((dataUrl) => setDraftAvatar(dataUrl))
                .catch(() => undefined)
            }}
          />
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>昵称</div>
        <input
          className={styles.input}
          value={draftName}
          placeholder="我"
          onChange={(event) => setDraftName(event.target.value)}
        />
        <div className={styles.hint}>保存后，对话里显示的用户头像与昵称立即更新</div>
      </div>
    </Modal>
  )
}
