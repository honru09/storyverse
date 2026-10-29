import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkShelves, coverTitleLayoutFor, shelfTiltFor } from '../src/list-layout.js'

const books = (count) => Array.from({ length: count }, (_, index) => ({ id: `story-${index + 1}`, title: `书${index + 1}` }))

test('chunkShelves groups books onto planks of the given capacity', () => {
  assert.deepEqual(chunkShelves(books(7), 3).map((row) => row.length), [3, 3, 1])
  assert.deepEqual(chunkShelves(books(6), 3).map((row) => row.length), [3, 3])
  assert.deepEqual(chunkShelves(books(2), 3).map((row) => row.length), [2])
  assert.deepEqual(chunkShelves([], 3), [])
  assert.deepEqual(chunkShelves(null, 3), [])
  // Order is preserved — the shelf never reshuffles the reader's books.
  assert.equal(chunkShelves(books(5), 3)[1][0].id, 'story-4')
  // A bad capacity falls back to the phone-width three.
  assert.deepEqual(chunkShelves(books(4), 0).map((row) => row.length), [3, 1])
})

test('shelfTiltFor is a constant 0: books stand straight (DEVICE-FIX REQ-20)', () => {
  // The seeded micro-tilt is retired by user order (2026-10-30): every
  // book, whatever its id, rests at exactly 0 degrees.
  for (const id of ['a', 'story-1', 'story-2', 'story-3', 'xyz-999', '长标题的故事']) {
    assert.equal(shelfTiltFor({ id }), 0, `${id} stands straight`)
  }
  assert.equal(shelfTiltFor({}), 0)
  assert.equal(shelfTiltFor(null), 0)
  assert.equal(shelfTiltFor(), 0)
})

test('coverTitleLayoutFor sends long titles to the vertical tag', () => {
  assert.equal(coverTitleLayoutFor({ title: '潮汐与火种' }), 'horizontal')
  assert.equal(coverTitleLayoutFor({ title: '一二三四五六七八' }), 'horizontal')
  assert.equal(coverTitleLayoutFor({ title: '一二三四五六七八九' }), 'vertical')
  assert.equal(coverTitleLayoutFor({ title: '白潮港的第七次钟声' }), 'vertical')
  assert.equal(coverTitleLayoutFor({}), 'horizontal')
  assert.equal(coverTitleLayoutFor(null), 'horizontal')
})
