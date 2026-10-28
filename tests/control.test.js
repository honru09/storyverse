import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createGeminiGenerator, SYSTEM_PROMPT, systemInstructionFor } from '../server/gemini.js'
import { createServer } from '../server/index.js'
import {
  STYLE_PRESETS,
  acceptChapter,
  beginChapterReroll,
  buildChapter,
  chapterKey,
  createMergedStory,
  createStory,
  frontierChapterIndex,
  isFrontierChapter,
  plazaSnapshot,
  publicSnapshot,
  queueIntervention,
  replaceFrontierChapter,
  stylePresetById,
  stylePresetOf,
  updateChapterProse,
  updateStylePreset,
} from '../src/story-engine.js'
import { acceptRerolledChapter, requestChapterReroll } from '../src/generation.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'

// ---------------------------------------------------------------------------
// 生成控制批次 (PERSONA-QA F-30): the director's levers — frontier re-roll,
// owner prose editing, style presets — all fenced by the house rule: only
// the frontier chapter may be rewritten directly. FRONTIER-FIX note: the
// fixtures in this file carry no `openedThrough` watermark, so they
// exercise the legacy fallback (frontier = latest chapter written, the
// pre-watermark rule, unchanged for unopened records). The watermark
// semantics themselves are covered in tests/frontier-fix.test.js.
// ---------------------------------------------------------------------------

const env = { GEMINI_API_KEY: 'test-key-never-used-on-network' }
const accept = (story, index) => acceptChapter(story, buildChapter(story, index), chapterKey(story, index))
const prose = (marker) => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    `${marker}：阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。`,
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
})
const response = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })
const generatorCapturing = (capture, marker = '新版正文') => createGeminiGenerator({
  env,
  fetchImpl: async (_url, options) => {
    capture.body = JSON.parse(options.body)
    capture.input = capture.body.contents[0].parts[0].text
    capture.system = capture.body.systemInstruction.parts[0].text
    return response(prose(marker))
  },
})

// --- (a) frontier determination and the lock boundary ----------------------

test('(a) the frontier is exactly the latest generated chapter', () => {
  const empty = createStory({ name: '阿遥' })
  assert.equal(frontierChapterIndex(empty), -1)
  assert.equal(isFrontierChapter(empty, 0), false)
  const one = accept(empty, 0)
  assert.equal(frontierChapterIndex(one), 0)
  assert.equal(isFrontierChapter(one, 0), true)
  const two = accept(one, 1)
  assert.equal(isFrontierChapter(two, 0), false)
  assert.equal(isFrontierChapter(two, 1), true)
  assert.equal(isFrontierChapter(two, 2), false)
})

test('(a) beginChapterReroll rotates the revision only on the frontier', () => {
  const story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  const rotated = beginChapterReroll(story, 1)
  assert.equal(rotated.revision, story.revision + 1)
  assert.deepEqual(rotated.chapters, story.chapters, 'rotation alone rewrites nothing')
  // The rotation retires keys for the slot AND for the unwritten next
  // chapter, so a pre-generation answer from the old telling is stale.
  assert.notEqual(chapterKey(rotated, 1), chapterKey(story, 1))
  assert.notEqual(chapterKey(rotated, 2), chapterKey(story, 2))
  assert.throws(() => beginChapterReroll(story, 0), /只有正在读的这一章还能换一版/)
  assert.throws(() => beginChapterReroll(story, 2), /只有正在读的这一章还能换一版/)
  const readOnly = { ...story, readOnly: true }
  assert.strictEqual(beginChapterReroll(readOnly, 1), readOnly)
})

test('(a) the lock race: once the next chapter lands, a late re-roll is refused whole', () => {
  let story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  const rotated = beginChapterReroll(story, 1)
  const rerolled = buildChapter(rotated, 1)
  const key = chapterKey(rotated, 1)
  // The next chapter lands first — the frontier moves on.
  const advanced = accept(rotated, 2)
  assert.equal(advanced.chapters.length, 3)
  assert.strictEqual(replaceFrontierChapter(advanced, rerolled, key), advanced)
  assert.strictEqual(acceptRerolledChapter(advanced, { chapter: rerolled, key }), advanced)
  // Without the race, the same swap lands cleanly.
  const landed = replaceFrontierChapter(rotated, rerolled, key)
  assert.notStrictEqual(landed, rotated)
  assert.deepEqual(landed.chapters[1], rerolled)
  assert.deepEqual(landed.chapters[0], story.chapters[0])
  // A stale key or a forged chapter id cannot land a swap either.
  assert.strictEqual(replaceFrontierChapter(rotated, rerolled, chapterKey(story, 1)), rotated)
  assert.strictEqual(replaceFrontierChapter(rotated, { ...rerolled, id: 'forged' }, key), rotated)
  const readOnly = { ...rotated, readOnly: true }
  assert.strictEqual(replaceFrontierChapter(readOnly, rerolled, key), readOnly)
})

test('(a) prose editing exists on the frontier chapter and nowhere else', () => {
  const story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  const edited = updateChapterProse(story, 1, ['  阿遥亲手改过的第一段。  ', '第二段也换了说法。'])
  assert.deepEqual(edited.chapters[1].paragraphs, ['阿遥亲手改过的第一段。', '第二段也换了说法。'])
  assert.deepEqual(edited.chapters[0], story.chapters[0], 'earlier chapters are untouched')
  assert.equal(edited.chapters[1].summary, story.chapters[1].summary, 'the ledger record is not the prose')
  assert.equal(edited.revision, story.revision + 1, 'the edit retires in-flight pre-generation of the next chapter')
  assert.ok(edited.updatedAt >= story.updatedAt)
  // Chapter one stopped being the frontier when chapter two landed.
  assert.strictEqual(updateChapterProse(story, 0, ['改过去。']), story)
  const readOnly = { ...story, readOnly: true }
  assert.strictEqual(updateChapterProse(readOnly, 1, ['改不动。']), readOnly)
  // Malformed prose is refused loudly, not stored.
  assert.throws(() => updateChapterProse(story, 1, []), /1–64 段/)
  assert.throws(() => updateChapterProse(story, 1, ['   ']), /每段都要有内容/)
  assert.throws(() => updateChapterProse(story, 1, ['好段', 42]), /每段都要有内容/)
  // The edited story still validates as a library.
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [edited] }), [])
})

// --- (b) re-roll: server pass, markers/ledger recomputed, accounting ------

test('(b) server re-roll: context is the slot as of its first generation, markers recomputed by the shared assembly', async () => {
  // Chapter two was written with one nudge landed in it; a second nudge
  // for the same chapter is still queued (a failed revision left it).
  let story = accept(createStory({ name: '阿遥' }), 0)
  story = queueIntervention(story, { text: '让灯塔的灯今晚熄灭一次', readerIndex: 0 })
  story = accept(story, 1)
  assert.equal(story.interventions[0].status, 'applied')
  story = {
    ...story,
    engine: 'gemini',
    interventions: [
      ...story.interventions,
      { id: 'iv-leftover', targetIndex: 1, text: '一位故人今晚抵达港口', kind: 'text', createdAt: story.updatedAt, status: 'queued' },
    ],
  }
  const oldSecond = story.chapters[1]
  const rotated = { ...beginChapterReroll(story, 1), engine: 'gemini' }
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story: rotated, index: 1, mode: 'reroll' })
  assert.equal(result.chapter.index, 1)
  assert.equal(result.key, chapterKey(rotated, 1))
  // Markers and ledger lines are recomputed for the new telling by the
  // same assembly the intervention revision uses: both nudges land.
  assert.deepEqual(result.chapter.interventions, [
    { text: '让灯塔的灯今晚熄灭一次', kind: 'text' },
    { text: '一位故人今晚抵达港口', kind: 'text' },
  ])
  assert.equal(result.chapter.events.filter((event) => event.includes('介入事件')).length, 2)
  // The brief is the one as of the slot: chapter one's tail is the
  // recent chapter, summaries stop before the slot, the old telling
  // of chapter two appears nowhere.
  const context = JSON.parse(capture.input)
  assert.equal(context.summaries.length, 1)
  assert.ok(context.recentChapter.text.includes(story.chapters[0].paragraphs[0].slice(0, 12)))
  assert.ok(!capture.input.includes(oldSecond.summary), 'the discarded summary is not briefed')
  assert.deepEqual(context.interventions.events, ['让灯塔的灯今晚熄灭一次', '一位故人今晚抵达港口'])
  // The client lands it: chapter one byte-identical, queue fully applied.
  const landed = acceptRerolledChapter(rotated, result)
  assert.deepEqual(landed.chapters[0], story.chapters[0])
  assert.equal(landed.chapters[1].paragraphs[0].startsWith('新版正文'), true)
  assert.ok(landed.interventions.every((entry) => entry.status === 'applied'))
})

test('(b) server re-roll refusals: anything but the latest chapter never reaches the provider', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async () => { calls += 1; return response(prose('新版正文')) },
  })
  const story = { ...accept(accept(createStory({ name: '阿遥' }), 0), 1), engine: 'gemini' }
  const cases = [
    [{ story, index: 0, mode: 'reroll' }, 409],
    [{ story, index: 2, mode: 'reroll' }, 409],
    [{ story: { ...createStory({ name: '阿遥' }), engine: 'gemini' }, index: 0, mode: 'reroll' }, 409],
  ]
  for (const [request, status] of cases) {
    await assert.rejects(generator.generate(request), (error) => error.status === status)
  }
  assert.equal(calls, 0)
  // Chapter one of a brand-new book is a frontier too. (The opening
  // schema demands a world bible in the response, so this pass gets its
  // own fixture payload.)
  const fresh = { ...accept(createStory({ name: '阿遥' }), 0), engine: 'gemini' }
  const openingGenerator = createGeminiGenerator({
    env,
    fetchImpl: async () => response({
      ...prose('新版开篇'),
      worldBible: {
        premise: '沉潮港被潮水围住，潮汐钟会改写记忆，雾里漂来一封不该抵达的信，指向一座沉没的灯塔。',
        rules: ['潮汐钟响时记忆会被改写', '向潮水借力要付记忆作价', '雾散之前没有人能离港'],
        endingAnchor: '阿遥要在季终之前登上沉没的灯塔，决定这座港的记忆归谁所有。',
        outline: ['在守夜屋醒来与无主来信', '掌心潮痕的异象初次显形', '守灯人敞开雾里的那扇门', '借火的代价第一次显形', '雾中与潮汐钟正面对峙', '新的清晨与重新标价的世界'],
      },
    }),
  })
  const result = await openingGenerator.generate({ story: beginChapterReroll(fresh, 0), index: 0, mode: 'reroll' })
  assert.equal(result.chapter.index, 0)
  assert.ok(result.worldBible, 're-rolling the opening regenerates its world bible')
  const landedOpening = acceptRerolledChapter(beginChapterReroll(fresh, 0), result)
  assert.equal(landedOpening.worldBible.premise, result.worldBible.premise)
})

test('(b) client re-roll request posts mode=reroll and refuses a mismatched key', async () => {
  const story = { ...beginChapterReroll(accept(accept(createStory({ name: '阿遥' }), 0), 1), 1), engine: 'gemini' }
  const rolled = { chapter: buildChapter(story, 1), key: chapterKey(story, 1) }
  let sent
  const fetchImpl = async (_url, options) => {
    sent = JSON.parse(options.body)
    return Response.json(rolled)
  }
  const result = await requestChapterReroll(story, 1, { fetchImpl })
  assert.equal(sent.mode, 'reroll')
  assert.equal(sent.index, 1)
  assert.equal(result.key, rolled.key)
  await assert.rejects(
    requestChapterReroll(story, 1, { fetchImpl: async () => Response.json({ ...rolled, key: 'stale-key' }) }),
    /不匹配/,
  )
})

test('(b) re-roll passes are charged exactly like normal generations', async (t) => {
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
  const reroll = await post({ story, index: 1, mode: 'reroll' })
  assert.equal(reroll.status, 200)
  assert.equal(usageCalls.length, 2)
  assert.deepEqual(usageCalls[0], usageCalls[1])
  dailyTotal = 100000
  const blocked = await post({ story, index: 1, mode: 'reroll' })
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).code, 'quota-exceeded')
  assert.equal(usageCalls.length, 2)
})

// --- interplay: queued interventions for the NEXT chapter survive ---------

test('interplay: a nudge queued for the next chapter keeps its target across a re-roll', async () => {
  let story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  story = { ...story, engine: 'gemini' }
  story = queueIntervention(story, { text: '让纸鲸今晚掉头向南', readerIndex: 1 })
  assert.equal(story.interventions[0].targetIndex, 2)
  const rotated = beginChapterReroll(story, 1)
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story: rotated, index: 1, mode: 'reroll' })
  const context = JSON.parse(capture.input)
  assert.equal(context.interventions, undefined, 'the next chapter\u2019s nudge is not spent on this one')
  const landed = acceptRerolledChapter(rotated, result)
  assert.equal(landed.interventions[0].status, 'queued')
  assert.equal(landed.interventions[0].targetIndex, 2)
})

// --- (c) edited prose becomes the tail context ------------------------------

test('(c) after a prose edit, the next generation is briefed with the edited tail', async () => {
  let story = { ...accept(accept(createStory({ name: '阿遥' }), 0), 1), engine: 'gemini' }
  story = updateChapterProse(story, 1, [
    '阿遥亲手写下的结尾：守灯人把那封信推回她手里，说，烧了吧。',
    '她没有烧。她把信塞进钟楼的齿轮里，让它跟着潮汐一起转。',
  ])
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story, index: 2 })
  assert.equal(result.chapter.index, 2)
  const context = JSON.parse(capture.input)
  assert.ok(context.recentChapter.text.includes('阿遥亲手写下的结尾'), 'the edited prose is the tail the model continues from')
  assert.ok(!context.recentChapter.text.includes('银色潮痕'), 'the pre-edit scaffold text is gone from the tail')
})

// --- (d) style presets -------------------------------------------------------

test('(d) presets resolve, store and validate like other config facts', () => {
  assert.equal(STYLE_PRESETS.length, 4)
  assert.equal(createStory({ name: '阿遥' }).config.stylePreset, 'default')
  assert.equal(createStory({ name: '阿遥', stylePreset: 'compact' }).config.stylePreset, 'compact')
  assert.equal(createStory({ name: '阿遥', stylePreset: 'bogus' }).config.stylePreset, 'default')
  assert.equal(stylePresetOf(null).id, 'default')
  assert.equal(stylePresetOf({ config: { stylePreset: 'austere' } }).label, '冷峻克制')
  assert.equal(stylePresetById('immersive').label, '细腻沉浸')
  const story = accept(createStory({ name: '阿遥' }), 0)
  const dialled = updateStylePreset(story, 'immersive')
  assert.equal(dialled.config.stylePreset, 'immersive')
  assert.deepEqual(dialled.chapters, story.chapters, 'switching a preset rewrites no existing chapter')
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [dialled] }), [])
  const bad = { ...story, config: { ...story.config, stylePreset: 'bogus' } }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [bad] }).some((error) => error.includes('stylePreset')))
})

test('(d) the generation request carries the preset block; the default is byte-identical to before', async () => {
  for (const preset of STYLE_PRESETS) {
    const story = {
      ...accept(createStory({ name: '阿遥', stylePreset: preset.id }), 0),
      engine: 'gemini',
    }
    const capture = {}
    const generator = generatorCapturing(capture)
    await generator.generate({ story, index: 1 })
    if (preset.id === 'default') {
      assert.equal(capture.system, SYSTEM_PROMPT, 'default instructions are unchanged')
      assert.equal(systemInstructionFor(story), SYSTEM_PROMPT)
    } else {
      assert.ok(capture.system.startsWith(SYSTEM_PROMPT), `${preset.id}: the house prompt stands first`)
      assert.ok(capture.system.includes(preset.instruction), `${preset.id}: its block is appended`)
      assert.ok(capture.system.includes('文笔总则'), `${preset.id}: the 总则 remains in force above the preset`)
      assert.equal(systemInstructionFor(story), capture.system)
    }
  }
})

// --- (e) snapshots never expose the preset ----------------------------------

test('(e) public and plaza snapshots reset the preset; merged lines start on default', () => {
  const story = accept(createStory({ name: '阿遥', stylePreset: 'compact' }), 0)
  assert.equal(publicSnapshot(story).config.stylePreset, 'default')
  assert.equal(plazaSnapshot(story).config.stylePreset, 'default')
  const merged = createMergedStory(
    createStory({ name: '甲', stylePreset: 'austere' }),
    createStory({ name: '乙', genreId: 'cultivation' }),
  )
  assert.equal(merged.config.stylePreset, 'default')
})
