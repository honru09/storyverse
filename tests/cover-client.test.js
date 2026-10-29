import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  coverPayloadFor,
  coverStateOf,
  fallbackCoverVariantFor,
  fetchCoverMeta,
  fetchCoverObjectUrl,
  requestCoverImage,
  shouldAutoRequestCover,
  withCoverState,
} from '../src/cover.js'

const geminiStory = (overrides = {}) => ({
  id: 'story-1',
  title: '雾港的钟声',
  genreId: 'mist',
  genreTemplateId: 'xianxia',
  engine: 'gemini',
  config: { genreId: 'mist', customWorldName: '', customWorldSetting: '' },
  worldBible: { premise: '沉潮港被潮水围住。' },
  chapters: [{ index: 0 }],
  ...overrides,
})

test('coverStateOf normalises absent and malformed cover fields', () => {
  assert.deepEqual(coverStateOf({}), { status: 'none', version: 0 })
  assert.deepEqual(coverStateOf({ cover: { status: 'ready', version: 3 } }), { status: 'ready', version: 3 })
  assert.deepEqual(coverStateOf({ cover: { status: 'weird', version: -1 } }), { status: 'none', version: 0 })
  assert.deepEqual(coverStateOf(null), { status: 'none', version: 0 })
})

test('withCoverState transitions without mutating the story', () => {
  const story = geminiStory()
  const pending = withCoverState(story, { status: 'pending' })
  assert.equal(pending.cover.status, 'pending')
  assert.equal(story.cover, undefined)
  const ready = withCoverState(pending, { status: 'ready', version: 2 })
  assert.deepEqual(ready.cover, { status: 'ready', version: 2 })
  const guarded = withCoverState(ready, { status: 'bogus', version: -5 })
  assert.equal(guarded.cover.status, 'ready')
  assert.equal(guarded.cover.version, 2)
})

test('shouldAutoRequestCover fires only for a fresh Gemini story with a first chapter', () => {
  assert.equal(shouldAutoRequestCover(geminiStory()), true)
  assert.equal(shouldAutoRequestCover(geminiStory({ engine: 'local' })), false, 'seeded stories keep the shared art')
  assert.equal(shouldAutoRequestCover(geminiStory({ chapters: [] })), false, 'no premise to paint from yet')
  assert.equal(shouldAutoRequestCover(geminiStory({ readOnly: true })), false)
  assert.equal(shouldAutoRequestCover(geminiStory({ cover: { status: 'pending', version: 0 } })), true, 'a pending stamp with no timestamp is an orphan (FINAL-FIX R-13)')
  const fresh = new Date().toISOString()
  assert.equal(shouldAutoRequestCover(geminiStory({ cover: { status: 'pending', version: 0, updatedAt: fresh } })), false, 'a live request is never doubled')
  const stale = new Date(Date.now() - 11 * 60 * 1000).toISOString()
  assert.equal(shouldAutoRequestCover(geminiStory({ cover: { status: 'pending', version: 0, updatedAt: stale } })), true, 'a pending stamp older than ten minutes is orphaned and may ask again')
  assert.equal(shouldAutoRequestCover(geminiStory({ cover: { status: 'ready', version: 1 } })), false)
  assert.equal(shouldAutoRequestCover(geminiStory({ cover: { status: 'failed', version: 0 } })), false, 'failure waits for a manual re-roll')
})

test('coverPayloadFor sends a slim, chapter-free painting brief', () => {
  const payload = coverPayloadFor(geminiStory({ chapters: [{ index: 0 }, { index: 1 }] }))
  assert.equal(payload.storyId, 'story-1')
  assert.equal(payload.worldBible.premise, '沉潮港被潮水围住。')
  assert.equal('chapters' in payload, false)
  assert.ok(JSON.stringify(payload).length < 4096)
})

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

test('requestCoverImage resolves the new version on success', async () => {
  const seen = []
  const fetchImpl = async (url, options) => {
    seen.push([url, options])
    return jsonResponse(200, { status: 'ready', version: 4 })
  }
  const result = await requestCoverImage({ story: geminiStory(), getAccessToken: async () => 'tok', fetchImpl })
  assert.deepEqual(result, { version: 4 })
  assert.equal(seen[0][0], '/api/cover')
  assert.equal(seen[0][1].headers.Authorization, 'Bearer tok')
})

test('requestCoverImage maps quota and auth failures to friendly, coded errors', async () => {
  const quota = async () => jsonResponse(429, { error: 'x', code: 'cover-quota' })
  await assert.rejects(
    () => requestCoverImage({ story: geminiStory(), fetchImpl: quota }),
    (error) => error.code === 'cover-quota' && /已用完/.test(error.message),
  )
  const anon = async () => jsonResponse(401, { error: 'x', code: 'auth-required' })
  await assert.rejects(
    () => requestCoverImage({ story: geminiStory(), fetchImpl: anon }),
    (error) => error.code === 'auth-required',
  )
})

test('requestCoverImage reconciles a transport failure through the meta endpoint', async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith('/api/cover/meta')) return jsonResponse(200, { status: 'ready', version: 7 })
    throw new Error('socket timeout')
  }
  const result = await requestCoverImage({ story: geminiStory(), fetchImpl })
  assert.deepEqual(result, { version: 7 })
})

test('fetchCoverMeta reads the server-side truth', async () => {
  const fetchImpl = async () => jsonResponse(200, { status: 'ready', version: 2, updatedAt: '2026-10-27T00:00:00.000Z' })
  assert.deepEqual(await fetchCoverMeta({ story: geminiStory(), fetchImpl }), { status: 'ready', version: 2 })
})

test('cover requests wait for sign-in instead of racing the session restore', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const coverComponent = readFileSync(new URL('../src/components/StoryCover.jsx', import.meta.url), 'utf8')
  // The background auto-cover effect is gated on an authenticated account…
  assert.match(main, /if \(account\.status !== "authenticated"\) return;/)
  // …a 401 releases the per-session attempt so sign-in can retry it…
  assert.match(main, /coverAttempts\.current\.delete\(id\)/)
  // …and cover displays re-fetch when the auth signal changes.
  assert.match(coverComponent, /\}, \[status, version, storyId, authSignal\]\);/)
})

test('fetchCoverObjectUrl caches per version and revokes the replaced painting', async () => {
  const revoked = []
  let fetches = 0
  const fetchImpl = async () => {
    fetches += 1
    return { ok: true, status: 200, blob: async () => new Blob([`img-${fetches}`], { type: 'image/jpeg' }) }
  }
  const createObjectURL = (blob) => `blob:cover-${fetches}`
  const revokeObjectURL = (url) => revoked.push(url)
  const ready = (version) => geminiStory({ cover: { status: 'ready', version } })
  const first = await fetchCoverObjectUrl({ story: ready(1), fetchImpl, createObjectURL, revokeObjectURL })
  assert.equal(first, 'blob:cover-1')
  const again = await fetchCoverObjectUrl({ story: ready(1), fetchImpl, createObjectURL, revokeObjectURL })
  assert.equal(again, 'blob:cover-1')
  assert.equal(fetches, 1, 'same version is served from cache')
  const next = await fetchCoverObjectUrl({ story: ready(2), fetchImpl, createObjectURL, revokeObjectURL })
  assert.equal(next, 'blob:cover-2')
  assert.deepEqual(revoked, ['blob:cover-1'], 'the old painting is released on re-roll')
  assert.equal(await fetchCoverObjectUrl({ story: geminiStory(), fetchImpl, createObjectURL, revokeObjectURL }), null)
})

test('fallbackCoverVariantFor keeps the world painting whenever it depicts the world (§37)', () => {
  // A known preset world: its own painting is the honest fallback,
  // even when the template would map to a variant.
  assert.equal(fallbackCoverVariantFor(geminiStory()), null)
  assert.equal(fallbackCoverVariantFor(geminiStory({ genreId: 'city', genreTemplateId: 'scifi' })), null)
  assert.equal(fallbackCoverVariantFor(geminiStory({ genreId: 'cultivation', genreTemplateId: 'urban' })), null)
})

test('fallbackCoverVariantFor maps custom and unknown worlds by template flavour (§37)', () => {
  const custom = (genreTemplateId) => geminiStory({ genreId: 'custom', genreTemplateId })
  assert.equal(fallbackCoverVariantFor(custom('xuanhuan')), 'eastern')
  assert.equal(fallbackCoverVariantFor(custom('gaowu')), 'eastern')
  assert.equal(fallbackCoverVariantFor(custom('lishi')), 'eastern')
  assert.equal(fallbackCoverVariantFor(custom('urban')), 'urban')
  assert.equal(fallbackCoverVariantFor(custom('campus')), 'urban')
  assert.equal(fallbackCoverVariantFor(custom('scifi')), 'scifi')
  assert.equal(fallbackCoverVariantFor(custom('wuxianliu')), 'scifi')
  // Unknown world ids fall through the same mapping.
  assert.equal(fallbackCoverVariantFor(geminiStory({ genreId: 'atlantis', genreTemplateId: 'xianxia' })), 'eastern')
  // Unmapped flavours stay on the world artwork — no guessy matches.
  assert.equal(fallbackCoverVariantFor(custom('horror')), null)
  assert.equal(fallbackCoverVariantFor(custom('guize-guatan')), null)
  assert.equal(fallbackCoverVariantFor(custom('zhihu-short')), null)
  assert.equal(fallbackCoverVariantFor(custom('')), null)
  assert.equal(fallbackCoverVariantFor(null), null)
})
