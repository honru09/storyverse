// RATINGS fixture server: the real server with memory stores and the
// username sign-in channel, so the shelve → rate → edit → notify
// chain runs locally with no paid calls. Stores are shared
// explicitly: under DATA_STORE=memory the factory defaults would hand
// every service its own island, and the ratings service, the social
// service's notification derivation and the publish ownership check
// would never see each other's records. The chapter generator is a
// stub that must never be invoked: the publishable line is built
// locally by the e2e script.
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
import { createBookRatingsService } from '../server/book-ratings.js'
import { createMemoryBookRatingsStore } from '../server/book-ratings-store.js'
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
const ratingsStore = createMemoryBookRatingsStore()
const socialStore = createMemorySocialStore()
const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore })
const social = createSocialService({ env: {}, store: socialStore, plazaStore, avatarStore, feedStore, ratingsStore })
const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore: social })
const ratings = createBookRatingsService({ env: {}, store: ratingsStore, books: plaza, socialStore, avatarStore })

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
  ratings,
})
const port = Number(process.env.PORT || 8943)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`ratings fixture listening on http://127.0.0.1:${port}\n`)
})
