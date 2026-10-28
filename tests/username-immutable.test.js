// USERNAME-IMMUTABLE （用户名不可变，2026-10-28 user rule): the @ID is
// fixed the moment it exists. For a username account the @ID IS the
// login name (carried by the uid `username:<name>`); for every other
// account it is the handle they claimed. saveMyProfile (PUT
// /api/me/profile) refuses to move it — rename and clear alike —
// with a 400 the editor surfaces, instead of silently ignoring the
// field. Display name and bio stay editable, a first claim (no @ID
// yet) still goes through shape / uniqueness / shadowing validation,
// and checkHandle tells a locked owner the truth. Registration
// itself is untouched and covered by the username-auth suites.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemorySocialStore } from '../server/social-store.js'
import { createSocialService } from '../server/social.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'

function makeService() {
  const identityStore = createMemoryIdentityStore()
  const service = createSocialService({
    env: {},
    store: createMemorySocialStore(),
    plazaStore: createMemoryPlazaStore(),
    avatarStore: createMemoryAvatarStore(),
    identityStore,
  })
  return { service, identityStore }
}

async function refuses(promise, status, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status)
    assert.match(error.message, pattern)
    return true
  })
}

test('username account: the login name is the @ID and no profile update moves it', async () => {
  const { service } = makeService()
  const keeper = { uid: 'username:gate_keeper' }

  const before = await service.profile(keeper, keeper.uid)
  assert.equal(before.handle, 'gate_keeper', 'the @ID starts as the login username')

  await refuses(service.saveMyProfile(keeper, { handle: 'other_name' }), 400, /不能修改/)
  await refuses(service.saveMyProfile(keeper, { handle: null }), 400, /不能修改/)
  await refuses(service.saveMyProfile(keeper, { handle: '' }), 400, /不能修改/)

  // Round-tripping the current @ID is a no-op success, and the login
  // name is never duplicated into the profile record.
  const roundTrip = await service.saveMyProfile(keeper, { handle: 'gate_keeper' })
  assert.equal(roundTrip.handle, 'gate_keeper')
  assert.equal(roundTrip.editable.handle, '', 'the record stays empty; the uid carries the name')

  // Nickname and bio remain editable under the lock (regression).
  const renamed = await service.saveMyProfile(keeper, { displayName: '守门人', bio: '看门，也看书。' })
  assert.equal(renamed.displayName, '守门人')
  assert.equal(renamed.bio, '看门，也看书。')
  assert.equal(renamed.handle, 'gate_keeper')

  const after = await service.profile(keeper, keeper.uid)
  assert.equal(after.handle, 'gate_keeper')
})

test('claimed handle: a first claim establishes the @ID, afterwards it is locked', async () => {
  const { service } = makeService()
  const reader = { uid: 'google:reader-1' }

  const claimed = await service.saveMyProfile(reader, { handle: 'First_ID' })
  assert.equal(claimed.handle, 'first_id', 'claims still normalise to lowercase')

  await refuses(service.saveMyProfile(reader, { handle: 'second_id' }), 400, /不能修改/)
  await refuses(service.saveMyProfile(reader, { handle: null }), 400, /不能修改/)

  const roundTrip = await service.saveMyProfile(reader, { handle: 'first_id' })
  assert.equal(roundTrip.handle, 'first_id')

  const renamed = await service.saveMyProfile(reader, { displayName: '读者一号', bio: '简介照旧。' })
  assert.equal(renamed.displayName, '读者一号')
  assert.equal(renamed.bio, '简介照旧。')
  assert.equal(renamed.handle, 'first_id')

  const other = await service.checkHandle(reader, 'second_id')
  assert.equal(other.available, false)
  assert.match(other.message, /不能修改/)
  const own = await service.checkHandle(reader, 'first_id')
  assert.equal(own.available, true)
})

test('first claim still validates shape, uniqueness and login-name shadowing', async () => {
  const { service, identityStore } = makeService()
  await identityStore.putUser('gate_keeper', { username: 'gate_keeper' })
  const a = { uid: 'google:claim-a' }
  const b = { uid: 'google:claim-b' }

  await refuses(service.saveMyProfile(a, { handle: 'Has Space' }), 400, /用户名只能用/)
  await refuses(service.saveMyProfile(a, { handle: 'ab' }), 400, /用户名只能用/)
  await refuses(service.saveMyProfile(a, { handle: 'gate_keeper' }), 409, /已经被占用/,
    'a first claim may not shadow a login username')

  const claimed = await service.saveMyProfile(a, { handle: 'shared_id' })
  assert.equal(claimed.handle, 'shared_id')
  await refuses(service.saveMyProfile(b, { handle: 'shared_id' }), 409, /已经被占用/,
    'a first claim may not take a handle another profile already holds')

  const taken = await service.checkHandle(b, 'shared_id')
  assert.equal(taken.available, false)
  const free = await service.checkHandle(b, 'still_free')
  assert.equal(free.available, true)
})
