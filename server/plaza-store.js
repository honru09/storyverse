import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for plaza publications.
 *
 * One record per publication, keyed by a hash of its public id. The record
 * holds the sanitized public payload plus server-only bookkeeping (the
 * author's uid and the reporter uid list); the service strips the private
 * fields from every response, so what is stored is never what is served
 * verbatim. A publication is a few hundred KB at most (a finished long
 * line's redacted chapters), which fits a single Firestore document the
 * same way cover and avatar images do.
 */
export const plazaKeyFor = (id) => createHash('sha256').update(`plaza\n${id}`).digest('hex')

export function createMemoryPlazaStore() {
  const publications = new Map()
  return {
    kind: 'memory',
    async getPublication(id) { return publications.get(plazaKeyFor(id)) ?? null },
    async putPublication(record) { publications.set(plazaKeyFor(record.id), { ...record }) },
    async deletePublication(id) { publications.delete(plazaKeyFor(id)) },
    async listPublications() { return [...publications.values()].map((record) => ({ ...record })) },
  }
}

export function createFirestorePlazaStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  return {
    kind: 'firestore',
    async getPublication(id) {
      const snapshot = await (await db()).collection('plaza_publications').doc(plazaKeyFor(id)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putPublication(record) {
      await (await db()).collection('plaza_publications').doc(plazaKeyFor(record.id)).set({ ...record })
    },
    async deletePublication(id) {
      await (await db()).collection('plaza_publications').doc(plazaKeyFor(id)).delete()
    },
    async listPublications() {
      const snapshot = await (await db()).collection('plaza_publications').get()
      return snapshot.docs.map((doc) => doc.data())
    },
  }
}

export function createPlazaStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryPlazaStore()
  return createFirestorePlazaStore(db ? async () => db : () => loadFirestore(env))
}
