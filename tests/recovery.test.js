import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService, maskRecoveryEmail } from '../server/username-auth.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemoryUsageStore, createUsageService } from '../server/usage.js'

const origin = 'http://localhost:5173'
const RAW_EMAIL = 'alice.wonder@gmail.com'

const closedFixture = (env = { AUTH_ENABLED: 'true' }) => {
  const store = createMemoryIdentityStore()
  const service = createUsernameAuthService({ env, store, log: () => {} })
  return { service, store }
}

const openFixture = (env = { AUTH_ENABLED: 'true' }) => {
  const store = createMemoryIdentityStore()
  const sent = []
  const mailer = {
    configured: true,
    sendCode: async () => { throw new Error('login codes are not part of this fixture') },
    sendRecoveryCode: async (to, code) => { sent.push({ to, code }) },
  }
  let clock = Date.now()
  const service = createUsernameAuthService({ env, store, mailer, now: () => clock, log: () => {} })
  return { service, store, sent, advance: (ms) => { clock += ms } }
}

test('maskRecoveryEmail exposes only the first local character and the domain', () => {
  assert.equal(maskRecoveryEmail('alice@gmail.com'), 'a***@gmail.com')
  assert.equal(maskRecoveryEmail('ab@x.co'), 'a***@x.co')
  // A one-character local part would be fully revealed by the general rule.
  assert.equal(maskRecoveryEmail('a@x.co'), '***@x.co')
  assert.equal(maskRecoveryEmail('not-an-email'), null)
  assert.equal(maskRecoveryEmail('@x.co'), null)
  assert.equal(maskRecoveryEmail('a@'), null)
  assert.equal(maskRecoveryEmail(null), null)
  assert.equal(maskRecoveryEmail(42), null)
})

test('register stores an optional recovery email, normalised, and rejects a bad shape before storage', async () => {
  const { service, store } = closedFixture()
  const session = await service.register('reader_01', 'correct-horse-9', 'ip-a', '  Alice.Wonder@Gmail.COM ')
  const record = await store.getUser('reader_01')
  assert.equal(record.recoveryEmail, 'alice.wonder@gmail.com')
  // The address itself never rides a session payload.
  assert.doesNotMatch(JSON.stringify(session), /alice\.wonder/)
  await service.register('reader_02', 'correct-horse-9', 'ip-a')
  assert.equal((await store.getUser('reader_02')).recoveryEmail, null)
  await assert.rejects(service.register('reader_03', 'correct-horse-9', 'ip-a', 'not-an-email'), (error) => {
    assert.equal(error.status, 400)
    assert.equal(error.message, '恢复邮箱格式不正确，请检查。')
    return true
  })
  assert.equal(await store.getUser('reader_03'), null)
})

test('recoveryState is uniform for unknown and unbound usernames, and masked for bound ones', async () => {
  const { service } = closedFixture()
  await service.register('bound_user', 'correct-horse-9', 'ip-a', RAW_EMAIL)
  await service.register('unbound_user', 'correct-horse-9', 'ip-a')
  const bound = await service.recoveryState('BOUND_USER')
  assert.deepEqual(bound, { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen: false })
  const unbound = await service.recoveryState('unbound_user')
  assert.deepEqual(unbound, { hasRecoveryEmail: false, maskedRecoveryEmail: null, channelOpen: false })
  // No existence oracle: unknown and malformed usernames answer identically.
  assert.deepEqual(await service.recoveryState('nobody_here'), unbound)
  assert.deepEqual(await service.recoveryState('!!bad shape!!'), unbound)
  assert.doesNotMatch(JSON.stringify(bound), /alice\.wonder/)
})

test('the public status lookup is throttled per client + username; the account-view read is not', async () => {
  const { service } = closedFixture()
  await service.register('reader_01', 'correct-horse-9', 'ip-a', RAW_EMAIL)
  for (let i = 0; i < 20; i++) await service.recoveryStatus('reader_01', 'ip-a')
  await assert.rejects(service.recoveryStatus('reader_01', 'ip-a'), (error) => error.status === 429)
  // Another client, and the unthrottled internal read, are unaffected.
  assert.equal((await service.recoveryStatus('reader_01', 'ip-b')).hasRecoveryEmail, true)
  assert.equal((await service.recoveryState('reader_01')).hasRecoveryEmail, true)
})

test('while the mail switch is off, code endpoints refuse with the explicit business code — never a fake send', async () => {
  const { service } = closedFixture()
  assert.equal(service.recoveryEnabled, false)
  await service.register('reader_01', 'correct-horse-9', 'ip-a', RAW_EMAIL)
  for (const attempt of [() => service.requestRecoveryCode('reader_01', 'ip-a'), () => service.resetPasswordWithCode('reader_01', '123456', 'brand-new-pass-9', 'ip-a')]) {
    await assert.rejects(attempt(), (error) => {
      assert.equal(error.status, 503)
      assert.equal(error.code, 'recovery-channel-closed')
      assert.equal(error.message, '邮箱找回通道尚未开通。')
      return true
    })
  }
  // The operator opt-out closes the channel even when SMTP is configured.
  const optedOut = createUsernameAuthService({
    env: { AUTH_ENABLED: 'true', EMAIL_CODE_ENABLED: 'false' },
    store: createMemoryIdentityStore(),
    mailer: { configured: true, sendRecoveryCode: async () => {} },
    log: () => {},
  })
  assert.equal(optedOut.recoveryEnabled, false)
})

test('binding works while the channel is closed, demands the current password, and supports change + unbind', async () => {
  const { service, store } = closedFixture()
  await service.register('reader_01', 'correct-horse-9', 'ip-a')
  await assert.rejects(service.setRecoveryEmail('reader_01', 'wrong-password-9', RAW_EMAIL), (error) => {
    assert.equal(error.status, 401)
    assert.equal(error.message, '当前密码不正确。')
    return true
  })
  assert.equal((await store.getUser('reader_01')).recoveryEmail, null)
  const bound = await service.setRecoveryEmail('reader_01', 'correct-horse-9', RAW_EMAIL)
  assert.deepEqual(bound, { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen: false })
  assert.equal((await store.getUser('reader_01')).recoveryEmail, RAW_EMAIL)
  const changed = await service.setRecoveryEmail('reader_01', 'correct-horse-9', 'second.box@example.org')
  assert.equal(changed.maskedRecoveryEmail, 's***@example.org')
  const cleared = await service.setRecoveryEmail('reader_01', 'correct-horse-9', '')
  assert.deepEqual(cleared, { hasRecoveryEmail: false, maskedRecoveryEmail: null, channelOpen: false })
  assert.equal((await store.getUser('reader_01')).recoveryEmail, null)
  await assert.rejects(service.setRecoveryEmail('reader_01', 'correct-horse-9', 'junk'), (error) => error.status === 400)
})

test('open channel: start answers uniformly, mails only bound accounts, and the cooldown keeps the first code', async () => {
  const { service, sent } = openFixture()
  await service.register('bound_user', 'correct-horse-9', 'ip-a', RAW_EMAIL)
  await service.register('unbound_user', 'correct-horse-9', 'ip-a')
  const answers = []
  for (const name of ['bound_user', 'unbound_user', 'nobody_here', '!!bad!!']) {
    answers.push(await service.requestRecoveryCode(name, 'ip-a'))
  }
  for (const answer of answers) assert.deepEqual(answer, { ok: true })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, RAW_EMAIL)
  assert.match(sent[0].code, /^\d{6}$/)
  // Cooldown: a second ask inside a minute sends nothing new.
  await service.requestRecoveryCode('bound_user', 'ip-a')
  assert.equal(sent.length, 1)
})

test('open channel: start requests are throttled per client and username', async () => {
  const { service } = openFixture()
  await service.register('bound_user', 'correct-horse-9', 'ip-a', RAW_EMAIL)
  for (let i = 0; i < 5; i++) await service.requestRecoveryCode('bound_user', 'ip-a')
  await assert.rejects(service.requestRecoveryCode('bound_user', 'ip-a'), (error) => error.status === 429)
  // A different username is a different bucket.
  assert.deepEqual(await service.requestRecoveryCode('someone_else', 'ip-a'), { ok: true })
})

test('open channel: the mailed code resets the password, signs in, revokes old sessions and cannot be reused', async () => {
  const { service, sent } = openFixture()
  const oldSession = await service.register('reader_01', 'correct-horse-9', 'ip-a', RAW_EMAIL)
  await service.requestRecoveryCode('reader_01', 'ip-a')
  const { code } = sent[0]
  // A wrong code and an unknown user share the one generic rejection.
  const wrong = await service.resetPasswordWithCode('reader_01', '000000' === code ? '111111' : '000000', 'brand-new-pass-9', 'ip-a').catch((error) => error)
  const unknown = await service.resetPasswordWithCode('nobody_here', code, 'brand-new-pass-9', 'ip-a').catch((error) => error)
  for (const failure of [wrong, unknown]) {
    assert.equal(failure.status, 401)
    assert.equal(failure.message, '验证码不正确或已过期，请重新获取。')
  }
  // A short new password is refused before the code is consumed.
  await assert.rejects(service.resetPasswordWithCode('reader_01', code, 'short', 'ip-a'), (error) => error.status === 400)
  const session = await service.resetPasswordWithCode('reader_01', code, 'brand-new-pass-9', 'ip-a')
  assert.equal(session.uid, 'username:reader_01')
  assert.doesNotMatch(JSON.stringify(session), /alice\.wonder|passwordHash|salt/)
  // The pre-reset session is revoked; the new password works, the old does not.
  assert.equal(await service.resolveSession(oldSession.token), null)
  assert.ok(await service.resolveSession(session.token))
  await assert.rejects(service.login('reader_01', 'correct-horse-9', 'ip-a'), (error) => error.status === 401)
  assert.equal((await service.login('reader_01', 'brand-new-pass-9', 'ip-a')).uid, 'username:reader_01')
  await assert.rejects(service.resetPasswordWithCode('reader_01', code, 'another-pass-9', 'ip-a'), (error) => error.status === 401)
})

test('open channel: five wrong attempts burn the code and an expired code is refused', async () => {
  const { service, sent, advance } = openFixture()
  await service.register('reader_01', 'correct-horse-9', 'ip-a', RAW_EMAIL)
  await service.requestRecoveryCode('reader_01', 'ip-a')
  const first = sent[0].code
  const wrongCode = first === '000000' ? '111111' : '000000'
  for (let i = 0; i < 5; i++) {
    await assert.rejects(service.resetPasswordWithCode('reader_01', wrongCode, 'brand-new-pass-9', 'ip-a'), (error) => error.status === 401)
  }
  await assert.rejects(service.resetPasswordWithCode('reader_01', first, 'brand-new-pass-9', 'ip-a'), (error) => error.status === 401)
  // Past the cooldown a fresh code can be issued, and it dies with its TTL.
  advance(61_000)
  await service.requestRecoveryCode('reader_01', 'ip-a')
  assert.equal(sent.length, 2)
  advance(10 * 60 * 1000 + 1)
  await assert.rejects(service.resetPasswordWithCode('reader_01', sent[1].code, 'brand-new-pass-9', 'ip-a'), (error) => error.status === 401)
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

const postJson = (base, path, body, headers = {}) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

test('recovery works end to end over HTTP with the channel closed: bind at register, masked account state, no leaks', async (t) => {
  const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
  const auth = createAuthService({ env, usageService: createUsageService({ env: {}, store: createMemoryUsageStore() }) })
  const { base } = await serve(t, { env, auth })

  const registered = await postJson(base, '/api/auth/username/register', { username: 'reader_01', password: 'correct-horse-9', recoveryEmail: RAW_EMAIL })
  assert.equal(registered.status, 200)
  const session = await registered.json()
  assert.doesNotMatch(JSON.stringify(session), /alice\.wonder/)

  const accountResponse = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })
  assert.equal(accountResponse.status, 200)
  const accountRaw = await accountResponse.text()
  assert.doesNotMatch(accountRaw, /alice\.wonder/)
  const account = JSON.parse(accountRaw)
  assert.deepEqual(account.recovery, { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen: false })

  // Status: bound answers masked + closed; unknown and unbound are identical.
  const status = await (await postJson(base, '/api/auth/username/recovery/status', { username: 'reader_01' })).json()
  assert.deepEqual(status, { hasRecoveryEmail: true, maskedRecoveryEmail: 'a***@gmail.com', channelOpen: false })
  await postJson(base, '/api/auth/username/register', { username: 'reader_02', password: 'correct-horse-9' })
  const unboundStatus = await (await postJson(base, '/api/auth/username/recovery/status', { username: 'reader_02' })).json()
  const unknownStatus = await (await postJson(base, '/api/auth/username/recovery/status', { username: 'nobody_here' })).json()
  assert.deepEqual(unknownStatus, unboundStatus)

  // Closed channel: start and reset refuse with the machine-readable code.
  const start = await postJson(base, '/api/auth/username/recovery/start', { username: 'reader_01' })
  assert.equal(start.status, 503)
  const startBody = await start.json()
  assert.equal(startBody.code, 'recovery-channel-closed')
  assert.equal(startBody.error, '邮箱找回通道尚未开通。')
  const reset = await postJson(base, '/api/auth/username/recovery/reset', { username: 'reader_01', code: '123456', newPassword: 'brand-new-pass-9' })
  assert.equal(reset.status, 503)
  assert.equal((await reset.json()).code, 'recovery-channel-closed')

  // Binding over HTTP needs the account session and the current password.
  const anonymous = await postJson(base, '/api/auth/username/recovery-email', { password: 'correct-horse-9', recoveryEmail: 'second.box@example.org' })
  assert.equal(anonymous.status, 401)
  const wrongPassword = await postJson(base, '/api/auth/username/recovery-email', { password: 'wrong-password-9', recoveryEmail: 'second.box@example.org' }, { Authorization: `Bearer ${session.token}` })
  assert.equal(wrongPassword.status, 401)
  assert.equal((await wrongPassword.json()).error, '当前密码不正确。')
  const changed = await postJson(base, '/api/auth/username/recovery-email', { password: 'correct-horse-9', recoveryEmail: 'second.box@example.org' }, { Authorization: `Bearer ${session.token}` })
  assert.equal(changed.status, 200)
  const changedBody = await changed.json()
  assert.deepEqual(changedBody, { hasRecoveryEmail: true, maskedRecoveryEmail: 's***@example.org', channelOpen: false })
  assert.doesNotMatch(JSON.stringify(changedBody), /second\.box/)
  const accountAfter = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })).json()
  assert.equal(accountAfter.recovery.maskedRecoveryEmail, 's***@example.org')
})

test('public surfaces never reference the recovery address field', () => {
  // Plaza / social / avatar payloads are built from their own stores and
  // never read the identity record; pin that structurally so a future
  // refactor cannot quietly start serialising the account record.
  for (const file of ['server/plaza.js', 'server/social.js', 'server/plaza-store.js', 'server/social-store.js', 'server/avatar.js', 'server/library.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /recoveryEmail/, `${file} must not touch recoveryEmail`)
  }
})
