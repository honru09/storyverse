import test from 'node:test'
import assert from 'node:assert/strict'
import {
  codeHashFor, createBillingService, createMemoryBillingStore,
} from '../server/billing.js'

/**
 * REQ-69 audit cluster B (task 1): redemption and entitlement writes
 * must be atomic across accounts AND across service instances sharing
 * one store (the multi-instance Firestore reality). The pre-fix code
 * serialised per (service, uid) only and read-modify-wrote whole
 * records unconditionally, so two different uids could redeem the
 * same code twice and two instances could overwrite each other's
 * balance changes.
 */

const CODE = 'ZJ-AAAAA-AAAAA-AAAAA'

function makeServices(store, options = {}) {
  const shared = { env: {}, store, log: () => {}, ...options }
  return [createBillingService(shared), createBillingService(shared)]
}

async function seedEntitlement(store, uid, overrides = {}) {
  await store.putEntitlement(uid, {
    uid, memberUntil: null, chapterCredits: 0, imageCredits: 0,
    coins: 0, coinGrantDay: null, failedRedeems: [], ...overrides,
  })
}

async function seedCode(store, productId = 'pack-6') {
  await store.putCode(codeHashFor(CODE), {
    productId, kind: 'quota', batchId: 'batch-audit',
    createdBy: 'username:storyweave', createdAt: '2026-10-31T00:00:00.000Z',
    redeemedBy: null, redeemedAt: null,
  })
}

test('two different accounts racing one code: exactly one wins, one grant total', async () => {
  const store = createMemoryBillingStore()
  const [billing] = makeServices(store)
  await seedEntitlement(store, 'username:racer-a')
  await seedEntitlement(store, 'username:racer-b')
  await seedCode(store)

  const results = await Promise.allSettled([
    billing.redeem('username:racer-a', CODE),
    billing.redeem('username:racer-b', CODE),
  ])
  const won = results.filter((r) => r.status === 'fulfilled')
  const lost = results.filter((r) => r.status === 'rejected')
  assert.equal(won.length, 1, 'exactly one redemption succeeds')
  assert.equal(lost.length, 1, 'exactly one redemption is refused')
  assert.equal(lost[0].reason.status, 400)
  // Indistinguishable from an unknown code — no enumeration oracle.
  assert.equal(lost[0].reason.message, '兑换码无效或已使用。')

  const winnerUid = results[0].status === 'fulfilled' ? 'username:racer-a' : 'username:racer-b'
  const loserUid = winnerUid === 'username:racer-a' ? 'username:racer-b' : 'username:racer-a'
  assert.equal((await billing.entitlements(winnerUid)).coins, 300, 'pack-6 granted exactly once')
  assert.equal((await billing.entitlements(loserUid)).coins, 0, 'the loser received nothing')
  assert.equal((await billing.entitlements(loserUid)).failedRedeems.length, 1, 'the refusal still counts as a failed attempt')
  const stored = await store.getCode(codeHashFor(CODE))
  assert.equal(stored.redeemedBy, winnerUid)
})

test('concurrent spends on one balance never go negative and conserve the total', async () => {
  const store = createMemoryBillingStore()
  const [billing] = makeServices(store)
  await seedEntitlement(store, 'username:spender', { coins: 100 })

  const spent = await Promise.all([
    billing.spendCoins('username:spender', 60),
    billing.spendCoins('username:spender', 60),
  ])
  const final = await billing.entitlements('username:spender')
  assert.ok(final.coins >= 0, 'balance never goes negative')
  assert.equal(spent[0] + spent[1] + final.coins, 100, 'spent + remaining = starting balance (nothing lost, nothing invented)')
})

test('two service instances sharing one store cannot overwrite each other\'s spends', async () => {
  const store = createMemoryBillingStore()
  const [instanceA, instanceB] = makeServices(store)
  await seedEntitlement(store, 'username:shared', { coins: 100 })

  const spent = await Promise.all([
    instanceA.spendCoins('username:shared', 60),
    instanceB.spendCoins('username:shared', 60),
  ])
  const final = await instanceA.entitlements('username:shared')
  assert.ok(final.coins >= 0)
  assert.equal(spent[0] + spent[1] + final.coins, 100, 'cross-instance spends conserve the total')
})

test('concurrent daily top-up and spend across instances lose neither', async () => {
  const store = createMemoryBillingStore()
  const clock = new Date('2026-10-31T01:00:00.000Z')
  const [instanceA, instanceB] = makeServices(store, { now: () => clock })
  // 200 coins sit above the free ceiling (150), so the top-up only
  // stamps the day; the spend must still land, and the stamp must
  // survive — either serial order ends at 170 with today stamped.
  await seedEntitlement(store, 'username:crosser', { coins: 200 })

  await Promise.all([
    instanceA.applyDailyCoinTopUp('username:crosser'),
    instanceB.spendCoins('username:crosser', 30),
  ])
  const final = await instanceA.entitlements('username:crosser')
  assert.equal(final.coins, 170, 'the spend was not overwritten by the top-up write')
  assert.equal(final.coinGrantDay, '2026-10-31', 'the top-up stamp was not overwritten by the spend write')
})

test('concurrent chapter-credit consumes across instances burn exactly the held credits', async () => {
  const store = createMemoryBillingStore()
  const [instanceA, instanceB] = makeServices(store)
  await seedEntitlement(store, 'username:credits', { chapterCredits: 1 })

  const results = await Promise.all([
    instanceA.consumeChapterCredit('username:credits'),
    instanceB.consumeChapterCredit('username:credits'),
  ])
  assert.equal(results.filter(Boolean).length, 1, 'one held credit pays for exactly one chapter')
  assert.equal((await instanceA.entitlements('username:credits')).chapterCredits, 0)
})

test('concurrent grants across instances both land', async () => {
  const store = createMemoryBillingStore()
  const [instanceA, instanceB] = makeServices(store)
  await seedEntitlement(store, 'username:grantee', { coins: 10 })

  await Promise.all([
    instanceA.grantProduct('username:grantee', 'pack-6', 'test-a'),
    instanceB.grantProduct('username:grantee', 'pack-6', 'test-b'),
  ])
  assert.equal((await instanceA.entitlements('username:grantee')).coins, 610, 'both 300-coin grants landed on the 10-coin base')
})
