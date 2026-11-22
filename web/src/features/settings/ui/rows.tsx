import type { ReactNode } from 'react'
import {
  IconBrowseOutline16,
  IconDataOutline16,
  IconEditOutline16,
  IconGlobeLanguageOutline14,
  IconLightOutline16,
  IconLinkOutline16,
  IconMicOutline16,
  IconSettingsOutline16,
  IconThinkOutline16,
} from '../../../components/base/icons.js'
import { runCommand } from '../../../platform/index.js'
import styles from '../settings.module.css'
import { openSettingsPage } from '../store.js'
import { BubbleIcon, CardIcon, PinIcon } from './icons.js'

/** 分组标题：13sp / #8A8F99 / 左 32 / 上 27 / 下 8（对齐旧版 addSection） */
export const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <div className={styles.sectionLabel}>{label}</div>
    <div className={styles.card}>{children}</div>
  </>
)

/** 列表行：最小高 48 / 左 16 右 12 / 图标 24 / 箭头 › 20sp #C9CDD4 */
export const Row = ({
  icon,
  label,
  value,
  danger,
  onClick,
}: {
  icon?: ReactNode
  label: string
  value?: string
  danger?: boolean
  onClick?: () => void
}) => (
  <button type="button" className={styles.row} onClick={onClick}>
    {icon ? <span className={styles.rowIcon}>{icon}</span> : null}
    <span className={`${styles.rowLabel} ${danger ? styles.danger : ''}`}>{label}</span>
    {value ? <span className={styles.rowValue}>{value}</span> : null}
    <span className={styles.chevron}>›</span>
  </button>
)

/** 单选选项行（旧版用对话框列表，这里做成整页列表，视觉一致） */
export const OptionRow = ({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) => (
  <button type="button" className={styles.optionRow} onClick={onSelect}>
    <span className={styles.optionLabel}>{label}</span>
    {selected ? <span className={styles.check}>✓</span> : null}
  </button>
)

/** 设置首页：分组与行顺序完全对齐旧版 SettingsActivity（多一项「记忆」） */
export const RootPage = ({
  locale,
  theme,
  market,
  font,
  model,
  chat,
  think,
  voice,
  location,
  provider,
  apiKey,
}: {
  locale: string
  theme: string
  market: string
  font: string
  model: string
  chat: string
  think: string
  voice: string
  location: string
  provider: string
  apiKey: string
}) => (
  <>
    <Section label="账户">
      <Row
        icon={<IconDataOutline16 />}
        label="数据管理"
        onClick={() => openSettingsPage('data')}
      />
      <Row icon={<CardIcon />} label="API 余额" onClick={() => runCommand('account.openBalance')} />
      <Row
        icon={<IconThinkOutline16 />}
        label="记忆"
        onClick={() => runCommand('memory.openPanel')}
      />
    </Section>

    <Section label="应用">
      <Row
        icon={<IconEditOutline16 />}
        label="助手（角色）"
        onClick={() => runCommand('roles.manage')}
      />
      <Row
        icon={<IconThinkOutline16 />}
        label="模型"
        value={model}
        onClick={() => openSettingsPage('model')}
      />
      <Row
        icon={<IconSettingsOutline16 />}
        label="聊天"
        value={chat}
        onClick={() => openSettingsPage('chat')}
      />
      <Row
        icon={<IconGlobeLanguageOutline14 />}
        label="语言"
        value={locale}
        onClick={() => openSettingsPage('locale')}
      />
      <Row
        icon={<IconLightOutline16 />}
        label="外观"
        value={theme}
        onClick={() => openSettingsPage('theme')}
      />
      <Row
        icon={<IconBrowseOutline16 />}
        label="主题商城"
        value={market}
        onClick={() => runCommand('theme.openMarket')}
      />
      <Row
        icon={<IconBrowseOutline16 />}
        label="字体大小"
        value={font}
        onClick={() => openSettingsPage('font')}
      />
      <Row
        icon={<IconThinkOutline16 />}
        label="个性化"
        value={think}
        onClick={() => openSettingsPage('think')}
      />
    </Section>

    <Section label="语音">
      <Row
        icon={<IconMicOutline16 />}
        label="朗读音色"
        value={voice}
        onClick={() => openSettingsPage('voice')}
      />
    </Section>

    <Section label="位置">
      <Row
        icon={<PinIcon />}
        label="位置信息"
        value={location}
        onClick={() => openSettingsPage('location')}
      />
    </Section>

    <Section label="接入">
      <Row
        icon={<IconLinkOutline16 />}
        label="服务商"
        value={provider}
        onClick={() => runCommand('providers.open')}
      />
      <Row
        icon={<IconEditOutline16 />}
        label="API Key"
        value={apiKey}
        onClick={() => openSettingsPage('apiKey')}
      />
    </Section>

    <Section label="其他">
      <Row icon={<BubbleIcon />} label="反馈" onClick={() => openSettingsPage('feedback')} />
    </Section>
  </>
)
