import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for email login codes, site sessions and username accounts.
 * Code and session records are keyed by hashes (of the normalised email /
 * of the session token), never by the raw email or token, so a store leak
 * exposes neither credentials nor addresses. Username records are keyed by
 * the normalised username itself — a public identifier, shown as the
 * display name — and hold only a salted password hash. Every method is
 * async; the memory implementation exists for tests and explicitly-
 * configured local development only.
 */
export function createMemoryIdentityStore() {
  const codes = new Map()
  const sessions = new Map()
  const users = new Map()
  return {
    kind: 'memory',
    async getCode(key) { return codes.get(key) ?? null },
    async putCode(key, record) { codes.set(key, record) },
    async deleteCode(key) { codes.delete(key) },
    async getSession(key) { return sessions.get(key) ?? null },
    async putSession(key, record) { sessions.set(key, record) },
    async deleteSession(key) { sessions.delete(key) },
    async getUser(key) { return users.get(key) ?? null },
    async putUser(key, record) { users.set(key, record) },
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
    getUser: (key) => read('site_users', key),
    async putUser(key, record) { await (await db()).collection('site_users').doc(key).set(record) },
  }
}

export function createIdentityStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryIdentityStore()
  return createFirestoreIdentityStore(db ? async () => db : () => loadFirestore(env))
}
