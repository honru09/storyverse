// REQ-57 screenshot fixture server: the real server with memory stores
// shared explicitly across services (under DATA_STORE=memory the factory
// defaults would hand every service its own island, and the publish
// ownership check would never find the avatar). The chapter generator
// is a stub that must never be invoked: publishable lines are built
// locally by the screenshot script.
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

const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
const generator = {
  status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }),
  generate: async () => { throw new Error('fixture: generation must never be invoked by the walk') },
}

const avatarStore = createMemoryAvatarStore()
const plazaStore = createMemoryPlazaStore()
const coverStore = createMemoryCoverStore()
const feedStore = createMemoryPlazaFeedStore()
const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
const social = createSocialService({ env: {}, store: createMemorySocialStore(), plazaStore, avatarStore, feedStore })
const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore: social })

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const server = createServer({
  env,
  generator,
  distDir,
  library: createLibraryService({ env: {}, store: createMemoryLibraryStore() }),
  avatar: createAvatarService({ env: {}, store: avatarStore }),
  plaza,
  plazaStore,
  coverStore,
  social,
  plazaFeed,
})
const port = Number(process.env.PORT || 8942)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`avatar-ability fixture listening on http://127.0.0.1:${port}\n`)
})
