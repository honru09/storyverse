// POSTER-AVATAR fixture server: the real server with memory stores and
// the username sign-in channel. The account `posterwalk` is pre-seeded
// with one avatar whose painting is the batch's poster sample (the
// 沈知遥 key visual in ~/workspace/sw-prep/poster-avatar/), so the
// profile stage can be screenshotted carrying a real poster portrait —
// the fake light rig (spot / floor / glow) must be gone from the DOM
// and the painting itself must fill the stage. No paid calls.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../server/index.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createSocialService } from '../server/social.js'
import { createIdentityStore } from '../server/identity-store.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const samplePath = path.join(here, '..', '..', 'sw-prep', 'poster-avatar', 'shenzhiyao-poster.png')
const sample = fs.readFileSync(samplePath)

const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory', AVATAR_DAILY_LIMIT: '50' }
const generator = {
  status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }),
  generate: async () => { throw new Error('fixture: generation must never be invoked by the walk') },
}

const avatarStore = createMemoryAvatarStore()
const avatar = createAvatarService({
  env: { ...env, GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-fixture-123' },
  store: avatarStore,
  imageGenerate: async () => { throw new Error('fixture: no painting in this walk') },
})

const UID = 'username:posterwalk'
const seeded = {
  id: 'avatar-poster0001',
  name: '沈知遥',
  description: '沉潮港的灯塔守夜人，听得见潮汐与回声。',
  appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'coat', shoes: 'boots', face: 'tear-mole', faceNote: '' },
  portrait: { status: 'ready', version: 2, hasPrevious: false, updatedAt: '2026-10-28T00:00:00.000Z' },
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
}
await avatarStore.putProfile(UID, { uid: UID, avatar: seeded })
await avatarStore.putImage(UID, 'current', {
  uid: UID,
  slot: 'current',
  version: 2,
  contentType: 'image/png',
  image: sample.toString('base64'),
  bytes: sample.length,
  updatedAt: '2026-10-28T00:00:00.000Z',
})

// The profile page resolves the stage through the social service,
// which keeps its OWN avatar store unless one is injected — share the
// seeded store (and one identity store) exactly as production shares
// Firestore, or the stage would swear the account has no avatar.
const social = createSocialService({ env, avatarStore, identityStore: createIdentityStore({ env }) })

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const server = createServer({ env, generator, avatar, social, distDir })
const port = Number(process.env.PORT || 8937)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`poster fixture listening on http://127.0.0.1:${port}\n`)
})
