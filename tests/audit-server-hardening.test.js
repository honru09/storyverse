import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createEmailCodeService } from '../server/email-code.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { ApiError } from '../server/gemini.js'

/**
 * REQ-69 cluster C, task 6 + 7: reserved usernames, write-method Origin
 * discipline, anonymous /api/status redaction, and a username-channel
 * sign-out that actually revokes the server session.
 */

const ORIGIN = 'http://localhost:5173'
const STATUS_MODEL = 'fixture-secret-model-name'

function authStub() {
  return {
    config: () => ({ enabled: false, firebase: null, providers: { google: false, email: false, username: true }, emailCode: false, storage: 'local' }),
    requiresIdentity: () => false,
    identity: async (authorization) => {
      if (authorization !== 'Bearer member-token') throw new ApiError(401, '请先登录。', 'auth-required')
      return { uid: 'username:member', provider: 'username', displayName: 'member', email: null, emailVerified: false }
    },
    usageDailyTotal: async () => 0,
    dailyTokenCap: () => 1_000_000,
    recordUsage: async () => true,
  }
}

async function startServer(t, overrides = {}) {
  const server = createServer({
    env: {},
    generator: {
      status: () => ({ configured: true, provider: 'gemini', model: STATUS_MODEL }),
      generate: async () => { throw new Error('unused') },
    },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
    ...overrides,
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}` }
}

test('origin discipline: a DELETE without an Origin is refused like any other write; a same-site DELETE passes', async (t) => {
  const social = {
    recordAccountEvent: async () => {},
    deleteMyBanner: async () => ({ profile: { ok: true } }),
  }
  const { base } = await startServer(t, { auth: authStub(), social })
  const noOrigin = await fetch(`${base}/api/me/profile/banner`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer member-token' },
  })
  assert.equal(noOrigin.status, 403, 'DELETE is a write and must not slip the Origin discipline')
  await noOrigin.text()

  const withOrigin = await fetch(`${base}/api/me/profile/banner`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer member-token', Origin: ORIGIN },
  })
  assert.equal(withOrigin.status, 200)
  await withOrigin.json()
})

test('status redaction: anonymous callers never see provider or model names; signed-in callers do', async (t) => {
  const { base } = await startServer(t, { auth: authStub() })
  const anonymous = await fetch(`${base}/api/status`)
  assert.equal(anonymous.status, 200)
  const anonymousPayload = await anonymous.json()
  assert.equal(anonymousPayload.configured, true, 'availability stays public')
  assert.equal('model' in anonymousPayload, false)
  assert.equal('provider' in anonymousPayload, false)
  assert.doesNotMatch(JSON.stringify(anonymousPayload), new RegExp(STATUS_MODEL))

  const member = await fetch(`${base}/api/status`, { headers: { Authorization: 'Bearer member-token' } })
  assert.equal(member.status, 200)
  const memberPayload = await member.json()
  assert.equal(memberPayload.model, STATUS_MODEL)
  assert.equal(memberPayload.provider, 'gemini')
})

test('reserved usernames: official look-alikes are refused at registration, ordinary names pass', async () => {
  const mod = await import('../server/username-auth.js')
  assert.equal(typeof mod.isReservedUsername, 'function', 'username-auth exports the reusable reserved-name check')
  for (const name of ['storyweave', 'storyweave_official', 'StoryWeave', 'story.weave_official', 'storyweave01', 'OFFICIAL', 'admin', 'support', 'system']) {
    assert.equal(mod.isReservedUsername(name), true, `${name} is reserved`)
  }
  for (const name of ['storyweave_fan', 'mystoryweave', 'weave_reader', 'officially_me']) {
    assert.equal(mod.isReservedUsername(name), false, `${name} is an ordinary name`)
  }

  const service = mod.createUsernameAuthService({
    env: { AUTH_ENABLED: 'true' },
    store: createMemoryIdentityStore(),
    mailer: { configured: false, sendCode: async () => {}, sendRecoveryCode: async () => {} },
    log: () => {},
  })
  let attempt = 0
  for (const name of ['storyweave_official', 'StoryWeave', 'story.weave_official', 'storyweave01', 'OFFICIAL']) {
    await assert.rejects(
      () => service.register(name, 'password-123', `reserved-${attempt++}`),
      (error) => error instanceof ApiError && error.status === 400 && /不能用|换一个/.test(error.message),
      `${name} must be refused at register`,
    )
  }
  const fan = await service.register('storyweave_fan', 'password-123', 'reserved-ok-1')
  assert.equal(fan.username, 'storyweave_fan')
  const mine = await service.register('mystoryweave', 'password-123', 'reserved-ok-2')
  assert.equal(mine.username, 'mystoryweave')
})

async function startUsernameServer(t) {
  const identityStore = createMemoryIdentityStore()
  const mailer = { configured: false, sendCode: async () => {}, sendRecoveryCode: async () => {} }
  const usernameAuth = createUsernameAuthService({ env: { AUTH_ENABLED: 'true' }, store: identityStore, mailer, log: () => {} })
  const emailCode = createEmailCodeService({ env: {}, store: identityStore, mailer, log: () => {} })
  const auth = createAuthService({ env: { AUTH_ENABLED: 'true' }, usernameAuth, emailCode })
  return startServer(t, { env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }, auth })
}

test('username sign-out revokes the server session: the same token stops working', async (t) => {
  const { base } = await startUsernameServer(t)
  const registered = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'signout_user', password: 'password-123' }),
  })
  assert.equal(registered.status, 200)
  const { token } = await registered.json()

  const before = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(before.status, 200)
  await before.json()

  const signout = await fetch(`${base}/api/auth/username/signout`, {
    method: 'POST',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` },
  })
  assert.equal(signout.status, 200, 'the username channel has its own sign-out route')
  await signout.json()

  const after = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(after.status, 401, 'a signed-out token must no longer resolve an identity')
  await after.text()

  // The email channel keeps its own behaviour: its sign-out route is
  // untouched by the username one (both answer, neither revives).
  const emailSignout = await fetch(`${base}/api/auth/email/signout`, {
    method: 'POST',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` },
  })
  assert.equal(emailSignout.status, 200)
  await emailSignout.json()
})
