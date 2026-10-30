import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'

import {
  ALL_ABILITIES,
  abilityBoundsFor,
  abilityByName,
  acceptChapter,
  anchorConstraintLines,
  applySynopsisAlignment,
  buildChapter,
  buildSynopsisAlignmentDraft,
  chapterDriftWarningsFor,
  chapterKey,
  createMergedStory,
  createStory,
  extractProperNouns,
  normalizeProtagonistAnchors,
  parseChineseNumber,
  storyBeatPlan,
  synopsisAlignmentCheck,
  updateWorldBible,
} from '../src/story-engine.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import {
  avatarAnchorsOf,
  avatarDraftPatch,
  normalizeAvatarAbility,
  validateAvatarProfile,
} from '../src/avatar.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createGeminiGenerator, SYSTEM_PROMPT } from '../server/gemini.js'

/*
 * REQ-69 W5 （内容修复·引擎侧防复发）: the three engine-side guards
 * against the READER-QA F2/F3/F5 failures —
 *   F2 protagonist hard anchors + numeric drift warnings,
 *   F3 ability bounds (desc alone is not a definition),
 *   F5 the finished-book synopsis alignment channel.
 */

const ANCHORS = {
  age: 29,
  events: [
    { label: '灾变', yearsAgo: 7 },
    { label: '签约封存', yearsAgo: 30 },
  ],
  identityFacts: ['配给站黑工出身，工号 0731', '休眠舱封存单上的签名是他人冒用其工号所签'],
}

const anchoredStory = (overrides = {}) => createStory({
  genreId: 'frontier',
  name: '秦烬',
  trait: '冷静算账',
  origin: '配给站黑工',
  ability: '存量心算',
  abilityDesc: '任何仓库扫一眼，存量与能撑的天数你心里有数',
  abilityBounds: '只能估算亲眼所见、有实物或账目可核的物资存量与消耗，算不了人心、历史真相与没见过的仓库',
  anchors: ANCHORS,
  ...overrides,
})

const acceptWith = (story, index, paragraphs, summary = '本章摘要记录了已经发生的事情经过与人物动向。') => {
  const skeleton = buildChapter(story, index)
  const chapter = { ...skeleton, paragraphs, summary }
  const accepted = acceptChapter(story, chapter, chapterKey(story, index))
  assert.notStrictEqual(accepted, story)
  return accepted
}

// ---------------------------------------------------------------------------
// F2 — anchors: shape, brief, world bible, avatar, merged cast
// ---------------------------------------------------------------------------

test('normalizeProtagonistAnchors keeps the arithmetic shape and drops junk', () => {
  assert.deepEqual(normalizeProtagonistAnchors(ANCHORS), ANCHORS)
  assert.equal(normalizeProtagonistAnchors(null), null)
  assert.equal(normalizeProtagonistAnchors({}), null)
  assert.equal(normalizeProtagonistAnchors({ age: 0 }), null)
  assert.equal(normalizeProtagonistAnchors({ age: 29.5 }), null)
  const partial = normalizeProtagonistAnchors({
    age: 29,
    events: [{ label: '灾变', yearsAgo: 7 }, { label: '无年份', yearsAgo: null }, { label: '', yearsAgo: 3 }, { label: '灾变', yearsAgo: 9 }],
    identityFacts: ['甲', '甲', ''],
  })
  assert.deepEqual(partial, { age: 29, events: [{ label: '灾变', yearsAgo: 7 }], identityFacts: ['甲'] })
})

test('anchorConstraintLines spell out the derived ages, including the impossible one', () => {
  const lines = anchorConstraintLines(ANCHORS, '秦烬')
  assert.ok(lines.some((line) => line.includes('现年 29 岁')))
  assert.ok(lines.some((line) => line.includes('「灾变」') && line.includes('当时 22 岁')))
  const impossible = lines.find((line) => line.includes('「签约封存」'))
  assert.ok(impossible.includes('尚未出生'), impossible)
  assert.ok(impossible.includes('不得写成秦烬亲历或亲手所为'), impossible)
  assert.ok(lines.some((line) => line.includes('身份事实') && line.includes('冒用其工号')))
  assert.deepEqual(anchorConstraintLines(null), [])
})

test('the chapter brief restates anchors and ability bounds as hard constraints', () => {
  const story = anchoredStory()
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [story] }), [])
  const plan = storyBeatPlan(story, 0)
  assert.ok(plan.prerequisites.some((line) => line.startsWith('硬约束·锚点') && line.includes('现年 29 岁')), plan.prerequisites.join('|'))
  assert.ok(plan.prerequisites.some((line) => line.startsWith('硬约束·锚点') && line.includes('尚未出生')))
  assert.ok(plan.prerequisites.some((line) => line.startsWith('硬约束·能力边界') && line.includes('存量心算') && line.includes('算不了人心')))
  // A book with neither anchors nor stored bounds keeps the old brief.
  const plain = createStory({ genreId: 'mist', name: '宁笙', ability: '听见潮汐' })
  const plainPlan = storyBeatPlan(plain, 0)
  assert.ok(!plainPlan.prerequisites.some((line) => line.startsWith('硬约束·')), plainPlan.prerequisites.join('|'))
})

test('world bible anchors ride updateWorldBible and reach the brief', () => {
  const story = anchoredStory()
  const next = updateWorldBible(story, { anchors: { events: [{ label: '建站', yearsAgo: 32 }], identityFacts: [] } })
  assert.deepEqual(next.worldBible.anchors, { age: null, events: [{ label: '建站', yearsAgo: 32 }], identityFacts: [] })
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [next] }), [])
  const plan = storyBeatPlan(next, 0)
  assert.ok(plan.prerequisites.some((line) => line.includes('「建站」') && line.includes('32 年前')))
  // A bible edit that says nothing about anchors carries them through.
  const edited = updateWorldBible(next, { premise: '新的前提。' })
  assert.deepEqual(edited.worldBible.anchors, next.worldBible.anchors)
})

test('avatar anchors validate, patch into a draft, and land in the book brief', () => {
  const { profile, error } = validateAvatarProfile({ name: '秦烬', description: '黑工。', anchors: ANCHORS })
  assert.equal(error, undefined)
  assert.deepEqual(profile.anchors, ANCHORS)
  const silent = validateAvatarProfile({ name: '秦烬', description: '黑工。' })
  assert.equal('anchors' in silent.profile, false, 'absent key says nothing (tri-state)')
  assert.deepEqual(avatarAnchorsOf({ name: '秦烬', anchors: ANCHORS }), ANCHORS)
  const patch = avatarDraftPatch({ id: 'avatar-1', name: '秦烬', description: '黑工。', anchors: ANCHORS })
  assert.deepEqual(patch.anchors, ANCHORS)
  const story = createStory({ genreId: 'frontier', ...patch, ability: '存量心算' })
  assert.deepEqual(story.config.anchors, ANCHORS)
  assert.ok(storyBeatPlan(story, 0).prerequisites.some((line) => line.includes('现年 29 岁')))
})

test('a fused cast keeps each lead\'s own anchors and bounds in the brief', () => {
  const a = anchoredStory()
  const b = createStory({
    genreId: 'mist', name: '宁笙', ability: '听见潮汐',
    abilityBounds: '只能读与水、回声直接相连的记忆',
    anchors: { age: 41, events: [], identityFacts: [] },
  })
  const done = (story) => {
    let current = story
    for (let index = 0; index < 6; index += 1) current = acceptWith(current, index, ['一章正文，事情往前走了一步。'])
    return current
  }
  const merged = createMergedStory(done(a), done(b))
  assert.equal(merged.config.anchors, null, 'the fused story-level slot carries no single lead\'s anchors')
  assert.deepEqual(merged.config.protagonists.map((person) => person.anchors?.age), [29, 41])
  const plan = storyBeatPlan(merged, 0)
  assert.ok(plan.prerequisites.some((line) => line.includes('秦烬') && line.includes('现年 29 岁')))
  assert.ok(plan.prerequisites.some((line) => line.includes('宁笙') && line.includes('现年 41 岁')))
  assert.ok(plan.prerequisites.some((line) => line.startsWith('硬约束·能力边界') && line.includes('听见潮汐')))
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [merged] }), [])
})

// ---------------------------------------------------------------------------
// F2 — drift warnings: positive and negative samples
// ---------------------------------------------------------------------------

test('parseChineseNumber covers the numeral shapes the scan promises', () => {
  assert.equal(parseChineseNumber('三十'), 30)
  assert.equal(parseChineseNumber('三十二'), 32)
  assert.equal(parseChineseNumber('二十九'), 29)
  assert.equal(parseChineseNumber('一百二十'), 120)
  assert.equal(parseChineseNumber('七'), 7)
  assert.equal(parseChineseNumber('42'), 42)
  assert.equal(parseChineseNumber('某'), null)
})

test('drift scan flags the F2 shape: a 29-year-old personally acting 30 years ago', () => {
  const story = anchoredStory()
  const warnings = chapterDriftWarningsFor(story, '秦烬说，三十年前的那张提调单是他亲手签的字，墨迹还没干透。')
  assert.ok(warnings.some((item) => item.kind === 'years-before-birth' && item.expected === 29 && item.found === 30), JSON.stringify(warnings))
})

test('drift scan flags an age that contradicts the anchor, next to the name', () => {
  const story = anchoredStory()
  const warnings = chapterDriftWarningsFor(story, '秦烬今年三十二岁，站在配给站门口，工牌在胸前晃。')
  assert.ok(warnings.some((item) => item.kind === 'age-mismatch' && item.expected === 29 && item.found === 32), JSON.stringify(warnings))
  const arabic = chapterDriftWarningsFor(story, '秦烬，32 岁，配给站黑工。')
  assert.ok(arabic.some((item) => item.kind === 'age-mismatch' && item.found === 32))
})

test('drift scan flags an event whose stated distance contradicts its anchor', () => {
  const story = anchoredStory()
  const warnings = chapterDriftWarningsFor(story, '老人说，灾变是十年前的事情了，那一年配给站烧掉了一半。')
  assert.ok(warnings.some((item) => item.kind === 'event-years-mismatch' && item.expected === 7 && item.found === 10), JSON.stringify(warnings))
})

test('drift scan stays silent on arithmetic that agrees, and on other people', () => {
  const story = anchoredStory()
  assert.deepEqual(chapterDriftWarningsFor(story, '秦烬今年29岁，灾变过去七年，他还记得那天的警报声。'), [])
  assert.deepEqual(chapterDriftWarningsFor(story, '秦烬说，那张单子不是他签的——三十年前他还没出生，是有人冒用了他的工号。').filter((item) => item.kind === 'event-years-mismatch'), [])
  // Another person's age, away from the protagonist's name, is not the scan's business.
  assert.deepEqual(chapterDriftWarningsFor(story, '配给站的老站长今年六十岁，在这个岗位上坐了大半辈子，见过的人比仓库里的粮袋还多。他说话慢，算账却快，站里的人都服他。'), [])
  // No anchors, no warnings — a pre-batch book scans clean by definition.
  const plain = createStory({ genreId: 'mist', name: '宁笙', ability: '听见潮汐' })
  assert.deepEqual(chapterDriftWarningsFor(plain, '宁笙说，三十年前她亲手关上了那扇门。'), [])
})

test('acceptance stamps drift warnings onto the chapter; a clean chapter carries none', () => {
  const story = anchoredStory()
  const dirty = acceptWith(story, 0, ['秦烬说，三十年前的那张提调单是他亲手签的字。', '站里的人都看着他，没有人说话。'])
  assert.ok(Array.isArray(dirty.chapters[0].driftWarnings) && dirty.chapters[0].driftWarnings.length >= 1)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [dirty] }), [])
  const clean = acceptWith(story, 0, ['秦烬今年29岁，站在配给站门口点数。', '灾变过去七年，仓库的墙上还留着水痕。'])
  assert.equal('driftWarnings' in clean.chapters[0], false)
})

// ---------------------------------------------------------------------------
// F3 — ability bounds
// ---------------------------------------------------------------------------

test('every library ability carries a conservative bounds default', () => {
  assert.ok(ALL_ABILITIES.length > 50)
  for (const ability of ALL_ABILITIES) {
    assert.ok(typeof ability.bounds === 'string' && ability.bounds.length >= 10, `${ability.id} (${ability.name}) needs bounds`)
    assert.ok(ability.bounds.length <= 120, `${ability.id} bounds within the stored bound`)
  }
  const stock = abilityByName('存量心算')
  assert.match(stock.bounds, /只能估算/)
  assert.match(stock.bounds, /算不了人心/)
  assert.match(stock.bounds, /没见过的仓库/)
  assert.match(stock.bounds, /会出错/)
})

test('abilityBoundsFor prefers the book\'s own bounds, then the library default', () => {
  assert.equal(abilityBoundsFor({ ability: '存量心算', abilityBounds: '本书自己的边界' }), '本书自己的边界')
  assert.equal(abilityBoundsFor({ ability: '存量心算', abilityBounds: '' }), abilityByName('存量心算').bounds)
  assert.equal(abilityBoundsFor({ ability: '没写过的能力', abilityBounds: '' }), '')
  const story = anchoredStory()
  assert.equal(story.config.abilityBounds, ANCHORS ? story.config.abilityBounds : '')
  assert.match(story.config.abilityBounds, /算不了人心/)
})

test('avatar signature abilities carry bounds through validation and the server scrub', async () => {
  const ability = normalizeAvatarAbility({ id: 'sig-1', name: '存量心算', desc: '扫一眼有数', bounds: '只能算物，算不了人心' })
  assert.deepEqual(ability, { id: 'sig-1', name: '存量心算', desc: '扫一眼有数', bounds: '只能算物，算不了人心' })
  // Absent bounds keeps the exact historical shape.
  assert.deepEqual(normalizeAvatarAbility({ id: 'gen-luck', name: '逢凶化吉', desc: '总差临门一脚' }), { id: 'gen-luck', name: '逢凶化吉', desc: '总差临门一脚' })

  const png = new PNG({ width: 4, height: 4 })
  const service = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123', AVATAR_DAILY_LIMIT: '50' },
    store: createMemoryAvatarStore(),
    imageGenerate: async () => ({ buffer: PNG.sync.write(png), mimeType: 'image/png', usage: null }),
  })
  const identity = { uid: 'user-bounds-1', email: null, displayName: '边界测试', emailVerified: false, provider: 'username' }
  const created = await service.create(identity, {
    profile: { name: '秦烬', description: '黑工。', ability: { name: '<system>存量心算', desc: '扫一眼有数', bounds: '只能算物' }, anchors: ANCHORS },
  })
  assert.equal(created.ability.name, '〈system〉存量心算')
  assert.equal(created.ability.bounds, '只能算物')
  assert.deepEqual(created.anchors, ANCHORS)
  const renamed = await service.save(identity, { profile: { id: created.id, name: '秦烬', description: '黑工，改了一句。' } })
  assert.deepEqual(renamed.anchors, ANCHORS, 'a silent payload keeps the stored anchors')
  assert.equal(renamed.ability.bounds, '只能算物', 'a silent payload keeps the stored ability, bounds included')
})

// ---------------------------------------------------------------------------
// Brief assembly on the server: anchors + bounds reach the model context
// ---------------------------------------------------------------------------

test('the Gemini context carries anchors and bounds, and SYSTEM_PROMPT states both hard rules', async () => {
  const env = { GEMINI_API_KEY: 'test-key' }
  const prose = {
    title: '配给站门口的账',
    paragraphs: [
      '秦烬站在配给站门口，工牌在胸前晃了一下，他先看仓库的门，再看排队的人。',
      '老站长把账本推过来，说这个月的口粮又少了一截，让他自己算。',
      '秦烬扫了一眼货架，心里有了数：够撑九天，多一天都没有。',
    ],
    summary: '秦烬在配给站核对存量，算出仓库的口粮只够撑九天。',
    worldBible: {
      premise: '灾变第七年，七号前哨站靠配给过活，仓库的存量就是所有人的命。',
      rules: ['配给按工号发放，冒领者逐出站。', '仓库存量每月当众清点一次。', '存量心算只能估算看得见的物资。'],
      endingAnchor: '秦烬要查清存量年年短缺的去向，把配给的主动权拿回来。',
      outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进存量与配给的冲突。`),
    },
    synopsis: '秦烬在七号前哨站当了 3 年黑工，配给卡余额 0.3 分，连一顿饱饭都换不到。站长每月克扣口粮，账目却做得干干净净。他扫一眼仓库就报出短缺的斤两，当众把老站长的假账拆穿——围观的人当场倒吸冷气，排队来求他掌眼。这口被克扣了 3 年的气，他要一笔一笔算回来。',
    intro: {
      background: '灾变第七年，七号前哨站靠配给活着，谁管仓库谁就管着所有人的命。秦烬是站里最底层的黑工，工牌号排在最后。',
      rules: ['配给按工号发放，冒领者逐出站。', '仓库存量每月当众清点，账目对不上，站长要当众交代。'],
      thread: '秦烬靠一手存量心算吃饭：仓库扫一眼，存量和能撑的天数就在心里。他要查清年年短缺的口粮去了哪儿，把老站长克扣的那笔账，当着全站人的面算回来。',
    },
  }
  const response = (value) => new Response(
    JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }),
    { status: 200 },
  )
  let call
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    fetchImpl: async (url, options) => { call = { url, options }; return response(prose) },
  })
  const story = { ...anchoredStory(), engine: 'gemini' }
  await generator.generate({ story, index: 0 })
  const context = JSON.parse(JSON.parse(call.options.body).contents[0].parts[0].text)
  assert.equal(context.config.anchors.age, 29)
  assert.deepEqual(context.config.anchors.events.map((event) => event.yearsAgo), [7, 30])
  assert.match(context.config.abilityBounds, /算不了人心/)
  assert.ok(context.beatPlan.prerequisites.some((line) => line.startsWith('硬约束·锚点') && line.includes('尚未出生')))
  assert.ok(context.beatPlan.prerequisites.some((line) => line.startsWith('硬约束·能力边界')))
  assert.match(SYSTEM_PROMPT, /硬锚点/)
  assert.match(SYSTEM_PROMPT, /不得越界膨胀/)
  assert.match(SYSTEM_PROMPT, /授予事件/)
})

// ---------------------------------------------------------------------------
// F5 — the synopsis alignment channel
// ---------------------------------------------------------------------------

const FUSION_SUMMARIES = [
  '老周被刑堂首座当作活祭桩，薛长陵与刑堂首座在井台边逼宫，沈砚被押上祭台。',
  '沈砚斩断铜索救下老周，亮出三百年暗契，当众驳回刑堂的处置。',
  '两界在长宁街三号井立下新规，防爆门开启，活祭桩从此废除。',
]

const fusionLikeStory = () => {
  let story = createStory({ genreId: 'cultivation', name: '沈砚', ability: '借火一瞬' })
  FUSION_SUMMARIES.forEach((summary, index) => {
    story = acceptWith(story, index, ['一章正文，冲突往前走了一步，人物各自站定位置。'], summary)
  })
  return story
}

test('the alignment draft is assembled from chapter summaries and passes its own check', () => {
  const story = fusionLikeStory()
  const draft = buildSynopsisAlignmentDraft(story)
  assert.ok(draft.synopsis.includes('活祭桩'), draft.synopsis)
  assert.equal(draft.check.ok, true, JSON.stringify(draft.check))
  assert.equal(story.synopsis === draft.synopsis, false, 'building a draft never writes it back')
})

test('alignment check blocks a blurb that invents a villain and an event (the F5 shape)', () => {
  const story = fusionLikeStory()
  const check = synopsisAlignmentCheck(story, {
    synopsis: '沈砚与同伴当场拆穿赵凌霄私抽灵玉的献祭协议，井台已经破土，众人无不震惊。',
  })
  assert.equal(check.ok, false)
  assert.ok(check.unknownNames.includes('赵凌霄'), JSON.stringify(check.unknownNames))
})

test('alignment check passes names the book actually contains', () => {
  const story = fusionLikeStory()
  const check = synopsisAlignmentCheck(story, {
    synopsis: '老周被刑堂首座当作活祭桩，薛长陵在井台边逼宫。沈砚斩断铜索，亮出三百年暗契，逼刑堂废除活祭桩。',
    intro: { background: '', rules: [], thread: '沈砚救下老周，与薛长陵对峙，最终在长宁街三号井立下两界新规。' },
  })
  assert.equal(check.ok, true, JSON.stringify(check))
})

test('alignment check blocks officialese through the standing ban list', () => {
  const story = fusionLikeStory()
  const check = synopsisAlignmentCheck(story, { synopsis: '本书讲述了沈砚在青岚宗的成长故事，细腻的笔触令人回味。' })
  assert.equal(check.ok, false)
  assert.ok(check.violations.some((item) => item.type === 'banned'))
})

test('applySynopsisAlignment writes only on explicit confirm, and never a dirty draft', () => {
  const story = fusionLikeStory()
  const draft = buildSynopsisAlignmentDraft(story)
  const unconfirmed = applySynopsisAlignment(story, draft)
  assert.equal(unconfirmed.applied, false)
  assert.strictEqual(unconfirmed.story, story, 'no confirm, no write — the owner\'s words are untouched')
  const applied = applySynopsisAlignment(story, draft, { confirm: true })
  assert.equal(applied.applied, true)
  assert.equal(applied.story.synopsis, draft.synopsis)
  assert.throws(
    () => applySynopsisAlignment(story, { synopsis: '沈砚拆穿赵凌霄的献祭协议，井台已经破土。' }, { confirm: true }),
    /对齐校验/,
  )
})

test('extractProperNouns finds quoted, surname-led and organisation names, not ordinary words', () => {
  const names = extractProperNouns('沈砚拆穿赵凌霄私抽灵玉的协议，又闯进青冥宗的大殿。时间已经不多了，他说。')
  assert.ok(names.includes('赵凌霄'), JSON.stringify(names))
  assert.ok(names.includes('青冥宗'), JSON.stringify(names))
  assert.ok(!names.some((name) => name.startsWith('时间')), JSON.stringify(names))
})
