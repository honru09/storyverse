import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthClient } from '../src/auth/client.js'

const usernameOnlyConfig = { enabled: false, providers: { google: false, email: false, username: true }, emailCode: false, firebase: null, storage: 'local' }
const accountPayload = {
  user: { uid: 'username:reader_01', email: null, displayName: 'reader_01', emailVerified: false },
  provider: 'username',
  usage: { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0, generations: 0, updatedAt: null },
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

function fixture({ config = usernameOnlyConfig } = {}) {
  const store = memoryStore()
  const calls = []
  const revokedTokens = new Set()
  let issued = 0
  const users = new Map()
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === '/api/auth/config') return Response.json(config)
    if (url === '/api/auth/username/register') {
      const body = JSON.parse(options.body)
      if (users.has(body.username)) return Response.json({ error: '这个用户名已被占用。' }, { status: 409 })
      users.set(body.username, body.password)
      return Response.json({ token: `site-token-u-${++issued}`, uid: `username:${body.username}`, username: body.username, expiresAt: Date.now() + 60_000 })
    }
    if (url === '/api/auth/username/login') {
      const body = JSON.parse(options.body)
      return users.get(body.username) === body.password
        ? Response.json({ token: `site-token-u-${++issued}`, uid: `username:${body.username}`, username: body.username, expiresAt: Date.now() + 60_000 })
        : Response.json({ error: '用户名或密码不正确。' }, { status: 401 })
    }
    // REQ-69: username sessions revoke through the username channel's
    // own sign-out route, not the email channel's.
    if (url === '/api/auth/username/signout') { revokedTokens.add(options.headers.Authorization?.replace('Bearer ', '')); return Response.json({ ok: true }) }
    if (url === '/api/account') {
      const token = options.headers.Authorization?.replace('Bearer ', '')
      if (!token?.startsWith('site-token-u') || revokedTokens.has(token)) return Response.json({ error: 'revoked' }, { status: 401 })
      return Response.json(accountPayload)
    }
    throw new Error(`unexpected ${url}`)
  }
  const client = createAuthClient({
    fetchImpl,
    loadSdk: () => { throw new Error('SDK must not load for username-only config') },
    sessionStore: store,
  })
  return { client, store, calls }
}

test('username-only startup reaches guest without ever loading Firebase', async () => {
  const { client } = fixture()
  await client.start()
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(client.getSnapshot().config.providers.username, true)
  client.stop()
})

test('registering a username signs in at once and stores a username session', async () => {
  const { client, store, calls } = fixture()
  await client.start()
  const user = await client.registerWithUsername('Reader_01', 'correct-horse-9')
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.equal(user.provider, 'username')
  assert.equal(user.displayName, 'reader_01')
  assert.equal(user.email, null)
  const registerCall = calls.find((call) => call.url === '/api/auth/username/register')
  assert.deepEqual(JSON.parse(registerCall.options.body), { username: 'reader_01', password: 'correct-horse-9' })
  const stored = JSON.parse(store.value)
  assert.equal(stored.provider, 'username')
  assert.equal(stored.uid, 'username:reader_01')
  assert.equal(await client.getAccessToken(), stored.token)
  client.stop()
})

test('duplicate registration and wrong-password login surface the shared messages', async () => {
  const { client } = fixture()
  await client.start()
  await client.registerWithUsername('reader_01', 'correct-horse-9')
  await client.signOut()
  await assert.rejects(client.registerWithUsername('reader_01', 'correct-horse-9'), /已被占用/)
  await assert.rejects(client.signInWithUsername('reader_01', 'wrong-password-9'), /用户名或密码不正确/)
  await assert.rejects(client.registerWithUsername('bad name', 'correct-horse-9'), /3–20 个字符/)
  const user = await client.signInWithUsername('reader_01', 'correct-horse-9')
  assert.equal(user.provider, 'username')
  client.stop()
})

test('a stored username session restores on startup without Firebase', async () => {
  const { client, store } = fixture()
  store.write(JSON.stringify({ token: 'site-token-u-9', uid: 'username:reader_01', email: null, displayName: 'reader_01', provider: 'username', expiresAt: Date.now() + 60_000 }))
  await client.start()
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.equal(client.getSnapshot().user.provider, 'username')
  client.stop()
})
