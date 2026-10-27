import test from 'node:test'
import assert from 'node:assert/strict'

import {
  coverInfoFor,
  generatedCount,
  progressLabelFor,
  rankMetaFor,
  rankStoreBooks,
  seasonLabel,
  shelfMetaFor,
  statusBadgeFor,
  storyComplete,
} from '../src/list-layout.js'

const chapters = (n) => Array.from({ length: n }, (_, i) => ({ index: i }))

// Season story mid-run: 8 of 24 chapters generated, reader on chapter 3.
const seasonStory = {
  title: '借火登天',
  status: 'ongoing',
  genreId: 'cultivation',
  readerIndex: 2,
  chapters: chapters(8),
  config: { genreId: 'cultivation', storyLengthMode: 'season', seasonNumber: 1 },
}

const finishedShort = {
  title: '短篇完结',
  status: 'complete',
  genreId: 'mist',
  chapters: chapters(6),
  config: { genreId: 'mist', storyLengthMode: 'short' },
}

const freshLong = {
  title: '长线未开',
  genreId: 'neon',
  chapters: [],
  config: { genreId: 'neon', storyLengthMode: 'long' },
}

test('badge comes from real state only: complete, then season, then serial', () => {
  assert.equal(statusBadgeFor(finishedShort), '已完结')
  assert.equal(statusBadgeFor(seasonStory), '第1季')
  assert.equal(statusBadgeFor(freshLong), '连载中')
  // A story finished by chapter count is complete even without the flag.
  assert.equal(storyComplete({ ...finishedShort, status: 'ongoing' }), true)
  assert.equal(storyComplete(seasonStory), false)
})

test('season label exists only for season mode and honours seasonNumber', () => {
  assert.equal(seasonLabel(seasonStory), '第1季')
  assert.equal(seasonLabel({ ...seasonStory, config: { ...seasonStory.config, seasonNumber: 3 } }), '第3季')
  assert.equal(seasonLabel(finishedShort), null)
  assert.equal(seasonLabel(freshLong), null)
  // A missing/invalid seasonNumber falls back to the first season, never 0.
  assert.equal(seasonLabel({ ...seasonStory, config: { storyLengthMode: 'season' } }), '第1季')
})

test('progress label uses generated/total chapters, nothing invented', () => {
  assert.equal(progressLabelFor(finishedShort), '全 6 章')
  assert.equal(progressLabelFor(seasonStory), '第 8 / 24 章')
  assert.equal(progressLabelFor(freshLong), '共 100 章')
  assert.equal(generatedCount(seasonStory), 8)
  assert.equal(generatedCount(null), 0)
})

test('shelf meta line: reader position plus state, one line', () => {
  assert.equal(shelfMetaFor(seasonStory), '第 3 章 · 第1季')
  assert.equal(shelfMetaFor(finishedShort), '已完结 · 全 6 章')
  assert.equal(shelfMetaFor({ ...freshLong, readerIndex: 0 }), '第 1 章 · 连载中')
})

test('cover info puts the season first while the story is running', () => {
  assert.equal(coverInfoFor(seasonStory), '第1季 · 第 8 / 24 章')
  assert.equal(coverInfoFor(finishedShort), '全 6 章')
  assert.equal(coverInfoFor(freshLong), '共 100 章')
})

const storeBook = (title, story) => ({
  id: title, title, snapshot: story, category: '修仙', type: '连载中',
})

test('ranking sorts by real generated chapters, complete filter is honest', () => {
  const books = [
    storeBook('乙书', { ...seasonStory, chapters: chapters(3) }),
    storeBook('甲书', { ...seasonStory, chapters: chapters(9) }),
    storeBook('丙书', finishedShort),
  ]
  assert.deepEqual(rankStoreBooks(books).map((b) => b.title), ['甲书', '丙书', '乙书'])
  assert.deepEqual(rankStoreBooks(books, { completeOnly: true }).map((b) => b.title), ['丙书'])
  assert.deepEqual(rankStoreBooks([]), [])
  assert.deepEqual(rankStoreBooks(null), [])
})

test('rank meta is category-adjacent real data: world + progress', () => {
  const meta = rankMetaFor(storeBook('借火登天', seasonStory))
  assert.equal(meta, '青岚宗 · 第 8 / 24 章')
  assert.ok(!/热度|万|评分/.test(meta), 'no invented popularity figures')
})
