import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for email login codes and site sessions. Records are keyed by
 * hashes (of the normalised email / of the session token), never by the raw
 * email or token, so a store leak exposes neither credentials nor addresses.
 * Every method is async; the memory implementation exists for tests and
 * explicitly-configured local development only.
 */
export function createMemoryIdentityStore() {
  const codes = new Map()
  const sessions = new Map()
  return {
    kind: 'memory',
    async getCode(key) { return codes.get(key) ?? null },
    async putCode(key, record) { codes.set(key, record) },
    async deleteCode(key) { codes.delete(key) },
    async getSession(key) { return sessions.get(key) ?? null },
    async putSession(key, record) { sessions.set(key, record) },
    async deleteSession(key) { sessions.delete(key) },
  }
}

export function createFirestoreIdentityStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const read = async (collection, key) => {
    const snapshot = await (await db()).collection(collection).doc(key).get()
    return snapshot.exists ? snapshot.data() : null
  }
  return {
    kind: 'firestore',
    getCode: (key) => read('email_login_codes', key),
    async putCode(key, record) { await (await db()).collection('email_login_codes').doc(key).set(record) },
    async deleteCode(key) { await (await db()).collection('email_login_codes').doc(key).delete() },
    getSession: (key) => read('site_sessions', key),
    async putSession(key, record) { await (await db()).collection('site_sessions').doc(key).set(record) },
    async deleteSession(key) { await (await db()).collection('site_sessions').doc(key).delete() },
  }
}

export function createIdentityStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryIdentityStore()
  return createFirestoreIdentityStore(db ? async () => db : () => loadFirestore(env))
}
