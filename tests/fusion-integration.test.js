import test from 'node:test'
import assert from 'node:assert/strict'
import { createGeminiGenerator } from '../server/gemini.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createMergedStory,
  createStory,
  outlineLengthFor,
  totalChaptersFor,
} from '../src/story-engine.js'
import { mergeSourceContext } from '../src/generation.js'
import { avatarCollectionSignature } from '../src/avatar.js'

/**
 * Cross-batch integration points surfaced by the merge-wave Gemini
 * review (2026-10-31): each test pins one interaction that no single
 * branch's own suite could see, because the two sides of the seam
 * landed in different branches.
 */

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    current = acceptChapter(current, buildChapter(current, index), chapterKey(current, index))
  }
  return current
}
const finishedShort = (options = {}) => walkLocal(createStory({ genreId: 'mist', ...options }), 6)

// --- REQ-61 × REQ-57: the lead's story-level ability description must
// not ride a fused line as if it described the whole cast. -----------

test('a fused line clears the lead ability description; cast abilities stay per person', () => {
  const a = finishedShort({ name: '沈砚', ability: '借火一瞬', abilityDesc: '借来的火只能烧三息，烧完要还双倍的冷。' })
  const b = finishedShort({ name: '陆鸣', genreId: 'city', ability: '签到系统', abilityDesc: '每天签到领一笔钱，断签清零。' })
  assert.equal(a.config.abilityDesc, '借来的火只能烧三息，烧完要还双倍的冷。', 'fixture: the source carries its description')
  const merged = createMergedStory([a, b])
  assert.equal(merged.config.abilityDesc, '', 'the fused config carries no single-protagonist ability description')
  assert.deepEqual(merged.config.protagonists.map((person) => person.ability), ['借火一瞬', '签到系统'], 'each lead keeps his own ability name')
})

// --- REQ-61 × REQ-59: a merged opening's brief must not carry the
// lead world's preset-draft block; sources travel via sourceWorlds. --

const env = { GEMINI_API_KEY: ['test', 'key', 'never', 'used', 'on', 'network'].join('-') }
const okResponse = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })

test('a merged opening brief carries sourceWorlds and no worldSettingData host block', async () => {
  const draft = { name: '青岚山门', setting: '火种会自己挑人，挑中的人夜里听见山在呼吸。' }
  const a = { ...finishedShort({ name: '沈砚', genreId: 'cultivation', worldDrafts: { cultivation: draft } }), title: '剑碑夜行' }
  const b = { ...finishedShort({ name: '陆鸣', genreId: 'city' }), title: '长宁夜话' }
  assert.equal(a.config.worldDrafts.cultivation.setting, draft.setting, 'fixture: the lead source carries an edited world draft')
  // The client attaches each source's world context at creation time
  // (the runMerge hand-off); mirror that here.
  const merged = { ...createMergedStory([a, b]), engine: 'gemini', mergeContext: [a, b].map((story) => mergeSourceContext(story)) }
  const capture = {}
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async (_url, options) => {
      capture.input = JSON.parse(options.body).contents[0].parts[0].text
      return okResponse({
        title: '两界初逢',
        paragraphs: [
          '沈砚睁开眼时，雾正从界碑两侧同时漫过来，左边的雾带着松脂味，右边的雾里却有一股霓虹灯烧热的焦味。',
          '陆鸣站在碑的另一边，手里还攥着没送完的外卖单，他先看了看碑，又看了看沈砚，说这单怕是送不到了。',
          '界碑上的字一行行亮起来，像在清点刚到的人，最后停在两个名字上，再也不动了，雾也跟着停了下来。',
        ],
        summary: '沈砚与陆鸣在界碑两侧醒来，融合世界第一次向两人显形。',
        worldBible: {
          premise: '两个世界的边缘在界碑处接壤，规则互相翻译，沈砚与陆鸣都是这片新土地的本地人。',
          rules: ['界碑只认两边都承认的事实。', '雾起时过碑要付一份记忆作路费。', '两边的规则冲突时，先按客人的规矩办。'],
          endingAnchor: '两人要决定界碑两侧的世界是合并还是划界。',
          outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章，两界的规则再撞上一次，两人各付一份代价。`),
        },
      })
    },
  })
  await generator.generate({ story: merged, index: 0 })
  assert.ok(capture.input.includes('sourceWorlds'), 'the brief carries the per-source worlds')
  assert.ok(!capture.input.includes('worldSettingData'), 'no preset-draft host block rides a merged telling')
  // The lead draft may live inside sourceWorlds as that source's own
  // history — what it must never do is pose as the fused line's own
  // world: not in the compacted config, not in the beat plan's ground.
  assert.ok(!capture.input.includes('"worldSetting":"火种会自己挑人'), 'the compacted config does not present the lead setting as the fused world setting')
  assert.ok(!capture.input.includes('世界设定：火种会自己挑人'), 'the beat plan does not ground the fused line in the lead setting')
  assert.ok(!capture.input.includes('世界：青岚山门（出生点'), 'the beat plan does not seat the fused line in the lead world')
})

// --- Gemini doubt A disposition evidence: season/long fused lines
// take the genre outline by their own totals (24/100), and a custom
// -genre lead still resolves an outline instead of throwing. ---------

test('a three-source season fusion outlines 24 chapters by its own total', () => {
  const a = finishedShort({ name: '阿澜' })
  const b = finishedShort({ name: '沈砚', genreId: 'cultivation' })
  const c = finishedShort({ name: '陆鸣', genreId: 'neon' })
  const merged = createMergedStory([a, b, c], { storyLengthMode: 'season' })
  assert.equal(totalChaptersFor(merged), 24)
  assert.equal(outlineLengthFor(merged), 24)
  assert.equal(merged.worldBible.outline.length, 24, 'the local scaffold outline matches the season total')
})

test('a custom-genre lead still fuses into a season line with a full outline', () => {
  const a = finishedShort({ name: '阿澜', genreId: 'custom', customGenreText: '海岛渔村的守灯人代代相传' })
  const b = finishedShort({ name: '陆鸣', genreId: 'city' })
  const merged = createMergedStory([a, b], { storyLengthMode: 'season' })
  assert.equal(totalChaptersFor(merged), 24)
  assert.equal(merged.worldBible.outline.length, 24)
})

// --- REQ-57 × REQ-58: an ability-only avatar edit must move the
// collection signature, or the profile stage ability line goes stale. -

test('an ability-only avatar edit changes the collection signature', () => {
  const base = [{ id: 'avatar-1', name: '沈砚', ability: { name: '借火', desc: '借来的火烧三息。' } }]
  const edited = [{ id: 'avatar-1', name: '沈砚', ability: { name: '听山', desc: '听得见山在呼吸。' } }]
  assert.notEqual(avatarCollectionSignature(edited, 'avatar-1'), avatarCollectionSignature(base, 'avatar-1'))
  const cleared = [{ id: 'avatar-1', name: '沈砚' }]
  assert.notEqual(avatarCollectionSignature(cleared, 'avatar-1'), avatarCollectionSignature(base, 'avatar-1'), 'clearing the ability also moves the signature')
})
