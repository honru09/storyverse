import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for avatars: one profile record per account, portrait
 * paintings in their own records, and per-account daily generation counts.
 *
 * Keys are hashes of the uid (plus the image slot), so no account id ever
 * needs to be a valid document id and listings never expose whose avatar a
 * record holds. Images are stored one per record — the transcode step
 * guarantees ≤200 KB (≈267 KB base64), which fits a single document
 * comfortably — so the profile document itself stays small and carries no
 * image bytes at all.
 */
export const avatarKeyFor = (uid) => createHash('sha256').update(`avatar\n${uid}`).digest('hex')
export const avatarImageKeyFor = (uid, slot) =>
  createHash('sha256').update(`avatar-image\n${uid}\n${slot}`).digest('hex')

export function createMemoryAvatarStore() {
  const profiles = new Map()
  const images = new Map()
  const daily = new Map()
  return {
    kind: 'memory',
    async getProfile(uid) { return profiles.get(avatarKeyFor(uid)) ?? null },
    async putProfile(uid, record) { profiles.set(avatarKeyFor(uid), { ...record }) },
    async getImage(uid, slot) { return images.get(avatarImageKeyFor(uid, slot)) ?? null },
    async putImage(uid, slot, record) { images.set(avatarImageKeyFor(uid, slot), { ...record }) },
    async getDailyCount(uid, day) { return daily.get(`${uid}_${day}`)?.count ?? 0 },
    async incrementDaily(uid, day) {
      const key = `${uid}_${day}`
      const next = (daily.get(key)?.count ?? 0) + 1
      daily.set(key, { uid, day, count: next })
      return next
    },
  }
}

export function createFirestoreAvatarStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const read = async (collection, key) => {
    const snapshot = await (await db()).collection(collection).doc(key).get()
    return snapshot.exists ? snapshot.data() : null
  }
  return {
    kind: 'firestore',
    getProfile: (uid) => read('avatars', avatarKeyFor(uid)),
    async putProfile(uid, record) {
      await (await db()).collection('avatars').doc(avatarKeyFor(uid)).set({ ...record })
    },
    getImage: (uid, slot) => read('avatar_images', avatarImageKeyFor(uid, slot)),
    async putImage(uid, slot, record) {
      await (await db()).collection('avatar_images').doc(avatarImageKeyFor(uid, slot)).set({ ...record })
    },
    async getDailyCount(uid, day) {
      const data = await read('avatar_daily', `${uid}_${day}`)
      const count = data?.count
      return Number.isInteger(count) && count > 0 ? count : 0
    },
    async incrementDaily(uid, day) {
      const database = await db()
      const { FieldValue } = await import('firebase-admin/firestore')
      const ref = database.collection('avatar_daily').doc(`${uid}_${day}`)
      await ref.set({ uid, day, count: FieldValue.increment(1) }, { merge: true })
      const snapshot = await ref.get()
      const count = snapshot.data()?.count
      return Number.isInteger(count) ? count : 0
    },
  }
}

export function createAvatarStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryAvatarStore()
  return createFirestoreAvatarStore(db ? async () => db : () => loadFirestore(env))
}
