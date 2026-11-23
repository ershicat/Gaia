import { useState } from 'react'
import { currentApiTarget, runCommand, textOption } from '../../platform/index.js'
import { LocationSetting } from '../../components/settings/SettingsDialog.js'
import { MODELS, modelLabel } from '../../services/api/models.js'
import {
  setApiKey,
  setAutoCompress,
  setAutoTitle,
  setCompressThreshold,
  setContextRoundLimit,
  setLocale,
  setMemoryModel,
  setModel,
  setSessionCard,
  setStoryModule,
  setThemePreference,
  setTitlePrompt,
  setTtsVoice,
  useSettings,
  type Locale,
  type ThemePreference,
} from '../../services/settings.js'
import styles from './settings.module.css'
import {
  closeSettingsPage,
  FONT_SCALES,
  goBack,
  setCollapseThinking,
  setEndpoint,
  setFontScale,
  useSettingsUi,
  type SettingsPage as SettingsPageId,
} from './store.js'
import { DataPage } from './ui/DataPage.js'
import { OptionRow, RootPage } from './ui/rows.js'

const TITLES: Record<SettingsPageId, string> = {
  root: '设置',
  data: '数据管理',
  model: '模型',
  chat: '聊天',
  locale: '语言',
  theme: '外观',
  font: '字体大小',
  think: '个性化',
  voice: '朗读音色',
  location: '位置信息',
  endpoint: '接口地址',
  apiKey: 'API Key',
  feedback: '反馈',
}

const themeLabel = (value: ThemePreference): string =>
  value === 'light' ? '浅色' : value === 'dark' ? '深色' : '跟随系统'

const voiceLabel = (value: string): string =>
  value === 'tide' ? '暗潮（男声）' : value === 'stella' ? '海星（女声）' : '默认'

/** 上游默认是海星；只有用户显式存过音色才显示具体名字，否则对齐旧版的「默认」 */
const readStoredVoice = (): string => {
  try {
    return globalThis.localStorage?.getItem('chat-demo:tts-voice') ?? ''
  } catch {
    return ''
  }
}

const OptionPage = ({
  options,
  onPick,
}: {
  options: { label: string; selected: boolean; pick: () => void }[]
  onPick?: () => void
}) => (
  <div className={styles.card} style={{ marginTop: 16 }}>
    {options.map((option) => (
      <OptionRow
        key={option.label}
        label={option.label}
        selected={option.selected}
        onSelect={() => {
          option.pick()
          if (onPick) {
            onPick()
          }
        }}
      />
    ))}
  </div>
)

const EndpointPage = () => {
  const endpoint = useSettingsUi((state) => state.endpoint)
  return (
    <>
      <div className={styles.block} style={{ marginTop: 16 }}>
        <input
          className={styles.input}
          defaultValue={endpoint}
          placeholder="https://api.deepseek.com"
          onBlur={(event) => setEndpoint(event.target.value)}
        />
      </div>
      <div className={styles.tip}>留空表示使用官方默认地址；改完点空白处生效。</div>
    </>
  )
}

const ApiKeyPage = () => {
  const apiKey = useSettings((state) => state.apiKey)
  const [draft, setDraft] = useState(apiKey ?? '')
  const [saved, setSaved] = useState(false)
  return (
    <>
      <div className={styles.block} style={{ marginTop: 16 }}>
        <input
          className={styles.input}
          value={draft}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
        />
      </div>
      <div className={styles.tip}>{saved ? '已保存' : '粘贴完整 Key；保存后立即生效。'}</div>
      <div className={styles.card} style={{ marginTop: 16 }}>
        <button
          type="button"
          className={styles.row}
          onClick={() => {
            setApiKey(draft.trim() || null)
            setSaved(true)
            closeSettingsPage()
          }}
        >
          <span className={styles.rowLabel}>保存</span>
          <span className={styles.chevron}>›</span>
        </button>
      </div>
    </>
  )
}

/** 模型设置：聊天模型 + 记忆整理（做梦）用的模型 */
const ModelPage = () => {
  const model = useSettings((state) => state.model)
  const memoryModel = useSettings((state) => state.memoryModel)
  // 模型列表跟随当前服务商：内置表只覆盖 DeepSeek，别家由服务商积木把可选模型放进 target
  const providerModels = currentApiTarget()?.models ?? []
  const options = providerModels.length > 0 ? providerModels : MODELS.map((option) => option.id)
  const labelOf = (id: string): string => {
    const known = MODELS.find((option) => option.id === id)
    return known ? `${known.label} · ${known.desc}` : id
  }
  return (
    <>
      <div className={styles.sectionLabel}>聊天模型</div>
      <div className={styles.card}>
        {options.map((id) => (
          <OptionRow
            key={id}
            label={labelOf(id)}
            selected={model === id}
            onSelect={() => setModel(id)}
          />
        ))}
      </div>
      {providerModels.length === 0 && currentApiTarget() !== null ? (
        <div className={styles.tip}>
          当前服务商还没拉到模型列表：去「接入 → 服务商」里点「拉取模型列表」，或在那里手动填模型名。
        </div>
      ) : null}
      <div className={styles.sectionLabel}>记忆整理模型</div>
      <div className={styles.card}>
        <OptionRow
          label="跟随聊天模型"
          selected={memoryModel === null}
          onSelect={() => setMemoryModel(null)}
        />
        {MODELS.map((option) => (
          <OptionRow
            key={option.id}
            label={option.label}
            selected={memoryModel === option.id}
            onSelect={() => setMemoryModel(option.id)}
          />
        ))}
      </div>
      <div className={styles.tip}>
        整理记忆是后台任务，挑个便宜/快的模型更划算；只影响「做梦」时的整理，不影响聊天本身。
      </div>
    </>
  )
}

/** 聊天设置：上下文轮次上限 + 自动压缩 + 自动标题（含自定义提示词） */
const ChatPage = () => {
  const roundLimit = useSettings((state) => state.contextRoundLimit)
  const autoTitle = useSettings((state) => state.autoTitle)
  const titlePrompt = useSettings((state) => state.titlePrompt)
  const autoCompress = useSettings((state) => state.autoCompress)
  const compressThreshold = useSettings((state) => state.compressThreshold)
  const sessionCard = useSettings((state) => state.sessionCard)
  const storyModules = useSettings((state) => state.storyModules)
  const [rounds, setRounds] = useState(String(roundLimit))
  const [prompt, setPrompt] = useState(titlePrompt)
  const [threshold, setThreshold] = useState(String(compressThreshold))

  return (
    <>
      <div className={styles.block} style={{ marginTop: 16 }}>
        <div className={styles.label}>上下文轮次上限</div>
        <input
          className={styles.input}
          type="number"
          min={0}
          inputMode="numeric"
          value={rounds}
          onChange={(event) => setRounds(event.target.value)}
          onBlur={() => {
            const value = Number(rounds)
            const saved = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
            setContextRoundLimit(saved)
            setRounds(String(saved))
          }}
        />
        <div className={styles.tip}>
          默认 30 轮，0 表示不限。超出后按滞回策略丢掉最早的轮次（保留约一半上限），
          不会每轮都滑掉一条；旧轮次仍可回看，只是不进上下文。
          窗口固定才能命中提示词缓存，长会话才不会越聊越贵。
        </div>
      </div>

      <div className={styles.block} style={{ marginTop: 16 }}>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            checked={autoCompress}
            onChange={(event) => setAutoCompress(event.target.checked)}
          />
          <span>自动压缩上下文</span>
        </label>
      </div>

      <div className={styles.block} style={{ marginTop: 16 }}>
        <div className={styles.label}>压缩触发比例（%）</div>
        <input
          className={styles.input}
          type="number"
          min={1}
          max={98}
          inputMode="numeric"
          disabled={!autoCompress}
          value={threshold}
          onChange={(event) => setThreshold(event.target.value)}
          onBlur={() => {
            setCompressThreshold(Number(threshold))
            setThreshold(String(useSettings.getState().compressThreshold))
          }}
        />
        <div className={styles.tip}>
          上下文占用达到这个比例时提前压缩，每次至少压 8 轮；平时每攒够 30 轮压一次。
          范围 1~98，默认 80。摘要只保留最近几轮原文（可回看），每次改写摘要都会让这一轮的
          提示词缓存失效，所以不会每轮都改。已建「会话档案」的长会话会自动跳过压缩（长度交给
          固定窗口，人设交给档案）。
        </div>
      </div>

      <div className={styles.block} style={{ marginTop: 16 }}>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            checked={sessionCard}
            onChange={(event) => setSessionCard(event.target.checked)}
          />
          <span>会话档案（防 OOC，默认关）</span>
        </label>
        <div className={styles.tip}>
          打开后，超过 40 轮的长会话会在下次发送前建一张档案卡：人物（姓名/年龄/身份/说话方式/称呼）、
          关系、世界要点、剧情进度、未完成线索。只取开头 8k + 最近 16k token 做样本，一次约 2~5 分钱，
          之后每 20 轮更新一次（约 2 分钱）。档案放在固定窗口之后，不影响提示词缓存；
          关掉后不再新建，已有档案也不再注入。档案可在「设置 → 记忆」里查看、重建或删除。
        </div>
      </div>

      <div className={styles.block} style={{ marginTop: 16 }}>
        <div className={styles.label}>故事记忆（人机恋 / 角色扮演）</div>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            checked={storyModules.enabled}
            onChange={(event) => setStoryModule('enabled', event.target.checked)}
          />
          <span>启用故事记忆</span>
        </label>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            disabled={!storyModules.enabled}
            checked={storyModules.characters}
            onChange={(event) => setStoryModule('characters', event.target.checked)}
          />
          <span>人物与关系</span>
        </label>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            disabled={!storyModules.enabled}
            checked={storyModules.outline}
            onChange={(event) => setStoryModule('outline', event.target.checked)}
          />
          <span>关系线 / 大纲</span>
        </label>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            disabled={!storyModules.enabled}
            checked={storyModules.events}
            onChange={(event) => setStoryModule('events', event.target.checked)}
          />
          <span>关键事件</span>
        </label>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            disabled={!storyModules.enabled}
            checked={storyModules.world}
            onChange={(event) => setStoryModule('world', event.target.checked)}
          />
          <span>世界观（AU / 奇幻 / 科幻再开）</span>
        </label>
        <div className={styles.tip}>
          按角色隔离，不会串到别的角色。默认人物 / 大纲 / 事件三开，世界观关。
          关闭只停止注入和后续整理，已有文件保留；重新打开后下次「做梦」继续更新。
          故事记忆与会话档案卡、配角库相互独立。
        </div>
      </div>

      <div className={styles.block} style={{ marginTop: 16 }}>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            checked={autoTitle}
            onChange={(event) => setAutoTitle(event.target.checked)}
          />
          <span>自动生成会话标题</span>
        </label>
      </div>

      <div className={styles.block} style={{ marginTop: 16 }}>
        <div className={styles.label}>标题提示词</div>
        <textarea
          className={styles.textarea}
          rows={7}
          value={prompt}
          placeholder="留空 = 用服务端默认标题（不额外发请求）"
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={() => setTitlePrompt(prompt)}
        />
        <div className={styles.tip}>
          填了就改由本地请求生成标题（首轮回复后触发），{'{content}'} 会替换成最近几条对话；
          清空则回到服务端标题。
        </div>
      </div>
    </>
  )
}

const FeedbackPage = () => (
  <>
    <div className={styles.block} style={{ marginTop: 16 }}>
      <div style={{ fontSize: 15, lineHeight: 1.7 }}>
        问题、建议、想加的功能，提到仓库的 Issues 就行。
      </div>
    </div>
    <div className={styles.card} style={{ marginTop: 16 }}>
      <button
        type="button"
        className={styles.row}
        onClick={() => runCommand('diagnostics.open')}
      >
        <span className={styles.rowLabel}>诊断日志</span>
        <span className={styles.rowValue}>导出后发我</span>
        <span className={styles.chevron}>›</span>
      </button>
    </div>
  </>
)

/** 整屏竖排设置页：形态与尺寸对齐旧版原生设置页 */
export const SettingsPage = () => {
  const open = useSettingsUi((state) => state.open)
  const page = useSettingsUi((state) => state.page)
  const fontScale = useSettingsUi((state) => state.fontScale)
  const collapseThinking = useSettingsUi((state) => state.collapseThinking)
  const locale = useSettings((state) => state.locale)
  const theme = useSettings((state) => state.themePreference)
  const voice = useSettings((state) => state.ttsVoice)
  const location = useSettings((state) => state.location)
  const apiKey = useSettings((state) => state.apiKey)
  const model = useSettings((state) => state.model)
  const contextRoundLimit = useSettings((state) => state.contextRoundLimit)
  const autoTitle = useSettings((state) => state.autoTitle)
  const autoCompress = useSettings((state) => state.autoCompress)
  const compressThreshold = useSettings((state) => state.compressThreshold)

  if (!open) {
    return null
  }

  const fontLabel = FONT_SCALES.find((item) => item.value === fontScale)?.label ?? '标准'
  const locationLabel = location?.province
    ? `${location.province}${location.city ? ` ${location.city}` : ''}`
    : '未设置'

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.back}
          aria-label="返回"
          onClick={() => {
            if (page === 'root') {
              closeSettingsPage()
            } else {
              goBack()
            }
          }}
        >
          ‹
        </button>
        <div className={styles.title}>{TITLES[page]}</div>
      </div>
      <div className={styles.body}>
        {page === 'root' ? (
          <RootPage
            locale={locale === 'en-US' ? 'English' : '中文（简体中文）'}
            theme={themeLabel(theme)}
            market="主题 / 气泡 / 背景 / 界面"
            font={fontLabel}
            model={modelLabel(model)}
            chat={`${contextRoundLimit > 0 ? `${contextRoundLimit} 轮` : '不限轮次'} · 标题${autoTitle ? '自动' : '手动'}${autoCompress ? ` · 压缩${compressThreshold}%` : ' · 不压缩'}`}
            think={collapseThinking ? '思考内容自动折叠' : '思考内容展开'}
            voice={readStoredVoice() ? voiceLabel(voice) : '默认'}
            location={locationLabel}
            provider={textOption('providerLabel', 'DeepSeek 官方')}
            apiKey={apiKey ? '已设置' : '未设置'}
          />
        ) : null}
        {page === 'data' ? <DataPage /> : null}
        {page === 'chat' ? <ChatPage /> : null}
        {page === 'model' ? <ModelPage /> : null}
        {page === 'locale' ? (
          <OptionPage
            options={(['zh-CN', 'en-US'] as Locale[]).map((value) => ({
              label: value === 'zh-CN' ? '中文（简体中文）' : 'English',
              selected: locale === value,
              pick: () => setLocale(value),
            }))}
            onPick={goBack}
          />
        ) : null}
        {page === 'theme' ? (
          <OptionPage
            options={(['system', 'light', 'dark'] as ThemePreference[]).map((value) => ({
              label: themeLabel(value),
              selected: theme === value,
              pick: () => setThemePreference(value),
            }))}
            onPick={goBack}
          />
        ) : null}
        {page === 'font' ? (
          <OptionPage
            options={FONT_SCALES.map((item) => ({
              label: item.label,
              selected: fontScale === item.value,
              pick: () => setFontScale(item.value),
            }))}
            onPick={goBack}
          />
        ) : null}
        {page === 'think' ? (
          <OptionPage
            options={[
              {
                label: '思考内容自动折叠',
                selected: collapseThinking,
                pick: () => setCollapseThinking(true),
              },
              {
                label: '思考内容展开',
                selected: !collapseThinking,
                pick: () => setCollapseThinking(false),
              },
            ]}
            onPick={goBack}
          />
        ) : null}
        {page === 'voice' ? (
          <OptionPage
            options={[
              {
                label: '海星（女声）',
                selected: voice !== 'tide',
                pick: () => setTtsVoice('stella'),
              },
              {
                label: '暗潮（男声）',
                selected: voice === 'tide',
                pick: () => setTtsVoice('tide'),
              },
            ]}
            onPick={goBack}
          />
        ) : null}
        {page === 'location' ? (
          <div style={{ paddingTop: 16 }}>
            <LocationSetting />
          </div>
        ) : null}
        {page === 'endpoint' ? <EndpointPage /> : null}
        {page === 'apiKey' ? <ApiKeyPage /> : null}
        {page === 'feedback' ? <FeedbackPage /> : null}
      </div>
    </div>
  )
}
