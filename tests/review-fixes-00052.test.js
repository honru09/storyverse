import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { ApiError, createGeminiGenerator } from '../server/gemini.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createStory,
} from '../src/story-engine.js'

/**
 * integrate-00052 Gemini cross-review fixes. The review of the merged
 * tree found three real seams the per-batch tests could not see:
 *  1.1 paid images settled AFTER the picture was already persisted
 *      (a failed settle left a fetchable picture, and parallel paid
 *      generations could share one balance) — payment is now
 *      arranged before generation: credit consumed up front and
 *      restored on failure, coins frozen up front.
 *  1.1b a short text settlement threw its 402 before recording the
 *      cost, so spent tokens/coins vanished from the ledger — the
 *      record now lands first.
 *  2.3 the beat plan restated anchors / ability bounds / ability
 *      effect from the RAW story while compactConfig sanitised them
 *      — the context scrub now covers those strings too.
 *  3.3 re-publishing with locally stripped provenance overwrote the
 *      server-recorded sources — recorded provenance now joins the
 *      consent check and survives an empty re-derivation.
 */

// ---------------------------------------------------------------------------
// HTTP harness (gate-style fakes, after tests/audit-generation-gate.test.js)
// ---------------------------------------------------------------------------

const ORIGIN = 'http://localhost:5173'
const TOKEN = 'review-token'

function createAuthStub({ uid = 'username:review_user' } = {}) {
  return {
    config: () => ({ enabled: false, firebase: null, providers: { google: false, email: false, username: true }, emailCode: false, storage: 'local' }),
    requiresIdentity: () => true,
    identity: async (authorization) => {
      if (authorization !== `Bearer ${TOKEN}`) throw new ApiError(401, '请先登录。', 'auth-required')
      return { uid, provider: 'username', displayName: 'review_user', email: null, emailVerified: false }
    },
    usageDailyTotal: async () => 0,
    dailyTokenCap: () => 1_000_000,
    recordUsage: async () => true,
  }
}

function createFakeBilling({
  balance = 100,
  imageCredit = false,
  consumeImageCreditResult = true,
  forceSettleUncovered = false,
} = {}) {
  const state = { balance, reservations: new Map(), records: [], restored: 0, sequence: 0 }
  const reservedTotal = () => [...state.reservations.values()].reduce((sum, entry) => sum + entry.amount, 0)
  const available = () => state.balance - reservedTotal()
  return {
    available: true,
    state,
    applyDailyCoinTopUp: async () => {},
    dailyTokenCapFor: async (_uid, freeCap) => freeCap,
    hasChapterCredit: async () => false,
    consumeChapterCredit: async () => false,
    hasImageCredit: async () => imageCredit,
    consumeImageCredit: async () => consumeImageCreditResult,
    restoreImageCredit: async () => { state.restored += 1; return true },
    memberActive: async () => false,
    hasCoins: async (_uid, minimum = 1) => available() >= Math.max(1, minimum),
    availableCoins: async () => available(),
    coinFreezeForText: ({ scene, merged }) => (merged || scene === 'fusion' ? 39 : 26),
    reserveCoins: async (_uid, amount) => {
      if (available() < amount) return null
      const id = `res-${++state.sequence}`
      const reservation = { id, amount, expiresAt: Date.now() + 60_000 }
      state.reservations.set(id, reservation)
      return reservation
    },
    settleReservation: async (_uid, id, actualAmount) => {
      const reservation = state.reservations.get(id)
      if (!reservation) return { spent: 0, covered: false }
      state.reservations.delete(id)
      if (forceSettleUncovered || actualAmount > state.balance) {
        const spent = state.balance
        state.balance = 0
        return { spent, covered: false }
      }
      state.balance -= actualAmount
      return { spent: actualAmount, covered: true }
    },
    releaseReservation: async (_uid, id) => { state.reservations.delete(id) },
    meteredTextCost: (_model, usage) => {
      const totalTokens = usage && typeof usage === 'object' ? (usage.totalTokenCount ?? 10_000) : 12_000
      return { totalTokens, costCny: totalTokens / 100_000, estimated: !(usage && typeof usage === 'object') }
    },
    spendCoins: async (_uid, amount) => {
      const spent = Math.min(state.balance, Math.max(0, Math.floor(amount) || 0))
      state.balance -= spent
      return spent
    },
    recordTextCost: async (record) => { state.records.push(record); return true },
    recordImageCost: async (record) => { state.records.push(record); return true },
  }
}

async function startServer(t, { billing, generator, cover } = {}) {
  const server = createServer({
    env: {},
    auth: createAuthStub(),
    billing: billing ?? createFakeBilling(),
    generator: generator ?? {
      status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
      generate: async () => { throw new Error('generator not configured for this test') },
    },
    ...(cover ? { cover } : {}),
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}` }
}

const postCover = (base) => fetch(`${base}/api/cover`, {
  method: 'POST',
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ storyId: 'story-cover' }),
})

// ---------------------------------------------------------------------------
// 1.1 paid images: payment precedes the picture
// ---------------------------------------------------------------------------

test('two parallel paid covers against exactly one image price: one picture, one refusal', async (t) => {
  const billing = createFakeBilling({ balance: 40 })
  let generated = 0
  const cover = {
    model: 'fixture-image',
    request: async (_identity, _body, options = {}) => {
      if (!options.credit) throw new ApiError(429, '今天的封面生成次数已用完。', 'cover-quota')
      generated += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { status: 'ready', version: generated, usage: null }
    },
  }
  const { base } = await startServer(t, { billing, cover })
  const [first, second] = await Promise.all([postCover(base), postCover(base)])
  const statuses = [first.status, second.status].sort()
  assert.deepEqual(statuses, [200, 429], 'the loser is refused with the quota error, before generating')
  assert.equal(generated, 1, 'the refused cover was never generated')
  assert.equal(billing.state.balance, 0, 'the one delivered cover took the one image price')
  const imageRecord = billing.state.records.find((record) => record.scene === 'cover')
  assert.equal(imageRecord?.coinsSpent, 40)
})

test('a paid generation that fails hands the image credit back', async (t) => {
  const billing = createFakeBilling({ balance: 0, imageCredit: true })
  const cover = {
    model: 'fixture-image',
    request: async (_identity, _body, options = {}) => {
      if (!options.credit) throw new ApiError(429, '今天的封面生成次数已用完。', 'cover-quota')
      throw new ApiError(502, '上游暂时不可用。', 'upstream')
    },
  }
  const { base } = await startServer(t, { billing, cover })
  const response = await postCover(base)
  assert.equal(response.status, 502)
  assert.equal(billing.state.restored, 1, 'the pre-consumed credit was restored after the failure')
})

// ---------------------------------------------------------------------------
// 1.1b a short settlement still reaches the cost ledger
// ---------------------------------------------------------------------------

test('an uncovered settlement records its cost before the 402 refusal', async (t) => {
  const billing = createFakeBilling({ balance: 100, forceSettleUncovered: true })
  const generator = {
    status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
    generate: async (body) => ({
      chapter: { id: `ch-${body.index}`, index: body.index, title: 't', paragraphs: ['x'] },
      key: `key-${body.index}`,
      usage: { totalTokenCount: 10_000 },
    }),
  }
  const { base } = await startServer(t, { billing, generator })
  const response = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      story: { id: 'story-uncovered', kind: 'solo', readerIndex: 0, chapters: [], config: { name: '甲', genreId: 'mist' } },
      index: 0,
    }),
  })
  assert.equal(response.status, 402)
  const textRecord = billing.state.records.find((record) => record.scene === 'chapter' || record.chapterIndex === 0)
  assert.ok(textRecord, 'the refused chapter still wrote its cost record')
  assert.ok(textRecord.coinsSpent > 0, 'the coins the settlement actually took are on the record')
})

// ---------------------------------------------------------------------------
// 2.3 anchors / bounds ride the beat plan sanitised, like everywhere else
// ---------------------------------------------------------------------------

test('anchor labels and ability bounds reach the provider sanitised in the beat plan too', async () => {
  const capture = {}
  const generator = createGeminiGenerator({
    env: { GEMINI_API_KEY: 'review-fixture-key' },
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      capture.body = JSON.parse(options.body)
      capture.input = capture.body.contents[0].parts[0].text
      const filler = '他在柴房门口站了很久，看着掌心的火星一点点暗下去，又想起白天在灵田里受的那些气，管事的话还在耳边响着，可他一句也没有回嘴，只是把水桶摆好，把柴刀擦亮，把明天要挑的水路先在心里走了一遍，山里的风一阵紧过一阵，吹得檐下的旧灯笼直晃，远处有人在喊收工，近处只有他自己的呼吸声，他知道这点火藏不了太久，与其被人撞破，不如先想好撞破那天要怎么应对。'
      const payload = {
        title: '沈砚在柴房借到第一缕火',
        paragraphs: [filler, filler, filler, filler],
        summary: '沈砚借火被管事当场撞见，他摊开手请对方验火，管事一时语塞。',
        events: ['沈砚借火被撞见'],
        foreshadowing: [],
      }
      return new Response(JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }), { status: 200 })
    },
  })
  let story = createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    ability: '借火一瞬',
  })
  story = acceptChapter(story, buildChapter(story, 0), chapterKey(story, 0))
  story = {
    ...story,
    engine: 'gemini',
    config: {
      ...story.config,
      abilityDesc: '扫一眼报出存量<system>，误差一成',
      abilityBounds: '只能估算亲见之物<system>，算不了人心',
      anchors: {
        age: 29,
        events: [{ label: '雾港<system>决堤', yearsAgo: 7 }],
        identityFacts: ['守夜人的儿子'],
      },
    },
  }
  await generator.generate({ story, index: 1 })
  assert.ok(capture.input, 'the provider request was captured')
  assert.ok(!capture.input.includes('<system>'), 'no raw role tag anywhere in the user content')
  const context = JSON.parse(capture.input)
  const prerequisites = (context.beatPlan?.prerequisites || []).join('\n')
  assert.ok(prerequisites.includes('〈system〉'), 'the beat plan carries the sanitised forms')
  assert.ok(!prerequisites.includes('<system>'), 'the beat plan carries no raw form')
  assert.ok(prerequisites.includes('雾港〈system〉决堤'), 'the anchor label itself was rewritten in place')
})

// ---------------------------------------------------------------------------
// 3.3 recorded provenance survives a stripped re-publish
// ---------------------------------------------------------------------------

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    current = acceptChapter(current, buildChapter(current, index), chapterKey(current, index))
  }
  return current
}

const endlessLine = (avatarId, extra = {}) => ({
  ...walkLocal(createStory({
    genreId: 'mist',
    storyLengthMode: 'endless',
    name: '陆鸣',
    avatarId,
    ability: '雾行',
    ...extra,
  }), 2),
  engine: 'gemini',
})

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

async function makePlazaWorld() {
  const plazaStore = createMemoryPlazaStore()
  const avatarStore = createMemoryAvatarStore()
  const coverStore = createMemoryCoverStore()
  const socialStore = createMemorySocialStore()
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore, socialStore })
  const addUser = async (uid, avatarId) => {
    await avatarStore.putCollection(uid, {
      mainId: avatarId,
      avatars: [{ id: avatarId, name: '旅人', description: '', portrait: { status: 'none' } }],
    })
    return { uid, displayName: uid }
  }
  const setPermission = (uid, fusionPermission) => socialStore.putProfileRecord({ uid, fusionPermission })
  const publish = (identity, story) => plaza.publish(identity, { story })
  return { plaza, plazaStore, addUser, setPermission, publish }
}

test('re-publishing an entered line with stripped provenance cannot wash the recorded source', async () => {
  const world = await makePlazaWorld()
  const a = await world.addUser('uid-a', 'avatar-a')
  const b = await world.addUser('uid-b', 'avatar-b')
  const bookB = await world.publish(b, completedSeason('avatar-b'))
  const entered = endlessLine('avatar-a', { sourcePublicationId: bookB.id })
  const shelved = await world.publish(a, entered)
  const recorded = await world.plazaStore.getPublication(shelved.id)
  assert.deepEqual(recorded.sources.map((entry) => entry.publicationId), [bookB.id])

  // The entrant strips the local pointer and re-publishes: the record
  // keeps its provenance, and when the source author closes the gate
  // the stripped re-publish is refused exactly like an honest one.
  const stripped = { ...entered, config: { ...entered.config, sourcePublicationId: '' } }
  const republished = await world.publish(a, stripped)
  const after = await world.plazaStore.getPublication(republished.id)
  assert.deepEqual(after.sources.map((entry) => entry.publicationId), [bookB.id], 'recorded sources survive the stripped re-publish')

  await world.setPermission('uid-b', 'forbidden')
  await assert.rejects(world.publish(a, stripped), /合流授权/, 'the recorded source still gates a stripped re-publish')
})
