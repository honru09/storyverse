import test from 'node:test'
import assert from 'node:assert/strict'
import { createGeminiGenerator, DEFAULT_MODEL } from '../server/gemini.js'
import { createStory, createMergedStory, buildChapter, chapterKey, acceptChapter, chooseBranch, FRIEND_BOOK } from '../src/story-engine.js'

const env = { GEMINI_API_KEY: 'test-key-never-used-on-network' }
const story = () => ({ ...createStory({ name: '阿遥' }), engine: 'gemini' })
const prose = () => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    '阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。',
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
})
const output = (opening = false) => ({
  ...prose(),
  ...(opening ? { worldBible: {
    premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
    rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
    endingAnchor: '阿遥需要决定如何保留城市的记忆，并在本卷终局为后来者留下可以继续选择的道路。',
    outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已做出的选择。`),
  } } : {}),
})
const response = (value, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 })
const acceptLocal = (current, index) => acceptChapter(current, buildChapter(current, index), chapterKey(current, index))

test('missing server key exposes only status and makes no provider request', async () => {
  let calls = 0
  const generator = createGeminiGenerator({ env: {}, fetchImpl: () => { calls += 1; throw new Error('must not call') } })
  assert.deepEqual(generator.status(), { configured: false, provider: 'gemini', model: DEFAULT_MODEL })
  await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === 503 && !error.message.includes('test-key'))
  assert.equal(calls, 0)
})

test('Vertex AI uses workload identity without requiring or exposing an API key', async () => {
  const current = story()
  let options
  const generator = createGeminiGenerator({
    env: {
      GENAI_BACKEND: 'vertex',
      GOOGLE_CLOUD_PROJECT: 'storyweave-fixture',
      GOOGLE_CLOUD_LOCATION: 'global',
    },
    vertexGenerate: async (request) => {
      options = request
      return { text: JSON.stringify(output(true)), finishReason: 'STOP' }
    },
  })

  assert.deepEqual(generator.status(), {
    configured: true,
    provider: 'vertex-ai',
    model: DEFAULT_MODEL,
    location: 'global',
  })
  const result = await generator.generate({ story: current, index: 0 })
  assert.equal(options.project, 'storyweave-fixture')
  assert.equal(options.location, 'global')
  assert.equal(options.model, DEFAULT_MODEL)
  assert.equal(options.config.responseMimeType, 'application/json')
  assert.ok(options.config.responseJsonSchema.required.includes('worldBible'))
  assert.ok(options.signal instanceof AbortSignal)
  assert.equal(result.chapter.title, prose().title)
  assert.deepEqual(result.worldBible, output(true).worldBible)
  assert.doesNotMatch(JSON.stringify(options), /api.?key/i)
})

test('opening uses documented REST JSON schema and returns preserved chapter protocol plus world bible', async () => {
  const current = story()
  const original = structuredClone(current)
  let call
  const generator = createGeminiGenerator({ env, fetchImpl: async (url, options) => {
    call = { url, options, body: JSON.parse(options.body) }
    return response(output(true))
  } })
  const result = await generator.generate({ story: current, index: 0 })
  assert.equal(call.url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`)
  assert.equal(call.options.headers['x-goog-api-key'], env.GEMINI_API_KEY)
  assert.ok(!call.url.includes(env.GEMINI_API_KEY))
  assert.equal(call.body.generationConfig.responseMimeType, 'application/json')
  assert.ok(call.body.generationConfig.responseJsonSchema.required.includes('worldBible'))
  assert.equal(call.body.tools, undefined)
  assert.ok(call.options.signal instanceof AbortSignal)
  assert.equal(result.key, chapterKey(current, 0))
  assert.equal(result.chapter.id, buildChapter(current, 0).id)
  assert.equal(result.chapter.choice, null)
  assert.deepEqual(result.worldBible, output(true).worldBible)
  assert.equal(acceptChapter(current, result.chapter, result.key).chapters.length, 1)
  assert.deepEqual(current, original)
  assert.ok(!JSON.stringify(result).includes(env.GEMINI_API_KEY))
})

test('decision chapter preserves exact application options and only one recent chapter of prose is sent', async () => {
  let current = acceptLocal(story(), 0)
  current.chapters[0].paragraphs = ['OLD_PROSE_THAT_MUST_NOT_LEAVE_AGAIN']
  current = acceptLocal(current, 1)
  current.chapters[1].paragraphs = ['MOST_RECENT_CHAPTER_CAN_BE_SENT']
  current = chooseBranch(current, 1, 'wait')
  current.unrelated = 'UNRELATED_PRIVATE_METADATA'
  current.config.extra = 'UNRELATED_CONFIG_SECRET'
  let input
  const generator = createGeminiGenerator({ env, fetchImpl: async (_url, options) => {
    input = JSON.parse(options.body).contents[0].parts[0].text
    return response(output())
  } })
  const result = await generator.generate({ story: current, index: 2 })
  assert.ok(input.includes('MOST_RECENT_CHAPTER_CAN_BE_SENT'))
  assert.ok(!input.includes('OLD_PROSE_THAT_MUST_NOT_LEAVE_AGAIN'))
  assert.ok(!input.includes('UNRELATED_PRIVATE_METADATA'))
  assert.ok(!input.includes('UNRELATED_CONFIG_SECRET'))
  assert.deepEqual(JSON.parse(input).choices, { 1: 'wait' })
  assert.equal(JSON.parse(input).summaries.length, 2)
  assert.equal(JSON.parse(input).beatPlan.chapterNumber, 3)
  assert.equal(JSON.parse(input).beatPlan.unlockedConsequences[0].choiceId, 'wait')
  assert.equal(result.worldBible, undefined)
  const decisionStory = acceptLocal(story(), 0)
  const decision = await generator.generate({ story: decisionStory, index: 1 })
  assert.deepEqual(decision.chapter.choice, buildChapter(decisionStory, 1).choice)
  assert.equal(decision.chapter.index, 1)
})

test('merged character context preserves both protagonists and merge options', async () => {
  const current = createMergedStory(story(), FRIEND_BOOK, { rules: 'separate', lead: 'b', bond: 'rivals' })
  current.mergeContext = [{
    genreId: 'mist',
    worldBible: { premise: 'FIRST_SOURCE_PREMISE', rules: ['FIRST_SOURCE_RULE'], endingAnchor: 'FIRST_SOURCE_ENDING', outline: ['FIRST_SOURCE_BEAT'] },
    summaries: [{ chapter: 1, summary: 'FIRST_SOURCE_HISTORY' }],
    choices: { 1: 'wait' },
    config: { hometown: 'PRIVATE_SOURCE_CONFIG' },
    chapters: [{ paragraphs: ['FULL_SOURCE_PROSE'] }],
  }, {
    genreId: 'cultivation',
    worldBible: { rules: ['SECOND_SOURCE_RULE'] },
    summaries: [], choices: {},
  }, { worldBible: { rules: ['FORBIDDEN_THIRD_WORLD'] } }]
  let context
  const generator = createGeminiGenerator({ env, fetchImpl: async (_url, options) => {
    context = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text)
    return response(output(true))
  } })
  await generator.generate({ story: current, index: 0 })
  assert.equal(context.config.protagonists.length, 2)
  assert.deepEqual(context.config.merge, { rules: 'separate', lead: 'b', bond: 'rivals' })
  assert.equal(context.sourceWorlds.length, 2)
  assert.deepEqual(context.sourceWorlds[0].worldBible.rules, ['FIRST_SOURCE_RULE'])
  assert.deepEqual(context.sourceWorlds[1].worldBible.rules, ['SECOND_SOURCE_RULE'])
  assert.equal(context.sourceWorlds[0].summaries[0].summary, 'FIRST_SOURCE_HISTORY')
  assert.deepEqual(context.sourceWorlds[0].choices, { 1: 'wait' })
  assert.doesNotMatch(JSON.stringify(context), /PRIVATE_SOURCE_CONFIG|FULL_SOURCE_PROSE|FORBIDDEN_THIRD_WORLD/)
})

test('server rejects invalid progress, unresolved earlier decisions and read-only stories before paid work', async () => {
  let calls = 0
  const generator = createGeminiGenerator({ env, fetchImpl: async () => { calls += 1; return response(output(true)) } })
  const initial = story()
  let undecided = acceptLocal(acceptLocal(initial, 0), 1)
  const forged = { ...undecided, chapters: [...undecided.chapters, buildChapter(undecided, 2)], chapterIndex: 3 }
  const cases = [
    [{ story: initial, index: 1 }, 409],
    [{ story: undecided, index: 2 }, 409],
    [{ story: forged, index: 3 }, 409],
    [{ story: { ...initial, readOnly: true }, index: 0 }, 403],
    [{ story: initial, index: 6 }, 400],
    [{ story: initial, index: '0' }, 400],
    [{ story: { ...initial, config: { name: {} } }, index: 0 }, 400],
    [{ story: initial, index: 0, apiKey: 'forbidden-client-key' }, 400],
  ]
  for (const [request, status] of cases) await assert.rejects(generator.generate(request), (error) => error.status === status)
  assert.equal(calls, 0)
})

test('in-flight deduplication and successful cache avoid repeated paid requests and mutation leaks', async () => {
  let resolve
  let calls = 0
  const generator = createGeminiGenerator({ env, fetchImpl: () => {
    calls += 1
    return new Promise((done) => { resolve = done })
  } })
  const request = { story: story(), index: 0 }
  const first = generator.generate(request)
  const second = generator.generate(request)
  assert.equal(calls, 1)
  resolve(response(output(true)))
  const results = await Promise.all([first, second])
  assert.deepEqual(results[0], results[1])
  results[0].chapter.title = 'mutated by caller'
  const cached = await generator.generate(request)
  assert.equal(cached.chapter.title, prose().title)
  assert.equal(calls, 1)
})

test('cache identity includes world context, not only story revision', async () => {
  let calls = 0
  const generator = createGeminiGenerator({ env, fetchImpl: async () => { calls += 1; return response(output(true)) } })
  const current = story()
  await generator.generate({ story: current, index: 0 })
  await generator.generate({ story: { ...current, worldBible: { ...current.worldBible, endingAnchor: 'A different ending anchor' } }, index: 0 })
  assert.equal(calls, 2)
})

test('expired and capacity-evicted cache entries are regenerated only on explicit request', async () => {
  let calls = 0
  let clock = 1000
  const generator = createGeminiGenerator({ env, cacheSize: 1, cacheTtlMs: 100, now: () => clock, fetchImpl: async () => { calls += 1; return response(output(true)) } })
  const first = { story: story(), index: 0 }
  const second = { story: story(), index: 0 }
  await generator.generate(first)
  await generator.generate(second)
  await generator.generate(first)
  assert.equal(calls, 3)
  clock += 101
  await generator.generate(first)
  assert.equal(calls, 4)
})

test('concurrency and sliding-window limits reject extra paid requests', async () => {
  let resolve
  let calls = 0
  const limited = createGeminiGenerator({ env, maxConcurrent: 1, fetchImpl: () => {
    calls += 1
    return new Promise((done) => { resolve = done })
  } })
  const first = limited.generate({ story: story(), index: 0 })
  await assert.rejects(limited.generate({ story: story(), index: 0 }), (error) => error.status === 429)
  resolve(response(output(true)))
  await first
  assert.equal(calls, 1)
  const byMinute = createGeminiGenerator({ env, maxRequestsPerMinute: 1, fetchImpl: async () => response(output(true)) })
  await byMinute.generate({ story: story(), index: 0 })
  await assert.rejects(byMinute.generate({ story: story(), index: 0 }), (error) => error.status === 429)
})

test('upstream failures are sanitized and never retried automatically', async () => {
  for (const [status, expected] of [[400, 503], [401, 503], [403, 503], [404, 503], [429, 429], [500, 502]]) {
    let calls = 0
    const generator = createGeminiGenerator({ env, fetchImpl: async () => {
      calls += 1
      return new Response(`SECRET ${env.GEMINI_API_KEY}`, { status })
    } })
    await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === expected && !error.message.includes('SECRET') && !error.message.includes(env.GEMINI_API_KEY))
    assert.equal(calls, 1)
  }
})

test('blocked, truncated, malformed and schema-invalid output never becomes a chapter', async () => {
  const cases = [
    () => response(output(true), 'MAX_TOKENS'),
    () => response(output(true), 'SAFETY'),
    () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })),
    () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] })),
    () => new Response('not-json'),
    () => response({ ...output(true), paragraphs: ['too short'] }),
    () => response({ ...output(true), title: 'x'.repeat(81) }),
    () => response({ ...output(true), choice: { options: [{ id: 'malicious' }] } }),
    () => response({ ...output(true), worldBible: { ...output(true).worldBible, outline: ['too short'] } }),
    () => new Response('x'.repeat(129 * 1024)),
  ]
  for (const invalid of cases) {
    let calls = 0
    const generator = createGeminiGenerator({ env, fetchImpl: async () => { calls += 1; return invalid() } })
    await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === 502)
    assert.equal(calls, 1)
  }
})

test('timeout aborts transport and reports retryable error without a second paid request', async () => {
  let calls = 0
  let signal
  const generator = createGeminiGenerator({ env, timeoutMs: 15, fetchImpl: async (_url, options) => {
    calls += 1
    signal = options.signal
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('SECRET timeout details')), { once: true }))
  } })
  await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === 504 && !error.message.includes('SECRET'))
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
})

const responseWithUsage = (value, usageMetadata) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
  usageMetadata,
}), { status: 200 })
const contextFrom = (options) => JSON.parse(JSON.parse(options.body).contents[0].parts[0].text)

test('opening injects the genre brief for an explicit template id and passes usage through', async () => {
  const current = { ...story(), genreTemplateId: 'xianxia' }
  const usageMetadata = { promptTokenCount: 900, candidatesTokenCount: 1200, thoughtsTokenCount: 300, cachedContentTokenCount: 0, totalTokenCount: 2400 }
  let context
  const generator = createGeminiGenerator({ env, fetchImpl: async (_url, options) => {
    context = contextFrom(options)
    return responseWithUsage(output(true), usageMetadata)
  } })
  const result = await generator.generate({ story: current, index: 0 })
  assert.equal(typeof context.genreBrief, 'string')
  assert.ok(context.genreBrief.includes('出身再低、灵根再差'))
  assert.equal(context.genreBeat, undefined)
  assert.equal(context.worldBible.outline.length, 6)
  assert.equal(result.genreTemplateId, 'xianxia')
  assert.deepEqual(result.usage, usageMetadata)
})

test('continuation injects only the chapter beat slice and compacts the outline', async () => {
  let current = acceptLocal(story(), 0)
  current = acceptLocal(current, 1)
  current = chooseBranch(current, 1, 'wait')
  current = {
    ...current,
    genreTemplateId: 'xianxia',
    worldBible: { ...current.worldBible, outline: ['OUTLINE_ONE', 'OUTLINE_TWO', 'OUTLINE_THREE', 'OUTLINE_FOUR', 'OUTLINE_FIVE', 'OUTLINE_SIX'] },
  }
  let context
  const generator = createGeminiGenerator({ env, fetchImpl: async (_url, options) => {
    context = contextFrom(options)
    return response(output())
  } })
  const result = await generator.generate({ story: current, index: 2 })
  assert.equal(context.genreBrief, undefined)
  assert.equal(typeof context.genreBeat, 'string')
  assert.ok(context.genreBeat.includes('小胜换来资源与立足之地'))
  assert.deepEqual(context.worldBible.outline, ['OUTLINE_THREE', 'OUTLINE_FOUR'])
  assert.equal(context.worldBible.premise, current.worldBible.premise)
  assert.deepEqual(context.worldBible.rules, current.worldBible.rules)
  assert.equal(result.genreTemplateId, 'xianxia')
  assert.equal(result.usage, 'unknown')
})

test('templates disabled by option leave context and result exactly as before', async () => {
  const current = { ...story(), genreTemplateId: 'xianxia' }
  let context
  const generator = createGeminiGenerator({ env, genreTemplates: null, fetchImpl: async (_url, options) => {
    context = contextFrom(options)
    return response(output(true))
  } })
  const result = await generator.generate({ story: current, index: 0 })
  assert.equal(context.genreBrief, undefined)
  assert.equal(context.genreBeat, undefined)
  assert.equal(context.worldBible.outline.length, 6)
  assert.equal(result.genreTemplateId, undefined)
  assert.equal(result.usage, 'unknown')
})

test('templates disabled by env switch leave context untouched', async () => {
  const current = { ...story(), genreTemplateId: 'xianxia' }
  let context
  const generator = createGeminiGenerator({
    env: { ...env, STORYWEAVE_GENRE_TEMPLATES: 'off' },
    fetchImpl: async (_url, options) => { context = contextFrom(options); return response(output(true)) },
  })
  const result = await generator.generate({ story: current, index: 0 })
  assert.equal(context.genreBrief, undefined)
  assert.equal(result.genreTemplateId, undefined)
})

test('engine genre mapping resolves a template when the story carries no template id', async () => {
  let context
  const generator = createGeminiGenerator({ env, fetchImpl: async (_url, options) => {
    context = contextFrom(options)
    return response(output(true))
  } })
  const result = await generator.generate({ story: story(), index: 0 })
  assert.equal(result.genreTemplateId, 'xuanhuan')
  assert.ok(context.genreBrief.includes('世界比想象中大得多'))
})

test('merged opening briefs from the lead template and borrows the other side archetypes', async () => {
  const current = createMergedStory(story(), FRIEND_BOOK, { rules: 'separate', lead: 'b', bond: 'rivals' })
  let context
  const generator = createGeminiGenerator({ env, fetchImpl: async (_url, options) => {
    context = contextFrom(options)
    return response(output(true))
  } })
  const result = await generator.generate({ story: current, index: 0 })
  assert.equal(result.genreTemplateId, 'xianxia')
  assert.ok(context.genreBrief.includes('主角·谨慎型草根修士'))
  assert.ok(context.genreBrief.includes('主角·沉稳型少年'))
})

test('Vertex usage metadata is normalised and passed through', async () => {
  const usageMetadata = { promptTokenCount: 800, candidatesTokenCount: 1500, thoughtsTokenCount: 200, totalTokenCount: 2500 }
  const generator = createGeminiGenerator({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'storyweave-fixture', GOOGLE_CLOUD_LOCATION: 'global' },
    genreTemplates: null,
    vertexGenerate: async () => ({ text: JSON.stringify(output(true)), finishReason: 'STOP', usageMetadata }),
  })
  const result = await generator.generate({ story: story(), index: 0 })
  assert.deepEqual(result.usage, { ...usageMetadata, cachedContentTokenCount: null })
})
