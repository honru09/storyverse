import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createStory,
  plazaSnapshot,
  renameChapterTitle,
  synopsisOf,
  updateSynopsis,
  CHAPTER_TITLE_MAX,
  SYNOPSIS_MAX,
} from '../src/story-engine.js'
import { loadLibrary, saveLibrary, validateLibrary } from '../src/persistence.js'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createServer } from '../server/index.js'

// EDIT-BOOK batch: the owner can edit their own book's synopsis and
// rename its chapters. The synopsis is a story field that rides the
// ordinary cloud sync; a chapter title is metadata, so renaming is not
// bound by the frontier rule — but ids, order and prose never move.

const hashOf = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function storyWith(id, overrides = {}) {
  return {
    id,
    title: `书·${id}`,
    genreId: 'fantasy',
    config: { protagonist: '旅人', storyLengthMode: 'season' },
    worldBible: { premise: '一个测试世界，潮声里藏着回信。', rules: ['规则一'], outline: ['开端'] },
    chapterIndex: 3,
    chapters: [
      { id: `ch-${id}-0`, title: '雾起', index: 0, paragraphs: ['正文一。'], summary: '', events: ['事件一'], foreshadowing: [] },
      { id: `ch-${id}-1`, title: '得信', index: 1, paragraphs: ['正文二。', '正文二续。'], summary: '', events: [], foreshadowing: [] },
      { id: `ch-${id}-2`, title: '启程', index: 2, paragraphs: ['正文三。'], summary: '', events: [], foreshadowing: [] },
    ],
    choices: {},
    revision: 3,
    readerIndex: 0,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    status: 'reading',
    ...overrides,
  }
}

test('updateSynopsis stores the owner’s blurb and leaves chapters untouched', () => {
  const story = storyWith('syn-01')
  const chaptersHash = hashOf(story.chapters)
  const next = updateSynopsis(story, '  守塔人收到一封没有署名的信，决定沿着潮声去找寄信的人。  ')
  assert.equal(next.synopsis, '守塔人收到一封没有署名的信，决定沿着潮声去找寄信的人。', 'the text is trimmed and stored on the story')
  assert.notEqual(next.updatedAt, story.updatedAt, 'updatedAt advances so the cloud sync carries the edit')
  assert.equal(hashOf(next.chapters), chaptersHash, 'chapters are byte-identical')
  assert.equal(next.revision, story.revision, 'the revision does not move for a presentation edit')
  assert.equal(story.synopsis, undefined, 'the input story is not mutated')
})

test('synopsisOf prefers the owner’s words and falls back to the premise', () => {
  const legacy = storyWith('syn-02')
  assert.equal(synopsisOf(legacy), '一个测试世界，潮声里藏着回信。', 'a pre-field book shows its premise, as its surfaces always did')
  const edited = updateSynopsis(legacy, '我自己写的简介。')
  assert.equal(synopsisOf(edited), '我自己写的简介。')
  const cleared = updateSynopsis(edited, '   ')
  assert.equal('synopsis' in cleared, false, 'saving an empty text clears the field')
  assert.equal(synopsisOf(cleared), '一个测试世界，潮声里藏着回信。', 'a cleared synopsis falls back to the premise again')
  assert.equal(updateSynopsis(edited, '我自己写的简介。'), edited, 'saving the same text is a no-op')
})

test('updateSynopsis rejects an over-long blurb with a human message', () => {
  const story = storyWith('syn-03')
  assert.throws(
    () => updateSynopsis(story, '长'.repeat(SYNOPSIS_MAX + 1)),
    (error) => error instanceof RangeError && error.message === `简介最多 ${SYNOPSIS_MAX} 字`,
  )
  assert.equal(updateSynopsis(story, '长'.repeat(SYNOPSIS_MAX)).synopsis.length, SYNOPSIS_MAX, 'the bound itself is allowed')
})

test('renameChapterTitle renames a sealed chapter and moves nothing else', () => {
  const story = storyWith('toc-01')
  const before = story.chapters.map((chapter) => ({ ...chapter }))
  // Chapter 0 is long sealed (the frontier is chapter 2): renaming it
  // must still work — titles are metadata, not prose.
  const next = renameChapterTitle(story, 0, '雾起青岚港')
  assert.equal(next.chapters[0].title, '雾起青岚港')
  assert.deepEqual(
    next.chapters.map((chapter) => chapter.id),
    before.map((chapter) => chapter.id),
    'chapter ids do not move',
  )
  assert.deepEqual(
    next.chapters.map((chapter) => chapter.index),
    before.map((chapter) => chapter.index),
    'chapter order does not move',
  )
  assert.equal(
    hashOf(next.chapters.map((chapter) => chapter.paragraphs)),
    hashOf(before.map((chapter) => chapter.paragraphs)),
    'prose hashes do not move',
  )
  assert.deepEqual(
    next.chapters.map((chapter, index) => (index === 0 ? chapter.title : chapter)),
    before.map((chapter, index) => (index === 0 ? '雾起青岚港' : chapter)),
    'only the one title differs across the whole chapter list',
  )
  assert.equal(next.revision, story.revision, 'the revision stays: a rename must not retire a pre-generated chapter')
  assert.notEqual(next.updatedAt, story.updatedAt, 'updatedAt advances so the rename syncs')
  assert.equal(story.chapters[0].title, '雾起', 'the input story is not mutated')
})

test('renameChapterTitle validates its input in human words', () => {
  const story = storyWith('toc-02')
  assert.equal(renameChapterTitle(story, 1, '得信'), story, 'renaming to the same title is a no-op')
  assert.equal(renameChapterTitle(story, 1, '  得信  '), story, 'a trim-equal title is a no-op too')
  assert.throws(() => renameChapterTitle(story, 1, '   '), /章节标题不能为空/)
  assert.throws(() => renameChapterTitle(story, 1, '题'.repeat(CHAPTER_TITLE_MAX + 1)), new RegExp(`章节标题最多 ${CHAPTER_TITLE_MAX} 字`))
  assert.equal(renameChapterTitle(story, 1, '题'.repeat(CHAPTER_TITLE_MAX)).chapters[1].title.length, CHAPTER_TITLE_MAX)
  assert.throws(() => renameChapterTitle(story, 9, '新标题'), /还没有写出来/)
  const readOnly = storyWith('toc-03', { readOnly: true })
  assert.equal(renameChapterTitle(readOnly, 0, '新标题'), readOnly, 'a read-only copy never renames')
})

test('the library validator bounds the synopsis and a save/load round-trip keeps edits', () => {
  const story = updateSynopsis(renameChapterTitle(storyWith('round-01'), 2, '向着潮声走'), '一封没有署名的信。')
  const library = { version: 2, stories: [story], activeStoryId: story.id, publications: [], favorites: [], draft: null }
  assert.deepEqual(validateLibrary(library), [], 'an edited book is a valid library')
  const tooLong = { ...library, stories: [{ ...story, synopsis: '长'.repeat(SYNOPSIS_MAX + 1) }] }
  assert.ok(validateLibrary(tooLong).some((error) => error.includes('synopsis')), 'an over-long synopsis is rejected at the storage layer')
  const notText = { ...library, stories: [{ ...story, synopsis: 42 }] }
  assert.ok(validateLibrary(notText).some((error) => error.includes('synopsis')), 'a non-string synopsis is rejected')

  const cells = new Map()
  const storage = {
    getItem: (key) => (cells.has(key) ? cells.get(key) : null),
    setItem: (key, value) => { cells.set(key, value) },
  }
  assert.deepEqual(saveLibrary(storage, library), { ok: true, error: null })
  const loaded = loadLibrary(storage)
  assert.equal(loaded.warning, null)
  assert.equal(loaded.library.stories[0].synopsis, '一封没有署名的信。')
  assert.equal(loaded.library.stories[0].chapters[2].title, '向着潮声走')
})

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

test('plazaSnapshot carries the synopsis only when the owner wrote one', () => {
  const base = walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    avatarId: 'avatar-edit-1',
    ability: '借火一瞬',
  }), 24)
  const plain = plazaSnapshot(base, { avatarName: '沈砚' })
  assert.equal('synopsis' in plain, false, 'no stored synopsis, no snapshot field — the detail falls back to the premise')
  const edited = updateSynopsis(base, '少年在破庙里借到一瞬火，从此每一步都要还。')
  const snapshot = plazaSnapshot(edited, { avatarName: '沈砚' })
  assert.equal(snapshot.synopsis, '少年在破庙里借到一瞬火，从此每一步都要还。', 'a re-publish carries the current synopsis')
})

async function startEditServer(t) {
  const libraryStore = createMemoryLibraryStore()
  const library = createLibraryService({ env: {}, store: libraryStore })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
    library,
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })
  return { base: `http://127.0.0.1:${server.address().port}` }
}

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'edit-book-pass-1' }),
  })
  assert.equal(response.status, 200)
  const json = await response.json()
  return { uid: json.uid, headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${json.token}` } }
}

test('edited books sync through the library: the owner’s edits land, a stranger’s same-id copy never overwrites them', async (t) => {
  const { base } = await startEditServer(t)
  const alice = await register(base, 'edit_book_a')
  const bob = await register(base, 'edit_book_b')
  const put = (auth, story) => fetch(`${base}/api/library/stories/${story.id}`, {
    method: 'PUT', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ story }),
  })
  const get = (auth, id) => fetch(`${base}/api/library/stories/${id}`, { headers: auth.headers })

  const original = storyWith('shared-id')
  assert.equal((await put(alice, original)).status, 200)

  // The owner edits: a synopsis plus two renamed chapters, saved
  // through the same whole-story sync every other edit uses.
  const edited = renameChapterTitle(renameChapterTitle(updateSynopsis(original, '守塔人的信，写给愿意启程的人。'), 0, '雾起时分'), 2, '向着潮声走')
  assert.equal((await put(alice, edited)).status, 200)
  const aliceCopy = await (await get(alice, original.id)).json()
  assert.equal(aliceCopy.story.synopsis, '守塔人的信，写给愿意启程的人。', 'the owner’s synopsis is on the account copy')
  assert.deepEqual(aliceCopy.story.chapters.map((chapter) => chapter.title), ['雾起时分', '得信', '向着潮声走'])

  // A stranger uploading a story under the same id writes into their
  // own keyspace only — the owner’s edited copy does not move, and the
  // stranger cannot read it either.
  const hostile = { ...storyWith('shared-id'), synopsis: '别人的简介', chapters: storyWith('shared-id').chapters.map((chapter) => ({ ...chapter, title: '被改掉' })) }
  assert.equal((await put(bob, hostile)).status, 200)
  const after = await (await get(alice, original.id)).json()
  assert.equal(after.story.synopsis, '守塔人的信，写给愿意启程的人。', 'the owner’s synopsis survives a stranger’s same-id upload')
  assert.deepEqual(after.story.chapters.map((chapter) => chapter.title), ['雾起时分', '得信', '向着潮声走'], 'the owner’s titles survive too')
  const bobCopy = await (await get(bob, original.id)).json()
  assert.equal(bobCopy.story.synopsis, '别人的简介', 'the stranger’s copy is their own, kept apart')

  // The storage-layer bound is enforced on the wire as well.
  const tooLong = { ...original, synopsis: '长'.repeat(SYNOPSIS_MAX + 1) }
  assert.equal((await put(alice, tooLong)).status, 400, 'an over-long synopsis is refused, not stored')
})
