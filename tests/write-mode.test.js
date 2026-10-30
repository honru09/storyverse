import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import {
  appendManualChapter,
  chapterForReading,
  createManualStory,
  createStory,
  finishEndlessLine,
  isManualStory,
  manualChapterHasProse,
  manualChapterWordCount,
  manualTagsOf,
  manualTextToParagraphs,
  manualWrittenChapterCount,
  moveManualChapter,
  publicSnapshot,
  removeManualChapter,
  updateManualChapter,
} from '../src/story-engine.js'
import { validateLibrary, emptyLibrary } from '../src/persistence.js'
import { materialize, prepareReadingWindow } from '../src/reading-flow.js'
import { nextGenerationIndex } from '../src/generation.js'
import { fusionCandidatesFor } from '../src/fusion.js'
import { manualSnapshotFor, plazaGateFor, plazaReaderStory } from '../src/plaza.js'
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
import { createServer } from '../server/index.js'

// WRITE-MODE batch (§50): a book the owner writes by hand — manual story
// record + chapter CRUD, cloud-library shape, the publish gate and the
// server shelving branch (no avatar required), ratings on a manual
// book, and the AI-isolation guarantees (no materialised chapters, no
// generation index, no fusion candidacy).

const libraryErrors = (story) => validateLibrary({ ...emptyLibrary(), stories: [story] })

function manualBook(overrides = {}) {
  return createManualStory({
    title: '潮汐手记',
    synopsis: '一个守塔人写给大海的信。',
    shelfId: 'xuanyi',
    tags: ['海港', '旧信', '海港', '这是一个超过十二个字的标签啊啊啊'],
    ...overrides,
  })
}

function writtenBook() {
  let story = manualBook()
  story = appendManualChapter(story, { title: '起雾', text: '雾从港口升起来。\n\n守塔人听见潮声里的回信。' })
  story = appendManualChapter(story, { title: '', text: '信没有署名。' })
  return story
}

test('createManualStory: shape, cleaned tags, no avatar semantics, library-valid', () => {
  const story = manualBook()
  assert.equal(isManualStory(story), true)
  assert.equal(story.engine, 'manual')
  assert.equal(story.config.storyLengthMode, 'endless')
  assert.equal(story.config.manualShelfId, 'xuanyi')
  assert.equal(story.config.avatarId, undefined)
  assert.deepEqual(manualTagsOf(story), ['海港', '旧信', '这是一个超过十二个字的标'], 'tags dedupe and cap at 12 chars')
  assert.equal(story.synopsis, '一个守塔人写给大海的信。')
  assert.equal(story.worldBible.premise, '一个守塔人写给大海的信。')
  assert.deepEqual(story.chapters, [])
  assert.deepEqual(libraryErrors(story), [])
  assert.equal(createManualStory({ title: '无分类的书' }).config.manualShelfId, '')
  assert.throws(() => createManualStory({ title: '  ' }), /先给这本书起个名字/)
  // REQ-63 supersedes the old 30-character title cap: the platform
  // limit is 20 字 in wide units (tests/title-length.test.js pins it).
  assert.throws(() => createManualStory({ title: '长'.repeat(21) }), /书名最多 20 字/)
  assert.throws(() => createManualStory({ title: '好', synopsis: '长'.repeat(301) }), /简介最多 300 字/)
  assert.equal(isManualStory(createStory({ genreId: 'mist', name: '沈砚' })), false)
})

test('manual chapter CRUD: append/update/move/remove keep indexes and validity', () => {
  let story = writtenBook()
  assert.equal(story.chapters.length, 2)
  assert.deepEqual(story.chapters[0].paragraphs, ['雾从港口升起来。', '守塔人听见潮声里的回信。'], 'blank lines split paragraphs')
  assert.equal(story.chapters[1].title, '第 2 章', 'a blank title defaults to the ordinal')
  assert.equal(story.chapterIndex, 2)
  assert.deepEqual(libraryErrors(story), [])
  assert.equal(manualWrittenChapterCount(story), 2)
  assert.equal(manualChapterWordCount(story.chapters[0]), '雾从港口升起来。守塔人听见潮声里的回信。'.replace(/\s/g, '').length)

  story = updateManualChapter(story, 0, { title: '雾起时', text: '改过的第一段。\n第二行也是新的一段。' })
  assert.equal(story.chapters[0].title, '雾起时')
  assert.deepEqual(story.chapters[0].paragraphs, ['改过的第一段。', '第二行也是新的一段。'], 'single newlines split too')
  assert.deepEqual(libraryErrors(story), [])

  story = moveManualChapter(story, 1, 0)
  assert.deepEqual(story.chapters.map((chapter) => chapter.title), ['第 2 章', '雾起时'])
  assert.deepEqual(story.chapters.map((chapter) => chapter.index), [0, 1], 'indexes re-based after a move')
  assert.deepEqual(libraryErrors(story), [])

  story = removeManualChapter(story, 0)
  assert.equal(story.chapters.length, 1)
  assert.equal(story.chapters[0].title, '雾起时')
  assert.equal(story.chapters[0].index, 0)
  assert.equal(story.chapterIndex, 1)
  assert.deepEqual(libraryErrors(story), [])

  // An untouched new chapter is storable but counts as unwritten.
  story = appendManualChapter(story, {})
  assert.equal(story.chapters.length, 2)
  assert.equal(manualChapterHasProse(story.chapters[1]), false)
  assert.equal(manualWrittenChapterCount(story), 1)
  assert.deepEqual(libraryErrors(story), [], 'an empty draft chapter still syncs')

  // Non-manual stories and read-only copies refuse the desk's verbs.
  const ai = createStory({ genreId: 'mist', name: '沈砚' })
  assert.throws(() => appendManualChapter(ai, {}), /只有自己写的书能这样编辑/)
  assert.throws(() => updateManualChapter({ ...writtenBook(), readOnly: true }, 0, { text: 'x' }), /只读副本不能编辑/)
  assert.throws(() => updateManualChapter(writtenBook(), 5, { text: 'x' }), /这一章还不存在/)
  assert.deepEqual(manualTextToParagraphs(' 一 \n\n\n 二 '), ['一', '二'])
})

test('AI isolation: nothing materialises, generates, repairs or fuses a manual book', () => {
  const story = writtenBook()
  assert.equal(materialize(story, 6), story, 'materialize refuses')
  assert.equal(prepareReadingWindow(story, 0), story, 'no reading window is prepared')
  assert.equal(nextGenerationIndex(story), null, 'no generation index exists')
  assert.deepEqual(fusionCandidatesFor([story]), [], 'never a fusion source')

  // A wall of hand-written prose is re-paragraphed for DISPLAY only;
  // the stored chapter keeps the author's exact paragraphs.
  const sentence = '他推开门，看见屋里坐着三个人，谁也没有说话，桌上的茶已经凉了，他把伞靠在门边，慢慢走过去，在最里面的椅子上坐下，窗外的雨还在下。'
  const wall = sentence.repeat(12)
  let walled = manualBook()
  walled = appendManualChapter(walled, { title: '长段', text: wall })
  const stored = walled.chapters[0]
  const view = chapterForReading(walled, 0)
  assert.equal(stored.paragraphs.length, 1, 'stored text untouched')
  assert.ok(view.paragraphs.length > 1, 'the wall is re-cut for display')
  assert.equal(view.paragraphs.join(''), wall, 'display keeps every character, in order')
})

test('publish gate: one written chapter is the whole gate; finish flips the status', () => {
  const empty = manualBook()
  assert.equal(plazaGateFor(empty).publishable, false)
  assert.match(plazaGateFor(empty).reason, /至少写完一章/)
  const blankOnly = appendManualChapter(manualBook(), {})
  assert.equal(plazaGateFor(blankOnly).publishable, false, 'an empty chapter does not count')
  const running = writtenBook()
  assert.deepEqual(plazaGateFor(running), { publishable: true, reason: '', lineStatus: 'serializing' })
  const finished = finishEndlessLine(running)
  assert.equal(plazaGateFor(finished).lineStatus, 'finished')
})

test('manualSnapshotFor: prose chapters only, re-indexed, synopsis verbatim, no enter template', () => {
  let story = writtenBook()
  story = appendManualChapter(story, {}) // trailing empty draft chapter stays home
  const snapshot = manualSnapshotFor(story)
  assert.equal(snapshot.manual, true)
  assert.equal(snapshot.chapters.length, 2)
  assert.deepEqual(snapshot.chapters.map((chapter) => chapter.index), [0, 1])
  assert.deepEqual(snapshot.chapters[0].paragraphs, ['雾从港口升起来。', '守塔人听见潮声里的回信。'], 'prose is verbatim — no redaction of the author\'s own words')
  assert.equal(snapshot.synopsis, '一个守塔人写给大海的信。')
  assert.equal(snapshot.enterTemplate, undefined)
  assert.equal(snapshot.totalChapters, 2)
  assert.deepEqual(snapshot.beats.map((beat) => beat.chapter), [1, 2])

  const readerStory = plazaReaderStory({ id: 'pub-x', title: snapshot.title, genreId: snapshot.genreId, manual: true, snapshot, authorName: '阿潮', publishedAt: '2026-10-29T00:00:00.000Z' })
  assert.equal(readerStory.creationMode, 'manual')
  assert.equal(readerStory.readOnly, true)
  assert.equal(readerStory.chapters.length, 2)
})

test('publicSnapshot: the local share copy carries the hand-written prose verbatim', () => {
  const story = writtenBook()
  const shared = publicSnapshot(story)
  assert.equal(shared.title, '潮汐手记', 'the real title, not an anonymised scaffold name')
  assert.deepEqual(shared.chapters[0].paragraphs, story.chapters[0].paragraphs)
  assert.equal(shared.creationMode, 'manual')
})

// ---- HTTP chain --------------------------------------------------------

const ORIGIN = { Origin: 'http://localhost:5173' }

async function startServer(t) {
  const avatarStore = createMemoryAvatarStore()
  const plazaStore = createMemoryPlazaStore()
  const coverStore = createMemoryCoverStore()
  const feedStore = createMemoryPlazaFeedStore()
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
  const social = createSocialService({ env: {}, store: createMemorySocialStore(), plazaStore, avatarStore, feedStore })
  const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore: social })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('fixture: generation must never run for a manual book') } },
    library: createLibraryService({ env: {}, store: createMemoryLibraryStore() }),
    avatar: createAvatarService({ env: {}, store: avatarStore }),
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

async function putStory(base, token, story) {
  const response = await fetch(`${base}/api/library/stories/${encodeURIComponent(story.id)}`, {
    method: 'PUT', headers: authed(token), body: JSON.stringify({ story }),
  })
  assert.equal(response.status, 200, 'library PUT')
  return response.json()
}

test('HTTP chain: no avatar needed — sync, shelve, catalogue, detail, rating, rename mirror', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'manual_author')
  // The author never creates an avatar: a hand-written book must not care.
  const story = writtenBook()
  await putStory(base, author.token, story)

  // A fresh "device" (same account, library read) gets the draft back whole.
  const libraryResponse = await fetch(`${base}/api/library`, { headers: authed(author.token) })
  assert.equal(libraryResponse.status, 200)
  const library = await libraryResponse.json()
  assert.ok((library.stories || []).some((item) => item.id === story.id), 'the book is listed in the cloud library')
  const storyResponse = await fetch(`${base}/api/library/stories/${encodeURIComponent(story.id)}`, { headers: authed(author.token) })
  assert.equal(storyResponse.status, 200)
  const restored = (await storyResponse.json()).story
  assert.ok(restored, 'the manual book round-trips through the cloud library')
  assert.equal(restored.chapters.length, 2)
  assert.equal(restored.creationMode, 'manual')

  const publishResponse = await fetch(`${base}/api/store/publish`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({ story }),
  })
  assert.equal(publishResponse.status, 200, 'publish without any avatar')
  const book = (await publishResponse.json()).book
  assert.equal(book.manual, true)
  assert.equal(book.shelfId, 'xuanyi', 'the author-picked family shelves the book')
  assert.equal(book.lineStatus, 'serializing')
  assert.equal(book.chapterCount, 2)
  assert.equal(book.synopsis, '一个守塔人写给大海的信。')

  const catalogue = await (await fetch(`${base}/api/store?shelf=xuanyi`)).json()
  assert.equal(catalogue.total, 1)
  assert.equal(catalogue.books[0].manual, true)

  const detail = (await (await fetch(`${base}/api/store/${book.id}`)).json()).book
  assert.equal(detail.manual, true)
  assert.deepEqual(detail.snapshot.chapters[0].paragraphs, ['雾从港口升起来。', '守塔人听见潮声里的回信。'])
  assert.equal(detail.snapshot.enterTemplate, undefined, 'no enter template exists for a manual book')

  // Another reader rates it; the author may not rate their own book.
  const reader = await register(base, 'manual_reader')
  const rateResponse = await fetch(`${base}/api/store/${book.id}/ratings`, {
    method: 'POST', headers: authed(reader.token), body: JSON.stringify({ stars: 5, text: '手写的信，读起来很慢，也很稳。' }),
  })
  assert.equal(rateResponse.status, 200, 'a manual book takes ratings like any book')
  const selfRate = await fetch(`${base}/api/store/${book.id}/ratings`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({ stars: 5, text: '' }),
  })
  assert.equal(selfRate.status, 400, 'no self-rating')

  // A rename rides the library sync onto the shelved record.
  const renamed = { ...story, title: '潮汐手记 · 续', config: { ...story.config, bookTitle: '潮汐手记 · 续' }, updatedAt: new Date(Date.now() + 60_000).toISOString() }
  await putStory(base, author.token, renamed)
  const afterRename = (await (await fetch(`${base}/api/store/${book.id}`)).json()).book
  assert.equal(afterRename.title, '潮汐手记 · 续')
})

test('HTTP gates: empty book and red-line prose are refused at shelving, drafts untouched', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'manual_gated')

  const empty = appendManualChapter(manualBook({ title: '空书' }), {})
  const emptyResponse = await fetch(`${base}/api/store/publish`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({ story: empty }),
  })
  assert.equal(emptyResponse.status, 400)
  assert.match((await emptyResponse.json()).error || '', /至少写完一章/)

  let violating = manualBook({ title: '越线之书' })
  violating = appendManualChapter(violating, { title: '一', text: '这是一个以真人为原型、专门造谣抹黑的故事开场。' })
  const violationResponse = await fetch(`${base}/api/store/publish`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({ story: violating }),
  })
  assert.equal(violationResponse.status, 400, 'the red-line scan blocks shelving')
  // …but the draft itself still syncs to the author's own library.
  await putStory(base, author.token, violating)
})
