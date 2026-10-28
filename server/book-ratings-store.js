import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for book ratings (RATINGS batch): one record per
 * (book, reader) pair, keyed by a hash of the pair — one rating per
 * reader per book is a storage-level fact, not an application hope,
 * exactly like the feed's likes. A rating is stars (1–5) plus an
 * optional short written review.
 *
 * The record denormalises `bookAuthorUid` and `bookTitle` at write
 * time: the message centre derives its 互动 item ("有人评了你的书")
 * from these records alone, and deleting the rating deletes the
 * record, which retracts the derived item with it — the same
 * discipline the plaza feed's likes/comments follow. The publication
 * record's ratingAverage/ratingCount pair is a denormalised summary
 * the ratings service recomputes from these records on every write;
 * these records are the source of truth.
 */
export const ratingKeyFor = (bookId, userUid) => createHash('sha256').update(`rating\n${bookId}\n${userUid}`).digest('hex')

const copy = (record) => (record ? { ...record } : null)

export function createMemoryBookRatingsStore() {
  const ratings = new Map()
  return {
    kind: 'memory',
    async getRating(bookId, userUid) { return copy(ratings.get(ratingKeyFor(bookId, userUid))) },
    async putRating(record) { ratings.set(ratingKeyFor(record.bookId, record.userUid), { ...record }) },
    async deleteRating(bookId, userUid) { ratings.delete(ratingKeyFor(bookId, userUid)) },
    async listRatingsByBook(bookId) { return [...ratings.values()].filter((record) => record.bookId === bookId).map((record) => ({ ...record })) },
    async listRatingsByBookAuthor(uid) { return [...ratings.values()].filter((record) => record.bookAuthorUid === uid).map((record) => ({ ...record })) },
  }
}

export function createFirestoreBookRatingsStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const collection = async () => (await db()).collection('book_ratings')
  return {
    kind: 'firestore',
    async getRating(bookId, userUid) {
      const snapshot = await (await collection()).doc(ratingKeyFor(bookId, userUid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putRating(record) { await (await collection()).doc(ratingKeyFor(record.bookId, record.userUid)).set({ ...record }) },
    async deleteRating(bookId, userUid) { await (await collection()).doc(ratingKeyFor(bookId, userUid)).delete() },
    async listRatingsByBook(bookId) {
      const snapshot = await (await collection()).where('bookId', '==', bookId).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async listRatingsByBookAuthor(uid) {
      const snapshot = await (await collection()).where('bookAuthorUid', '==', uid).get()
      return snapshot.docs.map((doc) => doc.data())
    },
  }
}

export function createBookRatingsStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryBookRatingsStore()
  return createFirestoreBookRatingsStore(db ? async () => db : () => loadFirestore(env))
}
