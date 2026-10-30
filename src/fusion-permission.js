// 合流权限 (REQ-49): fusion is a two-person act. Your own lines are
// always yours to fuse; fusing a line you entered from SOMEONE ELSE'S
// published book follows that author's account-level setting —
//   free      自由： the book can be fused directly (the default);
//   ask       询问： the reader must apply first, and may fuse only
//             once the author approves (the approval is a durable
//             grant — it is NOT revoked if the author later changes
//             the setting);
//   forbidden 禁止： the book cannot be applied for or fused at all.
// This module holds the shared vocabulary (client + server), the pure
// gate the merge page renders from, and the client API. The server is
// the source of truth: it stores the setting on the profile record,
// the applications and grants as real records, and re-checks grants
// when a fused book is published.

export const FUSION_PERMISSION_IDS = ['free', 'ask', 'forbidden']

export const FUSION_PERMISSION_OPTIONS = [
  { id: 'free', label: '自由' },
  { id: 'ask', label: '询问' },
  { id: 'forbidden', label: '禁止' },
]

/** A stored setting, normalised: anything unrecognised reads as the default, free. */
export function normalizeFusionPermission(value) {
  return FUSION_PERMISSION_IDS.includes(value) ? value : 'free'
}

/** The setting carried by a profile record (absent = never set = free). */
export function fusionPermissionOfRecord(record) {
  return normalizeFusionPermission(record?.fusionPermission)
}

/**
 * The merge-page gate for one candidate line, from the server's
 * per-publication status. `status` is the /api/fusion/status entry for
 * the publication the line was entered from; a line with no source
 * publication (the reader's own original, or the built-in sample) is
 * passed status=null and is always open. When the status could not be
 * fetched at all (signed out, offline), the caller passes undefined
 * and the gate stays open — the publish-time grant check on the
 * server is the backstop, and this surface never locks a reader out
 * of their own shelf on a network hiccup.
 */
export function fusionGateFor(status) {
  if (status === null) return { state: 'own', canFuse: true, canApply: false, label: '' }
  if (status === undefined) return { state: 'unknown', canFuse: true, canApply: false, label: '' }
  if (status.own) return { state: 'own', canFuse: true, canApply: false, label: '' }
  if (status.granted) return { state: 'granted', canFuse: true, canApply: false, label: '已获授权' }
  const permission = normalizeFusionPermission(status.permission)
  if (permission === 'free') return { state: 'free', canFuse: true, canApply: false, label: '' }
  if (permission === 'forbidden') return { state: 'forbidden', canFuse: false, canApply: false, label: '对方未开放合流' }
  if (status.pending) return { state: 'pending', canFuse: false, canApply: false, label: '申请中' }
  return { state: 'ask', canFuse: false, canApply: true, label: '需先申请' }
}

function fusionError(response, result) {
  if (response.status === 401 || result?.code === 'auth-required') {
    return Object.assign(new Error('请先登录，再继续。'), { code: 'auth-required' })
  }
  if (response.status === 404) return Object.assign(new Error('这本书已下架或不存在。'), { code: 'not-found' })
  if (response.status === 403) return Object.assign(new Error(result?.error || '对方未开放合流。'), { code: 'forbidden' })
  if (response.status === 409) return Object.assign(new Error(result?.error || '已经提交过申请了。'), { code: 'conflict' })
  if (response.status === 503) return new Error('这个功能还没开通，过段时间再试。')
  if (result?.error && (response.status === 400 || response.status === 403)) return new Error(result.error)
  return new Error('暂时没能完成，请稍后再试。')
}

async function fusionHeaders(getAccessToken) {
  const headers = {}
  if (getAccessToken) {
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* no credential; the server decides */ }
  }
  return headers
}

async function fusionJson(response) {
  let result = null
  try { result = await response.json() } catch { /* mapped by caller */ }
  if (!response.ok) throw fusionError(response, result)
  return result
}

/**
 * Per-publication fusion status for the signed-in caller:
 * { [publicationId]: { authorUid, permission, granted, pending, own } }.
 */
export async function fetchFusionStatus({ publicationIds, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await fusionHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/fusion/status', {
    method: 'POST', headers, body: JSON.stringify({ publicationIds: publicationIds || [] }),
  })
  const result = await fusionJson(response)
  return result?.statuses || {}
}

/** Apply to fuse one publication whose author asks first. */
export async function applyForFusion({ publicationId, storyTitle = '', avatarName = '', getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await fusionHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/fusion/requests', {
    method: 'POST', headers, body: JSON.stringify({ publicationId, storyTitle, avatarName }),
  })
  const result = await fusionJson(response)
  return result?.request || null
}

/** The caller's own fusion applications, both directions. */
export async function fetchFusionRequests({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await fusionHeaders(getAccessToken)
  const response = await fetchImpl('/api/fusion/requests', { headers })
  const result = await fusionJson(response)
  return { incoming: result?.incoming || [], outgoing: result?.outgoing || [] }
}

/** The author answers one application; approving writes the durable grant. */
export async function decideFusionRequest({ requestId, approve, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await fusionHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/fusion/requests/decide', {
    method: 'POST', headers, body: JSON.stringify({ requestId, approve: Boolean(approve) }),
  })
  const result = await fusionJson(response)
  return result?.request || null
}
