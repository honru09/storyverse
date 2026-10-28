// BILLING fixture server: the real server with memory stores and the
// username sign-in channel, so the membership chain runs locally with
// no paid calls. The daily ceilings are shrunk (free 1,000 tokens,
// member 100,000) so one fixture chapter exactly fills the free
// ceiling and the ceiling → credit → membership order is observable.
// The generator is a stub that reports fixed usage; it never touches
// the network.
import { createServer } from '../server/index.js'
import { fileURLToPath } from 'node:url'

const env = {
  AUTH_ENABLED: 'true',
  DATA_STORE: 'memory',
  GENERATION_DAILY_TOKEN_CAP: '1000',
  MEMBER_DAILY_TOKEN_CAP: '100000',
}
const generator = {
  status: () => ({ configured: true, provider: 'gemini', model: 'gemini-3.8-flash' }),
  generate: async (body) => ({
    chapter: { id: `ch-${body.index}`, index: body.index, title: '夹具章', paragraphs: ['夹具正文。'] },
    key: 'fixture-key',
    usage: { promptTokenCount: 600, candidatesTokenCount: 300, thoughtsTokenCount: 100, totalTokenCount: 1000 },
  }),
}
const server = createServer({
  env,
  generator,
  distDir: fileURLToPath(new URL('../dist/', import.meta.url)),
})
const port = Number(process.env.PORT || 8943)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`billing fixture listening on http://127.0.0.1:${port}\n`)
})
