// AVATAR-SWITCH (2026-10-31): the server contract behind the
// other-profile showcase switcher. The user's phone report —
// "in someone else's profile, from the 3rd avatar on only the
// name changes, the picture doesn't" — could not be reproduced
// anywhere (see AVATAR-SWITCH-FIX.md), but the surface depends on
// one crisp contract, pinned here so it can never silently rot:
// for an owner with >=4 painted avatars, the public profile
// payload must carry one summary per avatar, each with its OWN
// portraitUrl (its own avatar id in the query), and the portrait
// endpoint logic must answer a DIFFERENT painting per avatar id
// for both the original and the portrait derivative variant.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createAvatarService } from '../server/avatar.js'
import { createSocialService } from '../server/social.js'

const owner = { uid: 'user-switch-owner', email: null, displayName: '房主', emailVerified: false, provider: 'username' }
const viewer = { uid: 'user-switch-viewer', email: null, displayName: '访客', emailVerified: false, provider: 'username' }

function tintedPng(seed) {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 40 + seed * 40
    png.data[index + 1] = 200 - seed * 30
    png.data[index + 2] = 90
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')

test('avatar-switch contract: >=4 avatars — distinct payload URLs, distinct paintings per avatar id', async () => {
  const avatarStore = createMemoryAvatarStore()
  let paints = 0
  const avatarService = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123', AVATAR_DAILY_LIMIT: '50' },
    store: avatarStore,
    imageGenerate: async () => {
      paints += 1
      return { buffer: tintedPng(paints), mimeType: 'image/png', usage: null }
    },
  })
  const social = createSocialService({
    env: {},
    store: createMemorySocialStore(),
    plazaStore: createMemoryPlazaStore(),
    avatarStore,
  })

  const created = []
  for (const name of ['甲', '乙', '丙', '丁']) {
    const item = await avatarService.create(owner, { profile: { name, description: `${name}号化身。` } })
    await avatarService.generate(owner, { profile: item, avatarId: item.id })
    created.push(item)
  }
  assert.equal(created.length, 4)

  const payload = await social.profile(viewer, owner.uid)
  assert.equal(payload.avatars.length, 4, 'payload carries every avatar')
  assert.deepEqual(payload.avatars.map((item) => item.id), created.map((item) => item.id), 'payload order matches creation order')

  const urls = payload.avatars.map((item) => item.portraitUrl)
  for (const [index, item] of payload.avatars.entries()) {
    assert.equal(item.hasPortrait, true, `avatar ${index + 1} reports a painting`)
    assert.ok(urls[index].includes(`avatar=${item.id}`), `avatar ${index + 1} URL names its own id: ${urls[index]}`)
  }
  assert.equal(new Set(urls).size, 4, 'every avatar carries a DISTINCT portraitUrl')

  // The endpoint logic behind those URLs: a different painting
  // per avatar id, for the original and for the REQ-73 portrait
  // derivative the showcase actually displays.
  for (const variant of [null, 'portrait']) {
    const digests = []
    for (const item of created) {
      const image = await social.portrait(owner.uid, item.id, variant)
      assert.ok(image?.buffer?.length > 0, `variant=${variant} avatar=${item.id} answers a painting`)
      digests.push(sha(image.buffer))
    }
    assert.equal(new Set(digests).size, 4, `variant=${variant}: four avatars, four different paintings`)
  }

  // And the main avatar (no avatar id) still resolves to avatar 1.
  const main = await social.portrait(owner.uid, null, 'portrait')
  const first = await social.portrait(owner.uid, created[0].id, 'portrait')
  assert.equal(sha(main.buffer), sha(first.buffer), 'bare portrait URL is the main avatar')
})
