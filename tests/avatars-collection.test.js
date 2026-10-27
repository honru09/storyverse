import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PNG } from 'pngjs'
import { buildAvatarPrompt, createAvatarService } from '../server/avatar.js'
import {
  collectionFromRecord,
  createMemoryAvatarStore,
  imageSlotFor,
  mainAvatarFromRecord,
} from '../server/avatar-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createServer } from '../server/index.js'
import { acceptChapter, buildChapter, chapterKey, chooseBranch, createStory } from '../src/story-engine.js'

// Multi-avatar batch (PERSONA-QA F-27 + F-28): the per-account collection,
// legacy single-avatar migration, per-avatar painting slots, main swaps,
// deletion degradation, and the repaint lock at the request level.

const identity = { uid: 'user-multi-1', email: null, displayName: '多化身测试', emailVerified: false, provider: 'username' }

function tinyPng(seed = 0) {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 200 - seed
    png.data[index + 1] = 120
    png.data[index + 2] = 60
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

const profile = (overrides = {}) => ({
  name: '林晚舟',
  description: '清冷安静的剑客。',
  appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
  ...overrides,
})

function fakeService(overrides = {}) {
  const store = createMemoryAvatarStore()
  const calls = []
  const service = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123', AVATAR_DAILY_LIMIT: '50' },
    store,
    imageGenerate: async (prompt, reference) => {
      calls.push({ prompt, reference })
      return { buffer: tinyPng(calls.length), mimeType: 'image/png', usage: null }
    },
    ...overrides,
  })
  return { service, store, calls }
}

test('collectionFromRecord migrates a legacy single-avatar record in memory', () => {
  const legacy = { uid: identity.uid, avatar: { id: 'avatar-old', name: '旧识' } }
  const collection = collectionFromRecord(legacy)
  assert.equal(collection.mainId, 'avatar-old')
  assert.equal(collection.avatars.length, 1)
  assert.equal(mainAvatarFromRecord(legacy).name, '旧识')
  assert.equal(collectionFromRecord(null), null)
  assert.equal(collectionFromRecord({ uid: identity.uid }), null)
  assert.deepEqual(collectionFromRecord({ uid: identity.uid, avatars: [], mainId: null }), { mainId: null, avatars: [] })
  // Slot rule: main keeps the historic slots, everyone else their own.
  assert.equal(imageSlotFor(collection, 'avatar-old', 'current'), 'current')
  assert.equal(imageSlotFor(collection, 'avatar-other', 'current'), 'avatar-other:current')
  assert.equal(imageSlotFor(collection, 'avatar-other', 'previous'), 'avatar-other:previous')
})

test('a legacy account lists its single avatar as the main avatar, portrait intact', async () => {
  const { service, store } = fakeService()
  const legacyAvatar = {
    id: 'avatar-legacy1',
    name: '沈砚',
    description: '山里来的年轻人。',
    appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'coat', shoes: 'boots', face: 'none', faceNote: '' },
    portrait: { status: 'ready', version: 1, hasPrevious: false },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
  await store.putProfile(identity.uid, { uid: identity.uid, avatar: legacyAvatar })
  await store.putImage(identity.uid, 'current', {
    uid: identity.uid, slot: 'current', version: 1, contentType: 'image/jpeg',
    image: Buffer.from('legacy-painting').toString('base64'), bytes: 15,
  })
  const list = await service.list(identity)
  assert.equal(list.avatars.length, 1)
  assert.equal(list.mainId, 'avatar-legacy1')
  assert.equal((await service.get(identity)).name, '沈砚')
  const image = await service.fetchImage(identity, 'current')
  assert.equal(image.buffer.toString(), 'legacy-painting', 'the legacy painting still serves from the historic slot')
  // The stored record was NOT rewritten by the reads (migration is lazy).
  const raw = await store.getProfile(identity.uid)
  assert.equal(raw.avatars, undefined)
})

test('create adds avatars up to the cap and the first one becomes main', async () => {
  const { service } = fakeService()
  const first = await service.create(identity, { profile: profile() })
  const second = await service.create(identity, { profile: profile({ name: '阿灿' }) })
  assert.notEqual(first.id, second.id)
  let list = await service.list(identity)
  assert.equal(list.avatars.length, 2)
  assert.equal(list.mainId, first.id)
  for (let index = 0; index < 8; index += 1) {
    await service.create(identity, { profile: profile({ name: `第${index + 3}位` }) })
  }
  list = await service.list(identity)
  assert.equal(list.avatars.length, 10)
  await assert.rejects(
    service.create(identity, { profile: profile({ name: '第十一位' }) }),
    (error) => error.status === 400 && /最多 10 位/.test(error.message),
  )
})

test('painting targets one avatar: its own slots, its own reference, others untouched', async () => {
  const { service, calls } = fakeService()
  const a = await service.create(identity, { profile: profile() })
  const b = await service.create(identity, { profile: profile({ name: '阿灿' }) })
  const paintedA = await service.generate(identity, { avatarId: a.id })
  assert.equal(paintedA.avatar.portrait.status, 'ready')
  const paintedB = await service.generate(identity, { avatarId: b.id })
  assert.equal(paintedB.avatar.portrait.version, 1)
  const imageA = await service.fetchImage(identity, 'current', a.id)
  const imageB = await service.fetchImage(identity, 'current', b.id)
  assert.ok(imageA && imageB)
  assert.notDeepEqual(imageA.buffer, imageB.buffer, 'each avatar keeps its own painting')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].reference, null, 'B’s first painting had NO reference (its own slot was empty) even though A already had one')
})

test('setMain swaps the paintings so the main slots always hold the main avatar', async () => {
  const { service, store, calls } = fakeService()
  const a = await service.create(identity, { profile: profile() })
  const b = await service.create(identity, { profile: profile({ name: '阿灿' }) })
  await service.generate(identity, { avatarId: a.id })
  const aBytes = (await service.fetchImage(identity, 'current', a.id)).buffer
  await service.generate(identity, { avatarId: b.id })
  const bBytes = (await service.fetchImage(identity, 'current', b.id)).buffer
  assert.equal(calls.length, 2)
  assert.equal(calls[1].reference, null, 'B painted from text: its own slot had no reference yet')

  const result = await service.setMain(identity, b.id)
  assert.equal(result.mainId, b.id)
  assert.equal((await service.get(identity)).id, b.id)
  const mainImage = await store.getImage(identity.uid, 'current')
  assert.equal(
    Buffer.from(mainImage.image, 'base64').equals(bBytes), true,
    'the historic current slot now holds the new main avatar painting (public picture endpoints keep working)',
  )
  const aImage = await service.fetchImage(identity, 'current', a.id)
  assert.ok(aImage.buffer.equals(aBytes), 'the previous main keeps its painting in its own slot')

  // Repainting B now anchors on B's own painting as reference.
  await service.generate(identity, { avatarId: b.id })
  assert.ok(calls[2].reference, 'repaint of the new main references its own previous painting')
})

test('remove: non-main deletion drops only its paintings; deleting main promotes the next', async () => {
  const { service } = fakeService()
  const a = await service.create(identity, { profile: profile() })
  const b = await service.create(identity, { profile: profile({ name: '阿灿' }) })
  const c = await service.create(identity, { profile: profile({ name: '白榆' }) })
  await service.generate(identity, { avatarId: a.id })
  await service.generate(identity, { avatarId: b.id })
  const bBytes = (await service.fetchImage(identity, 'current', b.id)).buffer

  const afterNonMain = await service.remove(identity, c.id)
  assert.equal(afterNonMain.avatars.length, 2)
  assert.equal(afterNonMain.mainId, a.id)
  assert.equal(await service.fetchImage(identity, 'current', c.id), null)

  const afterMain = await service.remove(identity, a.id)
  assert.equal(afterMain.avatars.length, 1)
  assert.equal(afterMain.mainId, b.id, 'the first remaining avatar is promoted to main')
  const promoted = await service.fetchImage(identity, 'current')
  assert.ok(promoted.buffer.equals(bBytes), 'the promoted avatar painting moved into the main slots')
  assert.equal(await service.fetchImage(identity, 'current', a.id), null, 'the deleted avatar resolves to nothing')

  const empty = await service.remove(identity, b.id)
  assert.deepEqual(empty, { mainId: null, avatars: [] })
  assert.equal(await service.get(identity), null)
  await assert.rejects(service.remove(identity, b.id), (error) => error.status === 404)
})

test('save with an id edits that avatar; an unknown id is a truthful 404', async () => {
  const { service } = fakeService()
  const a = await service.create(identity, { profile: profile() })
  const b = await service.create(identity, { profile: profile({ name: '阿灿' }) })
  const renamed = await service.save(identity, { profile: { ...profile({ name: '阿灿改' }), id: b.id } })
  assert.equal(renamed.id, b.id)
  assert.equal(renamed.name, '阿灿改')
  assert.equal((await service.get(identity)).id, a.id, 'the main avatar is untouched')
  await assert.rejects(
    service.save(identity, { profile: { ...profile(), id: 'avatar-missing' } }),
    (error) => error.status === 404,
  )
})

test('buildAvatarPrompt under a lock names the one change and preserves the rest verbatim', () => {
  const locked = buildAvatarPrompt(profile({
    appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'coat', shoes: 'boots', face: 'tear-mole', faceNote: '' },
  }), { hasReference: true, lockPart: 'hairColor' })
  assert.match(locked, /REPAINT LOCK/)
  assert.match(locked, /change ONLY the hair colour \(now: silver-grey hair\)/)
  assert.match(locked, /preserved unchanged: .*a long tailored trench coat/)
  assert.match(locked, /preserved unchanged: .*tall boots/)
  assert.match(locked, /beauty mark/)
  assert.match(locked, /the reference wins/, 'on every part but the locked one, the reference wins')
  assert.ok(!locked.includes('the stated look wins.'), 'the blanket stated-look-wins line is gone under a lock')

  const free = buildAvatarPrompt(profile(), { hasReference: true })
  assert.match(free, /stated look wins/, 'an unlocked repaint keeps the original precedence')
  assert.ok(!free.includes('REPAINT LOCK'))

  const noReference = buildAvatarPrompt(profile(), { lockPart: 'hairColor' })
  assert.ok(!noReference.includes('REPAINT LOCK'), 'no reference painting, no lock')
})

test('generate with lockPart assembles the locked request for that avatar', async () => {
  const { service, calls } = fakeService()
  const a = await service.create(identity, { profile: profile() })
  await service.generate(identity, { avatarId: a.id })
  const changed = {
    ...profile(),
    id: a.id,
    appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
  }
  await service.generate(identity, { profile: changed, lockPart: 'hairColor' })
  assert.equal(calls.length, 2)
  assert.match(calls[1].prompt, /REPAINT LOCK/)
  assert.match(calls[1].prompt, /silver-grey hair/)
  assert.match(calls[1].prompt, /xianxia robes/, 'the untouched outfit descriptor is restated as preserved')
  assert.ok(calls[1].reference, 'the repaint anchors on the avatar’s own previous painting')
})

test('plaza publish accepts a line lived by a non-main avatar', async () => {
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plazaService = createPlazaService({
    env: {}, store: createMemoryPlazaStore(), avatarStore, coverStore: createMemoryCoverStore(),
  })
  const author = { uid: 'user-publish-multi', email: null, displayName: '作者', emailVerified: false, provider: 'username' }
  const main = await avatarService.create(author, { profile: profile() })
  const second = await avatarService.create(author, { profile: profile({ name: '阿灿' }) })

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
  const line = walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '阿灿',
    avatarId: second.id,
    avatarAppearance: '银灰，利落短发，现代街头，运动鞋，雀斑',
    ability: '借火一瞬',
  }), 24)
  const summary = await plazaService.publish(author, { story: line })
  assert.equal(summary.avatar.name, '阿灿', 'the snapshot names the avatar that lived the line')
  assert.notEqual(summary.avatar.name, (await avatarService.get(author)).name)
  assert.equal(main.id === second.id, false)
})

async function startAvatarServer(t) {
  const { service } = fakeService()
  const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
  const server = createServer({
    env,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    avatar: service,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return `http://127.0.0.1:${server.address().port}`
}

test('HTTP: collection routes create, list, set main, image by avatarId, delete', async (t) => {
  const base = await startAvatarServer(t)
  const origin = { Origin: 'http://localhost:5173' }
  const registered = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST', headers: { ...origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'avatars_route_user', password: 'avatars-pass-123' }),
  })
  assert.equal(registered.status, 200)
  const { token } = await registered.json()
  const auth = { ...origin, Authorization: `Bearer ${token}` }
  const json = { ...auth, 'Content-Type': 'application/json' }

  const empty = await (await fetch(`${base}/api/avatars`, { headers: auth })).json()
  assert.deepEqual(empty.avatars, [])
  assert.equal(empty.quota.limit, 50)

  const first = await (await fetch(`${base}/api/avatars`, {
    method: 'POST', headers: json, body: JSON.stringify({ profile: profile() }),
  })).json()
  assert.ok(first.avatar.id)
  const second = await (await fetch(`${base}/api/avatars`, {
    method: 'POST', headers: json, body: JSON.stringify({ profile: profile({ name: '阿灿' }) }),
  })).json()

  const generated = await fetch(`${base}/api/avatar/generate`, {
    method: 'POST', headers: json, body: JSON.stringify({ avatarId: second.avatar.id }),
  })
  assert.equal(generated.status, 200)

  const byId = await fetch(`${base}/api/avatar/image?avatarId=${second.avatar.id}`, { headers: auth })
  assert.equal(byId.status, 200, 'a non-main avatar painting serves under its own id')
  const mainImage = await fetch(`${base}/api/avatar/image`, { headers: auth })
  assert.equal(mainImage.status, 404, 'the main avatar has no painting yet')

  const promoted = await (await fetch(`${base}/api/avatars/${second.avatar.id}/main`, { method: 'POST', headers: auth })).json()
  assert.equal(promoted.mainId, second.avatar.id)
  const mainNow = await fetch(`${base}/api/avatar/image`, { headers: auth })
  assert.equal(mainNow.status, 200, 'after the swap the default image route serves the new main painting')

  const removed = await (await fetch(`${base}/api/avatars/${second.avatar.id}`, { method: 'DELETE', headers: auth })).json()
  assert.equal(removed.avatars.length, 1)
  assert.equal(removed.mainId, first.avatar.id)

  const anon = await fetch(`${base}/api/avatars`)
  assert.equal(anon.status, 401)
})
