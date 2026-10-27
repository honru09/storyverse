import test from 'node:test'
import assert from 'node:assert/strict'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createSocialService, publicDisplayName, publicHandle } from '../server/social.js'
import { plazaAuthorNameFor } from '../server/plaza.js'

// Real-data identity shapes: accounts that arrived by email (Firebase
// email sign-in or the email-code channel) carry an email and NO name
// until the owner sets one. The profile title must resolve through the
// avatar's name to the neutral label — the address itself is a
// credential, never a public name. These tests pin that chain.

const APPEARANCE = {
  hairColor: 'silver', hairStyle: 'long-straight', outfit: 'street-hoodie',
  shoes: 'sneakers', face: 'bright-smile', faceNote: '',
}

function makeServices() {
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => { throw new Error('unused') },
  })
  const socialStore = createMemorySocialStore()
  const plazaStore = createMemoryPlazaStore()
  const social = createSocialService({
    env: {},
    store: socialStore,
    plazaStore,
    avatarStore,
    coverStore: createMemoryCoverStore(),
  })
  return { avatarService, socialStore, plazaStore, social }
}

async function makeAvatar(avatarService, identity, name = '阿灿', description = '笑起来很亮的街头少年。') {
  await avatarService.save(identity, {
    profile: { name, description, appearance: APPEARANCE },
  })
}

test('publicDisplayName: first non-email candidate wins, else the neutral label', () => {
  assert.equal(publicDisplayName(['夜航船主', '阿灿']), '夜航船主')
  assert.equal(publicDisplayName(['', '阿灿']), '阿灿')
  assert.equal(publicDisplayName(['boss@qq.com', '阿灿']), '阿灿')
  assert.equal(publicDisplayName(['boss@qq.com', '']), '未命名旅人')
  assert.equal(publicDisplayName([null, undefined]), '未命名旅人')
  assert.equal(publicDisplayName(['  ', ' 沈砚 ']), '沈砚')
})

test('publicHandle: an email-shaped handle is no handle', () => {
  assert.equal(publicHandle('night_sail'), 'night_sail')
  assert.equal(publicHandle('boss@qq.com'), '')
  assert.equal(publicHandle(''), '')
  assert.equal(publicHandle(null), '')
})

test('plazaAuthorNameFor: an identity email is never an author name', () => {
  assert.equal(plazaAuthorNameFor({ displayName: '沈砚', email: 'a@b.com' }), '沈砚')
  assert.equal(plazaAuthorNameFor({ displayName: null, email: 'a@b.com' }), '')
  assert.equal(plazaAuthorNameFor({ displayName: 'a@b.com', email: 'a@b.com' }), '')
  assert.equal(plazaAuthorNameFor({}), '')
})

test('profile: email-signup owner with an avatar is titled by the avatar name', async () => {
  const { avatarService, social } = makeServices()
  const identity = { uid: 'em_abc123', email: '2066647277@qq.com', displayName: null, provider: 'email-code' }
  await makeAvatar(avatarService, identity)
  const payload = await social.profile(identity, identity.uid)
  assert.equal(payload.displayName, '阿灿')
  assert.equal(payload.handle, '')
  assert.ok(!payload.displayName.includes('@'))
  assert.ok(!JSON.stringify(payload).includes('2066647277@qq.com'), 'the email must not appear anywhere in the payload')
})

test('profile: an email-shaped identity name is skipped for the avatar name', async () => {
  const { avatarService, social } = makeServices()
  const identity = { uid: 'firebase-uid-9', email: 'boss@qq.com', displayName: 'boss@qq.com', provider: 'firebase' }
  await makeAvatar(avatarService, identity, '沈砚')
  const payload = await social.profile(identity, identity.uid)
  assert.equal(payload.displayName, '沈砚')
  assert.equal(payload.handle, '')
})

test('profile: an owner with nothing set renders the neutral label', async () => {
  const { social } = makeServices()
  const identity = { uid: 'em_blank', email: 'blank@qq.com', displayName: null, provider: 'email-code' }
  const payload = await social.profile(identity, identity.uid)
  assert.equal(payload.displayName, '未命名旅人')
  assert.equal(payload.handle, '')
  assert.equal(payload.avatar, null)
})

test('profile: an email-shaped STORED display name falls back to the avatar name', async () => {
  const { avatarService, socialStore, social } = makeServices()
  const identity = { uid: 'em_stored', email: 'stored@qq.com', displayName: null, provider: 'email-code' }
  await makeAvatar(avatarService, identity, '阿灿')
  await socialStore.putProfileRecord({
    uid: identity.uid, displayName: 'stored@qq.com', handle: 'stored@qq.com',
    pictureKind: null, pictureVersion: 0, updatedAt: new Date().toISOString(),
  })
  const payload = await social.profile(identity, identity.uid)
  assert.equal(payload.displayName, '阿灿')
  assert.equal(payload.handle, '', 'an email-shaped stored handle renders no handle line')
})

test('profile: a deliberate display name and handle still win over the avatar', async () => {
  const { avatarService, socialStore, social } = makeServices()
  const identity = { uid: 'em_named', email: 'named@qq.com', displayName: null, provider: 'email-code' }
  await makeAvatar(avatarService, identity, '阿灿')
  await socialStore.putProfileRecord({
    uid: identity.uid, displayName: '夜航船主', handle: 'night_sail',
    pictureKind: null, pictureVersion: 0, updatedAt: new Date().toISOString(),
  })
  const payload = await social.profile(identity, identity.uid)
  assert.equal(payload.displayName, '夜航船主')
  assert.equal(payload.handle, 'night_sail')
})

test('profile: a legacy publication whose stored author name is an email is re-resolved', async () => {
  const { avatarService, plazaStore, social } = makeServices()
  const author = { uid: 'em_legacy', email: 'legacy@qq.com', displayName: null, provider: 'email-code' }
  await makeAvatar(avatarService, author, '阿灿')
  await plazaStore.putPublication({
    id: 'pub-legacy-1',
    authorUid: author.uid,
    authorName: 'legacy@qq.com',
    sourceStoryId: 'story-legacy-1',
    title: '借火登天',
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    worldName: '青岚宗',
    storyLengthMode: 'season',
    seasonNumber: 1,
    chapterCount: 24,
    totalChapters: 24,
    status: 'published',
    publishedAt: '2026-10-20T00:00:00.000Z',
    avatar: { name: '阿灿', appearance: '银灰长发', hasPortrait: false },
    snapshot: { worldBible: { premise: '山神破庙' } },
  })
  const viewer = { uid: 'em_viewer', email: 'viewer@qq.com', displayName: null, provider: 'email-code' }
  const payload = await social.profile(viewer, author.uid)
  assert.equal(payload.displayName, '阿灿')
  assert.equal(payload.publications.length, 1)
  assert.equal(payload.publications[0].authorName, '阿灿')
  assert.ok(!JSON.stringify(payload).includes('legacy@qq.com'))
})

test('profile: username accounts keep their name-as-handle identity', async () => {
  const { social } = makeServices()
  const identity = { uid: 'username:night_sail', email: null, displayName: 'night_sail', provider: 'username' }
  const payload = await social.profile(identity, identity.uid)
  assert.equal(payload.displayName, 'night_sail')
  assert.equal(payload.handle, 'night_sail')
})
