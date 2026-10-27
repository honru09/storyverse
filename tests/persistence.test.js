import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STORAGE_KEY,
  MAX_BACKUP_BYTES,
  emptyLibrary,
  exportLibrary,
  importLibrary,
  loadLibrary,
  migrateLegacy,
  saveLibrary,
  upsertStory,
  validateLibrary,
} from '../src/persistence.js'
import { acceptChapter, buildChapter, chapterKey, chooseBranch, createMergedStory, createStory, publicSnapshot, FRIEND_BOOK } from '../src/story-engine.js'
import { prepareReadingWindow } from '../src/reading-flow.js'

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries))
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }
}

class FailingStorage {
  getItem() {
    throw new Error('permission denied')
  }

  setItem() {
    throw new Error('quota exceeded')
  }
}

function story(id, title = id) {
  return {
    id,
    title,
    genreId: 'fantasy',
    config: { protagonist: id },
    worldBible: { rules: [] },
    chapterIndex: 0,
    chapters: [],
    choices: [],
    revision: 0,
  }
}

test('emptyLibrary exposes a stable v2 shape', () => {
  assert.deepEqual(emptyLibrary(), {
    version: 2,
    stories: [],
    activeStoryId: null,
    publications: [],
    favorites: [],
    draft: null,
  })
})

test('loadLibrary returns an empty library when the key is absent', () => {
  const result = loadLibrary(new MemoryStorage())
  assert.deepEqual(result.library, emptyLibrary())
  assert.equal(result.warning, null)
})

test('corrupt JSON is not overwritten and returns a warning', () => {
  const raw = '{not-json'
  const storage = new MemoryStorage({ [STORAGE_KEY]: raw })
  const result = loadLibrary(storage)

  assert.deepEqual(result.library, emptyLibrary())
  assert.match(result.warning, /损坏/)
  assert.equal(storage.getItem(STORAGE_KEY), raw)
})

test('old versions are rejected without clearing the original payload', () => {
  const raw = JSON.stringify({ version: 1, stories: [] })
  const storage = new MemoryStorage({ [STORAGE_KEY]: raw })
  const result = loadLibrary(storage)

  assert.match(result.warning, /版本/)
  assert.equal(storage.getItem(STORAGE_KEY), raw)
})

test('invalid story structure is rejected without replacing data', () => {
  const raw = JSON.stringify({
    ...emptyLibrary(),
    stories: [{ id: 'missing-fields' }],
  })
  const storage = new MemoryStorage({ [STORAGE_KEY]: raw })
  const result = loadLibrary(storage)

  assert.match(result.warning, /结构无效/)
  assert.equal(storage.getItem(STORAGE_KEY), raw)
})

test('save and load round-trip a valid library', () => {
  const storage = new MemoryStorage()
  const library = upsertStory(emptyLibrary(), story('mist-07', '雾岚纪事'))
  library.publications.push({ id: 'pub-1', storyId: 'mist-07' })

  assert.deepEqual(saveLibrary(storage, library), { ok: true, error: null })
  assert.deepEqual(loadLibrary(storage), { library, warning: null })
})

test('upsertStory updates one story and preserves other stories and metadata', () => {
  const first = story('first', '第一本')
  const second = story('second', '第二本')
  const library = {
    ...emptyLibrary(),
    stories: [first, second],
    activeStoryId: 'first',
    publications: [{ id: 'publication-1' }],
    favorites: ['second'],
    draft: { toneId: 'poetic' },
  }

  const next = upsertStory(library, { ...first, title: '第一本（更新）', revision: 1 })
  assert.equal(next.stories.length, 2)
  assert.equal(next.stories[0].title, '第一本（更新）')
  assert.equal(next.stories[1].id, 'second')
  assert.deepEqual(next.publications, library.publications)
  assert.deepEqual(next.favorites, library.favorites)
  assert.deepEqual(next.draft, library.draft)
  assert.equal(next.activeStoryId, 'first')
})

test('saveLibrary returns an error when local storage fails', () => {
  const result = saveLibrary(new FailingStorage(), emptyLibrary())
  assert.equal(result.ok, false)
  assert.match(result.error, /保存|存储/)

  const loadResult = loadLibrary(new FailingStorage())
  assert.deepEqual(loadResult.library, emptyLibrary())
  assert.match(loadResult.warning, /读取|存储/)
})

test('migrateLegacy flattens world and character display values without deleting legacy data', () => {
  const legacyRaw = JSON.stringify({
    world: { id: 'mist', name: '雾岚群岛', label: '奇幻 · 海上城邦' },
    protagonist: { name: '宁笙', trait: '冷静观察者', origin: '无名漂泊者' },
    ability: { id: 'tide', name: '听见潮汐', desc: '读取隐藏记忆' },
    tone: { id: 'poetic', name: '诗性冒险', desc: '慢一点' },
    chapter: 3,
  })
  const storage = new MemoryStorage({ 'storyweave:story-state': legacyRaw })
  const result = migrateLegacy(storage)

  assert.equal(result.draft.worldId, 'mist')
  assert.equal(result.draft.worldName, '雾岚群岛')
  assert.equal(result.draft.protagonistName, '宁笙')
  assert.equal(result.draft.abilityName, '听见潮汐')
  assert.equal(result.draft.toneName, '诗性冒险')
  assert.equal(result.draft.chapter, 3)
  assert.equal(storage.getItem('storyweave:story-state'), legacyRaw)
})

test('migrateLegacy returns null for an empty legacy payload', () => {
  const storage = new MemoryStorage({ 'storyweave:story-state': JSON.stringify({}) })
  assert.equal(migrateLegacy(storage), null)
})

function populatedLibrary() {
  const current = prepareReadingWindow(createStory({ name: '阿遥', immersive: true, hometown: '宁波' }))
  const library = upsertStory(emptyLibrary(), current)
  library.publications.push({ id: `publication-${current.id}`, storyId: current.id, snapshot: publicSnapshot(current) })
  return library
}

test('real solo and merged stories with publication snapshots survive a backup round trip', () => {
  const library = populatedLibrary()
  const merged = prepareReadingWindow(createMergedStory(library.stories[0], FRIEND_BOOK))
  const both = upsertStory(library, merged)
  both.publications.push({ id: `publication-${merged.id}`, storyId: merged.id, snapshot: publicSnapshot(merged) })
  const before = structuredClone(both)
  const raw = exportLibrary(both)

  assert.deepEqual(importLibrary(raw), JSON.parse(JSON.stringify(both)))
  assert.deepEqual(both, before, 'export does not mutate the live library')
  const storage = new MemoryStorage()
  assert.equal(saveLibrary(storage, both).ok, true)
  assert.equal(loadLibrary(storage).warning, null)
})

test('render-sensitive corruption is rejected before it can reach the reader or overwrite storage', async (t) => {
  const cases = [
    ['character name object', (library) => { library.stories[0].config.name = { text: 'not text' } }],
    ['character ability object', (library) => { library.stories[0].config.ability = {} }],
    ['draft field object', (library) => { library.draft = { friend: {} } }],
    ['world premise object', (library) => { library.stories[0].worldBible.premise = {} }],
    ['non-array paragraphs', (library) => { library.stories[0].chapters[0].paragraphs = 'not an array' }],
    ['paragraph object', (library) => { library.stories[0].chapters[0].paragraphs[0] = {} }],
    ['empty paragraphs', (library) => { library.stories[0].chapters[0].paragraphs = [] }],
    ['missing chapter', (library) => { library.stories[0].chapters[0] = null }],
    ['chapter index gap', (library) => { library.stories[0].chapters[0].index = 2 }],
    ['stale next chapter cursor', (library) => { library.stories[0].chapterIndex = 0 }],
    ['invalid choice options', (library) => { library.stories[0].chapters[1].choice.options = {} }],
    ['choice option object label', (library) => { library.stories[0].chapters[1].choice.options[0].label = {} }],
    ['duplicate choice branches', (library) => { library.stories[0].chapters[1].choice.options[1].id = 'open' }],
    ['unsupported choice branch', (library) => { library.stories[0].chapters[1].choice.options[0].id = 'unknown' }],
    ['missing decision gate', (library) => { library.stories[0].chapters[1].choice = null }],
    ['invalid choice map', (library) => { library.stories[0].choices = { 1: {} } }],
    ['invalid merged protagonists', (library) => { library.stories[0].kind = 'merged'; library.stories[0].config.protagonists = [null, {}] }],
    ['publication null', (library) => { library.publications[0] = null }],
    ['publication malformed snapshot', (library) => { library.publications[0].snapshot = {} }],
    ['publication malformed prose', (library) => { library.publications[0].snapshot.chapters[0].paragraphs = [{}] }],
    ['favorite object', (library) => { library.favorites = [{}] }],
  ]

  for (const [name, corrupt] of cases) {
    await t.test(name, () => {
      const library = populatedLibrary()
      corrupt(library)
      const raw = JSON.stringify(library)
      const storage = new MemoryStorage({ [STORAGE_KEY]: raw })
      const loaded = loadLibrary(storage)
      assert.deepEqual(loaded.library, emptyLibrary())
      assert.match(loaded.warning, /结构无效/)
      assert.equal(storage.getItem(STORAGE_KEY), raw)
      assert.equal(saveLibrary(storage, library).ok, false)
      assert.equal(storage.getItem(STORAGE_KEY), raw)
      assert.throws(() => importLibrary(raw), /结构无效/)
    })
  }
})

test('save failures from cycles, BigInt, accessors and toJSON leave the previous library untouched', () => {
  const cases = [
    (library) => { library.extra = library },
    (library) => { library.extra = 1n },
    (library) => { Object.defineProperty(library, 'stories', { get() { throw new Error('unreadable') } }) },
    (library) => { library.toJSON = () => ({ version: 2, stories: [null] }) },
    (library) => { library.toJSON = () => undefined },
  ]
  for (const corrupt of cases) {
    const previous = JSON.stringify(emptyLibrary())
    const storage = new MemoryStorage({ [STORAGE_KEY]: previous })
    const library = populatedLibrary()
    corrupt(library)
    assert.doesNotThrow(() => {
      const result = saveLibrary(storage, library)
      assert.equal(result.ok, false)
      assert.match(result.error, /书库/)
    })
    assert.equal(storage.getItem(STORAGE_KEY), previous)
    assert.throws(() => exportLibrary(library), /书库/)
  }
})

test('backup import accepts a UTF-8 BOM and rejects malformed or unsupported backups', () => {
  assert.deepEqual(importLibrary(`\uFEFF${JSON.stringify(emptyLibrary())}`), emptyLibrary())
  for (const raw of ['', '{broken', 'null', '[]', JSON.stringify({ version: 3 })]) {
    assert.throws(() => importLibrary(raw), /JSON|结构无效|版本/)
  }
  assert.throws(() => importLibrary(emptyLibrary()), /JSON/)
})

test('backup size limits count UTF-8 bytes, not JavaScript characters', () => {
  const library = populatedLibrary()
  library.extra = '潮'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3))
  const raw = JSON.stringify(library)
  assert.ok(raw.length < MAX_BACKUP_BYTES)
  assert.throws(() => importLibrary(raw), /5 MB/)
  assert.throws(() => exportLibrary(library), /5 MB/)
})

test('legacy sparse choice arrays retain their JSON null placeholders', () => {
  const library = populatedLibrary()
  library.stories[0].choices = [null, 'open']
  assert.deepEqual(importLibrary(exportLibrary(library)), library)
})

test('legacy migration drops nested display objects that are unsafe to render', () => {
  const legacy = { protagonist: { name: { nested: 'bad' }, trait: { label: { nested: 'bad' } } }, worldId: 'mist' }
  const storage = new MemoryStorage({ 'storyweave:story-state': JSON.stringify(legacy) })
  const migrated = migrateLegacy(storage)
  assert.equal(migrated.draft.protagonistName, undefined)
  assert.equal(migrated.draft.protagonistTrait, undefined)
  assert.equal(migrated.draft.worldId, 'mist')
})

test('genre template id survives a save/load round-trip at story and config level', () => {
  const storage = new MemoryStorage()
  const created = createStory({ name: '阿遥', genreId: 'court', genreTemplateId: 'romance-ancient' })
  const library = upsertStory(emptyLibrary(), created)
  assert.deepEqual(saveLibrary(storage, library), { ok: true, error: null })
  const loaded = loadLibrary(storage)
  assert.equal(loaded.warning, null)
  assert.equal(loaded.library.stories[0].genreTemplateId, 'romance-ancient')
  assert.equal(loaded.library.stories[0].config.genreTemplateId, 'romance-ancient')
})

test('a non-string config genre template id invalidates the story', () => {
  const created = createStory({ name: '阿遥', genreId: 'court', genreTemplateId: 'romance-ancient' })
  const broken = { ...created, config: { ...created.config, genreTemplateId: 42 } }
  const raw = JSON.stringify({ ...emptyLibrary(), stories: [broken] })
  const storage = new MemoryStorage({ [STORAGE_KEY]: raw })
  const result = loadLibrary(storage)
  assert.match(result.warning, /结构无效/)
  assert.equal(result.library.stories.length, 0)
})

test('god-mode story with custom fields round-trips through save and load', () => {
  const storage = new MemoryStorage()
  const custom = createStory({
    genreId: 'custom',
    name: '宁笙',
    customWorldName: '倒流港',
    customWorldSetting: '海水每晚倒流一小时，死者会回到岸边说一句话。',
  })
  const library = upsertStory(emptyLibrary(), custom)
  library.draft = { genreId: 'custom', genreTemplateId: '', customWorldName: '倒流港', customWorldSetting: '海水每晚倒流一小时，死者会回到岸边说一句话。', step: 1 }
  assert.deepEqual(saveLibrary(storage, library), { ok: true, error: null })
  const loaded = loadLibrary(storage)
  assert.equal(loaded.warning, null)
  assert.equal(loaded.library.stories[0].config.customWorldName, '倒流港')
  assert.ok(loaded.library.stories[0].config.customWorldSetting.includes('海水每晚倒流'))
  assert.equal(loaded.library.draft.customWorldSetting, library.draft.customWorldSetting)
  assert.doesNotThrow(() => importLibrary(exportLibrary(library)))
})

test('spawn point fields, origin identity and the seventh forge step round-trip through save and load', () => {
  const storage = new MemoryStorage()
  const created = createStory({ name: '阿遥', genreId: 'court', originIdentityId: 'heir', startPointName: '皇帝的卧室', startPointHook: '在龙床边的脚踏上醒来。' })
  const library = upsertStory(emptyLibrary(), created)
  library.draft = { genreId: 'court', worldChosen: true, originIdentityId: 'heir', startPointName: '皇帝的卧室', startPointHook: '在龙床边的脚踏上醒来。', step: 7 }
  assert.deepEqual(saveLibrary(storage, library), { ok: true, error: null })
  const loaded = loadLibrary(storage)
  assert.equal(loaded.warning, null)
  assert.equal(loaded.library.stories[0].config.startPointName, '皇帝的卧室')
  assert.equal(loaded.library.stories[0].config.startPointHook, '在龙床边的脚踏上醒来。')
  assert.equal(loaded.library.stories[0].config.originIdentityId, 'heir')
  assert.equal(loaded.library.draft.startPointName, '皇帝的卧室')
  assert.equal(loaded.library.draft.originIdentityId, 'heir')
  assert.equal(loaded.library.draft.worldChosen, true)
  assert.equal(loaded.library.draft.step, 7)
  // A step beyond the seven-step flow is structurally invalid.
  const broken = { ...emptyLibrary(), draft: { genreId: 'court', step: 8 } }
  const brokenStorage = new MemoryStorage({ [STORAGE_KEY]: JSON.stringify(broken) })
  assert.match(loadLibrary(brokenStorage).warning, /结构无效/)
  // A non-boolean world marker is structurally invalid too.
  const badMarker = { ...emptyLibrary(), draft: { genreId: 'court', worldChosen: 'yes' } }
  const badMarkerStorage = new MemoryStorage({ [STORAGE_KEY]: JSON.stringify(badMarker) })
  assert.match(loadLibrary(badMarkerStorage).warning, /结构无效/)
})

test('non-string custom world fields fail library validation', () => {
  const custom = createStory({ genreId: 'custom', name: '宁笙', customWorldName: '倒流港' })
  const broken = upsertStory(emptyLibrary(), {
    ...custom,
    config: { ...custom.config, customWorldSetting: 600 },
  })
  const storage = new MemoryStorage()
  assert.equal(saveLibrary(storage, broken).ok, false)
})

test('season and long stories validate at their mode-sized chapter counts', () => {
  const walk = (story, count) => {
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
  const season = walk(createStory({ genreId: 'mist', storyLengthMode: 'season', name: '季' }), 24)
  assert.equal(season.chapters.length, 24)
  const library = { ...emptyLibrary(), stories: [season], activeStoryId: season.id }
  assert.deepEqual(validateLibrary(library), [])
  const roundTrip = importLibrary(exportLibrary(library))
  assert.equal(roundTrip.stories[0].chapters.length, 24)
  assert.equal(roundTrip.stories[0].config.storyLengthMode, 'season')
  // Choices recorded deep into a season (chapter 14) survive validation.
  assert.ok(Object.keys(roundTrip.stories[0].choices).some((key) => Number(key) === 13))
  // A short story with a seventh chapter is still corrupt data.
  const bloated = { ...createStory({ genreId: 'mist' }), chapters: season.chapters.slice(0, 7), chapterIndex: 6 }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [bloated] }).length > 0)
  // A bogus length mode is rejected at the config level.
  const bogus = createStory({ genreId: 'mist' })
  bogus.config = { ...bogus.config, storyLengthMode: 'huge' }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [bogus] }).some((error) => error.includes('storyLengthMode')))
})

test('custom and endless length configs validate against their own totals', () => {
  const walk = (story, count) => {
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
  // A finished custom line validates and round-trips with its target.
  const custom = walk(createStory({ genreId: 'mist', storyLengthMode: 'custom', targetChapters: 10, name: '自' }), 10)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [custom] }), [])
  const roundTrip = importLibrary(exportLibrary({ ...emptyLibrary(), stories: [custom], activeStoryId: custom.id }))
  assert.equal(roundTrip.stories[0].config.targetChapters, 10)
  // An over-long custom line (11 chapters against a 10 target) is corrupt.
  // (Hand-assembled: the engine itself refuses to build an 11th chapter.)
  const base = walk(createStory({ genreId: 'mist', storyLengthMode: 'custom', targetChapters: 10, name: '自' }), 10)
  const extra = { ...base.chapters[8], id: `${base.id}:chapter:10:r0`, index: 10 }
  const over = { ...base, chapters: [...base.chapters, extra], chapterIndex: 9 }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [over] }).length > 0)
  // A custom story whose target is below the minimum is rejected outright.
  const tooSmall = createStory({ genreId: 'mist' })
  tooSmall.config = { ...tooSmall.config, storyLengthMode: 'custom', targetChapters: 5 }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [tooSmall] })
    .some((error) => error.includes('targetChapters')))
  // An endless line validates at any reached count and must carry no target.
  const endless = walk(createStory({ genreId: 'mist', storyLengthMode: 'endless', name: '无' }), 13)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [endless] }), [])
  const endlessTarget = createStory({ genreId: 'mist' })
  endlessTarget.config = { ...endlessTarget.config, storyLengthMode: 'endless', targetChapters: 50 }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [endlessTarget] })
    .some((error) => error.includes('targetChapters')))
})
