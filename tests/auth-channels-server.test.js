import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createEmailCodeService } from '../server/email-code.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemoryUsageStore, createUsageService } from '../server/usage.js'

const firebaseEnv = {
  AUTH_ENABLED: 'true', FIREBASE_API_KEY: 'public-firebase-web-key',
  FIREBASE_AUTH_DOMAIN: 'story-fixture.firebaseapp.com', FIREBASE_PROJECT_ID: 'story-fixture',
  FIREBASE_APP_ID: '1:123:web:fixture',
}
const origin = 'http://localhost:5173'

async function serve(t, { env = {}, auth, generate } = {}) {
  const calls = []
  const generator = {
    status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
    generate: generate || (async (body) => { calls.push(body); return { fixture: true, index: body.index, usage: { prompt: 100, candidates: 50, thoughts: 10, cached: 0, total: 160 } } }),
  }
  const server = createServer({ env, auth, generator, fetchImpl: async () => { throw new Error('Unexpected external request') } })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, calls }
}

function emailFixture() {
  const sent = []
  const service = createEmailCodeService({
    env: {},
    store: createMemoryIdentityStore(),
    mailer: { configured: true, sendCode: async (to, code) => { sent.push({ to, code }) } },
    log: () => {},
  })
  return { service, sent }
}

const postJson = (base, path, body, headers = {}) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

async function loginByCode(base, sent, email = 'reader@example.com') {
  const started = await postJson(base, '/api/auth/email/start', { email })
  assert.equal(started.status, 200)
  assert.deepEqual(await started.json(), { ok: true })
  const code = sent.at(-1).code
  const verified = await postJson(base, '/api/auth/email/verify', { email, code })
  assert.equal(verified.status, 200)
  return verified.json()
}

test('email-code sign-in works end to end over HTTP and reports zero usage first', async (t) => {
  const { service, sent } = emailFixture()
  const auth = createAuthService({
    env: { AUTH_ENABLED: 'true' },
    emailCode: service,
    usageService: createUsageService({ env: {}, store: createMemoryUsageStore() }),
  })
  const { base } = await serve(t, { env: { AUTH_ENABLED: 'true' }, auth })
  const session = await loginByCode(base, sent)
  assert.match(session.uid, /^em_[0-9a-f]{32}$/)
  assert.equal(session.email, 'reader@example.com')
  assert.doesNotMatch(JSON.stringify(session), new RegExp(sent[0].code))
  const account = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })
  assert.equal(account.status, 200)
  const result = await account.json()
  assert.deepEqual(result.user, { uid: session.uid, email: 'reader@example.com', displayName: null, emailVerified: true })
  assert.equal(result.provider, 'email-code')
  assert.deepEqual(result.usage, { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0, generations: 0, updatedAt: null })
  assert.equal(result.storage, 'local')
})

test('auth config advertises the email-code channel without Firebase', async (t) => {
  const { service } = emailFixture()
  const auth = createAuthService({ env: {}, emailCode: service })
  const { base } = await serve(t, { auth })
  const response = await fetch(`${base}/api/auth/config`)
  const config = await response.json()
  assert.equal(config.emailCode, true)
  assert.equal(config.enabled, false)
  assert.equal(config.firebase, null)
})

test('generation requires an identity once auth is on, from either channel', async (t) => {
  const { service, sent } = emailFixture()
  const auth = createAuthService({
    env: firebaseEnv,
    verifyIdToken: async (token) => {
      if (token === 'firebase-token') return { uid: 'firebase-user', email: 'fb@example.com', name: 'FB', email_verified: true }
      throw Object.assign(new Error('nope'), { code: 'auth/invalid-id-token' })
    },
    emailCode: service,
    usageService: createUsageService({ env: {}, store: createMemoryUsageStore() }),
  })
  const { base, calls } = await serve(t, { env: firebaseEnv, auth })
  const body = { story: { id: 'story-1' }, index: 0 }

  const anonymous = await postJson(base, '/api/generate', body)
  assert.equal(anonymous.status, 401)
  assert.equal((await anonymous.json()).code, 'auth-required')
  const forged = await postJson(base, '/api/generate', body, { Authorization: 'Bearer forged' })
  assert.equal(forged.status, 401)
  assert.equal(calls.length, 0)

  const viaFirebase = await postJson(base, '/api/generate', body, { Authorization: 'Bearer firebase-token' })
  assert.equal(viaFirebase.status, 200)
  await viaFirebase.json()

  const session = await loginByCode(base, sent)
  const viaCode = await postJson(base, '/api/generate', body, { Authorization: `Bearer ${session.token}` })
  assert.equal(viaCode.status, 200)
  await viaCode.json()
  assert.equal(calls.length, 2)

  const firebaseAccount = await fetch(`${base}/api/account`, { headers: { Authorization: 'Bearer firebase-token' } })
  const firebaseResult = await firebaseAccount.json()
  assert.equal(firebaseResult.provider, 'firebase')
  assert.equal(firebaseResult.usage.total, 160)
  assert.equal(firebaseResult.usage.generations, 1)
  const codeAccount = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })
  const codeResult = await codeAccount.json()
  assert.equal(codeResult.provider, 'email-code')
  assert.equal(codeResult.usage.total, 160)
  assert.equal(codeAccount.status, 200)
})

test('unknown provider usage counts the generation without inventing tokens', async (t) => {
  const { service, sent } = emailFixture()
  const auth = createAuthService({
    env: { AUTH_ENABLED: 'true' },
    emailCode: service,
    usageService: createUsageService({ env: {}, store: createMemoryUsageStore() }),
  })
  const { base } = await serve(t, {
    env: { AUTH_ENABLED: 'true' },
    auth,
    generate: async (body) => ({ fixture: true, index: body.index }),
  })
  const session = await loginByCode(base, sent)
  const generated = await postJson(base, '/api/generate', { story: { id: 's' }, index: 0 }, { Authorization: `Bearer ${session.token}` })
  assert.equal(generated.status, 200)
  await generated.json()
  const account = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })
  const result = await account.json()
  assert.equal(result.usage.generations, 1)
  assert.equal(result.usage.total, 0)
})

test('the daily token cap stops generation with a quota code once reached', async (t) => {
  const { service, sent } = emailFixture()
  const env = { AUTH_ENABLED: 'true', GENERATION_DAILY_TOKEN_CAP: '100' }
  const auth = createAuthService({
    env,
    emailCode: service,
    usageService: createUsageService({ env: {}, store: createMemoryUsageStore() }),
  })
  const { base, calls } = await serve(t, { env, auth })
  const session = await loginByCode(base, sent)
  const headers = { Authorization: `Bearer ${session.token}` }
  const first = await postJson(base, '/api/generate', { story: { id: 's' }, index: 0 }, headers)
  assert.equal(first.status, 200, 'the first generation fits under the pre-flight check')
  await first.json()
  const second = await postJson(base, '/api/generate', { story: { id: 's' }, index: 1 }, headers)
  assert.equal(second.status, 429)
  assert.equal((await second.json()).code, 'quota-exceeded')
  assert.equal(calls.length, 1, 'the provider was not called for the blocked request')
})

test('signing out revokes the site session immediately', async (t) => {
  const { service, sent } = emailFixture()
  const auth = createAuthService({ env: { AUTH_ENABLED: 'true' }, emailCode: service })
  const { base } = await serve(t, { env: { AUTH_ENABLED: 'true' }, auth })
  const session = await loginByCode(base, sent)
  const signout = await fetch(`${base}/api/auth/email/signout`, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${session.token}` } })
  assert.equal(signout.status, 200)
  const account = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })
  assert.equal(account.status, 401)
})

test('email endpoints reject bad shapes and stay closed when the channel is off', async (t) => {
  const { base } = await serve(t, {})
  const start = await postJson(base, '/api/auth/email/start', { email: 'reader@example.com' })
  assert.equal(start.status, 503)
  assert.doesNotMatch(await start.text(), /reader@example\.com/)
  const badShape = await postJson(base, '/api/auth/email/verify', { email: 42, code: '123456' })
  assert.equal(badShape.status, 400)
  const wrongType = await fetch(`${base}/api/auth/email/start`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: 'email=reader@example.com' })
  assert.equal(wrongType.status, 415)
})
