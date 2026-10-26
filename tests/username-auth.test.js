import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService, normalizeUsername, usernameUid } from '../server/username-auth.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemoryUsageStore, createUsageService } from '../server/usage.js'

const origin = 'http://localhost:5173'

const serviceFixture = (env = { AUTH_ENABLED: 'true' }) => {
  const store = createMemoryIdentityStore()
  const service = createUsernameAuthService({ env, store, log: () => {} })
  return { service, store }
}

test('username normalisation is lowercase and the uid carries the channel prefix', () => {
  assert.equal(normalizeUsername('  Reader_01 '), 'reader_01')
  assert.equal(usernameUid('reader_01'), 'username:reader_01')
})

test('register succeeds, stores only a salted hash, and logs the user in at once', async () => {
  const { service, store } = serviceFixture()
  assert.equal(service.enabled, true)
  const session = await service.register('Reader_01', 'correct-horse-9', 'ip-a')
  assert.equal(session.uid, 'username:reader_01')
  assert.equal(session.username, 'reader_01')
  assert.ok(session.token.length >= 32)
  assert.ok(session.expiresAt > Date.now())
  const record = await store.getUser('reader_01')
  assert.ok(record)
  assert.equal(record.uid, 'username:reader_01')
  assert.ok(record.salt.length >= 32)
  assert.ok(record.passwordHash.length >= 64)
  assert.doesNotMatch(JSON.stringify(record), /correct-horse-9/)
  assert.doesNotMatch(JSON.stringify(session), /passwordHash|salt/)
  // The issued token resolves straight back to the username identity.
  const identity = await service.resolveSession(session.token)
  assert.deepEqual(identity, { uid: 'username:reader_01', email: null, displayName: 'reader_01', emailVerified: false, provider: 'username' })
})

test('duplicate registration is refused case-insensitively with the taken message', async () => {
  const { service } = serviceFixture()
  await service.register('reader_01', 'correct-horse-9', 'ip-a')
  await assert.rejects(service.register('READER_01', 'another-pass-9', 'ip-a'), (error) => {
    assert.equal(error.status, 409)
    assert.equal(error.message, '这个用户名已被占用。')
    return true
  })
})

test('invalid usernames and short passwords are refused before any storage', async () => {
  const { service, store } = serviceFixture()
  for (const bad of ['ab', 'a'.repeat(21), 'has space', '中文名', 'dash-name']) {
    await assert.rejects(service.register(bad, 'correct-horse-9', 'ip-a'), (error) => error.status === 400)
  }
  await assert.rejects(service.register('reader_01', 'short', 'ip-a'), (error) => error.status === 400)
  assert.equal(await store.getUser('reader_01'), null)
})

test('login succeeds, and every failure shares one anti-enumeration message', async () => {
  const { service } = serviceFixture()
  await service.register('reader_01', 'correct-horse-9', 'ip-a')
  const session = await service.login('READER_01', 'correct-horse-9', 'ip-a')
  assert.equal(session.uid, 'username:reader_01')
  const wrongPassword = await service.login('reader_01', 'wrong-password-9', 'ip-a').catch((error) => error)
  const unknownUser = await service.login('nobody_here', 'correct-horse-9', 'ip-a').catch((error) => error)
  for (const failure of [wrongPassword, unknownUser]) {
    assert.equal(failure.status, 401)
    assert.equal(failure.message, '用户名或密码不正确。')
  }
})

test('failed logins are throttled per client and username, then the window blocks even the right password', async () => {
  const { service } = serviceFixture()
  await service.register('reader_01', 'correct-horse-9', 'ip-a')
  for (let i = 0; i < 10; i++) {
    await assert.rejects(service.login('reader_01', 'wrong-password-9', 'ip-a'), (error) => error.status === 401)
  }
  await assert.rejects(service.login('reader_01', 'correct-horse-9', 'ip-a'), (error) => error.status === 429)
  // A different client is a different throttle bucket.
  const session = await service.login('reader_01', 'correct-horse-9', 'ip-b')
  assert.equal(session.uid, 'username:reader_01')
})

test('registrations are throttled per client', async () => {
  const { service } = serviceFixture()
  for (let i = 0; i < 10; i++) {
    await service.register(`reader_${i}`, 'correct-horse-9', 'ip-a')
  }
  await assert.rejects(service.register('reader_10', 'correct-horse-9', 'ip-a'), (error) => error.status === 429)
})

test('the channel is off without AUTH_ENABLED or without a store', () => {
  assert.equal(createUsernameAuthService({ env: {}, store: createMemoryIdentityStore(), log: () => {} }).enabled, false)
  assert.equal(createUsernameAuthService({ env: { AUTH_ENABLED: 'true', USERNAME_ENABLED: 'false' }, store: createMemoryIdentityStore(), log: () => {} }).enabled, false)
  assert.equal(createUsernameAuthService({ env: { AUTH_ENABLED: 'true' }, store: null, log: () => {} }).enabled, false)
})

async function serve(t, { env = {}, auth } = {}) {
  const generator = {
    status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
    generate: async () => { throw new Error('generation is not part of this fixture') },
  }
  const server = createServer({ env, auth, generator, fetchImpl: async () => { throw new Error('Unexpected external request') } })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return { base: `http://127.0.0.1:${server.address().port}` }
}

const postJson = (base, path, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

test('username channel works end to end over HTTP: config flag, register, account, login', async (t) => {
  const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
  const auth = createAuthService({ env, usageService: createUsageService({ env: {}, store: createMemoryUsageStore() }) })
  const { base } = await serve(t, { env, auth })

  const config = await (await fetch(`${base}/api/auth/config`)).json()
  assert.equal(config.providers.username, true)
  assert.equal(config.enabled, false, 'no Firebase fixture: the firebase channel itself stays off')

  const registered = await postJson(base, '/api/auth/username/register', { username: 'Reader_01', password: 'correct-horse-9' })
  assert.equal(registered.status, 200)
  const session = await registered.json()
  assert.equal(session.uid, 'username:reader_01')
  assert.doesNotMatch(JSON.stringify(session), /passwordHash|salt|correct-horse/)

  const duplicate = await postJson(base, '/api/auth/username/register', { username: 'reader_01', password: 'correct-horse-9' })
  assert.equal(duplicate.status, 409)
  assert.equal((await duplicate.json()).error, '这个用户名已被占用。')

  const account = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })
  assert.equal(account.status, 200)
  const result = await account.json()
  assert.deepEqual(result.user, { uid: 'username:reader_01', email: null, displayName: 'reader_01', emailVerified: false })
  assert.equal(result.provider, 'username')
  assert.equal(result.usage.total, 0)

  const badLogin = await postJson(base, '/api/auth/username/login', { username: 'reader_01', password: 'wrong-password-9' })
  assert.equal(badLogin.status, 401)
  assert.equal((await badLogin.json()).error, '用户名或密码不正确。')

  const login = await postJson(base, '/api/auth/username/login', { username: 'reader_01', password: 'correct-horse-9' })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).uid, 'username:reader_01')
})

test('with AUTH off the username channel is closed end to end', async (t) => {
  const auth = createAuthService({ env: { DATA_STORE: 'memory' }, usageService: createUsageService({ env: {}, store: createMemoryUsageStore() }) })
  const { base } = await serve(t, { env: {}, auth })
  const config = await (await fetch(`${base}/api/auth/config`)).json()
  assert.equal(config.providers.username, false)
  const registered = await postJson(base, '/api/auth/username/register', { username: 'reader_01', password: 'correct-horse-9' })
  assert.equal(registered.status, 503)
  const login = await postJson(base, '/api/auth/username/login', { username: 'reader_01', password: 'correct-horse-9' })
  assert.equal(login.status, 503)
})
