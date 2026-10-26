import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthClient } from '../src/auth/client.js'

const codeOnlyConfig = { enabled: false, providers: { google: false, email: false }, emailCode: true, firebase: null, storage: 'local' }
const accountPayload = {
  user: { uid: 'em_reader', email: 'reader@example.com', displayName: null, emailVerified: true },
  provider: 'email-code',
  usage: { prompt: 10, candidates: 20, thoughts: 5, cached: 0, total: 35, generations: 2, updatedAt: '2026-10-26T00:00:00.000Z' },
  storage: 'local', entitlements: null, subscription: null,
}

function memoryStore() {
  let value = null
  return {
    read: () => value,
    write: (next) => { value = next },
    clear: () => { value = null },
    get value() { return value },
  }
}

function fixture({ config = codeOnlyConfig, onVerify, loadSdk } = {}) {
  const store = memoryStore()
  const calls = []
  let revoked = false
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === '/api/auth/config') return Response.json(config)
    if (url === '/api/auth/email/start') return Response.json({ ok: true })
    if (url === '/api/auth/email/verify') {
      const body = JSON.parse(options.body)
      if (onVerify) return onVerify(body)
      return body.code === '123456'
        ? Response.json({ token: 'site-token-1', uid: 'em_reader', email: body.email, expiresAt: Date.now() + 60_000 })
        : Response.json({ error: '验证码不正确或已过期' }, { status: 401 })
    }
    if (url === '/api/auth/email/signout') { revoked = true; return Response.json({ ok: true }) }
    if (url === '/api/account') {
      if (revoked) return Response.json({ error: 'revoked' }, { status: 401 })
      assert.equal(options.headers.Authorization, 'Bearer site-token-1')
      return Response.json(accountPayload)
    }
    throw new Error(`unexpected ${url}`)
  }
  const client = createAuthClient({
    fetchImpl,
    loadSdk: loadSdk || (() => { throw new Error('SDK must not load for email-code-only config') }),
    sessionStore: store,
  })
  return { client, store, calls, wasRevoked: () => revoked }
}

test('email-code-only startup reaches guest without ever loading Firebase', async () => {
  const { client } = fixture()
  await client.start()
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(client.getSnapshot().user, null)
  assert.equal(await client.getAccessToken(), null)
  client.stop()
})

test('requesting and entering a code signs in, stores the session and exposes usage', async () => {
  const { client, store, calls } = fixture()
  await client.start()
  await client.requestEmailCode(' reader@example.com ')
  assert.match(client.getSnapshot().notice, /验证码已发送/)
  const startCall = calls.find((call) => call.url === '/api/auth/email/start')
  assert.deepEqual(JSON.parse(startCall.options.body), { email: 'reader@example.com' })
  const user = await client.signInWithEmailCode('reader@example.com', '123456')
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.equal(user.provider, 'email-code')
  assert.equal(user.emailVerified, true)
  assert.deepEqual(client.getSnapshot().usage, accountPayload.usage)
  assert.equal(await client.getAccessToken(), 'site-token-1')
  assert.ok(store.value.includes('site-token-1'), 'the session token persists in the session store')
  assert.doesNotMatch(JSON.stringify(client.getSnapshot()), /site-token-1/, 'the token itself is never part of the UI snapshot')
  client.stop()
})

test('malformed and wrong codes are rejected with the fixed safe message', async () => {
  const { client, calls } = fixture()
  await client.start()
  await assert.rejects(client.signInWithEmailCode('reader@example.com', '12345'), { code: 'auth/invalid-code' })
  assert.equal(calls.filter((call) => call.url === '/api/auth/email/verify').length, 0, 'a malformed code never reaches the server')
  await assert.rejects(client.signInWithEmailCode('reader@example.com', '999999'), { code: 'auth/invalid-code', message: /验证码不正确或已过期/ })
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(await client.getAccessToken(), null)
  client.stop()
})

test('a stored session restores on restart; a server-dead one is dropped', async () => {
  const first = fixture()
  await first.client.start()
  await first.client.signInWithEmailCode('reader@example.com', '123456')
  first.client.stop()
  assert.ok(first.store.value)

  const restored = fixture()
  restored.store.write(first.store.value)
  await restored.client.start()
  assert.equal(restored.client.getSnapshot().status, 'authenticated')
  assert.equal(restored.client.getSnapshot().user.provider, 'email-code')
  assert.equal(await restored.client.getAccessToken(), 'site-token-1')
  restored.client.stop()

  // The server has forgotten the session: restore must clear the local copy.
  const deadStore = memoryStore()
  deadStore.write(first.store.value)
  const strictClient = createAuthClient({
    fetchImpl: async (url) => {
      if (url === '/api/auth/config') return Response.json(codeOnlyConfig)
      if (url === '/api/account') return Response.json({ error: 'gone' }, { status: 401 })
      throw new Error(`unexpected ${url}`)
    },
    loadSdk: () => { throw new Error('no sdk') },
    sessionStore: deadStore,
  })
  await strictClient.start()
  assert.equal(strictClient.getSnapshot().status, 'guest')
  assert.equal(deadStore.value, null, 'the dead session was cleared locally')
  strictClient.stop()
})

test('signing out revokes the server session and clears local state', async () => {
  const { client, store, wasRevoked } = fixture()
  await client.start()
  await client.signInWithEmailCode('reader@example.com', '123456')
  await client.signOut()
  assert.equal(wasRevoked(), true)
  assert.equal(store.value, null)
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(client.getSnapshot().usage, null)
  assert.equal(await client.getAccessToken(), null)
  client.stop()
})

test('email-code operations are refused when the channel is not in the config', async () => {
  const disabled = { enabled: false, providers: { google: false, email: false }, emailCode: false, firebase: null, storage: 'local' }
  const { client } = fixture({ config: disabled })
  await client.start()
  assert.equal(client.getSnapshot().status, 'unavailable')
  await assert.rejects(client.requestEmailCode('reader@example.com'), { code: 'auth/operation-not-allowed' })
  await assert.rejects(client.signInWithEmailCode('reader@example.com', '123456'), { code: 'auth/operation-not-allowed' })
  client.stop()
})

test('both channels in one config: Firebase sign-in wins and supplies the access token', async () => {
  const dual = {
    enabled: true, providers: { google: true, email: true }, emailCode: true, storage: 'local',
    firebase: { apiKey: 'public-key', authDomain: 'fixture.firebaseapp.com', projectId: 'fixture', appId: 'fixture-app' },
  }
  const profile = { uid: 'fb-1', email: 'fb@example.com', displayName: 'FB', emailVerified: true }
  const auth = { currentUser: null }
  const observers = new Set()
  const emit = (user) => { auth.currentUser = user; for (const observer of observers) observer(user) }
  const sdk = {
    getApps: () => [], initializeApp: () => ({}), getAuth: () => auth,
    onIdTokenChanged: (_auth, callback) => { observers.add(callback); queueMicrotask(() => { if (observers.has(callback)) callback(auth.currentUser) }); return () => observers.delete(callback) },
    GoogleAuthProvider: class {},
    signInWithPopup: async () => { emit({ ...profile }); return { user: auth.currentUser } },
    getIdToken: async () => 'firebase-token-1',
    signOut: async () => emit(null),
  }
  const store = memoryStore()
  const client = createAuthClient({
    fetchImpl: async (url, options = {}) => {
      if (url === '/api/auth/config') return Response.json(dual)
      if (url === '/api/account') {
        assert.equal(options.headers.Authorization, 'Bearer firebase-token-1')
        return Response.json({ user: profile, provider: 'firebase', usage: { prompt: 1, candidates: 2, thoughts: 0, cached: 0, total: 3, generations: 1, updatedAt: null }, storage: 'local', entitlements: null, subscription: null })
      }
      throw new Error(`unexpected ${url}`)
    },
    loadSdk: async () => sdk,
    sessionStore: store,
  })
  await client.start()
  assert.equal(client.getSnapshot().status, 'guest')
  await client.signInWithGoogle()
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.equal(client.getSnapshot().user.provider, 'firebase')
  assert.equal(await client.getAccessToken(), 'firebase-token-1')
  assert.deepEqual(client.getSnapshot().usage, { prompt: 1, candidates: 2, thoughts: 0, cached: 0, total: 3, generations: 1, updatedAt: null })
  await client.signOut()
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(await client.getAccessToken(), null)
  client.stop()
})
