import { randomUUID } from 'node:crypto'
import { ApiError, sanitizeSettingText } from './gemini.js'
import { findSettingViolation } from '../src/setting-guard.js'
import { PLAZA_REPORT_THRESHOLD } from '../src/plaza.js'
import { createPlazaFeedStore } from './plaza-feed-store.js'
import { createSocialStore, pictureSourceFor } from './social-store.js'
import { createAvatarStore } from './avatar-store.js'
import { isOfficialUid, plazaAuthorNameFor } from './plaza.js'
import { publicHandle } from './social.js'

/**
 * The plaza feed service (BOOKSTORE-PLAZA): the plaza is a social
 * timeline now — free-text posts and book-share posts in ONE
 * reverse-chronological stream, with likes, a flat comment thread per
 * post, and the report → auto-hide moderation loop. The bookstore
 * (server/plaza.js) owns the books; this service owns the talking
 * about them.
 *
 * Boundary rules that live here:
 * - Delete a post, never the book: a deleted share only decrements the
 *   book's share count. Withdraw or hide the book, never the post:
 *   the embedded card degrades to an honest 已下架 placeholder at
 *   read time, and revives by itself when the book is re-shelved.
 * - Post and comment bodies pass the same setting-guard red-line scan
 *   as every other user text on the site before they are stored.
 * - Likes and comments about YOUR post surface in the message
 *   centre's 互动 category — derived by the social service from the
 *   like/comment records themselves (see plaza-feed-store), so an
 *   un-like retracts its own notification. Actors never notify
 *   themselves: self-actions write no derived item because the social
 *   service filters the actor out.
 * - Reporter uid lists are server-only; no payload copies them out.
 */
const clip = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : ''
const charCount = (value) => [...value].length

export const POST_CONTENT_MAX = 500
export const COMMENT_CONTENT_MAX = 300

const POST_NOT_FOUND = () => new ApiError(404, '这条帖子已删除或不存在。')
const COMMENT_NOT_FOUND = () => new ApiError(404, '这条评论已删除或不存在。')

function cleanPostText(value, max) {
  const text = sanitizeSettingText(typeof value === 'string' ? value : '').trim()
  if (!text) return { error: '先写点什么，再发出来吧。' }
  if (charCount(text) > max) return { error: `最多 ${max} 字，删掉 ${charCount(text) - max} 字再发。` }
  const violation = findSettingViolation(text)
  if (violation) return { error: violation }
  return { text }
}

export function createPlazaFeedService({ env = process.env, store, books, socialStore, avatarStore, now = () => new Date() } = {}) {
  const backend = store === undefined ? createPlazaFeedStore({ env }) : store
  const socialBackend = socialStore === undefined ? createSocialStore({ env }) : socialStore
  const avatars = avatarStore === undefined ? createAvatarStore({ env }) : avatarStore
  const tails = new Map()
  const serialise = (key, task) => {
    const previous = tails.get(key) || Promise.resolve()
    const run = previous.then(task, task)
    tails.set(key, run.catch(() => {}))
    return run
  }

  /**
   * A post/comment author, resolved live the same way the plaza
   * resolves a book's author: the stored profile record's display
   * name wins over the write-time snapshot, the handle falls back to
   * a username account's login name, and the picture follows the
   * shared chain (uploaded picture → avatar portrait → the designed
   * default avatar asset). Never an email.
   */
  async function personOf(uid, snapshotName) {
    let displayName = snapshotName || ''
    let handle = ''
    let picture = { kind: 'default', url: '/default-avatar.svg' }
    let portraitReady = false
    if (avatars) {
      try {
        const profileRecord = await avatars.getProfile(uid)
        portraitReady = profileRecord?.avatar?.portrait?.status === 'ready'
      } catch { /* keep the default picture */ }
    }
    if (socialBackend) {
      try {
        const profileRecord = await socialBackend.getProfileRecord(uid)
        if (profileRecord?.displayName) displayName = profileRecord.displayName
        handle = publicHandle(profileRecord?.handle)
        const hasUpload = Boolean(await socialBackend.getPicture(uid))
        const kind = pictureSourceFor(profileRecord, { hasUpload, portraitReady })
        picture = kind === 'default'
          ? { kind, url: '/default-avatar.svg' }
          : { kind, url: `/api/users/${encodeURIComponent(uid)}/picture?v=${profileRecord?.pictureVersion || 0}` }
      } catch { /* fall back to the snapshot name and default picture */ }
    }
    if (!handle && typeof uid === 'string' && uid.startsWith('username:')) {
      handle = publicHandle(uid.slice('username:'.length))
    }
    if (!displayName || displayName.includes('@')) displayName = '未命名旅人'
    return { displayName, handle, picture }
  }

  /** The embedded book card for a share post, resolved at read time. */
  async function bookCardOf(post) {
    if (post.type !== 'book_share' || !post.bookId) return null
    const card = books ? await books.bookCardFor(post.bookId) : null
    if (!card) {
      // The book record itself is gone (its author deleted the book):
      // the post keeps the title it was shared under and shows the
      // deleted placeholder — the post is the sharer's own words and
      // is never collateral damage.
      return { status: 'deleted', id: post.bookId, title: post.bookTitle || '' }
    }
    if (card.status !== 'published') {
      return { status: card.status, id: card.id, title: card.title }
    }
    return { status: 'published', ...card.book }
  }

  async function summaryOf(post, viewerUid) {
    const [person, book] = await Promise.all([
      personOf(post.authorUid, post.authorName),
      bookCardOf(post),
    ])
    let viewerLiked = false
    if (viewerUid && backend) {
      try { viewerLiked = Boolean(await backend.getLike(post.id, viewerUid)) } catch { viewerLiked = false }
    }
    return {
      id: post.id,
      type: post.type,
      content: post.content,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      authorUid: post.authorUid,
      authorName: person.displayName,
      authorHandle: person.handle,
      authorPicture: person.picture,
      official: isOfficialUid(post.authorUid),
      likeCount: Math.max(0, post.likeCount || 0),
      commentCount: Math.max(0, post.commentCount || 0),
      viewerLiked,
      book,
    }
  }

  async function commentSummaryOf(comment) {
    const person = await personOf(comment.authorUid, comment.authorName)
    return {
      id: comment.id,
      postId: comment.postId,
      content: comment.content,
      createdAt: comment.createdAt,
      authorUid: comment.authorUid,
      authorName: person.displayName,
      authorHandle: person.handle,
      authorPicture: person.picture,
      official: isOfficialUid(comment.authorUid),
    }
  }

  async function activePost(id) {
    if (!backend) throw new ApiError(503, '广场服务尚未配置。')
    const post = await backend.getPost(id)
    if (!post || post.status !== 'active') throw POST_NOT_FOUND()
    return post
  }

  return {
    available: backend !== null && backend !== undefined,

    /** The public timeline: active posts only, newest first, cursor = last createdAt seen. */
    async feed({ viewer = null, cursor = '', limit = 20 } = {}) {
      if (!backend) return { posts: [], nextCursor: null }
      const pageSize = Math.min(50, Math.max(1, Number.isInteger(limit) ? limit : 20))
      const all = await backend.listPosts()
      const visible = all
        .filter((post) => post.status === 'active')
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .filter((post) => !cursor || String(post.createdAt) < String(cursor))
      const page = visible.slice(0, pageSize)
      const posts = await Promise.all(page.map((post) => summaryOf(post, viewer?.uid || '')))
      return {
        posts,
        nextCursor: visible.length > pageSize ? page[page.length - 1].createdAt : null,
      }
    },

    async postDetail({ viewer = null, id } = {}) {
      const post = await activePost(id)
      return summaryOf(post, viewer?.uid || '')
    },

    /** Real engagement per book (share-post likes), for the bookstore's honest 热门 ranking. */
    async engagementByBook() {
      const totals = new Map()
      if (!backend) return totals
      const all = await backend.listPosts()
      for (const post of all) {
        if (post.status !== 'active' || post.type !== 'book_share' || !post.bookId) continue
        totals.set(post.bookId, (totals.get(post.bookId) || 0) + Math.max(0, post.likeCount || 0))
      }
      return totals
    },

    async createPost(identity, body) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      const input = body && typeof body === 'object' ? body : {}
      const type = input.type === 'book_share' ? 'book_share' : 'free_text'
      const cleaned = cleanPostText(input.content, POST_CONTENT_MAX)
      if (cleaned.error) throw new ApiError(400, cleaned.error)
      let bookId = null
      let bookTitle = ''
      if (type === 'book_share') {
        bookId = typeof input.bookId === 'string' ? input.bookId : ''
        if (!bookId) throw new ApiError(400, '先选一本要分享的书。')
        const card = books ? await books.bookCardFor(bookId) : null
        if (!card || card.status !== 'published') {
          throw new ApiError(400, '这本书已下架或不存在，换一本再分享吧。')
        }
        bookTitle = card.book.title || ''
      }
      const timestamp = now().toISOString()
      const record = {
        id: `post-${randomUUID().slice(0, 12)}`,
        type,
        authorUid: identity.uid,
        authorName: plazaAuthorNameFor(identity) || '织界旅人',
        content: cleaned.text,
        bookId,
        bookTitle,
        likeCount: 0,
        commentCount: 0,
        status: 'active',
        reporters: [],
        hiddenReason: null,
        hiddenAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await backend.putPost(record)
      if (type === 'book_share' && books) {
        await books.adjustShareCount(bookId, 1).catch(() => {})
      }
      return summaryOf(record, identity.uid)
    },

    /** Delete my own post. The shared book is never touched (删帖不动书）. */
    async deletePost(identity, id) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      return serialise(`post:${id}`, async () => {
        const post = await backend.getPost(id)
        if (!post || post.status === 'deleted') throw POST_NOT_FOUND()
        if (post.authorUid !== identity.uid) throw new ApiError(403, '只能删除自己的帖子。')
        const timestamp = now().toISOString()
        await backend.putPost({ ...post, status: 'deleted', updatedAt: timestamp })
        const comments = await backend.listCommentsByPost(id)
        await Promise.all(comments
          .filter((comment) => comment.status === 'active')
          .map((comment) => backend.putComment({ ...comment, status: 'deleted', updatedAt: timestamp })))
        if (post.type === 'book_share' && post.bookId && books) {
          await books.adjustShareCount(post.bookId, -1).catch(() => {})
        }
        return { deleted: true, id }
      })
    },

    /** Like toggle: one record per (post, reader); the count follows the records. */
    async toggleLike(identity, id) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      return serialise(`post:${id}`, async () => {
        const post = await activePost(id)
        const existing = await backend.getLike(id, identity.uid)
        const timestamp = now().toISOString()
        if (existing) {
          await backend.deleteLike(id, identity.uid)
          const likeCount = Math.max(0, (post.likeCount || 0) - 1)
          await backend.putPost({ ...post, likeCount, updatedAt: post.updatedAt })
          return { liked: false, likeCount }
        }
        await backend.putLike({
          id: `like:${id}:${identity.uid}`,
          postId: id,
          postAuthorUid: post.authorUid,
          userUid: identity.uid,
          postExcerpt: clip(post.content, 60),
          createdAt: timestamp,
        })
        const likeCount = Math.max(0, post.likeCount || 0) + 1
        await backend.putPost({ ...post, likeCount, updatedAt: post.updatedAt })
        return { liked: true, likeCount }
      })
    },

    async reportPost(identity, id) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      return serialise(`post:${id}`, async () => {
        const post = await activePost(id)
        if (post.authorUid === identity.uid) throw new ApiError(400, '这是你发的帖子，不能举报。')
        const reporters = Array.isArray(post.reporters) ? [...post.reporters] : []
        if (!reporters.includes(identity.uid)) reporters.push(identity.uid)
        const next = { ...post, reporters, updatedAt: now().toISOString() }
        if (reporters.length >= PLAZA_REPORT_THRESHOLD) {
          next.status = 'hidden'
          next.hiddenReason = 'reports'
          next.hiddenAt = now().toISOString()
        }
        await backend.putPost(next)
        return { reported: true }
      })
    },

    /** The flat comment thread under a post, oldest first (floor 1 at the top). */
    async listComments(id, { cursor = '', limit = 50 } = {}) {
      await activePost(id)
      const pageSize = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50))
      const all = await backend.listCommentsByPost(id)
      const visible = all
        .filter((comment) => comment.status === 'active')
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      const after = cursor ? visible.filter((comment) => String(comment.createdAt) > String(cursor)) : visible
      const page = after.slice(0, pageSize)
      return {
        comments: await Promise.all(page.map(commentSummaryOf)),
        nextCursor: after.length > pageSize ? page[page.length - 1].createdAt : null,
        total: visible.length,
      }
    },

    async createComment(identity, id, body) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      return serialise(`post:${id}`, async () => {
        const post = await activePost(id)
        const input = body && typeof body === 'object' ? body : {}
        const cleaned = cleanPostText(input.text ?? input.content, COMMENT_CONTENT_MAX)
        if (cleaned.error) throw new ApiError(400, cleaned.error)
        const timestamp = now().toISOString()
        const record = {
          id: `comment-${randomUUID().slice(0, 12)}`,
          postId: id,
          postAuthorUid: post.authorUid,
          authorUid: identity.uid,
          authorName: plazaAuthorNameFor(identity) || '织界旅人',
          content: cleaned.text,
          postExcerpt: clip(post.content, 60),
          status: 'active',
          reporters: [],
          hiddenReason: null,
          hiddenAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await backend.putComment(record)
        await backend.putPost({ ...post, commentCount: Math.max(0, post.commentCount || 0) + 1, updatedAt: post.updatedAt })
        return commentSummaryOf(record)
      })
    },

    /** Delete a comment: its author, or the post's author moderating their own thread. */
    async deleteComment(identity, id, commentId) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      return serialise(`post:${id}`, async () => {
        const post = await activePost(id)
        const comment = await backend.getComment(commentId)
        if (!comment || comment.postId !== id || comment.status !== 'active') throw COMMENT_NOT_FOUND()
        if (comment.authorUid !== identity.uid && post.authorUid !== identity.uid) {
          throw new ApiError(403, '只能删除自己的评论，或自己帖子下的评论。')
        }
        await backend.putComment({ ...comment, status: 'deleted', updatedAt: now().toISOString() })
        await backend.putPost({ ...post, commentCount: Math.max(0, (post.commentCount || 0) - 1), updatedAt: post.updatedAt })
        return { deleted: true, commentId }
      })
    },

    async reportComment(identity, id, commentId) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      return serialise(`post:${id}`, async () => {
        const post = await activePost(id)
        const comment = await backend.getComment(commentId)
        if (!comment || comment.postId !== id || comment.status !== 'active') throw COMMENT_NOT_FOUND()
        if (comment.authorUid === identity.uid) throw new ApiError(400, '这是你写的评论，不能举报。')
        const reporters = Array.isArray(comment.reporters) ? [...comment.reporters] : []
        if (!reporters.includes(identity.uid)) reporters.push(identity.uid)
        const next = { ...comment, reporters, updatedAt: now().toISOString() }
        if (reporters.length >= PLAZA_REPORT_THRESHOLD) {
          next.status = 'hidden'
          next.hiddenReason = 'reports'
          next.hiddenAt = now().toISOString()
          await backend.putPost({ ...post, commentCount: Math.max(0, (post.commentCount || 0) - 1), updatedAt: post.updatedAt })
        }
        await backend.putComment(next)
        return { reported: true }
      })
    },
  }
}
