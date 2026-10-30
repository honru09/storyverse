import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { ApiError } from '../server/gemini.js'

/**
 * REQ-69 cluster C reproduction / pinning tests for the generation gate.
 *
 * The billing double below implements the contract the billing batch
 * settled on (availableCoins / reserveCoins / settleReservation /
 * releaseReservation / coinFreezeForText / meteredTextCost, with
 * hasCoins judged on the AVAILABLE balance). It also keeps the legacy
 * spendCoins surface so the pre-fix code path can run against it and
 * demonstrate the hole: gate checked >= 1 coin, settlement clamped.
 */

const ORIGIN = 'http://localhost:5173'
const TOKEN = 'gate-token'

function createAuthStub({ uid = 'username:gate_user', dailyTotal = 0, cap = 1_000_000 } = {}) {
  const usageRecords = []
  return {
    usageRecords,
    config: () => ({ enabled: false, firebase: null, providers: { google: false, email: false, username: true }, emailCode: false, storage: 'local' }),
    requiresIdentity: () => true,
    identity: async (authorization) => {
      if (authorization !== `Bearer ${TOKEN}`) throw new ApiError(401, '请先登录。', 'auth-required')
      return { uid, provider: 'username', displayName: 'gate_user', email: null, emailVerified: false }
    },
    usageDailyTotal: async () => dailyTotal,
    dailyTokenCap: () => cap,
    recordUsage: async (recordUid, usage) => { usageRecords.push({ uid: recordUid, usage }); return true },
  }
}

function createFakeBilling({
  balance = 100,
  member = false,
  chapterCredit = false,
  consumeChapterCreditResult = true,
  imageCredit = false,
  consumeImageCreditResult = true,
  forceSettleUncovered = false,
} = {}) {
  const state = {
    balance,
    reservations: new Map(),
    records: [],
    freezes: [],
    settled: [],
    released: [],
    sequence: 0,
  }
  const reservedTotal = () => [...state.reservations.values()].reduce((sum, entry) => sum + entry.amount, 0)
  const available = () => state.balance - reservedTotal()
  return {
    available: true,
    state,
    applyDailyCoinTopUp: async () => {},
    dailyTokenCapFor: async (_uid, freeCap) => freeCap,
    hasChapterCredit: async () => chapterCredit,
    consumeChapterCredit: async () => consumeChapterCreditResult,
    hasImageCredit: async () => imageCredit,
    consumeImageCredit: async () => consumeImageCreditResult,
    memberActive: async () => member,
    hasCoins: async (_uid, minimum = 1) => available() >= Math.max(1, minimum),
    availableCoins: async () => available(),
    coinFreezeForText: ({ scene, merged }) => {
      const amount = merged || scene === 'fusion' ? 30 : 20
      state.freezes.push({ scene, merged, amount })
      return amount
    },
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
        state.settled.push({ id, actualAmount, spent, covered: false })
        return { spent, covered: false }
      }
      state.balance -= actualAmount
      state.settled.push({ id, actualAmount, spent: actualAmount, covered: true })
      return { spent: actualAmount, covered: true }
    },
    releaseReservation: async (_uid, id) => {
      if (state.reservations.delete(id)) state.released.push(id)
    },
    meteredTextCost: (_model, usage) => {
      if (!usage || usage === 'unknown' || typeof usage !== 'object') {
        return { totalTokens: 12_000, costCny: 0.12, estimated: true }
      }
      const totalTokens = usage.totalTokenCount ?? usage.total ?? 0
      return { totalTokens, costCny: totalTokens / 100_000, estimated: false }
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

function createFakeDeliveryStore() {
  const map = new Map()
  return {
    kind: 'memory',
    map,
    async getDelivery(key) { return map.get(key) ?? null },
    async putDelivery(key, record) { map.set(key, record) },
  }
}

async function startServer(t, { auth, billing, generator, library, deliveryStore, env = {}, cover, avatar } = {}) {
  const server = createServer({
    env,
    auth: auth ?? createAuthStub(),
    billing: billing ?? createFakeBilling(),
    generator: generator ?? {
      status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
      generate: async () => { throw new Error('generator not configured for this test') },
    },
    ...(library ? { library } : {}),
    ...(deliveryStore ? { deliveryStore } : {}),
    ...(cover ? { cover } : {}),
    ...(avatar ? { avatar } : {}),
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

const generate = (base, body, token = TOKEN) => fetch(`${base}/api/generate`, {
  method: 'POST',
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})

const storyBody = (id, index, extra = {}) => ({
  story: { id, kind: 'solo', readerIndex: 0, chapters: [], config: { name: '甲', genreId: 'mist' } },
  index,
  ...extra,
})

function countingGenerator(calls, usage = { totalTokenCount: 10_000 }) {
  return {
    status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
    generate: async (body) => {
      calls.push(body)
      return {
        chapter: { id: `ch-${body.story?.id}-${body.index}`, index: body.index, title: 't', paragraphs: ['x'] },
        key: `key-${body.story?.id}-${body.index}`,
        ...(usage === null ? {} : { usage }),
      }
    },
  }
}

async function captureStderr(run) {
  const chunks = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { chunks.push(String(chunk)); return true }
  try {
    return { result: await run(), output: chunks.join('') }
  } finally {
    process.stderr.write = original
  }
}

test('gate: a 1-coin balance is stopped at the freeze, the generator never runs', async (t) => {
  const calls = []
  const billing = createFakeBilling({ balance: 1 })
  const { base } = await startServer(t, { billing, generator: countingGenerator(calls) })
  const response = await generate(base, storyBody('story-poor', 0))
  assert.equal(response.status, 429)
  assert.equal((await response.json()).code, 'coins-exhausted')
  assert.equal(calls.length, 0, 'the provider must not be called when the freeze cannot be held')
  assert.equal(billing.state.balance, 1)
})

test('gate: two concurrent generations freeze independently and settle the sum of both chapters', async (t) => {
  const calls = []
  const billing = createFakeBilling({ balance: 200 })
  const generator = {
    status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
    generate: async (body) => {
      calls.push(body)
      await new Promise((resolve) => setTimeout(resolve, 25))
      return {
        chapter: { id: `ch-${body.index}`, index: body.index, title: 't', paragraphs: ['x'] },
        key: `key-${body.index}`,
        usage: { totalTokenCount: 10_000 },
      }
    },
  }
  const { base } = await startServer(t, { billing, generator })
  const [first, second] = await Promise.all([
    generate(base, storyBody('story-par-a', 0)),
    generate(base, storyBody('story-par-b', 0)),
  ])
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  await Promise.all([first.json(), second.json()])
  assert.equal(calls.length, 2)
  assert.equal(billing.state.freezes.length, 2, 'each generation held its own freeze')
  assert.equal(billing.state.reservations.size, 0, 'both freezes settled or released')
  assert.equal(billing.state.balance, 200 - 2 * 10, 'total charged = the sum of both actual chapters (10 coins each)')
})

test('gate: a settlement that does not cover the chapter delivers nothing', async (t) => {
  const calls = []
  const billing = createFakeBilling({ balance: 25 })
  const { base } = await startServer(t, {
    billing,
    generator: countingGenerator(calls, { totalTokenCount: 100_000 }),
  })
  const response = await generate(base, storyBody('story-uncovered', 0))
  assert.ok(response.status === 402 || response.status === 429, `expected a payment error, got ${response.status}`)
  const payload = await response.json()
  assert.equal(payload.code, 'coins-exhausted')
  assert.equal(payload.chapter, undefined, 'an uncovered chapter is never delivered')
  assert.equal(calls.length, 1, 'the generation ran; only delivery is withheld')
})

test('gate: a failed chapter-credit consume falls back to coins instead of riding free', async (t) => {
  const calls = []
  const billing = createFakeBilling({ balance: 100, chapterCredit: true, consumeChapterCreditResult: false })
  const auth = createAuthStub({ dailyTotal: 2_000_000, cap: 1_000_000 })
  const { base } = await startServer(t, { auth, billing, generator: countingGenerator(calls) })
  const response = await generate(base, storyBody('story-credit-fallback', 0))
  assert.equal(response.status, 200)
  await response.json()
  assert.equal(billing.state.balance, 90, 'the chapter settled 10 coins after the credit consume failed')
  assert.equal(billing.state.records.at(-1)?.coinsSpent, 10)
  assert.equal(billing.state.records.at(-1)?.creditUsed, false)
})

test('gate: a failed image-credit consume with no coins delivers no cover', async (t) => {
  const billing = createFakeBilling({ balance: 0, imageCredit: true, consumeImageCreditResult: false })
  const cover = {
    model: 'fixture-image',
    request: async (_identity, _body, options = {}) => {
      if (!options.credit) throw new ApiError(429, '今天的封面生成次数已用完。', 'cover-quota')
      return { status: 'ready', version: 2, usage: null }
    },
  }
  const { base } = await startServer(t, { billing, cover })
  const response = await fetch(`${base}/api/cover`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ storyId: 'story-cover' }),
  })
  assert.ok(response.status === 402 || response.status === 429, `expected a payment error, got ${response.status}`)
  assert.equal((await response.json()).code, 'coins-exhausted')
})

test('fail-closed: identity-required mode with a configured store but no billing refuses generation with an ALERT', async (t) => {
  const calls = []
  const billing = { available: false }
  const { base } = await startServer(t, {
    billing,
    generator: countingGenerator(calls),
    env: { DATA_STORE: 'memory' },
  })
  const { result: response, output } = await captureStderr(() => generate(base, storyBody('story-drift', 0)))
  assert.equal(response.status, 503)
  await response.text()
  assert.match(output, /ALERT/)
  assert.equal(calls.length, 0)
})

test('fail-closed: a failed daily-usage read (null) refuses generation with an ALERT', async (t) => {
  const calls = []
  const billing = createFakeBilling({ balance: 100 })
  const auth = createAuthStub()
  auth.usageDailyTotal = async () => null
  const { base } = await startServer(t, { auth, billing, generator: countingGenerator(calls) })
  const { result: response, output } = await captureStderr(() => generate(base, storyBody('story-usage-null', 0)))
  assert.equal(response.status, 503)
  await response.text()
  assert.match(output, /ALERT/)
  assert.equal(calls.length, 0)
})

test('delivery idempotency: the same request replays from the registry — one generation, one charge, across a restart', async (t) => {
  const billing = createFakeBilling({ balance: 100 })
  const deliveryStore = createFakeDeliveryStore()
  const auth = createAuthStub()
  const body = storyBody('story-delivery', 0)

  const callsA = []
  const first = await startServer(t, { auth, billing, deliveryStore, generator: countingGenerator(callsA) })
  const initial = await generate(first.base, body)
  assert.equal(initial.status, 200)
  assert.equal((await initial.json()).chapter.id, 'ch-story-delivery-0')
  assert.equal(callsA.length, 1)
  assert.equal(billing.state.balance, 90)

  // Same intent, changed setup: a different key, a fresh generation.
  const changed = await generate(first.base, {
    ...body,
    story: { ...body.story, config: { ...body.story.config, name: '乙' } },
  })
  assert.equal(changed.status, 200)
  await changed.json()
  assert.equal(callsA.length, 2, 'changed content is a new delivery key')
  assert.equal(billing.state.balance, 80)

  // "Restart": a brand-new server instance sharing only the registry.
  const callsB = []
  const second = await startServer(t, { auth, billing, deliveryStore, generator: countingGenerator(callsB) })
  const replay = await generate(second.base, body)
  assert.equal(replay.status, 200)
  const replayed = await replay.json()
  assert.equal(replayed.chapter.id, 'ch-story-delivery-0')
  assert.equal(replayed.cached, true, 'the replay is marked as a registry hit')
  assert.equal(callsB.length, 0, 'the provider is not called for a registered delivery')
  assert.equal(billing.state.balance, 80, 'a replay never charges twice')
})

test('merged derivation: the stored line decides the fusion rate, not the request body', async (t) => {
  const library = {
    list: async () => ({
      stories: [
        { id: 'story-merged', kind: 'merged' },
        { id: 'story-solo', kind: 'solo' },
      ],
    }),
  }
  const billing = createFakeBilling({ balance: 500 })
  const calls = []
  const { base } = await startServer(t, { billing, library, generator: countingGenerator(calls) })

  // Stored merged, body claims solo: the fusion rate (10 tokens-thousands × 1.5 = 15) applies.
  const mergedBody = storyBody('story-merged', 0)
  const mergedResponse = await generate(base, mergedBody)
  assert.equal(mergedResponse.status, 200)
  await mergedResponse.json()
  assert.equal(billing.state.balance, 500 - 15, 'a stored merged line settles at the fusion rate even when the body says solo')
  assert.equal(billing.state.records.at(-1)?.scene, 'fusion')
  assert.equal(billing.state.records.at(-1)?.mergedBasis, 'stored')

  // Stored solo, body claims merged: the stored truth wins the other way too.
  const soloBody = { ...storyBody('story-solo', 0), story: { ...storyBody('story-solo', 0).story, kind: 'merged' } }
  const soloResponse = await generate(base, soloBody)
  assert.equal(soloResponse.status, 200)
  await soloResponse.json()
  assert.equal(billing.state.balance, 500 - 15 - 10, 'a stored solo line settles solo even when the body claims merged')
  assert.equal(billing.state.records.at(-1)?.scene, 'chapter')
  assert.equal(billing.state.records.at(-1)?.mergedBasis, 'stored')
})

test('merged fallback: an unsynced line follows the client claim and the ledger says so', async (t) => {
  const library = { list: async () => ({ stories: [] }) }
  const billing = createFakeBilling({ balance: 500 })
  const calls = []
  const { base } = await startServer(t, { billing, library, generator: countingGenerator(calls) })
  const body = { ...storyBody('story-unsynced', 0), story: { ...storyBody('story-unsynced', 0).story, kind: 'merged' } }
  const response = await generate(base, body)
  assert.equal(response.status, 200)
  await response.json()
  assert.equal(billing.state.balance, 500 - 15, 'an unverifiable merged claim still pays the fusion rate (over-collect, never under)')
  assert.equal(billing.state.records.at(-1)?.mergedBasis, 'client-unverified')
})

test('estimated metering: a generation without provider usage still settles coins and is flagged estimated', async (t) => {
  const calls = []
  const billing = createFakeBilling({ balance: 100 })
  const { base } = await startServer(t, { billing, generator: countingGenerator(calls, null) })
  const response = await generate(base, storyBody('story-no-usage', 0))
  assert.equal(response.status, 200)
  await response.json()
  assert.equal(billing.state.balance, 100 - 12, 'the estimated 12,000 tokens settle 12 coins instead of riding free')
  assert.equal(billing.state.records.at(-1)?.coinsSpent, 12)
  assert.equal(billing.state.records.at(-1)?.estimated, true, 'the cost ledger carries the estimate flag')
})
