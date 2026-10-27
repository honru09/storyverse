// The avatar （化身）: the reader's own fixed character, carried across every
// world they open. This module is the shared vocabulary — appearance
// options, presets, profile validation and the appearance line a story
// carries — plus the client-side API. The server imports the pure parts
// (options / validation / prompt fragments) so the profile a reader saves
// is validated by exactly one definition, here.
//
// Consistency boundary (also written into DESIGN.md): cross-world sameness
// is anchored by this structured profile plus the previous portrait fed
// back as a reference image. The goal is a character readers recognise as
// the same person — never pixel-identical reproduction.

export const AVATAR_NAME_MAX = 20
export const AVATAR_DESCRIPTION_MAX = 300
export const AVATAR_FACE_NOTE_MAX = 60
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

// Appearance options are fixed site vocabulary: an id, the Chinese label
// the reader picks, and the English fragment the image prompt paints.
// Free text never reaches the image prompt except through the sanitised
// description and face note.
const option = (id, label, prompt) => ({ id, label, prompt })

export const HAIR_COLORS = [
  option('black', '乌黑', 'black hair'),
  option('brown', '茶棕', 'warm brown hair'),
  option('silver', '银灰', 'silver-grey hair'),
  option('white', '雪白', 'white hair'),
  option('red', '红铜', 'copper-red hair'),
  option('blonde', '浅金', 'pale blonde hair'),
  option('blue', '深蓝', 'deep blue hair'),
  option('pink', '樱粉', 'sakura-pink hair'),
  option('purple', '藤紫', 'violet-purple hair'),
]

export const HAIR_STYLES = [
  option('long-straight', '长直发', 'long straight hair worn loose'),
  option('long-wavy', '大波浪长发', 'long wavy hair with soft curls'),
  option('short', '利落短发', 'neat short hair'),
  option('ponytail', '高马尾', 'a high ponytail'),
  option('bun', '束发发髻', 'hair tied up in a bun'),
  option('bob', '波波头', 'a chin-length bob cut'),
  option('twin-tails', '双马尾', 'twin tails'),
  option('buzz', '寸头', 'a very short buzz cut'),
]

export const OUTFIT_STYLES = [
  option('xianxia-robe', '仙气长袍', 'flowing pale xianxia robes with wide sleeves'),
  option('scholar', '文人长衫', 'a scholar’s long cloth gown'),
  option('modern-street', '现代街头', 'modern streetwear, layered jacket and casual trousers'),
  option('school', '学院制服', 'a neat school uniform'),
  option('tactical', '机能装束', 'functional techwear with straps and pockets'),
  option('dress', '礼服长裙', 'an elegant long dress'),
  option('armor', '轻甲战袍', 'light ornamental armour over a war robe'),
  option('coat', '长风衣', 'a long tailored trench coat'),
]

export const SHOE_STYLES = [
  option('boots', '长靴', 'tall boots'),
  option('sneakers', '运动鞋', 'sneakers'),
  option('cloth-shoes', '布鞋', 'plain cloth shoes'),
  option('leather-shoes', '皮鞋', 'polished leather shoes'),
  option('sandals', '凉鞋', 'open sandals'),
  option('heels', '缎面高跟鞋', 'satin high heels'),
]

export const FACE_FEATURES = [
  option('none', '无特别标记', ''),
  option('tear-mole', '眼下泪痣', 'a small beauty mark under one eye'),
  option('freckles', '雀斑', 'a dusting of freckles across the nose'),
  option('glasses', '眼镜', 'slim round glasses'),
  option('dimples', '酒窝', 'gentle dimples when smiling'),
  option('scar', '眉尾浅疤', 'a faint scar through the tail of one eyebrow'),
  option('earring', '耳饰', 'a single slender earring'),
]

export const AVATAR_APPEARANCE_FIELDS = [
  { key: 'hairColor', label: '发色', options: HAIR_COLORS },
  { key: 'hairStyle', label: '发型', options: HAIR_STYLES },
  { key: 'outfit', label: '服装', options: OUTFIT_STYLES },
  { key: 'shoes', label: '鞋', options: SHOE_STYLES },
  { key: 'face', label: '脸部特征', options: FACE_FEATURES },
]

const optionById = (options, id) => options.find((item) => item.id === id) || null

export const DEFAULT_APPEARANCE = Object.freeze({
  hairColor: 'black',
  hairStyle: 'long-straight',
  outfit: 'coat',
  shoes: 'boots',
  face: 'none',
  faceNote: '',
})

/**
 * Normalise an appearance object against the fixed vocabulary. Unknown
 * ids fall back to the default for that field rather than failing the
 * whole profile — a reader's saved look must never be lost to one stale
 * option. Returns null only when the input is not an object at all.
 */
export function normalizeAppearance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const result = { ...DEFAULT_APPEARANCE }
  for (const field of AVATAR_APPEARANCE_FIELDS) {
    const picked = optionById(field.options, input[field.key])
    if (picked) result[field.key] = picked.id
  }
  result.faceNote = typeof input.faceNote === 'string' ? input.faceNote.trim().slice(0, AVATAR_FACE_NOTE_MAX) : ''
  return result
}

/** The one-line Chinese appearance a story carries in its config. */
export function avatarAppearanceText(appearance) {
  const look = normalizeAppearance(appearance) || DEFAULT_APPEARANCE
  const parts = []
  for (const field of AVATAR_APPEARANCE_FIELDS) {
    const picked = optionById(field.options, look[field.key])
    if (picked && picked.id !== 'none') parts.push(picked.label)
  }
  if (look.faceNote) parts.push(look.faceNote)
  return parts.join('，').slice(0, AVATAR_APPEARANCE_TEXT_MAX)
}

/** The English appearance fragments the portrait prompt paints from. */
export function avatarAppearancePrompt(appearance) {
  const look = normalizeAppearance(appearance) || DEFAULT_APPEARANCE
  const parts = []
  for (const field of AVATAR_APPEARANCE_FIELDS) {
    const picked = optionById(field.options, look[field.key])
    if (picked?.prompt) parts.push(picked.prompt)
  }
  return parts.join(', ')
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
  const appearance = normalizeAppearance(input.appearance ?? DEFAULT_APPEARANCE)
  if (!appearance) return { error: '化身的样子没能读懂，请重新选一次。' }
  return {
    profile: {
      ...(typeof input.id === 'string' && input.id ? { id: input.id.slice(0, 64) } : {}),
      name,
      description,
      appearance,
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

// Three ready-made companions for readers who would rather start from a
// person than a blank page. Adopting one fills the same form as a
// hand-written avatar and paints through the same pipeline — no preset
// ships a pre-made picture.
export const AVATAR_PRESETS = [
  {
    id: 'preset-lin-wanzhou',
    name: '林晚舟',
    description: '清冷安静的剑客，话不多，站在人群里也像站在风里。',
    appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
  },
  {
    id: 'preset-a-can',
    name: '阿灿',
    description: '笑起来很亮的街头少年，好奇心比胆子大，口袋里总有糖。',
    appearance: { hairColor: 'silver', hairStyle: 'short', outfit: 'modern-street', shoes: 'sneakers', face: 'freckles', faceNote: '' },
  },
  {
    id: 'preset-bai-yu',
    name: '白榆',
    description: '温润耐心的年轻学者，喜欢把袖口挽起来，慢慢把事情讲清楚。',
    appearance: { hairColor: 'brown', hairStyle: 'long-wavy', outfit: 'scholar', shoes: 'leather-shoes', face: 'glasses', faceNote: '' },
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
 * works too); `lockPart` marks a single-part adjustment — the server
 * then paints under the repaint lock: only that part may change.
 */
export async function generateAvatar({ profile, avatarId, lockPart, getAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 120_000 } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await avatarHeaders(getAccessToken)) }
  const body = { profile }
  if (typeof avatarId === 'string' && avatarId) body.avatarId = avatarId
  if (typeof lockPart === 'string' && lockPart) body.lockPart = lockPart
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
