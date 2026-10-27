import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createCoverService } from '../server/cover.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createServer } from '../server/index.js'
import { readingStateWithoutStory } from '../src/reading-location.js'

// DELETE-BOOK batch: deleting a book removes the whole book — the cloud
// library copy (with a tombstone for other devices), the line's plaza
// publication and its generated cover — and nothing else. Derived lines
// (entered or fused copies) are independent records and stay.

const alice = { uid: 'user-delete-a', email: null, displayName: '甲', emailVerified: false, provider: 'username' }
const bob = { uid: 'user-delete-b', email: null, displayName: '乙', emailVerified: false, provider: 'username' }

function publicationRecord(id, authorUid, sourceStoryId) {
  return {
    id,
    authorUid,
    authorName: '甲',
    sourceStoryId,
    title: `线·${sourceStoryId}`,
    genreId: 'fantasy',
    chapterCount: 24,
    snapshot: { id: sourceStoryId, chapters: [] },
    status: 'published',
    reporters: [],
    createdAt: '2026-10-27T00:00:00.000Z',
    publishedAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
  }
}

test('plaza removeForStory deletes only the caller’s own publication for the story', async () => {
  const store = createMemoryPlazaStore()
  await store.putPublication(publicationRecord('pub-a1', alice.uid, 'line-01'))
  await store.putPublication(publicationRecord('pub-b1', bob.uid, 'line-01'))
  const service = createPlazaService({ env: {}, store, avatarStore: null, socialStore: null, coverStore: null })

  // A stranger asking for the same source story removes nothing: the
  // lookup is scoped to the caller's uid, so existence never leaks.
  const stranger = await service.removeForStory(bob, 'line-02')
  assert.deepEqual(stranger, { removed: false, id: null })

  const removed = await service.removeForStory(alice, 'line-01')
  assert.deepEqual(removed, { removed: true, id: 'pub-a1' })
  const remaining = await store.listPublications()
  assert.equal(remaining.length, 1, 'the other author’s publication of a same-id line is untouched')
  assert.equal(remaining[0].id, 'pub-b1')
  await assert.rejects(service.detail('pub-a1'), (error) => error.status === 404)

  // Idempotent: deleting the book again finds nothing left to remove.
  assert.deepEqual(await service.removeForStory(alice, 'line-01'), { removed: false, id: null })
})

test('cover remove deletes the caller’s cover record and is idempotent', async () => {
  const store = createMemoryCoverStore()
  await store.putCover(alice.uid, 'line-01', { uid: alice.uid, storyId: 'line-01', version: 2, image: 'aGVsbG8=', contentType: 'image/jpeg' })
  await store.putCover(bob.uid, 'line-01', { uid: bob.uid, storyId: 'line-01', version: 1, image: 'd29ybGQ=', contentType: 'image/jpeg' })
  const service = createCoverService({ env: {}, store, imageGenerate: async () => { throw new Error('unused') } })

  assert.deepEqual(await service.remove(bob, 'line-02'), { removed: false })
  assert.deepEqual(await service.remove(alice, 'line-01'), { removed: true })
  assert.equal(await store.getCover(alice.uid, 'line-01'), null)
  assert.deepEqual(await service.meta(alice, 'line-01'), { status: 'none', version: 0 })
  assert.ok(await store.getCover(bob.uid, 'line-01'), 'another account’s cover of a same-id line survives')
  assert.deepEqual(await service.remove(alice, 'line-01'), { removed: false }, 'a repeat delete is a no-op success')
})

test('readingStateWithoutStory prunes only the deleted book’s positions and bookmarks', () => {
  const state = {
    version: 1,
    locations: [
      { key: 'private:line-01:0:abc', anchor: { paragraph: 0, offset: 0 } },
      { key: 'private:line-02:3:def', anchor: { paragraph: 1, offset: 0.5 } },
      { key: 'public:line-01:2:ghi', anchor: { paragraph: 2, offset: 0 } },
    ],
    bookmarks: [
      { key: 'private:line-01:1:jkl', storyId: 'line-01', chapterIndex: 1, anchor: { paragraph: 0, offset: 0 }, title: '一', excerpt: 'x' },
      { key: 'private:line-02:0:mno', storyId: 'line-02', chapterIndex: 0, anchor: { paragraph: 0, offset: 0 }, title: '二', excerpt: 'y' },
    ],
  }
  const pruned = readingStateWithoutStory(state, 'line-01')
  assert.deepEqual(pruned.locations.map((entry) => entry.key), ['private:line-02:3:def'])
  assert.deepEqual(pruned.bookmarks.map((entry) => entry.storyId), ['line-02'])
  assert.equal(state.locations.length, 3, 'the input state is not mutated')
  assert.equal(readingStateWithoutStory(null, 'line-01'), null)
  assert.equal(readingStateWithoutStory(state, ''), state)
})

function storyWith(id) {
  return {
    id,
    title: `书·${id}`,
    genreId: 'fantasy',
    config: { protagonist: '旅人', storyLengthMode: 'season' },
    worldBible: { premise: '一个测试世界。', rules: ['规则一'], outline: ['开端'] },
    chapterIndex: 1,
    chapters: [{
      id: `ch-${id}-0`, title: '第一章', index: 0,
      paragraphs: ['正文。'], summary: '', events: ['事件'], foreshadowing: [],
    }],
    choices: {},
    revision: 1,
    readerIndex: 0,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    status: 'reading',
  }
}

async function startDeleteServer(t) {
  const libraryStore = createMemoryLibraryStore()
  const plazaStore = createMemoryPlazaStore()
  const coverStore = createMemoryCoverStore()
  const library = createLibraryService({ env: {}, store: libraryStore })
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore: null, socialStore: null, coverStore })
  const cover = createCoverService({ env: {}, store: coverStore, imageGenerate: async () => { throw new Error('unused') } })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
    library,
    plaza,
    cover,
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, libraryStore, plazaStore, coverStore }
}

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'delete-book-pass-1' }),
  })
  assert.equal(response.status, 200)
  const json = await response.json()
  return { uid: json.uid, headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${json.token}` } }
}

test('DELETE /api/library/stories/:id removes book, tombstone, publication and cover together', async (t) => {
  const { base, plazaStore, coverStore } = await startDeleteServer(t)
  const aliceAuth = await register(base, 'delete_book_a')
  const bobAuth = await register(base, 'delete_book_b')
  const story = storyWith('gone-01')

  const put = await fetch(`${base}/api/library/stories/${story.id}`, {
    method: 'PUT', headers: { ...aliceAuth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ story }),
  })
  assert.equal(put.status, 200)
  await plazaStore.putPublication(publicationRecord('pub-gone-01', aliceAuth.uid, story.id))
  await coverStore.putCover(aliceAuth.uid, story.id, {
    uid: aliceAuth.uid, storyId: story.id, version: 1, image: 'aGVsbG8=', contentType: 'image/jpeg',
  })

  // Anonymous callers are refused before anything is touched.
  const anon = await fetch(`${base}/api/library/stories/${story.id}`, { method: 'DELETE', headers: { Origin: 'http://localhost:5173' } })
  assert.equal(anon.status, 401)

  // A non-owner delete only ever writes into the caller's own empty
  // keyspace: the book, publication and cover all survive it.
  const strangerDelete = await fetch(`${base}/api/library/stories/${story.id}`, { method: 'DELETE', headers: bobAuth.headers })
  assert.equal(strangerDelete.status, 200)
  const aliceIndex = await (await fetch(`${base}/api/library`, { headers: aliceAuth.headers })).json()
  assert.equal(aliceIndex.stories.length, 1, 'the owner’s book survives a stranger’s delete')
  assert.equal((await plazaStore.listPublications()).length, 1, 'the publication survives a stranger’s delete')
  assert.ok(await coverStore.getCover(aliceAuth.uid, story.id), 'the cover survives a stranger’s delete')
  const bobIndex = await (await fetch(`${base}/api/library`, { headers: bobAuth.headers })).json()
  assert.equal(bobIndex.deleted.length, 1, 'the tombstone lands on the caller’s own index only')

  // The owner's delete takes the whole book in one call.
  const removed = await fetch(`${base}/api/library/stories/${story.id}`, { method: 'DELETE', headers: aliceAuth.headers })
  assert.equal(removed.status, 200)
  const after = await (await fetch(`${base}/api/library`, { headers: aliceAuth.headers })).json()
  assert.equal(after.stories.length, 0)
  assert.equal(after.deleted.length, 1)
  assert.equal(after.deleted[0].id, story.id, 'a tombstone remains so other devices remove their copies')
  const got = await fetch(`${base}/api/library/stories/${story.id}`, { headers: aliceAuth.headers })
  assert.equal(got.status, 404)
  assert.equal((await plazaStore.listPublications()).length, 0, 'the plaza publication is deleted with the book')
  const feed = await (await fetch(`${base}/api/plaza`, { headers: { Origin: 'http://localhost:5173' } })).json()
  assert.equal(feed.publications.length, 0, 'the line no longer appears in the plaza feed')
  assert.equal(await coverStore.getCover(aliceAuth.uid, story.id), null, 'the generated cover is deleted with the book')

  // Idempotent: deleting the same book again still succeeds.
  const again = await fetch(`${base}/api/library/stories/${story.id}`, { method: 'DELETE', headers: aliceAuth.headers })
  assert.equal(again.status, 200)
  const finalIndex = await (await fetch(`${base}/api/library`, { headers: aliceAuth.headers })).json()
  assert.equal(finalIndex.deleted.length, 1, 'the tombstone is not duplicated')
})
