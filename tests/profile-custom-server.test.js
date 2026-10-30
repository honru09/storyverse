import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PNG } from 'pngjs'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemorySocialStore, pictureSourceFor } from '../server/social-store.js'
import { createSocialService } from '../server/social.js'
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

function tinyPng(seed = 90) {
  const png = new PNG({ width: 40, height: 40 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = seed
    png.data[index + 1] = 140
    png.data[index + 2] = 70
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

function completedLine(avatarId, genreId = 'cultivation') {
  const story = walkLocal(createStory({
    genreId,
    genreTemplateId: genreId === 'neon' ? 'cyberpunk' : 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: genreId === 'neon' ? '霓虹下城·贫民窟' : '山神破庙',
    name: '沈砚',
    avatarId,
    avatarAppearance: '银灰长发，左颊一颗泪痣',
    ability: '借火一瞬',
  }), 24)
  return { ...story, engine: 'gemini' }
}

async function startServer(t) {
  const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
  const identityStore = createMemoryIdentityStore()
  const socialStore = createMemorySocialStore()
  const avatarStore = createMemoryAvatarStore()
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(33), mimeType: 'image/png', usage: null }),
  })
  const plazaStore = createMemoryPlazaStore()
  const plazaService = createPlazaService({ env: {}, store: plazaStore, avatarStore, socialStore })
  const socialService = createSocialService({ env: {}, store: socialStore, plazaStore, avatarStore, identityStore })
  const auth = createAuthService({ env, usernameAuth: createUsernameAuthService({ env, store: identityStore }) })
  const server = createServer({
    env,
    auth,
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
  return { base: `http://127.0.0.1:${server.address().port}` }
}

const ORIGIN = { Origin: 'http://localhost:5173' }
const authed = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'custom-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  const { token } = await response.json()
  const account = await (await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).json()
  return { token, uid: account.user.uid }
}

async function getProfile(base, uid, token) {
  const response = await fetch(`${base}/api/users/${encodeURIComponent(uid)}/profile`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  assert.equal(response.status, 200, 'profile fetch')
  return (await response.json()).profile
}

async function putProfile(base, token, patch) {
  return fetch(`${base}/api/me/profile`, { method: 'PUT', headers: authed(token), body: JSON.stringify(patch) })
}

test('pictureSourceFor: the resolution chain always ends at the default asset', () => {
  assert.equal(pictureSourceFor(null, {}), 'default')
  assert.equal(pictureSourceFor(null, { portraitReady: true }), 'avatar')
  assert.equal(pictureSourceFor(null, { hasUpload: true, portraitReady: true }), 'upload')
  assert.equal(pictureSourceFor({ pictureKind: 'upload' }, { hasUpload: true }), 'upload')
  assert.equal(pictureSourceFor({ pictureKind: 'upload' }, { hasUpload: false, portraitReady: true }), 'default')
  assert.equal(pictureSourceFor({ pictureKind: 'avatar' }, { portraitReady: true, hasUpload: true }), 'avatar')
  assert.equal(pictureSourceFor({ pictureKind: 'avatar' }, { portraitReady: false, hasUpload: true }), 'default')
  assert.equal(pictureSourceFor({ pictureKind: 'default' }, { hasUpload: true, portraitReady: true }), 'default')
})

test('a fresh user has the default avatar picture, an editable block, and no picture bytes', async (t) => {
  const { base } = await startServer(t)
  const user = await register(base, 'fresh_face')
  const profile = await getProfile(base, user.uid, user.token)
  assert.deepEqual(profile.picture, { kind: 'default', url: '/default-avatar.svg' })
  assert.deepEqual(profile.editable, {
    displayName: '', handle: '', bio: '', pictureKind: null, hasUpload: false, hasPortrait: false, hasBanner: false,
  })
  assert.equal(profile.bio, '', 'a fresh user has an empty bio, never a borrowed avatar description')
  const picture = await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/picture`)
  assert.equal(picture.status, 404, 'the default asset is a static file, not served by the picture route')
  // DEVICE-FIX REQ-19: the banner chain ends at the designed default.
  assert.deepEqual(profile.banner, { kind: 'default', url: '/art/banner-profile-1600.webp' })
  const banner = await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/banner`)
  assert.equal(banner.status, 404, 'no upload → no banner bytes from the route')
})

test('profile record CRUD: the record wins for the name; the @ID stays the login username', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'record_author')
  const reader = await register(base, 'record_reader')

  // USERNAME-IMMUTABLE (2026-10-28): a username account's @ID is its
  // login name — claiming a different handle is refused outright
  // (this test previously asserted the claim-and-clear behaviour the
  // rule retired; the claim matrix for accounts without a login
  // username lives in username-immutable.test.js).
  const claim = await putProfile(base, author.token, { handle: 'night_walker' })
  assert.equal(claim.status, 400)
  assert.match((await claim.json()).error, /不能修改/)

  const saved = await putProfile(base, author.token, { displayName: '夜行者' })
  assert.equal(saved.status, 200)
  const { profile: mine } = await saved.json()
  assert.equal(mine.displayName, '夜行者')
  assert.equal(mine.handle, 'record_author', 'the @ID is the login username, never the refused claim')
  assert.equal(mine.editable.displayName, '夜行者')
  assert.equal(mine.editable.handle, '', 'the record never duplicates the login name')

  const seen = await getProfile(base, author.uid, reader.token)
  assert.equal(seen.displayName, '夜行者', 'a visitor sees the record name, not the login username')
  assert.equal(seen.handle, 'record_author')
  assert.equal('editable' in seen, false, 'the editable block is owner-only')

  // Round-tripping the login name is fine; clearing the @ID is not.
  assert.equal((await putProfile(base, author.token, { handle: 'record_author' })).status, 200)
  const cleared = await putProfile(base, author.token, { handle: null })
  assert.equal(cleared.status, 400)
  const after = await getProfile(base, author.uid, reader.token)
  assert.equal(after.handle, 'record_author')
  assert.equal(after.displayName, '夜行者')
})

test('bio: a stored introduction is public, editable, capped and survives a picture upload', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'bio_author')
  const reader = await register(base, 'bio_reader')

  const saved = await putProfile(base, author.token, { bio: '白天修服务器，夜里追更。' })
  assert.equal(saved.status, 200)
  const { profile: mine } = await saved.json()
  assert.equal(mine.bio, '白天修服务器，夜里追更。')
  assert.equal(mine.editable.bio, '白天修服务器，夜里追更。')

  const seen = await getProfile(base, author.uid, reader.token)
  assert.equal(seen.bio, '白天修服务器，夜里追更。', 'a visitor reads the same bio the owner saved')

  // 120 chars is the cap: exactly 120 saves, 121 is refused.
  assert.equal((await putProfile(base, author.token, { bio: '字'.repeat(120) })).status, 200)
  const tooLong = await putProfile(base, author.token, { bio: '字'.repeat(121) })
  assert.equal(tooLong.status, 400)
  assert.match((await tooLong.json()).error, /120/)

  // A picture upload rewrites the profile record — the bio must ride along.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const upload = await fetch(`${base}/api/me/profile/picture`, {
    method: 'POST', headers: authed(author.token),
    body: JSON.stringify({ image: png.toString('base64'), contentType: 'image/png' }),
  })
  assert.equal(upload.status, 200)
  const afterUpload = await getProfile(base, author.uid, reader.token)
  assert.equal(afterUpload.bio, '字'.repeat(120), 'the bio survives a picture upload')

  // Clearing is a legitimate save.
  assert.equal((await putProfile(base, author.token, { bio: '' })).status, 200)
  assert.equal((await getProfile(base, author.uid, reader.token)).bio, '')
})

test('profile validation: name length, handle shape, login still required', async (t) => {
  const { base } = await startServer(t)
  const user = await register(base, 'valid_user')
  assert.equal((await putProfile(base, user.token, { displayName: '' })).status, 400)
  assert.equal((await putProfile(base, user.token, { displayName: '一'.repeat(21) })).status, 400)
  // DEVICE-FIX3 §54: the cap is 18 wide units, not 20 characters —
  // 10 CJK characters are 20 units and no longer fit the card name
  // slot at the narrowest supported width, so they are refused at
  // the write path; 9 CJK characters (exactly 18 units) and 18
  // latin characters still pass.
  assert.equal((await putProfile(base, user.token, { displayName: '一'.repeat(20) })).status, 400)
  assert.equal((await putProfile(base, user.token, { displayName: '一'.repeat(10) })).status, 400)
  assert.equal((await putProfile(base, user.token, { displayName: '一'.repeat(9) })).status, 200)
  assert.equal((await putProfile(base, user.token, { displayName: 'a'.repeat(18) })).status, 200)
  assert.equal((await putProfile(base, user.token, { displayName: 'a'.repeat(19) })).status, 400)
  assert.equal((await putProfile(base, user.token, { displayName: 'a'.repeat(21) })).status, 400)
  assert.equal((await putProfile(base, user.token, { handle: 'Has Space' })).status, 400)
  assert.equal((await putProfile(base, user.token, { handle: 'ab' })).status, 400)
  // USERNAME-IMMUTABLE: 'valid_user' is a username account, so ANY
  // handle that is not its login name is refused as an @ID change —
  // including this uppercase claim (lowercase normalisation on a
  // first claim is covered in username-immutable.test.js).
  const upper = await putProfile(base, user.token, { handle: 'UPPER' })
  assert.equal(upper.status, 400)
  assert.match((await upper.json()).error, /不能修改/)
  const anonymous = await fetch(`${base}/api/me/profile`, {
    method: 'PUT', headers: { ...ORIGIN, 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(anonymous.status, 401)
})

test('username accounts: the @ID is the login username at the HTTP boundary too', async (t) => {
  // USERNAME-IMMUTABLE (2026-10-28) expectation change: this test used
  // to run the claim-collision matrix over username accounts, which
  // are exactly the accounts that may no longer claim at all. The
  // collision / shadowing matrix for first claims (accounts without a
  // login username) lives in username-immutable.test.js.
  const { base } = await startServer(t)
  const keeper = await register(base, 'gate_keeper')
  const first = await register(base, 'first_claim')
  const second = await register(base, 'second_claim')

  const claim = await putProfile(base, first.token, { handle: 'shared_name' })
  assert.equal(claim.status, 400)
  assert.match((await claim.json()).error, /不能修改/)

  const shadow = await putProfile(base, second.token, { handle: 'gate_keeper' })
  assert.equal(shadow.status, 400, 'another account\u2019s login username is refused as an @ID change, before any shadowing check')
  assert.match((await shadow.json()).error, /不能修改/)

  // …but the owner of that login username may round-trip it freely.
  assert.equal((await putProfile(base, keeper.token, { handle: 'gate_keeper' })).status, 200)

  const check = await (await fetch(`${base}/api/me/handle?value=shared_name`, {
    headers: { Authorization: `Bearer ${second.token}` },
  })).json()
  assert.equal(check.available, false)
  assert.match(check.message, /不能修改/)
  const own = await (await fetch(`${base}/api/me/handle?value=second_claim`, {
    headers: { Authorization: `Bearer ${second.token}` },
  })).json()
  assert.equal(own.available, true)
})

test('picture upload, serving and kind switching (upload → avatar → default → upload)', async (t) => {
  const { base } = await startServer(t)
  const user = await register(base, 'picture_user')
  const uploadBytes = tinyPng(90)

  const upload = await fetch(`${base}/api/me/profile/picture`, {
    method: 'POST',
    headers: authed(user.token),
    body: JSON.stringify({ image: uploadBytes.toString('base64'), contentType: 'image/png' }),
  })
  assert.equal(upload.status, 200)
  const { profile: afterUpload } = await upload.json()
  assert.equal(afterUpload.picture.kind, 'upload')
  assert.match(afterUpload.picture.url, /\/picture\?v=\d+$/)
  assert.equal(afterUpload.editable.pictureKind, 'upload')
  assert.equal(afterUpload.editable.hasUpload, true)

  const served = await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/picture`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), uploadBytes)

  // No portrait yet: choosing the avatar kind falls back to the default asset.
  const toAvatar = await putProfile(base, user.token, { pictureKind: 'avatar' })
  assert.equal((await toAvatar.json()).profile.picture.kind, 'default')

  // Paint the portrait, then the avatar kind resolves to the painting.
  const makeAvatar = await fetch(`${base}/api/avatar`, {
    method: 'PUT',
    headers: authed(user.token),
    body: JSON.stringify({
      profile: {
        name: '沈砚', description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(makeAvatar.status, 200)
  const generated = await fetch(`${base}/api/avatar/generate`, {
    method: 'POST', headers: authed(user.token), body: JSON.stringify({}),
  })
  assert.equal(generated.status, 200)
  const avatarKind = await putProfile(base, user.token, { pictureKind: 'avatar' })
  assert.equal((await avatarKind.json()).profile.picture.kind, 'avatar')
  const portraitServed = await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/picture`)
  assert.equal(portraitServed.status, 200)
  const viaPortraitRoute = await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/portrait`)
  assert.equal(viaPortraitRoute.status, 200)
  assert.deepEqual(
    Buffer.from(await portraitServed.arrayBuffer()),
    Buffer.from(await viaPortraitRoute.arrayBuffer()),
    'the picture route serves the current portrait painting when the kind is avatar',
  )

  const toDefault = await putProfile(base, user.token, { pictureKind: 'default' })
  assert.equal((await toDefault.json()).profile.picture.kind, 'default')
  assert.equal((await fetch(`${base}/api/users/${encodeURIComponent(user.uid)}/picture`)).status, 404)

  const backToUpload = await putProfile(base, user.token, { pictureKind: 'upload' })
  assert.equal((await backToUpload.json()).profile.picture.kind, 'upload')

  // Choosing 'upload' with nothing stored is refused where there is no upload.
  const other = await register(base, 'no_upload_user')
  const refused = await putProfile(base, other.token, { pictureKind: 'upload' })
  assert.equal(refused.status, 400)
})

test('picture upload validation: format mismatch and oversize are refused', async (t) => {
  const { base } = await startServer(t)
  const user = await register(base, 'strict_user')
  const mismatch = await fetch(`${base}/api/me/profile/picture`, {
    method: 'POST',
    headers: authed(user.token),
    body: JSON.stringify({ image: tinyPng().toString('base64'), contentType: 'image/jpeg' }),
  })
  assert.equal(mismatch.status, 400, 'PNG bytes labelled JPEG are refused')
  const huge = Buffer.alloc(1_100_000, 7)
  huge[0] = 0xff; huge[1] = 0xd8
  const oversize = await fetch(`${base}/api/me/profile/picture`, {
    method: 'POST',
    headers: authed(user.token),
    body: JSON.stringify({ image: huge.toString('base64'), contentType: 'image/jpeg' }),
  })
  assert.equal(oversize.status, 400, 'pictures over 1 MB are refused')
})

test('report a user: real, idempotent, self and ghost refused', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'report_target')
  const reader = await register(base, 'report_reader')
  // The target exists once they have an avatar record (the same rule the
  // profile page itself uses).
  const makeAvatar = await fetch(`${base}/api/avatar`, {
    method: 'PUT',
    headers: authed(author.token),
    body: JSON.stringify({
      profile: {
        name: '沈砚', description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    }),
  })
  assert.equal(makeAvatar.status, 200)
  const report = (token, uid) => fetch(`${base}/api/users/${encodeURIComponent(uid)}/report`, {
    method: 'POST', headers: authed(token), body: '{}',
  })
  const first = await report(reader.token, author.uid)
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { reported: true })
  assert.equal((await report(reader.token, author.uid)).status, 200, 'reporting twice stays one report')
  assert.equal((await report(author.token, author.uid)).status, 400, 'cannot report yourself')
  assert.equal((await report(reader.token, 'ghost-user-404')).status, 404)
})

test('plaza feed resolves the author through the profile record (name + picture)', async (t) => {
  const { base } = await startServer(t)
  const author = await register(base, 'feed_author')
  const plain = await register(base, 'feed_plain')

  const makeAvatarFor = async (token) => {
    const response = await fetch(`${base}/api/avatar`, {
      method: 'PUT',
      headers: authed(token),
      body: JSON.stringify({
        profile: {
          name: '沈砚', description: '清冷安静的剑客。',
          appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
        },
      }),
    })
    assert.equal(response.status, 200)
    return (await response.json()).avatar
  }
  const publishFor = async (token, avatarId, genreId) => {
    const response = await fetch(`${base}/api/plaza/publish`, {
      method: 'POST', headers: authed(token), body: JSON.stringify({ story: completedLine(avatarId, genreId) }),
    })
    assert.equal(response.status, 200, 'publish')
    return (await response.json()).publication
  }

  const authorAvatar = await makeAvatarFor(author.token)
  const generated = await fetch(`${base}/api/avatar/generate`, {
    method: 'POST', headers: authed(author.token), body: JSON.stringify({}),
  })
  assert.equal(generated.status, 200)
  const mine = await publishFor(author.token, authorAvatar.id, 'cultivation')
  const plainAvatar = await makeAvatarFor(plain.token)
  await publishFor(plain.token, plainAvatar.id, 'neon')

  // The author rebrands: custom name, and deliberately back to the default picture.
  await putProfile(base, author.token, { displayName: '夜行者', pictureKind: 'default' })

  const feed = await (await fetch(`${base}/api/store`)).json()
  assert.equal(feed.books.length, 2)
  const branded = feed.books.find((publication) => publication.id === mine.id)
  assert.equal(branded.authorName, '夜行者', 'the feed shows the profile-record name, not the publish-time name')
  assert.equal(branded.avatar.pictureKind, 'default')
  assert.equal(branded.avatar.pictureUrl, '/default-avatar.svg')
  assert.equal(typeof branded.premise, 'string')
  assert.ok(branded.completedAt && !Number.isNaN(Date.parse(branded.completedAt)), 'the line carries a completion date')

  const unbranded = feed.books.find((publication) => publication.id !== mine.id)
  assert.equal(unbranded.avatar.pictureKind, 'default', 'an author without portrait or upload shows the default asset')
  assert.equal(unbranded.avatar.pictureUrl, '/default-avatar.svg')

  // The author's profile page tells the same story as the feed.
  const profile = await getProfile(base, author.uid)
  assert.equal(profile.displayName, '夜行者')
  assert.equal(profile.publications[0].premise, branded.premise)
  assert.equal(profile.publications[0].completedAt, branded.completedAt)

  // Flip the author to the portrait: feed and profile agree again.
  await putProfile(base, author.token, { pictureKind: 'avatar' })
  const feedAfter = await (await fetch(`${base}/api/store`)).json()
  const flipped = feedAfter.books.find((publication) => publication.id === mine.id)
  assert.equal(flipped.avatar.pictureKind, 'avatar')
  assert.match(flipped.avatar.pictureUrl, /\/picture\?v=/)
})
