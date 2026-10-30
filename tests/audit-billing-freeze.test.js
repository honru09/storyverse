import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FALLBACK_TEXT_TOKENS, TEXT_TOKEN_FREEZE_ANCHOR, coinFreezeForText,
  createBillingService, createMemoryBillingStore, meteredTextCost, textCostCny,
} from '../server/billing.js'

/**
 * REQ-69 audit cluster B (tasks 2+3): the pre-authorisation freeze
 * API the generate gate settles against, and the conservative
 * fallback metering for generations whose provider reports no usage.
 * Contract (fixed; server/index.js wires against these names):
 *   availableCoins(uid) / hasCoins(uid, min) — judged on available
 *   reserveCoins(uid, amount) → { id, amount, expiresAt } | null
 *   settleReservation(uid, id, actual) → { spent, covered }
 *   releaseReservation(uid, id) — idempotent
 *   coinFreezeForText({ scene, merged }) → coins to freeze
 */

async function seedCoins(store, uid, coins) {
  await store.putEntitlement(uid, {
    uid, memberUntil: null, chapterCredits: 0, imageCredits: 0,
    coins, coinGrantDay: null, failedRedeems: [],
  })
}

function makeBilling(store, options = {}) {
  return createBillingService({ env: {}, store, log: () => {}, ...options })
}

test('a freeze reduces the available balance and hasCoins judges on available', async () => {
  const store = createMemoryBillingStore()
  const billing = makeBilling(store)
  await seedCoins(store, 'username:holder', 30)

  assert.equal(await billing.availableCoins('username:holder'), 30)
  const hold = await billing.reserveCoins('username:holder', 26)
  assert.ok(hold?.id, 'a hold id is returned')
  assert.equal(hold.amount, 26)
  assert.ok(Date.parse(hold.expiresAt) > Date.now(), 'the hold carries a future expiry')

  assert.equal((await billing.entitlements('username:holder')).coins, 30, 'the balance itself is untouched until settlement')
  assert.equal(await billing.availableCoins('username:holder'), 4, 'available = balance − live holds')
  assert.equal(await billing.hasCoins('username:holder', 10), false, 'hasCoins no longer sees through the freeze')
  assert.equal(await billing.hasCoins('username:holder', 4), true)
  assert.equal(await billing.reserveCoins('username:holder', 5), null, 'a second freeze beyond available is refused')
})

test('two instances racing reserves cannot freeze more than the balance holds', async () => {
  const store = createMemoryBillingStore()
  const a = makeBilling(store)
  const b = makeBilling(store)
  await seedCoins(store, 'username:race', 30)

  const results = await Promise.all([
    a.reserveCoins('username:race', 26),
    b.reserveCoins('username:race', 26),
  ])
  assert.equal(results.filter(Boolean).length, 1, 'the balance only covers one 26-coin freeze')
  assert.equal(await a.availableCoins('username:race'), 4)
})

test('settlement charges the actual amount and releases the difference', async () => {
  const store = createMemoryBillingStore()
  const billing = makeBilling(store)
  await seedCoins(store, 'username:settler', 100)

  const hold = await billing.reserveCoins('username:settler', 26)
  const settled = await billing.settleReservation('username:settler', hold.id, 14)
  assert.deepEqual(settled, { spent: 14, covered: true })
  assert.equal((await billing.entitlements('username:settler')).coins, 86)
  assert.equal(await billing.availableCoins('username:settler'), 86, 'the unspent part of the freeze is spendable again')
})

test('settlement above the freeze draws on the remaining balance; shortfall reports covered=false', async () => {
  const store = createMemoryBillingStore()
  const billing = makeBilling(store)
  await seedCoins(store, 'username:rich', 100)
  const richHold = await billing.reserveCoins('username:rich', 26)
  assert.deepEqual(
    await billing.settleReservation('username:rich', richHold.id, 40),
    { spent: 40, covered: true },
    'the extra 14 comes out of the unfrozen balance',
  )
  assert.equal((await billing.entitlements('username:rich')).coins, 60)

  await seedCoins(store, 'username:poor', 50)
  const poorHold = await billing.reserveCoins('username:poor', 26)
  assert.deepEqual(
    await billing.settleReservation('username:poor', poorHold.id, 60),
    { spent: 50, covered: false },
    'everything drawable is drawn, and the caller is told it does not cover the bill',
  )
  assert.equal((await billing.entitlements('username:poor')).coins, 0)
})

test('settling a missing hold settles nothing; release is idempotent', async () => {
  const store = createMemoryBillingStore()
  const billing = makeBilling(store)
  await seedCoins(store, 'username:releaser', 30)

  assert.deepEqual(await billing.settleReservation('username:releaser', 'no-such-hold', 10), { spent: 0, covered: false })
  assert.equal((await billing.entitlements('username:releaser')).coins, 30)

  const hold = await billing.reserveCoins('username:releaser', 26)
  assert.equal(await billing.availableCoins('username:releaser'), 4)
  assert.equal(await billing.releaseReservation('username:releaser', hold.id), true)
  assert.equal(await billing.availableCoins('username:releaser'), 30, 'release restores the full available balance')
  assert.equal(await billing.releaseReservation('username:releaser', hold.id), false, 'a second release is a no-op, not an error')
  assert.equal((await billing.entitlements('username:releaser')).coins, 30, 'release never charges')
})

test('expired holds stop counting and can no longer be settled', async () => {
  const store = createMemoryBillingStore()
  let clock = new Date('2026-10-31T01:00:00.000Z')
  const billing = makeBilling(store, { now: () => clock })
  await seedCoins(store, 'username:expiry', 30)

  const hold = await billing.reserveCoins('username:expiry', 26)
  assert.equal(await billing.availableCoins('username:expiry'), 4)

  clock = new Date(clock.getTime() + 16 * 60_000) // past the 15-minute TTL
  assert.equal(await billing.availableCoins('username:expiry'), 30, 'an expired freeze frees its coins')
  assert.deepEqual(
    await billing.settleReservation('username:expiry', hold.id, 10),
    { spent: 0, covered: false },
    'settling an expired hold delivers nothing — the caller must not deliver either',
  )
  assert.equal((await billing.entitlements('username:expiry')).coins, 30)
  assert.ok(await billing.reserveCoins('username:expiry', 26), 'a fresh freeze can be taken after expiry')
})

test('a freeze survives a restart-equivalent: a new service instance on the same store honours it', async () => {
  const store = createMemoryBillingStore()
  const before = makeBilling(store)
  await seedCoins(store, 'username:durable', 50)
  const hold = await before.reserveCoins('username:durable', 26)

  const after = makeBilling(store) // a "restarted" process over the same store
  assert.equal(await after.availableCoins('username:durable'), 24, 'the new instance sees the outstanding freeze')
  assert.deepEqual(await after.settleReservation('username:durable', hold.id, 20), { spent: 20, covered: true })
  assert.equal((await after.entitlements('username:durable')).coins, 30)
})

test('legacy entitlement records without a coinHolds field read cleanly', async () => {
  const store = createMemoryBillingStore()
  const billing = makeBilling(store)
  await seedCoins(store, 'username:legacy', 42) // seed carries no coinHolds field
  assert.equal(await billing.availableCoins('username:legacy'), 42)
  assert.deepEqual((await billing.entitlements('username:legacy')).coinHolds, [])
})

test('the freeze anchor prices a chapter above its measured worst case, fusion at the full rate', () => {
  assert.equal(TEXT_TOKEN_FREEZE_ANCHOR, 26_000)
  assert.equal(coinFreezeForText({ scene: 'chapter' }), 26, 'an ordinary chapter freezes 26 coins (measured ceiling ≈22)')
  assert.equal(coinFreezeForText({ scene: 'fusion' }), 39, 'fusion freezes at ×1.5')
  assert.equal(coinFreezeForText({ scene: 'intervention', merged: true }), 39, 'a merged line freezes at the fusion rate whatever the scene label')
  const billing = makeBilling(createMemoryBillingStore())
  assert.equal(billing.coinFreezeForText({ scene: 'chapter' }), 26, 'the service exposes the same helper')
})

test('missing or partial provider usage bills a conservative estimate, never zero', () => {
  for (const bad of ['unknown', null, undefined, { totalTokenCount: 0 }, { total: 0 }, { promptTokenCount: 5_000 }]) {
    const metered = meteredTextCost('gemini-3.8-flash', bad)
    assert.equal(metered.estimated, true, `usage ${JSON.stringify(bad)} is estimated`)
    assert.equal(metered.totalTokens, FALLBACK_TEXT_TOKENS)
    assert.ok(metered.costCny > 0, 'an unreported chapter still costs something')
    assert.ok(metered.inputTokens > 0 && metered.outputTokens > 0, 'the estimate is split across input and output')
  }
})

test('complete provider usage passes through meteredTextCost value for value', () => {
  const usage = { promptTokenCount: 600, candidatesTokenCount: 300, thoughtsTokenCount: 100, totalTokenCount: 1000 }
  const metered = meteredTextCost('gemini-3.8-flash', usage)
  assert.deepEqual(metered, { ...textCostCny('gemini-3.8-flash', usage), estimated: false })
  const shortForm = { prompt: 600, candidates: 300, thoughts: 100, total: 1000 }
  assert.deepEqual(
    meteredTextCost('gemini-3.8-flash', shortForm),
    { ...textCostCny('gemini-3.8-flash', shortForm), estimated: false },
    'the internal short field shape is honoured too',
  )
})
