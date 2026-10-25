import { acceptChapter, chapterKey } from './story-engine.js'
import { CHAPTER_COUNT, readerIndexFor, selectedChoice } from './reading-flow.js'
import { emptyLibrary, validateLibrary } from './persistence.js'

export function mergeSourceContext(story) {
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''
  return {
    genreId: text(story.genreId, 80),
    worldBible: {
      premise: text(story.worldBible.premise, 1000),
      rules: story.worldBible.rules.slice(0, 8).map((value) => text(value, 400)),
      endingAnchor: text(story.worldBible.endingAnchor, 1000),
      outline: story.worldBible.outline.slice(0, 6).map((value) => text(value, 400)),
    },
    choices: { ...story.choices },
    summaries: story.chapters.slice(0, 6).map((chapter) => ({ chapter: chapter.index + 1, summary: text(chapter.summary, 600) })),
  }
}

export function nextGenerationIndex(story, position = readerIndexFor(story)) {
  if (!story || story.readOnly || story.engine !== 'gemini') return null
  const index = story.chapters.length
  if (index >= CHAPTER_COUNT || index >= position + 2) return null
  const previous = story.chapters[index - 1]
  if (previous?.choice && !selectedChoice(story, index - 1)) return null
  return index
}

// Apply to the current story, not the request-time snapshot. A late answer must
// not restore an abandoned branch, change a bookmark or move the reader back.
export function acceptGeneratedChapter(story, result) {
  const index = result?.chapter?.index
  if (!Number.isInteger(index) || index < 0 || index >= CHAPTER_COUNT) throw new Error('章节格式不完整，请重试。')
  if (result.key !== chapterKey(story, index)) return story
  let next = acceptChapter(story, result.chapter, result.key)
  if (next === story) return story
  if (index === 0 && result.worldBible) next = { ...next, worldBible: result.worldBible }
  const checked = validateLibrary({ ...emptyLibrary(), stories: [next], activeStoryId: next.id })
  if (checked.length) throw new Error('章节格式不完整，请重试。')
  return next
}

export async function generationStatus({ fetchImpl = globalThis.fetch, signal } = {}) {
  try {
    const response = await fetchImpl('/api/status', { signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]) })
    if (!response.ok) throw new Error('unavailable')
    const result = await response.json()
    return { configured: result.configured === true, provider: 'gemini', ...(result.reason === 'generation-disabled' ? { reason: 'generation-disabled' } : {}) }
  } catch {
    return { configured: false, provider: 'gemini' }
  }
}

export async function requestChapter(story, index, { fetchImpl = globalThis.fetch, signal } = {}) {
  const timeout = AbortSignal.timeout(65000)
  let response
  try {
    response = await fetchImpl('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story, index }),
      signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]),
    })
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error(timeout.aborted ? '这一章等待较久，进度已保留，请重试。' : '暂时无法连接，进度已保留，请重试。', { cause: error })
  }
  let result
  try { result = await response.json() } catch { throw new Error('章节暂时未能接上，请重试。') }
  if (!response.ok) {
    const messages = { 429: '请求较多，请稍后再试。', 503: '在线创作暂不可用，已保存的章节仍可阅读。请稍后再试。', 504: '这一章等待较久，进度已保留，请重试。' }
    throw new Error(messages[response.status] || '这一章暂时没能接上，进度已保留，请重试。')
  }
  if (result?.chapter?.index !== index || result?.key !== chapterKey(story, index) || acceptGeneratedChapter(story, result) === story) {
    throw new Error('章节与当前选择不匹配，请重试。')
  }
  return result
}
