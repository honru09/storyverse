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

test('preparation never stops for a stored choice: legacy recordings are inert', () => {
  const story = prepareReadingWindow(createStory())
  const atFormerGate = moveReadingPosition(story, 1)
  // Chapter 2 used to be a decision chapter; nothing waits there now, so
  // the window prepares the next chapter straight away — and a bogus
  // stored choice from an old save changes nothing either.
  assert.equal(prepareReadingWindow(atFormerGate).chapters.length, 3)
  assert.equal(prepareReadingWindow({ ...atFormerGate, choices: { 1: 'invalid' } }).chapters.length, 3)
  assert.equal(prepareReadingWindow({ ...atFormerGate, choices: { 1: 'open' } }).chapters.length, 3)
})

test('moving the reading position prepares exactly one chapter ahead', () => {
  let story = moveReadingPosition(prepareReadingWindow(createStory()), 1)
  story = prepareReadingWindow(story)
  assert.equal(story.chapters.length, 3)
  story = prepareReadingWindow(moveReadingPosition(story, 2))
  assert.equal(story.chapters.length, 4)
  assert.equal(prepareReadingWindow(moveReadingPosition(story, 3)).chapters.length, 5)
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

test('directory reaches every stored chapter; a cleared legacy choice gates nothing', () => {
  let story = materialize(chooseBranch(prepareReadingWindow(createStory()), 1, 'open'), 4)
  story = { ...story, choices: {}, readerIndex: 3 }
  assert.equal(lastAccessibleIndex(story), 3)
  assert.equal(readerIndexFor(story), 3)
  assert.equal(readerIndexFor(moveReadingPosition(story, 2)), 2)
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
