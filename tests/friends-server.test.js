import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createEmailCodeService } from '../server/email-code.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createSocialService } from '../server/social.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'

/**
 * FRIENDS batch: application-based friendships. Search is fuzzy over
 * public names and exact (throttled, enumeration-proof) over email;
 * requests carry one short note; accepting writes the one mutual
 * friendship record; a decline notifies nobody — it only changes the
 * state in the sender's own outgoing list. Friend events ride the
 * message centre's 互动 category.
 */

const ORIGIN = { Origin: 'http://localhost:5173' }
const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function startFriendsServer(t) {
  const identityStore = createMemoryIdentityStore()
  const sentCodes = []
  const mailer = {
    configured: true,
    sendCode: async (to, code) => { sentCodes.push({ to, code }) },
    sendRecoveryCode: async () => {},
  }
  const usernameAuth = createUsernameAuthService({
    env: { AUTH_ENABLED: 'true' },
    store: identityStore,
    mailer,
    log: () => {},
  })
  const emailCode = createEmailCodeService({
    env: {},
    store: identityStore,
    mailer,
    log: () => {},
  })
  const auth = createAuthService({ env: { AUTH_ENABLED: 'true' }, usernameAuth, emailCode })
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
    sentCodes,
    advance: (ms) => { clock += ms },
  }
}

async function register(base, username, extra = {}) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'friends-pass-123', ...extra }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

const post = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: token ? authed(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})
const get = (base, path, token) => fetch(`${base}${path}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
})
const search = async (base, token, params) => {
  const response = await get(base, `/api/users/search?${new URLSearchParams(params)}`, token)
  return { status: response.status, body: await response.json() }
}
const myFriends = async (base, token) => {
  const response = await get(base, '/api/me/friends', token)
  assert.equal(response.status, 200, 'friends payload')
  return response.json()
}
const getNotifications = async (base, token) => {
  const response = await get(base, '/api/me/notifications', token)
  assert.equal(response.status, 200, 'notifications read')
  return response.json()
}
const profileOf = async (base, token, uid) => {
  const response = await get(base, `/api/users/${encodeURIComponent(uid)}/profile`, token)
  assert.equal(response.status, 200, 'profile read')
  return (await response.json()).profile
}

test('every friend surface requires the caller’s own login', async (t) => {
  const { base } = await startFriendsServer(t)
  assert.equal((await get(base, '/api/users/search?q=ann')).status, 401)
  assert.equal((await get(base, '/api/me/friends')).status, 401)
  assert.equal((await post(base, '/api/users/username%3Aanyone/friend-request', null, {})).status, 401)
  assert.equal((await post(base, '/api/users/username%3Aanyone/friend-request/respond', null, { accept: true })).status, 401)
  assert.equal((await post(base, '/api/users/username%3Aanyone/friend-request/cancel', null, {})).status, 401)
})

test('name search is fuzzy over handles and display names, paged, and never returns the caller', async (t) => {
  const { base } = await startFriendsServer(t)
  const anna = await register(base, 'search_anna')
  const bob = await register(base, 'search_bob')
  await register(base, 'search_cora')

  // A username account is findable by its name the moment it exists.
  let result = await search(base, anna.token, { q: 'bob' })
  assert.equal(result.status, 200)
  assert.equal(result.body.mode, 'name')
  assert.deepEqual(result.body.people.map((person) => person.uid), [bob.uid])
  assert.equal(result.body.people[0].displayName, 'search_bob')
  assert.equal(result.body.people[0].friendState, 'none')

  // Fuzzy: a shared prefix finds everyone carrying it — except me.
  result = await search(base, anna.token, { q: 'search_' })
  assert.equal(result.body.total, 2)
  assert.ok(result.body.people.every((person) => person.uid !== anna.uid), 'the caller is never their own result')

  // Pagination: limit pages through the same ranked list.
  result = await search(base, anna.token, { q: 'search_', limit: '1', offset: '1' })
  assert.equal(result.body.total, 2)
  assert.equal(result.body.people.length, 1)

  // A stored profile display name is searchable too (the email
  // account below only exists publicly through its profile record).
  result = await search(base, anna.token, { q: '不存在的人' })
  assert.deepEqual(result.body.people, [])

  // An empty query is an honest empty page, not an error.
  result = await search(base, anna.token, {})
  assert.deepEqual(result.body, { mode: 'name', people: [], total: 0 })
})

test('a profile-record display name (no username account) is findable by name search', async (t) => {
  const { base, sentCodes } = await startFriendsServer(t)
  const seeker = await register(base, 'name_seeker')
  // An email-code account: no username, findable once it sets a name.
  const start = await post(base, '/api/auth/email/start', null, { email: 'hoshino@example.com' })
  assert.equal(start.status, 200)
  const code = sentCodes.find((entry) => entry.to === 'hoshino@example.com')?.code
  assert.ok(code, 'the fixture mailer received the login code')
  const verified = await post(base, '/api/auth/email/verify', null, { email: 'hoshino@example.com', code })
  assert.equal(verified.status, 200)
  const emailSession = await verified.json()
  const named = await fetch(`${base}/api/me/profile`, {
    method: 'PUT',
    headers: authed(emailSession.token),
    body: JSON.stringify({ displayName: '星野灯' }),
  })
  assert.equal(named.status, 200)

  const result = await search(base, seeker.token, { q: '星野' })
  assert.equal(result.body.people.length, 1)
  assert.equal(result.body.people[0].uid, emailSession.uid)
  assert.equal(result.body.people[0].displayName, '星野灯')
})

test('email search is exact, never echoes the address, and cannot tell a miss from a non-account', async (t) => {
  const { base } = await startFriendsServer(t)
  const seeker = await register(base, 'mail_seeker')
  const bound = await register(base, 'mail_bound', { recoveryEmail: 'bound.friend@example.com' })

  // A username account that bound the address for recovery is found
  // by it — and the address itself is nowhere in the payload.
  let result = await search(base, seeker.token, { email: 'bound.friend@example.com' })
  assert.equal(result.status, 200)
  assert.equal(result.body.mode, 'email')
  assert.deepEqual(result.body.people.map((person) => person.uid), [bound.uid])
  assert.doesNotMatch(JSON.stringify(result.body), /bound\.friend@example/, 'the address is never echoed')

  // Case and spacing do not matter — the lookup is on the normalised address.
  result = await search(base, seeker.token, { email: '  Bound.Friend@Example.COM ' })
  assert.equal(result.body.people.length, 1)

  // Unknown address, malformed address: the same empty answer.
  result = await search(base, seeker.token, { email: 'nobody@example.com' })
  assert.deepEqual(result.body, { mode: 'email', people: [], total: 0 })
  result = await search(base, seeker.token, { email: 'not-an-email' })
  assert.deepEqual(result.body, { mode: 'email', people: [], total: 0 })

  // Seeking my own bound address does not return me.
  const selfBound = await register(base, 'mail_self', { recoveryEmail: 'self.mail@example.com' })
  result = await search(base, selfBound.token, { email: 'self.mail@example.com' })
  assert.deepEqual(result.body.people, [])
})

test('email search finds an email-code account once it has a public footprint', async (t) => {
  const { base, sentCodes } = await startFriendsServer(t)
  const seeker = await register(base, 'code_seeker')
  await post(base, '/api/auth/email/start', null, { email: 'code.friend@example.com' })
  const code = sentCodes.find((entry) => entry.to === 'code.friend@example.com')?.code
  const verified = await post(base, '/api/auth/email/verify', null, { email: 'code.friend@example.com', code })
  const emailSession = await verified.json()

  // No profile, no avatar, no publication yet: honestly not findable.
  let result = await search(base, seeker.token, { email: 'code.friend@example.com' })
  assert.deepEqual(result.body.people, [])

  await fetch(`${base}/api/me/profile`, {
    method: 'PUT',
    headers: authed(emailSession.token),
    body: JSON.stringify({ displayName: '码友' }),
  })
  result = await search(base, seeker.token, { email: 'code.friend@example.com' })
  assert.equal(result.body.people.length, 1)
  assert.equal(result.body.people[0].uid, emailSession.uid)
})

test('email lookups are throttled per account', async (t) => {
  const { base } = await startFriendsServer(t)
  const seeker = await register(base, 'throttle_seeker')
  for (let index = 0; index < 10; index += 1) {
    const result = await search(base, seeker.token, { email: `probe${index}@example.com` })
    assert.equal(result.status, 200, `lookup ${index + 1} is within the budget`)
  }
  const over = await search(base, seeker.token, { email: 'probe-over@example.com' })
  assert.equal(over.status, 429)
  // Name search is a different, unthrottled surface.
  const byName = await search(base, seeker.token, { q: 'throttle' })
  assert.equal(byName.status, 200)
})

test('the request flow: note, idempotence, viewer states, and the 互动 reminder', async (t) => {
  const { base, advance } = await startFriendsServer(t)
  const aya = await register(base, 'flow_aya')
  const ben = await register(base, 'flow_ben')

  // Guards: self, stranger, over-long note.
  const selfAsk = await post(base, `/api/users/${encodeURIComponent(aya.uid)}/friend-request`, aya.token, {})
  assert.equal(selfAsk.status, 400)
  const ghost = await post(base, '/api/users/username%3Aghost_nobody/friend-request', aya.token, {})
  assert.equal(ghost.status, 404)
  const longNote = await post(base, `/api/users/${encodeURIComponent(ben.uid)}/friend-request`, aya.token, { message: '长'.repeat(51) })
  assert.equal(longNote.status, 400)

  const sent = await post(base, `/api/users/${encodeURIComponent(ben.uid)}/friend-request`, aya.token, { message: '在广场读到你的线，很喜欢。' })
  assert.equal(sent.status, 200)
  assert.deepEqual(await sent.json(), { state: 'pending-out' })

  // Sending again changes nothing — one standing request, same note.
  advance(1000)
  const resent = await post(base, `/api/users/${encodeURIComponent(ben.uid)}/friend-request`, aya.token, { message: '换一句。' })
  assert.deepEqual(await resent.json(), { state: 'pending-out' })
  let benBox = await myFriends(base, ben.token)
  assert.equal(benBox.incoming.length, 1)
  assert.equal(benBox.incoming[0].message, '在广场读到你的线，很喜欢。', 'the first note stands')
  assert.equal(benBox.incoming[0].person.uid, aya.uid)
  assert.equal(benBox.counts.incomingPending, 1)

  // The sender's outgoing list shows the standing ask.
  const ayaBox = await myFriends(base, aya.token)
  assert.equal(ayaBox.outgoing.length, 1)
  assert.equal(ayaBox.outgoing[0].status, 'pending')
  assert.equal(ayaBox.outgoing[0].person.uid, ben.uid)

  // Profile viewer states face both ways.
  assert.equal((await profileOf(base, aya.token, ben.uid)).viewerState.friendState, 'pending-out')
  assert.equal((await profileOf(base, ben.token, aya.uid)).viewerState.friendState, 'pending-in')
  assert.equal((await profileOf(base, aya.token, aya.uid)).viewerState.friendState, 'none', 'no friend state towards oneself')

  // The request lands in Ben's 互动 with the note attached.
  const payload = await getNotifications(base, ben.token)
  const item = payload.categories.activity.items.find((entry) => entry.kind === 'friend_request')
  assert.ok(item, 'friend_request item present')
  assert.equal(item.actorUid, aya.uid)
  assert.equal(item.message, '在广场读到你的线，很喜欢。')
  assert.equal(payload.categories.activity.unread, 1)

  // Search rows carry the standing state too.
  const found = await search(base, aya.token, { q: 'flow_ben' })
  assert.equal(found.body.people[0].friendState, 'pending-out')
})

test('accepting forms the mutual friendship and tells the sender through 互动', async (t) => {
  const { base, advance } = await startFriendsServer(t)
  const aya = await register(base, 'acc_aya')
  const ben = await register(base, 'acc_ben')
  await post(base, `/api/users/${encodeURIComponent(ben.uid)}/friend-request`, aya.token, {})

  advance(1000)
  const answered = await post(base, `/api/users/${encodeURIComponent(aya.uid)}/friend-request/respond`, ben.token, { accept: true })
  assert.equal(answered.status, 200)
  assert.deepEqual(await answered.json(), { state: 'friends' })

  // Both lists show each other; the request leaves both pending views.
  const ayaBox = await myFriends(base, aya.token)
  const benBox = await myFriends(base, ben.token)
  assert.deepEqual(ayaBox.friends.map((person) => person.uid), [ben.uid])
  assert.deepEqual(benBox.friends.map((person) => person.uid), [aya.uid])
  assert.equal(ayaBox.friends[0].friendState, 'friends')
  assert.equal(benBox.incoming.length, 0)
  assert.equal(ayaBox.outgoing[0].status, 'accepted')
  assert.equal((await profileOf(base, aya.token, ben.uid)).viewerState.friendState, 'friends')

  // The acceptance is an 互动 item for the sender; asking again is a no-op.
  const payload = await getNotifications(base, aya.token)
  const item = payload.categories.activity.items.find((entry) => entry.kind === 'friend_accepted')
  assert.ok(item, 'friend_accepted item present')
  assert.equal(item.actorUid, ben.uid)
  const again = await post(base, `/api/users/${encodeURIComponent(ben.uid)}/friend-request`, aya.token, {})
  assert.deepEqual(await again.json(), { state: 'friends' })
  // Re-answering the same way is idempotent; flipping it is a conflict.
  const reanswer = await post(base, `/api/users/${encodeURIComponent(aya.uid)}/friend-request/respond`, ben.token, { accept: true })
  assert.deepEqual(await reanswer.json(), { state: 'friends' })
  const flip = await post(base, `/api/users/${encodeURIComponent(aya.uid)}/friend-request/respond`, ben.token, { accept: false })
  assert.equal(flip.status, 409)
})

test('a decline notifies nobody: only the sender’s outgoing list changes state', async (t) => {
  const { base, advance } = await startFriendsServer(t)
  const aya = await register(base, 'dec_aya')
  const cora = await register(base, 'dec_cora')
  await post(base, `/api/users/${encodeURIComponent(cora.uid)}/friend-request`, aya.token, {})

  advance(1000)
  const answered = await post(base, `/api/users/${encodeURIComponent(aya.uid)}/friend-request/respond`, cora.token, { accept: false })
  assert.deepEqual(await answered.json(), { state: 'declined' })

  // Cora's centre holds nothing about it; Aya's holds no item either —
  // the only trace is the state in Aya's own outgoing list.
  const coraPayload = await getNotifications(base, cora.token)
  assert.equal(coraPayload.categories.activity.items.length, 0)
  const ayaPayload = await getNotifications(base, aya.token)
  assert.equal(ayaPayload.categories.activity.items.length, 0, 'no acceptance, no rejection item')
  const ayaBox = await myFriends(base, aya.token)
  assert.equal(ayaBox.outgoing[0].status, 'declined')
  assert.equal(ayaBox.friends.length, 0)
  assert.equal((await profileOf(base, aya.token, cora.uid)).viewerState.friendState, 'none')

  // Asking again after a decline starts a fresh pending request.
  advance(1000)
  const reask = await post(base, `/api/users/${encodeURIComponent(cora.uid)}/friend-request`, aya.token, { message: '再认识一下。' })
  assert.deepEqual(await reask.json(), { state: 'pending-out' })
  const coraBox = await myFriends(base, cora.token)
  assert.equal(coraBox.incoming.length, 1)
  assert.equal(coraBox.incoming[0].message, '再认识一下。')
})

test('cancelling withdraws the ask; asking someone who asked you completes the handshake', async (t) => {
  const { base } = await startFriendsServer(t)
  const aya = await register(base, 'can_aya')
  const dan = await register(base, 'can_dan')
  const eli = await register(base, 'can_eli')

  await post(base, `/api/users/${encodeURIComponent(dan.uid)}/friend-request`, aya.token, {})
  const cancelled = await post(base, `/api/users/${encodeURIComponent(dan.uid)}/friend-request/cancel`, aya.token, {})
  assert.deepEqual(await cancelled.json(), { state: 'none' })
  assert.equal((await myFriends(base, dan.token)).incoming.length, 0, 'a withdrawn ask stops waiting on them')
  assert.equal((await myFriends(base, aya.token)).outgoing[0].status, 'cancelled')
  // Cancelling again is a harmless state read.
  const again = await post(base, `/api/users/${encodeURIComponent(dan.uid)}/friend-request/cancel`, aya.token, {})
  assert.deepEqual(await again.json(), { state: 'none' })

  // Eli asks Aya; Aya asking back accepts the standing request.
  await post(base, `/api/users/${encodeURIComponent(aya.uid)}/friend-request`, eli.token, { message: '一起走下一条线。' })
  const back = await post(base, `/api/users/${encodeURIComponent(eli.uid)}/friend-request`, aya.token, {})
  assert.deepEqual(await back.json(), { state: 'friends' })
  assert.deepEqual((await myFriends(base, eli.token)).friends.map((person) => person.uid), [aya.uid])
  assert.equal((await myFriends(base, eli.token)).outgoing[0].status, 'accepted')

  // Answering a request that was never sent is a 404.
  const missing = await post(base, `/api/users/${encodeURIComponent(dan.uid)}/friend-request/respond`, aya.token, { accept: true })
  assert.equal(missing.status, 404)
})
