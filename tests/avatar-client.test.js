import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAvatar,
  deleteAvatar,
  fetchAvatar,
  fetchAvatarObjectUrl,
  fetchAvatars,
  generateAvatar,
  mainAvatarOf,
  saveAvatar,
  setMainAvatar,
} from '../src/avatar.js'

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const token = async () => 'token-fixture'

const readyAvatar = (overrides = {}) => ({
  id: 'avatar-1',
  name: '林晚舟',
  description: '',
  appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'coat', shoes: 'boots', face: 'none', faceNote: '' },
  portrait: { status: 'ready', version: 2, hasPrevious: true },
  ...overrides,
})

test('fetchAvatar returns the profile or null and sends the bearer token', async () => {
  const seen = []
  const fetchImpl = async (url, options) => {
    seen.push({ url, options })
    return jsonResponse(200, { avatar: null })
  }
  assert.equal(await fetchAvatar({ getAccessToken: token, fetchImpl }), null)
  assert.equal(seen[0].url, '/api/avatar')
  assert.equal(seen[0].options.headers.Authorization, 'Bearer token-fixture')
})

test('saveAvatar PUTs the profile and returns the stored avatar', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options }
    return jsonResponse(200, { avatar: readyAvatar() })
  }
  const saved = await saveAvatar({ profile: { name: '林晚舟' }, getAccessToken: token, fetchImpl })
  assert.equal(saved.id, 'avatar-1')
  assert.equal(request.options.method, 'PUT')
  assert.deepEqual(JSON.parse(request.options.body), { profile: { name: '林晚舟' } })
})

test('generateAvatar maps quota and auth failures to stable codes', async () => {
  const quota = async () => jsonResponse(429, { error: '满了', code: 'avatar-quota' })
  await assert.rejects(generateAvatar({ profile: {}, getAccessToken: token, fetchImpl: quota }), (error) => error.code === 'avatar-quota')
  const anon = async () => jsonResponse(401, { error: '先登录', code: 'auth-required' })
  await assert.rejects(generateAvatar({ profile: {}, getAccessToken: token, fetchImpl: anon }), (error) => error.code === 'auth-required')
})

test('collection client: list, create, set main and delete hit their routes', async () => {
  const seen = []
  const fetchImpl = async (url, options = {}) => {
    seen.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (url === '/api/avatars' && (options.method || 'GET') === 'GET') {
      return jsonResponse(200, { avatars: [readyAvatar(), readyAvatar({ id: 'avatar-2', name: '阿灿' })], mainId: 'avatar-1', quota: { used: 1, limit: 5 } })
    }
    if (url === '/api/avatars' && options.method === 'POST') return jsonResponse(200, { avatar: readyAvatar({ id: 'avatar-3', name: '白榆' }) })
    if (url === '/api/avatars/avatar-2/main') return jsonResponse(200, { avatars: [readyAvatar(), readyAvatar({ id: 'avatar-2', name: '阿灿' })], mainId: 'avatar-2' })
    if (url === '/api/avatars/avatar-2') return jsonResponse(200, { avatars: [readyAvatar()], mainId: 'avatar-1' })
    throw new Error(`unexpected ${url}`)
  }
  const list = await fetchAvatars({ getAccessToken: token, fetchImpl })
  assert.equal(list.avatars.length, 2)
  assert.equal(list.mainId, 'avatar-1')
  assert.deepEqual(list.quota, { used: 1, limit: 5 })
  assert.equal(mainAvatarOf(list.avatars, list.mainId).name, '林晚舟')

  const created = await createAvatar({ profile: { name: '白榆' }, getAccessToken: token, fetchImpl })
  assert.equal(created.id, 'avatar-3')
  const promoted = await setMainAvatar({ avatarId: 'avatar-2', getAccessToken: token, fetchImpl })
  assert.equal(promoted.mainId, 'avatar-2')
  const afterDelete = await deleteAvatar({ avatarId: 'avatar-2', getAccessToken: token, fetchImpl })
  assert.equal(afterDelete.avatars.length, 1)
  assert.deepEqual(seen.map((entry) => `${entry.method} ${entry.url}`), [
    'GET /api/avatars',
    'POST /api/avatars',
    'POST /api/avatars/avatar-2/main',
    'DELETE /api/avatars/avatar-2',
  ])
})

test('generateAvatar carries the target avatar and the repaint lock part', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, body: JSON.parse(options.body) }
    return jsonResponse(200, { avatar: readyAvatar() })
  }
  await generateAvatar({ profile: { name: '林晚舟' }, avatarId: 'avatar-9', lockPart: 'hairColor', getAccessToken: token, fetchImpl })
  assert.equal(request.url, '/api/avatar/generate')
  assert.equal(request.body.avatarId, 'avatar-9')
  assert.equal(request.body.lockPart, 'hairColor')
})

test('fetchAvatarObjectUrl addresses the painting by avatar id', async () => {
  let seenUrl = ''
  const fetchImpl = async (url) => {
    seenUrl = url
    return new Response(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), { status: 200 })
  }
  const avatar = readyAvatar({ id: 'avatar-url-check', portrait: { status: 'ready', version: 1, hasPrevious: false } })
  const url = await fetchAvatarObjectUrl({ avatar, getAccessToken: token, fetchImpl, createObjectURL: () => 'blob:fake-url' })
  assert.equal(url, 'blob:fake-url')
  assert.match(seenUrl, /avatarId=avatar-url-check/)
})

test('fetchAvatarObjectUrl honours portrait state, previous versions and its cache', async () => {
  const avatar = readyAvatar()
  let fetches = 0
  const revoked = []
  const fetchImpl = async (url) => {
    fetches += 1
    return new Response(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), { status: 200 })
  }
  const createObjectURL = (blob) => `blob:fake-${fetches}`
  const revokeObjectURL = (url) => revoked.push(url)
  const url = await fetchAvatarObjectUrl({ avatar, getAccessToken: token, fetchImpl, createObjectURL, revokeObjectURL })
  assert.equal(url, 'blob:fake-1')
  const cached = await fetchAvatarObjectUrl({ avatar, getAccessToken: token, fetchImpl, createObjectURL, revokeObjectURL })
  assert.equal(cached, 'blob:fake-1')
  assert.equal(fetches, 1, 'the same version is served from the cache')

  const previous = await fetchAvatarObjectUrl({ avatar, which: 'previous', getAccessToken: token, fetchImpl, createObjectURL, revokeObjectURL })
  assert.equal(previous, 'blob:fake-2')
  assert.ok(revoked.includes('blob:fake-1'), 'switching versions revokes the stale URL')

  const none = await fetchAvatarObjectUrl({ avatar: readyAvatar({ portrait: { status: 'none', version: 0, hasPrevious: false } }), getAccessToken: token, fetchImpl })
  assert.equal(none, null)
  const noPrevious = await fetchAvatarObjectUrl({ avatar: readyAvatar({ portrait: { status: 'ready', version: 1, hasPrevious: false } }), which: 'previous', getAccessToken: token, fetchImpl })
  assert.equal(noPrevious, null)
})
