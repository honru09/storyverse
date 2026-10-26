import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CODE_TTL_MS, MAX_CODE_ATTEMPTS, RESEND_COOLDOWN_MS, SESSION_TTL_MS, createEmailCodeService, emailCodeUid,
} from '../server/email-code.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'

function fixture() {
  let at = 1_700_000_000_000
  const sent = []
  const service = createEmailCodeService({
    env: {},
    store: createMemoryIdentityStore(),
    mailer: { configured: true, sendCode: async (to, code) => { sent.push({ to, code }) } },
    now: () => at,
    log: () => {},
  })
  return { service, sent, advance: (ms) => { at += ms }, now: () => at }
}

test('email code lifecycle: send, verify, stable uid and session identity', async () => {
  const { service, sent, now } = fixture()
  assert.equal(service.enabled, true)
  assert.deepEqual(await service.start(' Reader@Example.com '), { ok: true })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'reader@example.com')
  assert.match(sent[0].code, /^\d{6}$/)
  const result = await service.verify('reader@example.com', sent[0].code)
  assert.equal(result.uid, emailCodeUid('reader@example.com'))
  assert.match(result.uid, /^em_[0-9a-f]{32}$/)
  assert.equal(result.email, 'reader@example.com')
  assert.equal(result.expiresAt, now() + SESSION_TTL_MS)
  assert.deepEqual(await service.resolveSession(result.token), {
    uid: result.uid, email: 'reader@example.com', displayName: null, emailVerified: true, provider: 'email-code',
  })
  // The code is single-use.
  await assert.rejects(service.verify('reader@example.com', sent[0].code), { status: 401 })
})

test('start responses never reveal whether an email is known, and cooldown keeps the first code valid', async () => {
  const { service, sent, advance } = fixture()
  const first = await service.start('new@example.com')
  const again = await service.start('new@example.com')
  assert.deepEqual(first, again)
  assert.equal(sent.length, 1, 'no second mail inside the cooldown')
  advance(RESEND_COOLDOWN_MS + 1)
  await service.start('new@example.com')
  assert.equal(sent.length, 2, 'a fresh code is sent after the cooldown')
  await assert.rejects(service.verify('new@example.com', sent[0].code), { status: 401 })
  const session = await service.verify('new@example.com', sent[1].code)
  assert.equal(session.email, 'new@example.com')
})

test('codes expire after ten minutes and sessions after thirty days', async () => {
  const { service, sent, advance } = fixture()
  await service.start('timer@example.com')
  const code = sent[0].code
  advance(CODE_TTL_MS + 1)
  await assert.rejects(service.verify('timer@example.com', code), { status: 401, message: /验证码不正确或已过期/ })
  await service.start('timer@example.com')
  const session = await service.verify('timer@example.com', sent[1].code)
  advance(SESSION_TTL_MS + 1)
  assert.equal(await service.resolveSession(session.token), null)
})

test('five wrong attempts burn the code, including for the right code afterwards', async () => {
  const { service, sent } = fixture()
  await service.start('attempts@example.com')
  const right = sent[0].code
  const wrong = right === '000000' ? '000001' : '000000'
  for (let index = 0; index < MAX_CODE_ATTEMPTS; index++) {
    await assert.rejects(service.verify('attempts@example.com', wrong), { status: 401 })
  }
  await assert.rejects(service.verify('attempts@example.com', right), { status: 401 })
})

test('unknown emails and malformed codes get the same generic rejection', async () => {
  const { service } = fixture()
  await assert.rejects(service.verify('ghost@example.com', '123456'), { status: 401, message: /验证码不正确或已过期/ })
  await assert.rejects(service.verify('ghost@example.com', '12ab56'), { status: 401 })
  await assert.rejects(service.verify('not-an-email', '123456'), { status: 401 })
})

test('revoked sessions no longer resolve, and start validates the address shape', async () => {
  const { service, sent } = fixture()
  await assert.rejects(service.start('not-an-email'), { status: 400 })
  await service.start('bye@example.com')
  const session = await service.verify('bye@example.com', sent[0].code)
  await service.revokeSession(session.token)
  assert.equal(await service.resolveSession(session.token), null)
  assert.deepEqual(await service.revokeSession('never-issued'), { ok: true })
})

test('an unconfigured channel refuses safely instead of pretending to send', async () => {
  const service = createEmailCodeService({ env: {}, store: null, mailer: { configured: false, sendCode: async () => { throw new Error('must not send') } }, log: () => {} })
  assert.equal(service.enabled, false)
  await assert.rejects(service.start('reader@example.com'), { status: 503, message: /尚未配置/ })
  await assert.rejects(service.verify('reader@example.com', '123456'), { status: 503, message: /尚未配置/ })
  assert.equal(await service.resolveSession('anything'), null)
})

test('store failures surface as a safe temporary-unavailable error', async () => {
  const broken = {
    getCode: async () => { throw new Error('private store detail') },
    putCode: async () => {}, deleteCode: async () => {},
    getSession: async () => { throw new Error('private store detail') },
    putSession: async () => {}, deleteSession: async () => {},
  }
  const service = createEmailCodeService({ env: {}, store: broken, mailer: { configured: true, sendCode: async () => {} }, log: () => {} })
  await assert.rejects(service.start('reader@example.com'), (error) => {
    assert.equal(error.status, 503)
    assert.doesNotMatch(error.message, /private store detail/)
    return true
  })
  assert.equal(await service.resolveSession('token'), null)
})
