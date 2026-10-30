import { acceptChapter, chapterKey, outlineLengthFor, replaceChapter, replaceFrontierChapter, storyLedgerFor, totalChaptersFor } from './story-engine.js'
import { readerIndexFor } from './reading-flow.js'
import { emptyLibrary, validateLibrary } from './persistence.js'

export function mergeSourceContext(story) {
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''
  return {
    genreId: text(story.genreId, 80),
    storyLengthMode: text(story.config?.storyLengthMode, 20),
    // A custom-length source's own total, so the merge context clips its
    // outline and summaries against the right bound.
    targetChapters: Number.isInteger(story.config?.targetChapters) ? story.config.targetChapters : null,
    // The avatar each side brought into the merge, if any: the id records
    // whose journey this becomes, the appearance line lets the merged
    // telling keep painting the same person.
    avatarId: text(story.config?.avatarId, 64),
    avatarAppearance: text(story.config?.avatarAppearance, 300),
    // The template this source pinned for itself (if any). A merged story
    // borrows each side's own pinned craft — never a world-derived default.
    genreTemplateId: text(story.genreTemplateId || story.config?.genreTemplateId, 80),
    // A free-genre source (REQ-51) carries its own words too, so the
    // server can borrow the same nearest-family craft for this side of
    // the merge instead of dropping the pin as unknown.
    customGenreText: text(story.config?.customGenreText, 40),
    worldBible: {
      premise: text(story.worldBible.premise, 1000),
      rules: story.worldBible.rules.slice(0, 8).map((value) => text(value, 400)),
      endingAnchor: text(story.worldBible.endingAnchor, 1000),
      outline: story.worldBible.outline.slice(0, outlineLengthFor(story)).map((value) => text(value, 400)),
    },
    // A merged source can be a finished season or long line; the hand-off
    // carries its most recent summaries rather than the whole book.
    summaries: story.chapters.slice(-12).map((chapter) => ({ chapter: chapter.index + 1, summary: text(chapter.summary, 600) })),
    // 伏笔并账 (FUSION2): the source's still-open foreshadowing moves onto
    // the fused line's books. The ledger is chapter-derived, so a
    // serialising source hands over every hook it has planted so far —
    // the fused line is expected to resolve them, not forget them.
    openForeshadowing: storyLedgerFor(story).foreshadowing.slice(-8)
      .map((entry) => ({ chapter: entry.chapter, text: text(entry.text, 300) })),
  }
}

export function nextGenerationIndex(story, position = readerIndexFor(story)) {
  if (!story || story.readOnly || story.engine !== 'gemini') return null
  const index = story.chapters.length
  if (index >= totalChaptersFor(story) || index >= position + 2) return null
  // No decision gate remains: the next chapter is prepared unconditionally,
  // still exactly one chapter ahead of the reader.
  return index
}

// Apply to the current story, not the request-time snapshot. A late answer must
// not restore an abandoned branch, change a bookmark or move the reader back.
// The name the server settled for an unnamed protagonist before the
// opening was written (FINAL-FIX R-03): it lands in the story's config
// so the settings book, the shelf and every later surface speak of the
// same person the prose does. A name the reader actually chose is
// never overwritten.
export function withDerivedProtagonistName(story, result) {
  const name = typeof result?.protagonistName === 'string' ? result.protagonistName.trim() : ''
  if (!name) return story
  const existing = typeof story.config?.name === 'string' ? story.config.name.trim() : ''
  if (existing) return story
  return { ...story, config: { ...story.config, name } }
}

export function acceptGeneratedChapter(story, result) {
  const index = result?.chapter?.index
  if (!Number.isInteger(index) || index < 0 || index >= totalChaptersFor(story)) throw new Error('章节格式不完整，请重试。')
  if (result.key !== chapterKey(story, index)) return story
  let next = acceptChapter(story, result.chapter, result.key)
  if (next === story) return story
  next = withDerivedProtagonistName(next, result)
  if (index === 0 && result.worldBible) next = { ...next, worldBible: result.worldBible }
  // Remember which genre template the server resolved for this story so later
  // chapter requests can pin the same template instead of re-mapping.
  if (typeof result.genreTemplateId === 'string' && result.genreTemplateId) next = { ...next, genreTemplateId: result.genreTemplateId }
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

async function sendGenerateRequest(story, payload, { fetchImpl = globalThis.fetch, signal, getAccessToken, onAuthRequired } = {}) {
  // The server now works inside a 270s total budget (retries + fallback,
  // RELIABILITY.md) under the platform's 300s ceiling; the old 65s client
  // cap aborted slow-evening chapters the server was about to deliver.
  // The wait is carried by the staged progress screen, not by this cap.
  const timeout = AbortSignal.timeout(290_000)
  const headers = { 'Content-Type': 'application/json' }
  if (getAccessToken) {
    // Either sign-in channel can supply the bearer token. A guest simply
    // sends no header: the server answers 401 when auth is switched on.
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* token unavailable; the server decides */ }
  }
  let response
  try {
    response = await fetchImpl('/api/generate', {
      method: 'POST', headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]),
    })
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error(timeout.aborted ? '这一章等待较久，进度已保留，请重试。' : '暂时无法连接，进度已保留，请重试。', { cause: error })
  }
  let result
  try { result = await response.json() } catch { throw new Error('章节暂时未能接上，请重试。') }
  if (!response.ok) {
    // Server error text is never shown; stable codes map to fixed copy here.
    if (response.status === 401 || result?.code === 'auth-required') {
      onAuthRequired?.()
      throw new Error('请先登录，再继续在线创作。登录后这一章会接着生成。')
    }
    if (result?.code === 'quota-exceeded') throw new Error('今天的生成额度已用完，请明天再继续创作。你的故事和进度都已保存。')
    const messages = { 429: '请求较多，请稍后再试。', 503: '在线创作暂不可用，已保存的章节仍可阅读。请稍后再试。', 504: '这一章等待较久，进度已保留，请重试。' }
    throw new Error(messages[response.status] || '这一章暂时没能接上，进度已保留，请重试。')
  }
  return result
}

export async function requestChapter(story, index, options = {}) {
  const result = await sendGenerateRequest(story, { story, index }, options)
  if (result?.chapter?.index !== index || result?.key !== chapterKey(story, index) || acceptGeneratedChapter(story, result) === story) {
    throw new Error('章节与当前进度不匹配，请重试。')
  }
  return result
}

// Apply a revision result to the current story: the pre-generated target
// chapter is swapped for its regenerated version and its interventions
// flip to applied. Anything else about the story — earlier chapters, the
// reading position, bookmarks — is untouched by construction.
export function acceptRevisedChapter(story, result) {
  const index = result?.chapter?.index
  if (!Number.isInteger(index) || index < 0 || index >= totalChaptersFor(story)) throw new Error('章节格式不完整，请重试。')
  if (result.key !== chapterKey(story, index)) return story
  const next = replaceChapter(story, result.chapter, result.key)
  if (next === story) return story
  const checked = validateLibrary({ ...emptyLibrary(), stories: [next], activeStoryId: next.id })
  if (checked.length) throw new Error('章节格式不完整，请重试。')
  return next
}

// The intervention revision pass: same endpoint, same quota accounting as
// a normal generation — the server regenerates the already-prepared next
// chapter with the queued interventions woven in.
export async function requestChapterRevision(story, index, options = {}) {
  const result = await sendGenerateRequest(story, { story, index, mode: 'revise' }, options)
  if (result?.chapter?.index !== index || result?.key !== chapterKey(story, index) || acceptRevisedChapter(story, result) === story) {
    throw new Error('重写结果与当前进度不匹配，请重试。')
  }
  return result
}

// Apply a re-roll result to the current story: the frontier chapter is
// swapped for a fresh telling of the same slot. If the reader has
// opened the next chapter in the meantime, this chapter has finalised
// — the slot is no longer the frontier and the engine refuses the swap
// whole: the chapter has locked, exactly as the house rule promises.
// (The next chapter merely LANDING — pre-generation — locks nothing;
// see frontierChapterIndex in story-engine.js.)
export function acceptRerolledChapter(story, result) {
  const index = result?.chapter?.index
  if (!Number.isInteger(index) || index < 0 || index >= totalChaptersFor(story)) throw new Error('章节格式不完整，请重试。')
  if (result.key !== chapterKey(story, index)) return story
  let next = replaceFrontierChapter(story, result.chapter, result.key)
  if (next === story) return story
  next = withDerivedProtagonistName(next, result)
  // Re-rolling the opening chapter is a fresh opening: the world bible
  // the server derived for it replaces the old one, as on first accept.
  if (index === 0 && result.worldBible) next = { ...next, worldBible: result.worldBible }
  const checked = validateLibrary({ ...emptyLibrary(), stories: [next], activeStoryId: next.id })
  if (checked.length) throw new Error('章节格式不完整，请重试。')
  return next
}

// The frontier re-roll: same endpoint, same quota accounting as a normal
// generation — the server regenerates the latest chapter from the brief
// and context as of its slot (its recorded interventions, lorebook hits
// and ledger state), and the version it replaces is discarded.
export async function requestChapterReroll(story, index, options = {}) {
  const result = await sendGenerateRequest(story, { story, index, mode: 'reroll' }, options)
  if (result?.chapter?.index !== index || result?.key !== chapterKey(story, index) || acceptRerolledChapter(story, result) === story) {
    throw new Error('换版结果与当前进度不匹配，请重试。')
  }
  return result
}
