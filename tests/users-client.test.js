import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cancelFriendRequest,
  fetchFriends,
  fetchUserProfile,
  followUser,
  publicDisplayName,
  publicHandle,
  respondFriendRequest,
  searchPeople,
  sendFriendRequest,
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

test('friend client calls hit the friend routes with the credential and bodies intact', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.startsWith('/api/users/search')) return jsonResponse(200, { mode: url.includes('email=') ? 'email' : 'name', people: [{ uid: 'username:b' }], total: 1 })
    if (url === '/api/me/friends') return jsonResponse(200, { friends: [], incoming: [], outgoing: [], counts: { friends: 0, incomingPending: 0 } })
    return jsonResponse(200, { state: 'pending-out' })
  }
  const getAccessToken = async () => 'tok-f'

  const found = await searchPeople({ q: 'b', getAccessToken, fetchImpl })
  assert.equal(calls[0].url, '/api/users/search?q=b')
  assert.equal(calls[0].options.headers.Authorization, "Bearer " + "tok-f")
  assert.equal(found.people[0].uid, 'username:b')

  const byEmail = await searchPeople({ email: 'pal@example.com', getAccessToken, fetchImpl })
  assert.equal(calls[1].url, '/api/users/search?email=pal%40example.com')
  assert.equal(byEmail.mode, 'email')

  const box = await fetchFriends({ getAccessToken, fetchImpl })
  assert.equal(calls[2].url, '/api/me/friends')
  assert.deepEqual(box.counts, { friends: 0, incomingPending: 0 })

  const sent = await sendFriendRequest({ uid: 'username:b', message: '你好', getAccessToken, fetchImpl })
  assert.equal(calls[3].url, '/api/users/username%3Ab/friend-request')
  assert.deepEqual(JSON.parse(calls[3].options.body), { message: '你好' })
  assert.equal(sent.state, 'pending-out')

  await respondFriendRequest({ uid: 'username:b', accept: true, getAccessToken, fetchImpl })
  assert.equal(calls[4].url, '/api/users/username%3Ab/friend-request/respond')
  assert.deepEqual(JSON.parse(calls[4].options.body), { accept: true })

  await cancelFriendRequest({ uid: 'username:b', getAccessToken, fetchImpl })
  assert.equal(calls[5].url, '/api/users/username%3Ab/friend-request/cancel')
})

test('a 429 surfaces the throttle message instead of the generic failure', async () => {
  await assert.rejects(
    () => searchPeople({
      email: 'probe@example.com',
      getAccessToken: async () => 'tok-f',
      fetchImpl: async () => jsonResponse(429, { error: '用邮箱找人太频繁了，请稍后再试。' }),
    }),
    (error) => /太频繁/.test(error.message),
  )
})

test('publicDisplayName never prints an email as a profile title', () => {
  // A legacy payload whose display name IS the account email renders
  // the avatar's name instead — the exact live bug this guards.
  assert.equal(publicDisplayName({ displayName: '2066647277@qq.com', avatar: { name: '阿灿' } }), '阿灿')
  assert.equal(publicDisplayName({ displayName: 'boss@qq.com', avatar: null }), '未命名旅人')
  assert.equal(publicDisplayName({ displayName: '', avatar: { name: '沈砚' } }), '沈砚')
  assert.equal(publicDisplayName({ displayName: '夜航船主', avatar: { name: '阿灿' } }), '夜航船主')
  assert.equal(publicDisplayName({}), '未命名旅人')
  assert.equal(publicDisplayName(null), '未命名旅人')
})

test('publicHandle drops email-shaped handles entirely', () => {
  assert.equal(publicHandle({ handle: 'night_sail' }), 'night_sail')
  assert.equal(publicHandle({ handle: 'boss@qq.com' }), '')
  assert.equal(publicHandle({ handle: '' }), '')
  assert.equal(publicHandle({}), '')
  assert.equal(publicHandle(null), '')
})
