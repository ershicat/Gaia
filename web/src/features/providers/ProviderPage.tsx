import { useState } from 'react'
import styles from './providers.module.css'
import { GROUP_LABELS, PROVIDERS, providerById, type ProviderGroup } from './registry.js'
import {
  goBackProviders,
  openProviderDetail,
  pickProvider,
  pickProviderModel,
  refreshModels,
  saveProviderKey,
  updateCustomBase,
  updateCustomProtocol,
  useProviders,
} from './store.js'

const GROUPS: ProviderGroup[] = ['official-cn', 'official-intl', 'aggregator']

/** 列表页：按分组列出服务商，当前项打勾 */
const ProviderList = () => {
  const currentId = useProviders((state) => state.providerId)

  return (
    <>
      {GROUPS.map((group) => (
        <div key={group}>
          <div className={styles.sectionLabel}>{GROUP_LABELS[group]}</div>
          <div className={styles.card}>
            {PROVIDERS.filter((provider) => provider.group === group).map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={styles.row}
                onClick={() => {
                  pickProvider(provider.id)
                  openProviderDetail(provider.id)
                }}
              >
                <span className={styles.rowLabel}>{provider.name}</span>
                {provider.id === currentId ? <span className={styles.rowValue}>当前</span> : null}
                <span className={styles.chevron}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className={styles.tip}>
        选服务商 → 填 Key → 选模型即可聊天。切换会保留各自上次用的 Key 与模型。
      </div>
    </>
  )
}

/** 详情页：地址、Key、模型（固定两项 / 拉列表 / 手填） */
const ProviderDetail = () => {
  const id = useProviders((state) => state.providerId)
  const provider = providerById(id)
  const key = useProviders((state) => state.keys[id] ?? '')
  const model = useProviders((state) => state.models[id] ?? provider.fixedModels?.[0] ?? '')
  const customBase = useProviders((state) => state.customBase)
  const customProtocol = useProviders((state) => state.customProtocol)
  const loading = useProviders((state) => state.loading)
  const error = useProviders((state) => state.error)
  const modelList = useProviders((state) => state.modelList)
  const [draft, setDraft] = useState(key)
  const [manual, setManual] = useState(provider.fixedModels ? '' : model)

  return (
    <>
      <div className={styles.sectionLabel}>地址</div>
      <div className={styles.block}>
        {provider.editable ? (
          <input
            className={styles.input}
            defaultValue={customBase}
            placeholder="https://example.com/v1"
            spellCheck={false}
            onBlur={(event) => updateCustomBase(event.target.value)}
          />
        ) : (
          <div className={styles.card}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{provider.baseUrl}</span>
            </div>
          </div>
        )}
      </div>

      {provider.editable ? (
        <>
          <div className={styles.sectionLabel}>协议</div>
          <div className={styles.card}>
            <button
              type="button"
              className={styles.row}
              onClick={() => updateCustomProtocol('openai')}
            >
              <span className={styles.rowLabel}>OpenAI 兼容（/chat/completions）</span>
              {customProtocol === 'openai' ? <span className={styles.rowValue}>✓</span> : null}
            </button>
            <button
              type="button"
              className={styles.row}
              onClick={() => updateCustomProtocol('anthropic')}
            >
              <span className={styles.rowLabel}>Anthropic 原生（/v1/messages）</span>
              {customProtocol === 'anthropic' ? <span className={styles.rowValue}>✓</span> : null}
            </button>
          </div>
        </>
      ) : null}

      <div className={styles.sectionLabel}>API Key</div>
      <div className={styles.block}>
        <input
          className={styles.input}
          value={draft}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      <div className={styles.card} style={{ marginTop: 12 }}>
        <button
          type="button"
          className={styles.row}
          onClick={() => saveProviderKey(draft)}
        >
          <span className={styles.rowLabel}>保存 Key</span>
          <span className={styles.chevron}>›</span>
        </button>
      </div>

      <div className={styles.sectionLabel}>模型</div>
      {provider.fixedModels ? (
        <div className={styles.card}>
          {provider.fixedModels.map((item) => (
            <button
              key={item}
              type="button"
              className={styles.row}
              onClick={() => pickProviderModel(item)}
            >
              <span className={styles.rowLabel}>{item}</span>
              {item === model ? <span className={styles.rowValue}>✓</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.card}>
            <button type="button" className={styles.row} onClick={() => void refreshModels()}>
              <span className={styles.rowLabel}>{loading ? '拉取中…' : '拉取模型列表'}</span>
              <span className={styles.chevron}>›</span>
            </button>
          </div>
          {modelList.length > 0 ? (
            <div className={`${styles.card} ${styles.models}`} style={{ marginTop: 12 }}>
              {modelList.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={styles.row}
                  onClick={() => pickProviderModel(item)}
                >
                  <span className={styles.rowLabel}>{item}</span>
                  {item === model ? <span className={styles.rowValue}>✓</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.block} style={{ marginTop: 12 }}>
            <input
              className={styles.input}
              value={manual}
              placeholder="手动填写模型名，回车生效"
              spellCheck={false}
              onChange={(event) => setManual(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && manual.trim()) {
                  pickProviderModel(manual.trim())
                }
              }}
            />
          </div>
          {model ? <div className={styles.tip}>当前模型：{model}</div> : null}
        </>
      )}

      {provider.note ? <div className={styles.tip}>{provider.note}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
    </>
  )
}

export const ProviderPage = () => {
  const open = useProviders((state) => state.open)
  const step = useProviders((state) => state.step)
  const detailId = useProviders((state) => state.detailId)

  if (!open) {
    return null
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <button type="button" className={styles.back} aria-label="返回" onClick={goBackProviders}>
          ‹
        </button>
        <div className={styles.title}>
          {step === 'list' ? '服务商' : providerById(detailId).name}
        </div>
      </div>
      <div className={styles.body}>
        {step === 'list' ? <ProviderList /> : <ProviderDetail key={detailId} />}
      </div>
    </div>
  )
}
