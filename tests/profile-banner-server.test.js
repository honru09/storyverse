// DEVICE-FIX REQ-19: the profile banner chain — upload / serve /
// delete over HTTP, the bannerSourceFor resolution order, and
// bannerVersion surviving unrelated profile saves.
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemorySocialStore, bannerSourceFor } from '../server/social-store.js'
import { createSocialService } from '../server/social.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createAuthService } from '../server/auth.js'
import { createServer } from '../server/index.js'

const jpegBytes = (seed = 7) => Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.alloc(96, seed),
  Buffer.from([0xff, 0xd9]),
])
const bannerPayload = (bytes, contentType = 'image/jpeg') => ({ image: bytes.toString('base64'), contentType })

async function startServer(t) {
  const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
  const identityStore = createMemoryIdentityStore()
  const socialStore = createMemorySocialStore()
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => { throw new Error('unused') },
  })
  const plazaStore = createMemoryPlazaStore()
  const plazaService = createPlazaService({ env: {}, store: plazaStore, avatarStore, socialStore })
  const socialService = createSocialService({ env: {}, store: socialStore, plazaStore, avatarStore, identityStore })
  const auth = createAuthService({ env, usernameAuth: createUsernameAuthService({ env, store: identityStore }) })
  const server = createServer({
    env,
    auth,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    avatar: avatarService,
    plaza: plazaService,
    social: socialService,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}` }
}

const ORIGIN = { Origin: 'http://localhost:5173' }
const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'banner-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

async function getProfile(base, uid, token) {
  const response = await fetch(`${base}/api/users/${encodeURIComponent(uid)}/profile`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  assert.equal(response.status, 200, 'profile fetch')
  return (await response.json()).profile
}

test('bannerSourceFor: upload beats avatar beats the designed default', () => {
  assert.equal(bannerSourceFor({}), 'default')
  assert.equal(bannerSourceFor({ portraitReady: true }), 'avatar')
  assert.equal(bannerSourceFor({ hasUpload: true, portraitReady: true }), 'upload')
  assert.equal(bannerSourceFor({ hasUpload: false, portraitReady: false }), 'default')
})

test('banner upload, serving, version bumps and delete (DEVICE-FIX REQ-19)', async (t) => {
  const { base } = await startServer(t)
  const user = await register(base, 'banner_user')
  const other = await register(base, 'banner_viewer')

  // Fresh: the designed default, nothing served by the route.
  let profile = await getProfile(base, user.uid, user.token)
  assert.deepEqual(profile.banner, { kind: 'default', url: '/art/banner-profile-1600.webp' })
  assert.equal(profile.editable.hasBanner, false)
  assert.equal((await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/banner`)).status, 404)

  // Login is required to change it.
  const anonymous = await fetch(`${base}/api/me/profile/banner`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(bannerPayload(jpegBytes())),
  })
  assert.equal(anonymous.status, 401)

  // Wrong magic bytes for the declared type are refused.
  const forged = await fetch(`${base}/api/me/profile/banner`, {
    method: 'POST', headers: authed(user.token),
    body: JSON.stringify(bannerPayload(Buffer.from('not a jpeg at all'))),
  })
  assert.equal(forged.status, 400)

  // Oversize is refused (the cap is 1 MiB of decoded bytes).
  const oversize = await fetch(`${base}/api/me/profile/banner`, {
    method: 'POST', headers: authed(user.token),
    body: JSON.stringify(bannerPayload(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1_100_000, 3)]))),
  })
  assert.equal(oversize.status, 400)

  // A real upload lands, versions the URL and serves the exact bytes.
  const bytes = jpegBytes(21)
  const uploaded = await fetch(`${base}/api/me/profile/banner`, {
    method: 'POST', headers: authed(user.token),
    body: JSON.stringify(bannerPayload(bytes)),
  })
  assert.equal(uploaded.status, 200)
  profile = (await uploaded.json()).profile
  assert.equal(profile.banner.kind, 'upload')
  assert.match(profile.banner.url, /\/banner\?v=1$/)
  assert.equal(profile.editable.hasBanner, true)

  const served = await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/banner`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), bytes)

  // Another account's view of the profile carries the upload URL.
  const seenByOther = await getProfile(base, user.uid, other.token)
  assert.equal(seenByOther.banner.kind, 'upload')
  assert.match(seenByOther.banner.url, /\/banner\?v=1$/)

  // An unrelated profile save must not clear the banner version.
  const renamed = await fetch(`${base}/api/me/profile`, {
    method: 'PUT', headers: authed(user.token),
    body: JSON.stringify({ displayName: '横幅测试员' }),
  })
  assert.equal(renamed.status, 200)
  profile = (await renamed.json()).profile
  assert.match(profile.banner.url, /\/banner\?v=1$/, 'bannerVersion survives a profile save')

  // Re-upload bumps the version (cache bust).
  const again = await fetch(`${base}/api/me/profile/banner`, {
    method: 'POST', headers: authed(user.token),
    body: JSON.stringify(bannerPayload(jpegBytes(33))),
  })
  assert.equal(again.status, 200)
  profile = (await again.json()).profile
  assert.match(profile.banner.url, /\/banner\?v=2$/)

  // Delete returns to the default and the route goes quiet again.
  const removed = await fetch(`${base}/api/me/profile/banner`, { method: 'DELETE', headers: authed(user.token) })
  assert.equal(removed.status, 200)
  profile = (await removed.json()).profile
  assert.deepEqual(profile.banner, { kind: 'default', url: '/art/banner-profile-1600.webp' })
  assert.equal(profile.editable.hasBanner, false)
  assert.equal((await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/banner`)).status, 404)
})
