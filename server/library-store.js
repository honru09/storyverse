import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for the per-account cloud library (books follow the account).
 *
 * Shape, chosen against Firestore's 1 MiB per-document limit:
 * - one meta document per account (`library_meta`): the shelf index —
 *   per-story metadata entries, deletion tombstones and the small reading
 *   state blob (paragraph anchors + bookmarks). No prose lives here, so
 *   the index stays tiny even for hundreds of books.
 * - one head document per story (`library_stories`): everything about the
 *   story except its chapters — config, world bible, choices, reading
 *   position — plus the chapter-chunk count. A few KB at most.
 * - chapter chunk documents (`library_chapters`): chapters packed in
 *   order into chunks whose serialized form stays under a budget well
 *   below the document limit (see server/library.js). A 100-chapter line
 *   is a handful of chunks; even a 999-chapter endless line stays in the
 *   dozens. A story is only ever visible through its head, and the head
 *   is written after its chunks, so a present head always means a
 *   complete story.
 *
 * Keys are hashes of the uid (plus the story id / chunk index), so no
 * account id ever needs to be a valid document id and one account's
 * records can never be addressed by another account's key space.
 */
export const libraryMetaKeyFor = (uid) => createHash('sha256').update(`library-meta\n${uid}`).digest('hex')
export const libraryStoryKeyFor = (uid, storyId) =>
  createHash('sha256').update(`library-story\n${uid}\n${storyId}`).digest('hex')
export const libraryChunkKeyFor = (uid, storyId, index) =>
  createHash('sha256').update(`library-chunk\n${uid}\n${storyId}\n${index}`).digest('hex')

export function createMemoryLibraryStore() {
  const metas = new Map()
  const heads = new Map()
  const chunks = new Map()
  return {
    kind: 'memory',
    async getMeta(uid) { return metas.get(libraryMetaKeyFor(uid)) ?? null },
    async putMeta(uid, record) { metas.set(libraryMetaKeyFor(uid), { ...record }) },
    async getStoryHead(uid, storyId) { return heads.get(libraryStoryKeyFor(uid, storyId)) ?? null },
    async putStoryHead(uid, storyId, record) { heads.set(libraryStoryKeyFor(uid, storyId), { ...record }) },
    async deleteStoryHead(uid, storyId) { heads.delete(libraryStoryKeyFor(uid, storyId)) },
    async getChapterChunk(uid, storyId, index) { return chunks.get(libraryChunkKeyFor(uid, storyId, index)) ?? null },
    async putChapterChunk(uid, storyId, index, record) { chunks.set(libraryChunkKeyFor(uid, storyId, index), { ...record }) },
    async deleteChapterChunk(uid, storyId, index) { chunks.delete(libraryChunkKeyFor(uid, storyId, index)) },
  }
}

export function createFirestoreLibraryStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const read = async (collection, key) => {
    const snapshot = await (await db()).collection(collection).doc(key).get()
    return snapshot.exists ? snapshot.data() : null
  }
  const write = async (collection, key, record) => {
    await (await db()).collection(collection).doc(key).set({ ...record })
  }
  const remove = async (collection, key) => {
    await (await db()).collection(collection).doc(key).delete()
  }
  return {
    kind: 'firestore',
    getMeta: (uid) => read('library_meta', libraryMetaKeyFor(uid)),
    putMeta: (uid, record) => write('library_meta', libraryMetaKeyFor(uid), record),
    getStoryHead: (uid, storyId) => read('library_stories', libraryStoryKeyFor(uid, storyId)),
    putStoryHead: (uid, storyId, record) => write('library_stories', libraryStoryKeyFor(uid, storyId), record),
    deleteStoryHead: (uid, storyId) => remove('library_stories', libraryStoryKeyFor(uid, storyId)),
    getChapterChunk: (uid, storyId, index) => read('library_chapters', libraryChunkKeyFor(uid, storyId, index)),
    putChapterChunk: (uid, storyId, index, record) => write('library_chapters', libraryChunkKeyFor(uid, storyId, index), record),
    deleteChapterChunk: (uid, storyId, index) => remove('library_chapters', libraryChunkKeyFor(uid, storyId, index)),
  }
}

export function createLibraryStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryLibraryStore()
  return createFirestoreLibraryStore(db ? async () => db : () => loadFirestore(env))
}
