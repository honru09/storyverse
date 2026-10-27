import test from 'node:test'
import assert from 'node:assert/strict'
import { createStory, createMergedStory, publicSnapshot } from '../src/story-engine.js'
import { avatarJourneys } from '../src/avatar.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import { mergeSourceContext } from '../src/generation.js'
import { createGeminiGenerator, DEFAULT_MODEL } from '../server/gemini.js'

const LOOK = '银灰，利落短发，现代街头，运动鞋，雀斑'
const env = { GEMINI_API_KEY: '<MASKED_SECRET_001>' }
const prose = (opening) => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    '阿灿站在白潮港的岸边，银灰色短发被海风吹乱，运动鞋踩在湿漉漉的石阶上。',
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿灿在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
  ...(opening ? {
    worldBible: {
      premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
      rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
      endingAnchor: '阿灿需要决定如何保留城市的记忆，并在本卷终局为后来者留下可以继续选择的道路。',
      outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已做出的选择。`),
    },
  } : {}),
})
const response = (value) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 })
const contextFrom = (options) => JSON.parse(JSON.parse(options.body).contents[0].parts[0].text)

test('a story opened with an avatar carries the id and the look in its config', () => {
  const story = createStory({ name: '阿灿', genreId: 'mist', avatarId: 'avatar-abc', avatarAppearance: LOOK })
  assert.equal(story.config.avatarId, 'avatar-abc')
  assert.equal(story.config.avatarAppearance, LOOK)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [story] }), [])
  const plain = createStory({ name: '阿灿', genreId: 'mist' })
  assert.equal(plain.config.avatarId, '')
  assert.equal(plain.config.avatarAppearance, '')
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [plain] }), [], 'pre-avatar saves stay valid')
})

test('the Gemini brief paints the protagonist from the avatar look', async () => {
  const story = { ...createStory({ name: '阿灿', genreId: 'mist', avatarId: 'avatar-abc', avatarAppearance: LOOK }), engine: 'gemini' }
  let call
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async (url, options) => { call = { url, options }; return response(prose(true)) },
  })
  await generator.generate({ story, index: 0 })
  const context = contextFrom(call.options)
  assert.equal(context.config.avatarAppearance, LOOK)
  assert.equal(context.config.avatarId, undefined, 'the avatar id is bookkeeping; it never reaches the model')
  assert.equal(context.config.name, '阿灿')
})

test('a merge records both avatars and the brief carries both looks', async () => {
  const mine = createStory({ name: '阿灿', genreId: 'mist', avatarId: 'avatar-abc', avatarAppearance: LOOK })
  const theirs = createStory({ name: '林晚舟', genreId: 'cultivation', avatarId: 'avatar-def', avatarAppearance: '乌黑，长直发，仙气长袍，布鞋，眼下泪痣' })
  const merged = createMergedStory(mine, theirs, { rules: 'bridge', lead: 'a', bond: 'allies' })
  assert.equal(merged.config.protagonists[0].avatarId, 'avatar-abc')
  assert.equal(merged.config.protagonists[0].appearance, LOOK)
  assert.equal(merged.config.protagonists[1].avatarId, 'avatar-def')
  assert.match(merged.config.protagonists[1].appearance, /泪痣/)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [merged] }), [])

  const withContext = { ...merged, engine: 'gemini', mergeContext: [mergeSourceContext(mine), mergeSourceContext(theirs)] }
  let call
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async (url, options) => { call = { url, options }; return response(prose(true)) },
  })
  await generator.generate({ story: withContext, index: 0 })
  const context = contextFrom(call.options)
  assert.equal(context.config.protagonists[0].appearance, LOOK)
  assert.match(context.config.protagonists[1].appearance, /泪痣/)
  assert.equal(context.sourceWorlds[0].avatarAppearance, LOOK)
  assert.match(context.sourceWorlds[1].avatarAppearance, /泪痣/)
  assert.equal(DEFAULT_MODEL.length > 0, true)
})

test('journeys derive per avatar: each avatar owns exactly the lines it lived', () => {
  const mine = createStory({ name: '阿灿', genreId: 'mist', avatarId: 'avatar-abc', avatarAppearance: LOOK })
  const other = createStory({ name: '林晚舟', genreId: 'cultivation', avatarId: 'avatar-def', avatarAppearance: '乌黑，长直发，仙气长袍，布鞋，眼下泪痣' })
  const plain = createStory({ name: '无名', genreId: 'mist' })
  const merged = createMergedStory(mine, other, { rules: 'bridge', lead: 'a', bond: 'allies' })
  const stories = [mine, other, plain, merged]
  const abc = avatarJourneys({ id: 'avatar-abc' }, stories)
  assert.deepEqual(abc.map((row) => row.storyId).sort(), [mine.id, merged.id].sort())
  assert.equal(abc.find((row) => row.storyId === merged.id).kind, 'merged')
  const def = avatarJourneys({ id: 'avatar-def' }, stories)
  assert.deepEqual(def.map((row) => row.storyId).sort(), [other.id, merged.id].sort())
  assert.equal(def.find((row) => row.storyId === merged.id).viaMerge, true, 'the partner side joins the merged line via its protagonist entry')
  assert.deepEqual(avatarJourneys({ id: 'avatar-gone' }, stories), [], 'a deleted avatar id simply has no derivable journeys')
})

test('a public snapshot keeps neither the avatar id nor the look', () => {
  const story = createStory({ name: '阿灿', genreId: 'mist', avatarId: 'avatar-abc', avatarAppearance: LOOK })
  const snapshot = publicSnapshot(story)
  assert.equal(snapshot.config.avatarId, '')
  assert.equal(snapshot.config.avatarAppearance, '')
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [snapshot] }), [])
})
