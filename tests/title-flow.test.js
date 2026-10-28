import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  acceptChapter,
  bookTitleSuggestionFor,
  buildChapter,
  chapterKey,
  chooseBranch,
  createStory,
  plazaSnapshot,
  redactedTitleFor,
  renameBookTitle,
  startNextSeason,
  BOOK_TITLE_MAX,
} from '../src/story-engine.js'
import { loadLibrary, saveLibrary, validateLibrary } from '../src/persistence.js'
import { cleanBookTitle } from '../src/plaza.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createServer } from '../server/index.js'
import { PNG } from 'pngjs'

// TITLE-FLOW batch: a book's title is its own fact — chosen in the forge
// as a field separate from the world, and renamable afterwards. A rename
// is presentation metadata (like the synopsis and chapter titles), but
// unlike them it is mirrored onto the book's plaza publication at sync
// time, because the title is the book's name on every public surface.

const hashOf = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

test('the forge suggestion is what an unnamed book is called — and it is not the world name', () => {
  // Preset world: the suggestion is the genre's book title plus the
  // protagonist — the world 沉潮港 itself never becomes the book title.
  const draft = { genreId: 'mist', name: '阿遥' }
  assert.equal(bookTitleSuggestionFor(draft), '沉潮港纪事 · 阿遥')
  const story = createStory(draft)
  assert.equal(story.title, '沉潮港纪事 · 阿遥')
  assert.equal(story.config.bookTitle, '', 'an untouched book carries no typed title')
  // God mode: the suggestion leads with the world the creator named…
  assert.equal(
    bookTitleSuggestionFor({ genreId: 'custom', customWorldName: '雾港', name: '沈砚' }),
    '雾港 · 沈砚',
  )
})

test('a typed book title wins over the suggestion, and the world keeps its own name', () => {
  const story = createStory({
    genreId: 'custom',
    customWorldName: '雾港',
    customWorldSetting: '海水每晚倒流一小时。',
    name: '沈砚',
    bookTitle: '  潮声之外  ',
  })
  assert.equal(story.title, '潮声之外', 'the typed title is trimmed and used verbatim')
  assert.equal(story.config.bookTitle, '潮声之外', 'the choice rides the config')
  assert.equal(story.config.customWorldName, '雾港', 'the world is still called 雾港 — title and world are separate facts')
  const snapshot = plazaSnapshot(story, { avatarName: '沈砚' })
  assert.equal(snapshot.title, '潮声之外', 'the publication carries the book title')
  assert.equal(snapshot.worldName, '雾港', '…while its world name stays the world’s name')
  assert.equal(snapshot.config.bookTitle, '', 'the raw typed title never rides a public snapshot config')
})

test('renameBookTitle renames the book and moves nothing else', () => {
  const story = { ...createStory({ genreId: 'mist', name: '阿遥', storyLengthMode: 'season' }), updatedAt: '2026-10-20T00:00:00.000Z' }
  const chaptersHash = hashOf(story.chapters)
  const next = renameBookTitle(story, ' 雾港来信 ')
  assert.equal(next.title, '雾港来信')
  assert.equal(next.config.bookTitle, '雾港来信', 'the config copy follows so a season roll-over keeps the current name')
  assert.equal(hashOf(next.chapters), chaptersHash, 'chapters are byte-identical')
  assert.equal(next.revision, story.revision, 'the revision does not move for a rename')
  assert.notEqual(next.updatedAt, story.updatedAt, 'updatedAt advances so the cloud sync carries the rename')
  assert.equal(story.title, '沉潮港纪事 · 阿遥', 'the input story is not mutated')
  assert.equal(renameBookTitle(next, '雾港来信'), next, 'renaming to the same title is a no-op')
})

test('renameBookTitle validates in human words and never touches a read-only copy', () => {
  const story = createStory({ genreId: 'mist', name: '阿遥' })
  assert.throws(
    () => renameBookTitle(story, '   '),
    (error) => error instanceof RangeError && error.message === '书名不能为空。',
  )
  assert.throws(
    () => renameBookTitle(story, '名'.repeat(BOOK_TITLE_MAX + 1)),
    (error) => error instanceof RangeError && error.message === `书名最多 ${BOOK_TITLE_MAX} 字。`,
  )
  assert.equal(renameBookTitle(story, '名'.repeat(BOOK_TITLE_MAX)).title.length, BOOK_TITLE_MAX, 'the boundary length is allowed')
  const readOnly = { ...story, readOnly: true }
  assert.equal(renameBookTitle(readOnly, '别的名字'), readOnly, 'a plaza copy on the shelf is never renamed')
})

test('the library validator type-checks the typed title and a round-trip keeps it', () => {
  const story = createStory({ genreId: 'custom', customWorldName: '雾港', name: '沈砚', bookTitle: '潮声之外' })
  const library = { version: 2, stories: [story], activeStoryId: story.id, publications: [], favorites: [], draft: null }
  assert.deepEqual(validateLibrary(library), [])
  const broken = { ...library, stories: [{ ...story, config: { ...story.config, bookTitle: 42 } }] }
  assert.ok(validateLibrary(broken).some((error) => error.includes('bookTitle')), 'a non-string bookTitle is refused')
  const cells = new Map()
  const storage = {
    getItem: (key) => (cells.has(key) ? cells.get(key) : null),
    setItem: (key, value) => { cells.set(key, value) },
  }
  assert.deepEqual(saveLibrary(storage, library), { ok: true, error: null })
  const loaded = loadLibrary(storage)
  assert.equal(loaded.warning, null)
  assert.equal(loaded.library.stories[0].title, '潮声之外')
  assert.equal(loaded.library.stories[0].config.bookTitle, '潮声之外')
})

test('redactedTitleFor scrubs private literals from a new title — and never the title itself', () => {
  // The plaza-server marker shape: private life literals must not leak
  // through a rename that quotes them.
  const story = {
    title: '回到雾港镇的信',
    config: { name: '沈砚', hometown: '雾港镇', bookTitle: '回到雾港镇的信' },
  }
  const safeConfig = { name: '沈砚', hometown: '', bookTitle: '' }
  assert.equal(redactedTitleFor(story, safeConfig), '回到某地的信')
  // The config's bookTitle copy must not pair the title with an alias:
  // a title quoting nothing private survives whole.
  const clean = { title: '潮声之外', config: { name: '沈砚', bookTitle: '潮声之外' } }
  assert.equal(redactedTitleFor(clean, { name: '沈砚', bookTitle: '' }), '潮声之外')
})

function tinyPng() {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 200
    png.data[index + 1] = 120
    png.data[index + 2] = 60
    png.data[index + 3] = 255
  }
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

function completedSeasonLine(avatarId) {
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

test('a renamed season keeps its new name into the next season', () => {
  const line = completedSeasonLine('avatar-season')
  const renamed = renameBookTitle(line, '火种新篇')
  const next = startNextSeason(renamed)
  assert.equal(next.title, '火种新篇', 'season two inherits the CURRENT title, not the birth name')
  assert.equal(next.config.seasonNumber, 2)
})

async function startTitleServer(t) {
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plazaStore = createMemoryPlazaStore()
  const plazaService = createPlazaService({
    env: {},
    store: plazaStore,
    avatarStore,
    coverStore: createMemoryCoverStore(),
  })
  const libraryService = createLibraryService({ store: createMemoryLibraryStore() })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    avatar: avatarService,
    plaza: plazaService,
    library: libraryService,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, plazaStore }
}

const ORIGIN = { Origin: 'http://localhost:5173' }

async function registerUser(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'title-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  return (await response.json()).token
}

async function makeAvatar(base, token) {
  const response = await fetch(`${base}/api/avatar`, {
    method: 'PUT',
    headers: { ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: {
        name: '沈砚',
        description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(response.status, 200, 'avatar save')
  return (await response.json()).avatar
}

test('a rename saved to the library is mirrored onto the plaza publication, with a trace', async (t) => {
  const { base, plazaStore } = await startTitleServer(t)
  const token = await registerUser(base, 'title_author')
  const stranger = await registerUser(base, 'title_stranger')
  const avatar = await makeAvatar(base, token)
  const line = completedSeasonLine(avatar.id)
  const birthTitle = line.title

  const auth = (bearer) => ({ ...ORIGIN, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' })
  const publishResponse = await fetch(`${base}/api/plaza/publish`, {
    method: 'POST', headers: auth(token), body: JSON.stringify({ story: line }),
  })
  assert.equal(publishResponse.status, 200, 'the finished season line publishes')
  const publication = (await publishResponse.json()).publication || await publishResponse.json()
  const publicationId = publication.id
  assert.ok(publicationId, 'publish returns the publication id')

  // BOOKSTORE-PLAZA: the auto-composed birth title carries the exact
  // 「 · 化身名」 suffix; shelving cleans it once, so the book opens on
  // its pure title and the rename trace starts from that clean title.
  const shelvedTitle = cleanBookTitle(birthTitle, '沈砚')
  assert.notEqual(shelvedTitle, birthTitle, 'the birth title really carried the suffix')
  const feedTitle = async () => {
    const feed = await (await fetch(`${base}/api/store`)).json()
    return feed.books.find((entry) => entry.id === publicationId)?.title
  }
  assert.equal(await feedTitle(), shelvedTitle, 'the bookstore opens on the cleaned title')

  const putStory = (bearer, story) => fetch(`${base}/api/library/stories/${story.id}`, {
    method: 'PUT', headers: auth(bearer), body: JSON.stringify({ story }),
  })

  // The owner renames the book and the ordinary sync carries it up.
  const renamed = renameBookTitle(line, '潮声之外')
  assert.equal((await putStory(token, renamed)).status, 200)
  assert.equal(await feedTitle(), '潮声之外', 'the feed follows the rename without a re-publish')
  const detail = await (await fetch(`${base}/api/plaza/${publicationId}`)).json()
  assert.equal(detail.publication.title, '潮声之外', 'the detail follows too')
  assert.ok(detail.publication.worldIntro?.background, 'the baked world outline is still there')

  // The trace stays server-side: present in the stored record, absent
  // from every public payload.
  const [record] = await plazaStore.listPublications()
  assert.equal(record.title, '潮声之外')
  assert.equal(record.snapshot.title, '潮声之外', 'the stored snapshot title moves with the record')
  assert.deepEqual(record.titleHistory.map((entry) => [entry.from, entry.to]), [[shelvedTitle, '潮声之外']])
  assert.ok(!JSON.stringify(detail).includes('titleHistory'), 'the trace never leaves the server')

  // An unrelated edit carrying the SAME title adds no trace entry.
  const edited = { ...renamed, synopsis: '一本关于火种与潮声的书。' }
  assert.equal((await putStory(token, edited)).status, 200)
  const [afterEdit] = await plazaStore.listPublications()
  assert.equal(afterEdit.titleHistory.length, 1, 'no rename, no new trace entry')
  assert.equal(afterEdit.title, '潮声之外')

  // A stranger syncing a same-id story under another title cannot move
  // the owner's publication.
  assert.equal((await putStory(stranger, { ...line, title: '别人的标题' })).status, 200)
  assert.equal(await feedTitle(), '潮声之外', 'the publication is owner-scoped')

  // The chunked commit path (head PUT) mirrors a rename the same way.
  const { chapters, ...head } = renameBookTitle(edited, '雾港来信')
  const chunkResponse = await fetch(`${base}/api/library/stories/${line.id}/chunks/0`, {
    method: 'PUT', headers: auth(token), body: JSON.stringify({ from: 0, chapters }),
  })
  assert.equal(chunkResponse.status, 200, 'chunk upload')
  const headResponse = await fetch(`${base}/api/library/stories/${line.id}/head`, {
    method: 'PUT', headers: auth(token), body: JSON.stringify({ story: head, chunkCount: 1 }),
  })
  assert.equal(headResponse.status, 200, 'head commit')
  assert.equal(await feedTitle(), '雾港来信', 'the head-commit path mirrors the rename too')
  const [afterHead] = await plazaStore.listPublications()
  assert.equal(afterHead.titleHistory.length, 2)
})

test('client wiring: the forge names the book, the settings book renames it', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  // Forge: an explicit 书名 field on the confirmation step, the
  // suggestion as its placeholder, and the preview carrying the
  // effective title — never the bare world name.
  assert.match(main, /这本书的书名/)
  assert.match(main, /书名可以和世界不一样/)
  assert.match(main, /placeholder=\{bookTitleSuggestion\}/)
  assert.match(main, /<h3>\{effectiveBookTitle\}<\/h3>/)
  assert.match(main, /bookTitle: payload\.bookTitle/, 'the App generate whitelist carries the typed title into createStory')
  // Settings book: a 书名 section with its own save, fed by the reader.
  assert.match(main, /onSaveBookTitle/)
  assert.match(main, /保存书名/)
  assert.match(main, /renameBookTitle\(story, title\)/)
})
