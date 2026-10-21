import { acceptChapter, buildChapter, chapterKey } from './story-engine.js'

export const CHAPTER_COUNT = 6

export function selectedChoice(story, index) {
  const candidate = story?.choices?.[index]
  if (!candidate) return null
  try {
    return buildChapter(story, index).choice?.options.some((option) => option.id === candidate)
      ? candidate
      : null
  } catch {
    return null
  }
}

// A prepared chapter is not necessarily one the reader has reached. Never
// permit the directory or a restored position to skip an unresolved decision.
export function lastAccessibleIndex(story, readOnly = false) {
  const chapters = story?.chapters || []
  let last = -1
  for (let index = 0; index < Math.min(chapters.length, CHAPTER_COUNT); index += 1) {
    if (chapters[index]?.index !== index) break
    last = index
    if (!readOnly && chapters[index].choice && !selectedChoice(story, index)) break
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
  const target = Math.min(CHAPTER_COUNT, Math.max(0, Math.floor(targetLength)))
  while (current.chapters.length < target) {
    const index = current.chapters.length
    const chapter = buildChapter(current, index)
    const accepted = acceptChapter(current, chapter, chapterKey(current, index))
    if (accepted === current) break
    current = accepted
  }
  return current
}

// One chapter ahead, bounded by the next unresolved decision. Calling again is
// idempotent, so reading, revisiting, and React effect reruns cannot overproduce.
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
  return story ? Math.round(((readerIndexFor(story) + 1) / CHAPTER_COUNT) * 100) : 0
}
