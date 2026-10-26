import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthClient } from '../src/auth/client.js'

const config = { enabled: true, providers: { google: true, email: true }, storage: 'local', firebase: { apiKey: 'public-key', authDomain: 'fixture.firebaseapp.com', projectId: 'fixture', appId: 'fixture-app' } }
const disabled = { enabled: false, providers: { google: false, email: false }, firebase: null, storage: 'local' }

const deferred = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const profile = { uid: 'reader-1', email: 'reader@example.com', displayName: '读者', emailVerified: false }

function fixture({ account, sdkOverrides = {}, initialUser = null, getConfig = () => config } = {}) {
  const auth = { currentUser: initialUser }
  const observers = new Set()
  const events = []
  const emit = (user) => { auth.currentUser = user; for (const observer of observers) observer(user) }
  const sdk = {
    getApps: () => [], initializeApp: () => ({}), getAuth: () => auth,
    onIdTokenChanged: (_auth, callback) => { observers.add(callback); queueMicrotask(() => { if (observers.has(callback)) callback(auth.currentUser) }); return () => observers.delete(callback) },
    GoogleAuthProvider: class {},
    signInWithPopup: async () => { emit({ ...profile }); return { user: auth.currentUser } },
    createUserWithEmailAndPassword: async () => { emit({ ...profile }); return { user: auth.currentUser } },
    signInWithEmailAndPassword: async () => { emit({ ...profile }); return { user: auth.currentUser } },
    getIdToken: async (_user, forceRefresh) => { events.push(forceRefresh ? 'refresh-token' : 'token'); return 'fixture-token' },
    sendEmailVerification: async () => { events.push('verification-email') },
    sendPasswordResetEmail: async () => { events.push('reset-email') },
    reload: async (user) => { user.emailVerified = true; events.push('reload') },
    signOut: async () => emit(null),
    ...sdkOverrides,
  }
  const fetchImpl = async (url, options) => {
    if (url === '/api/auth/config') return Response.json(getConfig())
    assert.equal(url, '/api/account')
    assert.equal(options.headers.Authorization, 'Bearer fixture-token')
    events.push('account')
    return account ? account() : Response.json({ user: { ...profile, emailVerified: auth.currentUser.emailVerified }, storage: 'local', entitlements: null, subscription: null })
  }
  const client = createAuthClient({ fetchImpl, loadSdk: async () => sdk })
  return { client, emit, auth, events, observers }
}

test('disabled or unreachable configuration stays unavailable without loading Firebase', async () => {
  for (const fetchImpl of [async () => Response.json(disabled), async () => { throw new Error('private-network-detail') }, async () => Response.json({ error: 'secret' }, { status: 503 })]) {
    const client = createAuthClient({ fetchImpl, loadSdk: () => { throw new Error('SDK must not load') } })
    await client.start()
    assert.equal(client.getSnapshot().status, 'unavailable')
    assert.equal(client.getSnapshot().user, null)
    assert.doesNotMatch(client.getSnapshot().error || '', /private-network-detail|secret|SDK must/)
    client.stop()
  }
})

test('Google authentication waits for the server identity check before becoming authenticated', async () => {
  const reply = deferred()
  const { client } = fixture({ account: () => reply.promise })
  await client.start()
  assert.equal(client.getSnapshot().status, 'guest')
  const login = client.signInWithGoogle()
  await new Promise((resolve) => setImmediate(resolve))
  assert.notEqual(client.getSnapshot().status, 'authenticated')
  assert.equal(client.getSnapshot().user, null)
  reply.resolve(Response.json({ user: profile }))
  await login
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.deepEqual(client.getSnapshot().user, { ...profile, provider: 'firebase' })
  assert.equal(await client.getIdToken(), 'fixture-token')
  await client.signOut()
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(client.getSnapshot().user, null)
  client.stop()
})

test('email registration sends verification and refresh reads server-confirmed email status', async () => {
  const { client, events } = fixture()
  await client.start()
  await client.register(' reader@example.com ', 'correct-horse-battery')
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.equal(client.getSnapshot().user.emailVerified, false)
  assert.ok(events.includes('verification-email'))
  await client.sendVerification()
  await client.refreshUser()
  assert.equal(client.getSnapshot().user.emailVerified, true)
  assert.ok(events.includes('reload'))
  assert.ok(events.includes('refresh-token'))
  await client.signOut()
  await client.resetPassword('reader@example.com')
  assert.match(client.getSnapshot().notice, /如果.*重置/)
  await client.signIn('reader@example.com', 'correct-horse-battery')
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.doesNotMatch(JSON.stringify(client.getSnapshot()), /correct-horse-battery|fixture-token/)
  client.stop()
})

test('starting two auth operations before initialization still allows only one operation', async () => {
  const popup = deferred()
  let requested = false
  const { client } = fixture({ sdkOverrides: { signInWithPopup: () => {
    if (requested) throw new Error('second-popup-must-not-open')
    requested = true
    return popup.promise
  } } })
  const first = client.signInWithGoogle()
  try {
    await assert.rejects(client.signInWithGoogle(), { code: 'auth/busy' })
  } finally {
    popup.reject({ code: 'auth/popup-closed-by-user' })
    await assert.rejects(first, { code: 'auth/cancelled' })
    client.stop()
  }
})

test('cancelling Google popup returns to guest without a fake success or raw SDK error', async () => {
  const { client } = fixture({ sdkOverrides: { signInWithPopup: async () => { throw { code: 'auth/popup-closed-by-user', message: 'private-google-details' } } } })
  await client.start()
  await assert.rejects(client.signInWithGoogle(), { code: 'auth/cancelled', message: '已取消登录，你仍可继续本机阅读。' })
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(client.getSnapshot().error, null)
  assert.equal(client.getSnapshot().busy, false)
  client.stop()
})

test('API failure, invalid identity and malformed JSON never produce an authenticated snapshot', async () => {
  for (const account of [
    () => Response.json({ error: 'private-api-details' }, { status: 503 }),
    () => Response.json({ error: 'private-token-details' }, { status: 401 }),
    () => Response.json({ user: { ...profile, uid: 'someone-else' } }),
    () => new Response('not-json'),
    () => { throw new Error('private-network-details') },
  ]) {
    const { client } = fixture({ account })
    await client.start()
    await assert.rejects(client.signIn('reader@example.com', 'password-123'))
    assert.equal(client.getSnapshot().status, 'error')
    assert.equal(client.getSnapshot().user, null)
    assert.doesNotMatch(client.getSnapshot().error, /private-|not-json/)
    await assert.rejects(client.getIdToken(), { code: 'auth/session-invalid' })
    client.stop()
  }
})

test('a previously signed-in user is not presented as verified while the account API is unavailable', async () => {
  const { client } = fixture({ initialUser: { ...profile }, account: () => Response.json({}, { status: 503 }) })
  await client.start()
  assert.equal(client.getSnapshot().status, 'error')
  assert.equal(client.getSnapshot().user, null)
  client.stop()
})

test('stop removes the session observer and late account responses cannot resurrect a session', async () => {
  const reply = deferred()
  const { client, observers, emit } = fixture({ account: () => reply.promise })
  await client.start()
  let updates = 0
  const unsubscribe = client.subscribe(() => updates++)
  const pending = client.signInWithGoogle()
  await new Promise((resolve) => setImmediate(resolve))
  unsubscribe()
  client.stop()
  assert.equal(observers.size, 0)
  const stoppedAt = updates
  reply.resolve(Response.json({ user: profile }))
  await assert.rejects(pending, { code: 'auth/cancelled' })
  emit({ ...profile })
  assert.equal(updates, stoppedAt)
  assert.notEqual(client.getSnapshot().status, 'authenticated')
  assert.equal(client.getSnapshot().user, null)
  await client.start()
  assert.equal(observers.size, 1)
  client.stop()
})

test('password reset uses a non-enumerating success message for unknown accounts', async () => {
  const { client } = fixture({ sdkOverrides: { sendPasswordResetEmail: async () => { throw { code: 'auth/user-not-found' } } } })
  await client.start()
  await client.resetPassword('unknown@example.com')
  assert.match(client.getSnapshot().notice, /如果.*重置/)
  assert.equal(client.getSnapshot().status, 'guest')
  client.stop()
})

test('failed validation-email delivery is not described as sent or as failed account creation', async () => {
  const { client } = fixture({ sdkOverrides: { sendEmailVerification: async () => { throw { code: 'auth/network-request-failed' } } } })
  await client.start()
  await client.register('reader@example.com', 'password-123')
  assert.equal(client.getSnapshot().status, 'authenticated')
  assert.equal(client.getSnapshot().user.emailVerified, false)
  assert.match(client.getSnapshot().notice, /账号已创建.*尚未发出/)
  client.stop()
})

test('unsubscribed UI does not receive session changes and external sign-out clears the verified user', async () => {
  const { client, emit } = fixture()
  await client.start()
  await client.signInWithGoogle()
  let updates = 0
  const unsubscribe = client.subscribe(() => updates++)
  unsubscribe()
  emit(null)
  assert.equal(client.getSnapshot().status, 'guest')
  assert.equal(client.getSnapshot().user, null)
  assert.equal(updates, 0)
  client.stop()
})

test('restarting after configuration becomes unavailable cannot reuse the previous ready session', async () => {
  let available = true
  const { client } = fixture({ getConfig: () => available ? config : disabled })
  await client.start()
  await client.signInWithGoogle()
  assert.equal(client.getSnapshot().status, 'authenticated')
  client.stop()
  available = false
  await client.start()
  await assert.rejects(client.signInWithGoogle(), { code: 'auth/unavailable' })
  assert.equal(client.getSnapshot().status, 'unavailable')
  client.stop()
})

test('email verification status comes from the account API, never an unchecked SDK field', async () => {
  const { client, auth } = fixture({ account: () => Response.json({ user: { ...profile, emailVerified: false } }) })
  await client.start()
  await client.signIn('reader@example.com', 'password-123')
  await client.refreshUser()
  assert.equal(auth.currentUser.emailVerified, true)
  assert.equal(client.getSnapshot().user.emailVerified, false)
  client.stop()
})

test('successful registration followed by backend failure clearly explains that the account was created', async () => {
  const { client } = fixture({ account: () => Response.json({}, { status: 503 }) })
  await client.start()
  await assert.rejects(client.register('reader@example.com', 'password-123'), { code: 'auth/account-unavailable' })
  assert.equal(client.getSnapshot().status, 'error')
  assert.equal(client.getSnapshot().user, null)
  assert.match(client.getSnapshot().notice, /账号已创建.*确认/)
  client.stop()
})
