import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createLibraryService, splitChapterChunks, CHUNK_BUDGET_BYTES } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createServer } from '../server/index.js'

const alice = { uid: 'user-library-a', email: null, displayName: '甲', emailVerified: false, provider: 'username' }
const bob = { uid: 'user-library-b', email: null, displayName: '乙', emailVerified: false, provider: 'username' }

function chapter(index, text) {
  const base = {
    id: `ch-${index}`,
    title: `第 ${index + 1} 章`,
    index,
    paragraphs: [text ?? `第 ${index + 1} 章的正文。`],
    summary: '',
    events: [`事件 ${index}`],
    foreshadowing: [],
  }
  if (index % 6 === 1) base.choice = { prompt: '如何抉择？', options: [{ id: 'open', label: '迎上去' }, { id: 'wait', label: '再等等' }] }
  if (index % 6 === 3) base.choice = { prompt: '如何抉择？', options: [{ id: 'cross', label: '渡河' }, { id: 'return', label: '回头' }] }
  return base
}

function storyWith(id, chapterCount, { paraChars = 30, updatedAt = '2026-10-27T00:00:00.000Z', mode = 'season' } = {}) {
  const total = { season: 24, long: 100, short: 6 }[mode]
  const chapters = Array.from({ length: chapterCount }, (_, index) => chapter(index, '字'.repeat(paraChars)))
  return {
    id,
    title: `书·${id}`,
    genreId: 'fantasy',
    config: { protagonist: '旅人', storyLengthMode: mode },
    worldBible: { premise: '一个测试世界。', rules: ['规则一'], outline: ['开端', '发展'] },
    chapterIndex: Math.min(chapterCount, total - 1),
    chapters,
    choices: {},
    revision: 1,
    readerIndex: Math.max(0, chapterCount - 1),
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt,
    status: 'reading',
  }
}

function fakeService() {
  const store = createMemoryLibraryStore()
  const service = createLibraryService({ env: {}, store })
  return { service, store }
}

test('splitChapterChunks keeps small stories in one chunk and preserves order when splitting', () => {
  const small = storyWith('small', 3)
  const smallChunks = splitChapterChunks(small.chapters)
  assert.equal(smallChunks.length, 1)
  assert.deepEqual(smallChunks[0], small.chapters)

  const big = storyWith('big', 30, { paraChars: 30_000, mode: 'long' })
  const chunks = splitChapterChunks(big.chapters)
  assert.ok(chunks.length > 1, 'a multi-MB story must split')
  for (const chunk of chunks) {
    assert.ok(Buffer.byteLength(JSON.stringify(chunk), 'utf8') <= CHUNK_BUDGET_BYTES, 'each chunk stays under the document budget')
  }
  assert.deepEqual(chunks.flat(), big.chapters, 'chunks reassemble to the exact chapter sequence')
  assert.deepEqual(splitChapterChunks([]), [])
})

test('splitChapterChunks rejects a single chapter beyond the document cap', () => {
  const huge = storyWith('huge', 1, { paraChars: 400_000 })
  assert.throws(() => splitChapterChunks(huge.chapters), (error) => error.status === 413)
})

test('put/get round-trips a story with config, world bible, choices and reading position intact', async () => {
  const { service } = fakeService()
  const story = storyWith('mist-01', 5)
  story.choices = { 1: 'open' }
  const saved = await service.putStory(alice, story.id, { story })
  assert.equal(saved.story.id, 'mist-01')
  assert.equal(saved.story.chapterCount, 5)
  assert.equal(saved.story.readerIndex, 4)

  const fetched = await service.getStory(alice, 'mist-01')
  assert.deepEqual(fetched, story)

  const index = await service.list(alice)
  assert.equal(index.stories.length, 1)
  assert.equal(index.stories[0].title, '书·mist-01')
  assert.equal(index.deleted.length, 0)
  assert.equal(index.readingState, null)
})

test('an oversized story is stored as head plus chunks and reassembles exactly', async () => {
  const { service, store } = fakeService()
  const story = storyWith('long-line', 30, { paraChars: 30_000, mode: 'long' })
  await service.putStory(alice, story.id, { story })
  const head = await store.getStoryHead(alice.uid, story.id)
  assert.ok(head.chunkCount > 1, 'the head records multiple chunks')
  assert.equal(head.chapters, undefined, 'the head itself carries no prose')
  const fetched = await service.getStory(alice, story.id)
  assert.deepEqual(fetched, story)
})

test('shrinking a story deletes its stale chunks', async () => {
  const { service, store } = fakeService()
  const big = storyWith('shrink', 30, { paraChars: 30_000, mode: 'long' })
  await service.putStory(alice, big.id, { story: big })
  const before = await store.getStoryHead(alice.uid, big.id)
  const small = storyWith('shrink', 2, { updatedAt: '2026-10-27T01:00:00.000Z' })
  await service.putStory(alice, small.id, { story: small })
  const after = await store.getStoryHead(alice.uid, small.id)
  assert.ok(after.chunkCount < before.chunkCount)
  assert.equal(await store.getChapterChunk(alice.uid, small.id, after.chunkCount), null, 'no stale chunk survives past the new count')
  assert.deepEqual(await service.getStory(alice, 'shrink'), small)
})

test('invalid stories and id mismatches are rejected without storing anything', async () => {
  const { service } = fakeService()
  const story = storyWith('bad-01', 2)
  await assert.rejects(service.putStory(alice, 'other-id', { story }), (error) => error.status === 400)
  await assert.rejects(
    service.putStory(alice, story.id, { story: { ...story, chapters: 'not-an-array' } }),
    (error) => error.status === 400,
  )
  await assert.rejects(
    service.putStory(alice, story.id, { story: { ...story, chapterIndex: 99 } }),
    (error) => error.status === 400,
  )
  assert.equal((await service.list(alice)).stories.length, 0)
})

test('chunked upload stays invisible until the head commit, then assembles and validates', async () => {
  const { service } = fakeService()
  const story = storyWith('chunked-01', 8, { paraChars: 30_000 })
  const { chapters, ...head } = story
  const chunks = splitChapterChunks(chapters)
  assert.ok(chunks.length > 1)
  let from = 0
  for (let index = 0; index < chunks.length; index += 1) {
    await service.putChunk(alice, story.id, index, { from, chapters: chunks[index] })
    from += chunks[index].length
  }
  await assert.rejects(service.getStory(alice, story.id), (error) => error.status === 404, 'no head yet, no story')
  assert.equal((await service.list(alice)).stories.length, 0, 'uncommitted chunks never reach the index')

  const committed = await service.putHead(alice, story.id, { story: head, chunkCount: chunks.length })
  assert.equal(committed.story.chapterCount, 8)
  assert.deepEqual(await service.getStory(alice, story.id), story)
})

test('head commit refuses missing chunks and inline prose', async () => {
  const { service } = fakeService()
  const story = storyWith('chunked-02', 4)
  const { chapters, ...head } = story
  await assert.rejects(
    service.putHead(alice, story.id, { story: head, chunkCount: 2 }),
    (error) => error.status === 502 || error.status === 400,
    'committing chunks that were never uploaded fails',
  )
  await assert.rejects(
    service.putHead(alice, story.id, { story, chunkCount: 0 }),
    (error) => error.status === 400,
    'a head carrying prose is not a chunked commit',
  )
  await assert.rejects(
    service.putChunk(alice, story.id, 0, { from: 1, chapters }),
    (error) => error.status === 400,
    'chapter indexes must continue from the declared offset',
  )
})

test('delete removes the story and leaves a tombstone; re-upload clears it', async () => {
  const { service } = fakeService()
  const story = storyWith('gone-01', 3)
  await service.putStory(alice, story.id, { story })
  await service.remove(alice, story.id)
  await assert.rejects(service.getStory(alice, story.id), (error) => error.status === 404)
  let index = await service.list(alice)
  assert.equal(index.stories.length, 0)
  assert.equal(index.deleted.length, 1)
  assert.equal(index.deleted[0].id, 'gone-01')
  assert.ok(Date.parse(index.deleted[0].deletedAt) > 0)

  await service.putStory(alice, story.id, { story })
  index = await service.list(alice)
  assert.equal(index.stories.length, 1)
  assert.equal(index.deleted.length, 0, 'uploading the book again clears its tombstone')
})

test('reading state round-trips through the index and validates its shape', async () => {
  const { service } = fakeService()
  const state = {
    version: 1,
    locations: [{ key: 'private:gone-01:0:abc', anchor: { paragraph: 2, offset: 0.5 } }],
    bookmarks: [],
  }
  await service.putReadingState(alice, { state, updatedAt: '2026-10-27T02:00:00.000Z' })
  const index = await service.list(alice)
  assert.deepEqual(index.readingState.state, state)
  assert.equal(index.readingState.updatedAt, '2026-10-27T02:00:00.000Z')
  await assert.rejects(
    service.putReadingState(alice, { state: { version: 2, locations: [], bookmarks: [] } }),
    (error) => error.status === 400,
  )
  await assert.rejects(
    service.putReadingState(alice, { state: { version: 1, locations: [{ key: 'x' }], bookmarks: [] } }),
    (error) => error.status === 400,
  )
})

test('one account can never reach another account\u2019s books', async () => {
  const { service } = fakeService()
  const story = storyWith('private-01', 3)
  await service.putStory(alice, story.id, { story })
  await assert.rejects(service.getStory(bob, story.id), (error) => error.status === 404)
  assert.equal((await service.list(bob)).stories.length, 0)
  await service.remove(bob, story.id)
  assert.equal((await service.list(alice)).stories.length, 1, 'a stranger\u2019s delete touches only their own (empty) shelf')
  assert.equal((await service.list(bob)).deleted.length, 1, 'the tombstone lands on the caller\u2019s own index')
})

test('without a configured store the service reports itself unconfigured', async () => {
  const service = createLibraryService({ env: {}, store: null })
  assert.equal(service.available, false)
  await assert.rejects(service.list(alice), (error) => error.status === 503)
})

async function startLibraryServer(t) {
  const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
  const server = createServer({
    env,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return `http://127.0.0.1:${server.address().port}`
}

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'library-pass-123' }),
  })
  assert.equal(response.status, 200)
  const { token } = await response.json()
  return { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}` }
}

test('library HTTP routes require login and keep accounts apart', async (t) => {
  const base = await startLibraryServer(t)
  const anon = await fetch(`${base}/api/library`)
  assert.equal(anon.status, 401)

  const aliceAuth = await register(base, 'library_route_a')
  const story = storyWith('route-01', 4)
  const put = await fetch(`${base}/api/library/stories/${story.id}`, {
    method: 'PUT', headers: { ...aliceAuth, 'Content-Type': 'application/json' }, body: JSON.stringify({ story }),
  })
  assert.equal(put.status, 200)
  assert.equal((await put.json()).story.chapterCount, 4)

  const listResponse = await fetch(`${base}/api/library`, { headers: aliceAuth })
  assert.equal(listResponse.status, 200)
  const list = await listResponse.json()
  assert.equal(list.stories.length, 1)
  assert.equal(list.stories[0].id, 'route-01')

  const got = await fetch(`${base}/api/library/stories/route-01`, { headers: aliceAuth })
  assert.equal(got.status, 200)
  assert.deepEqual((await got.json()).story, story)

  const bobAuth = await register(base, 'library_route_b')
  const bobList = await (await fetch(`${base}/api/library`, { headers: bobAuth })).json()
  assert.equal(bobList.stories.length, 0)
  const bobGet = await fetch(`${base}/api/library/stories/route-01`, { headers: bobAuth })
  assert.equal(bobGet.status, 404)

  const removed = await fetch(`${base}/api/library/stories/route-01`, { method: 'DELETE', headers: aliceAuth })
  assert.equal(removed.status, 200)
  const after = await (await fetch(`${base}/api/library`, { headers: aliceAuth })).json()
  assert.equal(after.stories.length, 0)
  assert.equal(after.deleted[0].id, 'route-01')
})
