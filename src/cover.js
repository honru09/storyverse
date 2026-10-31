// Per-story generated covers: the client-side state machine and API.
//
// The story carries only { status, version, updatedAt } — the painting
// itself lives on the server under the reader's account and is fetched as
// an object URL when a surface needs it. Until a cover is ready (and
// whenever generation failed or is unavailable) every surface falls back
// to the shared world artwork, exactly as before covers existed.

export const COVER_STATUSES = ['none', 'pending', 'ready', 'failed']

export function coverStateOf(story) {
  const cover = story?.cover
  if (!cover || typeof cover !== 'object') return { status: 'none', version: 0 }
  return {
    status: COVER_STATUSES.includes(cover.status) ? cover.status : 'none',
    version: Number.isInteger(cover.version) && cover.version > 0 ? cover.version : 0,
    ...(typeof cover.updatedAt === 'string' ? { updatedAt: cover.updatedAt } : {}),
  }
}

/**
 * How long a `pending` cover stamp still counts as a live request
 * (FINAL-FIX, attached item R-13): the stamp is persisted with the
 * story, so a session that died mid-request used to leave the book in
 * 「生成中」 forever — no surface ever asked again. Ten minutes is far
 * beyond any real painting round-trip; past it the stamp is an orphan
 * and the book may ask once more (the per-session attempt guard in the
 * shell still bounds that to once per session).
 */
export const COVER_PENDING_STALE_MS = 10 * 60 * 1000

export function coverRequestInFlight(story, now = Date.now()) {
  const state = coverStateOf(story)
  if (state.status !== 'pending') return false
  const stamped = Date.parse(state.updatedAt || '')
  return Number.isFinite(stamped) && now - stamped < COVER_PENDING_STALE_MS
}

const localDayNumber = (ts) => {
  const d = new Date(ts)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/**
 * A failed cover may be retried automatically once the local calendar
 * day has moved past the failure (COVER-RETRY-FIX): the failure stamp
 * is the cover state's updatedAt, written when the attempt failed.
 * Same-day failures stay parked — the original protection stands, a
 * background loop must never burn the daily cover allowance retrying
 * inside the day that already refused. A failed record with NO stamp
 * predates failure stamping (legacy stock): its failure day is
 * unknowable, so it counts as stale and may ask again.
 */
export function coverFailureRetryable(story, now = Date.now()) {
  const state = coverStateOf(story)
  if (state.status !== 'failed') return false
  const stamped = Date.parse(state.updatedAt || '')
  if (!Number.isFinite(stamped)) return true
  return localDayNumber(stamped) < localDayNumber(now)
}

/**
 * The automatic request fires once a Gemini-written story has its first
 * chapter: that is when a world bible premise exists to paint from. Demo
 * and locally seeded stories never ask (their worlds are the shared art's
 * home), read-only copies never ask, and a failed attempt stays parked
 * for the rest of the local day it failed on — from the next day it may
 * ask again (coverFailureRetryable). An ORPHANED pending stamp (older
 * than COVER_PENDING_STALE_MS) asks again like `none`.
 *
 * The engine gate: Gemini-written books carry `engine: 'gemini'`. Books
 * written before that stamp existed carry no engine mark at all; they
 * may ask when the caller knows they already live in the reader's
 * account library (`inAccountLibrary` — synced, not merely local),
 * which is what separates them from seeded/demo stock. Any explicit
 * non-Gemini stamp ('local', 'manual') still refuses.
 */
export function shouldAutoRequestCover(story, now = Date.now(), { inAccountLibrary = false } = {}) {
  if (!story || story.readOnly) return false
  const engine = story.engine
  const unstamped = engine === undefined || engine === null || engine === ''
  if (engine !== 'gemini' && !(unstamped && inAccountLibrary)) return false
  if (!Array.isArray(story.chapters) || story.chapters.length < 1) return false
  const status = coverStateOf(story).status
  if (status === 'none') return true
  if (status === 'failed') return coverFailureRetryable(story, now)
  return status === 'pending' && !coverRequestInFlight(story, now)
}

/**
 * Whether the post-sync reconciliation should ask the server about this
 * book's cover (COVER-RETRY-FIX): books whose local state says the
 * painting is missing or failed — plus orphaned pending stamps — may
 * already be painted server-side (a request that settled after its
 * response was lost). Ready and live-pending books are never asked.
 */
export function coverNeedsMetaReconcile(story, now = Date.now()) {
  if (!story || story.readOnly) return false
  const status = coverStateOf(story).status
  if (status === 'none' || status === 'failed') return true
  return status === 'pending' && !coverRequestInFlight(story, now)
}

export function withCoverState(story, patch) {
  if (!story || typeof story !== 'object') return story
  const current = coverStateOf(story)
  const next = { ...current, ...patch }
  if (!COVER_STATUSES.includes(next.status)) next.status = current.status
  if (!Number.isInteger(next.version) || next.version < 0) next.version = current.version
  return { ...story, cover: next }
}

/** World ids that have a shared painting of their own (WorldArtwork's set). */
export const WORLD_ART_IDS = ['mist', 'cultivation', 'neon', 'city', 'court', 'frontier', 'custom']

/**
 * Genre-flavoured fallback paintings (PHONE-FIX §37, assets batch B;
 * BUGHUNT-FIX: extended to all nine shelves with the phase-2 asset
 * set). The mapping is shelf-first: every L1 family now owns a
 * dedicated painting, so a coverless line in a custom / unknown world
 * wears its family's flavour instead of a generic emblem. The older
 * caution — horror and friends "can live in too many kinds of worlds"
 * — applied when the only paintings were broad eastern/urban/scifi
 * scenes; the dedicated 悬疑/副本/短篇/反派 paintings are flavour, not
 * world depiction, and the variant only ever steps in where the world
 * painting itself says nothing about this story (see below).
 */
const FALLBACK_VARIANT_TEMPLATES = {
  eastern: ['xuanhuan', 'xianxia', 'gaowu', 'lishi'],
  urban: ['urban', 'campus'],
  scifi: ['scifi'],
  yanqing: ['romance-ancient', 'romance-modern'],
  xuanyi: ['horror', 'guize-guatan', 'suspense-supernatural'],
  fuben: ['wuxianliu'],
  duanpian: ['zhihu-short'],
  fanpai: ['er-ren'],
}

/**
 * Which fallback painting a coverless story wears, or null for the
 * shared world artwork. The world painting stays the fallback whenever
 * it actually depicts the story's world (a known preset world). The
 * variant only steps in where the world painting says nothing about
 * THIS story: a reader-written custom world (its shared artwork is a
 * generic emblem) or an unknown world id (WorldArtwork would silently
 * substitute the mist painting — a mismatch, not a fallback).
 */
export function fallbackCoverVariantFor(story) {
  const worldId = story?.genreId || story?.config?.genreId || ''
  if (worldId && worldId !== 'custom' && WORLD_ART_IDS.includes(worldId)) return null
  const templateId = story?.genreTemplateId || story?.config?.genreTemplateId || ''
  for (const [variant, templateIds] of Object.entries(FALLBACK_VARIANT_TEMPLATES)) {
    if (templateIds.includes(templateId)) return variant
  }
  return null
}

/** The slim payload the cover endpoint paints from — no chapters, no prose. */
export function coverPayloadFor(story) {
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''
  return {
    storyId: story.id,
    title: text(story.title, 200),
    genreId: text(story.genreId, 60),
    genreTemplateId: text(story.genreTemplateId || story.config?.genreTemplateId, 60),
    config: {
      genreId: text(story.config?.genreId, 60),
      genreTemplateId: text(story.config?.genreTemplateId, 60),
      customWorldName: text(story.config?.customWorldName, 100),
      customWorldSetting: text(story.config?.customWorldSetting, 1200),
    },
    worldBible: { premise: text(story.worldBible?.premise, 1000) },
  }
}

function coverError(response, result) {
  if (response.status === 401 || result?.code === 'auth-required') {
    return Object.assign(new Error('请先登录，再生成封面。'), { code: 'auth-required' })
  }
  if (result?.code === 'cover-quota' || response.status === 429) {
    return Object.assign(new Error('今天的封面生成次数已用完，明天再换。'), { code: 'cover-quota' })
  }
  if (response.status === 503) return new Error('封面生成还没开通，过段时间再试。')
  return new Error('封面暂时没能生成，请稍后再试。')
}

async function coverHeaders(getAccessToken) {
  const headers = {}
  if (getAccessToken) {
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* no credential; the server decides */ }
  }
  return headers
}

/**
 * Ask the server to paint (or re-paint) this story's cover. Resolves with
 * the new version. Generation is slow (tens of seconds), so a transport
 * timeout does not prove failure: the meta endpoint reconciles once
 * before the error is surfaced.
 */
export async function requestCoverImage({ story, getAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 100_000 } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await coverHeaders(getAccessToken)) }
  let response
  try {
    response = await fetchImpl('/api/cover', {
      method: 'POST', headers,
      body: JSON.stringify(coverPayloadFor(story)),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    const meta = await fetchCoverMeta({ story, getAccessToken, fetchImpl }).catch(() => null)
    if (meta?.status === 'ready') return { version: meta.version }
    throw new Error('封面暂时没能生成，请稍后再试。')
  }
  let result = null
  try { result = await response.json() } catch { /* mapped below */ }
  if (!response.ok) throw coverError(response, result)
  if (result?.status !== 'ready' || !Number.isInteger(result?.version)) throw new Error('封面暂时没能生成，请稍后再试。')
  return { version: result.version }
}

export async function fetchCoverMeta({ story, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await coverHeaders(getAccessToken)
  const response = await fetchImpl(`/api/cover/meta?storyId=${encodeURIComponent(story.id)}`, { headers })
  if (!response.ok) throw new Error('封面状态暂时无法读取。')
  const result = await response.json()
  return {
    status: result?.status === 'ready' ? 'ready' : 'none',
    version: Number.isInteger(result?.version) ? result.version : 0,
  }
}

/**
 * One reconciliation probe (COVER-RETRY-FIX): resolves with the cover
 * patch to adopt when the server already holds this book's painting, or
 * null when it does not — or when the probe itself fails. Reconciliation
 * is a background courtesy and is silent by design.
 */
export async function fetchCoverReconcilePatch({ story, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  try {
    const meta = await fetchCoverMeta({ story, getAccessToken, fetchImpl })
    if (meta?.status === 'ready') return { status: 'ready', version: meta.version }
  } catch { /* the shelf never waits on a cover probe */ }
  return null
}

const objectUrlCache = new Map()

/**
 * Object URL for the story's current cover version, or null when there is
 * none. Cached per story+version; a re-roll (version bump) replaces the
 * entry and revokes the stale URL so old paintings do not linger.
 */
export async function fetchCoverObjectUrl({
  story,
  getAccessToken,
  fetchImpl = globalThis.fetch,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
} = {}) {
  const { status, version } = coverStateOf(story)
  if (status !== 'ready' || !story?.id) return null
  const key = `${story.id}@${version}`
  if (objectUrlCache.has(key)) return objectUrlCache.get(key)
  const headers = await coverHeaders(getAccessToken)
  const response = await fetchImpl(`/api/cover?storyId=${encodeURIComponent(story.id)}`, { headers })
  if (!response.ok) return null
  const blob = await response.blob()
  const url = createObjectURL(blob)
  for (const [cachedKey, cachedUrl] of objectUrlCache) {
    if (cachedKey.startsWith(`${story.id}@`)) {
      revokeObjectURL(cachedUrl)
      objectUrlCache.delete(cachedKey)
    }
  }
  objectUrlCache.set(key, url)
  return url
}

export function clearCoverObjectUrls(revokeObjectURL = (url) => URL.revokeObjectURL(url)) {
  for (const url of objectUrlCache.values()) revokeObjectURL(url)
  objectUrlCache.clear()
}
