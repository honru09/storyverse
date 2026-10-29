// Public profiles, the follow graph and plaza presence — the client
// half. The server is the source of truth for counts and viewer state;
// this module only moves payloads and maps failures to reader language,
// following the plaza client conventions.

function usersError(response, result) {
  if (response.status === 401 || result?.code === 'auth-required') {
    return Object.assign(new Error('请先登录，再继续。'), { code: 'auth-required' })
  }
  if (response.status === 404) return Object.assign(new Error('这位用户还不存在。'), { code: 'not-found' })
  if (response.status === 409) {
    return Object.assign(new Error(result?.error || '这个用户名已经被占用了，换一个试试。'), { code: 'conflict' })
  }
  if (response.status === 429) return new Error(result?.error || '操作太频繁了，请稍后再试。')
  if (response.status === 503) return new Error('这个功能还没开通，过段时间再试。')
  if (result?.error && response.status === 400) return new Error(result.error)
  return new Error('暂时没能完成，请稍后再试。')
}

async function usersHeaders(getAccessToken) {
  const headers = {}
  if (getAccessToken) {
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* no credential; the server decides */ }
  }
  return headers
}

async function usersJson(response) {
  let result = null
  try { result = await response.json() } catch { /* mapped by caller */ }
  if (!response.ok) throw usersError(response, result)
  return result
}

/** One user's public profile page payload (viewer state included when signed in). */
export async function fetchUserProfile({ uid, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await usersHeaders(getAccessToken)
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/profile`, { headers })
  const result = await usersJson(response)
  return result?.profile ?? null
}

/** Follow a user. Idempotent server-side; returns the new follower count. */
export async function followUser({ uid, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/follow`, {
    method: 'POST', headers, body: '{}',
  })
  return usersJson(response)
}

/** Unfollow a user. Idempotent server-side; returns the new follower count. */
export async function unfollowUser({ uid, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/unfollow`, {
    method: 'POST', headers, body: '{}',
  })
  return usersJson(response)
}

/**
 * The public name-list behind a profile's 粉丝/关注 counts. Rows are
 * resolved server-side through the same identity layers as the
 * profile payload; a signed-in viewer also gets their own follow
 * state per row. `kind` is 'followers' | 'following'.
 */
export async function fetchUserConnections({ uid, kind = 'followers', getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await usersHeaders(getAccessToken)
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/connections?kind=${kind === 'following' ? 'following' : 'followers'}`, { headers })
  const result = await usersJson(response)
  return { kind: result?.kind || kind, people: Array.isArray(result?.people) ? result.people : [], total: result?.total ?? 0 }
}

/** Public URL of a user's current avatar portrait (may 404 → hero fallback). */
export const userPortraitPath = (uid) => `/api/users/${encodeURIComponent(uid)}/portrait`

/**
 * The name a profile page may print, decided client-side as a second
 * line of defense behind the server resolver: the payload's display
 * name wins unless it is empty or email-shaped, then the avatar's
 * name, then the neutral label. An email address must never render
 * as a profile title, whatever an older payload still carries.
 */
export function publicDisplayName(profile) {
  for (const candidate of [profile?.displayName, profile?.avatar?.name]) {
    const name = typeof candidate === 'string' ? candidate.trim() : ''
    if (name && !name.includes('@')) return name
  }
  return '未命名旅人'
}

/** The @handle a profile page may print, or '' for no handle line. */
export function publicHandle(profile) {
  const handle = typeof profile?.handle === 'string' ? profile.handle.trim() : ''
  return handle && !handle.includes('@') ? handle : ''
}

/** Public URL of a user's resolved profile picture (upload or portrait). */
export const userPicturePath = (uid) => `/api/users/${encodeURIComponent(uid)}/picture`

/** Report a user from their profile page. Idempotent server-side. */
export async function reportUser({ uid, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/report`, {
    method: 'POST', headers, body: '{}',
  })
  return usersJson(response)
}

/**
 * The owner's own profile editor calls. All of them return (or check
 * against) the same server-side record the public profile reads, so
 * what the owner saves is exactly what visitors see.
 */
export async function updateMyProfile({ patch, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/me/profile', {
    method: 'PUT', headers, body: JSON.stringify(patch || {}),
  })
  const result = await usersJson(response)
  return result?.profile ?? null
}

export async function uploadMyPicture({ image, contentType, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/me/profile/picture', {
    method: 'POST', headers, body: JSON.stringify({ image, contentType }),
  })
  const result = await usersJson(response)
  return result?.profile ?? null
}

/** The owner's hero-banner upload (DEVICE-FIX REQ-19): same payload shape as the picture. */
export async function uploadMyBanner({ image, contentType, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/me/profile/banner', {
    method: 'POST', headers, body: JSON.stringify({ image, contentType }),
  })
  const result = await usersJson(response)
  return result?.profile ?? null
}

/** Remove the uploaded banner; the hero falls back to portrait/default. */
export async function deleteMyBanner({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/me/profile/banner', { method: 'DELETE', headers })
  const result = await usersJson(response)
  return result?.profile ?? null
}

export async function checkHandleAvailable({ handle, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await usersHeaders(getAccessToken)
  const response = await fetchImpl(`/api/me/handle?value=${encodeURIComponent(handle || '')}`, { headers })
  return usersJson(response)
}

/** A canvas JPEG blob as the `{ image, contentType }` upload payload. */
async function jpegBlobToUploadPayload(blob) {
  if (!blob) throw new Error('这张图片读不出来，换一张试试。')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return { image: btoa(binary), contentType: 'image/jpeg' }
}

/**
 * Draw one square region of a decoded bitmap (`{ cx, cy, side }` in
 * source pixels) to at most `size` px and return the upload payload.
 * The crop step the picture editor offers (PHONE-FIX §37): the reader
 * frames the shot themselves instead of the old silent centre crop.
 * Pure canvas work — the upload endpoint only ever sees a small JPEG,
 * exactly as before, so the server needs no change.
 */
export async function bitmapRegionToSquareJpeg(bitmap, { cx, cy, side }, size = 512) {
  const out = Math.max(1, Math.min(Math.round(side), size))
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const context = canvas.getContext('2d')
  context.drawImage(bitmap, cx, cy, side, side, 0, 0, out, out)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  return jpegBlobToUploadPayload(blob)
}

/**
 * Draw one wide region of a decoded bitmap (`{ cx, cy, width, height }`
 * in source pixels) down to at most 1600×533 and return the upload
 * payload — the banner twin of bitmapRegionToSquareJpeg, for the
 * profile hero's 3:1 crop step (DEVICE-FIX REQ-19).
 */
export async function bitmapRegionToBannerJpeg(bitmap, { cx, cy, width, height }) {
  const scale = Math.min(1, 1600 / width, 533 / height)
  const outW = Math.max(1, Math.round(width * scale))
  const outH = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const context = canvas.getContext('2d')
  context.drawImage(bitmap, cx, cy, width, height, 0, 0, outW, outH)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  return jpegBlobToUploadPayload(blob)
}

/**
 * Center-crop a picked image file to a square and shrink it to at most
 * `size` px, returning `{ image, contentType }` ready for
 * uploadMyPicture.
 */
export async function fileToSquareJpeg(file, size = 512) {
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    return await bitmapRegionToSquareJpeg(
      bitmap,
      { cx: (bitmap.width - side) / 2, cy: (bitmap.height - side) / 2, side },
      size,
    )
  } finally {
    bitmap.close?.()
  }
}

/**
 * Presence heartbeat: while the app is foregrounded and signed in, the
 * client stamps itself present every 30 s. Fire-and-forget — a failed
 * stamp only means the plaza count may miss this reader for a while.
 */
export async function sendPresenceHeartbeat({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  if (!headers.Authorization) return false
  try {
    const response = await fetchImpl('/api/presence/heartbeat', { method: 'POST', headers, body: '{}' })
    return response.ok
  } catch {
    return false
  }
}

/**
 * The message centre (NOTIFY-SETTINGS §36): three categories —
 * 互动 (an open item-kind enum: follow today, like / comment /
 * friend_request later), 公告 and 系统 — each with its items and the
 * caller's unread count against the server-side read watermark. The
 * server derives everything from real records; this only moves the
 * payload.
 */
export async function fetchNotifications({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await usersHeaders(getAccessToken)
  const response = await fetchImpl('/api/me/notifications', { headers })
  const result = await usersJson(response)
  return {
    categories: result?.categories ?? {},
    totalUnread: result?.totalUnread ?? 0,
  }
}

/** Opening a category marks that category — and only it — as read. */
export async function markNotificationsRead({ category, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/me/notifications/read', {
    method: 'POST', headers, body: JSON.stringify({ category }),
  })
  return usersJson(response)
}

/**
 * Find people (FRIENDS). Name mode is a fuzzy search over public
 * names (@handle and display name); email mode is an exact lookup —
 * the address goes up in the query, but the payload only ever
 * carries the found person's public card, never the address.
 * Signed-in only; the server throttles email lookups per account.
 */
export async function searchPeople({ q, email, limit, offset, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await usersHeaders(getAccessToken)
  const params = new URLSearchParams()
  if (email) params.set('email', email)
  else if (q) params.set('q', q)
  if (limit) params.set('limit', String(limit))
  if (offset) params.set('offset', String(offset))
  const response = await fetchImpl(`/api/users/search?${params.toString()}`, { headers })
  const result = await usersJson(response)
  return {
    mode: result?.mode || (email ? 'email' : 'name'),
    people: Array.isArray(result?.people) ? result.people : [],
    total: result?.total ?? 0,
  }
}

/**
 * The signed-in reader's own 好友区 in one payload: friends (person
 * rows with friendState 'friends'), the pending requests waiting on
 * them (person + the sender's note), and their outgoing requests
 * with standing states — a decline is only ever visible here, to the
 * person who asked.
 */
export async function fetchFriends({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await usersHeaders(getAccessToken)
  const response = await fetchImpl('/api/me/friends', { headers })
  const result = await usersJson(response)
  return {
    friends: Array.isArray(result?.friends) ? result.friends : [],
    incoming: Array.isArray(result?.incoming) ? result.incoming : [],
    outgoing: Array.isArray(result?.outgoing) ? result.outgoing : [],
    counts: result?.counts ?? { friends: 0, incomingPending: 0 },
  }
}

/** Ask someone to be friends, with one short note (≤50 chars). Returns the standing state. */
export async function sendFriendRequest({ uid, message = '', getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/friend-request`, {
    method: 'POST', headers, body: JSON.stringify({ message }),
  })
  return usersJson(response)
}

/** Answer a request addressed to me: accept forms the mutual friendship; decline only flips the record. */
export async function respondFriendRequest({ uid, accept, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/friend-request/respond`, {
    method: 'POST', headers, body: JSON.stringify({ accept: Boolean(accept) }),
  })
  return usersJson(response)
}

/** Withdraw my own pending request to this person. */
export async function cancelFriendRequest({ uid, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await usersHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/users/${encodeURIComponent(uid)}/friend-request/cancel`, {
    method: 'POST', headers, body: '{}',
  })
  return usersJson(response)
}
