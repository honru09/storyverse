import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createMergedStory,
  createStory,
} from '../src/story-engine.js'

/**
 * REQ-69 audit cluster A: the plaza publish re-check must be bound to
 * the story's actual provenance (sources[] / sourcePublicationIds /
 * config.sourcePublicationId), walk the server-side publication graph
 * as a transitive closure, and refuse shelving when a claimed source
 * is withdrawn / hidden / gone. Plus the red-line scan's coverage of
 * every user-visible free-text field on the publish surface.
 */

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    current = acceptChapter(current, buildChapter(current, index), chapterKey(current, index))
  }
  return current
}

const completedSeason = (avatarId, name = '沈砚') => ({
  ...walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name,
    avatarId,
    ability: '借火一瞬',
  }), 24),
  engine: 'gemini',
})

const endlessLine = (avatarId, extra = {}) => ({
  ...walkLocal(createStory({
    genreId: 'mist',
    storyLengthMode: 'endless',
    name: '陆鸣',
    avatarId,
    ability: '雾行',
    ...extra,
  }), 2),
  engine: 'gemini',
})

const mergedOn = (avatarId, publicationId) => {
  const own = endlessLine(avatarId)
  const entered = endlessLine(avatarId, { sourcePublicationId: publicationId })
  const merged = createMergedStory(own, entered, { rules: 'bridge', lead: 'a', bond: 'allies' })
  return { ...walkLocal(merged, 1), engine: 'gemini' }
}

async function makeWorld() {
  const plazaStore = createMemoryPlazaStore()
  const avatarStore = createMemoryAvatarStore()
  const coverStore = createMemoryCoverStore()
  const socialStore = createMemorySocialStore()
  const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore, socialStore })

  const addUser = async (uid, avatarId) => {
    await avatarStore.putCollection(uid, {
      mainId: avatarId,
      avatars: [{ id: avatarId, name: '旅人', description: '', portrait: { status: 'none' } }],
    })
    return { uid, displayName: uid }
  }
  const setPermission = (uid, fusionPermission) =>
    socialStore.putProfileRecord({ uid, fusionPermission })
  const grant = (applicantUid, publicationId, authorUid) =>
    socialStore.putFusionGrant({ applicantUid, publicationId, authorUid, createdAt: '2026-10-31T00:00:00.000Z' })
  const publish = (identity, story) => plaza.publish(identity, { story })
  const publishBook = async (identity, avatarId) => {
    const publication = await publish(identity, completedSeason(avatarId))
    return publication
  }
  return { plaza, plazaStore, socialStore, addUser, setPermission, grant, publish, publishBook }
}

const A = { uid: 'uid-a', avatarId: 'avatar-a' }
const B = { uid: 'uid-b', avatarId: 'avatar-b' }

// ---------------------------------------------------------------------------
// Task 1: provenance-bound re-check + transitive closure
// ---------------------------------------------------------------------------

test('cleared sourcePublicationIds array does not bypass the re-check (sources[] still names the ask author)', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)
  await world.setPermission(B.uid, 'ask')

  const merged = mergedOn(A.avatarId, bookB.id)
  assert.deepEqual(merged.sourcePublicationIds, ['', bookB.id])
  const tampered = { ...merged, sourcePublicationIds: [] }
  await assert.rejects(world.publish(a, tampered), /来源|合流授权/)
})

test('sourcePublicationIds filled with an own book id does not bypass the re-check either', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)
  const bookA = await world.publishBook(a, A.avatarId)
  await world.setPermission(B.uid, 'forbidden')

  const merged = mergedOn(A.avatarId, bookB.id)
  const tampered = { ...merged, sourcePublicationIds: [bookA.id] }
  await assert.rejects(world.publish(a, tampered), /来源|合流授权/)
})

test('solo entered line: publishing it re-checks the source author (forbidden blocks the laundering first hop)', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)
  await world.setPermission(B.uid, 'forbidden')

  const entered = endlessLine(A.avatarId, { sourcePublicationId: bookB.id })
  await assert.rejects(world.publish(a, entered), /合流授权|未开放|禁止/)
})

test('laundering one hop: a re-published entered line cannot wash the original author out of a later fusion', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)
  // B is free while A enters and re-publishes the entered line as P2.
  const entered = endlessLine(A.avatarId, { sourcePublicationId: bookB.id })
  const p2 = await world.publish(a, entered)
  assert.ok(p2.id, 'a free author’s entered line shelves as the entrant’s own book')

  // B closes the gate afterwards; fusing P2 must still reach B.
  await world.setPermission(B.uid, 'forbidden')
  const merged = mergedOn(A.avatarId, p2.id)
  await assert.rejects(world.publish(a, merged), /合流授权/)
})

test('laundering two hops: the closure walks P3 → P2 → the original book', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)
  const p2 = await world.publish(a, endlessLine(A.avatarId, { sourcePublicationId: bookB.id }))
  const p3 = await world.publish(a, endlessLine(A.avatarId, { sourcePublicationId: p2.id }))
  assert.ok(p3.id)

  await world.setPermission(B.uid, 'forbidden')
  const merged = mergedOn(A.avatarId, p3.id)
  await assert.rejects(world.publish(a, merged), /合流授权/)
})

test('a grant on the intermediate book does not cover the original author behind it', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)
  const p2 = await world.publish(a, endlessLine(A.avatarId, { sourcePublicationId: bookB.id }))
  await world.setPermission(B.uid, 'ask')
  // A grant recorded against the intermediate publication only.
  await world.grant(A.uid, p2.id, A.uid)
  const merged = mergedOn(A.avatarId, p2.id)
  await assert.rejects(world.publish(a, merged), /合流授权/)
  // The grant that counts is the one on the ORIGINAL publication.
  await world.grant(A.uid, bookB.id, B.uid)
  const allowed = await world.publish(a, merged)
  assert.equal(allowed.merged, true)
})

test('withdrawn source: a fused line whose source was taken down cannot shelve', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)
  const merged = mergedOn(A.avatarId, bookB.id)
  await world.plaza.withdraw(b, bookB.id)
  await assert.rejects(world.publish(a, merged), /下架/)
})

test('missing source: a fused line naming a publication that does not exist cannot shelve', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  await world.addUser(B.uid, B.avatarId)
  const merged = mergedOn(A.avatarId, 'pub-does-not-exist')
  await assert.rejects(world.publish(a, merged), /下架|不存在/)
})

test('normal paths stay open: free source, granted ask source, own sources, double-own fusion', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const b = await world.addUser(B.uid, B.avatarId)
  const bookB = await world.publishBook(b, B.avatarId)

  // free author source
  const freeMerged = await world.publish(a, mergedOn(A.avatarId, bookB.id))
  assert.equal(freeMerged.merged, true)

  // ask author + durable grant on that publication
  await world.setPermission(B.uid, 'ask')
  await world.grant(A.uid, bookB.id, B.uid)
  const grantedMerged = await world.publish(a, mergedOn(A.avatarId, bookB.id))
  assert.equal(grantedMerged.merged, true)

  // solo entered line from a free author shelves (B back to free)
  await world.setPermission(B.uid, 'free')
  const entered = await world.publish(a, endlessLine(A.avatarId, { sourcePublicationId: bookB.id }))
  assert.ok(entered.id)

  // double-own fusion: two of A's own lines, no outside source at all
  const ownMerged = createMergedStory(endlessLine(A.avatarId), endlessLine(A.avatarId))
  const walked = { ...walkLocal(ownMerged, 1), engine: 'gemini' }
  const ownPublished = await world.publish(a, walked)
  assert.equal(ownPublished.merged, true)
})

test('closure terminates on a provenance cycle between the publisher’s own books', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  await world.addUser(B.uid, B.avatarId)
  const base = {
    authorUid: A.uid, authorName: A.uid, status: 'published', title: '循环之书',
    snapshot: { config: {}, chapters: [], choices: {} },
  }
  await world.plazaStore.putPublication({ ...base, id: 'pub-cycle-1', sources: [{ publicationId: 'pub-cycle-2', title: '乙' }] })
  await world.plazaStore.putPublication({ ...base, id: 'pub-cycle-2', sources: [{ publicationId: 'pub-cycle-1', title: '甲' }] })
  const merged = mergedOn(A.avatarId, 'pub-cycle-1')
  const published = await world.publish(a, merged)
  assert.equal(published.merged, true, 'a cycle among own books neither hangs nor blocks')
})

// ---------------------------------------------------------------------------
// Task 2: red-line scan covers the whole publish surface
// ---------------------------------------------------------------------------

const VIOLATION = '未成年角色与性行为描写'

test('red-line scan: violation in synopsis is blocked', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const story = { ...endlessLine(A.avatarId), synopsis: VIOLATION }
  await assert.rejects(world.publish(a, story), /未成年/)
})

test('red-line scan: violation in intro.thread is blocked', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const story = {
    ...endlessLine(A.avatarId),
    intro: { background: '平静的海港，雾气在清晨散开。', rules: [], thread: VIOLATION },
  }
  await assert.rejects(world.publish(a, story), /未成年/)
})

test('red-line scan: violation in config.abilityDesc is blocked', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const story = endlessLine(A.avatarId, { abilityDesc: VIOLATION })
  await assert.rejects(world.publish(a, story), /未成年/)
})

test('red-line scan: violation in the book title is blocked', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const story = { ...endlessLine(A.avatarId), title: '未成年性行为实录' }
  await assert.rejects(world.publish(a, story), /未成年/)
})

test('red-line scan: a clean book still shelves', async () => {
  const world = await makeWorld()
  const a = await world.addUser(A.uid, A.avatarId)
  const story = {
    ...endlessLine(A.avatarId, { abilityDesc: '借来的一瞬火光，只能用一次。' }),
    synopsis: '陆鸣在雾港醒来，手里攥着一枚会发烫的旧币。',
    intro: { background: '雾港常年有雾。', rules: ['雾起时不要回应钟声。'], thread: '陆鸣要找到雾散之前的出口。' },
  }
  const published = await world.publish(a, story)
  assert.ok(published.id)
})
