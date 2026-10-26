import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ZERO_USAGE, createMemoryUsageStore, createUsageService, dailyTokenCap, dayKeyFor, usageDelta,
} from '../server/usage.js'

test('usageDelta keeps provider counts, derives a missing total and floors values', () => {
  assert.deepEqual(usageDelta({ prompt: 100.9, candidates: 50, thoughts: 10, cached: 30, total: 190 }), { prompt: 100, candidates: 50, thoughts: 10, cached: 30, total: 190 })
  assert.deepEqual(usageDelta({ prompt: 10, candidates: 5, thoughts: 2 }), { prompt: 10, candidates: 5, thoughts: 2, cached: 0, total: 17 })
})

test('usageDelta treats unknown usage and junk fields as zero tokens', () => {
  const zeros = { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0 }
  assert.deepEqual(usageDelta('unknown'), zeros)
  assert.deepEqual(usageDelta(undefined), zeros)
  assert.deepEqual(usageDelta({ prompt: -5, candidates: Number.NaN, thoughts: 'many', total: null }), zeros)
})

test('day keys are UTC calendar days and the cap has a sane default', () => {
  assert.equal(dayKeyFor(new Date('2026-10-26T23:30:00Z')), '2026-10-26')
  assert.equal(dailyTokenCap({}), 1_000_000)
  assert.equal(dailyTokenCap({ GENERATION_DAILY_TOKEN_CAP: '250000' }), 250_000)
  assert.equal(dailyTokenCap({ GENERATION_DAILY_TOKEN_CAP: '0' }), 1_000_000)
  assert.equal(dailyTokenCap({ GENERATION_DAILY_TOKEN_CAP: 'lots' }), 1_000_000)
})

test('usage service accumulates totals and daily counts per user', async () => {
  const service = createUsageService({ env: {}, store: createMemoryUsageStore() })
  assert.equal(service.available, true)
  assert.equal(await service.record('user-1', { prompt: 100, candidates: 50, thoughts: 10, cached: 0, total: 160 }), true)
  assert.equal(await service.record('user-1', 'unknown'), true)
  assert.equal(await service.record('user-2', { prompt: 7, total: 7 }), true)
  const totals = await service.totals('user-1')
  assert.equal(totals.prompt, 100)
  assert.equal(totals.candidates, 50)
  assert.equal(totals.thoughts, 10)
  assert.equal(totals.total, 160)
  assert.equal(totals.generations, 2)
  assert.equal(typeof totals.updatedAt, 'string')
  assert.equal(await service.dailyTotal('user-1'), 160)
  assert.equal(await service.dailyTotal('user-2'), 7)
  assert.deepEqual(await service.totals('nobody'), { ...ZERO_USAGE })
  assert.equal(await service.dailyTotal('nobody'), 0)
})

test('usage service fails open: no store and broken store never block or fabricate', async () => {
  const noStore = createUsageService({ env: {}, store: null, log: () => {} })
  assert.equal(noStore.available, false)
  assert.equal(await noStore.record('user-1', { total: 10 }), false)
  assert.deepEqual(await noStore.totals('user-1'), { ...ZERO_USAGE })
  assert.equal(await noStore.dailyTotal('user-1'), null)

  const broken = {
    addUsage: async () => { throw new Error('store exploded') },
    getTotals: async () => { throw new Error('store exploded') },
    getDaily: async () => { throw new Error('store exploded') },
  }
  const failing = createUsageService({ env: {}, store: broken, log: () => {} })
  assert.equal(await failing.record('user-1', { total: 10 }), false)
  assert.deepEqual(await failing.totals('user-1'), { ...ZERO_USAGE })
  assert.equal(await failing.dailyTotal('user-1'), null)
})
