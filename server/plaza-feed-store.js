import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for the plaza social feed (BOOKSTORE-PLAZA): posts,
 * their flat comments and their likes. Three small collections, one
 * record per document, keyed by hashes of the public ids exactly like
 * the publication store. Records carry server-only fields (reporter
 * uid lists); the feed service strips those from every response, so
 * what is stored is never what is served verbatim.
 *
 * Likes are keyed by the (post, user) pair — one like per reader per
 * post is a storage-level fact, not an application hope. Likes and
 * comments also denormalise `postAuthorUid` and a short `postExcerpt`
 * at write time: the message centre derives 互动 items (liked /
 * commented on YOUR post) from these records alone, and an un-like
 * deletes the record, which retracts the derived item with it.
 */
export const postKeyFor = (id) => createHash('sha256').update(`post\n${id}`).digest('hex')
export const commentKeyFor = (id) => createHash('sha256').update(`comment\n${id}`).digest('hex')
export const likeKeyFor = (postId, userUid) => createHash('sha256').update(`${postId}\n${userUid}`).digest('hex')

const copy = (record) => (record ? { ...record } : null)

export function createMemoryPlazaFeedStore() {
  const posts = new Map()
  const comments = new Map()
  const likes = new Map()
  return {
    kind: 'memory',
    async getPost(id) { return copy(posts.get(postKeyFor(id))) },
    async putPost(record) { posts.set(postKeyFor(record.id), { ...record }) },
    async listPosts() { return [...posts.values()].map((record) => ({ ...record })) },
    async listPostsByAuthor(uid) { return [...posts.values()].filter((record) => record.authorUid === uid).map((record) => ({ ...record })) },
    async listPostsByBook(bookId) { return [...posts.values()].filter((record) => record.bookId === bookId).map((record) => ({ ...record })) },
    async getComment(id) { return copy(comments.get(commentKeyFor(id))) },
    async putComment(record) { comments.set(commentKeyFor(record.id), { ...record }) },
    async listCommentsByPost(postId) { return [...comments.values()].filter((record) => record.postId === postId).map((record) => ({ ...record })) },
    async listCommentsByPostAuthor(uid) { return [...comments.values()].filter((record) => record.postAuthorUid === uid).map((record) => ({ ...record })) },
    async getLike(postId, userUid) { return copy(likes.get(likeKeyFor(postId, userUid))) },
    async putLike(record) { likes.set(likeKeyFor(record.postId, record.userUid), { ...record }) },
    async deleteLike(postId, userUid) { likes.delete(likeKeyFor(postId, userUid)) },
    async listLikesByPost(postId) { return [...likes.values()].filter((record) => record.postId === postId).map((record) => ({ ...record })) },
    async listLikesByPostAuthor(uid) { return [...likes.values()].filter((record) => record.postAuthorUid === uid).map((record) => ({ ...record })) },
  }
}

export function createFirestorePlazaFeedStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const collection = async (name) => (await db()).collection(name)
  return {
    kind: 'firestore',
    async getPost(id) {
      const snapshot = await (await collection('plaza_posts')).doc(postKeyFor(id)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putPost(record) { await (await collection('plaza_posts')).doc(postKeyFor(record.id)).set({ ...record }) },
    async listPosts() {
      const snapshot = await (await collection('plaza_posts')).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async listPostsByAuthor(uid) {
      const snapshot = await (await collection('plaza_posts')).where('authorUid', '==', uid).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async listPostsByBook(bookId) {
      const snapshot = await (await collection('plaza_posts')).where('bookId', '==', bookId).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async getComment(id) {
      const snapshot = await (await collection('plaza_post_comments')).doc(commentKeyFor(id)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putComment(record) { await (await collection('plaza_post_comments')).doc(commentKeyFor(record.id)).set({ ...record }) },
    async listCommentsByPost(postId) {
      const snapshot = await (await collection('plaza_post_comments')).where('postId', '==', postId).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async listCommentsByPostAuthor(uid) {
      const snapshot = await (await collection('plaza_post_comments')).where('postAuthorUid', '==', uid).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async getLike(postId, userUid) {
      const snapshot = await (await collection('plaza_post_likes')).doc(likeKeyFor(postId, userUid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putLike(record) { await (await collection('plaza_post_likes')).doc(likeKeyFor(record.postId, record.userUid)).set({ ...record }) },
    async deleteLike(postId, userUid) { await (await collection('plaza_post_likes')).doc(likeKeyFor(postId, userUid)).delete() },
    async listLikesByPost(postId) {
      const snapshot = await (await collection('plaza_post_likes')).where('postId', '==', postId).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async listLikesByPostAuthor(uid) {
      const snapshot = await (await collection('plaza_post_likes')).where('postAuthorUid', '==', uid).get()
      return snapshot.docs.map((doc) => doc.data())
    },
  }
}

export function createPlazaFeedStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemoryPlazaFeedStore()
  return createFirestorePlazaFeedStore(db ? async () => db : () => loadFirestore(env))
}
