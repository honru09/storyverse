import test from 'node:test'
import assert from 'node:assert/strict'
import { createGeminiGenerator } from '../server/gemini.js'
import {
  createMergedStory,
  createStory,
  effectiveIntroFor,
  introOf,
  introViolationFor,
  plazaSnapshot,
  updateIntro,
} from '../src/story-engine.js'
import { acceptGeneratedChapter } from '../src/generation.js'
import { plazaCardIntroFor, plazaWorldIntroFor, worldIntroViolationFor } from '../src/plaza.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import { worldIntroForRecord } from '../scripts/refresh-world-intros.mjs'

/*
 * REQ-56 （简介生成制）: a book's public words are written when the
 * book is generated — synopsis + the three-part intro in the SAME
 * opening call as the world bible — and the owner can rewrite every
 * one of them afterwards. Assembled copy is only ever a fallback,
 * and every fallback obeys the ban list: no chapter-title chaining,
 * no chapter-count broadcasts, no engine jargon, no template filler.
 */

const env = { GEMINI_API_KEY: '<REDACTED_SECRET>' }
const story = () => ({ ...createStory({ name: '阿遥' }), engine: 'gemini' })

const GEN_SYNOPSIS = '阿遥是白潮港的守夜人，靠一本手写日志过日子。最近潮汐钟开始乱响，镇上人的记忆每天少一截，她的日志里还多出了一封没有署名的信。她要在雾季结束前查清信的来历，代价是每找回一段别人的记忆，她自己的过去就淡一分。'
const GEN_INTRO = {
  background: '白潮港被潮水围住，一年里大半时间泡在雾里，镇上的潮汐钟管着所有人的作息和记忆。阿遥住在灯塔下的守夜屋里，是全镇唯一一个还坚持手写日志的人。',
  rules: [
    '潮汐钟每乱响一次，全镇人的记忆就被改写一小段，只有手写的字不会变。',
    '雾里漂来的信没有寄信人，收信的人必须在天亮之前回信，否则就会忘记自己是谁。',
  ],
  thread: '阿遥守着灯塔和日志，本来只想把雾季熬过去。那封无主来信把她推到了所有人前面：镇长要她交出日志，守灯人却说信是她自己十年前寄的。她得一边查信的来历，一边守住自己正在变淡的过去——查得越深，忘得越多。',
}

const prose = () => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    '阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。',
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
})

const bible = () => ({
  premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
  rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
  endingAnchor: '阿遥需要决定如何保留城市的记忆，并在本卷终局为后来者留下可以继续选择的道路。',
  outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已做出的选择。`),
})

const output = (opening = false, withPublicWords = true) => ({
  ...prose(),
  ...(opening ? { worldBible: bible() } : {}),
  ...(opening && withPublicWords ? { synopsis: GEN_SYNOPSIS, intro: GEN_INTRO } : {}),
})

const response = (value, finishReason = 'STOP') => new Response(
  JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] }),
  { status: 200 },
)

const publicWordsOf = (intro, synopsis) => [synopsis, intro?.background, intro?.thread, ...(intro?.rules || [])]
  .filter((text) => typeof text === 'string')

test('the opening call asks for synopsis + intro in the same call, and both land on the story', async () => {
  const schemas = []
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      schemas.push(JSON.parse(options.body).generationConfig.responseJsonSchema)
      return response(output(schemas.length === 1))
    },
  })
  const current = story()
  const result = await generator.generate({ story: current, index: 0 })
  // Same call, same schema: the public words ride the opening, they
  // are never a second paid call.
  assert.ok(schemas[0].properties.synopsis, 'the opening schema asks for the synopsis')
  assert.ok(schemas[0].properties.intro, 'the opening schema asks for the three-part intro')
  assert.ok(schemas[0].required.includes('synopsis') && schemas[0].required.includes('intro'))
  assert.equal(result.synopsis, GEN_SYNOPSIS)
  assert.deepEqual(result.intro, GEN_INTRO)

  const landed = acceptGeneratedChapter(current, result)
  assert.equal(landed.synopsis, GEN_SYNOPSIS, 'the generated synopsis replaces the local draft')
  assert.deepEqual(landed.intro, GEN_INTRO, 'the generated intro replaces the local draft')
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [landed] }), [])

  // Later chapters ask for neither field and overwrite nothing.
  const second = await generator.generate({ story: landed, index: 1 })
  assert.equal(schemas[1].properties.synopsis, undefined)
  assert.equal(schemas[1].properties.intro, undefined)
  assert.equal(second.synopsis, undefined)
})

test('banned public words are refused retryable and heal on the re-ask', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) {
        const banned = output(true)
        banned.synopsis = `${GEN_SYNOPSIS}这条线已经完结，全 24 章。`
        return response(banned)
      }
      return response(output(true))
    },
  })
  const result = await generator.generate({ story: story(), index: 0 })
  assert.equal(calls, 2, 'the banned draft was re-asked inside the same request')
  assert.equal(result.synopsis, GEN_SYNOPSIS)
  for (const text of publicWordsOf(result.intro, result.synopsis)) {
    assert.equal(introViolationFor(text), null, `clean copy only: ${text}`)
  }
})

test('persistently banned public words still refuse — banned copy never lands', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1
      const banned = output(true)
      banned.intro = { ...GEN_INTRO, thread: '阿遥的故事从「潮汐尽头的来信」开始，一路走到「雾中的门」。' }
      return response(banned)
    },
  })
  await assert.rejects(generator.generate({ story: story(), index: 0 }), (error) => error.status === 502)
  assert.equal(calls, 3, '1 initial + 2 retries, then the refusal stands')
})

test('an opening that omits the public words still lands — the local draft stays', async () => {
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    fetchImpl: async () => response(output(true, false)),
  })
  const current = story()
  assert.ok(current.synopsis && current.intro, 'the forge is born with a local draft')
  const result = await generator.generate({ story: current, index: 0 })
  assert.equal(result.synopsis, undefined)
  assert.equal(result.intro, undefined)
  const landed = acceptGeneratedChapter(current, result)
  assert.equal(landed.synopsis, current.synopsis)
  assert.deepEqual(landed.intro, current.intro)
})

test('the local fallback is factual for template, god-mode and fused books alike', () => {
  const solo = createStory({ name: '沈砚', genreId: 'cultivation', originIdentityId: 'underclass', ability: '借火一瞬' })
  assert.ok(solo.synopsis.includes('沈砚'))
  assert.ok(solo.intro.background.includes('青岚宗'), solo.intro.background)
  assert.ok(solo.intro.thread.length > 0)
  // REQ-59 supersede (integration): the preset bible's first rule is no longer
  // filler — it carries the world's own setting text, which is concrete, so
  // the fallback keeps exactly that one rule and drops the remaining filler.
  assert.equal(solo.intro.rules.length, 1, 'only the concrete world-setting rule survives the filler filter')
  assert.ok(solo.intro.rules[0].startsWith('世界设定（这个世界以此为准）：'), solo.intro.rules[0])
  for (const text of publicWordsOf(solo.intro, solo.synopsis)) {
    assert.equal(introViolationFor(text), null, `fallback copy obeys the bans: ${text}`)
  }

  const god = createStory({
    name: '林晚',
    genreId: 'custom',
    customWorldName: '雾桥镇',
    customWorldSetting: '雾桥镇一年有三百天起雾，雾里会传来十年前的声音。镇上人靠收集声音碎片换取记忆。',
  })
  assert.ok(god.intro.background.includes('雾桥镇一年有三百天起雾'), god.intro.background)
  assert.ok(god.intro.rules.length >= 1, 'the creator’s own setting is a concrete rule')
  for (const text of publicWordsOf(god.intro, god.synopsis)) {
    assert.equal(introViolationFor(text), null, `god-mode fallback obeys the bans: ${text}`)
  }

  const a = createStory({ name: '沈砚', genreId: 'cultivation', originIdentityId: 'underclass' })
  const b = createStory({ name: '陆鸣', genreId: 'city', originIdentityId: 'commoner' })
  const merged = createMergedStory(a, b)
  assert.ok(merged.synopsis.includes('沈砚') && merged.synopsis.includes('陆鸣'), merged.synopsis)
  assert.ok(merged.intro.background.includes('青岚宗') && merged.intro.background.includes('长宁街'), merged.intro.background)
  assert.ok(merged.intro.rules.length >= 1)
  assert.ok(merged.intro.thread.includes('沈砚') && merged.intro.thread.includes('陆鸣'))
  for (const text of publicWordsOf(merged.intro, merged.synopsis)) {
    assert.equal(introViolationFor(text), null, `fused fallback obeys the bans: ${text}`)
  }
})

const detailFromSnapshot = (snapshot, avatarName = '阿遥') => ({
  title: snapshot.title,
  genreId: snapshot.genreId,
  worldName: snapshot.worldName,
  avatar: { name: avatarName },
  worldBible: snapshot.worldBible,
  beats: snapshot.beats,
  synopsis: snapshot.synopsis,
  intro: snapshot.intro,
  chapterCount: snapshot.chapters.length,
  lineStatus: snapshot.lineStatus,
})

test('publish prefers the generated intro, part by part, over any assembly', () => {
  const forged = createStory({ name: '阿遥', genreId: 'mist' })
  const withGenerated = { ...forged, synopsis: GEN_SYNOPSIS, intro: GEN_INTRO }
  const snapshot = plazaSnapshot(withGenerated, { avatarName: '阿遥' })
  assert.equal(snapshot.synopsis, GEN_SYNOPSIS)
  assert.deepEqual(snapshot.intro, GEN_INTRO, 'the snapshot carries the intro verbatim')

  const intro = plazaWorldIntroFor(detailFromSnapshot(snapshot), '玄幻')
  assert.equal(intro.background, GEN_INTRO.background)
  assert.deepEqual(intro.rules, GEN_INTRO.rules)
  assert.equal(intro.thread, GEN_INTRO.thread)
  // The refresh script composes from the stored record alone and
  // reaches the same text.
  const record = {
    id: 'pub-fixture',
    title: snapshot.title,
    genreId: snapshot.genreId,
    worldName: snapshot.worldName,
    avatar: { name: '阿遥' },
    snapshot,
    chapterCount: snapshot.chapters.length,
    lineStatus: snapshot.lineStatus,
  }
  assert.deepEqual(worldIntroForRecord(record), intro)
})

test('a banned generated part falls back on its own; the clean parts still stand', () => {
  const forged = createStory({ name: '阿遥', genreId: 'mist' })
  const mixed = {
    ...forged,
    synopsis: GEN_SYNOPSIS,
    intro: { ...GEN_INTRO, thread: '阿遥的故事从「第一章」开始，一路走到「最后一章」。这条线已经完结，全 6 章。' },
  }
  const snapshot = plazaSnapshot(mixed, { avatarName: '阿遥' })
  const intro = plazaWorldIntroFor(detailFromSnapshot(snapshot), '玄幻')
  assert.equal(intro.background, GEN_INTRO.background, 'the clean background is still adopted')
  assert.deepEqual(intro.rules, GEN_INTRO.rules, 'the clean rules are still adopted')
  assert.equal(intro.thread, GEN_SYNOPSIS, 'the banned thread falls back to the synopsis')
})

test('the fallback thread never chains titles or broadcasts counts', () => {
  const legacyDetail = {
    title: '沉潮港纪事',
    genreId: 'mist',
    worldName: '沉潮港',
    avatar: { name: '沈知遥' },
    chapterCount: 24,
    lineStatus: 'finished',
    worldBible: {
      premise: '沉潮港是一个被潮水围住的世界，镇外的人进不来，镇里的人也出不去。',
      rules: ['潮汐钟响时，记忆会被改写一小段。'],
    },
    beats: [
      { number: 1, title: '守夜日志与逆流的潮声', summary: '沈知遥在灯塔守夜屋醒来，守夜日志上多了一行不是她写的字。' },
      { number: 24, title: '终局的锁芯与倒流之潮', summary: '沈知遥锁住了潮汐钟。' },
    ],
  }
  const intro = plazaWorldIntroFor(legacyDetail, '玄幻')
  assert.equal(intro.thread, '沈知遥是这个世界的主角。沈知遥在灯塔守夜屋醒来，守夜日志上多了一行不是她写的字。')
  assert.equal(worldIntroViolationFor(intro.thread), null)
  assert.ok(intro.background.length > 0 && intro.rules.length === 1, 'a legacy book never renders blank')
  assert.equal(plazaCardIntroFor(legacyDetail), intro.thread)
})

test('the owner can rewrite every public word; the edit is what a re-publish carries', () => {
  const forged = createStory({ name: '沈砚', genreId: 'cultivation', originIdentityId: 'underclass' })
  const edited = updateIntro(forged, {
    background: '  青岚宗立在云雾里，灵脉一年比一年细。沈砚住在后山柴房，是宗门里最不起眼的杂役。 ',
    rules: [' 借来的火只能用一瞬，超时就反噬经脉。 ', '', '宗门每月按贡献分灵石，杂役排在最末。'],
    thread: ' 沈砚只想攒够灵石换一本功法，偏偏柴房的灶火认了他。他要瞒住借火的本事往上爬，对手是盯着后山的执事，代价是每借一次火，就短一分寿数。 ',
  })
  assert.notEqual(edited, forged)
  assert.deepEqual(introOf(edited), {
    background: '青岚宗立在云雾里，灵脉一年比一年细。沈砚住在后山柴房，是宗门里最不起眼的杂役。',
    rules: ['借来的火只能用一瞬，超时就反噬经脉。', '宗门每月按贡献分灵石，杂役排在最末。'],
    thread: '沈砚只想攒够灵石换一本功法，偏偏柴房的灶火认了他。他要瞒住借火的本事往上爬，对手是盯着后山的执事，代价是每借一次火，就短一分寿数。',
  })
  assert.equal(introOf(forged)?.background.includes('灵脉正在枯竭'), true, 'the original story object is untouched')

  // Same words again: a no-op, not a new revision of the book.
  assert.equal(updateIntro(edited, introOf(edited)), edited)

  // Limits speak human and refuse.
  assert.throws(() => updateIntro(forged, { background: '长'.repeat(601) }), /世界背景最多 600 字/)
  assert.throws(() => updateIntro(forged, { rules: ['一', '二', '三', '四'] }), /核心规则最多 3 条/)
  assert.throws(() => updateIntro(forged, { rules: ['长'.repeat(301)] }), /每条核心规则最多 300 字/)

  // Clearing all three parts removes the field; the fallback returns.
  const cleared = updateIntro(edited, { background: '', rules: [], thread: '' })
  assert.equal('intro' in cleared, false)

  // Storage accepts the edited shape and refuses an over-limit one.
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [edited] }), [])
  const overLimit = { ...edited, intro: { background: '长'.repeat(601), rules: [], thread: '' } }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [overLimit] }).some((error) => error.includes('intro')))

  // The re-publish path: the snapshot carries the owner's words.
  const snapshot = plazaSnapshot(edited, { avatarName: '沈砚' })
  assert.deepEqual(snapshot.intro, introOf(edited))
})

test('a pre-REQ-56 book (no fields at all) still shows a compliant intro', () => {
  const forged = createStory({ name: '沈砚', genreId: 'cultivation', originIdentityId: 'underclass' })
  const legacy = { ...forged }
  delete legacy.synopsis
  delete legacy.intro
  const effective = effectiveIntroFor(legacy)
  assert.ok(effective, 'the effective intro exists for legacy books')
  assert.ok(effective.background.length > 0 && effective.thread.length > 0)
  for (const text of publicWordsOf(effective, '')) {
    assert.equal(introViolationFor(text), null, `legacy fallback obeys the bans: ${text}`)
  }
})
