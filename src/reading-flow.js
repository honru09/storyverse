import { acceptChapter, buildChapter, chapterKey, totalChaptersFor } from './story-engine.js'

// Legacy default for short stories; every function below derives the real
// total from the story's length mode via totalChaptersFor.
export const CHAPTER_COUNT = 6

// Every sequentially generated chapter is accessible. Before the
// intervention batch this walk stopped at an unresolved chapter-end
// choice; choices are retired, so nothing gates the reader's path any
// more — a stored legacy choice on an old chapter is simply passed over.
export function lastAccessibleIndex(story, readOnly = false) {
  const chapters = story?.chapters || []
  const total = story ? totalChaptersFor(story) : CHAPTER_COUNT
  let last = -1
  for (let index = 0; index < Math.min(chapters.length, total); index += 1) {
    if (chapters[index]?.index !== index) break
    last = index
  }
  return last
}

export function readerIndexFor(story, readOnly = false) {
  const saved = Number.isInteger(story?.readerIndex) ? story.readerIndex : 0
  return Math.max(0, Math.min(saved, lastAccessibleIndex(story, readOnly)))
}

export function materialize(story, targetLength) {
  // Remote stories can only accept model responses through acceptChapter.
  // Preparing a reading window must never substitute the local demo prose.
  if (story?.engine === 'gemini' || story?.readOnly) return story
  let current = story
  const total = totalChaptersFor(story)
  const target = Math.min(total, Math.max(0, Math.floor(targetLength)))
  while (current.chapters.length < target) {
    const index = current.chapters.length
    const chapter = buildChapter(current, index)
    const accepted = acceptChapter(current, chapter, chapterKey(current, index))
    if (accepted === current) break
    current = accepted
  }
  return current
}

// One chapter ahead, unconditionally. Calling again is idempotent, so
// reading, revisiting, and React effect reruns cannot overproduce.
export function prepareReadingWindow(story, index = readerIndexFor(story)) {
  if (story?.readOnly || story?.engine === 'gemini') return story
  const position = readerIndexFor({ ...story, readerIndex: index })
  return materialize(story, position + 2)
}

export function moveReadingPosition(story, index, readOnly = false) {
  if (!Number.isInteger(index) || index < 0 || index > lastAccessibleIndex(story, readOnly)) return story
  return { ...story, readerIndex: index, updatedAt: new Date().toISOString() }
}

export function readingProgress(story) {
  return story ? Math.round(((readerIndexFor(story) + 1) / totalChaptersFor(story)) * 100) : 0
}
