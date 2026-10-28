import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PNG } from 'pngjs'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createServer } from '../server/index.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createMergedStory,
  createStory,
  finishEndlessLine,
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

function completedLine(avatarId, { marker = '', redLine = false, title = '' } = {}) {
  let story = walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    avatarId,
    avatarAppearance: '银灰长发，左颊一颗泪痣',
    ability: '借火一瞬',
    // The private life fields only persist on immersive drafts — that is
    // exactly the shape whose literals the snapshot must scrub from prose.
    immersive: true,
    hometown: marker,
    friend: marker,
  }), 24)
  if (marker || redLine) {
    story = {
      ...story,
      chapters: story.chapters.map((chapter, index) => index === 2 ? {
        ...chapter,
        paragraphs: [
          redLine ? '小学生在河边细说性行为的细节。' : `他想起${marker}，脚步一顿。`,
          ...chapter.paragraphs.slice(1),
        ],
      } : chapter),
    }
  }
  if (title) story = { ...story, title }
  return { ...story, engine: 'gemini' }
}

async function startPlazaServer(t) {
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(), mimeType: 'image/png', usage: null }),
  })
  const plazaStore = createMemoryPlazaStore()
  const coverStore = createMemoryCoverStore()
  const plazaService = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    avatar: avatarService,
    plaza: plazaService,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, plazaStore, coverStore }
}

const ORIGIN = { Origin: 'http://localhost:5173' }

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'plaza-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  return token
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

const publish = (base, token, story) => fetch(`${base}/api/plaza/publish`, {
  method: 'POST',
  headers: { ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ story }),
})

test('publish → feed → detail round-trip, with the private marker scrubbed everywhere', async (t) => {
  const { base, plazaStore } = await startPlazaServer(t)
  const token = await register(base, 'plaza_author_a')
  const avatar = await makeAvatar(base, token)
  const MARKER = '私密标记-桥洞暗号-77'
  const story = completedLine(avatar.id, { marker: MARKER })

  const response = await publish(base, token, story)
  assert.equal(response.status, 200)
  const { publication } = await response.json()
  assert.match(publication.id, /^pub-/)
  assert.equal(publication.avatar.name, '沈砚')
  assert.equal(publication.worldName, '青岚宗')
  assert.equal(publication.chapterCount, 24)
  assert.equal('authorUid' in publication, false)
  assert.equal('reporters' in publication, false)

  const stored = await plazaStore.listPublications()
  assert.equal(stored.length, 1)
  assert.equal(JSON.stringify(stored[0]).includes(MARKER), false, 'stored record carries no private marker')

  const feedResponse = await fetch(`${base}/api/store`)
  assert.equal(feedResponse.status, 200)
  const feedText = await feedResponse.text()
  assert.equal(feedText.includes(MARKER), false, 'feed carries no private marker')
  const feed = JSON.parse(feedText).books
  assert.equal(feed.length, 1)
  assert.equal(feed[0].id, publication.id)

  const detailResponse = await fetch(`${base}/api/plaza/${publication.id}`)
  assert.equal(detailResponse.status, 200)
  const detailText = await detailResponse.text()
  assert.equal(detailText.includes(MARKER), false, 'detail carries no private marker')
  const detail = JSON.parse(detailText).publication
  assert.equal(detail.snapshot.chapters.length, 24)
  assert.equal(detail.snapshot.config.hometown, '')
  assert.equal(detail.enterTemplate.worldBible.outline.length, 24)
  assert.equal(detail.beats.length, 24)
  assert.equal(detail.snapshot.config.avatarId, '', 'the public snapshot never carries the author avatar id')

  // A second, later publication sorts first in the feed.
  const second = completedLine(avatar.id, { title: '第二条线' })
  const secondResponse = await publish(base, token, second)
  assert.equal(secondResponse.status, 200)
  const nextFeed = (await (await fetch(`${base}/api/store`)).json()).books
  assert.equal(nextFeed.length, 2)
  assert.equal(nextFeed[0].title, '第二条线')

  // The portrait is served under the publication id only once painted.
  const noPortrait = await fetch(`${base}/api/plaza/${publication.id}/portrait`)
  assert.equal(noPortrait.status, 404)
  const generated = await fetch(`${base}/api/avatar/generate`, {
    method: 'POST',
    headers: { ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(generated.status, 200)
  const portrait = await fetch(`${base}/api/plaza/${publication.id}/portrait`)
  assert.equal(portrait.status, 200)
  assert.equal(portrait.headers.get('content-type'), 'image/jpeg')
})

test('official flag: derived from the author uid, never claimable through client input', async (t) => {
  const { base } = await startPlazaServer(t)
  // The designated official account (server-owned username constant).
  const officialToken = await register(base, 'storyweave')
  const officialAvatar = await makeAvatar(base, officialToken, '沈知遥')
  const officialResponse = await publish(base, officialToken, completedLine(officialAvatar.id, { title: '官方示例线' }))
  assert.equal(officialResponse.status, 200)
  const { publication: officialPublication } = await officialResponse.json()
  assert.equal(officialPublication.official, true, 'publish response flags the official line')

  // A normal author whose story body tries to claim the flag every way
  // a client could smuggle it in: the flag must stay false everywhere.
  const token = await register(base, 'plaza_author_fan')
  const avatar = await makeAvatar(base, token)
  const claiming = completedLine(avatar.id, { title: '冒充官方的线' })
  claiming.official = true
  claiming.config.official = true
  const response = await publish(base, token, claiming)
  assert.equal(response.status, 200)
  const { publication } = await response.json()
  assert.equal(publication.official, false, 'publish response ignores client-claimed official flags')

  const feed = (await (await fetch(`${base}/api/store`)).json()).books
  const byId = new Map(feed.map((item) => [item.id, item]))
  assert.equal(byId.get(officialPublication.id)?.official, true, 'feed flags the official line')
  assert.equal(byId.get(publication.id)?.official, false, 'feed leaves normal lines unflagged')

  const detail = (await (await fetch(`${base}/api/plaza/${officialPublication.id}`)).json()).publication
  assert.equal(detail.official, true, 'detail flags the official line')
  const normalDetail = (await (await fetch(`${base}/api/plaza/${publication.id}`)).json()).publication
  assert.equal(normalDetail.official, false, 'detail leaves normal lines unflagged')
})

test('a story’s own generated cover rides the feed/detail summaries and is served under the publication id', async (t) => {
  const { base, coverStore } = await startPlazaServer(t)
  const token = await register(base, 'plaza_author_cover')
  const avatar = await makeAvatar(base, token)
  const story = completedLine(avatar.id, { title: '带封面的线' })
  const { publication } = await (await publish(base, token, story)).json()

  // No cover painted yet: the summary carries null and the route 404s,
  // so surfaces keep the world-artwork fallback exactly as before.
  const bareFeed = (await (await fetch(`${base}/api/store`)).json()).books
  assert.equal(bareFeed[0].coverUrl, null)
  const missing = await fetch(`${base}/api/plaza/${publication.id}/cover`)
  assert.equal(missing.status, 404)

  // Paint the cover (the store record the cover service would write).
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const coverBytes = tinyPng()
  await coverStore.putCover(account.user.uid, story.id, {
    uid: account.user.uid,
    storyId: story.id,
    version: 1,
    contentType: 'image/png',
    image: coverBytes.toString('base64'),
    bytes: coverBytes.length,
    model: 'fixture',
    updatedAt: new Date().toISOString(),
  })

  const expectedUrl = `/api/plaza/${publication.id}/cover?v=1`
  const feed = (await (await fetch(`${base}/api/store`)).json()).books
  assert.equal(feed[0].coverUrl, expectedUrl, 'feed summary carries the story’s own cover')
  const detail = (await (await fetch(`${base}/api/plaza/${publication.id}`)).json()).publication
  assert.equal(detail.coverUrl, expectedUrl, 'detail summary carries the story’s own cover')

  const served = await fetch(`${base}${expectedUrl}`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), coverBytes)

  // A repaint bumps the version and the summary URL follows it live.
  await coverStore.putCover(account.user.uid, story.id, {
    uid: account.user.uid,
    storyId: story.id,
    version: 2,
    contentType: 'image/png',
    image: coverBytes.toString('base64'),
    bytes: coverBytes.length,
    model: 'fixture',
    updatedAt: new Date().toISOString(),
  })
  const repainted = (await (await fetch(`${base}/api/store`)).json()).books
  assert.equal(repainted[0].coverUrl, `/api/plaza/${publication.id}/cover?v=2`)
})

test('publish rejects gated stories, another avatar’s line and red-line content — storing nothing', async (t) => {
  const { base, plazaStore } = await startPlazaServer(t)
  const token = await register(base, 'plaza_author_b')
  const avatar = await makeAvatar(base, token)

  const anon = await fetch(`${base}/api/plaza/publish`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ story: {} }),
  })
  assert.equal(anon.status, 401)

  const unfinished = walkLocal(createStory({
    genreId: 'cultivation', genreTemplateId: 'xianxia', storyLengthMode: 'season', avatarId: avatar.id,
  }), 5)
  const unfinishedResponse = await publish(base, token, unfinished)
  assert.equal(unfinishedResponse.status, 400)
  assert.match((await unfinishedResponse.json()).error, /还没走完/)

  const noAvatar = completedLine('')
  const noAvatarResponse = await publish(base, token, noAvatar)
  assert.equal(noAvatarResponse.status, 400)
  assert.match((await noAvatarResponse.json()).error, /化身/)

  const foreign = completedLine('avatar-someone-else')
  const foreignResponse = await publish(base, token, foreign)
  assert.equal(foreignResponse.status, 400)
  assert.match((await foreignResponse.json()).error, /不是用你的化身走完的/)

  const short = { ...walkLocal(createStory({ genreId: 'mist', avatarId: avatar.id }), 6), engine: 'gemini' }
  const shortResponse = await publish(base, token, short)
  assert.equal(shortResponse.status, 400)
  assert.match((await shortResponse.json()).error, /一季、长线、自定义篇幅或无限连载/)

  const merged = {
    ...walkLocal(createMergedStory(
      createStory({ genreId: 'mist', avatarId: avatar.id }),
      createStory({ genreId: 'neon' }),
    ), 6),
    engine: 'gemini',
  }
  const mergedResponse = await publish(base, token, merged)
  assert.equal(mergedResponse.status, 400)
  assert.match((await mergedResponse.json()).error, /合流/)

  const redLine = completedLine(avatar.id, { redLine: true })
  const redLineResponse = await publish(base, token, redLine)
  assert.equal(redLineResponse.status, 400)
  assert.match((await redLineResponse.json()).error, /未成年/)

  assert.equal((await plazaStore.listPublications()).length, 0, 'no rejected publish left a record behind')
  const feed = (await (await fetch(`${base}/api/store`)).json()).books
  assert.deepEqual(feed, [])
})

test('publish stops a story whose real prose lost its engine mark — never scaffold in its place (DESIGN §27)', async (t) => {
  const { base, plazaStore } = await startPlazaServer(t)
  const token = await register(base, 'plaza_author_guard')
  const avatar = await makeAvatar(base, token)

  // The cold-start incident shape: model-written bible and prose, the
  // engine field gone. The snapshot would re-derive scaffold chapters;
  // the guard must refuse loudly and store nothing.
  const incident = completedLine(avatar.id)
  delete incident.engine
  incident.worldBible = { ...incident.worldBible, premise: '由模型写下的世界核心设定，和本地模板完全不同。' }
  incident.chapters = incident.chapters.map((chapter, index) => index === 0
    ? { ...chapter, paragraphs: ['这是模型真正写出的正文，和本地脚手架完全不同。'] }
    : chapter)
  const incidentResponse = await publish(base, token, incident)
  assert.equal(incidentResponse.status, 400)
  assert.match((await incidentResponse.json()).error, /已拦下发布/)
  assert.equal((await plazaStore.listPublications()).length, 0, 'the guarded publish stored nothing')

  // Control: the same line with only the mark missing (local bible and
  // local prose intact) is a genuine local line and still publishes.
  const local = completedLine(avatar.id)
  delete local.engine
  const localResponse = await publish(base, token, local)
  assert.equal(localResponse.status, 200)
  assert.equal((await plazaStore.listPublications()).length, 1)
})

test('three distinct reporters hide a publication; the author can withdraw and re-publish', async (t) => {
  const { base } = await startPlazaServer(t)
  const authorToken = await register(base, 'plaza_author_c')
  const avatar = await makeAvatar(base, authorToken)
  const story = completedLine(avatar.id)
  const { publication } = await (await publish(base, authorToken, story)).json()

  const report = (token) => fetch(`${base}/api/plaza/${publication.id}/report`, {
    method: 'POST',
    headers: { ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const anonReport = await fetch(`${base}/api/plaza/${publication.id}/report`, {
    method: 'POST', headers: { ...ORIGIN, 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(anonReport.status, 401)
  const selfReport = await report(authorToken)
  assert.equal(selfReport.status, 400)

  const visible = async () => (await (await fetch(`${base}/api/store`)).json()).books.length === 1
  const reporterB = await register(base, 'plaza_reader_b')
  const reporterC = await register(base, 'plaza_reader_c')
  const reporterD = await register(base, 'plaza_reader_d')
  assert.equal((await report(reporterB)).status, 200)
  assert.equal(await visible(), true)
  assert.equal((await report(reporterB)).status, 200, 'a repeat report is a no-op, not a second vote')
  assert.equal(await visible(), true)
  assert.equal((await report(reporterC)).status, 200)
  assert.equal(await visible(), true)
  assert.equal((await report(reporterD)).status, 200)
  assert.equal(await visible(), false, 'the third distinct reporter hides the line')
  const hiddenDetail = await fetch(`${base}/api/plaza/${publication.id}`)
  assert.equal(hiddenDetail.status, 404)

  // A fresh line: withdraw is author-only, and re-publishing revives the same id.
  const second = completedLine(avatar.id, { title: '可下架的线' })
  const { publication: secondPublication } = await (await publish(base, authorToken, second)).json()
  const foreignWithdraw = await fetch(`${base}/api/plaza/${secondPublication.id}/withdraw`, {
    method: 'POST',
    headers: { ...ORIGIN, Authorization: `Bearer ${reporterB}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(foreignWithdraw.status, 404)
  const withdrawn = await fetch(`${base}/api/plaza/${secondPublication.id}/withdraw`, {
    method: 'POST',
    headers: { ...ORIGIN, Authorization: `Bearer ${authorToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(withdrawn.status, 200)
  assert.equal((await (await fetch(`${base}/api/store`)).json()).books.length, 0)
  const republished = await publish(base, authorToken, second)
  assert.equal(republished.status, 200)
  assert.equal((await republished.json()).publication.id, secondPublication.id)
  assert.equal((await (await fetch(`${base}/api/store`)).json()).books.length, 1)
})

test('a running endless line publishes as a living publication and flips to finished by hand', async (t) => {
  const { base } = await startPlazaServer(t)
  const token = await register(base, 'plaza_endless_a')
  const avatar = await makeAvatar(base, token)

  const endlessStory = (chapters) => ({
    ...walkLocal(createStory({
      genreId: 'mist',
      genreTemplateId: 'xuanhuan',
      storyLengthMode: 'endless',
      name: '沈砚',
      avatarId: avatar.id,
      avatarAppearance: '银灰长发，左颊一颗泪痣',
      ability: '听见潮汐',
    }), chapters),
    engine: 'gemini',
  })

  // Zero chapters: nothing to read yet, rejected like any gated line.
  const emptyResponse = await publish(base, token, endlessStory(0))
  assert.equal(emptyResponse.status, 400)
  assert.match((await emptyResponse.json()).error, /第一章/)

  // Three chapters in, still running: published as a LIVING publication.
  const running = endlessStory(3)
  const first = await publish(base, token, running)
  assert.equal(first.status, 200)
  const { publication } = await first.json()
  assert.equal(publication.lineStatus, 'serializing')
  assert.equal(publication.chapterCount, 3)
  assert.equal(publication.totalChapters, 3)
  assert.equal(publication.completedAt, null)

  const feed = (await (await fetch(`${base}/api/store`)).json()).books
  assert.equal(feed.length, 1)
  assert.equal(feed[0].lineStatus, 'serializing')

  // The line grows; a re-publish (the live sync) updates the same record:
  // content and count follow the line, still serialising.
  const bigger = endlessStory(6)
  const second = await publish(base, token, { ...bigger, id: running.id })
  assert.equal(second.status, 200)
  const { publication: updated } = await second.json()
  assert.equal(updated.id, publication.id)
  assert.equal(updated.lineStatus, 'serializing')
  assert.equal(updated.chapterCount, 6)
  const detail = (await (await fetch(`${base}/api/plaza/${publication.id}`)).json()).publication
  assert.equal(detail.snapshot.chapters.length, 6)
  assert.equal(detail.lineStatus, 'serializing')

  // Entry from the running publication works: its enter template carries
  // the endless mode, so an entrant's new line is endless too.
  assert.equal(detail.enterTemplate.config.storyLengthMode, 'endless')

  // Manual finish: the next sync flips the publication to finished at the
  // final count, with a real completion stamp.
  const finishedStory = { ...finishEndlessLine({ ...bigger, id: running.id }), engine: 'gemini' }
  const third = await publish(base, token, finishedStory)
  assert.equal(third.status, 200)
  const { publication: finished } = await third.json()
  assert.equal(finished.id, publication.id)
  assert.equal(finished.lineStatus, 'finished')
  assert.equal(finished.chapterCount, 6)
  assert.ok(finished.completedAt)
})

test('byline @ID (COVER-FIX): a username author’s feed/detail carry the login name as authorHandle', async (t) => {
  const { base } = await startPlazaServer(t)
  const token = await register(base, 'byline_author')
  const avatar = await makeAvatar(base, token)
  const story = completedLine(avatar.id)
  const { publication } = await (await publish(base, token, story)).json()

  const feed = (await (await fetch(`${base}/api/store`)).json()).books
  assert.equal(feed[0].authorHandle, 'byline_author', 'feed byline @ID is the username')
  const detail = (await (await fetch(`${base}/api/plaza/${publication.id}`)).json()).publication
  assert.equal(detail.authorHandle, 'byline_author', 'detail byline @ID is the username')
})

test('byline @ID (COVER-FIX): a claimed profile handle wins over the uid fallback', async () => {
  const plazaStore = createMemoryPlazaStore()
  await plazaStore.putPublication({
    id: 'pub-byline-fixture',
    status: 'published',
    authorUid: 'firebase-uid-42',
    authorName: '发布时的名字',
    sourceStoryId: 'story-42',
    title: '署名样例',
    genreId: 'mist',
    genreTemplateId: '',
    worldName: '沉潮港',
    merged: false,
    sourceTitles: [],
    storyLengthMode: 'season',
    seasonNumber: 1,
    chapterCount: 24,
    totalChapters: 24,
    lineStatus: 'finished',
    publishedAt: '2026-10-28T00:00:00.000Z',
    completedAt: '2026-10-28T00:00:00.000Z',
    avatar: { name: '沈知遥', hasPortrait: false },
    snapshot: {
      worldBible: { premise: '雾港里的人靠潮汐记事。', rules: [], outline: [] },
      beats: [], synopsis: '', config: {}, chapters: [], choices: [],
    },
  })
  const socialStore = {
    getProfileRecord: async () => ({ displayName: '记录上的作者', handle: 'claimed_id' }),
    getPicture: async () => null,
  }
  const service = createPlazaService({
    env: {}, store: plazaStore, avatarStore: null, socialStore, coverStore: null,
  })
  const feed = await service.feed()
  assert.equal(feed.length, 1)
  assert.equal(feed[0].authorName, '记录上的作者', 'the profile record name still wins')
  assert.equal(feed[0].authorHandle, 'claimed_id', 'the claimed handle wins for the byline')
  assert.equal(feed[0].coverUrl, null, 'no cover painted → null, surfaces fall back to world art')
})
