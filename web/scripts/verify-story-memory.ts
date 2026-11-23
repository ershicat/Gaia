/**
 * 故事记忆端到端验证（真实 API，不允许任何假响应）。
 *
 * 运行（AiSpot 中转的 DeepSeek）：
 *   cd gaia-src/web
 *   TEST_PROVIDER=aispot TEST_MODEL=deepseek-v4.1-flash \
 *     twin inject "aispot-ds" --env TEST_API_KEY -- \
 *     cmd //c "npx --yes tsx@4.20.6 scripts/verify-story-memory.ts"
 *
 * 说明：ChatBridge 只是只读的“会话数据源”，模型调用仍是真实网络请求；
 * 这里没有 stub / monkeypatch / 伪造模型输出。
 */

import assert from 'node:assert/strict'
import type { ChatBridge } from '../src/platform/chat.js'
import type { RequestContext } from '../src/platform/types.js'
import type { Message, Session } from '../src/services/chat/types.js'
import type { MemoryFile } from '../src/features/memory/files.js'

const scope = globalThis as typeof globalThis & { __API_ORIGIN__?: string }
// 源码里 __API_ORIGIN__ 是构建期常量；Node 下先补上，避免 import 时 ReferenceError
scope.__API_ORIGIN__ = 'https://api.deepseek.com'

const provider = process.env.TEST_PROVIDER ?? 'deepseek'
const apiKey = process.env.TEST_API_KEY ?? ''
if (!apiKey) {
  console.error('缺少 TEST_API_KEY（请用 twin inject 注入，不要写进文件）')
  process.exit(2)
}
const model =
  process.env.TEST_MODEL ??
  (provider === 'glm' ? 'glm-4.5-flash' : provider === 'aispot' ? 'deepseek-v4.1-flash' : 'deepseek-flash')

const results: { name: string; ok: boolean; detail?: string }[] = []
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      results.push({ name, ok: true })
      console.log(`ok - ${name}`)
    })
    .catch((error: unknown) => {
      results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
      console.error(`FAIL - ${name}\n  ${error instanceof Error ? error.stack : String(error)}`)
    })

const platform = await import('../src/platform/index.js')
const settingsMod = await import('../src/services/settings.js')
const filesMod = await import('../src/features/memory/files.js')
const story = await import('../src/features/memory/story.js')
const consolidate = await import('../src/features/memory/consolidate.js')
const middlewareMod = await import('../src/features/memory/middleware.js')
const storeMod = await import('../src/features/memory/store.js')

platform.setApiTarget(
  provider === 'glm'
    ? {
        name: '智谱 GLM',
        protocol: 'openai',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        auth: 'bearer',
        contextLimit: 131072,
        serverTools: false,
      }
    : provider === 'aispot'
      ? {
          name: 'AiSpot 中转',
          protocol: 'openai',
          baseUrl: 'https://aispot.swj0227.icu/v1',
          chatPath: '/chat/completions',
          modelsPath: '/models',
          auth: 'bearer',
          contextLimit: 131072,
          serverTools: false,
        }
      : {
          name: 'DeepSeek 官方',
          protocol: 'anthropic',
          baseUrl: 'https://api.deepseek.com',
          chatPath: '/anthropic/v1/messages',
          modelsPath: '/models',
          auth: 'x-api-key',
          contextLimit: 1048576,
          serverTools: false,
        }
)

settingsMod.useSettings.setState({
  apiKey,
  model,
  memoryModel: model,
  storyModules: { ...settingsMod.DEFAULT_STORY_MODULES },
  sessionCard: false,
  autoCompress: false,
})

const roleId = 'role-linshen'
const sessionId = 'session-e2e-story'

let seq = 0
const user = (content: string): Message => ({
  id: `u${++seq}`,
  role: 'user',
  content,
  files: [],
  createdAt: Date.now() + seq,
})
const assistant = (text: string): Message => ({
  id: `a${++seq}`,
  role: 'assistant',
  createdAt: Date.now() + seq,
  model: null,
  prefix: true,
  status: 'done',
  blocks: [{ type: 'text', text }],
})

const firstBatch = [
  user('今晚雨很大，我在医院门口等你下班。'),
  assistant('林深撑着伞出来，看到你时脚步快了一点：怎么不打电话？淋湿了怎么办。'),
  user('我想给你一个惊喜。你今天累不累？'),
  assistant('他把伞往你那边偏：累。看到你就好点了。先上车，我带你去吃热汤面。'),
  user('林深，我们现在算什么关系？'),
  assistant('他握方向盘的手停了一下：你想算什么？'),
  user('我想做你女朋友。'),
  assistant('他耳根红了，低声说：那就女朋友。不过先说好，我值夜班的时候别一个人跑来找我，太危险。'),
  user('好，我答应你。对了，你之前说周末带我去看海，还算数吗？'),
  assistant('算。周六早上我来接你。'),
  user('上周你失约那次，我其实很生气。'),
  assistant('我知道。那天急诊来了个孩子，我走不开。以后失约我会提前打电话，不让你等。'),
  user('那我们和好了。你欠我一次看海。'),
  assistant('嗯，和好了。欠你的，我记着。'),
]
const secondBatch = [
  user('周六我们到海边了，风好大，你把外套给我穿了。'),
  assistant('林深把外套裹紧你：别感冒。看，日落。'),
  user('我拍了张照片，洗出来放你钱包里了。'),
  assistant('他愣了一下，把钱包收好：我会一直带着。'),
]

const messages = [...firstBatch, ...secondBatch]
// 模拟“第二轮对话还没发生”：第一次整理只看到 firstBatch，之后再把新增消息放进来
let visibleMessages: Message[] = firstBatch
const session: Session = {
  id: sessionId,
  title: '林深 · 测试',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  roleIds: [roleId],
  messages,
}
const sessions = new Map<string, Session>([[sessionId, session]])
const bridge: ChatBridge = {
  listSessions: () => [],
  activeSessionId: () => sessionId,
  getSession: (id) => sessions.get(id),
  getMessages: (id) => (id === sessionId ? visibleMessages : []),
  apiKey: () => apiKey,
}
platform.setChatBridge(bridge)

const modules = { ...settingsMod.DEFAULT_STORY_MODULES }

await check('纯函数：故事路径解析与角色隔离', () => {
  const parsed = story.parseStoryPath('/story/role-a/characters/林深.md')
  assert.equal(parsed?.roleId, 'role-a')
  assert.equal(parsed?.module, 'characters')
  assert.equal(parsed?.characterName, '林深')
  assert.equal(story.parseStoryPath('/story/role-a/world.md')?.module, 'world')
  assert.equal(story.parseStoryPath('/story/role-a/../evil.md'), null)
  assert.equal(story.remapStoryPath('/story/characters/林深.md', 'role-b'), '/story/role-b/characters/林深.md')
  assert.equal(
    story.remapStoryPath('/story/role-a/outline.md', 'role-b'),
    '/story/role-b/outline.md'
  )
  // 模型/角色卡可能把占位符原样写进 path：必须展开成真实角色路径，且不能被当成个人文件
  assert.equal(
    story.expandStoryRootPath('/<story_root>/outline.md', 'role-b'),
    '/story/role-b/outline.md'
  )
  assert.equal(
    story.expandStoryRootPath('/story_root/characters/林深.md', 'role-b'),
    '/story/role-b/characters/林深.md'
  )
  assert.equal(story.looksLikeStoryPath('/<story_root>/outline.md'), true)
  assert.equal(story.looksLikeStoryPath('/topics/food.md'), false)
})

await check('纯函数：latest-wins 与追加去重', () => {
  const merged = story.mergeStoryLines('characters', '- [状态] 冷战', [
    '[状态] 和好',
    '[状态] 和好',
    '[承诺] 带她看海',
  ])
  const lines = merged.split('\n')
  assert.equal(lines.filter((line) => line.includes('[状态]')).length, 1)
  assert.ok(merged.includes('[状态] 和好'))
  assert.ok(!merged.includes('冷战'))
  assert.equal(lines.filter((line) => line.includes('[承诺]')).length, 1)

  // 同一条旧状态重复返回时，不应把旧行删掉
  const deduped = story.mergeStoryLines('characters', '- [状态] 冷战', ['[状态] 冷战'])
  assert.equal(deduped, '- [状态] 冷战')
})

await check('纯函数：故事写入校验（跨角色/未启用模块/用户人物）', () => {
  const noWorld = { ...modules, world: false }
  const other = story.validateStoryWrites(
    [{ path: '/story/role-other/world.md', aliases: [], lines: ['[设定] 某个城'] }],
    roleId,
    { ...modules, world: true }
  )
  assert.equal(other.accepted.length, 0)
  assert.equal(other.rejected.length, 1)

  const worldOff = story.validateStoryWrites(
    [{ path: `/story/${roleId}/world.md`, aliases: [], lines: ['[设定] 某个城'] }],
    roleId,
    noWorld
  )
  assert.equal(worldOff.accepted.length, 0)

  const userFile = story.validateStoryWrites(
    [{ path: `/story/${roleId}/characters/用户.md`, aliases: [], lines: ['[状态] 开心'] }],
    roleId,
    modules
  )
  assert.equal(userFile.accepted.length, 0)

  const good = story.validateStoryWrites(
    [
      {
        path: `/story/${roleId}/characters/林深.md`,
        aliases: [],
        lines: ['[身份] 急诊科医生', '[状态] 和好', '[线索] 乱标签'],
      },
    ],
    roleId,
    modules
  )
  assert.equal(good.accepted.length, 1)
  assert.deepEqual(good.accepted[0].lines, ['[身份] 急诊科医生', '[状态] 和好'])
})

await check('纯函数：索引与简报只包含当前角色/启用模块', () => {
  const files: MemoryFile[] = []
  const file = (path: string, content: string) => ({
    path,
    title: path,
    description: '',
    aliases: [],
    content,
    updatedAt: Date.now(),
  })
  files.push(
    file(
      `/story/${roleId}/characters/林深.md`,
      '- [身份] 急诊科医生\n- [关系] 女朋友\n- [状态] 和好\n- [承诺] 带她看海\n- [承诺][已兑现] 看海\n- [边界] 夜班别来找他'
    ),
    file(
      `/story/${roleId}/outline.md`,
      '- [主线] 医患重逢后相恋\n- [阶段] 热恋\n- [进度] 第 3 周\n- [下一拍] 见家长'
    ),
    file(
      `/story/${roleId}/events.md`,
      '- [事件] 海边看日落｜周六｜两人确定关系后第一次旅行｜参与：林深、用户｜后果：感情升温\n- [线索] 钱包里的照片'
    ),
    file(`/story/${roleId}/world.md`, '- [规则] 医院急诊科不能离岗'),
    file(`/story/role-other/characters/周砚.md`, '- [身份] 另一个角色\n- [状态] 不该出现')
  )

  const index = story.buildStoryIndex(files as never, roleId, modules)
  const brief = story.renderStoryBrief(index, modules)
  assert.ok(brief.includes('<story_memory>'))
  assert.ok(brief.includes('林深'))
  assert.ok(brief.includes('和好'))
  assert.ok(brief.includes('带她看海'))
  assert.ok(brief.includes('医患重逢后相恋'))
  assert.ok(brief.includes('海边看日落'))
  assert.ok(!brief.includes('周砚'))
  assert.ok(!brief.includes('不能离岗')) // world 默认关

  const noCharacters = { ...modules, characters: false }
  const briefWithout = story.renderStoryBrief(
    story.buildStoryIndex(files as never, roleId, noCharacters),
    noCharacters
  )
  assert.ok(!briefWithout.includes('### 人物'))
  assert.ok(!briefWithout.includes('急诊科医生'))
})

await check('纯函数：句尾 [已兑现]/[已收] 与同行「已收」拆分', () => {
  const now = Date.now()
  const files: MemoryFile[] = [
    {
      path: `/story/${roleId}/characters/林深.md`,
      title: '林深',
      description: '',
      aliases: [],
      content: '- [承诺] 周六去看海 [已兑现]\n- [承诺] 每晚报平安',
      updatedAt: now,
    },
    {
      path: `/story/${roleId}/events.md`,
      title: '关键事件',
      description: '',
      aliases: [],
      content: '- [线索] 钱包照片；已收：[线索] 欠一次看海 [已收]',
      updatedAt: now,
    },
  ]
  const index = story.buildStoryIndex(files, roleId, modules)
  assert.equal(index.characters[0]?.fulfilled.length, 1)
  assert.equal(index.characters[0]?.promises.length, 1)
  assert.equal(index.characters[0]?.promises[0]?.text, '每晚报平安')
  assert.deepEqual(
    index.openClues.map((line) => line.text),
    ['钱包照片']
  )
})

await check('纯函数：watermark 按 40 条分批、解析失败不推进', () => {
  const many: Message[] = Array.from({ length: 100 }, (_, index) =>
    index % 2 === 0 ? user(`第 ${index} 条`) : assistant(`回复 ${index}`)
  )
  const input = consolidate.buildConsolidationInput([], many.slice(0, 40), { roleId, modules })
  assert.equal(input.included, 40)
  assert.ok(input.text.includes('第 0 条'))
  assert.ok(input.text.includes('回复 39'))
  assert.ok(!input.text.includes('第 40 条'))

  const bad = consolidate.parseConsolidation('模型今天不想输出 JSON')
  assert.equal(bad.ok, false)
  const empty = consolidate.parseConsolidation('{"writes":[]}')
  assert.equal(empty.ok, true)
  assert.equal(empty.ops.length, 0)
})

console.log(`\n=== 真实 GLM 调用（${model}）· 第一次整理 ===`)

let first: Awaited<ReturnType<typeof consolidate.consolidateSession>> | undefined
await check('真实 API：第一次整理产出故事文件', async () => {
  first = await consolidate.consolidateSession(sessionId, [], {}, { roleId, modules })
  console.log(`  ok=${first.ok} written=${first.result.written} nextWatermark=${first.nextWatermark}`)
  console.log(`  files=${first.result.files.join(', ') || '(none)'}`)
  if (first.rejected.length > 0) {
    console.log(`  rejected=${JSON.stringify(first.rejected)}`)
  }
  if (!first.ok) {
    console.log(
      `  diag=${JSON.stringify(
        platform
          .diagEntries()
          .filter((entry) => entry.scope === 'memory')
          .slice(-3)
      )}`
    )
  }
  assert.equal(first.ok, true, '模型输出必须能解析为 JSON')
  assert.equal(first.nextWatermark, firstBatch.length)
  const storyFiles = first.files.filter((file) => story.isStoryPath(file.path))
  assert.ok(storyFiles.length > 0, '应至少产出一个故事文件')
  for (const file of storyFiles) {
    assert.ok(story.parseStoryPath(file.path), `故事路径必须合法：${file.path}`)
    assert.equal(story.parseStoryPath(file.path)?.roleId, roleId)
  }
  assert.ok(
    storyFiles.some((file) => file.path.includes('/characters/')),
    '应产出人物文件'
  )
  assert.ok(
    storyFiles.some((file) => file.path.endsWith('/outline.md')),
    '应产出大纲文件'
  )
  const index = story.buildStoryIndex(first.files, roleId, modules)
  const brief = story.renderStoryBrief(index, modules)
  console.log(`\n--- 故事简报 ---\n${brief}\n--- end ---\n`)
  assert.ok(brief.includes('林深'), '简报应包含角色名')
  assert.ok(brief.includes('看海') || brief.includes('海边'), '简报应包含关键约定/事件')
})

if (first) {
  visibleMessages = messages
  const watermark = first.nextWatermark
  const baseFiles = first.files
  console.log('\n=== 真实 GLM 调用 · 第二次整理（增量 4 条） ===')
  let second: Awaited<ReturnType<typeof consolidate.consolidateSession>> | undefined
  await check('真实 API：第二次整理增量更新且不丢旧状态', async () => {
    second = await consolidate.consolidateSession(
      sessionId,
      baseFiles,
      { [sessionId]: watermark },
      { roleId, modules }
    )
    console.log(`  ok=${second.ok} written=${second.result.written} nextWatermark=${second.nextWatermark}`)
    console.log(`  files=${second.result.files.join(', ') || '(none)'}`)
    assert.equal(second.ok, true)
    assert.equal(second.nextWatermark, messages.length)
    const before = new Map(baseFiles.map((file) => [file.path, file.content]))
    const touchedExisting = second.changedFiles.filter((file) => before.has(file.path))
    assert.ok(touchedExisting.length > 0, '第二次整理应更新已有故事文件')
    const index = story.buildStoryIndex(second.files, roleId, modules)
    const brief = story.renderStoryBrief(index, modules)
    console.log(`\n--- 更新后简报 ---\n${brief}\n--- end ---\n`)
    assert.ok(brief.includes('林深'))
    assert.ok(brief.includes('看海') || brief.includes('海边') || brief.includes('日落'))
  })

  if (second) {
    storeMod.useMemory.setState({
      files: second.files,
      watermarks: { [sessionId]: second.nextWatermark },
      lastRun: { [sessionId]: Date.now() },
      summaries: {},
      cards: {},
      consolidating: false,
    })

    const ctx = (): RequestContext => ({
      sessionId,
      roleId,
      model,
      system: '你是一个角色，按人设回复。',
      temperature: null,
      safetyCheck: false,
      search: false,
      thinking: false,
      question: '你还记得周末要带我去看海吗？',
      dropTurns: 0,
      compactedSummary: null,
      prefixEnabled: true,
      cardNote: '',
      tailNotes: [],
    })

    await check('中间件：当前角色注入 <story_memory> 到 cardNote', () => {
      const out = middlewareMod.memoryMiddleware(ctx())
      assert.ok(out, '中间件应返回改写后的上下文')
      console.log(`\n--- cardNote ---\n${out?.cardNote ?? ''}\n--- end ---\n`)
      assert.ok((out?.cardNote ?? '').includes('<story_memory>'))
      assert.ok((out?.cardNote ?? '').includes('林深'))
      assert.ok((out?.cardNote ?? '').includes('看海') || (out?.cardNote ?? '').includes('海边'))
      assert.ok(!(out?.system ?? '').includes('林深'), '故事简报不应进入 system（避免击穿提示词缓存）')
    })

    await check('中间件：切到别的角色不串味', () => {
      sessions.set(sessionId, { ...session, roleIds: ['role-other'] })
      const out = middlewareMod.memoryMiddleware(ctx())
      assert.ok(!(out?.cardNote ?? '').includes('<story_memory>'))
      assert.ok(!(out?.cardNote ?? '').includes('林深'))
      sessions.set(sessionId, session)
    })

    await check('中间件：noPersona 会话不启用故事记忆', () => {
      sessions.set(sessionId, { ...session, noPersona: true })
      const out = middlewareMod.memoryMiddleware(ctx())
      assert.ok(!(out?.cardNote ?? '').includes('<story_memory>'))
      sessions.set(sessionId, session)
    })

    await check('中间件：总开关关闭后不再注入', () => {
      settingsMod.useSettings.setState({
        storyModules: { ...settingsMod.DEFAULT_STORY_MODULES, enabled: false },
      })
      const out = middlewareMod.memoryMiddleware(ctx())
      assert.ok(!(out?.cardNote ?? '').includes('<story_memory>'))
      settingsMod.useSettings.setState({ storyModules: { ...settingsMod.DEFAULT_STORY_MODULES } })
    })
  }
}

const failed = results.filter((item) => !item.ok)
console.log(`\n=== 结果：${results.length - failed.length}/${results.length} 通过 ===`)
if (failed.length > 0) {
  for (const item of failed) {
    console.error(`FAILED: ${item.name} — ${item.detail ?? ''}`)
  }
  process.exit(1)
}
