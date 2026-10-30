import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHmac } from 'node:crypto'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createEmailCodeService } from '../server/email-code.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import {
  COIN, PRODUCTS, coinCostForText, createBillingService, createMemoryBillingStore,
  summarizeCostRecords, summarizePregeneration, textCostCny, textSceneFor, pregeneratedFor,
} from '../server/billing.js'
import { createStripeService } from '../server/stripe.js'
import { ApiError } from '../server/gemini.js'

/**
 * BILLING batch: cost metering on every generation, the entitlement
 * engine (daily coin top-up → coin settlement per generation → the
 * anti-abuse token ceiling, which only legacy chapter credits carry
 * a reader past), redemption codes (one generic failure, per-account
 * throttling, one-time use), coins past the painting caps, and the
 * env-gated Stripe facade (checkout shape + webhook signature +
 * idempotent fulfilment). Prices and caps in this file are fixture
 * values where noted; the catalog itself is production (REQ-68).
 */

const ORIGIN = { Origin: 'http://localhost:5173' }
const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

const USAGE = { promptTokenCount: 600, candidatesTokenCount: 300, thoughtsTokenCount: 100, totalTokenCount: 1000 }

async function startBillingServer(t) {
  const identityStore = createMemoryIdentityStore()
  const mailer = { configured: false, sendCode: async () => {}, sendRecoveryCode: async () => {} }
  const usernameAuth = createUsernameAuthService({ env: { AUTH_ENABLED: 'true' }, store: identityStore, mailer, log: () => {} })
  const emailCode = createEmailCodeService({ env: {}, store: identityStore, mailer, log: () => {} })
  const authEnv = { AUTH_ENABLED: 'true', DATA_STORE: 'memory', GENERATION_DAILY_TOKEN_CAP: '1000' }
  const auth = createAuthService({ env: authEnv, usernameAuth, emailCode })
  const billingStore = createMemoryBillingStore()
  const billing = createBillingService({ env: { MEMBER_DAILY_TOKEN_CAP: '100000' }, store: billingStore, log: () => {} })

  let coverCalls = 0
  const cover = {
    model: 'gemini-2.5-flash-image',
    dailyLimit: 1,
    async request(identity, body, options = {}) {
      coverCalls += 1
      if (!options.credit && coverCalls > 1) throw new ApiError(429, '今天的封面生成次数已用完。', 'cover-quota')
      return { status: 'ready', version: coverCalls, usage: null }
    },
  }
  let avatarCalls = 0
  const avatar = {
    model: 'gemini-2.5-flash-image',
    async generate(identity, body, options = {}) {
      avatarCalls += 1
      if (!options.credit && avatarCalls > 1) throw new ApiError(429, '今天的立绘生成次数已用完。', 'avatar-quota')
      return { avatar: { id: 'av-1' }, usage: null, anchor: 'text' }
    },
  }
  const generator = {
    status: () => ({ configured: true, provider: 'gemini', model: 'gemini-3.8-flash' }),
    generate: async (body) => ({
      chapter: { id: `ch-${body.index}`, index: body.index, title: 't', paragraphs: ['x'] },
      key: 'fixture-key',
      usage: USAGE,
    }),
  }
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    auth, generator, billing, cover, avatar,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, billing, billingStore }
}

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  return token
}

const post = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'POST', headers: token ? authed(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})
const get = (base, path, token) => fetch(`${base}${path}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
})
const generate = (base, token, story, index, extra = {}) =>
  post(base, '/api/generate', token, { story, index, ...extra })

async function mint(base, officialToken, productId) {
  const response = await post(base, '/api/billing/codes', officialToken, { productId, count: 1 })
  assert.equal(response.status, 200, `mint ${productId}`)
  const { codes } = await response.json()
  return codes[0]
}

test('scene classification and pre-generation inference read the request body only', () => {
  assert.equal(textSceneFor({ story: { kind: 'solo' }, index: 0 }), 'chapter')
  assert.equal(textSceneFor({ story: { kind: 'merged' }, index: 2 }), 'fusion')
  assert.equal(textSceneFor({ story: { kind: 'solo', config: { sourcePublicationId: 'pub-1' } }, index: 1 }), 'entered')
  assert.equal(textSceneFor({ story: { kind: 'solo' }, index: 1, mode: 'revise' }), 'intervention')
  assert.equal(textSceneFor({ story: { kind: 'solo' }, index: 1, mode: 'reroll' }), 'reroll')
  assert.equal(pregeneratedFor({ story: { readerIndex: 0 }, index: 0 }), false)
  assert.equal(pregeneratedFor({ story: { readerIndex: 0 }, index: 1 }), true)
  assert.equal(pregeneratedFor({ story: { readerIndex: 3 }, index: 3 }), false)
  const cost = textCostCny('gemini-3.8-flash', USAGE)
  assert.deepEqual(
    { input: cost.inputTokens, output: cost.outputTokens, cny: cost.costCny },
    { input: 600, output: 400, cny: 0.0085 },
  )
})

test('every generation lands a cost record with scene, tokens, price and coins settled', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'meter_reader')
  // One chapter exactly fills the fixture's free ceiling, so the
  // remaining generations in this test ride on a membership (higher
  // ceiling) and settle in coins like everything else.
  const card = await mint(base, official, 'member-month')
  assert.equal((await post(base, '/api/billing/redeem', token, { code: card })).status, 200)
  const story = { id: 'story-meter', kind: 'solo', readerIndex: 0, chapters: [] }
  assert.equal((await generate(base, token, story, 0)).status, 200)
  assert.equal((await generate(base, token, { ...story, readerIndex: 0 }, 1)).status, 200)
  assert.equal((await generate(base, token, { id: 'story-fused', kind: 'merged', readerIndex: 0, chapters: [] }, 0)).status, 200)

  const records = await billingStore.listCostRecords()
  assert.equal(records.length, 3)
  const opening = records.find((record) => record.scene === 'chapter' && record.chapterIndex === 0)
  assert.equal(opening.pregenerated, false)
  assert.equal(opening.totalTokens, 1000)
  assert.equal(opening.costCny, 0.0085)
  assert.equal(opening.chapterId, 'ch-0')
  assert.equal(records.filter((record) => record.pregenerated).length, 1)
  assert.ok(records.some((record) => record.scene === 'fusion'))
  // Coin settlement: the fixture chapter meters 1,000 units = 1 coin;
  // the fusion chapter settles at the member fusion rate (×1.2 → 2).
  assert.equal(opening.coinsSpent, 1)
  assert.equal(records.find((record) => record.scene === 'fusion').coinsSpent, 2)
})

test('the daily ceiling blocks even with coins; only a legacy chapter credit carries past it', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const token = await register(base, 'ceiling_reader')
  const uid = 'username:ceiling_reader'
  const story = { id: 'story-ceiling', kind: 'solo', readerIndex: 0, chapters: [] }

  // A coin-rich reader holding one legacy chapter credit.
  await billingStore.putEntitlement(uid, { uid, memberUntil: null, chapterCredits: 1, imageCredits: 0, coins: 500, coinGrantDay: null, failedRedeems: [] })

  assert.equal((await generate(base, token, story, 0)).status, 200) // 1000/1000 of the free ceiling
  let me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.coins, 499, 'the chapter under the ceiling settles 1 coin')

  assert.equal((await generate(base, token, story, 1)).status, 200, 'the legacy credit carries one chapter past the ceiling')
  me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.chapterCredits, 0)
  assert.equal(me.coins, 499, 'a credit generation settles no coins')
  const creditRecord = (await billingStore.listCostRecords()).find((record) => record.creditUsed)
  assert.ok(creditRecord, 'the credit generation is marked in the ledger')
  assert.equal(creditRecord.coinsSpent, 0)

  const blocked = await generate(base, token, story, 2)
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).code, 'quota-exceeded', 'coins never bypass the anti-abuse ceiling')
})

test('coins gate generation: a drained balance blocks, a coin pack refills', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'coin_reader')
  const uid = 'username:coin_reader'
  const story = { id: 'story-coins', kind: 'solo', readerIndex: 0, chapters: [] }

  // Membership lifts the fixture ceiling so the coin gate is what binds.
  const card = await mint(base, official, 'member-month')
  assert.equal((await post(base, '/api/billing/redeem', token, { code: card })).status, 200)
  assert.equal((await generate(base, token, story, 0)).status, 200)

  const stored = await billingStore.getEntitlement(uid)
  await billingStore.putEntitlement(uid, { ...stored, coins: 0 })
  const drained = await generate(base, token, story, 1)
  assert.equal(drained.status, 429)
  assert.equal((await drained.json()).code, 'coins-exhausted')

  const pack = await mint(base, official, 'pack-6')
  const redeemed = await post(base, '/api/billing/redeem', token, { code: pack })
  assert.equal(redeemed.status, 200)
  assert.equal((await redeemed.json()).entitlements.coins, 300)

  assert.equal((await generate(base, token, story, 1)).status, 200)
  const me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.coins, 299)
  assert.equal(me.member.active, true)
})

test('a legacy chapter credit pays inside the ceiling when the coin balance is empty', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'credit_inside')
  const uid = 'username:credit_inside'
  const story = { id: 'story-credit-inside', kind: 'solo', readerIndex: 0, chapters: [] }

  // Membership keeps the fixture ceiling far away so the coin/credit
  // layering inside the ceiling is what binds.
  const card = await mint(base, official, 'member-month')
  assert.equal((await post(base, '/api/billing/redeem', token, { code: card })).status, 200)
  assert.equal((await generate(base, token, story, 0)).status, 200)

  // Drained coins, one legacy credit left, top-up already stamped today.
  const stored = await billingStore.getEntitlement(uid)
  await billingStore.putEntitlement(uid, { ...stored, coins: 0, chapterCredits: 1 })

  assert.equal((await generate(base, token, story, 1)).status, 200, 'the credit carries the chapter inside the ceiling')
  const me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.chapterCredits, 0, 'the credit is actually spent, not just waved at')
  assert.equal(me.coins, 0, 'no coins are settled on a credit generation')
  const creditRecord = (await billingStore.listCostRecords()).find((record) => record.creditUsed)
  assert.ok(creditRecord, 'the credit generation is marked in the ledger')
  assert.equal(creditRecord.coinsSpent, 0)

  const drained = await generate(base, token, story, 2)
  assert.equal(drained.status, 429)
  assert.equal((await drained.json()).code, 'coins-exhausted', 'one credit is one chapter, not a perpetual pass')
})

test('membership raises the daily ceiling instead of spending credits', async (t) => {
  const { base } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'member_reader')
  const story = { id: 'story-member', kind: 'solo', readerIndex: 0, chapters: [] }

  assert.equal((await generate(base, token, story, 0)).status, 200) // free ceiling reached
  const code = await mint(base, official, 'member-month')
  const redeemed = await post(base, '/api/billing/redeem', token, { code })
  assert.equal(redeemed.status, 200)
  const { entitlements } = await redeemed.json()
  const until = Date.parse(entitlements.memberUntil)
  assert.ok(until > Date.now() + 29 * 86_400_000 && until < Date.now() + 31 * 86_400_000, 'month card ≈ +30 days')

  assert.equal((await generate(base, token, story, 1)).status, 200) // member ceiling, not a credit
  const me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.member.active, true)
  assert.equal(me.chapterCredits, 0)
  assert.equal(me.stripeEnabled, false)
  // Coin trail: the first chapter rode the free top-up (150 → 149),
  // the card then granted 1,200, and the second chapter settled 1.
  assert.equal(me.coins, 1348)
})

test('codes are one-time, failures share one message, and the account is throttled', async (t) => {
  const { base } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'code_reader')
  const code = await mint(base, official, 'pack-30')

  assert.equal((await post(base, '/api/billing/redeem', token, { code })).status, 200)
  const reused = await post(base, '/api/billing/redeem', token, { code })
  assert.equal(reused.status, 400)
  assert.equal((await reused.json()).error, '兑换码无效或已使用。')

  const stranger = await register(base, 'code_stranger')
  const unknown = await post(base, '/api/billing/redeem', stranger, { code: 'ZJ-AAAAA-AAAAA-AAAAA' })
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).error, '兑换码无效或已使用。')
  const malformed = await post(base, '/api/billing/redeem', stranger, { code: 'hello' })
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).error, '兑换码无效或已使用。')

  const mintByReader = await post(base, '/api/billing/codes', stranger, { productId: 'pack-6', count: 1 })
  assert.equal(mintByReader.status, 403)

  const throttled = await register(base, 'code_brute')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await post(base, '/api/billing/redeem', throttled, { code: `ZJ-BBBBB-BBBBB-BBBB${attempt}` })
    assert.equal(response.status, 400, `attempt ${attempt + 1}`)
  }
  const sixth = await post(base, '/api/billing/redeem', throttled, { code: 'ZJ-BBBBB-BBBBB-BBBB9' })
  assert.equal(sixth.status, 429)
})

test('coins paint past the daily caps for covers and portraits at the flat image price', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'image_reader')
  const uid = 'username:image_reader'
  const code = await mint(base, official, 'pack-6')
  assert.equal((await post(base, '/api/billing/redeem', token, { code })).status, 200)

  assert.equal((await post(base, '/api/cover', token, { storyId: 'story-img' })).status, 200)
  assert.equal((await post(base, '/api/cover', token, { storyId: 'story-img' })).status, 200)
  assert.equal((await post(base, '/api/avatar/generate', token, {})).status, 200)
  assert.equal((await post(base, '/api/avatar/generate', token, {})).status, 200)

  const me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.imageCredits, 0)
  assert.equal(me.coins, 300 - 2 * COIN.imageCoinCost, 'two past-cap pictures settled at the flat coin price')
  const imageRecords = (await billingStore.listCostRecords()).filter((record) => record.kind === 'image')
  assert.equal(imageRecords.length, 4)
  assert.equal(imageRecords.filter((record) => record.coinsSpent === COIN.imageCoinCost).length, 2)
  assert.equal(imageRecords.filter((record) => record.creditUsed).length, 0)
  assert.deepEqual(new Set(imageRecords.map((record) => record.scene)), new Set(['cover', 'avatar']))
  assert.ok(imageRecords.every((record) => record.costCny === 0.28))

  const stored = await billingStore.getEntitlement(uid)
  await billingStore.putEntitlement(uid, { ...stored, coins: COIN.imageCoinCost - 1 })
  const drained = await post(base, '/api/cover', token, { storyId: 'story-img' })
  assert.equal(drained.status, 429)
})

test('checkout stays closed without Stripe env; the member page says so', async (t) => {
  const { base } = await startBillingServer(t)
  const token = await register(base, 'window_shopper')
  const me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.available, true)
  assert.equal(me.stripeEnabled, false)
  assert.equal(me.products.length, 6)
  assert.ok(me.products.every((product) => product.coins > 0), 'every product grants coins under the REQ-68 catalog')
  assert.equal(me.coin.name, '织币')
  assert.equal(me.coins, 150, 'opening the member page lands the daily free top-up')
  const checkout = await post(base, '/api/billing/checkout', token, { productId: 'member-year' })
  assert.equal(checkout.status, 503)
  const anonymous = await get(base, '/api/billing/me', null)
  assert.equal(anonymous.status, 401)
})

test('stripe checkout carries alipay/wechat pay; the webhook grants once, on a valid signature only', async () => {
  const billingStore = createMemoryBillingStore()
  const billing = createBillingService({ env: {}, store: billingStore, log: () => {} })
  const seen = []
  const stripe = createStripeService({
    env: {
      STRIPE_SECRET_KEY: 'sk_test_fixture',
      STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
      STRIPE_SUCCESS_URL: 'https://example.test/ok',
      STRIPE_CANCEL_URL: 'https://example.test/cancel',
    },
    billing,
    fetchImpl: async (url, options) => {
      seen.push({ url, options })
      return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }) }
    },
  })
  assert.equal(stripe.enabled, true)
  const session = await stripe.createCheckoutSession({ uid: 'username:buyer' }, 'member-year')
  assert.equal(session.url, 'https://checkout.stripe.com/c/pay/cs_test_123')
  const form = new URLSearchParams(seen[0].options.body)
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '19800')
  assert.equal(form.get('line_items[0][price_data][currency]'), 'cny')
  assert.deepEqual(
    [form.get('payment_method_types[0]'), form.get('payment_method_types[1]'), form.get('payment_method_types[2]')],
    ['card', 'alipay', 'wechat_pay'],
  )
  assert.equal(form.get('metadata[uid]'), 'username:buyer')
  assert.equal(form.get('metadata[productId]'), 'member-year')

  const event = {
    id: 'evt_fixture',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123', payment_status: 'paid',
        metadata: { uid: 'username:buyer', productId: 'member-month' },
      },
    },
  }
  const rawBody = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', 'whsec_fixture').update(`${timestamp}.${rawBody}`).digest('hex')
  const header = `t=${timestamp},v1=${signature}`

  const granted = await stripe.handleWebhook(rawBody, header)
  assert.deepEqual(granted, { received: true, granted: true })
  const after = await billing.entitlements('username:buyer')
  assert.ok(Date.parse(after.memberUntil) > Date.now() + 29 * 86_400_000)
  assert.equal(after.coins, 1200, 'the month card grants its coins through the same grant')

  const replay = await stripe.handleWebhook(rawBody, header)
  assert.equal(replay.granted, false)
  assert.equal(replay.duplicate, true)
  const afterReplay = await billing.entitlements('username:buyer')
  assert.equal(afterReplay.memberUntil, after.memberUntil)

  await assert.rejects(
    () => stripe.handleWebhook(rawBody, `t=${timestamp},v1=${'0'.repeat(64)}`),
    (error) => error instanceof ApiError && error.status === 400,
  )
})

test('coin math: per-thousand settlement, fusion rates, and the pricing guardrail', () => {
  assert.equal(COIN.name, '织币')
  assert.equal(COIN.tokensPerCoin, 1000)
  assert.equal(coinCostForText({ scene: 'chapter', totalTokens: 13_428 }), 14)
  assert.equal(coinCostForText({ scene: 'chapter', totalTokens: 1000 }), 1)
  assert.equal(coinCostForText({ scene: 'chapter', totalTokens: 0 }), 0)
  assert.equal(coinCostForText({ scene: 'intervention', totalTokens: 15_000 }), 15)
  assert.equal(coinCostForText({ scene: 'fusion', totalTokens: 13_316 }), 21)
  assert.equal(coinCostForText({ scene: 'fusion', totalTokens: 13_316, member: true }), 17)
  // The fusion rate follows the line, not the mode: revising or
  // re-rolling a merged chapter still pays the fusion rate.
  assert.equal(coinCostForText({ scene: 'intervention', totalTokens: 13_316, merged: true }), 21)
  assert.equal(coinCostForText({ scene: 'reroll', totalTokens: 13_316, merged: true, member: true }), 17)
  assert.equal(coinCostForText({ scene: 'intervention', totalTokens: 13_316 }), 14)
  // Guardrail (PRICING.md): the worst measured text cost is ¥0.0065
  // per coin of usage; every product's per-coin revenue must clear
  // twice that, so the cheapest coin sold still pays for itself.
  const perCoin = PRODUCTS.filter((product) => product.coins > 0)
    .map((product) => product.priceCny / product.coins)
  assert.ok(perCoin.length === PRODUCTS.length)
  assert.ok(Math.min(...perCoin) >= 2 * 0.0065, `cheapest coin brings ¥${Math.min(...perCoin)}/coin`)
})

test('daily coin top-up: once a day, free and member ceilings, never a stockpile', async () => {
  const store = createMemoryBillingStore()
  let clock = new Date('2026-10-31T01:00:00.000Z')
  const billing = createBillingService({ env: {}, store, now: () => clock, log: () => {} })

  let state = await billing.applyDailyCoinTopUp('username:topup')
  assert.equal(state.coins, COIN.dailyTopUpFree)
  assert.equal(await billing.spendCoins('username:topup', 500), COIN.dailyTopUpFree, 'settlement clamps at the balance')
  state = await billing.entitlements('username:topup')
  assert.equal(state.coins, 0)
  state = await billing.applyDailyCoinTopUp('username:topup')
  assert.equal(state.coins, 0, 'the top-up lands once per day, not per call')

  clock = new Date('2026-11-01T01:00:00.000Z')
  state = await billing.applyDailyCoinTopUp('username:topup')
  assert.equal(state.coins, COIN.dailyTopUpFree, 'a new day tops up again')

  await billing.grantProduct('username:topup', 'member-month', 'test')
  state = await billing.entitlements('username:topup')
  assert.equal(state.coins, COIN.dailyTopUpFree + 1200)
  await billing.spendCoins('username:topup', state.coins - 100)
  clock = new Date('2026-11-02T01:00:00.000Z')
  state = await billing.applyDailyCoinTopUp('username:topup')
  assert.equal(state.coins, COIN.dailyTopUpMember, 'members top up to the member ceiling')
})

test('summaries aggregate by day/user/scene and judge pre-generation honestly', () => {
  const records = [
    { kind: 'text', scene: 'chapter', uid: 'u1', totalTokens: 1000, costCny: 0.01, at: '2026-10-28T01:00:00.000Z', pregenerated: false },
    { kind: 'text', scene: 'chapter', uid: 'u1', totalTokens: 1000, costCny: 0.01, at: '2026-10-28T02:00:00.000Z', pregenerated: true, storyId: 's1', chapterIndex: 1, chapterId: 'ch-1' },
    { kind: 'text', scene: 'fusion', uid: 'u2', totalTokens: 2000, costCny: 0.02, at: '2026-10-29T02:00:00.000Z', pregenerated: true, storyId: 's2', chapterIndex: 0, chapterId: 'ch-0' },
    { kind: 'image', scene: 'cover', uid: 'u2', totalTokens: 0, costCny: 0.28, at: '2026-10-29T03:00:00.000Z', pregenerated: false },
  ]
  const totals = summarizeCostRecords(records)
  assert.equal(totals.totalCny, 0.32)
  assert.equal(totals.byDay['2026-10-28'].records, 2)
  assert.equal(totals.byUser.u2.costCny, 0.3)
  assert.equal(totals.byScene.fusion.textTokens, 2000)

  const lookup = new Map([
    ['u1\ns1', { openedThrough: 2, chapterIds: ['ch-0', 'ch-1'] }],
    ['u2\ns2', { openedThrough: 0, chapterIds: ['ch-other'] }],
  ])
  const pregen = summarizePregeneration(records, lookup)
  assert.deepEqual(
    { total: pregen.total, opened: pregen.opened, discarded: pregen.discarded, waste: pregen.wasteRate },
    { total: 2, opened: 1, discarded: 1, waste: 0.5 },
  )
})
