import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from '../server/index.js'
import { buildChapter, chapterKey, createStory } from '../src/story-engine.js'

const configuredStatus = { configured: true, provider: 'gemini', model: 'fixture-model' }
const developmentOrigin = 'http://localhost:5173'
const sampleStory = () => createStory({ name: '回声', genreId: 'mist' })
const resultFor = ({ story, index }) => ({
  chapter: buildChapter(story, index),
  key: chapterKey(story, index),
})

test('oversized chunked bodies return a readable 413 without reaching the provider', async (t) => {
  const { base, calls } = await startServer(t)
  const received = await new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/api/generate`, {
      method: 'POST', headers: { Origin: developmentOrigin, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => resolve({ status: response.statusCode, raw }))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.write('x'.repeat(200 * 1024))
    request.end('x'.repeat(100 * 1024))
  })
  assert.equal(received.status, 413)
  assert.equal(typeof JSON.parse(received.raw).error, 'string')
  assert.equal(calls.length, 0)
})

async function startServer(t, overrides = {}) {
  const calls = []
  const generator = {
    status: () => configuredStatus,
    generate: async (request) => {
      calls.push(request)
      return resultFor(request)
    },
  }
  const server = createServer({
    env: {},
    generator,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
    ...overrides,
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return { base: `http://127.0.0.1:${server.address().port}`, calls }
}

function generate(base, body, origin = developmentOrigin, contentType = 'application/json') {
  const headers = { 'Content-Type': contentType }
  if (origin !== undefined && origin !== null) headers.Origin = origin
  return fetch(`${base}/api/generate`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

test('status without credentials is readable without making any provider request', async (t) => {
  const { base } = await startServer(t, { generator: undefined })
  const response = await fetch(`${base}/api/status`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  const status = await response.json()
  assert.equal(status.configured, false)
  assert.equal(status.provider, 'gemini')
  assert.equal(typeof status.model, 'string')
  assert.equal('apiKey' in status, false)
})

test('health endpoint is independent from model configuration', async (t) => {
  const { base } = await startServer(t, { generator: undefined })
  const response = await fetch(`${base}/healthz`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test('Cloud Run accepts its forwarded HTTPS same-origin request', async (t) => {
  const { base, calls } = await startServer(t, { env: { K_SERVICE: 'storyweave' } })
  const response = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: {
      Host: 'storyweave-example.a.run.app',
      'X-Forwarded-Host': 'storyweave-example.a.run.app',
      Origin: 'https://storyweave-example.a.run.app',
      'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ story: sampleStory(), index: 0 }),
  })
  assert.equal(response.status, 200)
  await response.json()
  assert.equal(calls.length, 1)
})

test('generation returns a chapter and matching key for the submitted story', async (t) => {
  const { base, calls } = await startServer(t)
  const story = sampleStory()
  const response = await generate(base, { story, index: 0 })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await response.json(), resultFor({ story, index: 0 }))
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].story, story)
  assert.equal(calls[0].index, 0)
})

test('the explicit local development origins can generate chapters', async (t) => {
  const { base, calls } = await startServer(t)
  for (const origin of [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ]) {
    const response = await generate(base, { story: sampleStory(), index: 0 }, origin)
    assert.equal(response.status, 200, origin)
    await response.json()
  }
  assert.equal(calls.length, 4)
})

test('the configured app and same-server origins can generate chapters', async (t) => {
  const { base, calls } = await startServer(t, { env: { APP_ORIGIN: 'https://stories.example' } })
  for (const origin of ['https://stories.example', base]) {
    const response = await generate(base, { story: sampleStory(), index: 0 }, origin)
    assert.equal(response.status, 200, origin)
    await response.json()
  }
  assert.equal(calls.length, 2)
})

test('foreign, deceptive, null, and missing origins never reach the generator', async (t) => {
  const { base, calls } = await startServer(t)
  for (const origin of [
    'https://foreign.example',
    'http://localhost:5173.foreign.example',
    'http://localhost:51730',
    'null',
    null,
  ]) {
    const response = await generate(base, { story: sampleStory(), index: 0 }, origin)
    assert.equal(response.status, 403, `origin ${String(origin)}`)
    await response.text()
  }
  assert.equal(calls.length, 0)
})

test('non-JSON and malformed JSON requests do not reach the generator', async (t) => {
  const { base, calls } = await startServer(t)
  const wrongType = await generate(base, '{}', developmentOrigin, 'text/plain')
  assert.equal(wrongType.status, 415)
  await wrongType.text()
  for (const body of ['{"story":', '', 'null', '[]', '{}']) {
    const response = await generate(base, body)
    assert.equal(response.status, 400, `body ${JSON.stringify(body)}`)
    await response.text()
  }
  assert.equal(calls.length, 0)
})

test('requests exceeding 256 KiB are rejected before generation', async (t) => {
  const { base, calls } = await startServer(t)
  const response = await generate(base, {
    story: sampleStory(),
    index: 0,
    padding: 'x'.repeat(256 * 1024),
  })
  assert.equal(response.status, 413)
  await response.text()
  assert.equal(calls.length, 0)
})

test('provider failures expose a generic error without credentials or a stack trace', async (t) => {
  const secret = 'fixture-only-secret-never-disclose'
  const { base } = await startServer(t, {
    generator: {
      status: () => configuredStatus,
      generate: async () => { throw new Error(`Provider failed: ${secret}`) },
    },
  })
  const response = await generate(base, { story: sampleStory(), index: 0 })
  assert.equal(response.status, 502)
  assert.match(response.headers.get('content-type'), /application\/json/)
  const raw = await response.text()
  assert.doesNotMatch(raw, new RegExp(secret))
  assert.doesNotMatch(raw, /Provider failed|gemini-server\.test|"stack"/)
  assert.ok(JSON.parse(raw).error)
})

test('unknown API paths return 404 even when the app has a static fallback', async (t) => {
  const { base, calls } = await startServer(t)
  const response = await fetch(`${base}/api/not-a-route`)
  assert.equal(response.status, 404)
  await response.text()
  assert.equal(calls.length, 0)
})

test('static hosting serves the built app but not hidden files or paths outside dist', async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'storyverse-server-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const distDir = join(fixtureRoot, 'dist')
  await mkdir(join(distDir, 'assets'), { recursive: true })
  await mkdir(join(fixtureRoot, 'src'))
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Story fixture</title>')
  await writeFile(join(distDir, 'assets', 'app.js'), 'export const ready = true;')
  await writeFile(join(distDir, 'manifest.webmanifest'), JSON.stringify({ name: 'Story fixture', display: 'standalone' }))
  await writeFile(join(distDir, '.env'), 'SHOULD_NOT_BE_SERVED=private-fixture')
  await writeFile(join(fixtureRoot, 'secret.txt'), 'private-outside-fixture')
  await writeFile(join(fixtureRoot, 'src', 'main.jsx'), 'private-source-fixture')
  const { base } = await startServer(t, { distDir })

  for (const path of ['/', '/read/a-story']) {
    const response = await fetch(`${base}${path}`)
    assert.equal(response.status, 200, path)
    assert.match(response.headers.get('content-type'), /text\/html/)
    assert.match(await response.text(), /Story fixture/)
  }
  const asset = await fetch(`${base}/assets/app.js`)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type'), /javascript/)
  assert.equal(await asset.text(), 'export const ready = true;')
  const manifest = await fetch(`${base}/manifest.webmanifest`)
  assert.equal(manifest.status, 200)
  assert.match(manifest.headers.get('content-type'), /^application\/manifest\+json/)
  assert.deepEqual(await manifest.json(), { name: 'Story fixture', display: 'standalone' })

  for (const path of ['/.env', '/src/main.jsx', '/assets/missing.js', '/%2e%2e%2fsecret.txt', '/%2e%2e%5csecret.txt', '/api/missing']) {
    const response = await fetch(`${base}${path}`)
    assert.ok(response.status >= 400 && response.status < 500, `${path}: ${response.status}`)
    assert.doesNotMatch(await response.text(), /private-fixture|private-outside-fixture|private-source-fixture/)
  }
})
