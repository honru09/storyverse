import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PNG } from 'pngjs'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createSocialService, PRESENCE_WINDOW_MS } from '../server/social.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createAuthService } from '../server/auth.js'
import { createServer } from '../server/index.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createStory,
} from '../src/story-engine.js'

function tinyPng() {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 200
    png.data[index + 1] = 120
    png.data[index + 2] = 60
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    current = acceptChapter(current, chapter, chapterKey(current, index))
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, chapter.choice.options[0].id)
    }
  }
  return current
}

function completedLine(avatarId) {
  const story = walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    avatarId,
    avatarAppearance: '银灰长发，左颊一颗泪痣',
    ability: '借火一瞬',
  }), 24)
  return { ...story, engine: 'gemini' }
}

async function startSocialServer(t) {
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plazaStore = createMemoryPlazaStore()
  const coverStore = createMemoryCoverStore()
  const plazaService = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
  const socialService = createSocialService({
    env: {},
    store: createMemorySocialStore(),
    plazaStore,
    avatarStore,
    coverStore,
  })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    avatar: avatarService,
    plaza: plazaService,
    social: socialService,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, coverStore }
}

const ORIGIN = { Origin: 'http://localhost:5173' }

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'social-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

async function makeAvatar(base, token, name = '沈砚') {
  const response = await fetch(`${base}/api/avatar`, {
    method: 'PUT',
    headers: { ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: {
        name,
        description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(response.status, 200, 'avatar save')
  return (await response.json()).avatar
}

const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function publishLine(base, token, avatarId) {
  const response = await fetch(`${base}/api/plaza/publish`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({ story: completedLine(avatarId) }),
  })
  assert.equal(response.status, 200, 'publish')
  return (await response.json()).publication
}

test('profile payload: identity, avatar, counts, worlds, publications — and no private fields', async (t) => {
  const { base } = await startSocialServer(t)
  const author = await register(base, 'social_author')
  const avatar = await makeAvatar(base, author.token)
  await publishLine(base, author.token, avatar.id)

  // Portrait is 404 until painted, then served publicly under the profile.
  const before = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/portrait`)
  assert.equal(before.status, 404)
  const generated = await fetch(`${base}/api/avatar/generate`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({}),
  })
  assert.equal(generated.status, 200)
  const portrait = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/portrait`)
  assert.equal(portrait.status, 200)
  assert.equal(portrait.headers.get('content-type'), 'image/jpeg')

  const response = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/profile`)
  assert.equal(response.status, 200)
  const { profile } = await response.json()
  assert.equal(profile.uid, author.uid)
  assert.equal(profile.displayName, 'social_author', 'username accounts resolve their name from the uid itself')
  assert.equal(profile.handle, 'social_author')
  assert.equal(profile.avatar.name, '沈砚')
  assert.equal(profile.avatar.description, '清冷安静的剑客。')
  assert.match(profile.avatar.appearance, /银灰/)
  assert.equal(profile.avatar.hasPortrait, true)
  assert.equal(profile.avatar.portraitUrl, `/api/users/${encodeURIComponent(author.uid)}/portrait`)
  assert.deepEqual(profile.counts, { works: 1, following: 0, followers: 0, publications: 1 })
  assert.deepEqual(profile.worlds, [{ worldId: 'cultivation', name: '青岚宗', coverRef: '/art/cultivation-640.webp' }])
  assert.equal(profile.publications.length, 1)
  assert.equal(profile.publications[0].authorUid, author.uid)
  assert.equal(profile.publications[0].avatar.hasPortrait, true, 'publication portrait readiness follows the live profile')
  assert.deepEqual(profile.viewerState, { isSelf: false, isFollowing: false, friendState: 'none' })

  const text = JSON.stringify(profile)
  for (const forbidden of ['email', 'passwordHash', 'salt', 'reporters', 'hiddenReason']) {
    assert.equal(text.includes(forbidden), false, `profile payload must not contain ${forbidden}`)
  }

  const missing = await fetch(`${base}/api/users/no-such-user-123/profile`)
  assert.equal(missing.status, 404)

  // The plaza payloads now carry the author uid the profile links need.
  const feed = (await (await fetch(`${base}/api/store`)).json())
  assert.equal(feed.books[0].authorUid, author.uid)
  const detail = (await (await fetch(`${base}/api/plaza/${feed.books[0].id}`)).json()).publication
  assert.equal(detail.authorUid, author.uid)
})

test('profile enrichment: avatar collection, per-avatar portraits, currentWorld (§35)', async (t) => {
  const { base } = await startSocialServer(t)
  const author = await register(base, 'social_enrich_author')
  const main = await makeAvatar(base, author.token, '沈砚')
  // A second avatar joins the collection and gets its own painting.
  const created = await fetch(`${base}/api/avatars`, {
    method: 'POST', headers: authed(author.token),
    body: JSON.stringify({
      profile: {
        name: '雾银',
        description: '沉默的同行者。',
        appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'traveler-cloak', shoes: 'cloth-shoes', face: 'none', faceNote: '' },
      },
    }),
  })
  assert.equal(created.status, 200, 'second avatar created')
  const second = (await created.json()).avatar
  assert.ok(second?.id && second.id !== main.id)
  for (const avatarId of [undefined, second.id]) {
    const generated = await fetch(`${base}/api/avatar/generate`, {
      method: 'POST', headers: authed(author.token),
      body: JSON.stringify(avatarId ? { avatarId } : {}),
    })
    assert.equal(generated.status, 200, `generate ${avatarId || 'main'}`)
  }
  await publishLine(base, author.token, main.id)

  const { profile } = await (await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/profile`)).json()
  assert.equal(profile.counts.works, 1, 'works counts the public lines server-side')
  assert.equal(profile.avatars.length, 2, 'the whole collection rides the payload')
  const [mainRow, secondRow] = profile.avatars
  assert.equal(mainRow.id, main.id)
  assert.equal(mainRow.isMain, true)
  assert.equal(mainRow.hasPortrait, true)
  assert.match(mainRow.portraitUrl, new RegExp(`avatar=${encodeURIComponent(main.id)}&v=`), 'per-avatar portrait URL carries the avatar id')
  assert.equal(mainRow.currentWorld, '青岚宗', 'residence derives from the newest public line that avatar walked')
  assert.equal(secondRow.id, second.id)
  assert.equal(secondRow.isMain, false)
  assert.equal(secondRow.hasPortrait, true)
  assert.equal(secondRow.currentWorld, undefined, 'an avatar with no public line has no residence — omitted, not invented')

  // Each collection painting is served under its own id; a bogus id 404s.
  const mainImage = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/portrait?avatar=${encodeURIComponent(main.id)}`)
  assert.equal(mainImage.status, 200)
  const secondImage = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/portrait?avatar=${encodeURIComponent(second.id)}`)
  assert.equal(secondImage.status, 200)
  const bogus = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/portrait?avatar=no-such-avatar`)
  assert.equal(bogus.status, 404, 'an unknown avatar id never falls back to the main painting')
  // The bare route still serves the main painting (existing surfaces).
  const bare = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/portrait`)
  assert.equal(bare.status, 200)
})

test('profile publications carry each story’s own cover URL once one is painted', async (t) => {
  const { base, coverStore } = await startSocialServer(t)
  const author = await register(base, 'social_cover_author')
  const avatar = await makeAvatar(base, author.token)
  const story = completedLine(avatar.id)
  const publishResponse = await fetch(`${base}/api/plaza/publish`, {
    method: 'POST',
    headers: authed(author.token),
    body: JSON.stringify({ story }),
  })
  assert.equal(publishResponse.status, 200, 'publish')

  const profileBefore = (await (await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/profile`)).json()).profile
  assert.equal(profileBefore.publications[0].coverUrl, null, 'no cover yet — the bookshelf keeps the world artwork')

  const coverBytes = tinyPng()
  await coverStore.putCover(author.uid, story.id, {
    uid: author.uid,
    storyId: story.id,
    version: 1,
    contentType: 'image/png',
    image: coverBytes.toString('base64'),
    bytes: coverBytes.length,
    model: 'fixture',
    updatedAt: new Date().toISOString(),
  })
  const profileAfter = (await (await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/profile`)).json()).profile
  assert.match(profileAfter.publications[0].coverUrl, /^\/api\/plaza\/pub-[^/]+\/cover\?v=1$/,
    'the profile payload resolves the same live cover URL as the plaza feed')
})

test('follow / unfollow: idempotent, self-follow rejected, counts and viewer state move', async (t) => {
  const { base } = await startSocialServer(t)
  const author = await register(base, 'social_followee')
  const avatar = await makeAvatar(base, author.token)
  await publishLine(base, author.token, avatar.id)
  const reader = await register(base, 'social_follower')
  await makeAvatar(base, reader.token, '林晚舟')

  const follow = (token, uid) => fetch(`${base}/api/users/${encodeURIComponent(uid)}/follow`, {
    method: 'POST', headers: authed(token), body: '{}',
  })
  const unfollow = (token, uid) => fetch(`${base}/api/users/${encodeURIComponent(uid)}/unfollow`, {
    method: 'POST', headers: authed(token), body: '{}',
  })
  const profileOf = async (uid, token) => {
    const response = await fetch(`${base}/api/users/${encodeURIComponent(uid)}/profile`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    assert.equal(response.status, 200)
    return (await response.json()).profile
  }

  const anon = await fetch(`${base}/api/users/${encodeURIComponent(author.uid)}/follow`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(anon.status, 401)
  assert.equal((await anon.json()).code, 'auth-required')

  const self = await follow(author.token, author.uid)
  assert.equal(self.status, 400)
  assert.match((await self.json()).error, /不能关注自己/)

  const ghost = await follow(reader.token, 'firebase-ghost-uid')
  assert.equal(ghost.status, 404)

  const first = await follow(reader.token, author.uid)
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { following: true, followers: 1 })
  const again = await follow(reader.token, author.uid)
  assert.deepEqual(await again.json(), { following: true, followers: 1 }, 'a repeat follow does not double-count')

  const seenByReader = await profileOf(author.uid, reader.token)
  assert.equal(seenByReader.counts.followers, 1)
  assert.equal(seenByReader.viewerState.isFollowing, true)
  const readerProfile = await profileOf(reader.uid, author.token)
  assert.equal(readerProfile.counts.following, 1, 'the reader’s own following count moved')
  assert.equal(readerProfile.counts.followers, 0, 'a follow is one-directional until returned')
  const authorProfile = await profileOf(author.uid, author.token)
  assert.equal(authorProfile.viewerState.isSelf, true)
  assert.equal(authorProfile.counts.publications, 1)

  const back = await follow(author.token, reader.uid)
  assert.equal(back.status, 200, 'following back a real (avatar-holding) user works')
  assert.equal((await profileOf(reader.uid, null)).counts.followers, 1)
  assert.equal((await profileOf(author.uid, null)).counts.following, 1)

  const un = await unfollow(reader.token, author.uid)
  assert.deepEqual(await un.json(), { following: false, followers: 0 })
  const unAgain = await unfollow(reader.token, author.uid)
  assert.deepEqual(await unAgain.json(), { following: false, followers: 0 }, 'a repeat unfollow is a no-op')
  assert.equal((await profileOf(author.uid, reader.token)).viewerState.isFollowing, false)
})

test('presence: the 90-second window, counted on the service clock and in the plaza feed', async (t) => {
  // Service level with an injected clock — the window edge is exact.
  let at = 1_700_000_000_000
  const service = createSocialService({
    env: {},
    store: createMemorySocialStore(),
    plazaStore: createMemoryPlazaStore(),
    avatarStore: createMemoryAvatarStore(),
    now: () => at,
  })
  assert.equal(await service.onlineCount(), 0)
  await service.heartbeat({ uid: 'reader-a' })
  await service.heartbeat({ uid: 'reader-b' })
  assert.equal(await service.onlineCount(), 2)
  at += PRESENCE_WINDOW_MS - 1_000 // 89 s later: still inside the window
  assert.equal(await service.onlineCount(), 2)
  await service.heartbeat({ uid: 'reader-a' })
  at += 2_000 // 91 s after reader-b's last stamp, 2 s after reader-a's refresh
  assert.equal(await service.onlineCount(), 1)
  at += PRESENCE_WINDOW_MS
  assert.equal(await service.onlineCount(), 0)

  // HTTP level: heartbeats require login; the plaza stream carries the count.
  const { base } = await startSocialServer(t)
  const feedBefore = await (await fetch(`${base}/api/plaza`)).json()
  assert.equal(feedBefore.onlineCount, 0)
  const anonBeat = await fetch(`${base}/api/presence/heartbeat`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(anonBeat.status, 401)
  const reader = await register(base, 'social_present')
  const beat = await fetch(`${base}/api/presence/heartbeat`, {
    method: 'POST', headers: authed(reader.token), body: '{}',
  })
  assert.equal(beat.status, 200)
  const feedAfter = await (await fetch(`${base}/api/plaza`)).json()
  assert.equal(feedAfter.onlineCount, 1)
})

test('connections: the name-list behind the counts, with viewer follow state (PROFILE-FIX C3)', async (t) => {
  const { base } = await startSocialServer(t)
  const author = await register(base, 'conn_author')
  const fan = await register(base, 'conn_fan')
  const third = await register(base, 'conn_third')
  const authorAvatar = await makeAvatar(base, author.token, '陆青禾')
  await publishLine(base, author.token, authorAvatar.id)
  for (const who of [fan, third]) {
    const response = await fetch(`${base}/api/users/${author.uid}/follow`, { method: 'POST', headers: authed(who.token), body: '{}' })
    assert.equal(response.status, 200, 'follow lands')
  }
  // The author's follower list: resolved names, newest first, and the
  // viewer's own follow state rides each row.
  const asThird = await (await fetch(`${base}/api/users/${author.uid}/connections?kind=followers`, { headers: authed(third.token) })).json()
  assert.equal(asThird.kind, 'followers')
  assert.equal(asThird.total, 2)
  assert.deepEqual(asThird.people.map((person) => person.uid).sort(), [fan.uid, third.uid].sort())
  const fanRow = asThird.people.find((person) => person.uid === fan.uid)
  assert.equal(fanRow.isFollowing, false, 'third does not follow fan')
  assert.equal(fanRow.isSelf, false)
  const selfRow = asThird.people.find((person) => person.uid === third.uid)
  assert.equal(selfRow.isSelf, true)
  assert.ok(selfRow.displayName, 'rows carry a resolved public name')
  assert.ok(selfRow.picture?.url, 'rows carry a picture')
  assert.ok(!JSON.stringify(asThird).includes('@'), 'no email-shaped value leaks into the list')
  // The fan's following list points back at the author, flagged as followed.
  const fanFollowing = await (await fetch(`${base}/api/users/${fan.uid}/connections?kind=following`, { headers: authed(fan.token) })).json()
  assert.equal(fanFollowing.total, 1)
  assert.equal(fanFollowing.people[0].uid, author.uid)
  assert.equal(fanFollowing.people[0].isFollowing, true)
  assert.equal(fanFollowing.people[0].displayName, 'conn_author', 'identity resolves through the same layers as the profile payload (username accounts present their username)')
  // Anonymous readers get the public list without viewer state.
  const anon = await (await fetch(`${base}/api/users/${author.uid}/connections?kind=followers`)).json()
  assert.equal(anon.total, 2)
  assert.ok(anon.people.every((person) => person.isFollowing === false && person.isSelf === false))
  // A ghost has no list.
  const ghost = await fetch(`${base}/api/users/username%3Aghost/connections?kind=followers`)
  assert.equal(ghost.status, 404)
})

/**
 * ACCOUNT-POLISH §5 fixture: the auth service and the social service
 * share one identity store, exactly the way production shares the
 * `site_users` collection — so a registration is visible to the
 * profile endpoint as an account, footprint or not.
 */
async function startAccountOnlyServer(t) {
  const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
  const identityStore = createMemoryIdentityStore()
  const usernameAuth = createUsernameAuthService({ env, store: identityStore })
  const authService = createAuthService({ env, usernameAuth })
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plazaStore = createMemoryPlazaStore()
  const coverStore = createMemoryCoverStore()
  const plazaService = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
  const socialService = createSocialService({
    env,
    store: createMemorySocialStore(),
    plazaStore,
    avatarStore,
    coverStore,
    identityStore,
  })
  const server = createServer({
    env,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    auth: authService,
    avatar: avatarService,
    plaza: plazaService,
    social: socialService,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}` }
}

test('a registered account with no avatar and no publications still has a profile page', async (t) => {
  const { base } = await startAccountOnlyServer(t)
  const fresh = await register(base, 'fresh_face')
  // No avatar created, nothing published, no profile record saved: the
  // account itself is the existence proof, so the deep link opens an
  // honestly empty page instead of the old footprint-based 404.
  const response = await fetch(`${base}/api/users/${encodeURIComponent(fresh.uid)}/profile`)
  assert.equal(response.status, 200)
  const { profile } = await response.json()
  assert.equal(profile.uid, fresh.uid)
  assert.equal(profile.displayName, 'fresh_face', 'username accounts present their username')
  assert.equal(profile.handle, 'fresh_face')
  assert.equal(profile.avatar, null, 'no avatar record: the showcase stays absent, never fabricated')
  assert.deepEqual(profile.picture, { kind: 'default', url: '/default-avatar.svg' })
  assert.deepEqual(profile.counts, { works: 0, following: 0, followers: 0, publications: 0 })
  assert.deepEqual(profile.publications, [])
  assert.deepEqual(profile.worlds, [])
  // A username that was never registered is still a 404, as is any
  // other unknown uid.
  const ghost = await fetch(`${base}/api/users/username%3Aghost_user/profile`)
  assert.equal(ghost.status, 404)
  const missing = await fetch(`${base}/api/users/no-such-user-123/profile`)
  assert.equal(missing.status, 404)
})
