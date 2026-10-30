// The avatar （化身）: the reader's own fixed character, carried across every
// world they open. This module is the shared vocabulary — presets,
// profile validation and the appearance line a story carries — plus
// the client-side API. The server imports the pure parts (validation /
// prompt fragments) so the profile a reader saves is validated by
// exactly one definition, here.
//
// Who the avatar is lives in two fields only: the name and the written
// description. There is deliberately NO per-part customisation
// (AVATAR-TRIM, ruling 2026-10-30): painted figures vary too much —
// animals, proportions, heights — for preset parts to fit, and
// changing an outfit is a whole-image repaint anyway. To change how an
// avatar looks, the reader edits the description and repaints the
// whole portrait. Profiles saved before the trim may still carry a
// stored `appearance` object; it is inert data now — nothing reads,
// renders or submits it.
//
// Consistency boundary (also written into DESIGN.md): cross-world sameness
// is anchored by this written profile plus the previous portrait fed
// back as a reference image. The goal is a character readers recognise as
// the same person — never pixel-identical reproduction.

export const AVATAR_NAME_MAX = 20
export const AVATAR_DESCRIPTION_MAX = 300
export const AVATAR_APPEARANCE_TEXT_MAX = 300
// One account may keep a small drawer of avatars (PERSONA-QA F-27): the
// main avatar is the identity every public surface resolves, the rest are
// companions the reader can bring into a book instead. The cap is shared
// client/server vocabulary — the server enforces it.
export const AVATAR_LIMIT = 10

/** The main avatar out of a collection list, or null when there is none. */
export function mainAvatarOf(avatars, mainId) {
  if (!Array.isArray(avatars) || avatars.length === 0) return null
  return avatars.find((item) => item?.id === mainId) || avatars[0] || null
}

/**
 * The one-line look a story (and every public avatar surface) carries
 * for this avatar. Since AVATAR-TRIM the line is simply the avatar's
 * own written description, whitespace-folded and bounded: the
 * description is the only definition of the look now, so the line a
 * story paints its protagonist from and the line a profile shows are
 * the same words the reader wrote. Anything else stored on the profile
 * (a legacy `appearance` object) is inert and never composes into it.
 */
export function avatarAppearanceText(avatar) {
  const description = typeof avatar?.description === 'string' ? avatar.description : ''
  return description.replace(/\s+/g, ' ').trim().slice(0, AVATAR_APPEARANCE_TEXT_MAX)
}

/**
 * The forge draft patch a brought-in avatar applies (FORGE-TRIM): its
 * name, id and appearance line — plus its written profile. The profile's
 * description IS the avatar's 性格与设定 (the profile form asks for
 * 性格、气质、给人的感觉）, so it lands in the draft's persona: the one
 * field that carries protagonist character into the story config and
 * from there into every chapter's generation context. Before this
 * mapping existed, bringing an avatar carried only its name and look —
 * its character stayed behind in the profile, and the forge asked the
 * reader for a trait all over again. An avatar with no written
 * description leaves the draft's persona untouched. Cancelling the
 * bring-in clears only avatarId/avatarAppearance; name and persona stay
 * as the book's own copies （只改这本书，不动化身档案）.
 */
export function avatarDraftPatch(avatar) {
  if (!avatar || typeof avatar !== 'object') return null
  const description = typeof avatar.description === 'string' ? avatar.description.trim() : ''
  return {
    name: typeof avatar.name === 'string' ? avatar.name : '',
    avatarId: typeof avatar.id === 'string' ? avatar.id : '',
    avatarAppearance: avatarAppearanceText(avatar),
    ...(description ? { persona: description } : {}),
  }
}


/**
 * Validate and normalise a profile payload (create or update). Text is
 * length-bounded here; the server additionally runs the setting-guard
 * scrub over reader-authored text before it can reach any prompt.
 * Returns { profile } or { error } with reader-facing copy.
 */
export function validateAvatarProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: '化身资料格式有误，请重试。' }
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, AVATAR_NAME_MAX) : ''
  if (!name) return { error: '先给化身取个名字。' }
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, AVATAR_DESCRIPTION_MAX) : ''
  // A profile is name + description, nothing else (AVATAR-TRIM): any
  // `appearance` a stale client still sends is ignored here and never
  // stored from the payload — the stored record's own legacy field, if
  // one exists, is carried by the server untouched (see server/avatar.js).
  return {
    profile: {
      ...(typeof input.id === 'string' && input.id ? { id: input.id.slice(0, 64) } : {}),
      name,
      description,
    },
  }
}

/** The public shape every surface consumes: profile + portrait state. */
export function avatarPortraitState(avatar) {
  const portrait = avatar?.portrait
  if (!portrait || typeof portrait !== 'object') return { status: 'none', version: 0, hasPrevious: false }
  return {
    status: ['none', 'pending', 'ready', 'failed'].includes(portrait.status) ? portrait.status : 'none',
    version: Number.isInteger(portrait.version) && portrait.version > 0 ? portrait.version : 0,
    hasPrevious: portrait.hasPrevious === true,
    ...(typeof portrait.updatedAt === 'string' ? { updatedAt: portrait.updatedAt } : {}),
  }
}

/**
 * A content signature of an avatar collection: the visible facts a
 * reader of the collection (the profile tab's avatar row) depends on —
 * which avatars exist, their names, their portrait state, and who is
 * main. Identity-only changes (a refresh handing back equal content in
 * a fresh array) keep the same signature, so watchers keyed on it fire
 * exactly when the displayed collection really changed (REQ-58).
 */
export function avatarCollectionSignature(avatars, mainId) {
  const list = Array.isArray(avatars) ? avatars : []
  const rows = list.filter((avatar) => avatar && typeof avatar.id === 'string').map((avatar) => {
    const portrait = avatarPortraitState(avatar)
    return `${avatar.id}:${avatar.name || ''}:${portrait.status}:${portrait.version}`
  })
  return `${typeof mainId === 'string' ? mainId : ''}|${rows.join('|')}`
}

// Three ready-made companions for readers who would rather start from a
// person than a blank page. Adopting one fills the same form as a
// hand-written avatar and paints through the same pipeline — no preset
// ships a pre-made picture.
export const AVATAR_PRESETS = [
  {
    id: 'preset-lin-wanzhou',
    name: '林晚舟',
    description: '清冷安静的剑客，乌黑长发，一袭浅色长袍，眼下一点泪痣，话不多，站在人群里也像站在风里。',
  },
  {
    id: 'preset-a-can',
    name: '阿灿',
    description: '笑起来很亮的街头少年，银灰短发，鼻尖几点雀斑，穿街头夹克和运动鞋，好奇心比胆子大，口袋里总有糖。',
  },
  {
    id: 'preset-bai-yu',
    name: '白榆',
    description: '温润耐心的年轻学者，茶棕长发，戴细框眼镜，穿文人长衫，喜欢把袖口挽起来，慢慢把事情讲清楚。',
  },
]

/**
 * The avatar's journeys, derived from the library: every story whose
 * config carries this avatar's id, in the order the shelf keeps them.
 * No separate ledger is stored — the story itself is the record.
 */
export function avatarJourneys(avatar, stories) {
  const id = avatar?.id
  if (!id || !Array.isArray(stories)) return []
  const rows = []
  for (const story of stories) {
    const own = story?.config?.avatarId === id
    const mergedSide = Array.isArray(story?.config?.protagonists)
      && story.config.protagonists.some((person) => person?.avatarId === id)
    if (!own && !mergedSide) continue
    rows.push({
      storyId: story.id,
      title: story.title,
      genreId: story.genreId || story.config?.genreId || '',
      genreTemplateId: story.genreTemplateId || story.config?.genreTemplateId || '',
      kind: story.kind === 'merged' ? 'merged' : 'solo',
      viaMerge: !own && mergedSide,
      chapters: Array.isArray(story.chapters) ? story.chapters.length : 0,
      updatedAt: typeof story.updatedAt === 'string' ? story.updatedAt : '',
    })
  }
  return rows
}

// ---- Client API -----------------------------------------------------------

function avatarError(response, result) {
  if (response.status === 401 || result?.code === 'auth-required') {
    return Object.assign(new Error('请先登录，再打开你的化身。'), { code: 'auth-required' })
  }
  if (result?.code === 'avatar-quota' || response.status === 429) {
    return Object.assign(new Error('今天的立绘生成次数已用完，明天再换。'), { code: 'avatar-quota' })
  }
  if (response.status === 503) return new Error('化身服务还没开通，过段时间再试。')
  if (result?.error && (response.status === 400 || response.status === 404)) return new Error(result.error)
  return new Error('化身暂时没能打开，请稍后再试。')
}

async function avatarHeaders(getAccessToken) {
  const headers = {}
  if (getAccessToken) {
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* no credential; the server decides */ }
  }
  return headers
}

async function avatarJson(response) {
  let result = null
  try { result = await response.json() } catch { /* mapped by caller */ }
  if (!response.ok) throw avatarError(response, result)
  return result
}

/** The signed-in reader's avatar, or null when they have none yet. */
export async function fetchAvatar({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await avatarHeaders(getAccessToken)
  const response = await fetchImpl('/api/avatar', { headers })
  const result = await avatarJson(response)
  return result?.avatar ?? null
}

/**
 * The reader's whole avatar collection: every avatar profile, which one
 * is the main avatar, and today's portrait-generation quota. Surfaces
 * that only need the identity avatar keep using fetchAvatar; pickers and
 * the avatar page read the collection.
 */
export async function fetchAvatars({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await avatarHeaders(getAccessToken)
  const response = await fetchImpl('/api/avatars', { headers })
  const result = await avatarJson(response)
  return {
    avatars: Array.isArray(result?.avatars) ? result.avatars : [],
    mainId: typeof result?.mainId === 'string' ? result.mainId : null,
    quota: result?.quota && typeof result.quota === 'object' ? result.quota : null,
  }
}

/** Add a new avatar to the collection (profile only — painting is separate). */
export async function createAvatar({ profile, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await avatarHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/avatars', {
    method: 'POST', headers, body: JSON.stringify({ profile }),
  })
  const result = await avatarJson(response)
  return result?.avatar ?? null
}

/** Remove one avatar from the collection; returns the remaining collection. */
export async function deleteAvatar({ avatarId, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await avatarHeaders(getAccessToken)
  const response = await fetchImpl(`/api/avatars/${encodeURIComponent(avatarId)}`, { method: 'DELETE', headers })
  const result = await avatarJson(response)
  return {
    avatars: Array.isArray(result?.avatars) ? result.avatars : [],
    mainId: typeof result?.mainId === 'string' ? result.mainId : null,
  }
}

/** Make one avatar the main avatar (the identity public surfaces resolve). */
export async function setMainAvatar({ avatarId, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await avatarHeaders(getAccessToken)
  const response = await fetchImpl(`/api/avatars/${encodeURIComponent(avatarId)}/main`, { method: 'POST', headers })
  const result = await avatarJson(response)
  return {
    avatars: Array.isArray(result?.avatars) ? result.avatars : [],
    mainId: typeof result?.mainId === 'string' ? result.mainId : null,
  }
}

/** Save profile fields without painting (creation form, name/description edits). */
export async function saveAvatar({ profile, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await avatarHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/avatar', {
    method: 'PUT', headers, body: JSON.stringify({ profile }),
  })
  const result = await avatarJson(response)
  return result?.avatar ?? null
}

/**
 * Save the profile and paint (or repaint) the portrait. Slow — image
 * generation takes tens of seconds — so the caller shows the pending
 * state from the profile it already holds rather than blocking on this.
 * `avatarId` targets one avatar of the collection (the profile's own id
 * works too). A repaint is always a whole-image repaint from the
 * current name + description (AVATAR-TRIM): there is no single-part
 * adjustment any more.
 */
export async function generateAvatar({ profile, avatarId, getAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 120_000 } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await avatarHeaders(getAccessToken)) }
  const body = { profile }
  if (typeof avatarId === 'string' && avatarId) body.avatarId = avatarId
  const response = await fetchImpl('/api/avatar/generate', {
    method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const result = await avatarJson(response)
  return result?.avatar ?? null
}

const portraitUrlCache = new Map()

/**
 * Object URL for the current portrait (or the previous version with
 * which='previous'). Cached per version; a repaint revokes the stale
 * entries so old paintings do not linger.
 */
export async function fetchAvatarObjectUrl({
  avatar,
  which = 'current',
  getAccessToken,
  fetchImpl = globalThis.fetch,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
} = {}) {
  const { status, version, hasPrevious } = avatarPortraitState(avatar)
  if (!avatar?.id) return null
  if (which === 'previous' ? !hasPrevious : status !== 'ready') return null
  const key = `${avatar.id}@${which}@${version}`
  if (portraitUrlCache.has(key)) return portraitUrlCache.get(key)
  const headers = await avatarHeaders(getAccessToken)
  const params = new URLSearchParams({ avatarId: avatar.id })
  if (which === 'previous') params.set('which', 'previous')
  const response = await fetchImpl(`/api/avatar/image?${params}`, { headers })
  if (!response.ok) return null
  const blob = await response.blob()
  const url = createObjectURL(blob)
  for (const [cachedKey, cachedUrl] of portraitUrlCache) {
    if (cachedKey.startsWith(`${avatar.id}@`)) {
      revokeObjectURL(cachedUrl)
      portraitUrlCache.delete(cachedKey)
    }
  }
  portraitUrlCache.set(key, url)
  return url
}

export function clearAvatarObjectUrls(revokeObjectURL = (url) => URL.revokeObjectURL(url)) {
  for (const url of portraitUrlCache.values()) revokeObjectURL(url)
  portraitUrlCache.clear()
}
