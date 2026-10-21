import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STORAGE_KEY,
  emptyLibrary,
  loadLibrary,
  migrateLegacy,
  saveLibrary,
  upsertStory,
} from '../src/persistence.js'

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
