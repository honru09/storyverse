import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGeminiGenerator, styleSliceFor, SYSTEM_PROMPT } from '../server/gemini.js'
import { createStory, storyBeatPlan } from '../src/story-engine.js'
import { avatarDraftPatch } from '../src/avatar.js'
import {
  PERSONALITY_TRAITS,
  drawPersonalityTraits,
  personalityTraitText,
} from '../src/personality-traits.js'
import {
  INSPIRATION_FRAGMENTS,
  drawInspirationFragments,
} from '../src/inspiration-fragments.js'

// ---------------------------------------------------------------------------
// FORGE-TRIM （造世瘦身） + GEN-QUALITY （文风蒸馏库接线）: the forge stops
// re-asking what an avatar already carries, the trait becomes the
// reader's own text backed by the 100-entry library, the 故事风格 cards
// and the world-step 写法 chips are gone, the god-mode sparks draw from
// the 100-hook library, and generation injects one distilled exemplar
// anchor plus four drawn craft cards per chapter, inside the §10 quota.
// ---------------------------------------------------------------------------

const env = { GEMINI_API_KEY: 'test-key-never-used-on-network' }
const quality = JSON.parse(readFileSync(new URL('../knowledge/gen-quality.json', import.meta.url), 'utf8'))

const prose = (marker) => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    `${marker}：阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。`,
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
  worldBible: {
    premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
    rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
    endingAnchor: '阿遥需要决定如何保留城市的记忆，并在本卷终局为后来者留下可以继续选择的道路。',
    outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已做出的选择。`),
  },
})
const okResponse = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })
const capturing = (capture) => createGeminiGenerator({
  env,
  fetchImpl: async (_url, options) => {
    capture.body = JSON.parse(options.body)
    capture.input = capture.body.contents[0].parts[0].text
    capture.system = capture.body.systemInstruction.parts[0].text
    return okResponse(prose('正文'))
  },
})

// --- the two editorial libraries -------------------------------------------

test('personality library: 100 entries, unique ids, 8–16 character sketches', () => {
  assert.equal(PERSONALITY_TRAITS.length, 100)
  assert.equal(new Set(PERSONALITY_TRAITS.map((entry) => entry.id)).size, 100)
  for (const entry of PERSONALITY_TRAITS) {
    assert.ok(entry.name.length >= 2, entry.name)
    assert.ok(entry.desc.length >= 8 && entry.desc.length <= 16, `${entry.name}: ${entry.desc} (${entry.desc.length})`)
  }
  // The four retired fixed chips live on as library entries.
  for (const legacy of ['嘴硬心软', '温柔理想派', '冷静观察者', '危险好奇心']) {
    assert.ok(PERSONALITY_TRAITS.some((entry) => entry.name === legacy), legacy)
  }
})

test('personality draw: three distinct entries, refresh never repeats the batch on screen', () => {
  const first = drawPersonalityTraits(3)
  assert.equal(first.length, 3)
  assert.equal(new Set(first.map((entry) => entry.id)).size, 3)
  const second = drawPersonalityTraits(3, first.map((entry) => entry.id))
  assert.equal(second.length, 3)
  for (const entry of second) assert.ok(!first.some((shown) => shown.id === entry.id))
  assert.equal(personalityTraitText(PERSONALITY_TRAITS[0]), `${PERSONALITY_TRAITS[0].name}：${PERSONALITY_TRAITS[0].desc}`)
})

test('inspiration library: 100 hooks, the retired atmospheric pool is gone', () => {
  assert.equal(INSPIRATION_FRAGMENTS.length, 100)
  assert.equal(new Set(INSPIRATION_FRAGMENTS.map((entry) => entry.text)).size, 100)
  const retired = [
    '这里的雨只落在说谎的人头上。',
    '每个人出生时都带着一把钥匙，却没有人见过锁。',
    '时间是通货，穷人向富人借明天。',
    '这座城每晚都会换一个位置醒来。',
  ]
  for (const line of retired) assert.ok(!INSPIRATION_FRAGMENTS.some((entry) => entry.text === line), line)
  const drawn = drawInspirationFragments(4)
  assert.equal(drawn.length, 4)
  assert.equal(new Set(drawn.map((entry) => entry.id)).size, 4)
})

// --- A.1: the avatar carries its character into the story config -----------

test('avatarDraftPatch maps the profile description into the draft persona', () => {
  const avatar = {
    id: 'avatar-1',
    name: '沈砚',
    description: '从山里走出来的年轻人，话少，手稳。',
    appearance: { hairStyle: 'long', hairColor: 'black', outfit: 'scholar robe', build: 'lean', vibe: 'calm' },
  }
  const patch = avatarDraftPatch(avatar)
  assert.equal(patch.name, '沈砚')
  assert.equal(patch.avatarId, 'avatar-1')
  assert.equal(patch.persona, '从山里走出来的年轻人，话少，手稳。')
  assert.ok(patch.avatarAppearance.length > 0)
  // An avatar without a written description leaves persona alone.
  const bare = avatarDraftPatch({ id: 'a2', name: '无名', description: '  ', appearance: null })
  assert.ok(!('persona' in bare))
  assert.equal(avatarDraftPatch(null), null)
})

test('an avatar-carried persona reaches the story config and the generation context', async () => {
  const patch = avatarDraftPatch({
    id: 'avatar-9',
    name: '沈砚',
    description: '从山里走出来的年轻人，话少，手稳。',
    appearance: null,
  })
  const story = createStory({ name: patch.name, persona: patch.persona, avatarId: patch.avatarId })
  assert.equal(story.config.persona, '从山里走出来的年轻人，话少，手稳。')
  const capture = {}
  await capturing(capture).generate({ story, index: 0 })
  const context = JSON.parse(capture.input)
  assert.equal(context.config.persona, '从山里走出来的年轻人，话少，手稳。')
})

// --- A.3: stored tone values stay readable, generation ignores them --------

test('a story stored with a legacy tone still plans and generates', async () => {
  const story = createStory({ name: '阿遥', tone: '悬疑推进' })
  assert.equal(story.config.tone, '悬疑推进')
  const plan = storyBeatPlan(story, 0)
  assert.ok(plan.toneDirective, 'the engine table still answers a stored tone')
  const capture = {}
  const result = await capturing(capture).generate({ story, index: 0 })
  assert.equal(result.chapter.paragraphs.length, 3)
  const context = JSON.parse(capture.input)
  assert.equal(context.styleAnchor, undefined, 'no template pinned, no style slice')
})

// --- C: the style slice ------------------------------------------------------

test('style slice: every mapped template draws its exemplar anchor, unmapped and unpinned draw none', () => {
  for (const templateId of Object.keys(quality.templateExemplars)) {
    const slice = styleSliceFor({ id: `s-${templateId}`, genreTemplateId: templateId, config: {} }, 0, quality)
    assert.ok(slice, templateId)
    assert.equal(slice.anchor.genre, templateId)
    assert.ok(slice.anchor.text.length >= 200, templateId)
    assert.match(slice.anchor.declaration, /不许挪用/)
  }
  assert.equal(styleSliceFor({ id: 's-none', config: {} }, 0, quality), null)
  assert.equal(styleSliceFor({ id: 's-nope', genreTemplateId: 'not-a-template', config: {} }, 0, quality), null)
  assert.equal(styleSliceFor({ id: 's-off', genreTemplateId: 'xuanhuan', config: {} }, 0, null), null)
  // Nearest-family fallback: campus writes from the 都市 passage.
  const campus = styleSliceFor({ id: 's-campus', genreTemplateId: 'campus', config: {} }, 0, quality)
  assert.equal(campus.anchor.text, quality.exemplars.dushi)
})

test('style slice: card draw is deterministic, three cards, names and formulas only', () => {
  const story = { id: 'story-deterministic', genreTemplateId: 'xuanhuan', config: {} }
  const a = styleSliceFor(story, 3, quality)
  const b = styleSliceFor(story, 3, quality)
  assert.deepEqual(a, b)
  assert.equal(a.cards.items.length, 3)
  for (const item of a.cards.items) assert.deepEqual(Object.keys(item).sort(), ['formula', 'name'])
  // The first card is always the chapter's hook card of the declared type.
  const hookCard = quality.cards.find((card) => card.name === a.cards.items[0].name)
  assert.equal(hookCard.kind, 'hook')
  assert.equal(hookCard.hookType, a.cards.hookType)
})

test('style slice: hook types rotate — never the same type twice in a row, all four within four chapters', () => {
  const story = { id: 'story-rotation', genreTemplateId: 'horror', config: {} }
  const types = Array.from({ length: 12 }, (_, index) => styleSliceFor(story, index, quality).cards.hookType)
  for (let i = 1; i < types.length; i += 1) assert.notEqual(types[i], types[i - 1], `chapters ${i} and ${i + 1}`)
  assert.deepEqual([...new Set(types.slice(0, 4))].sort(), [...quality.hookTypes].sort())
})

test('generation request carries the anchor and cards for a pinned template, inside the §10 quota', async () => {
  const story = createStory({ name: '林烬', genreTemplateId: 'xuanhuan' })
  const capture = {}
  await capturing(capture).generate({ story, index: 0 })
  const context = JSON.parse(capture.input)
  assert.equal(context.styleAnchor.genre, 'xuanhuan')
  assert.ok(context.styleAnchor.text.includes('测灵碑'), 'the 玄幻 exemplar itself rides as the anchor')
  assert.equal(context.styleCards.items.length, 3)
  assert.ok(context.styleCards.declaration.includes(context.styleCards.hookType))
  // The §10 quota counts carried content: both declarations, the
  // passage, and every card's name + formula.
  const contentChars = context.styleAnchor.declaration.length + context.styleAnchor.text.length
    + context.styleCards.declaration.length
    + context.styleCards.items.reduce((sum, item) => sum + item.name.length + item.formula.length, 0)
  assert.ok(contentChars >= 450 && contentChars <= 700, `slice content is ${contentChars} chars (STYLE-BIBLE §10 budget ≈500–700)`)
})

test('SYSTEM_PROMPT carries the distilled numeric rules', () => {
  assert.match(SYSTEM_PROMPT, /每 300–500 字至少一个推进点/)
  assert.match(SYSTEM_PROMPT, /单章至少 3 个/)
  assert.match(SYSTEM_PROMPT, /前 100 字内交齐三件事/)
  assert.match(SYSTEM_PROMPT, /压抑与兑现之比不超过 2:1/)
  assert.match(SYSTEM_PROMPT, /倒吸一口凉气/)
  assert.match(SYSTEM_PROMPT, /每段约 40–150 字/)
  assert.match(SYSTEM_PROMPT, /styleAnchor/)
  assert.match(SYSTEM_PROMPT, /styleCards/)
})
