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
import { cleanBookTitle } from '../src/plaza.js'
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
import { createMemoryPlazaFeedStore, createPlazaFeedStore } from '../server/plaza-feed-store.js'
import { migrateStoreBooksAndFeed, OFFICIAL_POST_ID, USER_POST_ID } from '../server/migrations/20261029_store_books_and_feed.mjs'
import { createServer } from '../server/index.js'

// BOOKSTORE-PLAZA batch: 发布 = 上架书城 (catalogue: shelves, search,
// sorts), 广场 = one social stream (share posts + free posts, likes,
// comments), 删帖不动书, and the 存量 migration that cleans the
// auto-composed 「 · 化身名」 title suffix off the two live books.

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

function completedLine(avatarId, genreId = 'cultivation') {
  return {
    ...walkLocal(createStory({
      genreId,
      genreTemplateId: genreId === 'cultivation' ? 'xianxia' : 'doomsday',
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
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
  const social = createSocialService({
    env: {}, store: createMemorySocialStore(), plazaStore, avatarStore, feedStore,
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
  return { base: `http://127.0.0.1:${server.address().port}`, plazaStore, feedStore }
}

const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'story-pass-1' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const body = await response.json()
  return { token: body.token }
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

async function publishBook(base, token, avatarId, genreId) {
  const response = await fetch(`${base}/api/store/publish`, {
    method: 'POST', headers: authed(token), body: JSON.stringify({ story: completedLine(avatarId, genreId) }),
  })
  assert.equal(response.status, 200, 'publish to store')
  return (await response.json()).book
}

test('cleanBookTitle strips only the exact avatar suffix', () => {
  assert.equal(cleanBookTitle('沉潮港纪事 · 沈知遥', '沈知遥'), '沉潮港纪事')
  assert.equal(cleanBookTitle('疯狂的王兴润 · 王兴润', '王兴润'), '疯狂的王兴润')
  assert.equal(cleanBookTitle('潮声之外', '沈砚'), '潮声之外')
  assert.equal(cleanBookTitle('潮声 · 别人', '沈砚'), '潮声 · 别人', 'a different name is part of the title')
  assert.equal(cleanBookTitle('沉潮港纪事 · 沈知遥', ''), '沉潮港纪事 · 沈知遥')
  assert.equal(cleanBookTitle('', '沈砚'), '')
})

test('store: publish cleans the title, shelves filter, search and sorts are real', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'store_author')
  const avatar = await makeAvatar(base, author.token)
  const book = await publishBook(base, author.token, avatar.id)
  assert.ok(!book.title.includes(' · 沈砚'), 'the shelved title drops the avatar suffix')
  assert.equal(book.shelfId, 'xuanzhen')
  assert.equal(book.shareCount, 0)
  assert.equal(book.ratingCount, 0)

  const shelfHit = await (await fetch(`${base}/api/store?shelf=xuanzhen`)).json()
  assert.equal(shelfHit.total, 1)
  const shelfMiss = await (await fetch(`${base}/api/store?shelf=horror`)).json()
  assert.equal(shelfMiss.total, 0)
  const found = await (await fetch(`${base}/api/store?q=${encodeURIComponent(book.title.slice(0, 2))}`)).json()
  assert.equal(found.total, 1)
  const notFound = await (await fetch(`${base}/api/store?q=${encodeURIComponent('不存在的书名xyz')}`)).json()
  assert.equal(notFound.total, 0)

  const completed = await (await fetch(`${base}/api/store?sort=complete`)).json()
  assert.equal(completed.total, 1, 'a finished season line is on the 完本 sort')
  // 热门 with no engagement at all: the order falls back to recency and
  // the counts stay honest zeros.
  const hot = await (await fetch(`${base}/api/store?sort=hot`)).json()
  assert.equal(hot.books[0].shareCount, 0)
})

test('feed: free post, share post, like toggle, comments, notifications', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'feed_author')
  const reader = await register(base, 'feed_reader')
  const avatar = await makeAvatar(base, author.token)
  const book = await publishBook(base, author.token, avatar.id)

  // Free text post.
  const free = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token),
    body: JSON.stringify({ type: 'free_text', content: '今天把第一季写完了，撒花。' }),
  })
  assert.equal(free.status, 200)
  const freePost = (await free.json()).post
  assert.equal(freePost.type, 'free_text')
  assert.equal(freePost.likeCount, 0)

  // Share post from the book; the book's shareCount moves with it.
  const share = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token),
    body: JSON.stringify({ type: 'book_share', content: '安利一下我刚上架的书。', bookId: book.id }),
  })
  assert.equal(share.status, 200)
  const sharePost = (await share.json()).post
  assert.equal(sharePost.book.id, book.id)
  assert.equal(sharePost.book.title, book.title)
  const storeAfter = await (await fetch(`${base}/api/store`)).json()
  assert.equal(storeAfter.books[0].shareCount, 1)

  // The stream is newest first and carries both post shapes.
  const feed = await (await fetch(`${base}/api/plaza`)).json()
  assert.deepEqual(feed.posts.map((post) => post.id), [sharePost.id, freePost.id])

  // Like toggles both ways; a self-like is allowed but never notifies.
  const like = await fetch(`${base}/api/plaza/posts/${sharePost.id}/like`, { method: 'POST', headers: authed(reader.token), body: '{}' })
  assert.equal(like.status, 200)
  assert.deepEqual(await like.json(), { liked: true, likeCount: 1 })
  const unlike = await fetch(`${base}/api/plaza/posts/${sharePost.id}/like`, { method: 'POST', headers: authed(reader.token), body: '{}' })
  assert.deepEqual(await unlike.json(), { liked: false, likeCount: 0 })
  await fetch(`${base}/api/plaza/posts/${sharePost.id}/like`, { method: 'POST', headers: authed(reader.token), body: '{}' })

  // Comment, then the author reads both notifications in 互动.
  const comment = await fetch(`${base}/api/plaza/posts/${sharePost.id}/comments`, {
    method: 'POST', headers: authed(reader.token), body: JSON.stringify({ text: '封面好好看，追了！' }),
  })
  assert.equal(comment.status, 200)
  const commentBody = (await comment.json()).comment
  const notifications = await (await fetch(`${base}/api/me/notifications`, { headers: authed(author.token) })).json()
  const activity = notifications.categories.activity.items
  assert.ok(activity.some((item) => item.kind === 'like' && item.target.postId === sharePost.id), 'the like lands in 互动')
  const commentNote = activity.find((item) => item.kind === 'comment')
  assert.ok(commentNote, 'the comment lands in 互动')
  assert.equal(commentNote.target.commentText, '封面好好看，追了！')

  // Comment deletion rights: a stranger cannot, the post owner can.
  const stranger = await register(base, 'feed_stranger')
  const forbidden = await fetch(`${base}/api/plaza/posts/${sharePost.id}/comments/${commentBody.id}`, { method: 'DELETE', headers: authed(stranger.token) })
  assert.equal(forbidden.status, 403)
  const removed = await fetch(`${base}/api/plaza/posts/${sharePost.id}/comments/${commentBody.id}`, { method: 'DELETE', headers: authed(author.token) })
  assert.equal(removed.status, 200)
  const thread = await (await fetch(`${base}/api/plaza/posts/${sharePost.id}/comments`)).json()
  assert.equal(thread.comments.length, 0)
  const detail = await (await fetch(`${base}/api/plaza/posts/${sharePost.id}`)).json()
  assert.equal(detail.post.commentCount, 0, 'the count follows the deletion')
})

test('deleting a share post never touches the book; withdrawing the book placeholders its cards', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'keep_author')
  const avatar = await makeAvatar(base, author.token)
  const book = await publishBook(base, author.token, avatar.id)
  const share = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token),
    body: JSON.stringify({ type: 'book_share', content: '分享一下。', bookId: book.id }),
  })
  const sharePost = (await share.json()).post

  // Delete the post: the book stays on the shelf, shareCount falls back.
  const deleted = await fetch(`${base}/api/plaza/posts/${sharePost.id}`, { method: 'DELETE', headers: authed(author.token) })
  assert.equal(deleted.status, 200)
  let store = await (await fetch(`${base}/api/store`)).json()
  assert.equal(store.total, 1, 'the book survives its post')
  assert.equal(store.books[0].shareCount, 0)

  // Share again, then withdraw the book: the post keeps an honest card.
  const share2 = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token),
    body: JSON.stringify({ type: 'book_share', content: '再分享一次。', bookId: book.id }),
  })
  const sharePost2 = (await share2.json()).post
  const withdrawn = await fetch(`${base}/api/store/${book.id}/withdraw`, { method: 'POST', headers: authed(author.token), body: '{}' })
  assert.equal(withdrawn.status, 200)
  store = await (await fetch(`${base}/api/store`)).json()
  assert.equal(store.total, 0, 'the withdrawn book leaves the shelf')
  const feed = await (await fetch(`${base}/api/plaza`)).json()
  const surviving = feed.posts.find((post) => post.id === sharePost2.id)
  assert.ok(surviving, 'the post itself survives the withdrawal')
  assert.equal(surviving.book.status, 'withdrawn')
  assert.equal(surviving.book.title, book.title, 'the placeholder keeps the shared title')
})

test('post guards: auth, length, unknown book, red-line scan, report hiding', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'guard_author')
  await makeAvatar(base, author.token)
  const anon = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'free_text', content: '匿名不行' }),
  })
  assert.equal(anon.status, 401)
  const empty = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({ type: 'free_text', content: '   ' }),
  })
  assert.equal(empty.status, 400)
  const tooLong = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({ type: 'free_text', content: '长'.repeat(501) }),
  })
  assert.equal(tooLong.status, 400)
  const ghostBook = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token),
    body: JSON.stringify({ type: 'book_share', content: '分享', bookId: 'pub-nope' }),
  })
  assert.equal(ghostBook.status, 400)

  const made = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({ type: 'free_text', content: '一条会被举报的帖子' }),
  })
  const post = (await made.json()).post
  const reporters = []
  for (const name of ['guard_r1', 'guard_r2', 'guard_r3']) reporters.push(await register(base, name))
  for (const reporter of reporters.slice(0, 2)) {
    const res = await fetch(`${base}/api/plaza/posts/${post.id}/report`, { method: 'POST', headers: authed(reporter.token), body: '{}' })
    assert.equal(res.status, 200)
  }
  let feed = await (await fetch(`${base}/api/plaza`)).json()
  assert.equal(feed.posts.length, 1, 'two reports do not hide yet')
  await fetch(`${base}/api/plaza/posts/${post.id}/report`, { method: 'POST', headers: authed(reporters[2].token), body: '{}' })
  feed = await (await fetch(`${base}/api/plaza`)).json()
  assert.equal(feed.posts.length, 0, 'the third distinct report hides the post')
})

test('migration: legacy records cleaned, counters landed, two honest seed posts, idempotent', async () => {
  const plazaStore = createMemoryPlazaStore()
  const feedStore = createMemoryPlazaFeedStore()
  const legacy = (id, title, authorUid, publishedAt) => ({
    id,
    authorUid,
    authorName: '快照名',
    genreId: 'mist',
    genreTemplateId: 'horror',
    worldId: 'custom',
    worldName: '雾港',
    title,
    premise: '前提',
    synopsis: '',
    status: 'published',
    completedAt: publishedAt,
    publishedAt,
    snapshot: { title, chapters: [{ paragraphs: ['正文'] }], worldBible: {}, config: { name: 'x' } },
    avatar: { name: title.split(' · ')[1] || '', description: '', appearanceText: '' },
  })
  await plazaStore.putPublication(legacy('pub-ff498576-b52', '沉潮港纪事 · 沈知遥', 'username:storyweave', '2026-10-27T10:00:00.000Z'))
  await plazaStore.putPublication(legacy('pub-520dce23-7d8', '疯狂的王兴润 · 王兴润', 'username:pangboya', '2026-10-28T08:00:00.000Z'))

  const result = await migrateStoreBooksAndFeed({ plazaStore, feedStore, now: () => new Date('2026-10-29T00:00:00.000Z') })
  assert.equal(result.titlesCleaned, 2)
  assert.equal(result.postsSeeded, 2)
  const records = await plazaStore.listPublications()
  const byId = new Map(records.map((record) => [record.id, record]))
  assert.equal(byId.get('pub-ff498576-b52').title, '沉潮港纪事')
  assert.equal(byId.get('pub-ff498576-b52').snapshot.title, '沉潮港纪事')
  assert.equal(byId.get('pub-520dce23-7d8').title, '疯狂的王兴润')
  assert.equal(byId.get('pub-ff498576-b52').shareCount, 1)
  assert.equal(byId.get('pub-ff498576-b52').ratingCount, 0)
  const posts = await feedStore.listPosts(10)
  assert.deepEqual(posts.map((post) => post.id).sort(), [OFFICIAL_POST_ID, USER_POST_ID].sort())
  assert.ok(posts.every((post) => post.likeCount === 0 && post.commentCount === 0), 'seeded engagement is honestly zero')

  const again = await migrateStoreBooksAndFeed({ plazaStore, feedStore, now: () => new Date('2026-10-29T01:00:00.000Z') })
  assert.equal(again.titlesCleaned, 0, 're-running cleans nothing twice')
  assert.equal(again.postsSeeded, 0, 're-running seeds nothing twice')
  assert.equal((await feedStore.listPosts(10)).length, 2)
})
