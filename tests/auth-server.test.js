import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'

const configured = {
  AUTH_ENABLED: 'true', FIREBASE_API_KEY: 'public-firebase-web-key',
  FIREBASE_AUTH_DOMAIN: 'story-fixture.firebaseapp.com', FIREBASE_PROJECT_ID: 'story-fixture',
  FIREBASE_APP_ID: '1:123:web:fixture',
}

async function serve(t, options = {}) {
  const server = createServer({ env: {}, ...options })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}`
}

test('unconfigured authentication is explicitly disabled and never exposes model credentials', async (t) => {
  const base = await serve(t, { env: { GEMINI_API_KEY: 'private-generation-key', GOOGLE_CLOUD_PROJECT: 'not-auth-config' } })
  const response = await fetch(`${base}/api/auth/config`)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.enabled, false)
  assert.deepEqual(result.providers, { google: false, email: false })
  assert.equal(result.firebase, null)
  assert.equal(result.storage, 'local')
  assert.doesNotMatch(JSON.stringify(result), /private-generation-key|not-auth-config/)
})

test('public auth configuration is an explicit whitelist with provider switches', async (t) => {
  const base = await serve(t, { env: { ...configured, AUTH_GOOGLE_ENABLED: 'false', GEMINI_API_KEY: 'private-model-key', FIREBASE_ADMIN_CREDENTIALS_FILE: '/private/admin.json', FIREBASE_PRIVATE_KEY: 'private-admin-key' } })
  const response = await fetch(`${base}/api/auth/config`)
  const result = await response.json()
  assert.equal(result.enabled, true)
  assert.deepEqual(result.providers, { google: false, email: true })
  assert.deepEqual(result.firebase, { apiKey: 'public-firebase-web-key', authDomain: 'story-fixture.firebaseapp.com', projectId: 'story-fixture', appId: '1:123:web:fixture' })
  assert.equal(result.storage, 'local')
  assert.doesNotMatch(JSON.stringify(result), /private-model-key|private-admin-key|admin.json/)
})

test('account rejects absent, forged, expired and revoked tokens without leaking errors', async (t) => {
  const auth = createAuthService({ env: configured, verifyIdToken: async (token) => {
    throw Object.assign(new Error('private-verifier-detail'), { code: token === 'expired' ? 'auth/id-token-expired' : token === 'revoked' ? 'auth/id-token-revoked' : 'auth/invalid-id-token' })
  } })
  const base = await serve(t, { auth })
  for (const authorization of [undefined, 'Basic secret', 'Bearer forged', 'Bearer expired', 'Bearer revoked']) {
    const response = await fetch(`${base}/api/account`, { headers: authorization ? { Authorization: authorization } : {} })
    assert.equal(response.status, 401)
    const raw = await response.text()
    assert.doesNotMatch(raw, /private-verifier-detail|forged|expired|revoked/)
    assert.ok(JSON.parse(raw).error)
  }
})

test('account uses verified claims and grants neither paid privileges nor cloud storage', async (t) => {
  const auth = createAuthService({ env: configured, verifyIdToken: async (token, checkRevoked) => {
    assert.equal(token, 'valid-token')
    assert.equal(checkRevoked, true)
    return { uid: 'reader-1', email: 'reader@example.com', name: '读者', email_verified: true, paid: true, admin: true }
  } })
  const base = await serve(t, { auth })
  const response = await fetch(`${base}/api/account`, { headers: { Authorization: 'Bearer valid-token' } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    user: { uid: 'reader-1', email: 'reader@example.com', displayName: '读者', emailVerified: true },
    provider: 'firebase',
    usage: { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0, generations: 0, updatedAt: null },
    storage: 'local', entitlements: null, subscription: null,
  })
})

test('account infrastructure failures are unavailable, not fake accounts or exposed details', async (t) => {
  const auth = createAuthService({ env: configured, verifyIdToken: async () => { throw new Error('secret-admin-credentials-path') } })
  const base = await serve(t, { auth })
  const response = await fetch(`${base}/api/account`, { headers: { Authorization: 'Bearer valid-shaped-token' } })
  assert.equal(response.status, 503)
  assert.doesNotMatch(await response.text(), /secret-admin|credentials-path|"user"/)
})

test('invalid auth domains, emulator configuration and shared model keys disable authentication', async () => {
  for (const env of [
    { ...configured, FIREBASE_AUTH_DOMAIN: 'bad.example; script-src *' },
    { ...configured, FIREBASE_AUTH_DOMAIN: 'https://fixture.firebaseapp.com/path' },
    { ...configured, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
    { ...configured, GEMINI_API_KEY: configured.FIREBASE_API_KEY },
    { ...configured, FIREBASE_PROJECT_ID: '' },
  ]) {
    assert.equal(createAuthService({ env }).config().enabled, false)
  }
})

test('configured CSP permits only the specific Firebase authentication hosts it needs', async (t) => {
  const base = await serve(t, { env: configured })
  const response = await fetch(`${base}/api/auth/config`)
  const policy = response.headers.get('content-security-policy')
  assert.match(policy, /connect-src 'self' https:\/\/identitytoolkit.googleapis.com https:\/\/securetoken.googleapis.com https:\/\/story-fixture.firebaseapp.com/)
  assert.match(policy, /frame-src https:\/\/story-fixture.firebaseapp.com/)
  assert.match(policy, /script-src 'self' https:\/\/apis.google.com/)
  assert.doesNotMatch(policy, /unsafe-eval|\*\.google|script-src[^;]*unsafe-inline/)
})

test('the real Admin SDK rejects malformed and unsigned forged JWTs before any network access', async (t) => {
  const base = await serve(t, { env: configured })
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: 'invented-user', aud: 'story-fixture', iss: 'https://securetoken.google.com/story-fixture', exp: 9999999999, email_verified: true })).toString('base64url')
  for (const token of ['not-a-jwt', `${header}.${payload}.`]) {
    const response = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(response.status, 401)
    assert.doesNotMatch(await response.text(), /invented-user|email_verified|Decoding|kid claim/)
  }
})
