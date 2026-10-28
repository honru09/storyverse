import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createPlazaStore } from '../plaza-store.js'
import { createPlazaFeedStore } from '../plaza-feed-store.js'
import { cleanBookTitle } from '../../src/plaza.js'

/**
 * BOOKSTORE-PLAZA stock migration: non-interactive, idempotent, safe
 * to re-run.
 *
 * What it does, in order:
 * 1. (CLI only) Cold-backup every publication record to
 *    server/backups/plaza_publications_pre_store_feed_<ts>.json. The
 *    run aborts if the backup cannot be written.
 * 2. Book records become bookstore records IN PLACE (the collection
 *    stays `plaza_publications`; "publication" was always the shelving
 *    record — the split is in what the surfaces mean, not in a second
 *    copy of the data):
 *    - titles are cleaned to the PURE book title with the same rule
 *      the publish path now applies (cleanBookTitle against the
 *      record's avatar name), on the record AND its snapshot;
 *    - the bookstore counters land: shareCount (recounted from the
 *      feed's active share posts in step 4), ratingAverage/ratingCount
 *      honestly zero — the rating batch fills them from real ratings.
 * 3. The plaza lights up with REAL first posts: the official account
 *    shares the official sample book, and the one real user book is
 *    shared by its own author. Fixed ids make re-runs no-ops; like
 *    and comment counts are the true zeros — nothing is fabricated.
 * 4. Every book's shareCount is recounted from the feed's active
 *    share posts, so the counter and the posts can never disagree.
 *
 * Rollback: restore the backup over plaza_publications and delete the
 * seeded posts (ids below) — no other shape changed.
 */
export const OFFICIAL_SAMPLE_BOOK_ID = 'pub-ff498576-b52'
export const OFFICIAL_POST_ID = 'post-official-sample-01'
export const OFFICIAL_POST = {
  content: '《沉潮港纪事》第一季二十四章现已正式完结上架书城。这是沈知遥在沉潮港走过的完整轨迹。你可以在书城直接阅读原作，或者带上你自己的化身进入这个世界，走出完全不同的一条新线。',
  createdAt: '2026-10-27T23:00:00.000Z',
}
export const USER_BOOK_ID = 'pub-520dce23-7d8'
export const USER_POST_ID = 'post-user-pangboya-01'
export const USER_POST = {
  content: '王兴润成神之路！在织界走完了这段故事，把书分享到广场，欢迎大家来书城阅读原作，或者带上你的化身进入这个世界。',
  createdAt: '2026-10-28T09:00:00.000Z',
}

function sharePostRecord({ id, book, content, createdAt }) {
  return {
    id,
    type: 'book_share',
    authorUid: book.authorUid,
    authorName: book.authorName || '织界旅人',
    content,
    bookId: book.id,
    bookTitle: book.title,
    likeCount: 0,
    commentCount: 0,
    status: 'active',
    reporters: [],
    hiddenReason: null,
    hiddenAt: null,
    createdAt,
    updatedAt: createdAt,
  }
}

export async function migrateStoreBooksAndFeed({ plazaStore, feedStore, now = () => new Date() } = {}) {
  if (!plazaStore) throw new Error('migration: plaza store unavailable (no data store configured)')
  if (!feedStore) throw new Error('migration: plaza feed store unavailable (no data store configured)')
  const summary = { books: 0, titlesCleaned: 0, postsSeeded: 0, shareCountsSynced: 0 }
  const records = await plazaStore.listPublications()
  summary.books = records.length
  const byId = new Map(records.map((record) => [record.id, record]))

  // Step 2 — clean titles + land the counters' shape.
  for (const record of records) {
    const cleanTitle = cleanBookTitle(record.title, record.avatar?.name)
    const next = { ...record }
    let changed = false
    if (cleanTitle && cleanTitle !== record.title) {
      next.title = cleanTitle
      if (next.snapshot && typeof next.snapshot === 'object') {
        next.snapshot = { ...next.snapshot, title: cleanTitle }
      }
      summary.titlesCleaned += 1
      changed = true
    }
    if (typeof next.ratingAverage !== 'number') { next.ratingAverage = 0; changed = true }
    if (!Number.isInteger(next.ratingCount)) { next.ratingCount = 0; changed = true }
    if (!Number.isInteger(next.shareCount)) { next.shareCount = 0; changed = true }
    if (changed) {
      next.updatedAt = now().toISOString()
      await plazaStore.putPublication(next)
      byId.set(next.id, next)
    }
  }

  // Step 3 — the two real first posts, only for books that exist.
  const seeds = [
    { bookId: OFFICIAL_SAMPLE_BOOK_ID, postId: OFFICIAL_POST_ID, ...OFFICIAL_POST },
    { bookId: USER_BOOK_ID, postId: USER_POST_ID, ...USER_POST },
  ]
  for (const seed of seeds) {
    const book = byId.get(seed.bookId)
    if (!book || book.status !== 'published') continue
    const existing = await feedStore.getPost(seed.postId)
    if (existing) continue
    await feedStore.putPost(sharePostRecord({
      id: seed.postId,
      book: { ...book, title: cleanBookTitle(book.title, book.avatar?.name) || book.title },
      content: seed.content,
      createdAt: seed.createdAt,
    }))
    summary.postsSeeded += 1
  }

  // Step 4 — share counts are the feed's truth, recounted.
  const posts = await feedStore.listPosts()
  const counts = new Map()
  for (const post of posts) {
    if (post.status === 'active' && post.type === 'book_share' && post.bookId) {
      counts.set(post.bookId, (counts.get(post.bookId) || 0) + 1)
    }
  }
  for (const record of byId.values()) {
    const wanted = counts.get(record.id) || 0
    if ((record.shareCount || 0) !== wanted) {
      await plazaStore.putPublication({ ...record, shareCount: wanted, updatedAt: now().toISOString() })
      summary.shareCountsSynced += 1
    }
  }
  return summary
}

async function main() {
  const env = process.env
  const plazaStore = createPlazaStore({ env })
  const feedStore = createPlazaFeedStore({ env })
  if (!plazaStore || !feedStore) {
    process.stderr.write('migration: no data store configured (set DATA_STORE or run on Cloud Run)\n')
    process.exitCode = 1
    return
  }
  const records = await plazaStore.listPublications()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = fileURLToPath(new URL('../backups/', import.meta.url))
  await mkdir(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `plaza_publications_pre_store_feed_${stamp}.json`)
  await writeFile(backupPath, JSON.stringify(records, null, 2), 'utf8')
  process.stdout.write(`backup: ${records.length} publication records → ${backupPath}\n`)
  const summary = await migrateStoreBooksAndFeed({ plazaStore, feedStore })
  process.stdout.write(`migration done: ${JSON.stringify(summary)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`migration failed: ${error?.message || error}\n`)
    process.exitCode = 1
  })
}
