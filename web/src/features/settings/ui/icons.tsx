/**
 * 设置页专用图标：旧版用的是 24dp PNG，这里用同尺寸描边 SVG 复刻，
 * 保证与 SettingsActivity 的行内图标观感一致（24×24、1.7 描边、#1F2329）。
 */
const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#1f2329',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** 位置：水滴形定位针 */
export const PinIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
)

/** 余额：银行卡 */
export const CardIcon = () => (
  <svg {...base} aria-hidden="true">
    <rect x="2.8" y="5.5" width="18.4" height="13" rx="3" />
    <path d="M2.8 9.8h18.4" />
    <path d="M6.2 14.6h3.2" />
  </svg>
)

/** 反馈：气泡 */
export const BubbleIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M20.5 12.2c0 4.1-3.8 7.4-8.5 7.4-1 0-2-.15-2.9-.42L4.6 20.6l1.2-3.5a7 7 0 0 1-1.8-4.9c0-4.1 3.8-7.4 8.5-7.4s8 3.3 8 7.4Z" />
  </svg>
)
