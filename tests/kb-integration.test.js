import test from 'node:test'
import assert from 'node:assert/strict'
import { createGeminiGenerator, SYSTEM_PROMPT } from '../server/gemini.js'
import { acceptGeneratedChapter } from '../src/generation.js'
import {
  acceptChapter,
  BOOK_TITLE_MAX,
  chapterKey,
  bookTitleFormulaFitFor,
  bookTitleFormulaFor,
  bookTitleFormulaForDraft,
  buildChapter,
  chapterTitleBandIdFor,
  chapterTitleFitFor,
  chapterTitleGuidanceFor,
  createStory,
  GENRE_TEMPLATES,
  kbArcLineFor,
  kbArcPositionFor,
  openingPatternFor,
  storyBeatPlan,
  storyTemplateIdFor,
  structureFor,
  worldSkeletonKbFor,
  WORLD_SKELETON_CROSS_LINE,
} from '../src/story-engine.js'

/*
 * REQ-66 （百本知识库接入）: the measured patterns of 100 platform
 * novels (sw-prep/novel-kb-100) ride the existing pipeline — the beat
 * plan's front-24 arc lines, the per-chapter title band, the opening
 * call's opening pattern + world skeleton, and the forge's title
 * formula. Nothing here stands up a parallel system: every helper
 * below is the single source its surface already reads from.
 */

// --- chapter title bands (the reconciliation decision) --------------------

test('chapter title bands map by family and default to the standard band', () => {
  assert.equal(chapterTitleBandIdFor('xianxia'), 'duizhang')
  assert.equal(chapterTitleBandIdFor('xuanhuan'), 'duizhang')
  assert.equal(chapterTitleBandIdFor('wuxia'), 'duizhang')
  assert.equal(chapterTitleBandIdFor('lingyi'), 'duizhang')
  assert.equal(chapterTitleBandIdFor('suspense-supernatural'), 'duizhang')
  assert.equal(chapterTitleBandIdFor('urban'), 'long')
  assert.equal(chapterTitleBandIdFor('campus'), 'long')
  assert.equal(chapterTitleBandIdFor('tiyu'), 'long')
  assert.equal(chapterTitleBandIdFor('zhongtian'), 'long')
  assert.equal(chapterTitleBandIdFor('gaowu'), 'standard')
  assert.equal(chapterTitleBandIdFor('chongsheng'), 'standard')
  assert.equal(chapterTitleBandIdFor(''), 'standard')
  assert.equal(chapterTitleBandIdFor(undefined), 'standard')
})

test('chapter title guidance carries the band, and upgrade shifts it up with the result named', () => {
  const plain = chapterTitleGuidanceFor('gaowu')
  assert.match(plain, /标准事件档/)
  assert.match(plain, /4–10 字/)
  assert.match(plain, /不提前剧透本章结局/)
  const upgrade = chapterTitleGuidanceFor('gaowu', { upgrade: true })
  assert.match(upgrade, /6–14 字/)
  assert.match(upgrade, /点明升格结果/)
  assert.match(upgrade, /不算剧透/)
  const duizhang = chapterTitleGuidanceFor('xianxia')
  assert.match(duizhang, /对仗双分句/)
  const long = chapterTitleGuidanceFor('urban')
  assert.match(long, /8–16 字/)
  assert.match(long, /并排本章两件事/)
})

test('chapter title fit checker reads titles against their family band', () => {
  // The measured median is 6 字： a short plain event statement fits now.
  assert.deepEqual(chapterTitleFitFor('秘境开启', 'xuanhuan'), { band: 'duizhang', length: 4, fits: true, issues: [] })
  assert.equal(chapterTitleFitFor('沈砚借到第一缕火', 'xianxia').fits, true)
  // A 12-字 title is above the standard band but inside the upgrade band.
  const twelve = '沈砚在柴房借到第一缕火光'
  assert.equal([...twelve].length, 12)
  assert.deepEqual(chapterTitleFitFor(twelve, 'gaowu').issues, ['above-band'])
  assert.equal(chapterTitleFitFor(twelve, 'gaowu', { upgrade: true }).fits, true)
  // The long band takes the two-event explainer titles life genres run.
  assert.equal(chapterTitleFitFor('陆鸣签到领到第一笔钱', 'urban').fits, true)
  assert.deepEqual(chapterTitleFitFor('签到', 'urban').issues, ['below-band'])
  // Hard shapes never fit any band.
  assert.ok(chapterTitleFitFor('3', 'urban').issues.includes('bare-number'))
  assert.ok(chapterTitleFitFor('', 'urban').issues.includes('empty'))
  assert.ok(chapterTitleFitFor('标'.repeat(31), 'urban').issues.includes('over-absolute-max'))
})

// --- the front-24 season arc in the beat plan ------------------------------

test('kb arc positions resolve per length mode', () => {
  const season = createStory({ genreId: 'cultivation', storyLengthMode: 'season', name: '沈砚' })
  assert.equal(kbArcPositionFor(structureFor(season, 0), 0), 1)
  assert.equal(kbArcPositionFor(structureFor(season, 23), 23), 24)
  const long = createStory({ genreId: 'neon', storyLengthMode: 'long', name: '陆鸣' })
  assert.equal(kbArcPositionFor(structureFor(long, 26), 26), 3, 'a long line rolls the 24-chapter skeleton')
  const endless = createStory({ genreId: 'mist', storyLengthMode: 'endless', name: '遥' })
  assert.equal(kbArcPositionFor(structureFor(endless, 24), 24), 1)
  const custom = createStory({ genreId: 'mist', storyLengthMode: 'custom', targetChapters: 37, name: '遥' })
  assert.equal(kbArcPositionFor(structureFor(custom, 2), 2), 3)
  assert.equal(kbArcPositionFor(structureFor(custom, 24), 24), null, 'custom lines follow the arc for their first block only')
  const short = createStory({ genreId: 'mist', name: '遥' })
  assert.equal(kbArcPositionFor(structureFor(short, 0), 0), null)
  assert.equal(kbArcLineFor(structureFor(short, 0), 0), '')
})

test('storyBeatPlan carries the KB arc line for each front-24 segment', () => {
  const season = createStory({ genreId: 'cultivation', storyLengthMode: 'season', name: '沈砚' })
  const ground = (index) => storyBeatPlan(season, index).mustGround.join('\n')
  assert.match(ground(0), /谷底定格与异变点.*同时落地/)
  assert.match(ground(1), /金手指或核心规则讲清/)
  assert.match(ground(2), /第一次小兑现必须在本章落地/)
  assert.match(ground(5), /进入新场域：压迫者与第一个盟友/)
  assert.match(ground(10), /第一次公开小胜/)
  assert.match(ground(16), /小 Boss 战或一次公开评比/)
  assert.match(ground(21), /向季终升格蓄势/)
  // Chapter 24: no segment line, but the finale carries the magnitude line.
  assert.doesNotMatch(ground(23), /向季终升格蓄势/)
  assert.match(ground(23), /第 50–120 章的事件/)
  assert.match(ground(23), /不许用小胜充数/)
})

test('upgrade points carry the public-ritual line; short lines take no KB arc', () => {
  const season = createStory({ genreId: 'cultivation', storyLengthMode: 'season', name: '沈砚' })
  const unitEnd = storyBeatPlan(season, 5).mustGround.join('\n')
  assert.match(unitEnd, /升格落在公开场合才算数/)
  const plain = storyBeatPlan(season, 3).mustGround.join('\n')
  assert.doesNotMatch(plain, /升格落在公开场合才算数/)
  const short = createStory({ genreId: 'mist', name: '遥' })
  for (let index = 0; index < 6; index += 1) {
    const text = storyBeatPlan(short, index).mustGround.join('\n')
    assert.doesNotMatch(text, /谷底定格与异变点|第一次小兑现必须在本章落地|升格落在公开场合/)
  }
})

// --- opening patterns & world skeletons ------------------------------------

test('opening patterns map by family with the four-beat skeleton in every line', () => {
  assert.equal(openingPatternFor('chongsheng').type, '重生点型')
  assert.equal(openingPatternFor('wuxianliu').type, '系统降临型')
  assert.equal(openingPatternFor('urban').type, '羞辱型')
  assert.equal(openingPatternFor('gongdou').type, '身份揭底型')
  assert.equal(openingPatternFor('romance-ancient').type, '身份揭底型')
  assert.equal(openingPatternFor('guize-guatan').type, '设定铺陈型（规则条文）')
  assert.equal(openingPatternFor('lingyi').type, '日常切入型')
  assert.equal(openingPatternFor('zhongtian').type, '日常切入型')
  assert.equal(openingPatternFor('gaowu').type, '冲突型')
  assert.equal(openingPatternFor('').type, '冲突型')
  for (const template of GENRE_TEMPLATES) {
    const pattern = openingPatternFor(template.id)
    assert.match(pattern.line, /定格.*异变.*规则一瞥.*章末钩/, template.id)
    assert.match(pattern.line, /红线/, template.id)
  }
})

test('every template carries a measured world skeleton line', () => {
  assert.match(WORLD_SKELETON_CROSS_LINE, /双层世界是默认/)
  assert.match(WORLD_SKELETON_CROSS_LINE, /标尺必须可数/)
  for (const template of GENRE_TEMPLATES) {
    const line = worldSkeletonKbFor(template.id)
    assert.ok(line.length >= 20, `${template.id} skeleton line`)
  }
  assert.match(worldSkeletonKbFor('urban'), /金额量级阶梯/)
  assert.match(worldSkeletonKbFor('urban'), /三段揭露/)
  assert.match(worldSkeletonKbFor('wuxianliu'), /只保留一种形态/)
  assert.match(worldSkeletonKbFor('gongdou'), /体面碾压/)
  assert.equal(worldSkeletonKbFor('no-such-template'), '')
})

// --- book title formulas -----------------------------------------------------

test('book title formulas cover every template and compose inside the REQ-63 ceiling', () => {
  for (const template of GENRE_TEMPLATES) {
    const formula = bookTitleFormulaFor(template.id)
    assert.ok(formula.pattern && formula.formula && formula.hook, template.id)
    assert.match(formula.target, /11–13 字/)
    assert.ok(formula.target.includes(String(BOOK_TITLE_MAX)), 'the ceiling the formula quotes is the platform limit')
  }
  assert.equal(bookTitleFormulaFor('tiyu').pattern, '冒号分段式')
  assert.match(bookTitleFormulaFor('urban').formula, /赘婿/)
  assert.match(bookTitleFormulaFor('chongsheng').formula, /都重生了，谁还/)
  assert.equal(bookTitleFormulaFor('no-such-template').pattern, '身份式 / 开局式 / 宣言式')
  // A free-genre draft borrows its family's formula.
  assert.equal(bookTitleFormulaForDraft({ genreTemplateId: 'custom', customGenreText: '末世求生' }).pattern, '开局式')
  assert.equal(bookTitleFormulaForDraft({ genreTemplateId: 'tiyu' }).pattern, '冒号分段式')
})

test('book title formula fit is advisory, with the length limit as its only hard line', () => {
  assert.deepEqual(bookTitleFormulaFitFor('凡骨', 'xuanhuan'), { length: 2, fits: true, issues: [] })
  assert.deepEqual(bookTitleFormulaFitFor('凡骨', 'urban').issues, ['short-name-family'])
  assert.deepEqual(bookTitleFormulaFitFor('配给卡余额最低，我在废土囤成王', 'moshi'), { length: 15, fits: true, issues: [] })
  assert.deepEqual(bookTitleFormulaFitFor('平静的小日子', 'urban').issues, ['no-hook-element'])
  assert.deepEqual(bookTitleFormulaFitFor('书'.repeat(BOOK_TITLE_MAX + 1), 'urban').issues, ['over-limit'])
  assert.equal(bookTitleFormulaFitFor('史上最强赘婿', 'urban').fits, true)
})

// --- template resolution ------------------------------------------------------

test('storyTemplateIdFor resolves pins and borrows for free genres', () => {
  assert.equal(storyTemplateIdFor({ genreTemplateId: 'xianxia' }), 'xianxia')
  assert.equal(storyTemplateIdFor({ config: { genreTemplateId: 'tiyu' } }), 'tiyu')
  assert.equal(storyTemplateIdFor({ config: { genreTemplateId: 'custom', customGenreText: '末世求生' } }), 'moshi')
  assert.equal(storyTemplateIdFor({ config: {} }), '')
  assert.equal(storyTemplateIdFor(null), '')
})

// --- the generator context carries the KB blocks -------------------------------

const env = { GEMINI_API_KEY: 'test' }

const prose = () => ({
  title: '沈砚借到第一缕火',
  paragraphs: [
    '沈砚在柴房的柴堆上醒来，管事在门外喊：醒了就先挑三百担水，挑不完不许吃饭。',
    '他攥住枕边那缕自己挪了位置的火种，掌心一烫，火苗顺着指缝亮了起来。',
    '管事推门进来，话说到一半停住了——柴房里没有点灯，却亮得像正午。',
  ],
  summary: '沈砚在柴房醒来，被逼挑水，枕边火种自行移位并在他掌心点亮，管事撞见异象。',
})

const bible = () => ({
  premise: '灵脉枯竭的青岚宗把最后的火种藏进凡人的梦里，借火要付记忆的账。',
  rules: ['借来的火每用一次，就烧掉施术者的一段记忆。', '火种只认第一个在梦里接住它的人。', '宗门每月公开测一次火候，名次决定灵田的分配。'],
  endingAnchor: '沈砚要决定借火登天的路走到哪一步收手，并结清记忆的账。',
  outline: Array.from({ length: 24 }, (_, index) => `第${index + 1}章推进火种的秘密，同时保留人物关系与已经做出的选择。`),
})

const response = (value) => new Response(
  JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }),
  { status: 200 },
)

const capturingGenerator = (capture, outputs) => createGeminiGenerator({
  env,
  sleep: async () => {},
  fetchImpl: async (_url, options) => {
    capture.input = JSON.parse(options.body).contents[0].parts[0].text
    return response(outputs.shift())
  },
})

test('KB context blocks ride the opening call; the title band rides every call', async () => {
  const story = { ...createStory({ name: '沈砚', genreId: 'cultivation', genreTemplateId: 'xianxia', storyLengthMode: 'season' }), engine: 'gemini' }
  const capture = {}
  const generator = capturingGenerator(capture, [{ ...prose(), worldBible: bible(), synopsis: '沈砚在青岚宗当了 3 年杂役，测灵根测出废品，管事逼他每天挑 300 担水。柴房那晚，他枕边的火种自己挪了位置，掌心一攥，火就着了。第一次测火候，踩着他上位的天才当场变了脸。这火，他借定了。', intro: { background: '青岚宗的灵脉正在枯竭，火种是全宗最后的指望，杂役连碰灵田的资格都没有。沈砚住在外门柴房，是全宗垫底的那一个。', rules: ['借来的火每用一次，就烧掉施术者的一段记忆。'], thread: '沈砚被管事压着挑水，火种却偏偏认了他。测火候、灵田分配、大比名次——他要借着这缕火，一格一格把垫底的位置翻过来，先翻的，就是管事那张脸。' } }, prose()])
  const first = await generator.generate({ story, index: 0 })
  const opening = JSON.parse(capture.input)
  assert.equal(opening.openingPattern.type, '冲突型')
  assert.match(opening.openingPattern.line, /四段骨架/)
  assert.match(opening.worldSkeletonKb.cross, /双层世界是默认/)
  assert.match(opening.worldSkeletonKb.family, /宗门小社会/)
  assert.match(opening.chapterTitleStyle, /对仗档/)
  assert.match(opening.chapterTitleStyle, /4–13 字/)
  const next = acceptGeneratedChapter(story, first)
  await generator.generate({ story: next, index: 1 })
  const later = JSON.parse(capture.input)
  assert.equal(later.openingPattern, undefined, 'later chapters never pay for the opening pattern')
  assert.equal(later.worldSkeletonKb, undefined, 'later chapters never pay for the world skeleton')
  assert.match(later.chapterTitleStyle, /对仗档/, 'the title band rides every chapter')
})

test('an upgrade chapter context shifts the title band up', async () => {
  let story = { ...createStory({ name: '沈砚', genreId: 'cultivation', genreTemplateId: 'xianxia', storyLengthMode: 'season' }), engine: 'gemini' }
  for (let index = 0; index < 5; index += 1) {
    const chapter = buildChapter(story, index)
    story = acceptChapter(story, chapter, chapterKey(story, index))
  }
  const capture = {}
  const generator = capturingGenerator(capture, [prose()])
  await generator.generate({ story, index: 5 })
  const context = JSON.parse(capture.input)
  assert.match(context.chapterTitleStyle, /8–16 字/, 'chapter 6 is a unit end: the duizhang band shifts up')
  assert.match(context.chapterTitleStyle, /点明升格结果/)
})

test('SYSTEM_PROMPT speaks the reconciled title rule and the blurb additions', () => {
  assert.match(SYSTEM_PROMPT, /chapterTitleStyle/)
  assert.match(SYSTEM_PROMPT, /默认标准事件档 4–10 字/)
  assert.match(SYSTEM_PROMPT, /禁用意象谜语体/)
  assert.doesNotMatch(SYSTEM_PROMPT, /陈述句，8–16 字/)
  assert.match(SYSTEM_PROMPT, /感叹号全季不超过 3 处/)
  assert.match(SYSTEM_PROMPT, /每 4–6 章至少有一个标题带数字/)
  // The blurb keeps every REQ-65 rule and gains the KB's missing pieces.
  assert.match(SYSTEM_PROMPT, /爽点预订单/)
  assert.match(SYSTEM_PROMPT, /把反差钉死/)
  assert.match(SYSTEM_PROMPT, /宫斗宅斗（女频）走另一支/)
  assert.match(SYSTEM_PROMPT, /声明式标签行/)
  assert.match(SYSTEM_PROMPT, /第一眼见题材、第二眼见反差、第三眼见爽点/)
  assert.match(SYSTEM_PROMPT, /openingPattern/)
  assert.match(SYSTEM_PROMPT, /worldSkeletonKb/)
})
