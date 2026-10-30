import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import {
  acceptChapter,
  appendManualChapter,
  bookTitleSuggestionFor,
  BOOK_TITLE_MAX,
  BOOK_TITLE_MAX_UNITS,
  bookTitleUnitsFor,
  bookTitleWithinLimit,
  buildChapter,
  chapterKey,
  createManualStory,
  createMergedStory,
  createStory,
  renameBookTitle,
  shortenTitleText,
} from '../src/story-engine.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createServer } from '../server/index.js'
import { PNG } from 'pngjs'

// REQ-63 (DESIGN §56): ONE platform-wide book-title limit, fixed by
// measuring the bookstore card (two lines at the narrowest slot), and
// enforced at every title-producing path — typed titles are refused
// in human words, derived titles are composed inside it, and the
// publish endpoint re-checks the snapshot as the final gate.

test('the limit is 20 字 counted in §54 wide units (CJK = 2, else 1)', () => {
  assert.equal(BOOK_TITLE_MAX, 20)
  assert.equal(BOOK_TITLE_MAX_UNITS, 40)
  assert.equal(bookTitleUnitsFor('从灵田杂役开始登天'), 18, '9 CJK characters = 18 units')
  assert.equal(bookTitleUnitsFor('Mist Harbor'), 11, 'Latin letters and spaces count 1')
  assert.equal(bookTitleUnitsFor('雾港 Rain'), 9, 'mixed text folds Latin at half width')
  assert.equal(bookTitleUnitsFor('《雾港》'), 8, 'the book-title brackets are fullwidth')
  assert.ok(bookTitleWithinLimit('名'.repeat(20)))
  assert.ok(!bookTitleWithinLimit('名'.repeat(21)))
})

test('rename refuses one unit over the limit and accepts exactly at it — CJK, Latin, mixed', () => {
  const story = createStory({ genreId: 'mist', name: '阿遥' })
  const refusal = (error) => error instanceof RangeError && error.message === `书名最多 ${BOOK_TITLE_MAX} 字。`
  assert.equal(renameBookTitle(story, '名'.repeat(20)).title, '名'.repeat(20), '20 CJK characters pass')
  assert.throws(() => renameBookTitle(story, '名'.repeat(21)), refusal, '21 CJK characters are refused')
  assert.equal(renameBookTitle(story, 'a'.repeat(40)).title.length, 40, '40 Latin characters pass')
  assert.throws(() => renameBookTitle(story, 'a'.repeat(41)), refusal, '41 Latin characters are refused')
  assert.equal(
    renameBookTitle(story, `${'名'.repeat(19)}ab`).title,
    `${'名'.repeat(19)}ab`,
    '19 CJK + 2 Latin = 40 units passes',
  )
  assert.throws(() => renameBookTitle(story, `${'名'.repeat(19)}abc`), refusal, 'one Latin character over is refused')
})

test('a hand-written book obeys the same limit at creation', () => {
  assert.equal(createManualStory({ title: '名'.repeat(20) }).title.length, 20)
  assert.throws(
    () => createManualStory({ title: '名'.repeat(21) }),
    (error) => error instanceof RangeError && error.message === `书名最多 ${BOOK_TITLE_MAX} 字。`,
  )
})

test('the forge suggestion is composed inside the limit — suffix drops before the base shortens', () => {
  assert.equal(bookTitleSuggestionFor({ genreId: 'mist', name: '阿遥' }), '沉潮港纪事 · 阿遥', 'an ordinary suggestion is untouched')
  // A 17-character world name fits alone (34 units) but not with the
  // protagonist suffix (34 + 3 + 4 = 41): the suffix drops first.
  const world = '雾'.repeat(17)
  assert.equal(
    bookTitleSuggestionFor({ genreId: 'custom', customWorldName: world, name: '沈砚' }),
    world,
    'the protagonist suffix is dropped before anything is shortened',
  )
  // A world named at the world-name cap (40 characters) shortens at
  // the phrase level to exactly the title limit.
  const huge = bookTitleSuggestionFor({ genreId: 'custom', customWorldName: '雾'.repeat(40), name: '沈砚' })
  assert.ok(bookTitleWithinLimit(huge), 'a max-length world still yields a legal suggestion')
  assert.equal(bookTitleUnitsFor(huge), BOOK_TITLE_MAX_UNITS)
})

test('a typed title parked on the config is stored inside the limit, whole characters only', () => {
  const story = createStory({ genreId: 'mist', name: '阿遥', bookTitle: '名'.repeat(25) })
  assert.ok(bookTitleWithinLimit(story.title), 'the stored title never exceeds the limit')
  assert.equal(story.title, '名'.repeat(20), 'storage clips whole characters at the unit budget — no ellipsis, no half glyph')
})

test('shortenTitleText lands on a phrase boundary — clause first, dangling tail stripped, never an ellipsis', () => {
  assert.equal(shortenTitleText('刚失业，神豪系统找上门', 15), '神豪系统找上门', 'the fitting clause wins over a raw clip')
  assert.equal(shortenTitleText('从灵田杂役开始登天', 15), '从灵田杂役开始', 'no clause boundary: whole characters, no …')
  assert.equal(shortenTitleText('雾港的夜未央', 6), '雾港', 'a clip landing on 的 strips the dangling particle')
  assert.equal(shortenTitleText('雾港来信', 40), '雾港来信', 'inside budget: verbatim')
  assert.ok(!shortenTitleText('一二三四五六七八九十甲乙丙丁戊己庚辛', 10).includes('…'))
})

const lineWithTitle = (title, genreId = 'mist', name = '阿遥') => {
  const story = createStory({ genreId, name, storyLengthMode: 'endless' })
  story.title = title
  return story
}

test('a fused name fits whole when the join is inside the limit — including exactly at it', () => {
  assert.equal(
    createMergedStory(lineWithTitle('雾港来信'), lineWithTitle('潮声', 'neon', '白夜')).title,
    '合流：雾港来信 × 潮声',
  )
  const a = lineWithTitle('一二三四五六七') // 14 units
  const b = lineWithTitle('子丑寅卯辰巳午未a', 'neon', '乙') // 17 units; 6 + 14 + 3 + 17 = 40 exactly
  assert.equal(createMergedStory(a, b).title, '合流：一二三四五六七 × 子丑寅卯辰巳午未a', 'a join at exactly the limit is kept whole')
})

test('the production pair: both sources stay recognisable inside the limit, no ellipsis', () => {
  const merged = createMergedStory(
    lineWithTitle('从灵田杂役开始登天', 'cultivation', '沈砚'),
    lineWithTitle('刚失业，神豪系统找上门', 'city', '陆鸣'),
  )
  assert.equal(merged.title, '合流：从灵田杂役开始 × 神豪系统找上门')
  assert.ok(bookTitleWithinLimit(merged.title))
  assert.ok(!merged.title.includes('…'), 'the old clip-and-ellipsis form is gone')
})

test('one unit over still yields a legal fused name with both sides present', () => {
  const merged = createMergedStory(
    lineWithTitle('一二三四五六七八'), // 16 units
    lineWithTitle('子丑寅卯辰巳午未a', 'neon', '乙'), // 17 units; join = 42 units
  )
  assert.ok(bookTitleWithinLimit(merged.title), `the fused name obeys the limit: ${merged.title}`)
  assert.ok(merged.title.startsWith('合流：') && merged.title.includes(' × '))
  assert.ok(!merged.title.includes('…'))
})

test('indistinguishable titles fall back to the cast, and 3+ sources count the rest', () => {
  const sameA = lineWithTitle('雾港来信', 'mist', '阿遥')
  const sameB = lineWithTitle('雾港来信', 'mist', '沈砚')
  assert.equal(createMergedStory(sameA, sameB).title, '合流：阿遥 × 沈砚')
  const third = lineWithTitle('宫墙深处的那封密信', 'court', '萧景')
  const merged3 = createMergedStory([lineWithTitle('从灵田杂役开始登天', 'cultivation', '沈砚'), lineWithTitle('刚失业，神豪系统找上门', 'city', '陆鸣'), third])
  assert.equal(merged3.title, '合流：从灵田杂役开始登天 等 3 条线')
  assert.ok(bookTitleWithinLimit(merged3.title))
})

// ---- publish: the final gate -------------------------------------------

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

async function startServer(t) {
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plazaService = createPlazaService({
    env: {},
    store: createMemoryPlazaStore(),
    avatarStore,
    coverStore: createMemoryCoverStore(),
  })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    avatar: avatarService,
    plaza: plazaService,
    library: createLibraryService({ store: createMemoryLibraryStore() }),
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

const ORIGIN = { Origin: 'http://localhost:5173' }
const auth = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

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
    headers: auth(token),
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

const publish = (base, token, story) => fetch(`${base}/api/plaza/publish`, {
  method: 'POST', headers: auth(token), body: JSON.stringify({ story }),
})

test('publish refuses an over-limit title in human words; the same line shelves once renamed', async (t) => {
  const base = await startServer(t)
  const token = await registerUser(base, 'req63_author')
  const avatar = await makeAvatar(base, token)
  // A pre-limit legacy title (26 characters), set directly on the
  // story the way an old record would carry it — the naming checks
  // never saw it, which is exactly what the final gate exists for.
  let line = createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'endless',
    name: '沈砚',
    avatarId: avatar.id,
    avatarAppearance: '银灰长发，左颊一颗泪痣',
    ability: '借火一瞬',
  })
  const chapter = buildChapter(line, 0)
  line = { ...acceptChapter(line, chapter, chapterKey(line, 0)), engine: 'gemini' }
  line.title = '合流：从灵田杂役开始登天 × 刚失业，神豪系统找上门'

  const refused = await publish(base, token, line)
  assert.equal(refused.status, 400, 'the over-limit title is refused at publish')
  const refusal = await refused.json()
  assert.match(refusal.error || refusal.message || '', /书名太长了/, 'the refusal names the title as the problem')

  const renamed = renameBookTitle(line, '合流：从灵田杂役开始 × 神豪系统找上门')
  const accepted = await publish(base, token, renamed)
  assert.equal(accepted.status, 200, 'the same line shelves under a legal title')
})

test('publish refuses an over-limit hand-written title too (the manual branch takes the same gate)', async (t) => {
  const base = await startServer(t)
  const token = await registerUser(base, 'req63_writer')
  let book = createManualStory({ title: '雾港手记' })
  book = appendManualChapter(book, { title: '第一章', text: '雾从港口升起来的时候，信到了。' })
  book.title = '名'.repeat(21)
  const refused = await publish(base, token, book)
  assert.equal(refused.status, 400)
  const refusal = await refused.json()
  assert.match(refusal.error || refusal.message || '', /书名太长了/)
})

test('the rename mirror never carries an over-limit title onto the shelf', async (t) => {
  const base = await startServer(t)
  const token = await registerUser(base, 'req63_mirror')
  const avatar = await makeAvatar(base, token)
  let line = createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'endless',
    name: '沈砚',
    avatarId: avatar.id,
    avatarAppearance: '银灰长发，左颊一颗泪痣',
    ability: '借火一瞬',
  })
  const chapter = buildChapter(line, 0)
  line = { ...acceptChapter(line, chapter, chapterKey(line, 0)), engine: 'gemini' }
  line = renameBookTitle(line, '合流：从灵田杂役开始 × 神豪系统找上门')
  const accepted = await publish(base, token, line)
  assert.equal(accepted.status, 200, 'the compliant line shelves')
  const book = (await accepted.json()).publication

  // A legacy-shaped save (an old backup import, a client that never
  // ran the naming gates) renames the library copy past the limit.
  // The library write itself still succeeds — the mirror never fails
  // it — but the shelf record keeps the last compliant title.
  const legacy = { ...line, title: '合流：从灵田杂役开始登天 × 刚失业，神豪系统找上门' }
  const put = await fetch(`${base}/api/library/stories/${line.id}`, {
    method: 'PUT', headers: auth(token), body: JSON.stringify({ story: legacy }),
  })
  assert.equal(put.status, 200, 'the library write is not failed by the mirror')
  const detail = await (await fetch(`${base}/api/store/${book.id}`)).json()
  assert.equal(detail.book.title, '合流：从灵田杂役开始 × 神豪系统找上门', 'the shelf keeps the compliant title')
})

test('client wiring: two-line card slot, unit-fed glyph count, forge pre-check, honest input caps', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(main, /--title-glyphs": Math\.ceil\(textUnitsFor\(`《\$\{book\.title/, 'the card sizes its title by wide units, brackets included')
  assert.equal((main.match(/maxLength=\{BOOK_TITLE_MAX \* 2\}/g) || []).length, 3, 'all three title inputs share the character hard-stop')
  assert.match(main, /bookTitleWithinLimit\(typedBookTitle\)/, 'the forge refuses an over-limit typed title before generation')
  assert.match(css, /\.store-slot-title\{height:44px/, 'the title slot is two lines tall at every width')
  assert.match(css, /\.store-book-title\{[^}]*-webkit-line-clamp:2/, 'the card title wraps to two lines, clamped only as the legacy guard')
  assert.match(css, /\.plaza-detail-cover-copy h1\{[^}]*-webkit-line-clamp:2/, 'the detail title shares the two-line caliber')
})
