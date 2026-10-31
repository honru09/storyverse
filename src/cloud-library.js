// The cloud library client: a signed-in reader's stories also live on
// the server under their account, so the bookshelf follows the account
// instead of the browser that happened to generate it. Local storage
// stays the working copy — reading and generation never wait on the
// network — and this module keeps the two copies in step:
//
// - on sign-in, a merge reconciles both sides per story by updatedAt
//   (newer wins), uploads local-only books, downloads cloud-only ones,
//   and applies deletions only through server tombstones or through a
//   deletion this device itself made after its last sync;
// - while signed in, story changes and reading-position moves are
//   written through, debounced; failures are silent and simply retried
//   on the next trigger. Nothing here ever deletes local data on a
//   network failure, and signed-out use is exactly the old behaviour.

const SINGLE_PUT_LIMIT = 1_300_000
const CHUNK_BODY_LIMIT = 900_000
const SYNCED_KEY_PREFIX = 'storyweave:cloud-synced:'

const byteLength = (text) => new TextEncoder().encode(text).length
const timestampOf = (value) => {
  const parsed = Date.parse(typeof value === 'string' ? value : '')
  return Number.isFinite(parsed) ? parsed : 0
}

function libraryError(response, result) {
  if (response.status === 401 || result?.code === 'auth-required') {
    return Object.assign(new Error('请先登录，再使用云端书架。'), { code: 'auth-required', status: 401 })
  }
  if (response.status === 503) {
    return Object.assign(new Error('云端书架尚未开通。'), { code: 'library-unavailable', status: 503 })
  }
  if (result?.error) return Object.assign(new Error(result.error), { status: response.status })
  return Object.assign(new Error('云端书架暂时没能响应，请稍后再试。'), { status: response.status })
}

async function libraryHeaders(getAccessToken) {
  const headers = {}
  if (getAccessToken) {
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* no credential; the server decides */ }
  }
  return headers
}

async function libraryRequest(path, { getAccessToken, fetchImpl = globalThis.fetch, ...options } = {}) {
  const headers = { ...(await libraryHeaders(getAccessToken)), ...(options.headers || {}) }
  const response = await fetchImpl(path, { ...options, headers })
  let result = null
  try { result = await response.json() } catch { /* mapped below */ }
  if (!response.ok) throw libraryError(response, result)
  return result
}

/** The shelf index (metadata + tombstones + reading state), or null when the cloud library is not offered. */
export async function fetchLibraryIndex({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  try {
    const result = await libraryRequest('/api/library', { getAccessToken, fetchImpl })
    return {
      stories: Array.isArray(result?.stories) ? result.stories : [],
      deleted: Array.isArray(result?.deleted) ? result.deleted : [],
      readingState: result?.readingState ?? null,
    }
  } catch (error) {
    if (error?.code === 'library-unavailable') return null
    throw error
  }
}

/** One full story from the cloud, or null when the account has no such book. */
export async function fetchCloudStory({ storyId, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  try {
    const result = await libraryRequest(`/api/library/stories/${encodeURIComponent(storyId)}`, { getAccessToken, fetchImpl })
    return result?.story ?? null
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

/**
 * How a story travels up: whole in one request while it fits, otherwise
 * as chapter chunks (each request comfortably under the server's body
 * cap) committed by a final head write. Pure, so the split is testable.
 */
export function splitStoryForUpload(story) {
  const whole = JSON.stringify({ story })
  if (byteLength(whole) <= SINGLE_PUT_LIMIT) return { mode: 'single' }
  const { chapters = [], ...head } = story
  const chunks = []
  let current = []
  let from = 0
  for (const chapter of chapters) {
    const candidate = [...current, chapter]
    if (current.length > 0 && byteLength(JSON.stringify({ from, chapters: candidate })) > CHUNK_BODY_LIMIT) {
      chunks.push({ from, chapters: current })
      from += current.length
      current = [chapter]
    } else {
      current = candidate
    }
  }
  if (current.length > 0) chunks.push({ from, chapters: current })
  return { mode: 'chunked', head, chunks }
}

export async function uploadStory({ story, getAccessToken, fetchImpl = globalThis.fetch, keepalive = false } = {}) {
  const plan = splitStoryForUpload(story)
  const path = `/api/library/stories/${encodeURIComponent(story.id)}`
  const json = { 'Content-Type': 'application/json' }
  const beacon = keepalive ? { keepalive: true } : {}
  if (plan.mode === 'single') {
    await libraryRequest(path, {
      getAccessToken, fetchImpl, method: 'PUT', headers: json, body: JSON.stringify({ story }), ...beacon,
    })
    return { mode: 'single' }
  }
  for (let index = 0; index < plan.chunks.length; index += 1) {
    const chunk = plan.chunks[index]
    await libraryRequest(`${path}/chunks/${index}`, {
      getAccessToken, fetchImpl, method: 'PUT', headers: json,
      body: JSON.stringify({ from: chunk.from, chapters: chunk.chapters }), ...beacon,
    })
  }
  await libraryRequest(`${path}/head`, {
    getAccessToken, fetchImpl, method: 'PUT', headers: json,
    body: JSON.stringify({ story: plan.head, chunkCount: plan.chunks.length }), ...beacon,
  })
  return { mode: 'chunked', chunks: plan.chunks.length }
}

export async function deleteCloudStory({ storyId, getAccessToken, fetchImpl = globalThis.fetch, keepalive = false } = {}) {
  await libraryRequest(`/api/library/stories/${encodeURIComponent(storyId)}`, {
    getAccessToken, fetchImpl, method: 'DELETE', ...(keepalive ? { keepalive: true } : {}),
  })
  return { ok: true }
}

export async function uploadReadingState({ state, updatedAt, getAccessToken, fetchImpl = globalThis.fetch, keepalive = false } = {}) {
  await libraryRequest('/api/library/reading-state', {
    getAccessToken, fetchImpl, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, updatedAt }),
    ...(keepalive ? { keepalive: true } : {}),
  })
  return { ok: true }
}

/**
 * The merge plan, per story id. `synced` is this device's last-synced
 * updatedAt per story — it is what tells "deleted here while away" apart
 * from "never had it here": a cloud book this device once synced and no
 * longer holds was deleted on this device, so the deletion propagates;
 * a cloud book this device never saw is simply downloaded. Demo stories
 * are local fixtures and never travel in either direction.
 */
export function planMerge({ localStories = [], cloudStories = [], deleted = [], synced = {} } = {}) {
  const upload = []
  const download = []
  const removeLocal = []
  const propagateDelete = []
  const cloudById = new Map(cloudStories.filter((entry) => entry?.id).map((entry) => [entry.id, entry]))
  const tombById = new Map(deleted.filter((entry) => entry?.id).map((entry) => [entry.id, entry]))
  const localIds = new Set()

  for (const story of localStories) {
    if (!story?.id || story.isDemo) continue
    localIds.add(story.id)
    const localAt = timestampOf(story.updatedAt)
    const tomb = tombById.get(story.id)
    if (tomb && timestampOf(tomb.deletedAt) >= localAt) {
      removeLocal.push(story.id)
      continue
    }
    const cloud = cloudById.get(story.id)
    if (!cloud || localAt > timestampOf(cloud.updatedAt)) upload.push(story.id)
    else if (timestampOf(cloud.updatedAt) > localAt) download.push(story.id)
  }

  for (const entry of cloudStories) {
    if (!entry?.id || localIds.has(entry.id)) continue
    if (Object.hasOwn(synced, entry.id)) {
      if (timestampOf(entry.updatedAt) <= timestampOf(synced[entry.id])) propagateDelete.push(entry.id)
      else download.push(entry.id)
    } else if (!tombById.has(entry.id)) {
      download.push(entry.id)
    }
  }

  return { upload, download, removeLocal, propagateDelete }
}

function defaultMapStorage() {
  try { return globalThis.localStorage } catch { return undefined }
}

/**
 * The sync controller the app drives. All operations are serialized on
 * one promise chain and none of them throw: sync is a background
 * courtesy, never a gate on reading.
 */
export function createCloudSync({
  getAccessToken,
  fetchImpl = globalThis.fetch,
  debounceMs = 2500,
  storage = defaultMapStorage(),
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (id) => clearTimeout(id),
} = {}) {
  let chain = Promise.resolve()
  let session = null

  const enqueue = (task) => {
    const run = chain.then(task, task)
    chain = run.then(() => {}, () => {})
    return run
  }

  function openSession(uid) {
    if (session?.uid === uid) return session
    let synced = {}
    try {
      const raw = storage?.getItem(`${SYNCED_KEY_PREFIX}${uid}`)
      const parsed = raw ? JSON.parse(raw) : null
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) synced = parsed
    } catch { /* a lost sync map only costs a re-merge, never data */ }
    session = {
      uid,
      synced,
      pendingUploads: new Map(),
      pendingDeletes: new Set(),
      readingDirty: null,
      lastReadingRaw: undefined,
      timer: null,
    }
    return session
  }

  function persistSynced(active) {
    try { storage?.setItem(`${SYNCED_KEY_PREFIX}${active.uid}`, JSON.stringify(active.synced)) } catch { /* retried next time */ }
  }

  async function flushPending(active, { keepalive = false } = {}) {
    for (const id of [...active.pendingDeletes]) {
      try {
        await deleteCloudStory({ storyId: id, getAccessToken, fetchImpl, keepalive })
        active.pendingDeletes.delete(id)
        delete active.synced[id]
      } catch { /* stays pending for the next trigger */ }
    }
    for (const [id, story] of [...active.pendingUploads]) {
      try {
        await uploadStory({ story, getAccessToken, fetchImpl, keepalive })
        active.pendingUploads.delete(id)
        active.synced[id] = story.updatedAt
      } catch { /* stays pending for the next trigger */ }
    }
    if (active.readingDirty) {
      try {
        await uploadReadingState({ state: active.readingDirty.state, updatedAt: active.readingDirty.updatedAt, getAccessToken, fetchImpl, keepalive })
        active.readingDirty = null
      } catch { /* stays dirty for the next trigger */ }
    }
    persistSynced(active)
  }

  function schedule(active) {
    // First-change wins (FINAL-FIX R-02): the timer is armed by the
    // first pending change and is NOT re-armed by later ones. The old
    // reset-on-every-observe behaviour let a reader who keeps turning
    // pages (every turn re-observes) starve the flush indefinitely —
    // the book then existed only locally when the page closed a minute
    // after generation, and a fresh session found an empty shelf.
    // Pending work is read from the maps at flush time, so nothing is
    // lost by holding the earlier deadline.
    if (active.timer !== null) return
    active.timer = setTimeoutImpl(() => {
      active.timer = null
      void enqueue(() => flushPending(active))
    }, debounceMs)
  }

  return {
    /**
     * Sign-in reconciliation. `applyRemote({ add, removeIds })` must fold
     * the downloads and tombstone removals into the local library in one
     * update. Reading state: a fresh device's empty local state is
     * filled from the cloud; a device that already has positions keeps
     * (and uploads) its own — anchors are this device's freshest truth.
     */
    merge({ uid, library, applyRemote, readReadingStateRaw, writeReadingStateRaw }) {
      return enqueue(async () => {
        const active = openSession(uid)
        let index
        try {
          index = await fetchLibraryIndex({ getAccessToken, fetchImpl })
        } catch {
          return { status: 'error', downloaded: 0, uploaded: 0, removed: 0, deleted: 0 }
        }
        if (!index) return { status: 'unavailable', downloaded: 0, uploaded: 0, removed: 0, deleted: 0 }
        const plan = planMerge({
          localStories: library?.stories ?? [],
          cloudStories: index.stories,
          deleted: index.deleted,
          synced: active.synced,
        })
        const localById = new Map((library?.stories ?? []).map((story) => [story.id, story]))
        const add = []
        for (const id of plan.download) {
          try {
            const story = await fetchCloudStory({ storyId: id, getAccessToken, fetchImpl })
            if (story) {
              add.push(story)
              active.synced[id] = story.updatedAt
            }
          } catch { /* a failed download is retried by the next merge */ }
        }
        for (const id of plan.removeLocal) delete active.synced[id]
        if (add.length > 0 || plan.removeLocal.length > 0) {
          try { applyRemote({ add, removeIds: plan.removeLocal }) } catch { /* local store refused; retried next merge */ }
        }
        let uploaded = 0
        for (const id of plan.upload) {
          const story = localById.get(id)
          if (!story) continue
          try {
            await uploadStory({ story, getAccessToken, fetchImpl })
            active.synced[id] = story.updatedAt
            uploaded += 1
          } catch { active.pendingUploads.set(id, story) }
        }
        let deleted = 0
        for (const id of plan.propagateDelete) {
          try {
            await deleteCloudStory({ storyId: id, getAccessToken, fetchImpl })
            delete active.synced[id]
            deleted += 1
          } catch { active.pendingDeletes.add(id) }
        }
        try {
          const localRaw = readReadingStateRaw?.() ?? null
          if (!localRaw && index.readingState?.state) {
            writeReadingStateRaw?.(JSON.stringify(index.readingState.state))
            active.lastReadingRaw = JSON.stringify(index.readingState.state)
          } else if (localRaw) {
            active.lastReadingRaw = localRaw
            const parsed = JSON.parse(localRaw)
            if (parsed && typeof parsed === 'object') {
              await uploadReadingState({
                state: parsed, updatedAt: new Date().toISOString(), getAccessToken, fetchImpl,
              }).catch(() => { active.readingDirty = { state: parsed, updatedAt: new Date().toISOString() } })
            }
          }
        } catch { /* reading state never blocks the shelf merge */ }
        persistSynced(active)
        if (active.pendingUploads.size > 0 || active.pendingDeletes.size > 0 || active.readingDirty) schedule(active)
        return { status: 'ok', downloaded: add.length, uploaded, removed: plan.removeLocal.length, deleted }
      })
    },

    /** Called whenever the local library changes while signed in. */
    observe({ uid, stories, readReadingStateRaw }) {
      const active = openSession(uid)
      const present = new Set()
      for (const story of stories ?? []) {
        if (!story?.id || story.isDemo) continue
        present.add(story.id)
        if (active.synced[story.id] !== story.updatedAt) active.pendingUploads.set(story.id, story)
      }
      for (const id of Object.keys(active.synced)) {
        if (!present.has(id)) {
          active.pendingUploads.delete(id)
          active.pendingDeletes.add(id)
        }
      }
      try {
        const raw = readReadingStateRaw?.() ?? null
        if (raw !== active.lastReadingRaw) {
          active.lastReadingRaw = raw
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              active.readingDirty = { state: parsed, updatedAt: new Date().toISOString() }
            }
          }
        }
      } catch { /* an unreadable position blob is skipped, not fatal */ }
      if (active.pendingUploads.size > 0 || active.pendingDeletes.size > 0 || active.readingDirty) schedule(active)
    },

    /** Test/diagnostic hook: run any scheduled flush now. */
    flush(uid) {
      return enqueue(async () => {
        const active = openSession(uid)
        if (active.timer !== null) {
          clearTimeoutImpl(active.timer)
          active.timer = null
        }
        await flushPending(active)
      })
    },

    /**
     * The page is going away (FINAL-FIX R-02): drain what this account
     * still owes with keepalive requests — the only fetches a browser
     * guarantees to finish during unload. A body over the platform's
     * keepalive cap may still be refused; it stays pending, and the
     * next session's merge re-plans any local-only book from the cloud
     * index, so the debt is never silently dropped either way.
     */
    flushOnHide(uid) {
      if (session?.uid !== uid) return
      const active = session
      if (!active.pendingUploads.size && !active.pendingDeletes.size && !active.readingDirty) return
      if (active.timer !== null) {
        clearTimeoutImpl(active.timer)
        active.timer = null
      }
      void enqueue(() => flushPending(active, { keepalive: true }))
    },

    pendingCount(uid) {
      const active = openSession(uid)
      return active.pendingUploads.size + active.pendingDeletes.size + (active.readingDirty ? 1 : 0)
    },

    /**
     * The story ids this device currently holds in step with the
     * account library (COVER-RETRY-FIX): the cover gate uses membership
     * to tell an old, engine-unstamped book that already lives in the
     * account library from local-only seeded stock.
     */
    syncedIds(uid) {
      const active = openSession(uid)
      return new Set(Object.keys(active.synced))
    },
  }
}
