import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for avatars: one record per account holding the avatar
 * collection (up to AVATAR_LIMIT profiles, one of them the main avatar),
 * portrait paintings in their own records, and per-account daily
 * generation counts.
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

/**
 * The collection view of a stored record. Records written before the
 * multi-avatar batch hold a single profile under `avatar`; that profile
 * becomes the collection's main avatar with no rewrite — the migration
 * is this read, and the next collection write persists the new shape.
 * New writes are dual-shape: `avatars` + `mainId` carry the collection,
 * and `avatar` mirrors the main profile so every pre-collection reader
 * (plaza author blocks, profile resolution) keeps working untouched.
 */
export function collectionFromRecord(record) {
  if (!record || typeof record !== 'object') return null
  if (Array.isArray(record.avatars)) {
    const avatars = record.avatars.filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
    if (avatars.length === 0) return { mainId: null, avatars: [] }
    const mainId = avatars.some((item) => item.id === record.mainId) ? record.mainId : avatars[0].id
    return { mainId, avatars }
  }
  if (record.avatar && typeof record.avatar === 'object' && typeof record.avatar.id === 'string') {
    return { mainId: record.avatar.id, avatars: [record.avatar] }
  }
  return null
}

/** The main avatar profile of a stored record (legacy shape included). */
export function mainAvatarFromRecord(record) {
  const collection = collectionFromRecord(record)
  if (!collection || collection.avatars.length === 0) return null
  return collection.avatars.find((item) => item.id === collection.mainId) || collection.avatars[0]
}

/**
 * Where an avatar's paintings live. The main avatar keeps the historic
 * slots ('current' / 'previous') so the public picture endpoints that
 * read them directly never move; every other avatar gets its own slots.
 * Setting a new main swaps the stored paintings between the two slot
 * pairs (see the avatar service), so this rule never changes.
 */
export function imageSlotFor(collection, avatarId, which = 'current') {
  const slot = which === 'previous' ? 'previous' : 'current'
  if (!collection || !avatarId || avatarId === collection.mainId) return slot
  return `${avatarId}:${slot}`
}

const collectionRecord = (uid, collection) => {
  const avatars = Array.isArray(collection?.avatars) ? collection.avatars : []
  const mainId = avatars.some((item) => item?.id === collection?.mainId)
    ? collection.mainId
    : (avatars[0]?.id ?? null)
  const main = avatars.find((item) => item.id === mainId) || null
  return { uid, avatar: main, mainId, avatars }
}

export function createMemoryAvatarStore() {
  const profiles = new Map()
  const images = new Map()
  const daily = new Map()
  return {
    kind: 'memory',
    async getProfile(uid) { return profiles.get(avatarKeyFor(uid)) ?? null },
    async putProfile(uid, record) { profiles.set(avatarKeyFor(uid), { ...record }) },
    async getCollection(uid) { return collectionFromRecord(profiles.get(avatarKeyFor(uid)) ?? null) },
    async putCollection(uid, collection) { profiles.set(avatarKeyFor(uid), collectionRecord(uid, collection)) },
    async getImage(uid, slot) { return images.get(avatarImageKeyFor(uid, slot)) ?? null },
    async putImage(uid, slot, record) { images.set(avatarImageKeyFor(uid, slot), { ...record }) },
    async deleteImage(uid, slot) { images.delete(avatarImageKeyFor(uid, slot)) },
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
    async getCollection(uid) { return collectionFromRecord(await read('avatars', avatarKeyFor(uid))) },
    async putCollection(uid, collection) {
      await (await db()).collection('avatars').doc(avatarKeyFor(uid)).set(collectionRecord(uid, collection))
    },
    getImage: (uid, slot) => read('avatar_images', avatarImageKeyFor(uid, slot)),
    async putImage(uid, slot, record) {
      await (await db()).collection('avatar_images').doc(avatarImageKeyFor(uid, slot)).set({ ...record })
    },
    async deleteImage(uid, slot) {
      await (await db()).collection('avatar_images').doc(avatarImageKeyFor(uid, slot)).delete()
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
