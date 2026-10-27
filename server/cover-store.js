import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for generated book covers and their daily generation counts.
 *
 * A cover belongs to exactly one account and one story: records are keyed
 * by a hash of uid + storyId so neither identifier needs to be a valid
 * document id, and listings of the collection never expose whose shelf a
 * cover sits on. The image itself is stored as base64 JPEG inside the
 * record — the transcode step guarantees ≤200 KB (≈267 KB encoded), which
 * fits a single document comfortably, so no chunking or external bucket
 * is needed. Daily counters are per account and UTC day, incremented only
 * after a cover has actually been produced and stored.
 */
export const coverKeyFor = (uid, storyId) =>
  createHash('sha256').update(`${uid}\n${storyId}`).digest('hex')

export function createMemoryCoverStore() {
  const covers = new Map()
  const daily = new Map()
  return {
    kind: 'memory',
    async getCover(uid, storyId) { return covers.get(coverKeyFor(uid, storyId)) ?? null },
    async putCover(uid, storyId, record) { covers.set(coverKeyFor(uid, storyId), { ...record }) },
    async deleteCover(uid, storyId) { covers.delete(coverKeyFor(uid, storyId)) },
    async getDailyCount(uid, day) { return daily.get(`${uid}_${day}`)?.count ?? 0 },
    async incrementDaily(uid, day) {
      const key = `${uid}_${day}`
      const next = (daily.get(key)?.count ?? 0) + 1
      daily.set(key, { uid, day, count: next })
      return next
    },
  }
}

export function createFirestoreCoverStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  return {
    kind: 'firestore',
    async getCover(uid, storyId) {
      const snapshot = await (await db()).collection('story_covers').doc(coverKeyFor(uid, storyId)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putCover(uid, storyId, record) {
      await (await db()).collection('story_covers').doc(coverKeyFor(uid, storyId)).set({ ...record })
    },
    async deleteCover(uid, storyId) {
      await (await db()).collection('story_covers').doc(coverKeyFor(uid, storyId)).delete()
    },
    async getDailyCount(uid, day) {
      const snapshot = await (await db()).collection('cover_daily').doc(`${uid}_${day}`).get()
      const count = snapshot.exists ? snapshot.data()?.count : 0
      return Number.isInteger(count) && count > 0 ? count : 0
    },
    async incrementDaily(uid, day) {
      const database = await db()
      const { FieldValue } = await import('firebase-admin/firestore')
      const ref = database.collection('cover_daily').doc(`${uid}_${day}`)
      await ref.set({ uid, day, count: FieldValue.increment(1) }, { merge: true })
      const snapshot = await ref.get()
      const count = snapshot.data()?.count
      return Number.isInteger(count) ? count : 0
    },
  }
}

export function createCoverStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryCoverStore()
  return createFirestoreCoverStore(db ? async () => db : () => loadFirestore(env))
}
