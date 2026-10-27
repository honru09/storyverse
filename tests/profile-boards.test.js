import test from 'node:test'
import assert from 'node:assert/strict'

import {
  profileBoardsFor,
  searchProfileLines,
  sortProfileLines,
} from '../src/profile-boards.js'

const line = (overrides = {}) => ({
  id: 'line-1',
  title: '借火登天',
  genreId: 'cultivation',
  genreTemplateId: 'xianxia',
  worldName: '青岚宗',
  premise: '少年在山神破庙借来一瞬火焰。',
  publishedAt: '2026-10-20T00:00:00.000Z',
  ...overrides,
})

test('profile boards: all-lines board first, then one board per world', () => {
  const neon = line({ id: 'line-2', title: '雨幕备份', genreId: 'neon', worldName: '霓虹下城', publishedAt: '2026-10-22T00:00:00.000Z' })
  const secondCultivation = line({ id: 'line-3', title: '剑碑之后', publishedAt: '2026-10-21T00:00:00.000Z' })
  const profile = {
    worlds: [
      { worldId: 'neon', name: '霓虹下城' },
      { worldId: 'cultivation', name: '青岚宗' },
      { worldId: 'city', name: '长宁街' },
    ],
    publications: [line(), neon, secondCultivation],
  }

  const boards = profileBoardsFor(profile)

  assert.deepEqual(boards.map((board) => board.title), ['全部故事线', '霓虹下城', '青岚宗'])
  assert.deepEqual(boards.map((board) => board.publications.length), [3, 1, 2])
  assert.deepEqual(boards[0].publications.map((item) => item.id), ['line-2', 'line-3', 'line-1'])
})

test('profile boards: a world missing from the worlds list still gets a board', () => {
  const boards = profileBoardsFor({ worlds: [], publications: [line()] })
  assert.equal(boards.length, 2)
  assert.equal(boards[1].title, '青岚宗')
})

test('profile line sorting supports newest, oldest and title without mutating input', () => {
  const input = [
    line({ id: 'middle', title: '中间', publishedAt: '2026-10-21T00:00:00.000Z' }),
    line({ id: 'newest', title: '阿新', publishedAt: '2026-10-22T00:00:00.000Z' }),
    line({ id: 'oldest', title: '最初', publishedAt: '2026-10-20T00:00:00.000Z' }),
  ]

  assert.deepEqual(sortProfileLines(input, 'newest').map((item) => item.id), ['newest', 'middle', 'oldest'])
  assert.deepEqual(sortProfileLines(input, 'oldest').map((item) => item.id), ['oldest', 'middle', 'newest'])
  assert.deepEqual(sortProfileLines(input, 'title').map((item) => item.id), ['newest', 'middle', 'oldest'])
  assert.deepEqual(input.map((item) => item.id), ['middle', 'newest', 'oldest'])
})

test('profile line search matches title, world, craft and premise', () => {
  const cyber = line({
    id: 'cyber',
    title: '雨幕备份',
    genreId: 'neon',
    genreTemplateId: 'scifi',
    worldName: '霓虹下城',
    premise: '在胶囊舱里醒来。',
  })
  const lines = [line(), cyber]

  assert.deepEqual(searchProfileLines(lines, '借火').map((item) => item.id), ['line-1'])
  assert.deepEqual(searchProfileLines(lines, '霓虹').map((item) => item.id), ['cyber'])
  assert.deepEqual(searchProfileLines(lines, '科幻').map((item) => item.id), ['cyber'])
  assert.deepEqual(searchProfileLines(lines, '胶囊舱').map((item) => item.id), ['cyber'])
  assert.deepEqual(searchProfileLines(lines, '不存在'), [])
})
