import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStory, buildChapter, chapterKey, acceptChapter, chooseBranch } from '../src/story-engine.js'
import { acceptGeneratedChapter, generationStatus, mergeSourceContext, nextGenerationIndex, requestChapter } from '../src/generation.js'

const fresh = () => ({ ...createStory({ name: '旅人' }), engine: 'gemini' })
const resultFor = (story, index) => ({ chapter: buildChapter(story, index), key: chapterKey(story, index) })
const append = (story, index) => acceptChapter(story, buildChapter(story, index), chapterKey(story, index))

test('Gemini window stays one chapter ahead and stops at a decision', () => {
  let story = fresh()
  assert.equal(nextGenerationIndex(story), 0)
  story = append(story, 0)
  assert.equal(nextGenerationIndex(story), 1)
  story = append(story, 1)
  assert.equal(nextGenerationIndex(story), null)
  assert.equal(nextGenerationIndex(story, 1), null)
  story = chooseBranch(story, 1, 'open')
  assert.equal(nextGenerationIndex(story, 1), 2)
  assert.equal(nextGenerationIndex({ ...story, readOnly: true }, 1), null)
  assert.equal(nextGenerationIndex({ ...story, engine: 'local' }, 1), null)
})

test('late answers never restore a rewritten branch; preserve current bookmark', () => {
  let story = append(append(fresh(), 0), 1)
  story = chooseBranch(story, 1, 'open')
  const result = resultFor(story, 2)
  const rewritten = chooseBranch(story, 1, 'wait')
  assert.equal(acceptGeneratedChapter(rewritten, result), rewritten)
  const current = { ...story, bookmarked: true, readerIndex: 1 }
  const next = acceptGeneratedChapter(current, result)
  assert.equal(next.bookmarked, true)
  assert.equal(next.readerIndex, 1)
})

test('generated chapter validates nested prose before accepting', () => {
  const story = fresh()
  const result = resultFor(story, 0)
  result.chapter.paragraphs = [{}]
  assert.throws(() => acceptGeneratedChapter(story, result), /格式/)
})

test('opening accepts the planned world bible', () => {
  const story = fresh()
  const bible = { ...story.worldBible, premise: '这是一个完全不同的世界。' }
  const next = acceptGeneratedChapter(story, { ...resultFor(story, 0), worldBible: bible })
  assert.deepEqual(next.worldBible, bible)
})

test('request validates key and chapter index; never silently falls back', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  const fetchImpl = async () => Response.json(result)
  assert.deepEqual(await requestChapter(story, 0, { fetchImpl }), result)
  await assert.rejects(requestChapter(story, 0, { fetchImpl: async () => Response.json({ ...result, key: 'wrong' }) }), /不匹配/)
})

test('request errors are safe and retries are user initiated', async () => {
  let calls = 0
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl: async () => { calls++; return Response.json({ error: 'secret server info' }, { status: 429 }) } }), /请求较多/)
  assert.equal(calls, 1)
})

test('cancelled request does not report a network failure', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(requestChapter(fresh(), 0, { signal: controller.signal, fetchImpl: async (_url, { signal }) => { signal.throwIfAborted() } }), { name: 'AbortError' })
})

test('service unavailable keeps preset experience usable', async () => {
  assert.equal((await generationStatus({ fetchImpl: async () => Response.json({ configured: true }) })).configured, true)
  assert.equal((await generationStatus({ fetchImpl: async () => { throw new Error('offline') } })).configured, false)
})

test('merge context is bounded and does not transmit entire chapters or metadata', () => {
  const story = append(fresh(), 0)
  story.unknownSecret = 'not a story fact'
  story.chapters[0].paragraphs = ['private full text']
  const context = mergeSourceContext(story)
  assert.equal(context.worldBible.premise, story.worldBible.premise)
  assert.equal(context.summaries.length, 1)
  assert.equal(JSON.stringify(context).includes('private full text'), false)
  assert.equal(context.unknownSecret, undefined)
})

test('accepted chapter remembers the genre template id returned by the server', () => {
  const story = fresh()
  const next = acceptGeneratedChapter(story, { ...resultFor(story, 0), genreTemplateId: 'xianxia' })
  assert.equal(next.genreTemplateId, 'xianxia')
  const untouched = acceptGeneratedChapter(story, resultFor(story, 0))
  assert.equal(untouched.genreTemplateId, undefined)
})

test('chapter requests carry the pinned genre template id to the server', async () => {
  const story = { ...createStory({ name: '旅人', genreId: 'frontier', genreTemplateId: 'scifi' }), engine: 'gemini' }
  let sent
  const fetchImpl = async (_url, options) => {
    sent = JSON.parse(options.body)
    return Response.json(resultFor(story, 0))
  }
  await requestChapter(story, 0, { fetchImpl })
  assert.equal(sent.story.genreTemplateId, 'scifi')
  assert.equal(sent.story.config.genreTemplateId, 'scifi')
  assert.equal(sent.index, 0)
})

test('chapter requests attach the current access token when one is available', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  let headers
  const fetchImpl = async (_url, options) => { headers = options.headers; return Response.json(result) }
  await requestChapter(story, 0, { fetchImpl, getAccessToken: async () => 'session-token-1' })
  assert.equal(headers.Authorization, 'Bearer session-token-1')
  await requestChapter(story, 0, { fetchImpl, getAccessToken: async () => null })
  assert.equal(headers.Authorization, undefined, 'guests send no authorization header')
  await requestChapter(story, 0, { fetchImpl, getAccessToken: async () => { throw new Error('token store unavailable') } })
  assert.equal(headers.Authorization, undefined, 'a failing token source never blocks the request itself')
})

test('a 401 from generation tells the user to sign in first and fires the hook once', async () => {
  let prompts = 0
  const fetchImpl = async () => Response.json({ error: 'server copy is not shown', code: 'auth-required' }, { status: 401 })
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl, onAuthRequired: () => { prompts++ } }), /请先登录，再继续在线创作/)
  assert.equal(prompts, 1)
  const bareFetch = async () => Response.json({ error: 'x' }, { status: 401 })
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl: bareFetch }), /请先登录/)
})

test('the daily quota response maps to a clear quota message, not the generic 429 copy', async () => {
  const fetchImpl = async () => Response.json({ error: 'server copy is not shown', code: 'quota-exceeded' }, { status: 429 })
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl }), /今天的生成额度已用完/)
})

test('season pre-generation: gated by the previous decision, one chapter only, keyed by the choice', () => {
  let current = { ...createStory({ name: '旅人', genreId: 'mist', storyLengthMode: 'season' }), engine: 'gemini' }
  current = acceptGeneratedChapter(current, resultFor(current, 0))
  current = acceptGeneratedChapter(current, resultFor(current, 1))
  // Chapter two ends on a decision: while it is undecided nothing is prepared.
  assert.equal(nextGenerationIndex(current, 1), null)
  current = chooseBranch(current, 1, 'open')
  // Decided: exactly the next chapter becomes eligible, and only when the
  // reader is within one chapter of the frontier.
  assert.equal(nextGenerationIndex(current, 1), 2)
  assert.equal(nextGenerationIndex(current, 0), null)
  // The cache key is the choice signature: rewriting the decision changes it.
  const keyBefore = chapterKey(current, 2)
  current = chooseBranch(current, 1, 'wait')
  assert.notEqual(chapterKey(current, 2), keyBefore)
  assert.equal(nextGenerationIndex(current, 1), 2)
})

test('pre-generation stops at the end of a season', () => {
  let current = { ...createStory({ name: '旅人', genreId: 'mist', storyLengthMode: 'season' }), engine: 'gemini' }
  for (let index = 0; index < 24; index += 1) {
    current = acceptGeneratedChapter(current, resultFor(current, index))
    const choice = buildChapter(current, index).choice
    if (choice && index < 23) current = chooseBranch(current, index, choice.options[0].id)
  }
  assert.equal(current.chapters.length, 24)
  assert.equal(nextGenerationIndex(current, 23), null)
})
