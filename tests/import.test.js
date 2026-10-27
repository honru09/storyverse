import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import {
  LOREBOOK_BUDGET_CHARS,
  leadingExcerpt,
  normalizeLorebookEntries,
  parseCharacterCardJson,
  parseCharacterCardPng,
  parseWorldInfoJson,
  parseWorldText,
  personaTextFromCard,
  pngTextChunks,
  selectLorebookEntries,
  splitWorldTextIntoEntries,
} from '../src/lorebook.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createStory,
  plazaSnapshot,
  publicSnapshot,
  updateLorebook,
  updateWorldBible,
} from '../src/story-engine.js'
import { validateLibrary, emptyLibrary } from '../src/persistence.js'
import { createGeminiGenerator } from '../server/gemini.js'
import { splitStoryForUpload } from '../src/cloud-library.js'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'

// ---------------------------------------------------------------------------
// World-info JSON parsing
// ---------------------------------------------------------------------------

const WORLD_BOOK = {
  name: '倒流港世界书',
  description: '倒流港按潮汐税运转。',
  entries: {
    0: { key: ['紫晶回廊'], keysecondary: [], content: '紫晶回廊是倒流港地下的旧引水渠，雨季会倒灌。', comment: '紫晶回廊', constant: false, selective: true, disable: false },
    1: { key: ['潮汐税'], content: '潮汐税法第叁条：沿江商户按潮位缴税，朔日由税吏沿江征收。', comment: '潮汐税法', constant: false, disable: false },
    2: { key: [], content: '倒流港的钟楼永远慢一刻。', comment: '常驻·钟楼', constant: true, disable: false },
    3: { key: ['废弃'], content: '这一条已被作者禁用，不应出现。', comment: '废弃条目', constant: false, disable: true },
    4: { key: ['空的'], content: '   ', comment: '空条目', constant: false, disable: false },
  },
}

test('world-info JSON: canonical map shape parses, disabled and empty entries are skipped', () => {
  const parsed = parseWorldInfoJson(JSON.stringify(WORLD_BOOK))
  assert.equal(parsed.name, '倒流港世界书')
  assert.equal(parsed.description, '倒流港按潮汐税运转。')
  assert.equal(parsed.entries.length, 3)
  const [corridor, tax, bell] = parsed.entries
  assert.equal(corridor.name, '紫晶回廊')
  assert.deepEqual(corridor.keys, ['紫晶回廊'])
  assert.equal(corridor.constant, false)
  assert.equal(corridor.source, 'worldbook')
  assert.equal(tax.content.includes('潮汐税法第叁条'), true)
  assert.equal(bell.constant, true)
  assert.ok(!JSON.stringify(parsed.entries).includes('已被作者禁用'))
})

test('world-info JSON: array container and alias fields (keys / name / comma keys) parse too', () => {
  const parsed = parseWorldInfoJson(JSON.stringify({
    entries: [
      { keys: '雾门，守门人', name: '雾门规矩', content: '雾门只在退潮时开。' },
      { key: '单人', content: '无名条目内容。' },
    ],
  }))
  assert.equal(parsed.entries.length, 2)
  assert.deepEqual(parsed.entries[0].keys, ['雾门', '守门人'])
  assert.equal(parsed.entries[0].name, '雾门规矩')
  assert.equal(parsed.entries[1].name, '单人')
})

test('world-info JSON: malformed inputs raise plain-language errors, never crash', () => {
  assert.throws(() => parseWorldInfoJson('not json {'), /不是有效的 JSON/)
  assert.throws(() => parseWorldInfoJson(JSON.stringify({ name: '没有条目' })), /没有找到世界书条目/)
  assert.throws(
    () => parseWorldInfoJson(JSON.stringify({ entries: { 0: { key: [], content: 'x', disable: true } } })),
    /都是空的或已被禁用/,
  )
})

// ---------------------------------------------------------------------------
// Plain text / Markdown worlds
// ---------------------------------------------------------------------------

test('world text: name comes from the first heading, else the file name; long files flag truncation', () => {
  const parsed = parseWorldText('# 雾港志\n\n雾从港口升起来。', 'whatever.md')
  assert.equal(parsed.name, '雾港志')
  assert.equal(parsed.truncated, false)
  const fromFile = parseWorldText('没有标题的世界。', '海边小镇.txt')
  assert.equal(fromFile.name, '海边小镇')
  const huge = parseWorldText('设'.repeat(13000), 'big.txt')
  assert.equal(huge.truncated, true)
  assert.equal(huge.text.length, 12000)
  assert.throws(() => parseWorldText('   \n  '), /是空的/)
})

test('world text split: headings become keyed entries, the first is constant, nothing is lost', () => {
  const text = [
    '雾港是一座被潮汐统治的港口。',
    '',
    '# 潮汐税法',
    '沿江商户按潮位缴税，朔日由税吏征收。',
    '',
    '# 紫晶回廊',
    '地下的旧引水渠，雨季会倒灌。文件末尾的独特记号 ZQX-9917 写在这里。',
  ].join('\n')
  const entries = splitWorldTextIntoEntries(text)
  assert.equal(entries.length, 3)
  assert.equal(entries[0].constant, true)
  assert.deepEqual(entries[1].keys, ['潮汐税法'])
  assert.ok(entries[2].content.includes('ZQX-9917'), 'the tail of the file survives the split')
  assert.ok(entries.every((entry) => entry.source === 'text'))
})

test('world text split: one oversized unbroken section is hard-split, not truncated away', () => {
  const tail = '收尾记号 TAIL-4242'
  const text = `${'长'.repeat(4000)}${tail}`
  const entries = splitWorldTextIntoEntries(text)
  assert.ok(entries.length >= 3)
  assert.ok(entries.some((entry) => entry.content.includes(tail)))
  assert.ok(entries.every((entry) => entry.content.length <= 2000))
})

test('leadingExcerpt cuts at a boundary inside the window', () => {
  const text = `第一段。${'甲'.repeat(300)}\n\n${'乙'.repeat(400)}`
  const excerpt = leadingExcerpt(text, 320)
  assert.ok(excerpt.length <= 320)
  assert.ok(excerpt.startsWith('第一段。'))
  assert.equal(leadingExcerpt('短文本。', 600), '短文本。')
})

// ---------------------------------------------------------------------------
// Character cards
// ---------------------------------------------------------------------------

const CARD_V2 = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '沈雾',
    description: '倒流港的账房先生，左耳失聪，随身带一本泡过海水的账簿。',
    personality: '沉默寡言，认死理',
    scenario: '朔日收税前夜，账簿上多了一笔不存在的税。',
    first_mes: '“这笔税，不是我记的。”他说。',
  },
}

test('character card JSON: v2 data wrapper, v1 flat and loose shapes all parse', () => {
  const v2 = parseCharacterCardJson(JSON.stringify(CARD_V2))
  assert.equal(v2.name, '沈雾')
  assert.equal(v2.personality, '沉默寡言，认死理')
  assert.equal(v2.firstMessage.includes('不是我记的'), true)
  const v1 = parseCharacterCardJson(JSON.stringify({ name: '阿雾', description: '守塔人。', personality: '倔' }))
  assert.equal(v1.name, '阿雾')
  const loose = parseCharacterCardJson(JSON.stringify({ card: { name: '洛', desc: '来自 Flai 的卡。' } }))
  assert.equal(loose.name, '洛')
  assert.equal(loose.description, '来自 Flai 的卡。')
  assert.throws(() => parseCharacterCardJson(JSON.stringify({ description: '没有名字' })), /没有读到角色名字/)
  assert.throws(() => parseCharacterCardJson('{oops'), /不是有效的 JSON/)
})

test('persona text composes description + labelled personality/scenario; first_mes is not mapped', () => {
  const persona = personaTextFromCard(parseCharacterCardJson(JSON.stringify(CARD_V2)))
  assert.ok(persona.includes('账房先生'))
  assert.ok(persona.includes('性格：沉默寡言，认死理'))
  assert.ok(persona.includes('处境：朔日收税前夜'))
  assert.ok(!persona.includes('不是我记的'), 'the chat opening line is not profile material')
})

// Minimal CRC32 for building a standards-shaped PNG fixture.
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()
const crc32 = (bytes) => {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const pngChunk = (type, data) => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set([...type].map((char) => char.charCodeAt(0)), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}
const pngWithCard = (card, keyword = 'chara') => {
  const base = PNG.sync.write(new PNG({ width: 1, height: 1 }))
  const payload = Buffer.from(JSON.stringify(card), 'utf8').toString('base64')
  const text = new Uint8Array([
    ...[...keyword].map((char) => char.charCodeAt(0)),
    0,
    ...[...payload].map((char) => char.charCodeAt(0)),
  ])
  const chunk = pngChunk('tEXt', text)
  const iendAt = base.length - 12
  const out = new Uint8Array(base.length + chunk.length)
  out.set(base.subarray(0, iendAt), 0)
  out.set(chunk, iendAt)
  out.set(base.subarray(iendAt), iendAt + chunk.length)
  return out
}

test('character card PNG: the embedded chara tEXt chunk is extracted and parsed', () => {
  const bytes = pngWithCard(CARD_V2)
  const chunks = pngTextChunks(bytes)
  assert.ok(chunks.chara)
  const card = parseCharacterCardPng(bytes)
  assert.equal(card.name, '沈雾')
  assert.equal(card.scenario.includes('不存在的税'), true)
  const v3 = parseCharacterCardPng(pngWithCard({ spec: 'chara_card_v3', data: { name: '三代卡' } }, 'ccv3'))
  assert.equal(v3.name, '三代卡')
})

test('character card PNG: a plain image and a non-PNG fail in plain language', () => {
  const plain = PNG.sync.write(new PNG({ width: 1, height: 1 }))
  assert.throws(() => parseCharacterCardPng(new Uint8Array(plain)), /没有找到内嵌的角色卡/)
  assert.deepEqual(pngTextChunks(new Uint8Array([1, 2, 3])), {})
  assert.throws(() => parseCharacterCardPng(new Uint8Array([1, 2, 3])), /没有找到内嵌的角色卡/)
})

// ---------------------------------------------------------------------------
// Injection selection
// ---------------------------------------------------------------------------

const SELECTION_BOOK = [
  { id: 'a', name: '常驻甲', keys: [], content: '常驻内容甲。', constant: true, enabled: true, source: 'worldbook' },
  { id: 'b', name: '潮汐税法', keys: ['潮汐税'], content: '命中关键词的内容。', constant: false, enabled: true, source: 'worldbook' },
  { id: 'c', name: '龙王祭', keys: ['龙王祭'], content: '不会命中的内容。', constant: false, enabled: true, source: 'worldbook' },
  { id: 'd', name: '停用条目', keys: ['潮汐税'], content: '停用的不注入。', constant: false, enabled: false, source: 'worldbook' },
]

test('selection: constants first, keyed matches follow, misses and disabled entries stay out', () => {
  const picked = selectLorebookEntries(SELECTION_BOOK, '本章要写朔日的潮汐税征收。')
  assert.deepEqual(picked.map((entry) => entry.id), ['a', 'b'])
  assert.deepEqual(selectLorebookEntries(SELECTION_BOOK, '完全无关的一章。').map((entry) => entry.id), ['a'])
  assert.deepEqual(selectLorebookEntries([], '潮汐税'), [])
  assert.deepEqual(selectLorebookEntries(SELECTION_BOOK, '潮汐税'), picked, 'selection is deterministic')
})

test('selection: the budget binds — an oversized entry is skipped whole, a smaller later one still fits', () => {
  const book = [
    { id: 'big', name: '大', keys: [], content: '长'.repeat(LOREBOOK_BUDGET_CHARS), constant: true, enabled: true, source: 'manual' },
    { id: 'small', name: '小', keys: [], content: '小内容。', constant: true, enabled: true, source: 'manual' },
  ]
  assert.deepEqual(selectLorebookEntries(book, '').map((entry) => entry.id), ['small'])
})

// ---------------------------------------------------------------------------
// Generation-context injection (stubbed provider — no paid calls)
// ---------------------------------------------------------------------------

const env = { GEMINI_API_KEY: 'test-key-never-used-on-network' }
const prose = () => ({
  title: '潮起之时',
  paragraphs: [
    '沈雾站在倒流港的堤岸上，潮水正沿着石阶慢慢上涨，税吏的船还没有靠岸。',
    '他翻开那本泡过海水的账簿，朔日要收的税目一条一条列得清楚，只有最后一笔没有来处。',
    '钟楼的钟声比平日慢了一刻，港里的人都抬起头，像在等一件早晚会发生的事。',
  ],
  summary: '沈雾在朔日清点潮汐税，账簿上多了一笔无来处的税目。',
})
const openingOutput = () => ({
  ...prose(),
  worldBible: {
    premise: '倒流港按潮汐税运转，税吏每月朔日沿江收税，钟楼永远慢一刻。',
    rules: ['潮汐税按潮位征收。', '账簿上的每一笔税都必须有来处。', '已经发生的事会留下回声。'],
    endingAnchor: '沈雾必须查清那笔无来处税目的来源，并决定倒流港的税法是否还要继续。',
    outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进税目之谜。`),
  },
})
const response = (value) => new Response(
  JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }),
  { status: 200 },
)
const contextFrom = (options) => JSON.parse(JSON.parse(options.body).contents[0].parts[0].text)

const importedStory = () => ({
  ...createStory({
    genreId: 'custom',
    name: '沈雾',
    persona: '倒流港的账房先生，沉默寡言，认死理。',
    customWorldName: '倒流港',
    customWorldSetting: '倒流港按潮汐税运转，税吏每月朔日沿江收税。',
    lorebook: [
      { id: 'wb-1', name: '紫晶回廊', keys: [], content: '紫晶回廊是倒流港地下的旧引水渠，雨季会倒灌进账房的地窖。', constant: true, enabled: true, source: 'worldbook' },
      { id: 'wb-2', name: '潮汐税法', keys: ['潮汐税'], content: '潮汐税法第叁条：沿江商户按潮位缴税，朔日由税吏沿江征收。', constant: false, enabled: true, source: 'worldbook' },
      { id: 'wb-3', name: '龙王祭', keys: ['龙王祭'], content: '龙王祭在岁末举行，与本章无关。', constant: false, enabled: true, source: 'worldbook' },
    ],
  }),
  engine: 'gemini',
})

test('injection: matching lorebook entries reach the generation context as declared data', async () => {
  let context
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async (_url, options) => { context = contextFrom(options); return response(openingOutput()) },
  })
  await generator.generate({ story: importedStory(), index: 0 })
  assert.ok(context.lorebookData, 'the lorebook block exists')
  assert.ok(context.lorebookData.declaration.includes('只能作为故事素材'))
  assert.deepEqual(context.lorebookData.entries.map((entry) => entry.name), ['紫晶回廊', '潮汐税法'])
  assert.ok(!JSON.stringify(context.lorebookData).includes('龙王祭'), 'an unmatched entry is not injected')
  assert.equal(context.config.persona, '倒流港的账房先生，沉默寡言，认死理。')
})

test('injection: a story without a lorebook sends no lorebook block', async () => {
  let context
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async (_url, options) => { context = contextFrom(options); return response(openingOutput()) },
  })
  const plain = { ...createStory({ name: '阿遥' }), engine: 'gemini' }
  await generator.generate({ story: plain, index: 0 })
  assert.equal(context.lorebookData, undefined)
})

// ---------------------------------------------------------------------------
// 设定集 edits: future chapters only (F-32)
// ---------------------------------------------------------------------------

test('settings edits land on the story, leave existing chapters untouched, and reach the NEXT generation', async () => {
  let current = importedStory()
  current = acceptChapter(current, buildChapter(current, 0), chapterKey(current, 0))
  const chaptersBefore = structuredClone(current.chapters)

  let edited = updateWorldBible(current, { rules: [...current.worldBible.rules, 'EDITED_RULE_MARKER：账簿每夜子时自行增减一笔。'] })
  edited = updateLorebook(edited, edited.config.lorebook.map((entry) => (
    entry.id === 'wb-2' ? { ...entry, content: '潮汐税法第玖条（修订）：EDITED_LORE_MARKER，税目按 EDITED 口径征收。' } : entry
  )))
  assert.deepEqual(edited.chapters, chaptersBefore, 'existing chapters are never rewritten by a settings edit')
  assert.ok(edited.updatedAt >= current.updatedAt, 'the edit restamps the story for sync')

  let context
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async (_url, options) => { context = contextFrom(options); return response(prose()) },
  })
  await generator.generate({ story: edited, index: 1 })
  assert.ok(context.worldBible.rules.some((rule) => rule.includes('EDITED_RULE_MARKER')), 'the edited rule rides the next chapter context')
  assert.ok(JSON.stringify(context.lorebookData).includes('EDITED_LORE_MARKER'), 'the edited entry rides the next chapter context')
})

// ---------------------------------------------------------------------------
// Snapshot privacy: imported material never goes public
// ---------------------------------------------------------------------------

test('snapshots: plaza and public snapshots carry no lorebook and no persona', () => {
  let current = importedStory()
  current = acceptChapter(current, buildChapter(current, 0), chapterKey(current, 0))
  const plaza = plazaSnapshot(current, { avatarName: '沈雾' })
  const plazaText = JSON.stringify(plaza)
  assert.deepEqual(plaza.config.lorebook, [])
  assert.equal(plaza.config.persona, '')
  assert.equal(plaza.enterTemplate.config.lorebook, undefined)
  for (const secret of ['紫晶回廊是倒流港地下的旧引水渠', '潮汐税法第叁条', '龙王祭在岁末举行', '账房先生，沉默寡言']) {
    assert.ok(!plazaText.includes(secret), `plaza snapshot must not contain: ${secret}`)
  }
  const shared = publicSnapshot(current)
  const sharedText = JSON.stringify(shared)
  assert.deepEqual(shared.config.lorebook, [])
  for (const secret of ['紫晶回廊是倒流港地下的旧引水渠', '潮汐税法第叁条', '账房先生，沉默寡言']) {
    assert.ok(!sharedText.includes(secret), `public snapshot must not contain: ${secret}`)
  }
})

// ---------------------------------------------------------------------------
// Persistence + cloud sync: lorebook is an ordinary story field
// ---------------------------------------------------------------------------

const libraryWith = (story) => ({ ...emptyLibrary(), stories: [story], activeStoryId: story.id })

test('persistence: a story with a lorebook validates; a malformed lorebook is rejected', () => {
  assert.deepEqual(validateLibrary(libraryWith(importedStory())), [])
  const broken = importedStory()
  broken.config = { ...broken.config, lorebook: [{ id: 'x', content: 'ok', keys: 'not-an-array' }] }
  assert.ok(validateLibrary(libraryWith(broken)).some((error) => error.includes('lorebook')))
  const oversized = importedStory()
  oversized.config = { ...oversized.config, lorebook: [{ id: 'x', content: '长'.repeat(2001) }] }
  assert.ok(validateLibrary(libraryWith(oversized)).some((error) => error.includes('lorebook')))
})

test('cloud sync: the lorebook rides the story head through chunking and the library round-trip', async () => {
  const base = importedStory()
  const fat = {
    ...base,
    config: { ...base.config, storyLengthMode: 'endless', targetChapters: null },
    chapters: Array.from({ length: 30 }, (_, index) => ({
      id: `${base.id}:chapter:${index}:r0`,
      index,
      title: `第 ${index + 1} 章`,
      paragraphs: ['潮'.repeat(50000)],
      summary: '税目推进。',
      events: [],
      foreshadowing: [],
    })),
    chapterIndex: 29,
  }
  const plan = splitStoryForUpload(fat)
  assert.equal(plan.mode, 'chunked')
  assert.deepEqual(plan.head.config.lorebook, base.config.lorebook, 'the head keeps the whole lorebook')

  const service = createLibraryService({ store: createMemoryLibraryStore() })
  const identity = { uid: 'reader-1' }
  const small = importedStory()
  await service.putStory(identity, small.id, { story: small })
  const restored = await service.getStory(identity, small.id)
  assert.deepEqual(restored.config.lorebook, small.config.lorebook)
  assert.equal(restored.config.persona, small.config.persona)
})

test('normalize: imported entries are bounded and id-stable through the engine', () => {
  const entries = normalizeLorebookEntries([
    { id: 'keep-me', name: '甲', keys: ['甲', '甲', ''], content: '内容甲。', constant: 1, enabled: undefined },
    { name: '无内容', content: '  ' },
    'not-a-record',
  ])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, 'keep-me')
  assert.deepEqual(entries[0].keys, ['甲'])
  assert.equal(entries[0].constant, false, 'constant is a strict boolean')
  assert.equal(entries[0].enabled, true)
})
