import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthClient } from '../src/auth/client.js'

const usernameOnlyConfig = { enabled: false, providers: { google: false, email: false, username: true }, emailCode: false, firebase: null, storage: 'local' }

function memoryStore() {
  let value = null
  return {
    read: () => value,
    write: (next) => { value = next },
    clear: () => { value = null },
    get value() { return value },
  }
}

/**
 * A username-channel stub with a recovery directory. `channelOpen` flips
 * the start/reset endpoints between the explicit closed business code and
 * the live flow (code 246810 for reader_01).
 */
function fixture({ channelOpen = false } = {}) {
  const store = memoryStore()
  const calls = []
  let issued = 0
  let boundEmail = null
  const accountPayload = () => ({
    user: { uid: 'username:reader_01', email: null, displayName: 'reader_01', emailVerified: false },
    provider: 'username',
    recovery: boundEmail
      ? { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen }
      : { hasRecoveryEmail: false, maskedRecoveryEmail: null, channelOpen },
    usage: { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0, generations: 0, updatedAt: null },
    storage: 'local', entitlements: null, subscription: null,
  })
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === '/api/auth/config') return Response.json(usernameOnlyConfig)
    if (url === '/api/auth/username/register') {
      const body = JSON.parse(options.body)
      if (typeof body.recoveryEmail === 'string') boundEmail = body.recoveryEmail
      return Response.json({ token: `site-token-u-${++issued}`, uid: 'username:reader_01', username: 'reader_01', expiresAt: Date.now() + 60_000 })
    }
    if (url === '/api/auth/username/login') {
      return Response.json({ token: `site-token-u-${++issued}`, uid: 'username:reader_01', username: 'reader_01', expiresAt: Date.now() + 60_000 })
    }
    if (url === '/api/auth/username/recovery/status') {
      return Response.json(boundEmail
        ? { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen }
        : { hasRecoveryEmail: false, maskedRecoveryEmail: null, channelOpen })
    }
    if (url === '/api/auth/username/recovery/start') {
      return channelOpen
        ? Response.json({ ok: true })
        : Response.json({ error: '邮箱找回通道尚未开通。', code: 'recovery-channel-closed' }, { status: 503 })
    }
    if (url === '/api/auth/username/recovery/reset') {
      if (!channelOpen) return Response.json({ error: '邮箱找回通道尚未开通。', code: 'recovery-channel-closed' }, { status: 503 })
      const body = JSON.parse(options.body)
      if (body.code !== '246810') return Response.json({ error: '验证码不正确或已过期，请重新获取。' }, { status: 401 })
      return Response.json({ token: `site-token-u-${++issued}`, uid: 'username:reader_01', username: 'reader_01', expiresAt: Date.now() + 60_000 })
    }
    if (url === '/api/auth/username/recovery-email') {
      const body = JSON.parse(options.body)
      if (body.password !== 'correct-horse-9') return Response.json({ error: '当前密码不正确。' }, { status: 401 })
      boundEmail = body.recoveryEmail
      return Response.json(boundEmail
        ? { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen }
        : { hasRecoveryEmail: false, maskedRecoveryEmail: null, channelOpen })
    }
    if (url === '/api/auth/email/signout') return Response.json({ ok: true })
    if (url === '/api/account') {
      const token = options.headers.Authorization?.replace('Bearer ', '')
      if (!token?.startsWith('site-token-u')) return Response.json({ error: 'revoked' }, { status: 401 })
      return Response.json(accountPayload())
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

test('registration sends the recovery email only when one was actually provided', async () => {
  const { client, calls } = fixture()
  await client.start()
  await client.registerWithUsername('reader_01', 'correct-horse-9', '  Alice@Gmail.com ')
  const withEmail = calls.find((call) => call.url === '/api/auth/username/register')
  assert.deepEqual(JSON.parse(withEmail.options.body), { username: 'reader_01', password: 'correct-horse-9', recoveryEmail: 'Alice@Gmail.com' })
  // The confirmed user carries the masked recovery state from /api/account.
  const user = client.getSnapshot().user
  assert.equal(user.hasRecoveryEmail, true)
  assert.equal(user.recoveryEmailMasked, 'a***@gmail.com')
  client.stop()

  const plain = fixture()
  await plain.client.start()
  await plain.client.registerWithUsername('reader_01', 'correct-horse-9')
  const withoutEmail = plain.calls.find((call) => call.url === '/api/auth/username/register')
  assert.deepEqual(JSON.parse(withoutEmail.options.body), { username: 'reader_01', password: 'correct-horse-9' })
  assert.equal(plain.client.getSnapshot().user.hasRecoveryEmail, false)
  plain.client.stop()
})

test('recovery status is parsed into the masked shape the panel renders', async () => {
  const { client } = fixture()
  await client.start()
  await client.registerWithUsername('reader_01', 'correct-horse-9', 'alice@gmail.com')
  const status = await client.usernameRecoveryStatus('reader_01')
  assert.deepEqual(status, { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen: false })
  client.stop()
})

test('a closed channel surfaces its own message, never a generic config error', async () => {
  const { client } = fixture({ channelOpen: false })
  await client.start()
  await assert.rejects(client.usernameRecoveryStart('reader_01'), (error) => {
    assert.equal(error.code, 'auth/recovery-channel-closed')
    assert.equal(error.message, '邮箱找回通道尚未开通。')
    return true
  })
  await assert.rejects(client.usernameRecoveryReset('reader_01', '246810', 'brand-new-pass-9'), (error) => {
    assert.equal(error.code, 'auth/recovery-channel-closed')
    return true
  })
  client.stop()
})

test('an open channel resets the password, signs in, and rejects a wrong code plainly', async () => {
  const { client, store } = fixture({ channelOpen: true })
  await client.start()
  await client.registerWithUsername('reader_01', 'correct-horse-9', 'alice@gmail.com')
  await client.usernameRecoveryStart('reader_01')
  await assert.rejects(client.usernameRecoveryReset('reader_01', '000000', 'brand-new-pass-9'), (error) => {
    assert.equal(error.code, 'auth/invalid-code')
    assert.equal(error.message, '验证码不正确或已过期，请重新获取。')
    return true
  })
  const user = await client.usernameRecoveryReset('reader_01', '246810', 'brand-new-pass-9')
  assert.equal(user.uid, 'username:reader_01')
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.match(client.getSnapshot().notice, /密码已重设/)
  assert.ok(JSON.parse(store.value).token.startsWith('site-token-u'))
  client.stop()
})

test('binding from settings demands the current password and resyncs the snapshot', async () => {
  const { client, calls } = fixture()
  await client.start()
  await client.registerWithUsername('reader_01', 'correct-horse-9')
  assert.equal(client.getSnapshot().user.hasRecoveryEmail, false)
  await assert.rejects(client.setRecoveryEmail('wrong-password-9', 'alice@gmail.com'), (error) => {
    assert.equal(error.code, 'auth/recovery-password')
    assert.equal(error.message, '当前密码不正确，请重试。')
    return true
  })
  const result = await client.setRecoveryEmail('correct-horse-9', 'alice@gmail.com')
  assert.deepEqual(result, { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen: false })
  const bindCall = calls.find((call) => call.url === '/api/auth/username/recovery-email')
  assert.match(bindCall.options.headers.Authorization, /^Bearer site-token-u/)
  assert.equal(client.getSnapshot().user.hasRecoveryEmail, true)
  assert.equal(client.getSnapshot().user.recoveryEmailMasked, 'a***@gmail.com')
  assert.match(client.getSnapshot().notice, /恢复邮箱已保存/)
  // Unbinding sends an explicit null and flips the snapshot back.
  await client.setRecoveryEmail('correct-horse-9', null)
  assert.equal(client.getSnapshot().user.hasRecoveryEmail, false)
  client.stop()
})
