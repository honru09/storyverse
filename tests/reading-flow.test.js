import test from 'node:test'
import assert from 'node:assert/strict'
import { createStory, chooseBranch, publicSnapshot } from '../src/story-engine.js'
import { lastAccessibleIndex, materialize, moveReadingPosition, prepareReadingWindow, readerIndexFor, readingProgress } from '../src/reading-flow.js'

test('opening prepares two chapters and warming again is idempotent', () => {
  const story = prepareReadingWindow(createStory())
  assert.equal(story.chapters.length, 2)
  assert.equal(prepareReadingWindow(story), story)
  assert.equal(readerIndexFor(story), 0)
  assert.equal(readingProgress(story), 17)
})

test('preparation stops before an unresolved decision, including an invalid saved choice', () => {
  const story = prepareReadingWindow(createStory())
  const atDecision = moveReadingPosition(story, 1)
  assert.equal(prepareReadingWindow(atDecision), atDecision)
  assert.equal(prepareReadingWindow({ ...atDecision, choices: { 1: 'invalid' } }).chapters.length, 2)
})

test('choosing prepares only the next chapter and entering it prepares one more', () => {
  let story = moveReadingPosition(prepareReadingWindow(createStory()), 1)
  story = chooseBranch(story, 1, 'open')
  story = prepareReadingWindow(story)
  assert.equal(story.chapters.length, 3)
  story = prepareReadingWindow(moveReadingPosition(story, 2))
  assert.equal(story.chapters.length, 4)
  assert.equal(prepareReadingWindow(moveReadingPosition(story, 3)).chapters.length, 4)
})

test('rewriting and reading back cannot skip a fresh decision or retain future content', () => {
  let story = prepareReadingWindow(createStory())
  story = materialize(chooseBranch(story, 1, 'open'), 4)
  story = materialize(chooseBranch(story, 3, 'cross'), 6)
  const rewritten = chooseBranch(story, 1, 'wait')
  const warmed = prepareReadingWindow(moveReadingPosition(rewritten, 1))
  assert.equal(warmed.chapters.length, 3)
  assert.equal(warmed.choices[3], undefined)
  assert.equal(moveReadingPosition(warmed, 5), warmed)
  assert.equal(readerIndexFor({ ...warmed, readerIndex: 5 }), 2)
  assert.equal(prepareReadingWindow(moveReadingPosition(warmed, 0)).chapters.length, 3)
})

test('directory cannot bypass an unanswered node even with stale stored chapters', () => {
  let story = materialize(chooseBranch(prepareReadingWindow(createStory()), 1, 'open'), 4)
  story = { ...story, choices: {}, readerIndex: 3 }
  assert.equal(lastAccessibleIndex(story), 1)
  assert.equal(readerIndexFor(story), 1)
  assert.equal(moveReadingPosition(story, 2), story)
})

test('public snapshots allow their published chapters but never prepare additional content', () => {
  const snapshot = publicSnapshot(prepareReadingWindow(createStory()))
  assert.equal(prepareReadingWindow(snapshot), snapshot)
  assert.equal(lastAccessibleIndex(snapshot, true), 1)
  assert.equal(moveReadingPosition(snapshot, 2, true), snapshot)
})

test('finale stops preparation and corrupt saved positions are safely clamped', () => {
  let story = materialize(chooseBranch(prepareReadingWindow(createStory()), 1, 'open'), 4)
  story = materialize(chooseBranch(story, 3, 'cross'), 6)
  const finale = moveReadingPosition(story, 5)
  assert.equal(prepareReadingWindow(finale), finale)
  assert.equal(readingProgress(finale), 100)
  assert.equal(readerIndexFor({ ...story, readerIndex: -20 }), 0)
  assert.equal(readerIndexFor({ ...story, readerIndex: 80 }), 5)
  assert.equal(readerIndexFor({ ...story, readerIndex: 'bad' }), 0)
})
