/**
 * 微信壳自用的几个线图标（24×24，currentColor）。
 * 不引图标库：只有底栏四项 + 返回箭头 + 新建，手画六条路径最省。
 */

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ChatIcon = () => (
  <svg {...base}>
    <path d="M4 5.5h16v10H9.5L5 19v-3.5H4z" />
  </svg>
)

export const ContactsIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 19c0-3.4 2.9-5.2 6.5-5.2s6.5 1.8 6.5 5.2" />
  </svg>
)

export const MomentsIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
  </svg>
)

export const MeIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M4.8 20c0-3.8 3.2-6 7.2-6s7.2 2.2 7.2 6" />
  </svg>
)

export const BackIcon = () => (
  <svg {...base} width={22} height={22} strokeWidth={2}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const PlusIcon = () => (
  <svg {...base} width={22} height={22} strokeWidth={1.8}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
