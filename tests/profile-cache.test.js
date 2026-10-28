import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearProfileCache,
  loadProfile,
  markProfileIntroSeen,
  peekProfile,
  profileIntroSeen,
  profileViewState,
  rememberProfile,
  rememberProfileViewState,
  subscribeProfile,
} from '../src/profile-cache.js'

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

test('first load fetches; second load serves the cache instantly and revalidates in the background (A5)', async () => {
  clearProfileCache()
  let calls = 0
  let version = 1
  const fetchImpl = async () => {
    calls += 1
    return jsonResponse(200, { profile: { uid: 'u-1', displayName: `名字 v${version}`, counts: { followers: version, following: 0, publications: 0 } } })
  }
  const first = await loadProfile({ uid: 'u-1', fetchImpl })
  assert.equal(first.displayName, '名字 v1')
  assert.equal(calls, 1)
  assert.equal(peekProfile({ uid: 'u-1' }).displayName, '名字 v1')

  version = 2
  const seen = []
  const unsubscribe = subscribeProfile({ uid: 'u-1' }, (profile) => seen.push(profile.displayName))
  const second = await loadProfile({ uid: 'u-1', fetchImpl })
  assert.equal(second.displayName, '名字 v1', 'the cached copy resolves immediately')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(calls, 2, 'a background revalidation ran')
  assert.deepEqual(seen, ['名字 v2'], 'subscribers hear the fresher payload')
  assert.equal(peekProfile({ uid: 'u-1' }).displayName, '名字 v2')
  unsubscribe()
})

test('the cache key includes the viewer: follow state never leaks across accounts', async () => {
  clearProfileCache()
  rememberProfile({ viewerUid: 'me', profile: { uid: 'them', viewerState: { isSelf: false, isFollowing: true } } })
  assert.equal(peekProfile({ viewerUid: 'me', uid: 'them' }).viewerState.isFollowing, true)
  assert.equal(peekProfile({ viewerUid: 'someone-else', uid: 'them' }), null)
  assert.equal(peekProfile({ uid: 'them' }), null)
})

test('rememberProfile is the write-through for edits and follow toggles', async () => {
  clearProfileCache()
  const seen = []
  subscribeProfile({ viewerUid: 'me', uid: 'me' }, (profile) => seen.push(profile.displayName))
  rememberProfile({ viewerUid: 'me', profile: { uid: 'me', displayName: '新名字' } })
  assert.deepEqual(seen, ['新名字'])
  assert.equal(peekProfile({ viewerUid: 'me', uid: 'me' }).displayName, '新名字')
})

test('view-state memory keeps segment and scroll per uid (B4)', () => {
  assert.equal(profileViewState('u-9'), null)
  rememberProfileViewState('u-9', { segment: 'all', scrollTop: 420 })
  rememberProfileViewState('u-9', { shelfQuery: '潮' })
  assert.deepEqual(profileViewState('u-9'), { segment: 'all', scrollTop: 420, shelfQuery: '潮' })
  assert.equal(profileViewState('u-10'), null)
})

test('the entrance stagger is a once-per-uid ceremony', () => {
  assert.equal(profileIntroSeen('u-7'), false)
  markProfileIntroSeen('u-7')
  assert.equal(profileIntroSeen('u-7'), true)
  assert.equal(profileIntroSeen('u-8'), false)
})
