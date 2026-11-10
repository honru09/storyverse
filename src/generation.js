import { acceptChapter, chapterKey, outlineLengthFor, replaceChapter, replaceFrontierChapter, sanitizeIntro, storyLedgerFor, SYNOPSIS_MAX, totalChaptersFor } from './story-engine.js'
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
  // 简介生成制 (REQ-56): the opening call wrote the book's public
  // words in the same call as the bible. They land together here,
  // overwriting the factual local draft the forge was born with;
  // later chapters carry neither field, so owner edits made after
  // the opening are never overwritten by generation.
  if (index === 0 && typeof result.synopsis === 'string' && result.synopsis.trim()) {
    next = { ...next, synopsis: result.synopsis.trim().slice(0, SYNOPSIS_MAX) }
  }
  if (index === 0 && sanitizeIntro(result.intro)) {
    next = { ...next, intro: sanitizeIntro(result.intro) }
  }
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

// ——— GENFIX-20261101 · 生成单次点击死规则 (DESIGN §61) ———
// One click must finish the job by itself. A generation attempt can
// fail transiently in ways the reader can do nothing about — the
// connection drops, iOS Safari resets a long fetch, the provider is
// briefly busy (429), a gateway answers 502/504, or the response is
// lost AFTER the server already generated and settled the chapter.
// The old client made exactly ONE attempt and surfaced every one of
// those as "请重试", stranding the reader on the confirmation step
// until they clicked again (owner report 2026-11-01: 生成经常中断、
// 要再点一次才进去). The second click only worked because the server
// side already had the answer — the delivery registry answers an
// identical replay from the settled result before any freeze or
// provider call (server/index.js deliveryKeyFor), and the generator
// joins/caches identical in-flight work — so the honest fix is for
// the client to make that replay itself, automatically.
//
// Recovery contract (this function is the ONLY client path to
// /api/generate, so the forge opening, plaza-line entry, fusion,
// pre-generation, the reader's next chapter, intervention revision
// and the frontier re-roll all inherit it):
//   · transient failures (network error, client timeout, unparseable
//     or lost response, 429/502/503/504) retry with growing backoff —
//     GENERATION_RETRY_DELAYS_MS, 3 retries after the first attempt;
//   · every retry resends the IDENTICAL payload, which is what makes
//     it a reconciliation, not a second generation: the server
//     registry/generator cache returns the settled chapter and never
//     charges twice for it;
//   · refusals a retry cannot change (401 sign-in, quota, coins) fail
//     immediately, exactly as before;
//   · the caller's abort signal stops the loop at once (a cancelled
//     wait is a choice, not a failure);
//   · only when every attempt is spent does the error surface — the
//     callers keep their existing "story/draft is saved" copy and
//     their manual retry affordance as the last resort.
export const GENERATION_RETRY_DELAYS_MS = Object.freeze([2_000, 5_000, 12_000])

const generationFailure = (message, { transient = false, cause } = {}) => {
  const error = new Error(message, cause ? { cause } : undefined)
  error.transient = transient
  return error
}

const sleepUnlessAborted = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
  const timer = setTimeout(() => { cleanup(); resolve() }, ms)
  const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort) }
  signal?.addEventListener?.('abort', onAbort, { once: true })
})

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
    // A dropped connection or the client cap firing says nothing about
    // the server's side of the story — the chapter may well be settled
    // already. Transient: the recovery loop replays and reconciles.
    throw generationFailure(timeout.aborted ? '这一章等待较久，进度已保留，请重试。' : '暂时无法连接，进度已保留，请重试。', { transient: true, cause: error })
  }
  let result
  try { result = await response.json() } catch { throw generationFailure('章节暂时未能接上，请重试。', { transient: true }) }
  if (!response.ok) {
    // Server error text is never shown; stable codes map to fixed copy here.
    if (response.status === 401 || result?.code === 'auth-required') {
      onAuthRequired?.()
      throw new Error('请先登录，再继续在线创作。登录后这一章会接着生成。')
    }
    if (result?.code === 'quota-exceeded') throw new Error('今天的生成额度已用完，请明天再继续创作。你的故事和进度都已保存。')
    if (result?.code === 'coins-exhausted') {
      // Marked, not just messaged: inside a recovery sequence this
      // refusal can be a freeze race (see sendWithRecovery), which
      // only the loop can tell apart from a genuine empty purse.
      const failure = new Error('织币不足了。每天的免费织币会自动补足，开通会员或购买额度包可以继续创作。你的故事和进度都已保存。')
      failure.code = 'coins-exhausted'
      throw failure
    }
    // BUGHUNT-20261110: 502 used to fall through to the generic
    // line, so a gateway blip read exactly like any other failure.
    const messages = { 429: '请求较多，请稍后再试。', 502: '网关暂时没能接上，进度已保留，请重试。', 503: '在线创作暂不可用，已保存的章节仍可阅读。请稍后再试。', 504: '这一章等待较久，进度已保留，请重试。' }
    // Gateway/provider turbulence (429 without a quota code, 502,
    // 503, 504) is transient; any other refusal is final for this click.
    const failure = generationFailure(messages[response.status] || '这一章暂时没能接上，进度已保留，请重试。', { transient: [429, 502, 503, 504].includes(response.status) })
    // The server stamps Retry-After on every 429 (server/index.js);
    // a fixed ladder that ignores it would spend all its retries
    // inside the cooldown window it was just told about.
    const retryAfterSeconds = Number(response.headers?.get?.('Retry-After'))
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) failure.retryAfterMs = Math.min(retryAfterSeconds * 1_000, 60_000)
    throw failure
  }
  return result
}

// The recovery loop itself: attempt, and on a transient failure wait
// and replay the identical payload until the delays are spent. The
// wait surfaces (forge overlay, reader "准备中") stay up throughout
// because the callers' promises only settle when this returns or
// finally throws — the reader is never bounced back to a "click
// again" state by a recoverable failure.
async function sendWithRecovery(story, payload, options = {}) {
  const delays = Array.isArray(options.retryDelaysMs) ? options.retryDelaysMs : GENERATION_RETRY_DELAYS_MS
  let attempt = 0
  let sawTransient = false
  for (;;) {
    try {
      return await sendGenerateRequest(story, payload, options)
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') throw error
      // Freeze race (late agy review, verified against server order):
      // a replay that arrives while the first attempt is STILL
      // generating server-side misses the delivery registry and hits
      // the coin freeze while that first attempt's freeze is still
      // held — a purse that affords one chapter then reads as
      // coins-exhausted even though the chapter is about to land.
      // Inside a recovery sequence (an earlier attempt already failed
      // transiently) that refusal is therefore reclassified as
      // transient: the next replay hits the registry or joins the
      // in-flight generation, and its cached answer releases the
      // second freeze unspent. A FIRST-attempt coins-exhausted stays
      // final — at click time, nothing of this click is in flight.
      const freezeRace = sawTransient && error?.code === 'coins-exhausted'
      if (!error?.transient && !freezeRace) throw error
      if (error?.transient) sawTransient = true
      if (attempt >= delays.length) throw error
      // Retry-After, when the server sent one, floors the wait; the
      // ladder value is jittered so a fleet-wide blip does not retry
      // in lockstep.
      const delayMs = Math.max(delays[attempt], error?.retryAfterMs || 0)
      attempt += 1
      options.onRetry?.({ attempt, delayMs, error })
      await sleepUnlessAborted(Math.round(delayMs * (0.75 + Math.random() * 0.5)), options.signal)
    }
  }
}

export async function requestChapter(story, index, options = {}) {
  const result = await sendWithRecovery(story, { story, index }, options)
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
  const result = await sendWithRecovery(story, { story, index, mode: 'revise' }, options)
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
  // The public words follow the bible (REQ-56): a re-rolled opening
  // is a new opening, so its generated synopsis and intro replace
  // the previous draft the same way.
  if (index === 0 && typeof result.synopsis === 'string' && result.synopsis.trim()) {
    next = { ...next, synopsis: result.synopsis.trim().slice(0, SYNOPSIS_MAX) }
  }
  if (index === 0 && sanitizeIntro(result.intro)) {
    next = { ...next, intro: sanitizeIntro(result.intro) }
  }
  const checked = validateLibrary({ ...emptyLibrary(), stories: [next], activeStoryId: next.id })
  if (checked.length) throw new Error('章节格式不完整，请重试。')
  return next
}

// The frontier re-roll: same endpoint, same quota accounting as a normal
// generation — the server regenerates the latest chapter from the brief
// and context as of its slot (its recorded interventions, lorebook hits
// and ledger state), and the version it replaces is discarded.
export async function requestChapterReroll(story, index, options = {}) {
  const result = await sendWithRecovery(story, { story, index, mode: 'reroll' }, options)
  if (result?.chapter?.index !== index || result?.key !== chapterKey(story, index) || acceptRerolledChapter(story, result) === story) {
    throw new Error('换版结果与当前进度不匹配，请重试。')
  }
  return result
}
