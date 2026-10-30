import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PNG } from 'pngjs'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createSocialService } from '../server/social.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createFusionService } from '../server/fusion.js'
import { createGeminiGenerator } from '../server/gemini.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createMergedStory,
  createStory,
  fusionProductModeFor,
  MERGE_SOURCE_LIMIT,
  outlineLengthFor,
  plazaSnapshot,
  publicSnapshot,
  storyLengthModeOf,
  totalChaptersFor,
} from '../src/story-engine.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import { detailSourcesFor, plazaReaderStory } from '../src/plaza.js'

/**
 * REQ-53 合流多源： fusion takes two to ten source lines, not exactly
 * two. The cast is every source's lead; the publish snapshot and the
 * plaza record both carry the full provenance list (sources[]), and
 * the book detail resolves each source live — linkable while shelved,
 * 已下架 once gone, name-only for the publisher's own unshelved lines.
 * The REQ-49 consent gate keeps applying per source publication.
 */

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    current = acceptChapter(current, buildChapter(current, index), chapterKey(current, index))
  }
  return current
}
const finishedShort = (options = {}) => walkLocal(createStory({ genreId: 'mist', ...options }), 6)
const serializing = (options = {}, chapters = 3) => walkLocal(
  createStory({ genreId: 'mist', storyLengthMode: 'endless', ...options }), chapters,
)

// ---------------------------------------------------------------------------
// Engine: N-source creation
// ---------------------------------------------------------------------------

test('three sources fuse into one line with a three-lead cast', () => {
  const a = { ...finishedShort({ name: '阿澜' }), title: '雾港来信' }
  const b = { ...finishedShort({ name: '沈砚', genreId: 'cultivation' }), title: '剑碑夜行' }
  const c = { ...serializing({ name: '陆鸣', genreId: 'neon' }), title: '霓虹夜航' }
  const merged = createMergedStory([a, b, c])
  assert.equal(merged.kind, 'merged')
  // One serializing source is enough to pass the endless mode on.
  assert.equal(storyLengthModeOf(merged), 'endless')
  assert.equal(totalChaptersFor(merged), Infinity)
  assert.equal(outlineLengthFor(merged), 24)
  // The cast is every source's lead, in pick order.
  assert.deepEqual(merged.config.protagonists.map((person) => person.name), ['阿澜', '沈砚', '陆鸣'])
  assert.equal(merged.config.name, '阿澜 × 沈砚 × 陆鸣')
  assert.deepEqual(merged.config.sourceGenres, ['mist', 'cultivation', 'neon'])
  // Provenance aligns across every parallel list.
  assert.deepEqual(merged.sourceTitles, ['雾港来信', '剑碑夜行', '霓虹夜航'])
  assert.deepEqual(merged.sourceIds, [a.id, b.id, c.id])
  assert.deepEqual(merged.derivedFrom, [a.id, b.id, c.id])
  assert.deepEqual(merged.sourcePublicationIds, ['', '', ''])
  assert.deepEqual(merged.sources, [
    { title: '雾港来信', publicationId: '' },
    { title: '剑碑夜行', publicationId: '' },
    { title: '霓虹夜航', publicationId: '' },
  ])
  // Distinct source titles make the fused title.
  assert.equal(merged.title, '合流：雾港来信 × 剑碑夜行 × 霓虹夜航')
  // The fused bible speaks to the whole cast, and validation holds.
  assert.match(merged.worldBible.premise, /3位主角/)
  assert.ok(merged.worldBible.rules.some((rule) => rule.includes('全体主角')))
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [merged] }), [])
  // The opening chapter addresses all three leads by name.
  const chapter = buildChapter(merged, 0)
  const prose = chapter.paragraphs.join('')
  for (const name of ['阿澜', '沈砚', '陆鸣']) assert.ok(prose.includes(name), `chapter names ${name}`)
})

test('all-finished sources keep the short cap, whatever their count', () => {
  const merged = createMergedStory([finishedShort(), finishedShort(), finishedShort(), finishedShort()])
  assert.equal(storyLengthModeOf(merged), 'short')
  assert.equal(totalChaptersFor(merged), 6)
  assert.equal(fusionProductModeFor([finishedShort(), finishedShort(), finishedShort()]), 'short')
  assert.equal(fusionProductModeFor([finishedShort(), serializing(), finishedShort()]), 'endless')
  // The legacy two-argument form still works.
  assert.equal(fusionProductModeFor(finishedShort(), serializing()), 'endless')
})

test('source-count bounds: one is refused, ten fuse, eleven are refused', () => {
  const one = finishedShort()
  assert.throws(() => createMergedStory([one]), /至少需要两条故事线/)
  assert.throws(() => createMergedStory([]), /至少需要两条故事线/)
  const ten = Array.from({ length: MERGE_SOURCE_LIMIT }, () => finishedShort())
  const mergedTen = createMergedStory(ten)
  assert.equal(mergedTen.config.protagonists.length, 10)
  assert.equal(mergedTen.sources.length, 10)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [mergedTen] }), [])
  const eleven = [...ten, finishedShort()]
  assert.throws(() => createMergedStory(eleven), /最多 10 条故事线/)
})

test('duplicates and fused lines are refused as sources, at any position', () => {
  const a = finishedShort()
  const b = finishedShort()
  assert.throws(() => createMergedStory([a, b, a]), /不能和自己合流/)
  assert.throws(() => createMergedStory([a, a]), /不能和自己合流/)
  const fused = createMergedStory([a, b])
  assert.throws(() => createMergedStory([finishedShort(), fused, finishedShort()]), /不能再作合流的来源/)
})

test('the lead can be any source in the cast', () => {
  const a = finishedShort({ name: '阿澜' })
  const b = finishedShort({ name: '沈砚' })
  const c = finishedShort({ name: '陆鸣' })
  const merged = createMergedStory([a, b, c], { lead: 2 })
  assert.equal(merged.config.merge.lead, 2, 'a deep lead is stored as its cast index')
  // The roster itself stays in pick order (the historical pair
  // behaviour); the lead only picks the viewpoint and the genre base.
  assert.deepEqual(merged.config.protagonists.map((person) => person.name), ['阿澜', '沈砚', '陆鸣'])
  assert.equal(merged.genreId, c.genreId, 'the fused line takes its genre base from the lead source')
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [merged] }), [], 'an indexed lead validates')
  // The two-source spellings are untouched.
  assert.equal(createMergedStory(a, b, { lead: 'b' }).config.merge.lead, 'b')
  assert.equal(createMergedStory([a, b], { lead: 1 }).config.merge.lead, 'b')
  assert.equal(createMergedStory([a, b, c], { lead: 9 }).config.merge.lead, 'a', 'an out-of-cast lead falls back to the first source')
})

test('protagonists are locked to their own source books (REQ-61)', () => {
  // The incident this pins: a fused book whose city-side lead came out
  // as the OTHER book's protagonist （沈砚 twice), while the city book's
  // own lead was 陆鸣. Every cast slot must carry its own source book's
  // protagonist — name, trait, ability and avatar — verbatim.
  const a = { ...finishedShort({ name: '沈砚', trait: '清冷克制', ability: '借火一瞬', avatarId: 'avatar-shen', genreId: 'cultivation' }), title: '从灵田杂役开始登天' }
  const b = { ...finishedShort({ name: '陆鸣', trait: '精于算计', ability: '雾行', avatarId: 'avatar-lu', genreId: 'city' }), title: '凌晨四点的长宁街' }
  const merged = createMergedStory(a, b)
  assert.deepEqual(merged.config.protagonists.map((person) => person.name), ['沈砚', '陆鸣'])
  assert.deepEqual(merged.config.protagonists.map((person) => person.trait), ['清冷克制', '精于算计'])
  assert.deepEqual(merged.config.protagonists.map((person) => person.ability), ['借火一瞬', '雾行'])
  assert.deepEqual(merged.config.protagonists.map((person) => person.avatarId), ['avatar-shen', 'avatar-lu'])
  // Moving the lead moves the viewpoint, never the roster.
  const flipped = createMergedStory(a, b, { lead: 'b' })
  assert.deepEqual(flipped.config.protagonists.map((person) => person.name), ['沈砚', '陆鸣'])
  // Swapping the pick order swaps the slots: a protagonist follows its
  // source book, not its seat.
  const swapped = createMergedStory(b, a)
  assert.deepEqual(swapped.config.protagonists.map((person) => person.name), ['陆鸣', '沈砚'])
  assert.deepEqual(swapped.config.protagonists.map((person) => person.ability), ['雾行', '借火一瞬'])
  // N sources: every slot still belongs to its own book.
  const c = { ...finishedShort({ name: '阿澜', trait: '听潮者', ability: '听潮', avatarId: 'avatar-lan' }), title: '雾港来信' }
  const trio = createMergedStory([a, b, c])
  assert.deepEqual(
    trio.config.protagonists.map((person) => [person.name, person.ability, person.avatarId]),
    [['沈砚', '借火一瞬', 'avatar-shen'], ['陆鸣', '雾行', 'avatar-lu'], ['阿澜', '听潮', 'avatar-lan']],
  )
  // Two leads who happen to share a name are still two people: their
  // own abilities and avatars keep them distinct.
  const twinB = { ...finishedShort({ name: '沈砚', trait: '精于算计', ability: '雾行', avatarId: 'avatar-lu', genreId: 'city' }), title: '凌晨四点的长宁街' }
  const twins = createMergedStory(a, twinB)
  assert.deepEqual(twins.config.protagonists.map((person) => person.name), ['沈砚', '沈砚'])
  assert.deepEqual(twins.config.protagonists.map((person) => person.avatarId), ['avatar-shen', 'avatar-lu'])
  assert.notEqual(twins.config.protagonists[0].ability, twins.config.protagonists[1].ability)
  // The publish snapshot keeps the same per-source roster.
  const liveA = { ...serializing({ name: '沈砚', ability: '借火一瞬', avatarId: 'avatar-shen', genreId: 'cultivation' }), title: '从灵田杂役开始登天' }
  const snapshot = plazaSnapshot(walkLocal({ ...createMergedStory(liveA, b), engine: 'gemini' }, 1))
  assert.deepEqual(snapshot.config.protagonists.map((person) => person.name), ['沈砚', '陆鸣'])
})

test('the fused world is a new world, not the lead source’s world (REQ-61)', () => {
  const god = {
    ...finishedShort({
      name: '沈砚', genreId: 'custom',
      customWorldName: '雾港', customWorldSetting: '潮汐会记住每个人的名字。',
      startPointName: '旧灯塔', startPointHook: '灯还亮着。',
    }),
    title: '雾港来信',
  }
  const other = finishedShort({ name: '陆鸣', genreId: 'city' })
  const merged = createMergedStory(god, other)
  assert.equal(merged.config.customWorldName, '', 'no single source names the fused world')
  assert.equal(merged.config.customWorldSetting, '', 'no single source’s setting text becomes the fused setting')
  // The spawn point is an opening LOCATION, not a world identity — it
  // keeps the pinned behaviour of following the lead side.
  assert.equal(merged.config.startPointName, '旧灯塔')
  // The bible stages a meeting of worlds at a new point, in parallel.
  assert.match(merged.worldBible.premise, /合流点相遇/)
  assert.ok(merged.worldBible.premise.includes('雾港'), 'both worlds are named as parties to the meeting')
})

// ---------------------------------------------------------------------------
// Snapshots: provenance in, private ids out
// ---------------------------------------------------------------------------

test('plaza snapshot carries the full sources list for a three-source line', () => {
  const own = serializing({ name: '阿澜', avatarId: 'avatar-a' })
  const entered = finishedShort({ name: '沈砚', genreId: 'cultivation', sourcePublicationId: 'pub-source-b' })
  const third = finishedShort({ name: '陆鸣', genreId: 'neon' })
  const merged = { ...createMergedStory([own, entered, third]), engine: 'gemini' }
  const snapshot = plazaSnapshot(walkLocal(merged, 2))
  assert.equal(snapshot.merged, true)
  assert.deepEqual(snapshot.sourceTitles, [own.title, entered.title, third.title])
  assert.deepEqual(snapshot.sources, [
    { title: own.title, publicationId: '' },
    { title: entered.title, publicationId: 'pub-source-b' },
    { title: third.title, publicationId: '' },
  ])
  assert.deepEqual(snapshot.config.protagonists.map((person) => person.name), ['阿澜', '沈砚', '陆鸣'])
  const serialized = JSON.stringify(snapshot)
  assert.ok(!serialized.includes(own.id), 'local story ids never ride the snapshot')
  assert.ok(!serialized.includes('"derivedFrom"'))
})

test('share snapshot anonymises the whole cast, not just a pair', () => {
  const merged = createMergedStory([
    finishedShort({ name: '阿澜' }),
    finishedShort({ name: '沈砚' }),
    finishedShort({ name: '陆鸣' }),
  ])
  const shared = publicSnapshot(merged)
  assert.equal(shared.title, '合流：3条匿名世界线')
  assert.deepEqual(shared.config.protagonists.map((person) => person.name), ['旅者甲', '旅者乙', '旅者丙'])
  assert.equal(shared.config.sourceGenres.length, 3)
  // The pair form keeps its historical wording.
  const pair = publicSnapshot(createMergedStory([finishedShort(), finishedShort()]))
  assert.equal(pair.title, '合流：两条匿名世界线')
  assert.deepEqual(pair.config.protagonists.map((person) => person.name), ['旅者甲', '旅者乙'])
})

// ---------------------------------------------------------------------------
// Generation context: N worlds, a bounded total budget
// ---------------------------------------------------------------------------

test('gemini context carries three source worlds with scaled per-source shares', async () => {
  const merged = {
    ...createMergedStory([
      serializing({ name: '阿澜' }),
      serializing({ name: '沈砚' }),
      serializing({ name: '陆鸣' }),
    ]),
    engine: 'gemini',
  }
  const fatSource = (tag) => ({
    genreId: 'mist',
    storyLengthMode: 'endless',
    worldBible: {
      premise: `${tag}_PREMISE`,
      rules: Array.from({ length: 8 }, (_, index) => `${tag}_RULE_${index}`),
      endingAnchor: `${tag}_ENDING`,
      outline: ['BEAT'],
    },
    summaries: Array.from({ length: 12 }, (_, index) => ({ chapter: index + 1, summary: `${tag}_HISTORY_${index}` })),
    openForeshadowing: Array.from({ length: 8 }, (_, index) => ({ chapter: 1, text: `${tag}_HOOK_${index}` })),
  })
  merged.mergeContext = [fatSource('ONE'), fatSource('TWO'), fatSource('THREE'), fatSource('BOGUS')]
  let context
  const generator = createGeminiGenerator({
    env: { GEMINI_API_KEY: 'test-key-never-used-on-network' },
    fetchImpl: async (_url, options) => {
      context = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text)
      return new Response(JSON.stringify({
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [{
              text: JSON.stringify({
                title: '合流点上的三个人',
                paragraphs: [
                  '阿澜、沈砚与陆鸣同时站在合流点的边缘，三种颜色的光从他们脚下升起，谁也没有先迈出第一步。',
                  '规则的光在头顶交叠成新的颜色，沈砚先听见了回声，陆鸣则按住了自己那一侧正在发烫的信号。',
                  '阿澜把选择权递给身边的两个人，而他们都没有立即回答——合流点的门已经开了一条缝。',
                ],
                summary: '阿澜、沈砚与陆鸣在合流点同时抵达，三套规则的光交叠，他们决定先共同见证第一次扰动再谈边界。',
                worldBible: {
                  premise: '三个世界在一处合流点相撞，三位主角必须共同定义边界，谁也不能替另外两个世界做决定。',
                  rules: ['规则可以互相翻译，但每次翻译都消耗稳定度。', '全体主角共同见证合流点的每一次扰动。', '合流后的新规则必须被全体主角共同见证。'],
                  endingAnchor: '这条融合线没有预设终点：每一弧结清一笔账，三位主角再一起决定下一弧往哪走。',
                  outline: Array.from({ length: 24 }, (_, index) => `第${index + 1}章推进合流点的秘密，同时保留三位主角的关系与伏笔。`),
                },
              }),
            }],
          },
        }],
      }), { status: 200 })
    },
  })
  await generator.generate({ story: merged, index: 0 })
  assert.equal(context.config.protagonists.length, 3, 'all three leads reach the prompt')
  assert.equal(context.sourceWorlds.length, 3, 'the cast size caps the source worlds — the fourth entry is not a source of this line')
  // Budget: three sources share the historical two-source envelope
  // (scale 2/3): 12 summaries → 8, 8 hooks → 5, 8 rules → 5 per source.
  for (const world of context.sourceWorlds) {
    assert.equal(world.summaries.length, 8)
    assert.equal(world.openForeshadowing.length, 5)
    assert.equal(world.worldBible.rules.length, 5)
  }
  assert.ok(!JSON.stringify(context).includes('BOGUS'))
})

// ---------------------------------------------------------------------------
// Client detail helpers: the sources list and its fallbacks
// ---------------------------------------------------------------------------

test('detailSourcesFor: resolved states pass through, legacy details rebuild by title', () => {
  assert.deepEqual(detailSourcesFor(null), [])
  assert.deepEqual(detailSourcesFor({ merged: false, sourceTitles: ['甲书'] }), [], 'ordinary books have no sources section')
  const resolved = detailSourcesFor({
    merged: true,
    sources: [
      { publicationId: 'pub-live', title: '活着的书', authorName: '甲', authorHandle: 'jia', genreId: 'mist', coverUrl: '/cover.webp', state: 'live' },
      { publicationId: 'pub-gone', title: '下架的书', authorName: '乙', authorHandle: '', genreId: 'neon', coverUrl: null, state: 'gone' },
      { publicationId: '', title: '自己的线', authorName: '我', authorHandle: 'me', genreId: 'city', coverUrl: null, state: 'own' },
    ],
  })
  assert.deepEqual(resolved.map((entry) => entry.state), ['live', 'gone', 'own'])
  assert.equal(resolved[0].coverUrl, '/cover.webp')
  // A pre-REQ-53 detail (no sources anywhere): titles + per-source
  // genres from the snapshot rebuild display-only rows.
  const legacy = detailSourcesFor({
    merged: true,
    sourceTitles: ['旧书甲', '旧书乙'],
    snapshot: { config: { sourceGenres: ['mist', 'court'] } },
  })
  assert.deepEqual(legacy, [
    { publicationId: '', title: '旧书甲', authorName: '', authorHandle: '', genreId: 'mist', coverUrl: null, state: 'listed' },
    { publicationId: '', title: '旧书乙', authorName: '', authorHandle: '', genreId: 'court', coverUrl: null, state: 'listed' },
  ])
  // Plain stored entries without a resolved state: an id means the
  // shelf link, no id means a display-only row.
  const plain = detailSourcesFor({
    merged: true,
    sources: [
      { publicationId: 'pub-x', title: '有链接' },
      { publicationId: '', title: '没链接' },
    ],
  })
  assert.deepEqual(plain.map((entry) => entry.state), ['live', 'listed'])
})

test('the reader story for a fused book carries its sources', () => {
  const detail = {
    id: 'pub-fused',
    title: '合流：甲 × 乙 × 丙',
    genreId: 'mist',
    merged: true,
    sourceTitles: ['甲书', '乙书', '丙书'],
    sources: [
      { publicationId: 'pub-a', title: '甲书', authorName: '甲', authorHandle: '', genreId: 'mist', coverUrl: null, state: 'live' },
      { publicationId: '', title: '乙书', authorName: '我', authorHandle: '', genreId: 'neon', coverUrl: null, state: 'own' },
      { publicationId: 'pub-c', title: '丙书', authorName: '丙', authorHandle: '', genreId: 'city', coverUrl: null, state: 'gone' },
    ],
    authorName: '我',
    publishedAt: '2026-10-30T00:00:00.000Z',
    snapshot: {
      config: { genreId: 'mist', sourceGenres: ['mist', 'neon', 'city'] },
      worldBible: { premise: '', rules: [], endingAnchor: '', outline: [] },
      chapters: [{ index: 0, title: '第一章', paragraphs: ['……'] }],
      choices: {},
    },
  }
  const story = plazaReaderStory(detail)
  assert.equal(story.kind, 'merged')
  assert.deepEqual(story.sources.map((entry) => entry.state), ['live', 'own', 'gone'])
  assert.deepEqual(story.sourceTitles, ['甲书', '乙书', '丙书'])
})

// ---------------------------------------------------------------------------
// Server: mixed-author consent gate + stored/resolved sources
// ---------------------------------------------------------------------------

const ORIGIN = { Origin: 'http://localhost:5173' }
const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

function tinyPng() {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 200
    png.data[index + 1] = 120
    png.data[index + 2] = 60
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

const completedSeason = (avatarId) => ({
  ...walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    avatarId,
    ability: '借火一瞬',
  }), 24),
  engine: 'gemini',
})

const endlessLine = (avatarId, extra = {}) => walkLocal(createStory({
  genreId: 'mist',
  storyLengthMode: 'endless',
  name: '陆鸣',
  avatarId,
  ability: '雾行',
  ...extra,
}), 2)

async function startServer(t) {
  const identityStore = createMemoryIdentityStore()
  const mailer = {
    configured: true,
    sendCode: async () => { throw new Error('login codes are not part of this fixture') },
    sendRecoveryCode: async () => {},
  }
  const usernameAuth = createUsernameAuthService({
    env: { AUTH_ENABLED: 'true' },
    store: identityStore,
    mailer,
    log: () => {},
  })
  const auth = createAuthService({ env: { AUTH_ENABLED: 'true' }, usernameAuth })
  const socialStore = createMemorySocialStore()
  const plazaStore = createMemoryPlazaStore()
  const avatarStore = createMemoryAvatarStore()
  const coverStore = createMemoryCoverStore()
  const social = createSocialService({
    env: {},
    store: socialStore,
    plazaStore,
    avatarStore,
    coverStore,
    identityStore,
    now: () => Date.now(),
  })
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore, socialStore })
  const fusion = createFusionService({ env: {}, socialStore, plazaStore })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    auth,
    social,
    plaza,
    avatar: avatarService,
    fusion,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, plazaStore }
}

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'fusion-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

async function makeAvatar(base, token, name = '沈砚') {
  const response = await fetch(`${base}/api/avatar`, {
    method: 'PUT',
    headers: authed(token),
    body: JSON.stringify({
      profile: {
        name,
        description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(response.status, 200, 'avatar save')
  return (await response.json()).avatar
}

const post = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: token ? authed(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})
const put = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'PUT',
  headers: authed(token),
  body: JSON.stringify(body ?? {}),
})

async function publishBook(base, account) {
  const avatar = await makeAvatar(base, account.token)
  const response = await post(base, '/api/plaza/publish', account.token, { story: completedSeason(avatar.id) })
  assert.equal(response.status, 200, 'author publish')
  const { publication } = await response.json()
  return { avatar, publication }
}

const setPermission = async (base, token, fusionPermission) => {
  const response = await put(base, '/api/me/profile', token, { fusionPermission })
  assert.equal(response.status, 200, 'set fusion permission')
}

const detailOf = async (base, id) => {
  const response = await fetch(`${base}/api/plaza/${id}`)
  assert.equal(response.status, 200, 'detail fetch')
  return (await response.json()).publication
}

test('N-source publish gate: mixed free/ask authors, then sources resolve live/gone/own', async (t) => {
  const { base, plazaStore } = await startServer(t)
  const authorAsk = await register(base, 'multi_ask_author')
  const authorFree = await register(base, 'multi_free_author')
  const reader = await register(base, 'multi_reader')
  const { publication: askBook } = await publishBook(base, authorAsk)
  const { publication: freeBook } = await publishBook(base, authorFree)
  const readerAvatar = await makeAvatar(base, reader.token, '陆鸣')
  await setPermission(base, authorAsk.token, 'ask')

  // The reader's cast: their own endless line + an entered line from
  // the ask author + an entered line from the free author.
  const own = endlessLine(readerAvatar.id)
  const enteredAsk = endlessLine(readerAvatar.id, { sourcePublicationId: askBook.id })
  const enteredFree = endlessLine(readerAvatar.id, { sourcePublicationId: freeBook.id })
  const merged = createMergedStory([own, enteredAsk, enteredFree], { rules: 'bridge', lead: 0, bond: 'allies' })
  const walked = { ...walkLocal(merged, 1), engine: 'gemini' }
  assert.deepEqual(walked.sourcePublicationIds, ['', askBook.id, freeBook.id])

  const blocked = await post(base, '/api/plaza/publish', reader.token, { story: walked })
  assert.equal(blocked.status, 403, 'one unconsented source is enough to hold the whole fusion')
  assert.match((await blocked.json()).error, /合流授权/)

  const applied = await post(base, '/api/fusion/requests', reader.token, { publicationId: askBook.id })
  const { request } = await applied.json()
  await post(base, '/api/fusion/requests/decide', authorAsk.token, { requestId: request.id, approve: true })

  const allowed = await post(base, '/api/plaza/publish', reader.token, { story: walked })
  assert.equal(allowed.status, 200, 'with the ask author granted, the three-source fusion shelves')
  const { publication: fusedBook } = await allowed.json()
  assert.equal(fusedBook.merged, true)
  assert.equal(fusedBook.sourceTitles.length, 3)

  // The stored record carries the enriched provenance list.
  const record = await plazaStore.getPublication(fusedBook.id)
  assert.equal(record.sources.length, 3)
  assert.equal(record.sources[0].publicationId, '')
  assert.equal(record.sources[0].title, own.title)
  assert.equal(record.sources[1].publicationId, askBook.id)
  assert.equal(record.sources[1].title, askBook.title, 'an entered source is stored under its published title')
  assert.ok(record.sources[1].authorName, 'the source author is stored at shelving time')
  assert.equal(record.sources[2].publicationId, freeBook.id)

  // The detail resolves every entry against the live catalogue.
  let detail = await detailOf(base, fusedBook.id)
  assert.deepEqual(detail.sources.map((entry) => entry.state), ['own', 'live', 'live'])
  assert.equal(detail.sources[0].authorName, detail.authorName, 'an own line is bylined with the publisher')
  assert.equal(detail.sources[1].title, askBook.title)

  // The free author takes their book down: the entry flips to 已下架
  // with the stored title kept, and the others are untouched.
  const withdrawn = await post(base, `/api/plaza/${freeBook.id}/withdraw`, authorFree.token, {})
  assert.equal(withdrawn.status, 200, 'withdraw the free source')
  detail = await detailOf(base, fusedBook.id)
  assert.deepEqual(detail.sources.map((entry) => entry.state), ['own', 'live', 'gone'])
  assert.equal(detail.sources[2].title, freeBook.title)

  // A record shelved before sources existed falls back to sourceTitles:
  // strip the stored list and the detail still lists both other books
  // by title instead of going blank.
  const stripped = { ...record }
  delete stripped.sources
  await plazaStore.putPublication(stripped)
  detail = await detailOf(base, fusedBook.id)
  assert.equal(detail.sources.length, 3)
  assert.ok(detail.sources.every((entry) => entry.state === 'listed'))
  assert.deepEqual(detail.sources.map((entry) => entry.title), record.sourceTitles)
})

test('N-source publish gate: a forbidden author blocks a fusion at any cast size', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'multi_no_author')
  const reader = await register(base, 'multi_no_reader')
  const { publication } = await publishBook(base, author)
  const readerAvatar = await makeAvatar(base, reader.token, '陆鸣')
  await setPermission(base, author.token, 'forbidden')

  const merged = createMergedStory([
    endlessLine(readerAvatar.id),
    endlessLine(readerAvatar.id),
    endlessLine(readerAvatar.id, { sourcePublicationId: publication.id }),
  ])
  const walked = { ...walkLocal(merged, 1), engine: 'gemini' }
  const response = await post(base, '/api/plaza/publish', reader.token, { story: walked })
  assert.equal(response.status, 403, 'forbidden is forbidden, third source or not')
})
