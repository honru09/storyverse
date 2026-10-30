import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for book read claims (READ-COUNT, REQ-42): one record
 * per (book, reader, day) triple, keyed by a hash of the triple. The
 * claim record is the dedup fact — a reader opening a shelved book's
 * text counts once per UTC day (the platform's quota-day convention,
 * usage.js dayKeyFor), and the claim existing is what proves the day
 * was already spent. The publication record's readCount is the
 * denormalised total the plaza service increments only when a claim
 * lands; these records are the truth, the total is a cache.
 *
 * claimRead is create-if-absent: it resolves true exactly once per
 * triple and false for every later attempt, so the counting rule
 * survives retries and double-fires without a read-modify-write race
 * on the claim itself. (The total's increment is serialised by the
 * plaza service per publication, like its other counters.)
 */
export const readClaimKeyFor = (bookId, userUid, day) => createHash('sha256').update(`read\n${bookId}\n${userUid}\n${day}`).digest('hex')

const copy = (record) => (record ? { ...record } : null)

export function createMemoryReadCountStore() {
  const claims = new Map()
  return {
    kind: 'memory',
    async getClaim(bookId, userUid, day) { return copy(claims.get(readClaimKeyFor(bookId, userUid, day))) },
    async claimRead(record) {
      const key = readClaimKeyFor(record.bookId, record.userUid, record.day)
      // No await between the check and the set: within one process
      // this pair is atomic, so two concurrent claims cannot both win.
      if (claims.has(key)) return false
      claims.set(key, { ...record })
      return true
    },
  }
}

export function createFirestoreReadCountStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const collection = async () => (await db()).collection('book_read_claims')
  return {
    kind: 'firestore',
    async getClaim(bookId, userUid, day) {
      const snapshot = await (await collection()).doc(readClaimKeyFor(bookId, userUid, day)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async claimRead(record) {
      const ref = (await collection()).doc(readClaimKeyFor(record.bookId, record.userUid, record.day))
      try {
        // create() is Firestore's atomic create-if-absent: it rejects
        // with ALREADY_EXISTS (code 6) when the day was already spent.
        await ref.create({ ...record })
        return true
      } catch (error) {
        if (error?.code === 6 || /already exists/i.test(String(error?.message || ''))) return false
        throw error
      }
    },
  }
}

export function createReadCountStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryReadCountStore()
  return createFirestoreReadCountStore(db ? async () => db : () => loadFirestore(env))
}
