import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for the generation delivery registry (REQ-69): one
 * record per settled chapter delivery, keyed by the delivery key the
 * generate route derives from (uid, storyId, chapterIndex, request
 * fingerprint). A replay of the same request is answered from this
 * registry instead of generating — and charging — a second time, and
 * unlike the generator's in-process cache the registry survives
 * restarts and is shared across instances.
 *
 * Records hold the delivered result plus the settlement facts
 * ({ result, uid, storyId, chapterIndex, settledCoins, at }); no
 * request prose beyond the delivered chapter itself is stored, and
 * the key is a SHA-256 digest, so no account id or story text ever
 * becomes a document id.
 */
export function createMemoryDeliveryStore() {
  const deliveries = new Map()
  return {
    kind: 'memory',
    async getDelivery(key) { return deliveries.get(key) ?? null },
    async putDelivery(key, record) { deliveries.set(key, record) },
    async deleteDelivery(key) { deliveries.delete(key) },
  }
}

export function createFirestoreDeliveryStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  return {
    kind: 'firestore',
    async getDelivery(key) {
      const snapshot = await (await db()).collection('generation_deliveries').doc(key).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putDelivery(key, record) { await (await db()).collection('generation_deliveries').doc(key).set(record) },
    async deleteDelivery(key) { await (await db()).collection('generation_deliveries').doc(key).delete() },
  }
}

export function createDeliveryStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryDeliveryStore()
  return createFirestoreDeliveryStore(db ? async () => db : () => loadFirestore(env))
}
