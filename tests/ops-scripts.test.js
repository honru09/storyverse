import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { createMemoryAvatarStore, mainAvatarFromRecord } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createAvatarService } from '../server/avatar.js'
import { createCoverService } from '../server/cover.js'
import { createPlazaService } from '../server/plaza.js'
import { setMainPortrait, OFFICIAL_UID, POSTER_IMPORT_MODEL } from '../scripts/set-official-avatar-poster.mjs'
import { ensureOfficialCover, coverPayloadForPublication, OFFICIAL_PUBLICATION_ID } from '../scripts/generate-official-cover.mjs'

function tinyPng(width = 60, height = 80, rgb = [200, 120, 60]) {
  const png = new PNG({ width, height })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = rgb[0]
    png.data[index + 1] = rgb[1]
    png.data[index + 2] = rgb[2]
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

const silent = () => {}
const testEnv = { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' }

const officialAvatar = (overrides = {}) => ({
  id: 'avatar-shen',
  name: '沈知遥',
  description: '沉潮港的守夜人。',
  appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
  portrait: { status: 'ready', version: 3, hasPrevious: false },
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
  ...overrides,
})

const officialPublication = (overrides = {}) => ({
  id: OFFICIAL_PUBLICATION_ID,
  authorUid: OFFICIAL_UID,
  authorName: '织界官方',
  sourceStoryId: 'story-official-shen',
  title: '沉潮港纪事',
  genreId: 'suspense-supernatural',
  genreTemplateId: 'suspense-supernatural',
  worldName: '沉潮港',
  chapterCount: 24,
  status: 'published',
  avatar: { name: '沈知遥', appearance: '', hasPortrait: true },
  snapshot: {
    title: '沉潮港纪事',
    genreId: 'suspense-supernatural',
    genreTemplateId: 'suspense-supernatural',
    worldName: '沉潮港',
    config: {
      genreId: 'suspense-supernatural',
      genreTemplateId: 'suspense-supernatural',
      customWorldName: '',
      customWorldSetting: '',
    },
    worldBible: { premise: '雾锁的港口城市，潮汐带来不属于这个世界的信件。' },
    chapters: [],
  },
  ...overrides,
})

test('setMainPortrait: dry run reports the plan and writes nothing', async () => {
  const store = createMemoryAvatarStore()
  await store.putCollection(OFFICIAL_UID, { mainId: 'avatar-shen', avatars: [officialAvatar()] })
  const oldImage = tinyPng()
  await store.putImage(OFFICIAL_UID, 'current', {
    uid: OFFICIAL_UID, slot: 'current', version: 3, contentType: 'image/png',
    image: oldImage.toString('base64'), bytes: oldImage.length, model: 'gemini-2.5-flash-image', updatedAt: '2026-10-27T00:00:00.000Z',
  })

  const summary = await setMainPortrait({ store, uid: OFFICIAL_UID, buffer: tinyPng(90, 120, [40, 80, 160]), dryRun: true })
  assert.equal(summary.written, false)
  assert.equal(summary.avatarName, '沈知遥')
  assert.equal(summary.before.version, 3)
  assert.equal(summary.before.currentBytes, oldImage.length)
  assert.equal(summary.after.version, 4)
  assert.equal(summary.after.contentType, 'image/jpeg')

  const record = await store.getImage(OFFICIAL_UID, 'current')
  assert.equal(record.version, 3)
  assert.equal(record.image, oldImage.toString('base64'))
  assert.equal(await store.getImage(OFFICIAL_UID, 'previous'), null)
  assert.equal(mainAvatarFromRecord(await store.getProfile(OFFICIAL_UID)).portrait.version, 3)
})

test('setMainPortrait: writes like a repaint — rotation, version bump, profile commit — and the serving paths read it', async () => {
  const store = createMemoryAvatarStore()
  const plazaStore = createMemoryPlazaStore()
  await plazaStore.putPublication(officialPublication())
  await store.putCollection(OFFICIAL_UID, { mainId: 'avatar-shen', avatars: [officialAvatar()] })
  const oldImage = tinyPng()
  await store.putImage(OFFICIAL_UID, 'current', {
    uid: OFFICIAL_UID, slot: 'current', version: 3, contentType: 'image/png',
    image: oldImage.toString('base64'), bytes: oldImage.length, model: 'gemini-2.5-flash-image', updatedAt: '2026-10-27T00:00:00.000Z',
  })

  const summary = await setMainPortrait({ store, uid: OFFICIAL_UID, buffer: tinyPng(90, 120, [40, 80, 160]) })
  assert.equal(summary.written, true)
  assert.equal(summary.after.version, 4)
  assert.equal(summary.after.hasPrevious, true)

  // The new painting sits at 'current' in the service's own record shape.
  const current = await store.getImage(OFFICIAL_UID, 'current')
  assert.equal(current.version, 4)
  assert.equal(current.slot, 'current')
  assert.equal(current.contentType, 'image/jpeg')
  assert.equal(current.model, POSTER_IMPORT_MODEL)
  assert.equal(current.bytes, Buffer.from(current.image, 'base64').length)
  assert.notEqual(current.image, oldImage.toString('base64'))

  // The old painting rotated into 'previous', bytes untouched.
  const previous = await store.getImage(OFFICIAL_UID, 'previous')
  assert.equal(previous.slot, 'previous')
  assert.equal(previous.version, 3)
  assert.equal(previous.image, oldImage.toString('base64'))

  // The profile committed the ready state, and the legacy mirror moved with it.
  const profileRecord = await store.getProfile(OFFICIAL_UID)
  const main = mainAvatarFromRecord(profileRecord)
  assert.equal(main.portrait.status, 'ready')
  assert.equal(main.portrait.version, 4)
  assert.equal(main.portrait.hasPrevious, true)
  assert.equal(profileRecord.avatar.portrait.version, 4)

  // Read path 1: the avatar service serves the new painting as version 4.
  const avatarService = createAvatarService({ env: testEnv, store })
  const fetched = await avatarService.fetchImage({ uid: OFFICIAL_UID }, 'current')
  assert.equal(fetched.version, 4)
  assert.equal(fetched.contentType, 'image/jpeg')
  assert.equal(fetched.buffer.toString('base64'), current.image)

  // Read path 2: the plaza portrait endpoint (author's current slot) serves it too.
  const plazaService = createPlazaService({ env: {}, store: plazaStore, avatarStore: store, coverStore: createMemoryCoverStore(), socialStore: null })
  const served = await plazaService.portrait(OFFICIAL_PUBLICATION_ID)
  assert.equal(served.buffer.toString('base64'), current.image)
})

test('setMainPortrait: a first painting starts at version 1 with nothing to rotate', async () => {
  const store = createMemoryAvatarStore()
  await store.putCollection(OFFICIAL_UID, {
    mainId: 'avatar-shen',
    avatars: [officialAvatar({ portrait: { status: 'none', version: 0, hasPrevious: false } })],
  })
  const summary = await setMainPortrait({ store, uid: OFFICIAL_UID, buffer: tinyPng() })
  assert.equal(summary.before.currentBytes, null)
  assert.equal(summary.after.version, 1)
  assert.equal(summary.after.hasPrevious, false)
  assert.equal(await store.getImage(OFFICIAL_UID, 'previous'), null)
  assert.equal(mainAvatarFromRecord(await store.getProfile(OFFICIAL_UID)).portrait.version, 1)
})

test('coverPayloadForPublication mirrors the client payload from the snapshot alone', () => {
  const payload = coverPayloadForPublication(officialPublication())
  assert.equal(payload.storyId, 'story-official-shen')
  assert.equal(payload.title, '沉潮港纪事')
  assert.equal(payload.genreId, 'suspense-supernatural')
  assert.equal(payload.genreTemplateId, 'suspense-supernatural')
  assert.equal(payload.config.genreId, 'suspense-supernatural')
  assert.equal(payload.worldBible.premise, '雾锁的港口城市，潮汐带来不属于这个世界的信件。')
})

test('ensureOfficialCover: dry run, generate, skip, force — and the plaza cover path serves the painting', async () => {
  const plazaStore = createMemoryPlazaStore()
  const coverStore = createMemoryCoverStore()
  await plazaStore.putPublication(officialPublication())
  let calls = 0
  const coverService = createCoverService({
    env: testEnv,
    store: coverStore,
    imageGenerate: async () => {
      calls += 1
      return { buffer: tinyPng(90, 120, [30, 60, 90]), mimeType: 'image/png', usage: null }
    },
  })
  const run = (extra = {}) => ensureOfficialCover({ plazaStore, coverStore, coverService, log: silent, ...extra })

  // Dry run: reports the gap, calls no model, stores nothing.
  const planned = await run({ dryRun: true })
  assert.equal(planned.action, 'would-generate')
  assert.equal(calls, 0)
  assert.equal(await coverStore.getCover(OFFICIAL_UID, 'story-official-shen'), null)

  // Real run: the pipeline paints and stores under (authorUid, sourceStoryId).
  const generated = await run()
  assert.equal(generated.action, 'generated')
  assert.equal(generated.version, 1)
  assert.equal(calls, 1)
  const stored = await coverStore.getCover(OFFICIAL_UID, 'story-official-shen')
  assert.equal(stored.version, 1)
  assert.equal(stored.contentType, 'image/jpeg')
  assert.equal(stored.bytes, Buffer.from(stored.image, 'base64').length)

  // The read paths resolve it: the cover service fetch, and the plaza
  // cover endpoint that backs /api/plaza/<id>/cover?v=1 (coverUrlOf's key).
  const fetched = await coverService.fetch({ uid: OFFICIAL_UID }, 'story-official-shen')
  assert.equal(fetched.version, 1)
  assert.equal(fetched.buffer.toString('base64'), stored.image)
  const plazaService = createPlazaService({ env: {}, store: plazaStore, avatarStore: createMemoryAvatarStore(), coverStore, socialStore: null })
  const served = await plazaService.cover(OFFICIAL_PUBLICATION_ID)
  assert.equal(served.contentType, 'image/jpeg')
  assert.equal(served.buffer.toString('base64'), stored.image)

  // Idempotent: an existing cover is skipped unless forced.
  const skipped = await run()
  assert.equal(skipped.action, 'skipped')
  assert.equal(calls, 1)
  const forced = await run({ force: true })
  assert.equal(forced.action, 'generated')
  assert.equal(forced.version, 2)
  assert.equal(calls, 2)
})
