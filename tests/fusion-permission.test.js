import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PNG } from 'pngjs'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createSocialService } from '../server/social.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createFusionService } from '../server/fusion.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createMergedStory,
  createStory,
} from '../src/story-engine.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import {
  fusionGateFor,
  fusionPermissionOfRecord,
  normalizeFusionPermission,
} from '../src/fusion-permission.js'

/**
 * REQ-49 合流权限： fusion is a two-person act. The author's
 * account-level setting (free | ask | forbidden, default free) lives
 * on the profile record; ask runs a real application lifecycle
 * (apply → the author's message centre → approve writes a durable
 * grant / reject notifies the applicant); the merge page's states and
 * the plaza publish gate both read the same records.
 */

const ORIGIN = { Origin: 'http://localhost:5173' }
const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

function tinyPng() {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 200
    png.data[index + 1] = 120
    png.data[index + 2] = 60
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    current = acceptChapter(current, buildChapter(current, index), chapterKey(current, index))
  }
  return current
}

const completedSeason = (avatarId) => ({
  ...walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    avatarId,
    ability: '借火一瞬',
  }), 24),
  engine: 'gemini',
})

const endlessLine = (avatarId, extra = {}) => walkLocal(createStory({
  genreId: 'mist',
  storyLengthMode: 'endless',
  name: '陆鸣',
  avatarId,
  ability: '雾行',
  ...extra,
}), 2)

/** A publishable endless fused line for `avatarId`, built on the entered line for `publicationId`. */
const mergedOnBook = (avatarId, publicationId) => {
  const own = endlessLine(avatarId)
  const entered = endlessLine(avatarId, { sourcePublicationId: publicationId })
  const merged = createMergedStory(own, entered, { rules: 'bridge', lead: 'a', bond: 'allies' })
  const walked = acceptChapter(merged, buildChapter(merged, 0), chapterKey(merged, 0))
  return { ...walked, engine: 'gemini' }
}

async function startFusionServer(t) {
  const identityStore = createMemoryIdentityStore()
  const mailer = {
    configured: true,
    sendCode: async () => { throw new Error('login codes are not part of this fixture') },
    sendRecoveryCode: async () => {},
  }
  const usernameAuth = createUsernameAuthService({
    env: { AUTH_ENABLED: 'true' },
    store: identityStore,
    mailer,
    log: () => {},
  })
  const auth = createAuthService({ env: { AUTH_ENABLED: 'true' }, usernameAuth })
  const socialStore = createMemorySocialStore()
  const plazaStore = createMemoryPlazaStore()
  const avatarStore = createMemoryAvatarStore()
  const coverStore = createMemoryCoverStore()
  const social = createSocialService({
    env: {},
    store: socialStore,
    plazaStore,
    avatarStore,
    coverStore,
    identityStore,
    now: () => Date.now(),
  })
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore, socialStore })
  const fusion = createFusionService({ env: {}, socialStore, plazaStore })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    auth,
    social,
    plaza,
    avatar: avatarService,
    fusion,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, socialStore, plazaStore }
}

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'fusion-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

async function makeAvatar(base, token, name = '沈砚') {
  const response = await fetch(`${base}/api/avatar`, {
    method: 'PUT',
    headers: authed(token),
    body: JSON.stringify({
      profile: {
        name,
        description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(response.status, 200, 'avatar save')
  return (await response.json()).avatar
}

const post = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: token ? authed(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})
const put = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'PUT',
  headers: authed(token),
  body: JSON.stringify(body ?? {}),
})
const getJson = async (base, path, token) => {
  const response = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { status: response.status, body: await response.json() }
}

async function publishBook(base, account) {
  const avatar = await makeAvatar(base, account.token)
  const response = await post(base, '/api/plaza/publish', account.token, { story: completedSeason(avatar.id) })
  assert.equal(response.status, 200, 'author publish')
  const { publication } = await response.json()
  return { avatar, publication }
}

const setPermission = async (base, token, fusionPermission) => {
  const response = await put(base, '/api/me/profile', token, { fusionPermission })
  assert.equal(response.status, 200, 'set fusion permission')
  return (await response.json()).profile
}

const statusOf = async (base, token, publicationId) => {
  const { status, body } = await post(base, '/api/fusion/status', token, { publicationIds: [publicationId] })
    .then(async (response) => ({ status: response.status, body: await response.json() }))
  assert.equal(status, 200, 'fusion status')
  return body.statuses[publicationId]
}

const notificationsOf = async (base, token) => {
  const { status, body } = await getJson(base, '/api/me/notifications', token)
  assert.equal(status, 200, 'notifications')
  return body
}

// ---------------------------------------------------------------------------
// Pure vocabulary + gate
// ---------------------------------------------------------------------------

test('permission vocabulary: absent or unknown reads as the free default', () => {
  assert.equal(normalizeFusionPermission('ask'), 'ask')
  assert.equal(normalizeFusionPermission('forbidden'), 'forbidden')
  assert.equal(normalizeFusionPermission(''), 'free')
  assert.equal(normalizeFusionPermission(undefined), 'free')
  assert.equal(normalizeFusionPermission('whatever'), 'free')
  assert.equal(fusionPermissionOfRecord(null), 'free')
  assert.equal(fusionPermissionOfRecord({}), 'free')
  assert.equal(fusionPermissionOfRecord({ fusionPermission: 'ask' }), 'ask')
})

test('merge-page gate: own lines always open; others follow setting, grant, pending', () => {
  assert.deepEqual(fusionGateFor(null), { state: 'own', canFuse: true, canApply: false, label: '' })
  assert.equal(fusionGateFor(undefined).canFuse, true, 'unknown status never locks the shelf')
  assert.equal(fusionGateFor({ own: true, permission: 'forbidden' }).canFuse, true, 'own book ignores the setting')
  assert.equal(fusionGateFor({ permission: 'free' }).canFuse, true)
  assert.equal(fusionGateFor({ permission: 'ask', granted: true }).state, 'granted')
  assert.equal(fusionGateFor({ permission: 'forbidden', granted: true }).canFuse, true, 'a grant outlives a later setting')
  const ask = fusionGateFor({ permission: 'ask' })
  assert.equal(ask.canFuse, false)
  assert.equal(ask.canApply, true)
  assert.equal(fusionGateFor({ permission: 'ask', pending: true }).state, 'pending')
  const forbidden = fusionGateFor({ permission: 'forbidden' })
  assert.equal(forbidden.canFuse, false)
  assert.equal(forbidden.canApply, false)
  assert.equal(forbidden.label, '对方未开放合流')
})

test('createMergedStory pins the source publication ids beside the source titles', () => {
  const own = endlessLine('avatar-x')
  const entered = endlessLine('avatar-x', { sourcePublicationId: 'pub-abc123' })
  const merged = createMergedStory(own, entered)
  assert.deepEqual(merged.sourcePublicationIds, ['', 'pub-abc123'])
  const flipped = createMergedStory(entered, own)
  assert.deepEqual(flipped.sourcePublicationIds, ['pub-abc123', ''])
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [merged] }), [], 'the field validates like derivedFrom')
})

// ---------------------------------------------------------------------------
// Setting storage
// ---------------------------------------------------------------------------

test('the setting defaults to free, saves on the profile record, and rejects bad values', async (t) => {
  const { base, socialStore } = await startFusionServer(t)
  const me = await register(base, 'fusion_setter')
  const { body } = await getJson(base, `/api/users/${encodeURIComponent(me.uid)}/profile`, me.token)
  assert.equal(body.profile.editable.fusionPermission, 'free', 'a fresh account reads free')

  const saved = await setPermission(base, me.token, 'ask')
  assert.equal(saved.editable.fusionPermission, 'ask')
  const record = await socialStore.getProfileRecord(me.uid)
  assert.equal(record.fusionPermission, 'ask', 'the setting is a profile-record field')

  const bad = await put(base, '/api/me/profile', me.token, { fusionPermission: 'sometimes' })
  assert.equal(bad.status, 400, 'an unknown value is refused, not coerced')
  const after = await socialStore.getProfileRecord(me.uid)
  assert.equal(after.fusionPermission, 'ask', 'a refused save changes nothing')

  // Saving an unrelated profile field must not drop the setting.
  const renamed = await put(base, '/api/me/profile', me.token, { displayName: '改个名字' })
  assert.equal(renamed.status, 200)
  assert.equal((await socialStore.getProfileRecord(me.uid)).fusionPermission, 'ask')
})

// ---------------------------------------------------------------------------
// The application lifecycle
// ---------------------------------------------------------------------------

test('free by default: status says free and applying is refused as unnecessary', async (t) => {
  const { base } = await startFusionServer(t)
  const author = await register(base, 'fusion_author_free')
  const reader = await register(base, 'fusion_reader_free')
  const { publication } = await publishBook(base, author)

  const status = await statusOf(base, reader.token, publication.id)
  assert.equal(status.permission, 'free')
  assert.equal(status.granted, false)
  assert.equal(status.own, false)

  const applied = await post(base, '/api/fusion/requests', reader.token, { publicationId: publication.id })
  assert.equal(applied.status, 400, 'a free book takes no application')

  const own = await statusOf(base, author.token, publication.id)
  assert.equal(own.own, true)
  const ownApply = await post(base, '/api/fusion/requests', author.token, { publicationId: publication.id })
  assert.equal(ownApply.status, 400, 'your own book needs no application')

  const anon = await fetch(`${base}/api/fusion/status`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicationIds: [publication.id] }),
  })
  assert.equal(anon.status, 401, 'consent state is account property')
})

test('ask: apply → author message centre → approve → durable grant + applicant system reminder', async (t) => {
  const { base, socialStore } = await startFusionServer(t)
  const author = await register(base, 'fusion_author_ask')
  const reader = await register(base, 'fusion_reader_ask')
  const { publication } = await publishBook(base, author)
  await setPermission(base, author.token, 'ask')

  let status = await statusOf(base, reader.token, publication.id)
  assert.equal(status.permission, 'ask')
  assert.equal(status.pending, false)

  const applied = await post(base, '/api/fusion/requests', reader.token, {
    publicationId: publication.id,
    storyTitle: '我的雾线',
    avatarName: '陆鸣',
  })
  assert.equal(applied.status, 200, 'application lands')
  const { request } = await applied.json()
  assert.equal(request.status, 'pending')
  assert.equal(request.bookTitle, publication.title, 'the book title is the server record, not the claim')

  const duplicate = await post(base, '/api/fusion/requests', reader.token, { publicationId: publication.id })
  assert.equal(duplicate.status, 409, 'a pending application blocks a second one')

  status = await statusOf(base, reader.token, publication.id)
  assert.equal(status.pending, true)

  // The author sees the application in the message centre's 互动.
  const authorNotes = await notificationsOf(base, author.token)
  const item = authorNotes.categories.activity.items.find((entry) => entry.kind === 'fusion_request')
  assert.ok(item, 'author activity carries the fusion request')
  assert.equal(item.requestId, request.id)
  assert.equal(item.target.bookTitle, publication.title)
  assert.equal(item.target.storyTitle, '我的雾线')
  assert.ok(authorNotes.categories.activity.unread >= 1, 'the request counts as unread')

  // Nobody but the author can answer it.
  const stranger = await post(base, '/api/fusion/requests/decide', reader.token, { requestId: request.id, approve: true })
  assert.equal(stranger.status, 404, 'the applicant cannot approve their own application')

  const decided = await post(base, '/api/fusion/requests/decide', author.token, { requestId: request.id, approve: true })
  assert.equal(decided.status, 200)
  assert.equal((await decided.json()).granted, true)

  const grant = await socialStore.getFusionGrant(reader.uid, publication.id)
  assert.ok(grant, 'approval writes the durable grant record')
  assert.equal(grant.authorUid, author.uid)

  const again = await post(base, '/api/fusion/requests/decide', author.token, { requestId: request.id, approve: false })
  assert.equal(again.status, 409, 'a decided application cannot be re-decided')

  // The item retracts for the author; the applicant gets the 系统 reminder.
  const authorAfter = await notificationsOf(base, author.token)
  assert.equal(
    authorAfter.categories.activity.items.some((entry) => entry.kind === 'fusion_request'),
    false,
    'a decided application leaves the author centre',
  )
  const readerNotes = await notificationsOf(base, reader.token)
  const systemItem = readerNotes.categories.system.items.find((entry) => entry.kind === 'fusion-approved')
  assert.ok(systemItem, 'the applicant system category carries the approval')
  assert.equal(systemItem.detail, publication.title.slice(0, 40))

  // The grant survives the author later closing the gate entirely.
  await setPermission(base, author.token, 'forbidden')
  status = await statusOf(base, reader.token, publication.id)
  assert.equal(status.permission, 'forbidden')
  assert.equal(status.granted, true, 'a given grant is not revoked by a setting change')
})

test('forbidden: no application is taken and the status says so', async (t) => {
  const { base } = await startFusionServer(t)
  const author = await register(base, 'fusion_author_no')
  const reader = await register(base, 'fusion_reader_no')
  const { publication } = await publishBook(base, author)
  await setPermission(base, author.token, 'forbidden')

  const status = await statusOf(base, reader.token, publication.id)
  assert.equal(status.permission, 'forbidden')
  const applied = await post(base, '/api/fusion/requests', reader.token, { publicationId: publication.id })
  assert.equal(applied.status, 403, 'a forbidden book takes no application')
})

test('reject: the applicant is reminded and may apply again', async (t) => {
  const { base } = await startFusionServer(t)
  const author = await register(base, 'fusion_author_rej')
  const reader = await register(base, 'fusion_reader_rej')
  const { publication } = await publishBook(base, author)
  await setPermission(base, author.token, 'ask')

  const applied = await post(base, '/api/fusion/requests', reader.token, { publicationId: publication.id })
  const { request } = await applied.json()
  const decided = await post(base, '/api/fusion/requests/decide', author.token, { requestId: request.id, approve: false })
  assert.equal(decided.status, 200)
  assert.equal((await decided.json()).granted, false)

  const readerNotes = await notificationsOf(base, reader.token)
  assert.ok(
    readerNotes.categories.system.items.some((entry) => entry.kind === 'fusion-rejected'),
    'a refusal still reaches the applicant',
  )
  const status = await statusOf(base, reader.token, publication.id)
  assert.equal(status.granted, false)
  assert.equal(status.pending, false, 'a rejected application is no longer pending')

  const reapplied = await post(base, '/api/fusion/requests', reader.token, { publicationId: publication.id })
  assert.equal(reapplied.status, 200, 'after a refusal a fresh application is allowed')
})

// ---------------------------------------------------------------------------
// The publish gate
// ---------------------------------------------------------------------------

test('publish gate: a fused book on an ask author’s book waits for the grant', async (t) => {
  const { base } = await startFusionServer(t)
  const author = await register(base, 'fusion_gate_author')
  const reader = await register(base, 'fusion_gate_reader')
  const { publication } = await publishBook(base, author)
  const readerAvatar = await makeAvatar(base, reader.token, '陆鸣')
  await setPermission(base, author.token, 'ask')

  const merged = mergedOnBook(readerAvatar.id, publication.id)
  assert.deepEqual(merged.sourcePublicationIds, ['', publication.id])

  const blocked = await post(base, '/api/plaza/publish', reader.token, { story: merged })
  assert.equal(blocked.status, 403, 'no grant, no shelving')
  assert.match((await blocked.json()).error, /合流授权/)

  const applied = await post(base, '/api/fusion/requests', reader.token, { publicationId: publication.id })
  const { request } = await applied.json()
  await post(base, '/api/fusion/requests/decide', author.token, { requestId: request.id, approve: true })

  const allowed = await post(base, '/api/plaza/publish', reader.token, { story: merged })
  assert.equal(allowed.status, 200, 'the grant opens the publish gate')
  const { publication: fusedBook } = await allowed.json()
  assert.equal(fusedBook.merged, true)
})

test('publish gate: a free author’s book fuses without any application', async (t) => {
  const { base } = await startFusionServer(t)
  const author = await register(base, 'gatefree_author')
  const reader = await register(base, 'gatefree_reader')
  const { publication } = await publishBook(base, author)
  const readerAvatar = await makeAvatar(base, reader.token, '陆鸣')

  const merged = mergedOnBook(readerAvatar.id, publication.id)
  const response = await post(base, '/api/plaza/publish', reader.token, { story: merged })
  assert.equal(response.status, 200, 'free means free, end to end')
})
