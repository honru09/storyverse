import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'

function story(id, overrides = {}) {
  return {
    id,
    title: id,
    genreId: 'mist',
    config: { protagonist: id },
    worldBible: { rules: [] },
    chapterIndex: 0,
    chapters: [],
    choices: [],
    revision: 0,
    ...overrides,
  }
}

const libraryWith = (entry) => ({ ...emptyLibrary(), stories: [entry], activeStoryId: entry.id })

test('a story without any cover field stays valid (pre-cover saves)', () => {
  assert.deepEqual(validateLibrary(libraryWith(story('legacy'))), [])
})

test('cover state on a story validates in every status', () => {
  for (const status of ['none', 'pending', 'ready', 'failed']) {
    const entry = story(`s-${status}`, { cover: { status, version: 1, updatedAt: '2026-10-27T00:00:00.000Z' } })
    assert.deepEqual(validateLibrary(libraryWith(entry)), [], status)
  }
  assert.deepEqual(validateLibrary(libraryWith(story('v0', { cover: { status: 'pending', version: 0 } }))), [])
})

test('malformed cover fields fail validation instead of poisoning the library', () => {
  const badStatus = validateLibrary(libraryWith(story('bad-1', { cover: { status: 'painted', version: 1 } })))
  assert.ok(badStatus.some((error) => error.includes('cover.status')), badStatus.join(';'))
  const badVersion = validateLibrary(libraryWith(story('bad-2', { cover: { status: 'ready', version: -2 } })))
  assert.ok(badVersion.some((error) => error.includes('cover.version')), badVersion.join(';'))
  const notObject = validateLibrary(libraryWith(story('bad-3', { cover: 'ready' })))
  assert.ok(notObject.some((error) => error.includes('cover must be an object')), notObject.join(';'))
})
