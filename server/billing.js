import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { ApiError } from './gemini.js'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'
import { dayKeyFor, usageDelta } from './usage.js'
import { isOfficialUid } from './plaza.js'

/**
 * BILLING — cost metering, entitlements and redemption codes.
 *
 * Policy (user-set, 2026-10-28; coin layer REQ-68, 2026-10-31):
 * reading is free, creating costs. The only entitlement system in
 * the product is this one: membership is a future date on the
 * account, and spending runs on one coin balance （织币） topped up
 * free every day and settled per generation by measured usage; the
 * older chapter/image credit balances remain as a legacy overflow.
 * Every sales channel — redemption codes today, the Stripe checkout
 * prepared in server/stripe.js, any future reseller — grants
 * through `grantProduct` and nothing else, so channels can never
 * drift into parallel entitlement shapes.
 *
 * Cost records are written for EVERY metered call (text and image),
 * member or free, credit or daily quota: the point of the ledger is
 * knowing what a chapter really costs and how much pre-generation is
 * thrown away, not policing members. Recording is fail-open in the
 * same spirit as server/usage.js — a ledger outage never blocks a
 * chapter and never fabricates numbers.
 */

// ---------------------------------------------------------------------
// Price table (config constants — change here, never inline in logic)
//
// Source: Google Gemini API list prices as published 2026-10-28
// (Flash tier: input $0.30 / 1M tokens, output $2.50 / 1M tokens;
// gemini-2.5-flash-image $0.039 / image), converted at USD/CNY 7.2.
// gemini-3.8-flash has no separate public list price; it is metered
// at the Flash tier row until the operator prices it explicitly.
// A chapter's input side is the prompt token count as the provider
// reports it (cached content rides inside it and is NOT surcharged
// separately); the output side is candidates + thoughts.
// ---------------------------------------------------------------------
export const PRICE_TABLE_AS_OF = '2026-10-28'
export const PRICE_TABLE = Object.freeze({
  text: Object.freeze({
    default: Object.freeze({ inputPerMillionCny: 2.16, outputPerMillionCny: 18.0 }),
    'gemini-3.8-flash': Object.freeze({ inputPerMillionCny: 2.16, outputPerMillionCny: 18.0 }),
    'gemini-2.5-flash': Object.freeze({ inputPerMillionCny: 2.16, outputPerMillionCny: 18.0 }),
  }),
  image: Object.freeze({
    default: Object.freeze({ perImageCny: 0.28 }),
    'gemini-2.5-flash-image': Object.freeze({ perImageCny: 0.28 }),
  }),
})

const roundCny = (value) => Math.round(value * 10_000) / 10_000

export function textCostCny(model, usage) {
  const delta = usageDelta(usage)
  const row = PRICE_TABLE.text[model] || PRICE_TABLE.text.default
  const input = delta.prompt
  const output = delta.candidates + delta.thoughts
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: delta.total,
    costCny: roundCny((input * row.inputPerMillionCny + output * row.outputPerMillionCny) / 1_000_000),
  }
}

export function imageCostCny(model) {
  const row = PRICE_TABLE.image[model] || PRICE_TABLE.image.default
  return row.perImageCny
}

// ---------------------------------------------------------------------
// The coin (REQ-68, priced 2026-10-31 from the measured cost model in
// sw-prep/req67-book/COST-MODEL.md + PRICING.md). One platform currency:
// 织币. Text generation settles by measured usage at 1 coin per 1,000
// provider tokens (the figure the 100-chapter experiment produced:
// a finished chapter runs ≈13–15k tokens ≈ ¥0.07 of metered cost, so
// one coin of text costs the platform ≈¥0.005–0.0065). Fusion chapters
// carry a heavier context and settle at a multiplier; images settle
// flat per picture. The free experience is a daily top-up: every day
// the balance is raised to the free ceiling (members: the member
// ceiling) when it sits below it, so free coins never stockpile —
// 150 coins ≈ 11–19 chapters, a taste, never a free 100-chapter book.
// Guardrail (PRICING.md): the cheapest coin ever sold (year card)
// brings in ¥0.0138 per coin, ≥ 2× the worst measured per-coin text
// cost (¥0.0065); no member benefit may push the effective figure
// below that line, which is why the member advantage is a fusion
// multiplier and a higher top-up ceiling, not a blanket discount.
// ---------------------------------------------------------------------
export const COIN = Object.freeze({
  name: '织币',
  tokensPerCoin: 1000,
  imageCoinCost: 40,
  fusionMultiplier: 1.5,
  fusionMemberMultiplier: 1.2,
  dailyTopUpFree: 150,
  dailyTopUpMember: 300,
})

/**
 * Coins a finished text generation settles for, by scene and membership.
 * The fusion rate follows the LINE, not the mode: an intervention
 * revision or a re-roll of a merged story still generates with the
 * multi-source context priced into the fusion rate, so callers pass
 * `merged` alongside the scene (the scene label itself stays purely
 * descriptive for the cost ledger).
 */
export function coinCostForText({ scene, totalTokens, member = false, merged = false } = {}) {
  const metered = Number.isFinite(totalTokens) && totalTokens > 0 ? totalTokens : 0
  const base = Math.ceil(metered / COIN.tokensPerCoin)
  if (scene === 'fusion' || merged) {
    return Math.ceil(base * (member ? COIN.fusionMemberMultiplier : COIN.fusionMultiplier))
  }
  return base
}

// ---------------------------------------------------------------------
// Product catalog (REQ-68 re-price, 2026-10-31; CNY throughout).
// Membership is sold as cards (and, where a channel supports it, as
// subscriptions under the same grant); every product now grants coins
// through `coins`, and the old per-kind credits stay in the schema at
// zero for the new catalog — balances readers already hold keep
// working as a legacy overflow (see the generate gate in index.js).
// Per-coin revenue: month ¥0.0208 / quarter ¥0.0189 / year ¥0.0138;
// packs ¥0.020 / ¥0.0188 / ¥0.017 — bigger bundles are cheaper per
// coin, and the floor stays ≥ 2× the worst measured text cost.
// ---------------------------------------------------------------------
export const PRODUCTS = Object.freeze([
  Object.freeze({ id: 'member-month', kind: 'membership', name: '月卡', priceCny: 25, memberDays: 30, coins: 1200, chapterCredits: 0, imageCredits: 0 }),
  Object.freeze({ id: 'member-quarter', kind: 'membership', name: '季卡', priceCny: 68, memberDays: 90, coins: 3600, chapterCredits: 0, imageCredits: 0 }),
  Object.freeze({ id: 'member-year', kind: 'membership', name: '年卡', priceCny: 198, memberDays: 365, coins: 14400, chapterCredits: 0, imageCredits: 0, featured: true }),
  Object.freeze({ id: 'pack-6', kind: 'quota', name: '额度包 · 小', priceCny: 6, memberDays: 0, coins: 300, chapterCredits: 0, imageCredits: 0 }),
  Object.freeze({ id: 'pack-30', kind: 'quota', name: '额度包 · 中', priceCny: 30, memberDays: 0, coins: 1600, chapterCredits: 0, imageCredits: 0 }),
  Object.freeze({ id: 'pack-68', kind: 'quota', name: '额度包 · 大', priceCny: 68, memberDays: 0, coins: 4000, chapterCredits: 0, imageCredits: 0 }),
])
export const productById = (id) => PRODUCTS.find((product) => product.id === id) || null

/**
 * A member's daily generation ceiling, in provider tokens. The free
 * ceiling stays whatever GENERATION_DAILY_TOKEN_CAP says (default
 * 1,000,000 ≈ 124 chapters at the measured 8,060 tokens/chapter);
 * membership triples it. BILLING.md carries the reasoning: at
 * realistic member usage the monthly metered cost stays far under
 * half the card price, and this number is an anti-abuse ceiling that
 * ops can tighten here (or via env) without touching logic.
 */
export const DEFAULT_MEMBER_DAILY_TOKEN_CAP = 3_000_000
export function memberDailyTokenCap(env = {}) {
  const parsed = Number(env.MEMBER_DAILY_TOKEN_CAP)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MEMBER_DAILY_TOKEN_CAP
}

export const REDEEM_FAILURE_LIMIT = 5
export const REDEEM_FAILURE_WINDOW_MS = 60 * 60_000
export const MINT_MAX_COUNT = 100

// ---------------------------------------------------------------------
// Scene classification for text generation. The request body is the
// only witness: mode marks the intervention revision and the frontier
// re-roll; a merged story is a fusion line advancing; a story whose
// config carries a source publication is an entered line. Everything
// else is an ordinary chapter of the reader's own line.
// ---------------------------------------------------------------------
export function textSceneFor(body) {
  if (body?.mode === 'revise') return 'intervention'
  if (body?.mode === 'reroll') return 'reroll'
  const story = body?.story
  if (story?.kind === 'merged') return 'fusion'
  if (typeof story?.config?.sourcePublicationId === 'string' && story.config.sourcePublicationId) return 'entered'
  return 'chapter'
}

/**
 * A generation is a pre-generation when the chapter being written sits
 * AHEAD of the position the requesting story snapshot says the reader
 * has reached: the prepare path fires from the chapter the reader is
 * standing on (index = position + 1), while an on-demand request is
 * made standing on the missing chapter itself (index <= position),
 * and a first chapter is requested at position 0 for index 0.
 */
export function pregeneratedFor(body) {
  const story = body?.story
  const index = body?.index
  if (!Number.isInteger(index)) return false
  const position = Number.isInteger(story?.readerIndex) ? story.readerIndex : 0
  return index > position
}

// ---------------------------------------------------------------------
// Entitlement records
// ---------------------------------------------------------------------
export const ZERO_ENTITLEMENTS = Object.freeze({
  memberUntil: null, chapterCredits: 0, imageCredits: 0, coins: 0, coinGrantDay: null,
})

const count = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

export function normalizeEntitlements(value) {
  if (!value || typeof value !== 'object') return { ...ZERO_ENTITLEMENTS, failedRedeems: [] }
  return {
    memberUntil: typeof value.memberUntil === 'string' && !Number.isNaN(Date.parse(value.memberUntil)) ? value.memberUntil : null,
    chapterCredits: count(value.chapterCredits),
    imageCredits: count(value.imageCredits),
    coins: count(value.coins),
    coinGrantDay: typeof value.coinGrantDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.coinGrantDay) ? value.coinGrantDay : null,
    failedRedeems: Array.isArray(value.failedRedeems)
      ? value.failedRedeems.filter((at) => typeof at === 'string' && !Number.isNaN(Date.parse(at)))
      : [],
  }
}

export const memberActiveFor = (entitlements, nowMs) => Boolean(
  entitlements?.memberUntil && Date.parse(entitlements.memberUntil) > nowMs,
)

/** The pure grant: membership extends from the later of now / current expiry; quota adds. */
export function applyGrant(entitlements, product, nowMs) {
  const next = normalizeEntitlements(entitlements)
  if (product.memberDays > 0) {
    const base = next.memberUntil && Date.parse(next.memberUntil) > nowMs ? Date.parse(next.memberUntil) : nowMs
    next.memberUntil = new Date(base + product.memberDays * 86_400_000).toISOString()
  }
  next.chapterCredits += product.chapterCredits
  next.imageCredits += product.imageCredits
  next.coins += count(product.coins)
  return next
}

// ---------------------------------------------------------------------
// Redemption codes: `ZJ-XXXXX-XXXXX-XXXXX` over an alphabet without
// look-alike characters. Only the SHA-256 of the normalised code is
// ever stored (same discipline as session tokens in identity-store),
// so a store leak yields no redeemable codes.
// ---------------------------------------------------------------------
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateCode() {
  const bytes = randomBytes(15)
  const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
  return `ZJ-${chars.slice(0, 5).join('')}-${chars.slice(5, 10).join('')}-${chars.slice(10, 15).join('')}`
}
export const normalizeCode = (value) => typeof value === 'string' ? value.trim().toUpperCase() : ''
export const codeHashFor = (code) => createHash('sha256').update(normalizeCode(code)).digest('hex')
const CODE_SHAPE = /^ZJ-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/

// ---------------------------------------------------------------------
// Stores (memory + firestore, the identity-store factory pattern)
// ---------------------------------------------------------------------
export function createMemoryBillingStore() {
  const entitlements = new Map()
  const codes = new Map()
  const costRecords = new Map()
  const stripeEvents = new Map()
  return {
    kind: 'memory',
    async getEntitlement(uid) { return entitlements.get(uid) ?? null },
    async putEntitlement(uid, record) { entitlements.set(uid, record) },
    async getCode(hash) { return codes.get(hash) ?? null },
    async putCode(hash, record) { codes.set(hash, record) },
    async addCostRecord(record) { costRecords.set(record.id, record) },
    async listCostRecords() { return [...costRecords.values()] },
    async getStripeEvent(id) { return stripeEvents.get(id) ?? null },
    async putStripeEvent(id, record) { stripeEvents.set(id, record) },
  }
}

export function createFirestoreBillingStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const read = async (collection, key) => {
    const snapshot = await (await db()).collection(collection).doc(key).get()
    return snapshot.exists ? snapshot.data() : null
  }
  return {
    kind: 'firestore',
    getEntitlement: (uid) => read('billing_entitlements', uid),
    async putEntitlement(uid, record) { await (await db()).collection('billing_entitlements').doc(uid).set(record) },
    getCode: (hash) => read('billing_codes', hash),
    async putCode(hash, record) { await (await db()).collection('billing_codes').doc(hash).set(record) },
    async addCostRecord(record) { await (await db()).collection('cost_records').doc(record.id).set(record) },
    async listCostRecords() {
      const snapshot = await (await db()).collection('cost_records').get()
      return snapshot.docs.map((doc) => doc.data())
    },
    getStripeEvent: (id) => read('stripe_events', id),
    async putStripeEvent(id, record) { await (await db()).collection('stripe_events').doc(id).set(record) },
  }
}

export function createBillingStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryBillingStore()
  return createFirestoreBillingStore(db ? async () => db : () => loadFirestore(env))
}

// ---------------------------------------------------------------------
// Aggregation (internal reporting; scripts/billing-summary.mjs is the
// CLI face, these pure functions are the testable core)
// ---------------------------------------------------------------------
const emptyBucket = () => ({ records: 0, textTokens: 0, images: 0, costCny: 0 })

export function summarizeCostRecords(records) {
  const byDay = {}
  const byUser = {}
  const byScene = {}
  let totalCny = 0
  const add = (bucket, record) => {
    bucket.records += 1
    bucket.textTokens += record.kind === 'text' ? (record.totalTokens || 0) : 0
    bucket.images += record.kind === 'image' ? 1 : 0
    bucket.costCny = roundCny(bucket.costCny + (record.costCny || 0))
  }
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== 'object') continue
    totalCny = roundCny(totalCny + (record.costCny || 0))
    const day = typeof record.at === 'string' ? record.at.slice(0, 10) : 'unknown'
    add(byDay[day] ??= emptyBucket(), record)
    add(byUser[record.uid || 'anonymous'] ??= emptyBucket(), record)
    add(byScene[record.scene || 'unknown'] ??= emptyBucket(), record)
  }
  return { totalCny, byDay, byUser, byScene }
}

/**
 * What became of the pre-generated chapters, judged against the
 * synced library: a record counts as `opened` when the story's
 * opened-through watermark reached its chapter and the chapter now
 * on file is the very one that was paid for; `discarded` when the
 * slot now holds a different chapter (re-rolled, edited away,
 * revised over) or the chapter is gone; `unread` when the paid copy
 * still waits untouched; `unknown` when the story never synced, so
 * no honest verdict exists. The waste rate runs over resolved
 * outcomes only (opened + discarded).
 */
export function summarizePregeneration(records, storyLookup) {
  const counts = { total: 0, opened: 0, discarded: 0, unread: 0, unknown: 0 }
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.pregenerated || record.kind !== 'text') continue
    counts.total += 1
    const story = storyLookup?.get(`${record.uid}\n${record.storyId}`)
    if (!story) { counts.unknown += 1; continue }
    const current = Array.isArray(story.chapterIds) ? story.chapterIds[record.chapterIndex] : undefined
    if (current === undefined || current !== record.chapterId) { counts.discarded += 1; continue }
    if (Number.isInteger(story.openedThrough) && story.openedThrough >= record.chapterIndex) { counts.opened += 1; continue }
    counts.unread += 1
  }
  const resolved = counts.opened + counts.discarded
  return { ...counts, wasteRate: resolved ? Math.round((counts.discarded / resolved) * 10_000) / 10_000 : null }
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------
export function createBillingService({
  env = process.env,
  store,
  now = () => new Date(),
  log = (message) => process.stderr.write(`${message}\n`),
} = {}) {
  const backend = store === undefined ? createBillingStore({ env }) : store
  const memberCap = memberDailyTokenCap(env)
  const tails = new Map()
  const serialise = (uid, task) => {
    const previous = tails.get(uid) || Promise.resolve()
    const run = previous.then(task, task)
    tails.set(uid, run.catch(() => {}))
    return run
  }

  const readEntitlements = async (uid) => {
    if (!backend || typeof uid !== 'string' || !uid) return normalizeEntitlements(null)
    try {
      return normalizeEntitlements(await backend.getEntitlement(uid))
    } catch {
      log('billing: entitlement read failed; reporting the free state')
      return normalizeEntitlements(null)
    }
  }

  const writeEntitlements = async (uid, entitlements) => {
    await backend.putEntitlement(uid, { uid, ...entitlements, updatedAt: now().toISOString() })
    return entitlements
  }

  const memberActive = async (uid) => memberActiveFor(await readEntitlements(uid), now().getTime())

  /**
   * The daily free grant, as a top-up (REQ-68): once per day the
   * balance is raised to the free ceiling (member ceiling for
   * members) when it sits below it. Paid balances above the ceiling
   * are untouched and free coins can never stockpile past the
   * ceiling. Fail-open in the house style: a store hiccup reports
   * the stored state.
   */
  async function applyDailyCoinTopUp(uid) {
    if (!backend || typeof uid !== 'string' || !uid) return normalizeEntitlements(null)
    try {
      return await serialise(uid, async () => {
        const current = normalizeEntitlements(await backend.getEntitlement(uid))
        const today = dayKeyFor(now())
        if (current.coinGrantDay === today) return current
        const ceiling = memberActiveFor(current, now().getTime()) ? COIN.dailyTopUpMember : COIN.dailyTopUpFree
        const next = { ...current, coinGrantDay: today }
        if (next.coins < ceiling) next.coins = ceiling
        await writeEntitlements(uid, next)
        return next
      })
    } catch {
      log('billing: daily coin top-up failed; reporting the stored state')
      return readEntitlements(uid)
    }
  }

  async function grantProduct(uid, productId, source) {
    const product = productById(productId)
    if (!product) throw new ApiError(400, '这个商品不存在。')
    if (!backend) throw new ApiError(503, '会员服务尚未配置。')
    return serialise(uid, async () => {
      const current = normalizeEntitlements(await backend.getEntitlement(uid))
      const next = applyGrant(current, product, now().getTime())
      await writeEntitlements(uid, next)
      return { product, entitlements: next, source }
    })
  }

  return {
    available: backend !== null && backend !== undefined,
    memberDailyTokenCap: memberCap,

    // --- metering (fail-open by contract) ---
    async recordTextCost({ uid, scene, pregenerated, model, usage, storyId, chapterIndex, chapterId, creditUsed = false, coinsSpent = 0 }) {
      if (!backend || typeof uid !== 'string' || !uid) return false
      try {
        const cost = textCostCny(model, usage)
        await backend.addCostRecord({
          id: `cost-${randomUUID()}`,
          uid, kind: 'text', scene: scene || 'chapter',
          pregenerated: Boolean(pregenerated),
          model: typeof model === 'string' ? model : null,
          inputTokens: cost.inputTokens, outputTokens: cost.outputTokens, totalTokens: cost.totalTokens,
          costCny: cost.costCny,
          storyId: typeof storyId === 'string' ? storyId : null,
          chapterIndex: Number.isInteger(chapterIndex) ? chapterIndex : null,
          chapterId: typeof chapterId === 'string' ? chapterId : null,
          creditUsed: Boolean(creditUsed),
          coinsSpent: count(coinsSpent),
          day: dayKeyFor(now()),
          at: now().toISOString(),
        })
        return true
      } catch {
        log('billing: text cost recording failed; generation result unaffected')
        return false
      }
    },
    async recordImageCost({ uid, scene, model, creditUsed = false, coinsSpent = 0 }) {
      if (!backend || typeof uid !== 'string' || !uid) return false
      try {
        await backend.addCostRecord({
          id: `cost-${randomUUID()}`,
          uid, kind: 'image', scene: scene || 'cover',
          pregenerated: false,
          model: typeof model === 'string' ? model : null,
          inputTokens: 0, outputTokens: 0, totalTokens: 0,
          costCny: imageCostCny(model),
          storyId: null, chapterIndex: null, chapterId: null,
          creditUsed: Boolean(creditUsed),
          coinsSpent: count(coinsSpent),
          day: dayKeyFor(now()),
          at: now().toISOString(),
        })
        return true
      } catch {
        log('billing: image cost recording failed; generation result unaffected')
        return false
      }
    },

    // --- entitlement reads ---
    entitlements: readEntitlements,
    memberActive,
    async dailyTokenCapFor(uid, freeCap) {
      return (await memberActive(uid)) ? memberCap : freeCap
    },
    async hasChapterCredit(uid) {
      return (await readEntitlements(uid)).chapterCredits > 0
    },
    async hasImageCredit(uid) {
      return (await readEntitlements(uid)).imageCredits > 0
    },

    // --- spends (serialised per account; false means "no balance") ---
    async consumeChapterCredit(uid) {
      if (!backend || typeof uid !== 'string' || !uid) return false
      try {
        return await serialise(uid, async () => {
          const current = normalizeEntitlements(await backend.getEntitlement(uid))
          if (current.chapterCredits <= 0) return false
          current.chapterCredits -= 1
          await writeEntitlements(uid, current)
          return true
        })
      } catch {
        log('billing: chapter credit spend failed')
        return false
      }
    },
    async consumeImageCredit(uid) {
      if (!backend || typeof uid !== 'string' || !uid) return false
      try {
        return await serialise(uid, async () => {
          const current = normalizeEntitlements(await backend.getEntitlement(uid))
          if (current.imageCredits <= 0) return false
          current.imageCredits -= 1
          await writeEntitlements(uid, current)
          return true
        })
      } catch {
        log('billing: image credit spend failed')
        return false
      }
    },

    // --- coins (REQ-68): daily top-up, balance checks, settlement ---
    applyDailyCoinTopUp,
    async hasCoins(uid, minimum = 1) {
      return (await readEntitlements(uid)).coins >= Math.max(1, minimum)
    },
    /** Settle a coin charge after the work landed; never goes negative. */
    async spendCoins(uid, amount) {
      if (!backend || typeof uid !== 'string' || !uid) return 0
      const due = count(amount)
      if (due <= 0) return 0
      try {
        return await serialise(uid, async () => {
          const current = normalizeEntitlements(await backend.getEntitlement(uid))
          const spent = Math.min(current.coins, due)
          if (spent <= 0) return 0
          current.coins -= spent
          await writeEntitlements(uid, current)
          return spent
        })
      } catch {
        log('billing: coin spend failed')
        return 0
      }
    },

    // --- grants ---
    grantProduct,

    async redeem(uid, rawCode) {
      if (!backend) throw new ApiError(503, '会员服务尚未配置。')
      if (typeof uid !== 'string' || !uid) throw new ApiError(401, '请先登录，再兑换。', 'auth-required')
      return serialise(uid, async () => {
        const current = normalizeEntitlements(await backend.getEntitlement(uid))
        const nowMs = now().getTime()
        const recentFailures = current.failedRedeems.filter((at) => nowMs - Date.parse(at) < REDEEM_FAILURE_WINDOW_MS)
        if (recentFailures.length >= REDEEM_FAILURE_LIMIT) {
          throw new ApiError(429, '兑换尝试太频繁了，请一小时后再试。')
        }
        const fail = async () => {
          await writeEntitlements(uid, { ...current, failedRedeems: [...recentFailures, now().toISOString()] })
          // One message for every failure mode — unknown, malformed
          // and already-used codes are indistinguishable from outside,
          // so the endpoint cannot be used to enumerate live codes.
          throw new ApiError(400, '兑换码无效或已使用。')
        }
        const code = normalizeCode(rawCode)
        if (!CODE_SHAPE.test(code)) return fail()
        const record = await backend.getCode(codeHashFor(code))
        if (!record || record.redeemedBy) return fail()
        const product = productById(record.productId)
        if (!product) return fail()
        const next = applyGrant({ ...current, failedRedeems: [] }, product, nowMs)
        await backend.putCode(codeHashFor(code), { ...record, redeemedBy: uid, redeemedAt: now().toISOString() })
        await writeEntitlements(uid, next)
        return {
          product: { id: product.id, kind: product.kind, name: product.name },
          entitlements: next,
        }
      })
    },

    async mintCodes(identity, body) {
      if (!isOfficialUid(identity?.uid)) throw new ApiError(403, '只有织界官方可以生成兑换码。')
      if (!backend) throw new ApiError(503, '会员服务尚未配置。')
      const product = productById(typeof body?.productId === 'string' ? body.productId : '')
      if (!product) throw new ApiError(400, '请选择要生成的商品。')
      const total = Number.isInteger(body?.count) ? body.count : 0
      if (total < 1 || total > MINT_MAX_COUNT) throw new ApiError(400, `一次生成 1–${MINT_MAX_COUNT} 个兑换码。`)
      const batchId = `batch-${randomUUID()}`
      const codes = []
      for (let index = 0; index < total; index += 1) {
        const code = generateCode()
        await backend.putCode(codeHashFor(code), {
          productId: product.id, kind: product.kind, batchId,
          createdBy: identity.uid, createdAt: now().toISOString(),
          redeemedBy: null, redeemedAt: null,
        })
        codes.push(code)
      }
      return { batchId, product: { id: product.id, kind: product.kind, name: product.name }, codes }
    },

    // --- stripe fulfilment idempotency (state owned here, stripe.js drives) ---
    async stripeEventSeen(sessionId) {
      if (!backend || typeof sessionId !== 'string' || !sessionId) return false
      try { return Boolean(await backend.getStripeEvent(sessionId)) } catch { return false }
    },
    async recordStripeEvent(sessionId, detail) {
      if (!backend || typeof sessionId !== 'string' || !sessionId) return false
      try {
        await backend.putStripeEvent(sessionId, { id: sessionId, ...detail, processedAt: now().toISOString() })
        return true
      } catch {
        log('billing: stripe event recording failed')
        return false
      }
    },

    /** The member page payload: my state + the catalog + the ceilings. */
    async publicState(uid, { stripeEnabled = false } = {}) {
      // Opening the member page is a daily activity: the free top-up
      // lands here (and at the generate gate), once per day.
      const entitlements = typeof uid === 'string' && uid
        ? await applyDailyCoinTopUp(uid)
        : await readEntitlements(uid)
      return {
        available: backend !== null && backend !== undefined,
        member: {
          active: memberActiveFor(entitlements, now().getTime()),
          until: entitlements.memberUntil,
        },
        chapterCredits: entitlements.chapterCredits,
        imageCredits: entitlements.imageCredits,
        coins: entitlements.coins,
        coin: {
          name: COIN.name,
          tokensPerCoin: COIN.tokensPerCoin,
          imageCoinCost: COIN.imageCoinCost,
          fusionMultiplier: COIN.fusionMultiplier,
          fusionMemberMultiplier: COIN.fusionMemberMultiplier,
          dailyTopUp: memberActiveFor(entitlements, now().getTime()) ? COIN.dailyTopUpMember : COIN.dailyTopUpFree,
        },
        memberDailyTokenCap: memberCap,
        products: PRODUCTS.map((product) => ({
          id: product.id, kind: product.kind, name: product.name, priceCny: product.priceCny,
          memberDays: product.memberDays, chapterCredits: product.chapterCredits,
          imageCredits: product.imageCredits, coins: product.coins, featured: Boolean(product.featured),
        })),
        stripeEnabled: Boolean(stripeEnabled),
      }
    },

    /** Raw records for the internal summary script. */
    async listCostRecords() {
      if (!backend) return []
      return backend.listCostRecords()
    },
  }
}
