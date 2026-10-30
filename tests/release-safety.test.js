import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from '../server/index.js'

const configuredStatus = { configured: true, provider: 'vertex-ai', model: 'fixture-model', location: 'global' }
// REQ-69: an anonymous /api/status answer is availability only —
// provider, model and location are stripped server-side.
const anonymousStatus = { configured: true }
const pausedStatus = {
  configured: false,
  reason: 'generation-disabled',
  message: '在线创作暂未开放。你仍可阅读已有故事和体验预设故事。',
}
const requestBody = { story: { id: 'release-fixture' }, index: 0 }

async function serve(t, options = {}) {
  const calls = { status: 0, generate: 0, external: 0 }
  const server = createServer({
    env: {},
    generator: {
      status() { calls.status += 1; return configuredStatus },
      async generate(body) { calls.generate += 1; return { fixture: true, index: body.index } },
    },
    fetchImpl: async () => { calls.external += 1; throw new Error('Unexpected external request') },
    ...options,
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    calls,
    post: (body = requestBody, headers = {}) => fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  }
}

test('explicit generation pause reports a safe unavailable reason without consulting the provider', async (t) => {
  const { base, calls } = await serve(t, {
    env: { GENERATION_ENABLED: 'false', GEMINI_API_KEY: 'private-fixture-value' },
    generator: {
      status() { throw new Error('Provider status must not run while paused') },
      generate() { throw new Error('Provider generation must not run while paused') },
    },
  })
  const response = await fetch(`${base}/api/status`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const result = await response.json()
  assert.deepEqual(result, pausedStatus)
  assert.doesNotMatch(JSON.stringify(result), /private-fixture|API_KEY|credentials/)
  assert.equal(calls.external, 0)
})

test('explicit generation pause rejects a valid request before invoking the generator', async (t) => {
  const { post, calls } = await serve(t, { env: { GENERATION_ENABLED: 'false' } })
  const response = await post()
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { error: pausedStatus.message })
  assert.deepEqual(calls, { status: 0, generate: 0, external: 0 })
})

test('paused generation rejects before parsing malformed, oversized or non-JSON bodies', async (t) => {
  const { post, calls } = await serve(t, { env: { GENERATION_ENABLED: 'false' } })
  for (const [body, headers] of [
    ['{"story":', {}],
    ['not-json', { 'Content-Type': 'text/plain' }],
    [{ ...requestBody, padding: 'x'.repeat(256 * 1024) }, {}],
  ]) {
    const response = await post(body, headers)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: pausedStatus.message })
  }
  assert.deepEqual(calls, { status: 0, generate: 0, external: 0 })
})

test('Cloud Run same-origin headers, bearer tokens and client flags cannot bypass the pause', async (t) => {
  const { post, calls } = await serve(t, { env: { GENERATION_ENABLED: 'false', K_SERVICE: 'storyweave' } })
  const response = await post({ ...requestBody, generationEnabled: true, paid: true }, {
    Host: 'story-fixture.a.run.app',
    Origin: 'https://story-fixture.a.run.app',
    'X-Forwarded-Host': 'story-fixture.a.run.app',
    'X-Forwarded-Proto': 'https',
    Authorization: 'Bearer fixture-only',
    'GENERATION_ENABLED': 'true',
  })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: pausedStatus.message })
  assert.deepEqual(calls, { status: 0, generate: 0, external: 0 })
})

test('paused generation preserves health, auth configuration and the static reading app', async (t) => {
  const distDir = await mkdtemp(join(tmpdir(), 'storyweave-release-fixture-'))
  t.after(() => rm(distDir, { recursive: true, force: true }))
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Reading is available</title>')
  const { base, calls } = await serve(t, { env: { GENERATION_ENABLED: 'false' }, distDir })
  for (const path of ['/api/health', '/healthz']) {
    const response = await fetch(`${base}${path}`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  }
  const auth = await fetch(`${base}/api/auth/config`)
  assert.equal(auth.status, 200)
  assert.equal((await auth.json()).enabled, false)
  const page = await fetch(base)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Reading is available/)
  assert.deepEqual(calls, { status: 0, generate: 0, external: 0 })
})

for (const [label, env] of [
  ['unset flag preserves historical behavior', {}],
  ['explicit true preserves configured generation', { GENERATION_ENABLED: 'true' }],
]) {
  test(label, async (t) => {
    const { base, post, calls } = await serve(t, { env })
    const status = await fetch(`${base}/api/status`)
    assert.equal(status.status, 200)
    assert.deepEqual(await status.json(), anonymousStatus)
    const response = await post()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { fixture: true, index: 0 })
    assert.deepEqual(calls, { status: 1, generate: 1, external: 0 })
  })
}
