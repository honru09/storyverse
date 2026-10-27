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
 * The automatic request fires once a Gemini-written story has its first
 * chapter: that is when a world bible premise exists to paint from. Demo
 * and locally seeded stories never ask (their worlds are the shared art's
 * home), read-only copies never ask, and a failed attempt stays failed
 * until the reader explicitly re-rolls — a background retry loop must
 * never burn the daily cover allowance on its own.
 */
export function shouldAutoRequestCover(story) {
  if (!story || story.readOnly) return false
  if (story.engine !== 'gemini') return false
  if (!Array.isArray(story.chapters) || story.chapters.length < 1) return false
  return coverStateOf(story).status === 'none'
}

export function withCoverState(story, patch) {
  if (!story || typeof story !== 'object') return story
  const current = coverStateOf(story)
  const next = { ...current, ...patch }
  if (!COVER_STATUSES.includes(next.status)) next.status = current.status
  if (!Number.isInteger(next.version) || next.version < 0) next.version = current.version
  return { ...story, cover: next }
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
