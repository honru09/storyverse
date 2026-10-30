import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'

import {
  avatarCollectionSignature,
  createAvatar,
  generateAvatar,
} from '../src/avatar.js'
import {
  clearProfileCache,
  loadProfile,
  peekProfile,
  subscribeProfile,
} from '../src/profile-cache.js'

// REQ-58: a freshly created avatar never appeared on the owner's own
// profile tab. The server chain was never at fault (first test below):
// creation writes the collection record and the profile payload reads
// the same record. The break was client-side — the profile tab is a
// keep-alive view fed by the profile cache, and nothing ever asked
// that cache to revalidate after an avatar mutation, so the tab kept
// rendering the pre-creation payload for the whole session.

const identity = { uid: 'user-req58', email: null, displayName: 'REQ58 测试', emailVerified: false, provider: 'username' }

function tinyPng() {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 200; png.data[index + 1] = 120; png.data[index + 2] = 60; png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

function serverPair() {
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123', AVATAR_DAILY_LIMIT: '50' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const social = createSocialService({
    env: {},
    store: createMemorySocialStore(),
    plazaStore: createMemoryPlazaStore(),
    avatarStore,
  })
  return { avatarService, social }
}

test('server chain is sound: a second created avatar is in the profile payload at once', async () => {
  const { avatarService, social } = serverPair()
  const first = await avatarService.create(identity, { profile: { name: '阿灿', description: '笑起来很亮的街头少年。' } })
  await avatarService.generate(identity, { profile: first, avatarId: first.id })
  let payload = await social.profile(identity, identity.uid)
  assert.deepEqual(payload.avatars.map((item) => item.name), ['阿灿'])
  assert.equal(payload.avatars[0].isMain, true)

  const second = await avatarService.create(identity, { profile: { name: '沈砚', description: '性子沉静，出手却比谁都快。' } })
  assert.ok(second.id)
  payload = await social.profile(identity, identity.uid)
  assert.deepEqual(payload.avatars.map((item) => item.name), ['阿灿', '沈砚'],
    'the profile payload reads the same collection record creation writes')
  assert.deepEqual(payload.avatars.map((item) => item.isMain), [true, false])
})

test('legacy single-avatar profile records still surface their one avatar', async () => {
  const avatarStore = createMemoryAvatarStore()
  await avatarStore.putProfile(identity.uid, {
    uid: identity.uid,
    avatar: { id: 'avatar-legacy', name: '旧识', description: '老档案里的化身。', portrait: { status: 'none', version: 0, hasPrevious: false } },
  })
  const social = createSocialService({
    env: {},
    store: createMemorySocialStore(),
    plazaStore: createMemoryPlazaStore(),
    avatarStore,
  })
  const payload = await social.profile(identity, identity.uid)
  assert.deepEqual(payload.avatars.map((item) => item.name), ['旧识'])
  assert.equal(payload.avatars[0].isMain, true)
})

test('avatarCollectionSignature tracks exactly the changes the profile tab must hear about', () => {
  const base = [
    { id: 'avatar-1', name: '阿灿', portrait: { status: 'ready', version: 1, hasPrevious: false } },
  ]
  const signature = avatarCollectionSignature(base, 'avatar-1')
  // Identical content behind a fresh array identity must NOT retrigger:
  // the avatar hook rebuilds its list on every refresh.
  assert.equal(avatarCollectionSignature(base.map((item) => ({ ...item })), 'avatar-1'), signature)
  // A new avatar changes it.
  const grown = [...base, { id: 'avatar-2', name: '沈砚', portrait: { status: 'none', version: 0, hasPrevious: false } }]
  assert.notEqual(avatarCollectionSignature(grown, 'avatar-1'), signature)
  // A main-avatar switch changes it.
  assert.notEqual(avatarCollectionSignature(grown, 'avatar-2'), avatarCollectionSignature(grown, 'avatar-1'))
  // A repaint landing (portrait state/version) changes it.
  const repainted = [{ ...base[0], portrait: { status: 'ready', version: 2, hasPrevious: true } }]
  assert.notEqual(avatarCollectionSignature(repainted, 'avatar-1'), signature)
  // A rename changes it.
  assert.notEqual(avatarCollectionSignature([{ ...base[0], name: '阿灿改' }], 'avatar-1'), signature)
  // Empty / malformed input stays a stable empty signature.
  assert.equal(avatarCollectionSignature([], null), avatarCollectionSignature(null, undefined))
})

// A fake same-origin backend for the client modules: the profile
// endpoint derives its payload from the avatar collection, exactly
// like production (server/social.js reads the avatar store).
function fakeClientBackend() {
  const state = {
    avatars: [{
      id: 'avatar-1', name: '阿灿', description: '笑起来很亮的街头少年。',
      portrait: { status: 'ready', version: 1, hasPrevious: false },
    }],
    mainId: 'avatar-1',
    next: 2,
  }
  const json = (body) => ({ ok: true, status: 200, json: async () => body })
  const summary = (item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    appearance: item.description,
    isMain: item.id === state.mainId,
    hasPortrait: item.portrait?.status === 'ready',
  })
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET'
    if (url.endsWith('/profile') && url.includes('/api/users/')) {
      return json({
        profile: {
          uid: 'user-req58',
          displayName: 'REQ58 测试',
          avatar: summary(state.avatars.find((item) => item.id === state.mainId)),
          avatars: state.avatars.map(summary),
          counts: { works: 0, following: 0, followers: 0, publications: 0 },
          publications: [],
          viewerState: { isSelf: true, isFollowing: false, friendState: 'none' },
        },
      })
    }
    if (url === '/api/avatars' && method === 'GET') {
      return json({ avatars: state.avatars, mainId: state.mainId, quota: { used: 0, limit: 3 } })
    }
    if (url === '/api/avatars' && method === 'POST') {
      const { profile } = JSON.parse(options.body)
      const avatar = { ...profile, id: `avatar-${state.next}`, portrait: { status: 'none', version: 0, hasPrevious: false } }
      state.next += 1
      state.avatars.push(avatar)
      return json({ avatar })
    }
    if (url === '/api/avatar/generate' && method === 'POST') {
      const { avatarId } = JSON.parse(options.body)
      const avatar = state.avatars.find((item) => item.id === avatarId)
      avatar.portrait = { status: 'ready', version: 1, hasPrevious: false }
      return json({ avatar })
    }
    throw new Error(`fake backend: unhandled ${method} ${url}`)
  }
  return { state, fetchImpl }
}

test('REQ-58 chain: creation alone never reaches the profile cache; the wired revalidation delivers it', async () => {
  clearProfileCache()
  const { state, fetchImpl } = fakeClientBackend()
  const getAccessToken = async () => 'token'
  const viewerUid = 'user-req58'

  // App start: the idle prefetch fills the profile cache (main.jsx).
  await loadProfile({ viewerUid, uid: viewerUid, getAccessToken, fetchImpl })
  // The keep-alive profile tab subscribes once, at its first mount.
  const seen = []
  const unsubscribe = subscribeProfile({ viewerUid, uid: viewerUid }, (profile) => seen.push(profile))
  assert.deepEqual(peekProfile({ viewerUid, uid: viewerUid }).avatars.map((item) => item.name), ['阿灿'])

  // The avatar page creates + paints a second avatar. Its handlers
  // refresh only the avatar hook's own state — by design nothing here
  // touches the profile cache (this is the gap REQ-58 closed in App).
  const created = await createAvatar({
    profile: { name: '沈砚', description: '性子沉静，出手却比谁都快。' }, getAccessToken, fetchImpl,
  })
  await generateAvatar({
    profile: { name: '沈砚', description: '性子沉静，出手却比谁都快。', id: created.id },
    avatarId: created.id, getAccessToken, fetchImpl,
  })
  assert.equal(state.avatars.length, 2, 'the server-side collection really holds both avatars')
  assert.deepEqual(peekProfile({ viewerUid, uid: viewerUid }).avatars.map((item) => item.name), ['阿灿'],
    'without a revalidation trigger the mounted profile tab would keep the stale list all session')
  assert.equal(seen.length, 0)

  // The fix: App watches the collection signature and revalidates the
  // owner's own profile payload — the exact call the effect performs.
  // loadProfile is SWR: it returns the cached payload at once and the
  // fresher one lands via notify a beat later, so flush a tick first.
  await loadProfile({ viewerUid, uid: viewerUid, getAccessToken, fetchImpl })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(peekProfile({ viewerUid, uid: viewerUid }).avatars.map((item) => item.name), ['阿灿', '沈砚'])
  assert.equal(seen.length, 1, 'the mounted (keep-alive) profile tab is notified in place')
  assert.deepEqual(seen[0].avatars.map((item) => item.name), ['阿灿', '沈砚'])
  unsubscribe()
})

test('App revalidates the own profile payload when the avatar collection signature changes (REQ-58 wiring)', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const stateAt = main.indexOf('const avatarState = useAvatarProfile(authClient, account);')
  assert.ok(stateAt > 0)
  const wiring = main.slice(stateAt, stateAt + 1600)
  assert.match(wiring, /avatarCollectionSignature\(avatarState\.avatars, avatarState\.mainId\)/,
    'the effect keys on the collection signature')
  assert.match(wiring, /loadProfile\(\{ viewerUid, uid: viewerUid,/,
    'the effect revalidates the owner\'s own profile payload')
  assert.match(wiring, /\}, \[ownAvatarSignature, viewerUid, avatarState\.loaded, authClient\]\);/,
    'the effect is keyed so identical refreshes do not retrigger it')
})
