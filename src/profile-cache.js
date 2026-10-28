// Profile data cache + per-uid view-state memory (PROFILE-FIX batch,
// PROFILE-FEEL A5/B4). Two small module-level stores:
//
// 1. A profile payload cache keyed by (viewer, uid): a profile's
//    viewerState depends on who is looking, so the viewer's uid is
//    part of the key. Reads are stale-while-revalidate — a cached
//    payload renders instantly and a background fetch refreshes it,
//    notifying subscribers when fresher data lands. The skeleton is
//    therefore a once-per-account-per-person sight, not an every-visit
//    ritual. Writes (edit sheet saves, follow toggles) go through
//    rememberProfile so every open surface agrees at once.
//
// 2. A view-state memory keyed by uid: segment / board / search /
//    sort / scroll of a profile visit, kept for the session so coming
//    back to a person (or to your own tab) resumes where you left
//    them instead of resetting to the top. Deliberately memory-only:
//    nothing here is worth persisting across a reload.
import { fetchUserProfile } from './users.js'

const entries = new Map()
const listeners = new Map()
const viewStates = new Map()
const introSeen = new Set()

const keyFor = (viewerUid, uid) => `${viewerUid || ''}::${uid || ''}`

function notify(key, profile) {
  const set = listeners.get(key)
  if (!set) return
  for (const listener of [...set]) {
    try { listener(profile) } catch { /* a broken listener never breaks the cache */ }
  }
}

/** The cached payload for (viewer, uid), or null when never loaded. */
export function peekProfile({ viewerUid = '', uid } = {}) {
  return entries.get(keyFor(viewerUid, uid))?.profile ?? null
}

/** Subscribe to fresher payloads for (viewer, uid). Returns unsubscribe. */
export function subscribeProfile({ viewerUid = '', uid } = {}, listener) {
  const key = keyFor(viewerUid, uid)
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key).add(listener)
  return () => {
    const set = listeners.get(key)
    if (!set) return
    set.delete(listener)
    if (set.size === 0) listeners.delete(key)
  }
}

/** Write a payload into the cache (saves, follow toggles, fresh loads). */
export function rememberProfile({ viewerUid = '', profile } = {}) {
  if (!profile?.uid) return
  const key = keyFor(viewerUid, profile.uid)
  entries.set(key, { profile, at: Date.now() })
  notify(key, profile)
}

/**
 * Load a profile SWR-style. Resolves with the cached payload at once
 * when one exists (and revalidates in the background); otherwise
 * resolves with the network result. Rejects only when there is no
 * cached payload to fall back on and the fetch fails.
 */
export async function loadProfile({ viewerUid = '', uid, getAccessToken, fetchImpl } = {}) {
  const key = keyFor(viewerUid, uid)
  const cached = entries.get(key)?.profile ?? null
  const revalidate = (async () => {
    const fresh = await fetchUserProfile({ uid, getAccessToken, fetchImpl })
    if (fresh) {
      entries.set(key, { profile: fresh, at: Date.now() })
      notify(key, fresh)
    }
    return fresh
  })()
  if (cached) {
    revalidate.catch(() => { /* the cached copy keeps standing */ })
    return cached
  }
  return revalidate
}

/** Drop every cached payload (sign-out: viewerState must not leak across accounts). */
export function clearProfileCache() {
  entries.clear()
}

/** The remembered view state for a uid (segment, board, query, sort, scroll). */
export function profileViewState(uid) {
  return viewStates.get(uid || '') || null
}

export function rememberProfileViewState(uid, patch) {
  if (!uid || !patch) return
  viewStates.set(uid, { ...(viewStates.get(uid) || {}), ...patch })
}

/**
 * The entrance stagger is a first-meeting ceremony: it plays once per
 * uid per session (window form), never for a return visit — and never
 * on the owner's own tab page, which the caller enforces separately.
 */
export function profileIntroSeen(uid) {
  return introSeen.has(uid || '')
}

export function markProfileIntroSeen(uid) {
  if (uid) introSeen.add(uid)
}
