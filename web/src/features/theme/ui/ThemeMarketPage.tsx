import { BACKGROUNDS, BUBBLES, LAYOUTS, SKINS, type MarketItem, type ThemeGroup } from '../catalog.js'
import { closeThemeMarket, selectTheme, useThemeStore } from '../store.js'
import styles from '../theme.module.css'

const GROUPS: { group: ThemeGroup; title: string; tip: string; items: MarketItem[] }[] = [
  {
    group: 'skin',
    title: '主题',
    tip: '换整应用的点缀色与气泡底色。默认那套就是你现在看到的 DeepSeek。',
    items: SKINS,
  },
  {
    group: 'bubble',
    title: '气泡',
    tip: '我方与助手回复都套气泡。默认那套保持 DeepSeek 现在的样子（助手无底色）。',
    items: BUBBLES,
  },
  {
    group: 'background',
    title: '背景',
    tip: '聊天页底下的背景层。星夜是深底，会自动把聊天区文字改成浅色。',
    items: BACKGROUNDS,
  },
  {
    group: 'layout',
    title: '界面',
    tip: '换的是整套骨架，不只是配色。微信那套是底部四页（微信 / 通讯录 / 朋友圈 / 我），点会话进聊天页、返回退一层；选经典就是现在这个样子。',
    items: LAYOUTS,
  },
]

const Card = ({
  item,
  active,
  onPick,
}: {
  item: MarketItem
  active: boolean
  onPick: () => void
}) => (
  <button
    type="button"
    className={`${styles.card} ${active ? styles.cardActive : ''}`}
    onClick={onPick}
  >
    <div className={styles.swatch}>
      {item.swatch.map((color) => (
        <span key={color} className={styles.chip} style={{ backgroundColor: color }} />
      ))}
    </div>
    <div className={styles.name}>{item.name}</div>
    <div className={styles.desc}>{item.desc}</div>
    {active ? <span className={styles.badge}>使用中</span> : null}
  </button>
)

/** 主题商城：主题 / 气泡 / 背景 三组，点一下立刻生效并记住 */
export const ThemeMarketPage = () => {
  const open = useThemeStore((state) => state.open)
  const skin = useThemeStore((state) => state.skin)
  const bubble = useThemeStore((state) => state.bubble)
  const background = useThemeStore((state) => state.background)
  const layout = useThemeStore((state) => state.layout)
  if (!open) {
    return null
  }
  const selected: Record<ThemeGroup, string> = { skin, bubble, background, layout }
  return (
    <div className={styles.page} role="dialog" aria-label="主题商城">
      <div className={styles.head}>
        <button type="button" className={styles.back} aria-label="返回" onClick={closeThemeMarket}>
          ‹
        </button>
        <div className={styles.title}>主题商城</div>
      </div>
      <div className={styles.body}>
        {GROUPS.map(({ group, title, tip, items }) => (
          <div key={group}>
            <div className={styles.groupTitle}>{title}</div>
            <div className={styles.groupTip}>{tip}</div>
            <div className={styles.grid}>
              {items.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  active={selected[group] === item.id}
                  onPick={() => selectTheme(group, item.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
