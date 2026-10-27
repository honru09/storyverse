import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createGeminiGenerator } from '../server/gemini.js'
import { createServer } from '../server/index.js'
import {
  INTERVENTION_CHIPS,
  INTERVENTION_TEXT_MAX,
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createMergedStory,
  createStory,
  finishEndlessLine,
  interventionTargetIndex,
  queueIntervention,
  queuedInterventionsFor,
  retractChapter,
  replaceChapter,
} from '../src/story-engine.js'
import { acceptRevisedChapter, requestChapterRevision } from '../src/generation.js'

// ---------------------------------------------------------------------------
// 介入批次： choices retired, interventions target the next unread chapter
// only, prepared chapters are revised in place, queues combine, and a
// revision is charged like any other generation.
// ---------------------------------------------------------------------------

const env = { GEMINI_API_KEY: 'test-key-never-used-on-network' }
const accept = (story, index) => acceptChapter(story, buildChapter(story, index), chapterKey(story, index))
const prose = () => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    '阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。',
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
})
const response = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })
const generatorCapturing = (capture) => createGeminiGenerator({
  env,
  fetchImpl: async (_url, options) => {
    capture.input = JSON.parse(options.body).contents[0].parts[0].text
    return response(prose())
  },
})

test('(a) no length mode emits a choice anymore — chapters are minted choice-free', () => {
  for (const mode of ['short', 'season', 'long', 'endless', 'custom']) {
    const story = createStory({ genreId: 'mist', storyLengthMode: mode, ...(mode === 'custom' ? { targetChapters: 12 } : {}) })
    const indices = mode === 'short' ? [0, 1, 2, 3, 5] : [0, 1, 2, 3, 5, 7]
    for (const index of indices) {
      assert.equal(buildChapter(story, index).choice, null, `${mode} chapter ${index + 1}`)
    }
  }
  const merged = createMergedStory(createStory({ name: '甲' }), createStory({ name: '乙', genreId: 'cultivation' }))
  for (let index = 0; index < 6; index += 1) assert.equal(buildChapter(merged, index).choice, null)
})

test('(b) targeting: an intervention names the next unread chapter and nothing else', () => {
  const story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  assert.equal(interventionTargetIndex(story, 0), 1)
  assert.equal(interventionTargetIndex(story, 1), 2)
  const queued = queueIntervention(story, { text: '让雾在午夜散开一次', readerIndex: 1 })
  assert.equal(queued.interventions[0].targetIndex, 2)
  assert.equal(queued.interventions[0].status, 'queued')
  // A finished line has no next chapter: the target is null and queueing
  // refuses with the ended-line explanation.
  let finished = createStory({ name: '阿遥' })
  for (let index = 0; index < 6; index += 1) finished = accept(finished, index)
  assert.equal(interventionTargetIndex(finished, 5), null)
  assert.throws(() => queueIntervention(finished, { text: '再改一点', readerIndex: 5 }), /已经走完/)
  // An endless line always has a next chapter — until its owner ends it.
  const endless = createStory({ genreId: 'mist', storyLengthMode: 'endless' })
  assert.equal(interventionTargetIndex(endless, 40), 41)
  const endedEndless = finishEndlessLine(endless)
  assert.equal(interventionTargetIndex(endedEndless, 0), null)
  // Behind the frontier there is nothing to aim at: with four chapters
  // written, a reader back on chapter one cannot target chapter two —
  // chapters three and four already stand on it.
  let deep = accept(accept(accept(accept(createStory({ name: '阿遥' }), 0), 1), 2), 3)
  assert.equal(interventionTargetIndex(deep, 0), null)
  assert.equal(interventionTargetIndex(deep, 2), 3)
  assert.equal(interventionTargetIndex(deep, 3), 4)
  assert.throws(() => queueIntervention(deep, { text: '改一改过去', readerIndex: 0 }), /阅读前沿/)
  // Empty text is not an intervention.
  assert.throws(() => queueIntervention(story, { text: '   ', readerIndex: 0 }), /先写下/)
})

test('(b) immutability: retract and replace refuse the current and earlier chapters', () => {
  let story = accept(accept(accept(createStory({ name: '阿遥' }), 0), 1), 2)
  story = { ...story, readerIndex: 1 }
  const before = JSON.stringify(story)
  // The chapter being read (index 1 with the reader on it) and anything
  // before it cannot be retracted or replaced, whatever the caller asks.
  assert.strictEqual(retractChapter(story, 0), story)
  assert.strictEqual(retractChapter(story, 1), story)
  const onChapter = { ...story, readerIndex: 2 }
  assert.strictEqual(retractChapter(onChapter, 2), onChapter)
  const forged = { ...buildChapter(story, 1), paragraphs: ['被改写的过去。'] }
  assert.strictEqual(replaceChapter(story, forged, chapterKey(story, 1)), story)
  assert.equal(JSON.stringify(story), before)
  // Only the frontier chapter (prepared, unread) may be retracted.
  const retracted = retractChapter(story, 2)
  assert.equal(retracted.chapters.length, 2)
  assert.deepEqual(retracted.chapters.map((chapter) => chapter.index), [0, 1])
})

test('(c) revision path: retract the prepared chapter, rebuild it with the nudge woven in', () => {
  let story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  const readChapter = story.chapters[0]
  const preparedBefore = story.chapters[1]
  story = queueIntervention(story, { text: '让灯塔的灯今晚熄灭一次', readerIndex: 0 })
  const retracted = retractChapter(story, 1)
  assert.equal(retracted.chapters.length, 1)
  const rebuilt = accept(retracted, 1)
  assert.deepEqual(rebuilt.chapters[0], readChapter, 'the read chapter is untouched, word for word')
  assert.notDeepEqual(rebuilt.chapters[1].paragraphs, preparedBefore.paragraphs)
  assert.ok(rebuilt.chapters[1].paragraphs.join('').includes('让灯塔的灯今晚熄灭一次'))
  assert.deepEqual(rebuilt.chapters[1].interventions, [{ text: '让灯塔的灯今晚熄灭一次', kind: 'text' }])
  assert.ok(rebuilt.chapters[1].events.some((event) => event.includes('介入事件')))
  assert.equal(rebuilt.interventions[0].status, 'applied')
})

test('(c) replaceChapter swaps the frontier chapter, flips the queue and bumps updatedAt', () => {
  let story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  story = queueIntervention(story, { text: '一位故人今晚抵达港口', readerIndex: 0 })
  const key = chapterKey(story, 1)
  const revised = buildChapter(story, 1)
  // A stale key (from before the nudge was queued) cannot land a revision.
  const staleStory = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  assert.strictEqual(replaceChapter(story, revised, chapterKey(staleStory, 1)), story)
  const replaced = replaceChapter(story, revised, key)
  assert.notStrictEqual(replaced, story)
  assert.deepEqual(replaced.chapters[1], revised)
  assert.deepEqual(replaced.chapters[0], story.chapters[0])
  assert.equal(replaced.interventions[0].status, 'applied')
  assert.ok(replaced.updatedAt >= story.updatedAt)
})

test('(d) combined queue: several nudges for one chapter land in a single pass', () => {
  let story = accept(createStory({ name: '阿遥' }), 0)
  story = queueIntervention(story, { text: '今晚的风会把钟声送到海对岸', readerIndex: 0 })
  story = queueIntervention(story, { kind: 'chip', chipId: 'crisis', readerIndex: 0 })
  assert.equal(queuedInterventionsFor(story, 1).length, 2)
  const chapter = buildChapter(story, 1)
  const text = chapter.paragraphs.join('')
  assert.ok(text.includes('今晚的风会把钟声送到海对岸'))
  assert.ok(text.includes('一场危机正从暗处向主角逼近'))
  assert.equal(chapter.interventions.length, 2)
  assert.equal(chapter.events.filter((event) => event.includes('介入事件')).length, 2)
  const accepted = acceptChapter(story, chapter, chapterKey(story, 1))
  assert.ok(accepted.interventions.every((entry) => entry.status === 'applied'))
})

test('chips resolve to fixed nudges, fate resolves inside the pool, text is length-capped', () => {
  const story = accept(createStory({ name: '阿遥' }), 0)
  for (const chip of INTERVENTION_CHIPS) {
    const queued = queueIntervention(story, { kind: 'chip', chipId: chip.id, readerIndex: 0 })
    assert.equal(queued.interventions[0].targetIndex, 1)
    assert.ok(queued.interventions[0].text.length > 0)
    if (chip.id !== 'fate') assert.equal(queued.interventions[0].text, chip.text)
  }
  const capped = queueIntervention(story, { text: '长'.repeat(500), readerIndex: 0 })
  assert.ok(capped.interventions[0].text.length <= INTERVENTION_TEXT_MAX)
})

test('(c) server revision: the prepared chapter is regenerated with marker and ledger event', async () => {
  let story = { ...accept(accept(createStory({ name: '阿遥' }), 0), 1), engine: 'gemini', readerIndex: 0 }
  story = queueIntervention(story, { text: '让灯塔的灯今晚熄灭一次', readerIndex: 0 })
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story, index: 1, mode: 'revise' })
  assert.equal(result.chapter.index, 1)
  assert.equal(result.key, chapterKey(story, 1))
  assert.deepEqual(result.chapter.interventions, [{ text: '让灯塔的灯今晚熄灭一次', kind: 'text' }])
  assert.ok(result.chapter.events.some((event) => event.includes('介入事件') && event.includes('灯塔的灯今晚熄灭一次')))
  // The prompt frames the nudge as an external force, never as an order.
  const context = JSON.parse(capture.input)
  assert.deepEqual(context.interventions.events, ['让灯塔的灯今晚熄灭一次'])
  assert.match(context.interventions.declaration, /外力事件/)
  // And the client lands it: queue flips, read chapter untouched.
  const landed = acceptRevisedChapter(story, result)
  assert.equal(landed.chapters[1].title, prose().title)
  assert.deepEqual(landed.chapters[0], story.chapters[0])
  assert.equal(landed.interventions[0].status, 'applied')
})

test('(c) server fold-in: an ungenerated target receives the nudge in its brief', async () => {
  let story = { ...accept(createStory({ name: '阿遥' }), 0), engine: 'gemini', readerIndex: 0 }
  story = queueIntervention(story, { text: '一位故人今晚抵达港口', readerIndex: 0 })
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story, index: 1 })
  const context = JSON.parse(capture.input)
  assert.deepEqual(context.interventions.events, ['一位故人今晚抵达港口'])
  assert.deepEqual(result.chapter.interventions, [{ text: '一位故人今晚抵达港口', kind: 'text' }])
  assert.ok(result.chapter.events.some((event) => event.includes('介入事件')))
})

test('(c) server revision refusals: read chapters, missing queue and unknown modes never reach the provider', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async () => { calls += 1; return response(prose()) },
  })
  const base = { ...accept(accept(createStory({ name: '阿遥' }), 0), 1), engine: 'gemini', readerIndex: 0 }
  const queued = queueIntervention(base, { text: '让雾散开', readerIndex: 0 })
  const cases = [
    // Revising the chapter the reader is ON (or an earlier one) is refused.
    [{ story: queued, index: 0, mode: 'revise' }, 409],
    // The target must be the prepared frontier chapter.
    [{ story: queued, index: 2, mode: 'revise' }, 409],
    // Nothing queued for the frontier chapter: no paid pass.
    [{ story: base, index: 1, mode: 'revise' }, 409],
    // Unknown modes are malformed requests.
    [{ story: queued, index: 1, mode: 'rewrite' }, 400],
  ]
  for (const [request, status] of cases) {
    await assert.rejects(generator.generate(request), (error) => error.status === status)
  }
  assert.equal(calls, 0)
})

test('(f) a stored pending choice from before retirement blocks nothing on the server', async () => {
  let story = { ...accept(accept(createStory({ name: '阿遥' }), 0), 1), engine: 'gemini' }
  story = chooseBranch(story, 1, 'wait')
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story, index: 2 })
  assert.equal(result.chapter.index, 2)
  const context = JSON.parse(capture.input)
  assert.equal(context.choices, undefined)
  assert.equal(context.currentDecision, undefined)
  assert.equal(context.interventions, undefined)
})

test('client revision request posts mode=revise and refuses a mismatched key', async () => {
  let story = { ...accept(accept(createStory({ name: '阿遥' }), 0), 1), engine: 'gemini', readerIndex: 0 }
  story = queueIntervention(story, { text: '让雾在午夜散开一次', readerIndex: 0 })
  const revised = { chapter: buildChapter(story, 1), key: chapterKey(story, 1) }
  let sent
  const fetchImpl = async (_url, options) => {
    sent = JSON.parse(options.body)
    return Response.json(revised)
  }
  const result = await requestChapterRevision(story, 1, { fetchImpl })
  assert.equal(sent.mode, 'revise')
  assert.equal(sent.index, 1)
  assert.equal(result.key, revised.key)
  await assert.rejects(
    requestChapterRevision(story, 1, { fetchImpl: async () => Response.json({ ...revised, key: 'stale-key' }) }),
    /不匹配/,
  )
})

test('(e) revision passes are charged exactly like normal generations', async (t) => {
  const usageCalls = []
  let dailyTotal = 0
  const auth = {
    config: () => ({ enabled: false, firebase: {} }),
    requiresIdentity: () => true,
    identity: async () => ({ uid: 'quota-user' }),
    usageDailyTotal: async () => dailyTotal,
    dailyTokenCap: () => 100000,
    recordUsage: async (uid, usage) => {
      usageCalls.push({ uid, usage })
      dailyTotal += usage?.totalTokenCount ?? 0
    },
  }
  const generator = {
    status: () => ({ configured: true, provider: 'gemini', model: 'fixture-model' }),
    generate: async (request) => ({
      chapter: buildChapter(request.story, request.index),
      key: chapterKey(request.story, request.index),
      usage: { totalTokenCount: 321 },
    }),
  }
  const server = createServer({
    env: {},
    generator,
    auth,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  const post = (body) => fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify(body),
  })
  const normal = await post({ story, index: 2 })
  assert.equal(normal.status, 200)
  const revision = await post({ story, index: 1, mode: 'revise' })
  assert.equal(revision.status, 200)
  // One ledger entry per call, same identity, same usage shape — the
  // revision is indistinguishable from a normal generation in accounting.
  assert.equal(usageCalls.length, 2)
  assert.deepEqual(usageCalls[0], usageCalls[1])
  assert.equal(usageCalls[0].uid, 'quota-user')
  // The daily cap gates revisions too: once the reader is over it, the
  // pass is refused before the provider is called.
  dailyTotal = 100000
  const blocked = await post({ story, index: 1, mode: 'revise' })
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).code, 'quota-exceeded')
  assert.equal(usageCalls.length, 2)
})
