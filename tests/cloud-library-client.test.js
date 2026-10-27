import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCloudSync,
  fetchLibraryIndex,
  planMerge,
  splitStoryForUpload,
  uploadStory,
} from '../src/cloud-library.js'

const T1 = '2026-10-20T00:00:00.000Z'
const T2 = '2026-10-25T00:00:00.000Z'
const T3 = '2026-10-27T00:00:00.000Z'

const localStory = (id, updatedAt, extra = {}) => ({ id, title: `书·${id}`, updatedAt, chapters: [], ...extra })
const cloudEntry = (id, updatedAt) => ({ id, title: `书·${id}`, updatedAt, chapterCount: 0 })

test('planMerge uploads local-only books and downloads cloud-only ones', () => {
  const plan = planMerge({
    localStories: [localStory('mine', T1)],
    cloudStories: [cloudEntry('theirs', T1)],
    deleted: [],
    synced: {},
  })
  assert.deepEqual(plan.upload, ['mine'])
  assert.deepEqual(plan.download, ['theirs'])
  assert.deepEqual(plan.removeLocal, [])
  assert.deepEqual(plan.propagateDelete, [])
})

test('planMerge lets the newer copy win in both directions and leaves equal copies alone', () => {
  const plan = planMerge({
    localStories: [localStory('a', T3), localStory('b', T1), localStory('c', T2)],
    cloudStories: [cloudEntry('a', T2), cloudEntry('b', T3), cloudEntry('c', T2)],
    deleted: [],
    synced: {},
  })
  assert.deepEqual(plan.upload, ['a'])
  assert.deepEqual(plan.download, ['b'])
  assert.ok(!plan.upload.includes('c') && !plan.download.includes('c'), 'equal timestamps mean in sync')
})

test('planMerge applies tombstones only when the deletion is at least as new as the local copy', () => {
  const removed = planMerge({
    localStories: [localStory('gone', T1)],
    cloudStories: [],
    deleted: [{ id: 'gone', deletedAt: T2 }],
    synced: {},
  })
  assert.deepEqual(removed.removeLocal, ['gone'])
  assert.deepEqual(removed.upload, [])

  const resurrected = planMerge({
    localStories: [localStory('gone', T3)],
    cloudStories: [],
    deleted: [{ id: 'gone', deletedAt: T2 }],
    synced: {},
  })
  assert.deepEqual(resurrected.removeLocal, [], 'a local edit after the deletion resurrects the book')
  assert.deepEqual(resurrected.upload, ['gone'])
})

test('planMerge tells a local deletion apart from a book this device never had', () => {
  const plan = planMerge({
    localStories: [],
    cloudStories: [cloudEntry('deleted-here', T1), cloudEntry('edited-elsewhere', T3), cloudEntry('never-seen', T1)],
    deleted: [],
    synced: { 'deleted-here': T1, 'edited-elsewhere': T2 },
  })
  assert.deepEqual(plan.propagateDelete, ['deleted-here'])
  assert.deepEqual(plan.download, ['edited-elsewhere', 'never-seen'])
})

test('planMerge never travels demo stories', () => {
  const plan = planMerge({
    localStories: [localStory('demo', T3, { isDemo: true })],
    cloudStories: [],
    deleted: [{ id: 'demo', deletedAt: T3 }],
    synced: {},
  })
  assert.deepEqual(plan.upload, [])
  assert.deepEqual(plan.removeLocal, [])
})

test('splitStoryForUpload sends small stories whole and chunks oversized ones losslessly', () => {
  const small = localStory('small', T1)
  assert.deepEqual(splitStoryForUpload(small), { mode: 'single' })

  const chapters = Array.from({ length: 12 }, (_, index) => ({
    id: `ch-${index}`, title: `第 ${index + 1} 章`, index, paragraphs: ['字'.repeat(60_000)],
  }))
  const big = { ...localStory('big', T1), chapters }
  const plan = splitStoryForUpload(big)
  assert.equal(plan.mode, 'chunked')
  assert.equal(plan.head.chapters, undefined, 'the head carries no prose')
  assert.deepEqual(plan.chunks.flatMap((chunk) => chunk.chapters), chapters, 'chunks reassemble to the full sequence')
  let expectedFrom = 0
  for (const chunk of plan.chunks) {
    assert.equal(chunk.from, expectedFrom)
    expectedFrom += chunk.chapters.length
    assert.ok(new TextEncoder().encode(JSON.stringify({ from: chunk.from, chapters: chunk.chapters })).length <= 900_000)
  }
})

function recordingFetch(handler) {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
    return handler(url, options)
  }
  return { calls, fetchImpl }
}

test('uploadStory uses one PUT for a small story and chunk PUTs plus a head commit for a big one', async () => {
  const { calls, fetchImpl } = recordingFetch(async () => Response.json({ ok: true }))
  const getAccessToken = async () => 'token-fixture'

  await uploadStory({ story: localStory('small', T1), getAccessToken, fetchImpl })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'PUT')
  assert.equal(calls[0].url, '/api/library/stories/small')

  calls.length = 0
  const chapters = Array.from({ length: 12 }, (_, index) => ({
    id: `ch-${index}`, title: `第 ${index + 1} 章`, index, paragraphs: ['字'.repeat(60_000)],
  }))
  await uploadStory({ story: { ...localStory('big', T1), chapters }, getAccessToken, fetchImpl })
  assert.ok(calls.length > 2, 'chunk PUTs plus the head commit')
  assert.match(calls[calls.length - 1].url, /\/head$/, 'the head commit lands last')
  for (const call of calls.slice(0, -1)) assert.match(call.url, /\/chunks\/\d+$/)
})

test('fetchLibraryIndex treats an unoffered cloud library as null, not an error', async () => {
  const unavailable = async () => new Response(JSON.stringify({ error: '云端书架尚未开通，故事仍保存在本机。' }), { status: 503 })
  assert.equal(await fetchLibraryIndex({ getAccessToken: async () => 't', fetchImpl: unavailable }), null)
  const offered = async () => Response.json({ stories: [cloudEntry('x', T1)], deleted: [], readingState: null })
  const index = await fetchLibraryIndex({ getAccessToken: async () => 't', fetchImpl: offered })
  assert.equal(index.stories.length, 1)
})

class MemoryStorage {
  constructor() { this.map = new Map() }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null }
  setItem(key, value) { this.map.set(key, String(value)) }
  removeItem(key) { this.map.delete(key) }
}

function syncFixture({ index, stories = {}, failUploads = false } = {}) {
  const storage = new MemoryStorage()
  const uploads = []
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET'
    if (url === '/api/library' && method === 'GET') return Response.json(index)
    const storyMatch = url.match(/^\/api\/library\/stories\/([^/]+)$/)
    if (storyMatch && method === 'GET') {
      const story = stories[decodeURIComponent(storyMatch[1])]
      return story ? Response.json({ story }) : new Response(JSON.stringify({ error: '这本书还没有同步到云端。' }), { status: 404 })
    }
    if (storyMatch && method === 'PUT') {
      if (failUploads) return new Response(JSON.stringify({ error: 'down' }), { status: 502 })
      uploads.push(JSON.parse(options.body).story)
      return Response.json({ story: { id: decodeURIComponent(storyMatch[1]) } })
    }
    if (method === 'DELETE') return Response.json({ ok: true })
    if (url === '/api/library/reading-state') return Response.json({ ok: true })
    throw new Error(`unexpected fetch ${method} ${url}`)
  }
  const sync = createCloudSync({
    getAccessToken: async () => 'token-fixture',
    fetchImpl,
    storage,
    debounceMs: 5,
  })
  return { sync, storage, uploads }
}

test('merge uploads local-only books, downloads cloud-only ones and applies tombstones', async () => {
  const cloudStory = { id: 'cloud-book', title: '云端的书', updatedAt: T2, chapters: [] }
  const { sync, uploads } = syncFixture({
    index: {
      stories: [cloudEntry('cloud-book', T2)],
      deleted: [{ id: 'dead-book', deletedAt: T3 }],
      readingState: null,
    },
    stories: { 'cloud-book': cloudStory },
  })
  const applied = []
  const result = await sync.merge({
    uid: 'uid-merge',
    library: { stories: [localStory('local-book', T1), localStory('dead-book', T1)] },
    applyRemote: (change) => applied.push(change),
    readReadingStateRaw: () => null,
    writeReadingStateRaw: () => {},
  })
  assert.equal(result.status, 'ok')
  assert.deepEqual(uploads.map((story) => story.id), ['local-book'])
  assert.equal(applied.length, 1)
  assert.deepEqual(applied[0].add, [cloudStory])
  assert.deepEqual(applied[0].removeIds, ['dead-book'])
  assert.equal(result.downloaded, 1)
  assert.equal(result.removed, 1)
})

test('merge restores the reading state into an empty device and reports unavailability quietly', async () => {
  const state = { version: 1, locations: [{ key: 'k', anchor: { paragraph: 1, offset: 0 } }], bookmarks: [] }
  const { sync } = syncFixture({
    index: { stories: [], deleted: [], readingState: { state, updatedAt: T2 } },
  })
  let written = null
  await sync.merge({
    uid: 'uid-reading',
    library: { stories: [] },
    applyRemote: () => {},
    readReadingStateRaw: () => null,
    writeReadingStateRaw: (raw) => { written = raw },
  })
  assert.deepEqual(JSON.parse(written), state)

  const down = createCloudSync({
    getAccessToken: async () => 't',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'x' }), { status: 503 }),
    storage: new MemoryStorage(),
  })
  const result = await down.merge({
    uid: 'uid-down', library: { stories: [] }, applyRemote: () => {},
    readReadingStateRaw: () => null, writeReadingStateRaw: () => {},
  })
  assert.equal(result.status, 'unavailable')
})

test('observe writes changes through and keeps failures pending for the next trigger', async () => {
  let failing = true
  const storage = new MemoryStorage()
  const uploads = []
  const fetchImpl = async (url, options = {}) => {
    if ((options.method || 'GET') === 'PUT' && url.startsWith('/api/library/stories/')) {
      if (failing) return new Response(JSON.stringify({ error: 'down' }), { status: 502 })
      uploads.push(JSON.parse(options.body).story.id)
      return Response.json({ story: {} })
    }
    return Response.json({})
  }
  const sync = createCloudSync({ getAccessToken: async () => 't', fetchImpl, storage, debounceMs: 5 })
  const story = localStory('watched', T1)
  sync.observe({ uid: 'uid-observe', stories: [story], readReadingStateRaw: () => null })
  await sync.flush('uid-observe')
  assert.equal(sync.pendingCount('uid-observe'), 1, 'a failed upload stays pending instead of erroring')
  assert.deepEqual(uploads, [])

  failing = false
  await sync.flush('uid-observe')
  assert.equal(sync.pendingCount('uid-observe'), 0)
  assert.deepEqual(uploads, ['watched'])

  sync.observe({ uid: 'uid-observe', stories: [story], readReadingStateRaw: () => null })
  await sync.flush('uid-observe')
  assert.deepEqual(uploads, ['watched'], 'an unchanged story is not uploaded twice')
})
