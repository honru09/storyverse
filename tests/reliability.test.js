import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createGeminiGenerator } from '../server/gemini.js'
import { createServer } from '../server/index.js'
import { acceptChapter, buildChapter, chapterKey, createStory, outlineLengthFor } from '../src/story-engine.js'
import { acceptGeneratedChapter } from '../src/generation.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'

// RELIABILITY batch (2026-10-27): server-side self-healing for chapter
// generation. The fault-injection stubs below never touch the network.

const devEnv = { GEMINI_API_KEY: 'test-key-never-used-on-network' }
const vertexEnv = { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'storyweave-fixture', GOOGLE_CLOUD_LOCATION: 'global' }
const story = () => ({ ...createStory({ name: '阿遥' }), engine: 'gemini' })
const prose = (opening = false, outlineLength = 6) => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    '阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。',
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
  events: ['阿遥在白潮港听见异常钟声，掌心留下银色潮痕。'],
  foreshadowing: ['雾里敞开的门还没有关上。'],
  ...(opening ? {
    worldBible: {
      premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
      rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
      endingAnchor: '阿遥需要决定如何保留城市的记忆，并在终局为后来者留下可以继续选择的道路。',
      outline: Array.from({ length: outlineLength }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已经付出的代价。`),
    },
  } : {}),
})
const devResponse = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })
const noSleep = async () => {}

test('a transient 429 then an upstream 500 heal inside one generate call', async () => {
  const failures = [429, 500]
  const delays = []
  let calls = 0
  const generator = createGeminiGenerator({
    env: devEnv,
    sleep: async (ms) => { delays.push(ms) },
    random: () => 0.5,
    fetchImpl: async () => {
      calls += 1
      if (failures.length) return new Response('upstream trouble', { status: failures.shift() })
      return devResponse(prose(true))
    },
  })
  const result = await generator.generate({ story: story(), index: 0 })
  assert.equal(result.chapter.title, '潮汐尽头的来信')
  assert.equal(calls, 3)
  // Jittered exponential backoff: base 1200ms, doubling, jitter factor
  // exactly 1.0 at random() = 0.5.
  assert.deepEqual(delays, [1200, 2400])
})

test('a deadline timeout is retried with a fresh transport and can still land the chapter', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env: devEnv,
    timeoutMs: 20,
    sleep: noSleep,
    fetchImpl: async (_url, options) => {
      calls += 1
      if (calls === 1) {
        return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
      }
      return devResponse(prose(true))
    },
  })
  const result = await generator.generate({ story: story(), index: 0 })
  assert.equal(result.chapter.title, '潮汐尽头的来信')
  assert.equal(calls, 2)
})

test('vertex rate limits retry on the primary channel before any fallback is considered', async () => {
  const locations = []
  let calls = 0
  const generator = createGeminiGenerator({
    env: vertexEnv,
    sleep: noSleep,
    vertexGenerate: async (request) => {
      calls += 1
      locations.push(request.location)
      if (calls === 1) throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 })
      return { text: JSON.stringify(prose(true)), finishReason: 'STOP' }
    },
  })
  const result = await generator.generate({ story: story(), index: 0 })
  assert.equal(result.degraded, undefined)
  assert.deepEqual(locations, ['global', 'global'])
})

test('fallback channel writes the chapter after the primary is exhausted, and the chapter says so', async () => {
  const locations = []
  const generator = createGeminiGenerator({
    env: vertexEnv,
    sleep: noSleep,
    vertexGenerate: async (request) => {
      locations.push(request.location)
      if (request.location === 'global') throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 })
      return { text: JSON.stringify(prose(true)), finishReason: 'STOP' }
    },
  })
  const current = story()
  const result = await generator.generate({ story: current, index: 0 })
  // Primary: 1 initial + 2 retries; fallback: exactly one attempt.
  assert.deepEqual(locations, ['global', 'global', 'global', 'us-central1'])
  assert.equal(result.degraded, true)
  assert.equal(result.chapter.degraded, true)
  // The marker survives the client's own acceptance path and validation.
  const accepted = acceptGeneratedChapter(current, result)
  assert.equal(accepted.chapters[0].degraded, true)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [accepted] }), [])
})

test('a failing fallback surfaces the primary error, never a worse one', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env: vertexEnv,
    sleep: noSleep,
    vertexGenerate: async () => {
      calls += 1
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 })
    },
  })
  await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === 429)
  assert.equal(calls, 4)
})

test('configuration failures never retry and never reach the fallback channel', async () => {
  const locations = []
  const generator = createGeminiGenerator({
    env: vertexEnv,
    sleep: noSleep,
    vertexGenerate: async (request) => {
      locations.push(request.location)
      throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 })
    },
  })
  await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === 503)
  assert.deepEqual(locations, ['global'])
})

test('malformed model output is deterministic: no retry, no fallback', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env: devEnv,
    sleep: noSleep,
    fetchImpl: async () => {
      calls += 1
      return devResponse({ ...prose(true), title: 'x'.repeat(81) })
    },
  })
  await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === 502)
  assert.equal(calls, 1)
})

test('a cache hit returns the same generation flagged non-enumerably, so it is never metered twice', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env: devEnv,
    fetchImpl: async () => {
      calls += 1
      return devResponse(prose(true))
    },
  })
  const request = { story: story(), index: 0 }
  const first = await generator.generate(request)
  const second = await generator.generate(request)
  assert.equal(calls, 1)
  assert.equal(first.cached, undefined)
  assert.equal(second.cached, true)
  // The flag must not leak into the wire format the client receives.
  assert.ok(!JSON.stringify(second).includes('cached'))
  assert.equal(second.chapter.title, first.chapter.title)
})

test('joining an in-flight generation shares the one provider call and flags the joiner', async () => {
  let calls = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const generator = createGeminiGenerator({
    env: devEnv,
    fetchImpl: async () => {
      calls += 1
      await gate
      return devResponse(prose(true))
    },
  })
  const request = { story: story(), index: 0 }
  const firstPromise = generator.generate(request)
  const secondPromise = generator.generate(request)
  release()
  const [first, second] = await Promise.all([firstPromise, secondPromise])
  assert.equal(calls, 1)
  assert.equal(first.cached, undefined)
  assert.equal(second.cached, true)
  assert.equal(second.chapter.title, first.chapter.title)
})

// Regression (COLDSTART §3): assembling the generation context for the
// last chapters of a finite line used to throw a RangeError that the
// route wrapped as a traceless 502 — a 24-chapter season could not be
// finished. Walk a whole season and a long line's final chapters through
// the real generator with a stubbed provider and pin that they land.
test('the final chapters of a 24-chapter season and a 100-chapter long line generate cleanly', async () => {
  // The walk fires a season's worth of requests inside a second, so the
  // harness lifts the generator's own per-minute/concurrency guards —
  // they are production protections, not what this regression is about.
  const chapterGenerator = createGeminiGenerator({
    env: vertexEnv,
    sleep: noSleep,
    maxConcurrent: 100,
    maxRequestsPerMinute: 10_000,
    vertexGenerate: async () => ({ text: JSON.stringify(prose(false)), finishReason: 'STOP' }),
  })
  const walk = async (initial, indexes) => {
    let current = initial
    for (const index of indexes) {
      const result = await chapterGenerator.generate({ story: current, index })
      const next = acceptChapter(current, result.chapter, result.key)
      assert.notEqual(next, current, `chapter ${index + 1} must be accepted`)
      current = next
    }
    return current
  }
  // A whole season through the stub provider: the opening with its
  // season-sized outline, then every remaining chapter — the last three
  // are the ones the old context assembly could not build.
  const season = { ...createStory({ name: '阿遥', genreId: 'mist', storyLengthMode: 'season' }), engine: 'gemini' }
  const openingGenerator = createGeminiGenerator({
    env: vertexEnv,
    sleep: noSleep,
    maxConcurrent: 100,
    maxRequestsPerMinute: 10_000,
    vertexGenerate: async () => ({
      text: JSON.stringify(prose(true, outlineLengthFor(season))),
      finishReason: 'STOP',
    }),
  })
  const opening = await openingGenerator.generate({ story: season, index: 0 })
  let current = { ...acceptChapter(season, opening.chapter, opening.key), worldBible: opening.worldBible }
  assert.equal(current.chapters.length, 1)
  current = await walk(current, Array.from({ length: 23 }, (_, i) => i + 1))
  assert.equal(current.chapters.length, 24)

  // A long line: local chapters up to 97, then the final three through
  // the stub provider.
  const long = { ...createStory({ name: '阿遥', genreId: 'mist', storyLengthMode: 'long' }), engine: 'gemini' }
  let longCurrent = long
  for (let index = 0; index < 97; index += 1) {
    longCurrent = acceptChapter(longCurrent, buildChapter(longCurrent, index), chapterKey(longCurrent, index))
  }
  assert.equal(longCurrent.chapters.length, 97)
  longCurrent = await walk(longCurrent, [97, 98, 99])
  assert.equal(longCurrent.chapters.length, 100)
})

test('the HTTP layer meters a fresh generation once, skips cache hits, and logs unclassified faults with a stack', async (t) => {
  const recorded = []
  const auth = {
    config: () => ({ enabled: true, firebase: { authDomain: 'fixture.example' } }),
    requiresIdentity: () => true,
    identity: async () => ({ uid: 'reader-1' }),
    usageDailyTotal: async () => 0,
    dailyTokenCap: () => 1_000_000,
    recordUsage: async (uid, usage) => { recorded.push({ uid, usage }) },
  }
  const usage = { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 0, cachedContentTokenCount: 0, totalTokenCount: 30 }
  const start = async (generate) => {
    const server = createServer({ env: {}, auth, generator: { status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }), generate } })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    })
    return `http://127.0.0.1:${server.address().port}`
  }
  const post = (base) => fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ story: createStory({ name: '回声', genreId: 'mist' }), index: 0 }),
  })
  const resultFor = (request, extra = {}) => {
    const result = { chapter: buildChapter(request.story, request.index), key: chapterKey(request.story, request.index), usage, ...extra }
    return result
  }

  // Fresh generation: metered.
  let base = await start(async (request) => resultFor(request))
  let response = await post(base)
  assert.equal(response.status, 200)
  assert.equal(recorded.length, 1)

  // Cache hit (flag carried non-enumerably, exactly as the real
  // generator marks it): answered, but NOT metered a second time.
  base = await start(async (request) => {
    const result = resultFor(request)
    Object.defineProperty(result, 'cached', { value: true, configurable: true })
    return result
  })
  response = await post(base)
  assert.equal(response.status, 200)
  assert.equal(recorded.length, 1)
  assert.ok(!('cached' in JSON.parse(await response.text())), 'the cached flag itself must not reach the wire')

  // Degraded (fallback-written) generation: a real generation, metered.
  base = await start(async (request) => resultFor(request, { degraded: true }))
  response = await post(base)
  assert.equal(response.status, 200)
  assert.equal(recorded.length, 2)

  // Unclassified fault: generic 502 copy for the client, full stack in
  // the server log.
  const captured = []
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { captured.push(String(chunk)); return true }
  try {
    base = await start(async () => { throw new Error('boom-fixture-fault') })
    response = await post(base)
  } finally {
    process.stderr.write = originalWrite
  }
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error, '服务暂时无法完成请求，请稍后重试。')
  const logLine = captured.find((line) => line.includes('generation-route-error'))
  assert.ok(logLine, 'the route must log the unclassified fault')
  assert.ok(logLine.includes('boom-fixture-fault'))
  assert.ok(logLine.includes('stack'))
})

test('the created HTTP server no longer cuts generation at 70 seconds', async (t) => {
  const server = createServer({ env: {}, generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } } })
  t.after(() => { server.closeAllConnections() })
  assert.equal(server.requestTimeout, 300_000)
})

test('waiting surfaces carry the staged progress contract', () => {
  const generation = readFileSync(new URL('../src/components/GenerationOverlay.jsx', import.meta.url), 'utf8')
  for (const stage of ['准备', '构思', '落笔', '成章']) assert.ok(generation.includes(`"${stage}"`), `generation stages include ${stage}`)
  assert.ok(generation.includes('createPortal'), 'generation overlay renders through a portal')
  assert.ok(generation.includes('generation-progress'), 'generation overlay has a progress bar')
  assert.ok(generation.includes('仍在生成中'), 'generation overlay has the honest slow-wait line')
  const rendered = generation.slice(generation.indexOf('return createPortal'))
  assert.ok(!/\d%/.test(rendered), 'no fabricated percentage numerals in the rendered wait')
  const intervention = readFileSync(new URL('../src/components/InterventionOverlay.jsx', import.meta.url), 'utf8')
  assert.ok(intervention.includes('createPortal'), 'intervention overlay renders through a portal')
  assert.ok(intervention.includes('intervention-progress'), 'intervention overlay has a progress bar')
  const css = readFileSync(new URL('../src/aurora.css', import.meta.url), 'utf8')
  assert.match(css, /\.generation-overlay\{[^}]*100dvh[^}]*place-items:safe center/)
  assert.match(css, /\.intervention-overlay\{[^}]*100dvh[^}]*place-items:safe center/)
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.ok(main.includes('本章由备用通道生成'), 'the frontier card discloses a fallback-written chapter')
  const client = readFileSync(new URL('../src/generation.js', import.meta.url), 'utf8')
  assert.ok(client.includes('AbortSignal.timeout(290_000)'), 'the client wait matches the server budget')
})
