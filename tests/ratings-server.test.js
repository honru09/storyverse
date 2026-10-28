import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PNG } from 'pngjs'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createStory,
} from '../src/story-engine.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createPlazaFeedService } from '../server/plaza-feed.js'
import { createMemoryPlazaFeedStore } from '../server/plaza-feed-store.js'
import { createBookRatingsService, ratingSummaryFor } from '../server/book-ratings.js'
import { createMemoryBookRatingsStore } from '../server/book-ratings-store.js'
import { createServer } from '../server/index.js'

// RATINGS batch: five stars + an optional written review on the
// bookstore book — one per reader (re-posting edits), never your own
// book, the average/count mirrored onto the book record, list
// pagination, the shrunken place of ratings in the 热门 heat, and the
// derived 互动 notification (edit does not re-notify, delete retracts).

const ORIGIN = { Origin: 'http://localhost:5173' }

const tinyPng = () => {
  const png = new PNG({ width: 1, height: 1 })
  png.data.set([10, 20, 30, 255])
  return PNG.sync.write(png)
}

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    current = acceptChapter(current, chapter, chapterKey(current, index))
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, chapter.choice.options[0].id)
    }
  }
  return current
}

function completedLine(avatarId) {
  return {
    ...walkLocal(createStory({
      genreId: 'cultivation',
      genreTemplateId: 'xianxia',
      storyLengthMode: 'season',
      originIdentityId: 'mystery',
      startPointName: '山神破庙',
      name: '沈砚',
      avatarId,
      avatarAppearance: '银灰长发，左颊一颗泪痣',
      ability: '借火一瞬',
    }), 24),
    engine: 'gemini',
  }
}

async function startServer(t) {
  const avatarStore = createMemoryAvatarStore()
  const plazaStore = createMemoryPlazaStore()
  const coverStore = createMemoryCoverStore()
  const feedStore = createMemoryPlazaFeedStore()
  const ratingsStore = createMemoryBookRatingsStore()
  const socialStore = createMemorySocialStore()
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
  const social = createSocialService({
    env: {}, store: socialStore, plazaStore, avatarStore, feedStore, ratingsStore,
  })
  const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore: social })
  const ratings = createBookRatingsService({
    env: {}, store: ratingsStore, books: plaza, socialStore, avatarStore,
  })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    library: createLibraryService({ env: {}, store: createMemoryLibraryStore() }),
    avatar: createAvatarService({
      env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
      store: avatarStore,
      imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
    }),
    plaza,
    plazaStore,
    coverStore,
    social,
    plazaFeed,
    ratings,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, ratingsStore }
}

const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'story-pass-1' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  return { token: (await response.json()).token }
}

async function makeAvatar(base, token, name = '沈砚') {
  const response = await fetch(`${base}/api/avatar`, {
    method: 'PUT', headers: authed(token),
    body: JSON.stringify({
      profile: {
        name,
        description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(response.status, 200, 'avatar save')
  return (await response.json()).avatar
}

async function publishBook(base, token, avatarId) {
  const response = await fetch(`${base}/api/store/publish`, {
    method: 'POST', headers: authed(token), body: JSON.stringify({ story: completedLine(avatarId) }),
  })
  assert.equal(response.status, 200, 'publish to store')
  return (await response.json()).book
}

const rate = (base, token, bookId, body) => fetch(`${base}/api/store/${bookId}/ratings`, {
  method: 'POST', headers: token ? authed(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

test('ratingSummaryFor: the honest mean, rounded to cents, empty is zero', () => {
  assert.deepEqual(ratingSummaryFor([]), { ratingAverage: 0, ratingCount: 0 })
  assert.deepEqual(ratingSummaryFor([5]), { ratingAverage: 5, ratingCount: 1 })
  assert.deepEqual(ratingSummaryFor([5, 3]), { ratingAverage: 4, ratingCount: 2 })
  assert.deepEqual(ratingSummaryFor([5, 4, 4]), { ratingAverage: 4.33, ratingCount: 3 })
  assert.deepEqual(ratingSummaryFor([5, 0, 7, 'x']), { ratingAverage: 5, ratingCount: 1 }, 'junk values never count')
})

test('ratings: create, average on the book, one-per-reader edit, delete', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'rate_author')
  const readerB = await register(base, 'rate_reader_b')
  const readerC = await register(base, 'rate_reader_c')
  const avatar = await makeAvatar(base, author.token)
  const book = await publishBook(base, author.token, avatar.id)
  assert.equal(book.ratingCount, 0)
  assert.equal(book.ratingAverage, 0)

  // B rates 5 with words; the response carries the new summary.
  const first = await rate(base, readerB.token, book.id, { stars: 5, text: '收尾那一章看得我起鸡皮疙瘩。' })
  assert.equal(first.status, 200)
  const firstBody = await first.json()
  assert.equal(firstBody.ratingCount, 1)
  assert.equal(firstBody.ratingAverage, 5)
  assert.equal(firstBody.rating.stars, 5)
  assert.equal(firstBody.rating.edited, false)

  // The book record (detail + catalogue card) carries the pair.
  const detail = await (await fetch(`${base}/api/store/${book.id}`)).json()
  assert.equal(detail.book.ratingCount, 1)
  assert.equal(detail.book.ratingAverage, 5)
  const catalogue = await (await fetch(`${base}/api/store`)).json()
  assert.equal(catalogue.books[0].ratingCount, 1)
  assert.equal(catalogue.books[0].ratingAverage, 5)

  // C rates 3 stars only: the average is the honest mean of the two.
  const second = await rate(base, readerC.token, book.id, { stars: 3 })
  assert.equal(second.status, 200)
  const secondBody = await second.json()
  assert.equal(secondBody.ratingCount, 2)
  assert.equal(secondBody.ratingAverage, 4)

  // B re-rates: SAME record edited — count stays 2, createdAt stands,
  // stars and text move together.
  const edited = await rate(base, readerB.token, book.id, { stars: 4, text: '二刷改四星，节奏其实中段有点拖。' })
  assert.equal(edited.status, 200)
  const editedBody = await edited.json()
  assert.equal(editedBody.ratingCount, 2)
  assert.equal(editedBody.ratingAverage, 3.5)
  assert.equal(editedBody.rating.id, firstBody.rating.id, 'an edit keeps the one record')
  assert.equal(editedBody.rating.createdAt, firstBody.rating.createdAt, 'an edit keeps the original instant')
  assert.equal(editedBody.rating.edited, true)
  assert.equal(editedBody.rating.text, '二刷改四星，节奏其实中段有点拖。')

  // The public list: newest first, both raters resolved, my own copy
  // rides along for the signed-in viewer only.
  const listAnon = await (await fetch(`${base}/api/store/${book.id}/ratings`)).json()
  assert.equal(listAnon.total, 2)
  assert.equal(listAnon.viewerRating, null)
  assert.equal(listAnon.viewerIsAuthor, false)
  const listB = await (await fetch(`${base}/api/store/${book.id}/ratings`, { headers: authed(readerB.token) })).json()
  assert.equal(listB.viewerRating.stars, 4)
  assert.equal(listB.ratings.length, 2)
  assert.ok(listB.ratings.every((entry) => entry.authorName && entry.authorPicture?.url), 'raters resolve to a person card')
  const listAuthor = await (await fetch(`${base}/api/store/${book.id}/ratings`, { headers: authed(author.token) })).json()
  assert.equal(listAuthor.viewerIsAuthor, true, 'the author is told the book is theirs')

  // B deletes: the pair recomputes from what remains.
  const removed = await fetch(`${base}/api/store/${book.id}/ratings`, { method: 'DELETE', headers: authed(readerB.token) })
  assert.equal(removed.status, 200)
  const removedBody = await removed.json()
  assert.equal(removedBody.ratingCount, 1)
  assert.equal(removedBody.ratingAverage, 3)
  const afterDelete = await (await fetch(`${base}/api/store/${book.id}`)).json()
  assert.equal(afterDelete.book.ratingCount, 1)
  assert.equal(afterDelete.book.ratingAverage, 3)

  // Deleting twice is an honest 404, not a silent success.
  const removedAgain = await fetch(`${base}/api/store/${book.id}/ratings`, { method: 'DELETE', headers: authed(readerB.token) })
  assert.equal(removedAgain.status, 404)
})

test('ratings: guards — login required, never your own book, valid stars, text limits', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'guard_author')
  const reader = await register(base, 'guard_reader')
  const avatar = await makeAvatar(base, author.token)
  const book = await publishBook(base, author.token, avatar.id)

  const anon = await rate(base, null, book.id, { stars: 5 })
  assert.equal(anon.status, 401, 'rating takes a signed-in reader')

  const own = await rate(base, author.token, book.id, { stars: 5, text: '我自己的书天下第一。' })
  assert.equal(own.status, 400, 'the author cannot rate their own book')
  assert.match((await own.json()).error, /自己的书/)

  for (const stars of [0, 6, 3.5, '5', null]) {
    const bad = await rate(base, reader.token, book.id, { stars })
    assert.equal(bad.status, 400, `stars=${JSON.stringify(stars)} is refused`)
  }

  const tooLong = await rate(base, reader.token, book.id, { stars: 4, text: '好'.repeat(301) })
  assert.equal(tooLong.status, 400, 'the review text caps at 300 characters')
  const justRight = await rate(base, reader.token, book.id, { stars: 4, text: '好'.repeat(300) })
  assert.equal(justRight.status, 200, 'exactly 300 characters still fits')

  const violation = await rate(base, reader.token, book.id, { stars: 1, text: '这本书是以真人为原型造谣的。' })
  assert.equal(violation.status, 400, 'review text crosses the same red-line scan as every user text')

  const missing = await rate(base, reader.token, 'pub-does-not-exist', { stars: 5 })
  assert.equal(missing.status, 404, 'a book that is not shelved cannot be rated')
  const missingList = await fetch(`${base}/api/store/pub-does-not-exist/ratings`)
  assert.equal(missingList.status, 404)
})

test('ratings: list paginates newest-first by cursor', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'page_author')
  const avatar = await makeAvatar(base, author.token)
  const book = await publishBook(base, author.token, avatar.id)
  const raters = []
  for (const name of ['page_rater_1', 'page_rater_2', 'page_rater_3']) {
    const rater = await register(base, name)
    raters.push(rater)
    const response = await rate(base, rater.token, book.id, { stars: 5, text: `${name} 的评价` })
    assert.equal(response.status, 200)
  }
  const page1 = await (await fetch(`${base}/api/store/${book.id}/ratings?limit=2`)).json()
  assert.equal(page1.ratings.length, 2)
  assert.equal(page1.total, 3)
  assert.ok(page1.nextCursor, 'a full page hands back a cursor')
  const page2 = await (await fetch(`${base}/api/store/${book.id}/ratings?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`)).json()
  assert.equal(page2.ratings.length, 1)
  assert.equal(page2.nextCursor, null)
  const seen = [...page1.ratings, ...page2.ratings].map((entry) => entry.id)
  assert.equal(new Set(seen).size, 3, 'the two pages cover every rating exactly once')
  const stamps = [...page1.ratings, ...page2.ratings].map((entry) => entry.createdAt)
  assert.deepEqual(stamps, [...stamps].sort().reverse(), 'the walk is newest-first throughout')
})

test('ratings: the author is notified once — edits stay quiet, deletes retract', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'note_author')
  const reader = await register(base, 'note_reader')
  const avatar = await makeAvatar(base, author.token)
  const book = await publishBook(base, author.token, avatar.id)

  const notifyItems = async () => {
    const payload = await (await fetch(`${base}/api/me/notifications`, { headers: authed(author.token) })).json()
    return payload.categories.activity.items.filter((item) => item.kind === 'rating')
  }
  assert.equal((await notifyItems()).length, 0)

  await rate(base, reader.token, book.id, { stars: 5, text: '太好看了。' })
  const afterFirst = await notifyItems()
  assert.equal(afterFirst.length, 1, 'one rating, one 互动 item')
  assert.equal(afterFirst[0].target.type, 'book')
  assert.equal(afterFirst[0].target.bookId, book.id)
  assert.equal(afterFirst[0].target.bookTitle, book.title)
  assert.equal(afterFirst[0].target.stars, 5)
  assert.equal(afterFirst[0].target.ratingText, '太好看了。')

  // Edit: the item shows the new stars but keeps its id and instant —
  // no second item, no fresh unread.
  await rate(base, reader.token, book.id, { stars: 2, text: '改主意了，中段太拖。' })
  const afterEdit = await notifyItems()
  assert.equal(afterEdit.length, 1, 'an edit never makes a second item')
  assert.equal(afterEdit[0].id, afterFirst[0].id)
  assert.equal(afterEdit[0].at, afterFirst[0].at, 'an edit keeps the item\u2019s instant')
  assert.equal(afterEdit[0].target.stars, 2, 'the item shows the rating as it now stands')

  // Delete: the record goes, the derived item retracts with it.
  await fetch(`${base}/api/store/${book.id}/ratings`, { method: 'DELETE', headers: authed(reader.token) })
  assert.equal((await notifyItems()).length, 0, 'deleting the rating retracts the notification')
})

test('ratings: 热门 heat shrinks the average — one 5-star cannot outrank real engagement', async (t) => {
  const { base } = await startServer(t)
  const authorA = await register(base, 'heat_author_a')
  const authorB = await register(base, 'heat_author_b')
  const avatarA = await makeAvatar(base, authorA.token)
  const avatarB = await makeAvatar(base, authorB.token)
  const bookA = await publishBook(base, authorA.token, avatarA.id)
  const bookB = await publishBook(base, authorB.token, avatarB.id)

  // A gets a single friendly 5-star (heat ≈ 5 × 1/11 ≈ 0.45); B gets
  // one real share post (shareCount 1, heat 1). B must rank first.
  const fan = await register(base, 'heat_fan')
  await rate(base, fan.token, bookA.id, { stars: 5 })
  const share = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(authorB.token),
    body: JSON.stringify({ type: 'book_share', content: '分享一下这本书。', bookId: bookB.id }),
  })
  assert.equal(share.status, 200)
  const hot1 = await (await fetch(`${base}/api/store?sort=hot`)).json()
  assert.equal(hot1.books[0].id, bookB.id, 'one real share beats one 5-star rating')
  assert.equal(hot1.books[1].id, bookA.id)

  // A earns two more 5-star ratings (three in total): shrunk heat ≈
  // 5 × 3/13 ≈ 1.15 — past B's single share, by a margin only real
  // ratings could give it. (The count stays low on purpose: username
  // registration is rate-limited per client, and the shrinkage curve
  // is already provable at n=3.)
  for (let index = 0; index < 2; index += 1) {
    const rater = await register(base, `heat_rater_${index}`)
    const response = await rate(base, rater.token, bookA.id, { stars: 5 })
    assert.equal(response.status, 200)
  }
  const hot2 = await (await fetch(`${base}/api/store?sort=hot`)).json()
  assert.equal(hot2.books[0].id, bookA.id, 'three real ratings carry the book past one share')
  assert.equal(hot2.books[0].ratingCount, 3)
  assert.equal(hot2.books[0].ratingAverage, 5)
})
