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

test('shelfTiltFor is seeded by story id: stable, bounded, varied', () => {
  const first = shelfTiltFor({ id: 'story-alpha' })
  assert.equal(shelfTiltFor({ id: 'story-alpha' }), first)
  for (const id of ['a', 'story-1', 'story-2', 'story-3', 'xyz-999', '长标题的故事']) {
    const tilt = shelfTiltFor({ id })
    assert.ok(tilt >= -1.2 && tilt <= 1.2, `${id} tilt ${tilt} within ±1.2°`)
  }
  const tilts = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => shelfTiltFor({ id })))
  assert.ok(tilts.size > 1, 'neighbours do not all lean identically')
  assert.equal(shelfTiltFor({}), shelfTiltFor({ id: '' }))
  assert.equal(shelfTiltFor(null), shelfTiltFor({ id: '' }))
})

test('coverTitleLayoutFor sends long titles to the vertical tag', () => {
  assert.equal(coverTitleLayoutFor({ title: '潮汐与火种' }), 'horizontal')
  assert.equal(coverTitleLayoutFor({ title: '一二三四五六七八' }), 'horizontal')
  assert.equal(coverTitleLayoutFor({ title: '一二三四五六七八九' }), 'vertical')
  assert.equal(coverTitleLayoutFor({ title: '白潮港的第七次钟声' }), 'vertical')
  assert.equal(coverTitleLayoutFor({}), 'horizontal')
  assert.equal(coverTitleLayoutFor(null), 'horizontal')
})
