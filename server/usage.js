import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

export const ZERO_USAGE = Object.freeze({ prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0, generations: 0, updatedAt: null })
const TOKEN_FIELDS = ['prompt', 'candidates', 'thoughts', 'cached', 'total']
export const DEFAULT_DAILY_TOKEN_CAP = 1_000_000

/** Quota days are UTC calendar days; the reset happens at 08:00 CST / 09:00 JST. */
export function dayKeyFor(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function dailyTokenCap(env = {}) {
  const parsed = Number(env.GENERATION_DAILY_TOKEN_CAP)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_TOKEN_CAP
}

const count = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

// The generation backend reports provider-shaped metadata (Vertex /
// @google/genai: promptTokenCount, candidatesTokenCount, ...), while the
// ledger vocabulary is the short form (prompt, candidates, ...). Both
// shapes are accepted here; the long form is what production sends, the
// short form is what internal callers and fixtures use. (Before this map
// existed, every real generation's tokens were read as zero and only the
// generation counter moved.)
const PROVIDER_FIELD_MAP = {
  prompt: 'promptTokenCount',
  candidates: 'candidatesTokenCount',
  thoughts: 'thoughtsTokenCount',
  cached: 'cachedContentTokenCount',
  total: 'totalTokenCount',
}

/** Token delta for one generation. 'unknown' usage counts the generation only. */
export function usageDelta(usage) {
  const delta = { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0 }
  if (!usage || typeof usage !== 'object') return delta
  for (const field of TOKEN_FIELDS) delta[field] = count(usage[field]) || count(usage[PROVIDER_FIELD_MAP[field]])
  if (!delta.total) delta.total = delta.prompt + delta.candidates + delta.thoughts
  return delta
}

export function normalizeUsage(value) {
  const result = { ...ZERO_USAGE }
  if (!value || typeof value !== 'object') return result
  for (const field of TOKEN_FIELDS) result[field] = count(value[field])
  result.generations = count(value.generations)
  result.updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : null
  return result
}

export function createMemoryUsageStore() {
  const totals = new Map()
  const daily = new Map()
  const apply = (map, key, extra, delta) => {
    const current = map.get(key) || { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0, generations: 0, updatedAt: null }
    for (const field of TOKEN_FIELDS) current[field] += delta[field]
    current.generations += 1
    current.updatedAt = new Date().toISOString()
    map.set(key, { ...current, ...extra })
  }
  return {
    kind: 'memory',
    async addUsage(uid, day, delta) {
      apply(totals, uid, {}, delta)
      apply(daily, `${uid}_${day}`, { uid, day }, delta)
    },
    async getTotals(uid) { return totals.get(uid) ?? null },
    async getDaily(uid, day) { return daily.get(`${uid}_${day}`) ?? null },
  }
}

export function createFirestoreUsageStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const read = async (collection, key) => {
    const snapshot = await (await db()).collection(collection).doc(key).get()
    return snapshot.exists ? snapshot.data() : null
  }
  return {
    kind: 'firestore',
    async addUsage(uid, day, delta) {
      const database = await db()
      const { FieldValue } = await import('firebase-admin/firestore')
      const update = { generations: FieldValue.increment(1), updatedAt: new Date().toISOString() }
      for (const field of TOKEN_FIELDS) if (delta[field] > 0) update[field] = FieldValue.increment(delta[field])
      const batch = database.batch()
      batch.set(database.collection('usage_totals').doc(uid), update, { merge: true })
      batch.set(database.collection('usage_daily').doc(`${uid}_${day}`), { uid, day, ...update }, { merge: true })
      await batch.commit()
    },
    getTotals: (uid) => read('usage_totals', uid),
    getDaily: (uid, day) => read('usage_daily', `${uid}_${day}`),
  }
}

export function createUsageStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryUsageStore()
  return createFirestoreUsageStore(db ? async () => db : () => loadFirestore(env))
}

/**
 * Fail-open usage accounting: recording or quota reads that hit a store
 * outage never block generation and never fabricate numbers. `dailyTotal`
 * returns null when the store cannot answer, which the caller treats as
 * "no quota information" and lets the request through.
 */
export function createUsageService({ env = process.env, store, log = (message) => process.stderr.write(`${message}\n`) } = {}) {
  const backend = store === undefined ? createUsageStore({ env }) : store
  return {
    available: backend !== null && backend !== undefined,
    async record(uid, usage) {
      if (!backend || typeof uid !== 'string' || !uid) return false
      try {
        await backend.addUsage(uid, dayKeyFor(), usageDelta(usage))
        return true
      } catch {
        log('usage: recording failed; generation result unaffected')
        return false
      }
    },
    async totals(uid) {
      if (!backend || typeof uid !== 'string' || !uid) return { ...ZERO_USAGE }
      try {
        return normalizeUsage(await backend.getTotals(uid))
      } catch {
        log('usage: totals read failed; reporting zeroes')
        return { ...ZERO_USAGE }
      }
    },
    async dailyTotal(uid) {
      if (!backend || typeof uid !== 'string' || !uid) return null
      try {
        const daily = await backend.getDaily(uid, dayKeyFor())
        return daily ? count(daily.total) : 0
      } catch {
        log('usage: daily read failed; quota check skipped')
        return null
      }
    },
  }
}
