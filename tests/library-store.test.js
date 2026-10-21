import test from 'node:test'
import assert from 'node:assert/strict'
import { createLibraryStore } from '../src/library-store.js'
import { emptyLibrary, STORAGE_KEY, upsertStory } from '../src/persistence.js'
import { createStory } from '../src/story-engine.js'
import { parseRoute, routeHash } from '../src/navigation.js'

class MemoryStorage {
  constructor(raw = null) {
    this.values = new Map(raw === null ? [] : [[STORAGE_KEY, raw]])
    this.writes = []
    this.failRead = false
    this.failWrite = null
    this.afterRead = null
    this.afterWrite = null
  }

  getItem(key) {
    if (this.failRead) throw new Error('storage read denied')
    const value = this.values.get(key) ?? null
    this.afterRead?.(key, value)
    return value
  }

  setItem(key, value) {
    if (this.failWrite?.(key, value)) throw new Error('quota exceeded')
    this.values.set(key, String(value))
    this.writes.push([key, String(value)])
    this.afterWrite?.(key, value)
  }
}

const libraryWithName = (name) => upsertStory(emptyLibrary(), createStory({ name }))
const rawOf = (library) => JSON.stringify(library)

test('a corrupt original survives the first interaction and repeated retries', () => {
  const original = '{broken-library'
  const storage = new MemoryStorage(original)
  const store = createLibraryStore(storage)
  const temporary = libraryWithName('暂存旅者')

  assert.equal(store.getSnapshot().blocked, true)
  assert.equal(store.update(temporary), false)
  assert.equal(store.retry(), false)
  assert.deepEqual(store.getSnapshot().library, temporary)
  assert.equal(store.getSnapshot().unsaved, true)
  assert.equal(storage.values.get(STORAGE_KEY), original)
  assert.deepEqual(storage.writes, [])
})

test('quota failures retain temporary progress and retry saves it after space is available', () => {
  const original = libraryWithName('原旅者')
  const storage = new MemoryStorage(rawOf(original))
  const store = createLibraryStore(storage)
  const updated = { ...original, draft: { name: '下一位旅者' } }
  storage.failWrite = () => true

  assert.equal(store.update(updated), false)
  assert.deepEqual(store.getSnapshot().library, updated)
  assert.equal(store.getSnapshot().unsaved, true)
  assert.equal(store.getSnapshot().blocked, false)
  assert.equal(storage.values.get(STORAGE_KEY), rawOf(original))
  storage.failWrite = null
  assert.equal(store.retry(), true)
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), updated)
  assert.equal(store.getSnapshot().warning, null)
  assert.equal(store.getSnapshot().unsaved, false)
})

test('stale tab writes are blocked and both its draft and the other tab library remain available', () => {
  const storage = new MemoryStorage(rawOf(emptyLibrary()))
  const first = createLibraryStore(storage)
  const second = createLibraryStore(storage)
  const firstLibrary = libraryWithName('第一窗口')
  const secondLibrary = libraryWithName('第二窗口')

  assert.equal(first.update(firstLibrary), true)
  assert.equal(second.update(secondLibrary), false)
  assert.deepEqual(second.getSnapshot().library, secondLibrary)
  assert.equal(second.getSnapshot().blocked, true)
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), firstLibrary)
  assert.equal(second.retry(), false)
  assert.equal(second.reload(), true)
  assert.deepEqual(second.getSnapshot().library, firstLibrary)
  assert.equal(second.getSnapshot().blocked, false)
  assert.equal(second.getSnapshot().unsaved, false)
})

test('clean tabs synchronize external saves and deletion without writing back', () => {
  const storage = new MemoryStorage(rawOf(emptyLibrary()))
  const store = createLibraryStore(storage)
  const external = libraryWithName('另一个窗口')
  const snapshots = []
  const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()))
  storage.values.set(STORAGE_KEY, rawOf(external))

  store.sync()
  assert.deepEqual(store.getSnapshot().library, external)
  assert.equal(store.getSnapshot().unsaved, false)
  assert.equal(snapshots.length, 1)
  storage.values.delete(STORAGE_KEY)
  store.sync()
  assert.deepEqual(store.getSnapshot().library, emptyLibrary())
  assert.deepEqual(storage.writes, [])
  unsubscribe()
  storage.values.set(STORAGE_KEY, rawOf(external))
  store.sync()
  assert.equal(snapshots.length, 2)
})

test('unsaved tab changes survive sync and cannot replace an external save on retry', () => {
  const original = libraryWithName('原旅者')
  const storage = new MemoryStorage(rawOf(original))
  const store = createLibraryStore(storage)
  const temporary = { ...original, draft: { name: '未存进度' } }
  storage.failWrite = () => true
  store.update(temporary)
  storage.failWrite = null
  const external = libraryWithName('新窗口')
  storage.values.set(STORAGE_KEY, rawOf(external))

  store.sync()
  assert.deepEqual(store.getSnapshot().library, temporary)
  assert.equal(store.getSnapshot().blocked, true)
  assert.equal(store.retry(), false)
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), external)
})

test('external corrupt data is preserved while the last readable library stays in memory', () => {
  const original = libraryWithName('原旅者')
  const storage = new MemoryStorage(rawOf(original))
  const store = createLibraryStore(storage)
  storage.values.set(STORAGE_KEY, '{corrupt-new-value')

  store.sync()
  assert.deepEqual(store.getSnapshot().library, original)
  assert.equal(store.getSnapshot().blocked, true)
  assert.equal(store.reload(), false)
  assert.equal(store.retry(), false)
  assert.equal(storage.values.get(STORAGE_KEY), '{corrupt-new-value')
})

test('restore backs up the exact corrupt original before replacing it', () => {
  const original = '{recover-this-original'
  const storage = new MemoryStorage(original)
  const store = createLibraryStore(storage)
  const replacement = libraryWithName('恢复旅者')

  assert.equal(store.restore(replacement), true)
  assert.equal(storage.values.get(`${STORAGE_KEY}:recovery`), original)
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), replacement)
  assert.deepEqual(store.getSnapshot().library, replacement)
  assert.equal(store.getSnapshot().unsaved, false)
  assert.equal(store.getSnapshot().blocked, false)
})

test('restore failures keep the live library and original stored data', () => {
  for (const failure of ['recovery-write', 'primary-write', 'invalid-library']) {
    const original = libraryWithName('原旅者')
    const originalRaw = rawOf(original)
    const storage = new MemoryStorage(originalRaw)
    const store = createLibraryStore(storage)
    const replacement = failure === 'invalid-library' ? { version: 2 } : libraryWithName('恢复旅者')
    storage.failWrite = (key) => failure === 'recovery-write'
      ? key === `${STORAGE_KEY}:recovery`
      : failure === 'primary-write' && key === STORAGE_KEY

    assert.throws(() => store.restore(replacement), /存档|书库|保存/)
    assert.equal(storage.values.get(STORAGE_KEY), originalRaw)
    assert.deepEqual(store.getSnapshot().library, original)
  }
})

test('unreadable existing storage is never mistaken for an empty library during update or restore', () => {
  const original = rawOf(libraryWithName('受保护旅者'))
  const storage = new MemoryStorage(original)
  storage.failRead = true
  const store = createLibraryStore(storage)
  const temporary = libraryWithName('暂存旅者')

  assert.equal(store.update(temporary), false)
  assert.deepEqual(store.getSnapshot().library, temporary)
  assert.equal(storage.values.get(STORAGE_KEY), original)
  assert.throws(() => store.restore(temporary), /读取|存档|存储/)
  assert.equal(storage.values.get(STORAGE_KEY), original)
  assert.deepEqual(storage.writes, [])
  storage.failRead = false
  assert.equal(store.reload(), true)
  assert.deepEqual(store.getSnapshot().library, JSON.parse(original))
  assert.equal(store.getSnapshot().blocked, false)
})

test('bootstrap keeps the exact read version so a newer tab save is detected', () => {
  const initial = libraryWithName('首次读取')
  const newer = libraryWithName('另一个窗口随后保存')
  const storage = new MemoryStorage(rawOf(initial))
  let replaced = false
  storage.afterRead = (key) => {
    if (key === STORAGE_KEY && !replaced) {
      replaced = true
      storage.values.set(STORAGE_KEY, rawOf(newer))
    }
  }
  const store = createLibraryStore(storage)
  assert.deepEqual(store.getSnapshot().library, initial)

  assert.equal(store.update({ ...initial, draft: { name: '旧窗口的新草稿' } }), false)
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), newer)
  assert.equal(store.getSnapshot().blocked, true)
})

test('post-write external changes do not become the version of an older in-memory library', () => {
  const storage = new MemoryStorage(rawOf(emptyLibrary()))
  const store = createLibraryStore(storage)
  const local = libraryWithName('本机保存')
  const external = libraryWithName('另一窗口紧接着保存')
  let replaced = false
  storage.afterWrite = (key) => {
    if (key === STORAGE_KEY && !replaced) {
      replaced = true
      storage.values.set(STORAGE_KEY, rawOf(external))
    }
  }
  store.update(local)

  assert.equal(store.update({ ...local, draft: { name: '未同步草稿' } }), false)
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), external)
})

test('malformed route encodings safely return home and valid encoded IDs round-trip', () => {
  for (const hash of ['', '#/', '#/unknown', '#/reader', '#/shared/', '#/reader/%', '#/reader/%E0%A4%A', '#/shared/%GG']) {
    assert.deepEqual(parseRoute(hash), { view: 'home' })
  }
  for (const view of ['home', 'forge', 'store', 'merge']) {
    assert.deepEqual(parseRoute(routeHash({ view })), { view })
  }
  for (const shared of [false, true]) {
    const route = { view: 'reader', id: '故事 / 合流#1?选择=甲', shared }
    assert.deepEqual(parseRoute(routeHash(route)), route)
  }
})

test('nonportable updates fail without throwing or changing the live library', () => {
  const original = libraryWithName('原旅者')
  const storage = new MemoryStorage(rawOf(original))
  const store = createLibraryStore(storage)
  const cycle = { ...original }
  cycle.extra = cycle
  for (const invalid of [{ version: 2 }, { ...original, extra: 1n }, cycle]) {
    assert.doesNotThrow(() => assert.equal(store.update(invalid), false))
    assert.deepEqual(store.getSnapshot().library, original)
    assert.equal(storage.values.get(STORAGE_KEY), rawOf(original))
  }
})

test('a transient read failure suspends saving and retry recovers after reads resume', () => {
  const original = libraryWithName('原旅者')
  const storage = new MemoryStorage(rawOf(original))
  const store = createLibraryStore(storage)
  const temporary = { ...original, draft: { name: '断开时的草稿' } }
  storage.failRead = true

  assert.equal(store.update(temporary), false)
  assert.equal(store.getSnapshot().unsaved, true)
  assert.equal(storage.values.get(STORAGE_KEY), rawOf(original))
  storage.failRead = false
  assert.equal(store.retry(), true)
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), temporary)
  assert.equal(store.getSnapshot().unsaved, false)
})
