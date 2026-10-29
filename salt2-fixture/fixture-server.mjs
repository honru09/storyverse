// DEVICE-FIX measurement fixture: bookstore-plaza dev-server wiring
// plus a stubbed portrait painter, so profile picture kind 'avatar'
// (a ready portrait) exists locally. Memory stores, username sign-in.
import { PNG } from 'pngjs'
import { createServer } from '../server/index.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createPlazaFeedService } from '../server/plaza-feed.js'
import { createMemoryPlazaFeedStore } from '../server/plaza-feed-store.js'
import { fileURLToPath } from 'node:url'

function tinyPng(seed = 90) {
  const png = new PNG({ width: 120, height: 160 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = seed
    png.data[index + 1] = 140
    png.data[index + 2] = 70
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
const generator = {
  status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }),
  generate: async () => { throw new Error('fixture: generation must never be invoked by the walk') },
}

const avatarStore = createMemoryAvatarStore()
const plazaStore = createMemoryPlazaStore()
const coverStore = createMemoryCoverStore()
const feedStore = createMemoryPlazaFeedStore()
const socialStore = createMemorySocialStore()
const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
const social = createSocialService({ env: {}, store: socialStore, plazaStore, avatarStore, feedStore })
const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore: social })

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const server = createServer({
  env,
  generator,
  distDir,
  library: createLibraryService({ env: {}, store: createMemoryLibraryStore() }),
  avatar: createAvatarService({
    env: { ...env, GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-fixture-123' },
    store: avatarStore,
    imageGenerate: async () => ({ buffer: tinyPng(120), mimeType: 'image/png', usage: null }),
  }),
  plaza,
  plazaStore,
  coverStore,
  social,
  plazaFeed,
})
const port = Number(process.env.PORT || 8947)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`device-fix fixture listening on http://127.0.0.1:${port}\n`)
})
