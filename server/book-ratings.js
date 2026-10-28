import { ApiError, sanitizeSettingText } from './gemini.js'
import { findSettingViolation } from '../src/setting-guard.js'
import { createBookRatingsStore } from './book-ratings-store.js'
import { createSocialStore, pictureSourceFor } from './social-store.js'
import { createAvatarStore } from './avatar-store.js'
import { isOfficialUid, plazaAuthorNameFor } from './plaza.js'
import { publicHandle } from './social.js'

/**
 * Book ratings (RATINGS batch): five stars plus an optional written
 * review, hung on the BOOKSTORE book (the publication) — never on a
 * plaza post. One rating per reader per book; re-rating edits the
 * same record (stars and text together), and the reader can delete
 * their own rating outright.
 *
 * Rules that live here:
 * - You cannot rate your own book — the client hides the form, and
 *   the server hard-rejects it, because the check that matters is
 *   the one the request cannot talk its way around.
 * - Anyone signed in may rate any shelved book, read or not: the
 *   bookstore is a public catalogue, and a "must have read it" gate
 *   would need a cross-user reading record the site deliberately
 *   does not keep. Recorded here so the choice is explicit.
 * - The publication's ratingAverage/ratingCount pair is recomputed
 *   from the rating records on every write and mirrored onto the
 *   book record; the records are the truth, the pair is a cache.
 * - Review text is plain creator text: sanitised, capped at
 *   RATING_TEXT_MAX characters, and passed through the same
 *   setting-guard red-line scan every other user text crosses.
 * - The author's 互动 notification is DERIVED by the social service
 *   from the rating record (it denormalises bookAuthorUid/bookTitle).
 *   An edit keeps the record's createdAt — and therefore the derived
 *   item's id and instant — so editing never re-notifies; a delete
 *   removes the record and the item retracts with it.
 */
const clip = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : ''
const charCount = (value) => [...value].length

export const RATING_TEXT_MAX = 300
export const RATING_LIST_LIMIT = 20

const BOOK_NOT_FOUND = () => new ApiError(404, '这本书已下架或不存在。')

/** The honest summary of a set of star values: count + mean (0 when empty). */
export function ratingSummaryFor(stars) {
  const values = (Array.isArray(stars) ? stars : []).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5)
  if (!values.length) return { ratingAverage: 0, ratingCount: 0 }
  const total = values.reduce((sum, value) => sum + value, 0)
  return { ratingAverage: Math.round((total / values.length) * 100) / 100, ratingCount: values.length }
}

function cleanRatingText(value) {
  if (value === undefined || value === null) return { text: '' }
  const text = sanitizeSettingText(typeof value === 'string' ? value : '').trim()
  if (!text) return { text: '' }
  if (charCount(text) > RATING_TEXT_MAX) {
    return { error: `评价最多 ${RATING_TEXT_MAX} 字，删掉 ${charCount(text) - RATING_TEXT_MAX} 字再发。` }
  }
  const violation = findSettingViolation(text)
  if (violation) return { error: violation }
  return { text }
}

export function createBookRatingsService({ env = process.env, store, books, socialStore, avatarStore, now = () => new Date() } = {}) {
  const backend = store === undefined ? createBookRatingsStore({ env }) : store
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
   * A rating's author, resolved live exactly the way the plaza feed
   * resolves a post's author: the stored profile record's display
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

  async function summaryOf(record) {
    const person = await personOf(record.userUid, record.authorName)
    return {
      id: record.id,
      bookId: record.bookId,
      stars: record.stars,
      text: record.text || '',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      edited: typeof record.updatedAt === 'string' && typeof record.createdAt === 'string' && record.updatedAt > record.createdAt,
      authorUid: record.userUid,
      authorName: person.displayName,
      authorHandle: person.handle,
      authorPicture: person.picture,
      official: isOfficialUid(record.userUid),
    }
  }

  /** A book that can be rated or listed: shelved (published) right now. */
  async function shelvedBook(bookId) {
    if (!books) throw new ApiError(503, '书城服务尚未配置。')
    const card = await books.bookCardFor(bookId)
    if (!card || card.status !== 'published') throw BOOK_NOT_FOUND()
    return card.book
  }

  /** Recompute the book's summary pair from its records and mirror it onto the publication. */
  async function syncSummary(bookId) {
    const records = await backend.listRatingsByBook(bookId)
    const summary = ratingSummaryFor(records.map((record) => record.stars))
    if (books && typeof books.syncRatingSummary === 'function') {
      await books.syncRatingSummary(bookId, summary).catch(() => {})
    }
    return summary
  }

  return {
    available: backend !== null && backend !== undefined,

    /**
     * Rate a book, or edit my existing rating of it: the (book,
     * reader) key makes the second call an edit of the first — stars
     * and text move together, createdAt (and with it the derived
     * notification) stays where the first rating put it.
     */
    async rate(identity, bookId, body) {
      if (!backend) throw new ApiError(503, '评分服务尚未配置。')
      const book = await shelvedBook(bookId)
      if (book.authorUid === identity.uid) throw new ApiError(400, '这是你自己的书，不能给自己评分。')
      const input = body && typeof body === 'object' ? body : {}
      if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
        throw new ApiError(400, '先点一下星星，给这本书打个分吧。')
      }
      const cleaned = cleanRatingText(input.text)
      if (cleaned.error) throw new ApiError(400, cleaned.error)
      return serialise(`book:${bookId}`, async () => {
        const existing = await backend.getRating(bookId, identity.uid)
        const timestamp = now().toISOString()
        const record = {
          id: `rating:${bookId}:${identity.uid}`,
          bookId,
          bookAuthorUid: book.authorUid,
          bookTitle: book.title || '',
          userUid: identity.uid,
          authorName: plazaAuthorNameFor(identity) || '织界旅人',
          stars: input.stars,
          text: cleaned.text,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        }
        await backend.putRating(record)
        const summary = await syncSummary(bookId)
        return { rating: await summaryOf(record), ...summary }
      })
    },

    /** Delete my own rating. The derived notification retracts with the record. */
    async remove(identity, bookId) {
      if (!backend) throw new ApiError(503, '评分服务尚未配置。')
      await shelvedBook(bookId)
      return serialise(`book:${bookId}`, async () => {
        const existing = await backend.getRating(bookId, identity.uid)
        if (!existing) throw new ApiError(404, '你还没有评价过这本书。')
        await backend.deleteRating(bookId, identity.uid)
        const summary = await syncSummary(bookId)
        return { removed: true, ...summary }
      })
    },

    /**
     * The book's rating panel payload: the summary pair, the review
     * list (newest first, cursor-paginated on createdAt), and the
     * viewer's own position — their rating to prefill the form, and
     * whether the book is theirs (the form then explains itself
     * instead of rendering).
     */
    async list(bookId, { viewer = null, cursor = '', limit = RATING_LIST_LIMIT } = {}) {
      if (!backend) throw new ApiError(503, '评分服务尚未配置。')
      const book = await shelvedBook(bookId)
      const pageSize = Math.min(50, Math.max(1, Number.isInteger(limit) ? limit : RATING_LIST_LIMIT))
      const records = await backend.listRatingsByBook(bookId)
      const summary = ratingSummaryFor(records.map((record) => record.stars))
      const visible = records
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .filter((record) => !cursor || String(record.createdAt) < String(cursor))
      const page = visible.slice(0, pageSize)
      let viewerRating = null
      if (viewer?.uid) {
        const own = records.find((record) => record.userUid === viewer.uid)
        if (own) viewerRating = await summaryOf(own)
      }
      return {
        bookId,
        ...summary,
        ratings: await Promise.all(page.map(summaryOf)),
        nextCursor: visible.length > pageSize ? page[page.length - 1].createdAt : null,
        total: records.length,
        viewerRating,
        viewerIsAuthor: Boolean(viewer?.uid) && viewer.uid === book.authorUid,
      }
    },
  }
}
