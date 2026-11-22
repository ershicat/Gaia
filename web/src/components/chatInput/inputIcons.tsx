/**
 * 输入区专用的线性图标：加号 / 关闭 / 键盘 / 相机 / 相册 / 文件。
 * 统一 24 栅格、1.7 描边、圆头圆角，与输入框里其他图标的观感一致。
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const base = { width: 24, height: 24, viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg' }

/** 附件入口：加号（展开面板后换成 close） */
export const IconPlusOutline24 = () => (
  <svg {...base} {...stroke} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconCloseOutline24 = () => (
  <svg {...base} {...stroke} aria-hidden>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
)

/** 语音模式下来回切文字输入 */
export const IconKeyboardOutline24 = () => (
  <svg {...base} {...stroke} aria-hidden>
    <rect x="2.5" y="6" width="19" height="12" rx="3" />
    <path d="M6.2 10.2h.01M9.7 10.2h.01M13.2 10.2h.01M16.7 10.2h.01M8 14h8" />
  </svg>
)

export const IconCameraOutline24 = () => (
  <svg {...base} {...stroke} aria-hidden>
    <rect x="3" y="6.5" width="18" height="13.5" rx="3" />
    <path d="M8.5 6.5 10 4h4l1.5 2.5" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
)

export const IconGalleryOutline24 = () => (
  <svg {...base} {...stroke} aria-hidden>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <path d="M5.5 16.5 10 11l3 3 2-2 3.5 4.5" />
    <circle cx="16" cy="8.5" r="1.2" />
  </svg>
)

export const IconFileOutline24 = () => (
  <svg {...base} {...stroke} aria-hidden>
    <path d="M16.5 8 9.8 14.7a2.6 2.6 0 1 0 3.7 3.7l7-7a4.6 4.6 0 1 0-6.5-6.5l-7.4 7.4" />
  </svg>
)
