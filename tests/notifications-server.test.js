import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes, scryptSync } from 'node:crypto'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createSocialService } from '../server/social.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'

/**
 * NOTIFY-SETTINGS (§36): the message centre's three categories
 * （互动 / 公告 / 系统） are derived from real records only — follow
 * edges, official announcements, and the account events the auth
 * routes record when the action succeeds. Read state is a
 * server-side watermark per user × category.
 */

const ORIGIN = { Origin: 'http://localhost:5173' }
const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

/**
 * REQ-69: reserved names can no longer be registered over HTTP, so
 * the official account is provisioned directly in the identity
 * store (as in production, where it predates the block) and the
 * fixture signs in through the normal login route.
 */
async function seedOfficialUser(identityStore) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync('notify-pass-123', Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  await identityStore.putUser('storyweave', {
    username: 'storyweave', uid: 'username:storyweave', salt, passwordHash, recoveryEmail: null, createdAt: Date.now(),
  })
}

async function startNotifyServer(t) {
  const identityStore = createMemoryIdentityStore()
  await seedOfficialUser(identityStore)
  const sent = []
  const mailer = {
    configured: true,
    sendCode: async () => { throw new Error('login codes are not part of this fixture') },
    sendRecoveryCode: async (to, code) => { sent.push({ to, code }) },
  }
  const usernameAuth = createUsernameAuthService({
    env: { AUTH_ENABLED: 'true' },
    store: identityStore,
    mailer,
    log: () => {},
  })
  const auth = createAuthService({ env: { AUTH_ENABLED: 'true' }, usernameAuth })
  const socialStore = createMemorySocialStore()
  let clock = Date.parse('2026-10-28T00:00:00.000Z')
  const social = createSocialService({
    env: {},
    store: socialStore,
    plazaStore: createMemoryPlazaStore(),
    avatarStore: createMemoryAvatarStore(),
    coverStore: createMemoryCoverStore(),
    identityStore,
    now: () => clock,
  })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    auth,
    social,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    socialStore,
    sent,
    advance: (ms) => { clock += ms },
  }
}

async function register(base, username, extra = {}) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'notify-pass-123', ...extra }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

/** The seeded official account (see seedOfficialUser), signed in via the login route. */
async function loginOfficial(base) {
  const response = await fetch(`${base}/api/auth/username/login`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'storyweave', password: 'notify-pass-123' }),
  })
  assert.equal(response.status, 200, 'official login')
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

const getNotifications = async (base, token) => {
  const response = await fetch(`${base}/api/me/notifications`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(response.status, 200, 'notifications read')
  return response.json()
}

const post = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: token ? authed(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})

test('the message centre requires the caller’s own login', async (t) => {
  const { base } = await startNotifyServer(t)
  const anonymous = await fetch(`${base}/api/me/notifications`)
  assert.equal(anonymous.status, 401)
  const anonymousRead = await post(base, '/api/me/notifications/read', null, { category: 'activity' })
  assert.equal(anonymousRead.status, 401)
})

test('互动 aggregates real follow edges, newest first, with resolved actors', async (t) => {
  const { base, advance } = await startNotifyServer(t)
  const author = await register(base, 'notify_author')
  const fanB = await register(base, 'notify_fan_b')
  const fanC = await register(base, 'notify_fan_c')

  // Nobody has interacted with the fan: the category is honestly empty.
  const empty = await getNotifications(base, fanB.token)
  assert.deepEqual(empty.categories.activity, { unread: 0, items: [] })
  assert.equal(empty.totalUnread, 0)

  const followB = await post(base, `/api/users/${encodeURIComponent(author.uid)}/follow`, fanB.token)
  assert.equal(followB.status, 200)
  advance(1000)
  const followC = await post(base, `/api/users/${encodeURIComponent(author.uid)}/follow`, fanC.token)
  assert.equal(followC.status, 200)

  const payload = await getNotifications(base, author.token)
  const activity = payload.categories.activity
  assert.equal(activity.unread, 2)
  assert.equal(payload.totalUnread, 2)
  assert.deepEqual(activity.items.map((item) => item.kind), ['follow', 'follow'])
  assert.deepEqual(activity.items.map((item) => item.actorUid), [fanC.uid, fanB.uid], 'newest edge first')
  assert.equal(activity.items[0].displayName, 'notify_fan_c')
  assert.ok(activity.items[0].picture?.url, 'follow rows carry the face-anchored picture payload')
  assert.ok(activity.items[0].at > activity.items[1].at)
  // The other categories stay empty — nothing is invented to fill them.
  assert.deepEqual(payload.categories.announcements, { unread: 0, items: [] })
  assert.deepEqual(payload.categories.system, { unread: 0, items: [] })
})

test('read watermarks are per category: reading one never touches the others', async (t) => {
  const { base, advance } = await startNotifyServer(t)
  const author = await register(base, 'mark_author')
  const fan = await register(base, 'mark_fan')
  const official = await loginOfficial(base)
  await post(base, `/api/users/${encodeURIComponent(author.uid)}/follow`, fan.token)

  advance(1000)
  const read = await post(base, '/api/me/notifications/read', author.token, { category: 'activity' })
  assert.equal(read.status, 200)
  assert.equal((await read.json()).category, 'activity')
  let payload = await getNotifications(base, author.token)
  assert.equal(payload.categories.activity.unread, 0)
  assert.equal(payload.categories.activity.items.length, 1, 'read items stay listed; only the badge clears')

  // A new announcement is unread in ITS category; 互动 stays read.
  advance(1000)
  const published = await post(base, '/api/announcements', official.token, { title: '维护通知', body: '今晚十点短暂维护。' })
  assert.equal(published.status, 200)
  payload = await getNotifications(base, author.token)
  assert.equal(payload.categories.announcements.unread, 1)
  assert.equal(payload.categories.activity.unread, 0)
  assert.equal(payload.totalUnread, 1)

  // A new follow after the watermark is unread again; 公告 stays read
  // once its own watermark moves.
  const fan2 = await register(base, 'mark_fan_two')
  advance(1000)
  await post(base, '/api/me/notifications/read', author.token, { category: 'announcements' })
  advance(1000)
  await post(base, `/api/users/${encodeURIComponent(author.uid)}/follow`, fan2.token)
  payload = await getNotifications(base, author.token)
  assert.equal(payload.categories.activity.unread, 1)
  assert.equal(payload.categories.announcements.unread, 0)

  // A category the centre does not have is a client error, not a write.
  const bogus = await post(base, '/api/me/notifications/read', author.token, { category: 'likes' })
  assert.equal(bogus.status, 400)
})

test('a legacy follow edge without a timestamp is listed but never counts as unread', async (t) => {
  const { base, socialStore } = await startNotifyServer(t)
  const author = await register(base, 'legacy_author')
  // Edges stored before follow() stamped createdAt carry no time.
  await socialStore.putFollow({ followerUid: 'username:legacy_fan', followeeUid: author.uid })
  const payload = await getNotifications(base, author.token)
  const activity = payload.categories.activity
  assert.equal(activity.items.length, 1)
  assert.equal(activity.items[0].kind, 'follow')
  assert.equal(activity.items[0].at, null, 'no time is invented for a timeless edge')
  assert.equal(activity.items[0].displayName, 'legacy_fan')
  assert.equal(activity.unread, 0)
  assert.equal(payload.totalUnread, 0)
})

test('announcements: official-only publishing, public reading, honest validation', async (t) => {
  const { base } = await startNotifyServer(t)
  const reader = await register(base, 'ann_reader')
  const official = await loginOfficial(base)

  const before = await (await fetch(`${base}/api/announcements`)).json()
  assert.deepEqual(before, { announcements: [] }, 'no seeded announcements')

  const forbidden = await post(base, '/api/announcements', reader.token, { title: '假公告', body: '不许发。' })
  assert.equal(forbidden.status, 403)
  const anonymous = await post(base, '/api/announcements', null, { title: '假公告', body: '不许发。' })
  assert.equal(anonymous.status, 401)
  const empty = await post(base, '/api/announcements', official.token, { title: '  ', body: '正文' })
  assert.equal(empty.status, 400)

  const published = await post(base, '/api/announcements', official.token, { title: '新功能上线', body: '消息中心来了。' })
  assert.equal(published.status, 200)
  const { announcement } = await published.json()
  assert.equal(announcement.title, '新功能上线')
  assert.ok(announcement.at)

  const listed = await (await fetch(`${base}/api/announcements`)).json()
  assert.equal(listed.announcements.length, 1)
  assert.equal(listed.announcements[0].id, announcement.id)
  const payload = await getNotifications(base, reader.token)
  assert.equal(payload.categories.announcements.unread, 1)
  assert.equal(payload.categories.announcements.items[0].title, '新功能上线')
})

test('系统 records the two real account events: recovery-email changes and a password reset', async (t) => {
  const { base, sent, advance } = await startNotifyServer(t)
  const user = await register(base, 'event_user')

  // Binding a recovery email lands exactly one 系统 event.
  const bound = await post(base, '/api/auth/username/recovery-email', user.token, {
    password: 'notify-pass-123',
    recoveryEmail: 'event.user@example.com',
  })
  assert.equal(bound.status, 200)
  let payload = await getNotifications(base, user.token)
  assert.equal(payload.categories.system.unread, 1)
  assert.equal(payload.categories.system.items.length, 1)
  assert.equal(payload.categories.system.items[0].kind, 'recovery-email')
  assert.equal(payload.categories.system.items[0].detail, 'set')
  assert.doesNotMatch(JSON.stringify(payload), /event\.user@example/, 'the address itself is never in the payload')

  // Unbinding lands a second one, distinguished by detail.
  advance(1000)
  const unbound = await post(base, '/api/auth/username/recovery-email', user.token, {
    password: 'notify-pass-123',
    recoveryEmail: null,
  })
  assert.equal(unbound.status, 200)
  payload = await getNotifications(base, user.token)
  assert.equal(payload.categories.system.items.length, 2)
  assert.equal(payload.categories.system.items[0].detail, 'unbound')

  // A failed binding attempt (wrong current password) records nothing.
  const failed = await post(base, '/api/auth/username/recovery-email', user.token, {
    password: 'wrong-password-9',
    recoveryEmail: 'event.user@example.com',
  })
  assert.equal(failed.status, 401)
  payload = await getNotifications(base, user.token)
  assert.equal(payload.categories.system.items.length, 2)

  // A password reset through the mailed code lands the other kind.
  const resetter = await register(base, 'reset_user', { recoveryEmail: 'reset.user@example.com' })
  const started = await post(base, '/api/auth/username/recovery/start', null, { username: 'reset_user' })
  assert.equal(started.status, 200)
  assert.equal(sent.length, 1)
  const reset = await post(base, '/api/auth/username/recovery/reset', null, {
    username: 'reset_user',
    code: sent[0].code,
    newPassword: 'brand-new-pass-9',
  })
  assert.equal(reset.status, 200)
  const session = await reset.json()
  payload = await getNotifications(base, session.token)
  const systemKinds = payload.categories.system.items.map((item) => item.kind)
  assert.deepEqual(systemKinds, ['password-reset'])
  assert.equal(payload.categories.system.unread, 1)

  // The other account's events never leak across accounts: the first
  // user's centre still holds only their own two recovery-email events.
  const mine = await getNotifications(base, user.token)
  assert.deepEqual(
    mine.categories.system.items.map((item) => item.kind),
    ['recovery-email', 'recovery-email'],
  )
})
