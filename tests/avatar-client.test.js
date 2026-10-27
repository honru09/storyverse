import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAvatar, fetchAvatarObjectUrl, generateAvatar, saveAvatar } from '../src/avatar.js'

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
