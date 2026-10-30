import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
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
import { createMemoryReadCountStore, readClaimKeyFor } from '../server/read-count-store.js'
import { createServer } from '../server/index.js'

// READ-COUNT (REQ-42): a shelved book's 阅读量 — signed-in non-author
// readers who opened the book's text, once per reader per book per
// day (the platform's UTC quota day). No reusable counter existed
// (share/rating are different acts), so the count is new: a
// (book, reader, day) claim ledger is the truth and the publication
// record's readCount is its denormalised total. Nothing is backfilled.

const ORIGIN = { Origin: 'http://localhost:5173' }

async function seedBook(plazaStore, { id = 'pub-read-1', authorUid = 'author-1', status = 'published' } = {}) {
  await plazaStore.putPublication({
    id,
    authorUid,
    authorName: '作者甲',
    sourceStoryId: `story-${id}`,
    title: '测试书',
    status,
    shareCount: 0,
    ratingAverage: 0,
    ratingCount: 0,
    readCount: 0,
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    worldName: '青岚宗',
    storyLengthMode: 'season',
    seasonNumber: 1,
    chapterCount: 24,
    totalChapters: 24,
    publishedAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
    avatar: { name: '沈砚', appearance: '' },
    snapshot: { config: {}, chapters: [], choices: [], worldBible: {}, beats: [], enterTemplate: {} },
  })
}

function serviceFixture() {
  const plazaStore = createMemoryPlazaStore()
  const readStore = createMemoryReadCountStore()
  let nowMs = Date.UTC(2026, 9, 30, 12, 0, 0)
  const plaza = createPlazaService({
    env: {},
    store: plazaStore,
    avatarStore: createMemoryAvatarStore(),
    socialStore: createMemorySocialStore(),
    coverStore: createMemoryCoverStore(),
    readStore,
    now: () => new Date(nowMs),
  })
  return { plaza, plazaStore, readStore, advanceDay: () => { nowMs += 24 * 60 * 60 * 1000 } }
}

test('read claims: one win per (book, reader, day) triple', async () => {
  const store = createMemoryReadCountStore()
  const claim = { bookId: 'pub-1', userUid: 'reader-1', day: '2026-10-30', createdAt: '2026-10-30T12:00:00.000Z' }
  assert.equal(await store.claimRead(claim), true, 'first claim lands')
  assert.equal(await store.claimRead(claim), false, 'the same triple never lands twice')
  assert.equal(await store.claimRead({ ...claim, day: '2026-10-31' }), true, 'a new day is a new claim')
  assert.equal(await store.claimRead({ ...claim, userUid: 'reader-2' }), true, 'another reader is a new claim')
  assert.deepEqual(await store.getClaim('pub-1', 'reader-1', '2026-10-30'), claim)
  assert.equal(readClaimKeyFor('pub-1', 'reader-1', '2026-10-30').length, 64)
})

test('recordRead: counts a signed-in non-author once per day, mirrors onto detail and catalogue', async () => {
  const { plaza, plazaStore } = serviceFixture()
  await seedBook(plazaStore)
  const reader = { uid: 'reader-1' }
  assert.deepEqual(await plaza.recordRead(reader, 'pub-read-1'), { readCount: 1, counted: true })
  assert.deepEqual(await plaza.recordRead(reader, 'pub-read-1'), { readCount: 1, counted: false }, 'same reader, same day: no double count')
  assert.deepEqual(await plaza.recordRead({ uid: 'reader-2' }, 'pub-read-1'), { readCount: 2, counted: true })
  const detail = await plaza.detail('pub-read-1')
  assert.equal(detail.readCount, 2, 'the detail payload carries the total')
  const { books } = await plaza.books({})
  assert.equal(books.find((book) => book.id === 'pub-read-1')?.readCount, 2, 'the catalogue summary carries it too (cards simply do not render it)')
})

test('recordRead: the author and guests never count', async () => {
  const { plaza, plazaStore } = serviceFixture()
  await seedBook(plazaStore)
  assert.deepEqual(await plaza.recordRead({ uid: 'author-1' }, 'pub-read-1'), { readCount: 0, counted: false }, 'author opening their own line')
  assert.deepEqual(await plaza.recordRead(null, 'pub-read-1'), { readCount: 0, counted: false }, 'no identity')
  assert.deepEqual(await plaza.recordRead({}, 'pub-read-1'), { readCount: 0, counted: false }, 'identity without a uid')
  assert.equal((await plaza.detail('pub-read-1')).readCount, 0)
})

test('recordRead: a new day counts the same reader again', async () => {
  const { plaza, plazaStore, advanceDay } = serviceFixture()
  await seedBook(plazaStore)
  const reader = { uid: 'reader-1' }
  assert.deepEqual(await plaza.recordRead(reader, 'pub-read-1'), { readCount: 1, counted: true })
  advanceDay()
  assert.deepEqual(await plaza.recordRead(reader, 'pub-read-1'), { readCount: 2, counted: true }, 'crossing the day boundary re-arms the claim')
  assert.deepEqual(await plaza.recordRead(reader, 'pub-read-1'), { readCount: 2, counted: false })
})

test('recordRead: missing or withdrawn books 404, exactly like detail', async () => {
  const { plaza, plazaStore } = serviceFixture()
  await seedBook(plazaStore, { id: 'pub-gone', status: 'withdrawn' })
  await assert.rejects(() => plaza.recordRead({ uid: 'reader-1' }, 'pub-missing'), (error) => error?.status === 404)
  await assert.rejects(() => plaza.recordRead({ uid: 'reader-1' }, 'pub-gone'), (error) => error?.status === 404)
})

test('recordRead: without a claim store the read is reported but never counted', async () => {
  const plazaStore = createMemoryPlazaStore()
  const plaza = createPlazaService({
    env: {},
    store: plazaStore,
    avatarStore: createMemoryAvatarStore(),
    socialStore: createMemorySocialStore(),
    coverStore: createMemoryCoverStore(),
    readStore: null,
  })
  await seedBook(plazaStore)
  assert.deepEqual(await plaza.recordRead({ uid: 'reader-1' }, 'pub-read-1'), { readCount: 0, counted: false })
})

// ---- HTTP: the route, its auth gate, and the detail payload ---------

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
  const socialStore = createMemorySocialStore()
  const plaza = createPlazaService({
    env: {}, store: plazaStore, avatarStore, coverStore,
    readStore: createMemoryReadCountStore(),
  })
  const social = createSocialService({
    env: {}, store: socialStore, plazaStore, avatarStore, feedStore,
  })
  const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore: social })
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
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}` }
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

async function publishBook(base, token) {
  const avatarResponse = await fetch(`${base}/api/avatar`, {
    method: 'PUT', headers: authed(token),
    body: JSON.stringify({
      profile: {
        name: '沈砚',
        description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(avatarResponse.status, 200, 'avatar save')
  const avatar = (await avatarResponse.json()).avatar
  const response = await fetch(`${base}/api/store/publish`, {
    method: 'POST', headers: authed(token), body: JSON.stringify({ story: completedLine(avatar.id) }),
  })
  assert.equal(response.status, 200, 'publish to store')
  return (await response.json()).book
}

const postRead = (base, token, bookId) => fetch(`${base}/api/store/${bookId}/read`, {
  method: 'POST', headers: token ? authed(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
})

test('read route: guests 401, author uncounted, reader counted once, detail shows the total', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'read_author')
  const reader = await register(base, 'read_reader')
  const book = await publishBook(base, author.token)
  assert.equal(book.readCount, 0, 'a freshly shelved book starts at an honest zero')

  const guest = await postRead(base, null, book.id)
  assert.equal(guest.status, 401, 'guests never count')

  const authorRead = await postRead(base, author.token, book.id)
  assert.equal(authorRead.status, 200)
  assert.deepEqual(await authorRead.json(), { readCount: 0, counted: false }, 'the author opening their own book')

  const first = await postRead(base, reader.token, book.id)
  assert.deepEqual(await first.json(), { readCount: 1, counted: true })
  const again = await postRead(base, reader.token, book.id)
  assert.deepEqual(await again.json(), { readCount: 1, counted: false }, 'same reader, same day')

  const detailResponse = await fetch(`${base}/api/store/${book.id}`, { headers: ORIGIN })
  assert.equal(detailResponse.status, 200)
  assert.equal((await detailResponse.json()).book.readCount, 1, 'the detail payload carries the total the page renders')

  const missing = await postRead(base, reader.token, 'pub-nope')
  assert.equal(missing.status, 404)
})

// ---- Source guards: route wiring and the one display surface --------

test('read-count wiring: route, client helper, and the detail-only display', () => {
  const indexSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8')
  assert.match(indexSource, /storeReadMatch/, 'the /api/store/:id/read route exists')
  assert.match(indexSource, /plaza\.recordRead/, 'the route lands on the plaza service')

  const clientSource = readFileSync(new URL('../src/plaza.js', import.meta.url), 'utf8')
  assert.match(clientSource, /export async function recordPlazaRead/, 'the client helper exists')
  assert.match(clientSource, /\/read`/, 'the helper posts to the read route')

  const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.equal(mainSource.split('阅读量 {countTextFor(detail.readCount)}').length - 1, 1, 'exactly one render of the count')
  const detailStart = mainSource.indexOf('function PlazaDetail')
  const detailEnd = mainSource.indexOf('function formatProfileDate', detailStart)
  assert.ok(detailStart >= 0 && detailEnd > detailStart, 'detail component located')
  assert.ok(mainSource.slice(detailStart, detailEnd).includes('阅读量 {countTextFor(detail.readCount)}'), 'the count renders in the book detail meta line')
  const cardStart = mainSource.indexOf('function StoreBookCard')
  const cardEnd = mainSource.indexOf('function Store(', cardStart)
  assert.ok(cardStart >= 0 && cardEnd > cardStart, 'store card located')
  assert.ok(!mainSource.slice(cardStart, cardEnd).includes('阅读量'), 'the bookstore card does not render a read count')
  assert.match(mainSource, /recordPlazaRead\(\{ id: publicationId/, 'the reader open fires the record')
})
