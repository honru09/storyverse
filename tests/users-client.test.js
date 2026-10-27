import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchUserProfile,
  followUser,
  sendPresenceHeartbeat,
  userPortraitPath,
} from '../src/users.js'
import { fetchPlazaFeed } from '../src/plaza.js'
import { parseRoute, routeHash } from '../src/navigation.js'

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

test('profile routes round-trip uids, including username-prefixed ones', () => {
  for (const uid of ['firebaseAbc123', 'username:social_author', 'em_0123456789abcdef']) {
    assert.deepEqual(parseRoute(routeHash({ view: 'profile', id: uid })), { view: 'profile', id: uid })
  }
  assert.deepEqual(parseRoute('#/profile'), { view: 'plaza' })
  assert.deepEqual(parseRoute('#/profile/%'), { view: 'plaza' })
})

test('fetchUserProfile hits the profile route and sends the credential when one exists', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return jsonResponse(200, { profile: { uid: 'username:a', counts: { following: 0, followers: 0, publications: 0 } } })
  }
  const profile = await fetchUserProfile({ uid: 'username:a', getAccessToken: async () => 'tok-1', fetchImpl })
  assert.equal(profile.uid, 'username:a')
  assert.equal(calls[0].url, '/api/users/username%3Aa/profile')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok-1')

  await assert.rejects(
    () => fetchUserProfile({ uid: 'ghost', fetchImpl: async () => jsonResponse(404, { error: '这位用户还不存在。' }) }),
    (error) => error.code === 'not-found',
  )
})

test('followUser maps the auth-required failure for the login prompt', async () => {
  await assert.rejects(
    () => followUser({ uid: 'username:a', fetchImpl: async () => jsonResponse(401, { error: '请先登录，再关注。', code: 'auth-required' }) }),
    (error) => error.code === 'auth-required',
  )
  const result = await followUser({
    uid: 'username:a',
    getAccessToken: async () => 'tok-2',
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/users/username%3Aa/follow')
      assert.equal(options.method, 'POST')
      return jsonResponse(200, { following: true, followers: 3 })
    },
  })
  assert.deepEqual(result, { following: true, followers: 3 })
})

test('presence heartbeat stays silent without a credential and never throws', async () => {
  let called = 0
  const fetchImpl = async () => { called += 1; return jsonResponse(200, { ok: true }) }
  assert.equal(await sendPresenceHeartbeat({ getAccessToken: async () => null, fetchImpl }), false)
  assert.equal(called, 0, 'no credential, no request')
  assert.equal(await sendPresenceHeartbeat({ getAccessToken: async () => 'tok-3', fetchImpl }), true)
  assert.equal(called, 1)
  assert.equal(await sendPresenceHeartbeat({
    getAccessToken: async () => 'tok-3',
    fetchImpl: async () => { throw new Error('offline') },
  }), false)
})

test('userPortraitPath is profile-scoped; the plaza feed now carries the online count', async () => {
  assert.equal(userPortraitPath('username:a'), '/api/users/username%3Aa/portrait')
  const feed = await fetchPlazaFeed({
    fetchImpl: async (url) => {
      assert.equal(url, '/api/plaza')
      return jsonResponse(200, { publications: [{ id: 'pub-1' }], onlineCount: 2 })
    },
  })
  assert.deepEqual(feed, { publications: [{ id: 'pub-1' }], onlineCount: 2 })
  const legacy = await fetchPlazaFeed({
    fetchImpl: async () => jsonResponse(200, { publications: [] }),
  })
  assert.deepEqual(legacy, { publications: [], onlineCount: 0 }, 'an older payload still parses, count defaults to 0')
})

test('profile editor calls: update, picture upload, handle check, report', async () => {
  const { updateMyProfile, uploadMyPicture, checkHandleAvailable, reportUser, userPicturePath } =
    await import('../src/users.js')
  assert.equal(userPicturePath('username:a'), '/api/users/username%3Aa/picture')
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.startsWith('/api/me/handle')) return jsonResponse(200, { available: true, message: '这个用户名可以用。' })
    return jsonResponse(200, { profile: { uid: 'username:a', displayName: '夜行者' } })
  }
  const token = async () => 'tok-9'
  const profile = await updateMyProfile({ patch: { displayName: '夜行者' }, getAccessToken: token, fetchImpl })
  assert.equal(profile.displayName, '夜行者')
  assert.equal(calls[0].url, '/api/me/profile')
  assert.equal(calls[0].options.method, 'PUT')
  const uploaded = await uploadMyPicture({ image: 'AAAA', contentType: 'image/jpeg', getAccessToken: token, fetchImpl })
  assert.equal(uploaded.uid, 'username:a')
  assert.equal(calls[1].url, '/api/me/profile/picture')
  const check = await checkHandleAvailable({ handle: 'night_walker', getAccessToken: token, fetchImpl })
  assert.equal(check.available, true)
  assert.equal(calls[2].url, '/api/me/handle?value=night_walker')
  const reported = await reportUser({ uid: 'username:b', getAccessToken: token, fetchImpl })
  assert.deepEqual(reported, { profile: { uid: 'username:a', displayName: '夜行者' } })
  assert.equal(calls[3].url, '/api/users/username%3Ab/report')
})

test('a 409 from the profile editor surfaces as a conflict with the server message', async () => {
  const { updateMyProfile } = await import('../src/users.js')
  await assert.rejects(
    () => updateMyProfile({
      patch: { handle: 'taken_name' },
      getAccessToken: async () => 'tok-9',
      fetchImpl: async () => jsonResponse(409, { error: '这个用户名已经被占用了，换一个试试。' }),
    }),
    (error) => error.code === 'conflict' && /已经被占用/.test(error.message),
  )
})
