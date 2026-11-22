import { useTranslate } from '../../i18n/index.js'
import {
  IconCameraOutline24,
  IconFileOutline24,
  IconGalleryOutline24,
} from './inputIcons.js'
import styles from './ChatInput.module.css'

export type AttachKind = 'camera' | 'gallery' | 'file'

/** 加号展开的三个入口：拍照 / 相册 / 文件，与旧版一致的三张浅灰方块 */
export const AttachPanel = ({ onPick }: { onPick: (kind: AttachKind) => void }) => {
  const t = useTranslate()
  const items = [
    { kind: 'camera' as const, label: t('attachCamera'), icon: <IconCameraOutline24 /> },
    { kind: 'gallery' as const, label: t('attachGallery'), icon: <IconGalleryOutline24 /> },
    { kind: 'file' as const, label: t('attachFile'), icon: <IconFileOutline24 /> },
  ]
  return (
    <div className={styles.attachPanel}>
      {items.map((item) => (
        <button
          key={item.kind}
          type="button"
          className={styles.attachCard}
          onClick={() => onPick(item.kind)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
