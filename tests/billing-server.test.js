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
  createBillingService, createMemoryBillingStore, summarizeCostRecords,
  summarizePregeneration, textCostCny, textSceneFor, pregeneratedFor,
} from '../server/billing.js'
import { createStripeService } from '../server/stripe.js'
import { ApiError } from '../server/gemini.js'

/**
 * BILLING batch: cost metering on every generation, the entitlement
 * engine (free ceiling → member ceiling → chapter credits, in that
 * order), redemption codes (one generic failure, per-account
 * throttling, one-time use), image credits past the painting caps,
 * and the env-gated Stripe facade (checkout shape + webhook
 * signature + idempotent fulfilment). Prices and caps in this file
 * are fixture values where noted; the catalog itself is production.
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

test('every generation lands a cost record with scene, tokens and price', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'meter_reader')
  // One chapter exactly fills the fixture's free ceiling, so the
  // remaining generations in this test ride on a redeemed pack.
  const pack = await mint(base, official, 'pack-6')
  assert.equal((await post(base, '/api/billing/redeem', token, { code: pack })).status, 200)
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
})

test('free ceiling blocks, a quota pack credit carries one more chapter, spent only on success', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'pack_reader')
  const story = { id: 'story-pack', kind: 'solo', readerIndex: 0, chapters: [] }

  assert.equal((await generate(base, token, story, 0)).status, 200) // 1000/1000 of the free ceiling
  const blocked = await generate(base, token, story, 1)
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).code, 'quota-exceeded')

  const code = await mint(base, official, 'pack-6')
  const redeemed = await post(base, '/api/billing/redeem', token, { code })
  assert.equal(redeemed.status, 200)
  assert.equal((await redeemed.json()).entitlements.chapterCredits, 20)

  assert.equal((await generate(base, token, story, 1)).status, 200)
  const me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.chapterCredits, 19)
  assert.equal(me.member.active, false)
  const creditRecord = (await billingStore.listCostRecords()).find((record) => record.creditUsed)
  assert.ok(creditRecord, 'the credit generation is marked in the ledger')
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

test('image credits paint past the daily caps for covers and portraits', async (t) => {
  const { base, billingStore } = await startBillingServer(t)
  const official = await register(base, 'storyweave')
  const token = await register(base, 'image_reader')
  const code = await mint(base, official, 'pack-6')
  assert.equal((await post(base, '/api/billing/redeem', token, { code })).status, 200)

  assert.equal((await post(base, '/api/cover', token, { storyId: 'story-img' })).status, 200)
  assert.equal((await post(base, '/api/cover', token, { storyId: 'story-img' })).status, 200)
  assert.equal((await post(base, '/api/avatar/generate', token, {})).status, 200)
  assert.equal((await post(base, '/api/avatar/generate', token, {})).status, 200)

  const me = await (await get(base, '/api/billing/me', token)).json()
  assert.equal(me.imageCredits, 0)
  const imageRecords = (await billingStore.listCostRecords()).filter((record) => record.kind === 'image')
  assert.equal(imageRecords.length, 4)
  assert.equal(imageRecords.filter((record) => record.creditUsed).length, 2)
  assert.deepEqual(new Set(imageRecords.map((record) => record.scene)), new Set(['cover', 'avatar']))
  assert.ok(imageRecords.every((record) => record.costCny === 0.28))

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
