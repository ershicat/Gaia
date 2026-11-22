/**
 * 主题商城的目录：主题（配色）/ 气泡 / 背景 / 界面（骨架）四组。
 *
 * 前三组是纯 CSS 变量与属性驱动，不引入第三方 UI 库：
 * 组件里已经有 --dsw-* 设计变量，这里只做覆盖。
 * 第四组「界面」不是样式，是整套骨架（经典 / 微信），由 shell 积木实现，
 * 这里只提供选项与标签，选中结果经平台写进 AppLayout。
 * 默认项（ds / 默认 / classic）不做任何覆盖，保持现在的 DeepSeek 观感。
 */
export type ThemeGroup = 'skin' | 'bubble' | 'background' | 'layout'

export interface MarketItem {
  id: string
  name: string
  desc: string
  /** 卡片上的色块预览（1~3 个颜色） */
  swatch: string[]
  /** 是否当前版本内置（都内置，字段留着给以后加"更多"用） */
  builtin?: boolean
}

export const SKINS: MarketItem[] = [
  {
    id: 'ds',
    name: '默认 · DeepSeek',
    desc: '现在的样子：浅色底、蓝色点缀、圆角气泡',
    swatch: ['#FFFFFF', '#4D6BFE', '#F2F4F7'],
  },
  {
    id: 'qq',
    name: 'QQ 蓝',
    desc: '我方蓝泡白字，强调色换成 QQ 蓝',
    swatch: ['#12B7F5', '#FFFFFF', '#EAF7FE'],
  },
  {
    id: 'wechat',
    name: '微信绿',
    desc: '我方绿泡，强调色换成微信绿',
    swatch: ['#07C160', '#FFFFFF', '#EDFBF3'],
  },
  {
    id: 'paper',
    name: '米纸',
    desc: '暖白纸感，强调色偏赭石，适合长文阅读',
    swatch: ['#FBF7EF', '#B4794A', '#F3EADA'],
  },
  {
    id: 'night',
    name: '暗夜紫',
    desc: '深色底配紫色强调，夜里看着不刺眼',
    swatch: ['#16141F', '#8B5CF6', '#241F33'],
  },
]

export const BUBBLES: MarketItem[] = [
  {
    id: 'ds',
    name: '默认 · DeepSeek',
    desc: '大圆角浅蓝气泡，你现在用的就是这个',
    swatch: ['#EEF2FF', '#4D6BFE'],
  },
  {
    id: 'qq',
    name: 'QQ 风',
    desc: '我方蓝泡白字、右上小尖角；对方消息保持无底色',
    swatch: ['#12B7F5', '#FFFFFF'],
  },
  {
    id: 'wechat',
    name: '微信风',
    desc: '我方绿泡白字、左上小尖角，间距更紧',
    swatch: ['#95EC69', '#1A1A1A'],
  },
  {
    id: 'flat',
    name: '极简',
    desc: '不要底色，只保留右对齐与间距',
    swatch: ['#F5F5F5', '#888888'],
  },
  {
    id: 'glass',
    name: '透明',
    desc: '半透明气泡 + 背景模糊，能看见后面的背景图；配渐变/图片背景最好看',
    swatch: ['#F4F7FC', '#D5DEEB'],
  },
]

export const BACKGROUNDS: MarketItem[] = [
  { id: 'none', name: '默认', desc: '跟随主题底色', swatch: ['#FFFFFF', '#F2F4F7'] },
  { id: 'mist', name: '浅灰雾', desc: '大面积留白，最不抢内容', swatch: ['#F5F7FA', '#DDE3EA'] },
  { id: 'blue', name: '蓝紫渐变', desc: '从上到下淡蓝转淡紫', swatch: ['#E8F0FF', '#F3EAFF'] },
  { id: 'paper', name: '米纸纹', desc: '暖色底 + 细纹理，配「米纸」主题最搭', swatch: ['#FBF7EF', '#EFE3CE'] },
  { id: 'stars', name: '星夜', desc: '深底 + 细碎星点，配「暗夜紫」用', swatch: ['#14121C', '#3B2E63'] },
]

export const LAYOUTS: MarketItem[] = [
  {
    id: 'classic',
    name: '经典',
    desc: '侧栏 + 聊天主区（现在用的就是这个）',
    swatch: ['#FFFFFF', '#4D6BFE', '#F2F4F7'],
  },
  {
    id: 'wechat',
    name: '微信',
    desc: '底部四页：微信 / 通讯录 / 朋友圈 / 我；点会话进聊天页，返回退一层',
    swatch: ['#07C160', '#EDEDED', '#FFFFFF'],
  },
]

export const CATALOG = {
  skin: SKINS,
  bubble: BUBBLES,
  background: BACKGROUNDS,
  layout: LAYOUTS,
} as const

export const itemOf = (group: ThemeGroup, id: string): MarketItem =>
  CATALOG[group].find((item) => item.id === id) ?? CATALOG[group][0]
