import test from 'node:test'
import assert from 'node:assert/strict'

import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createMergedStory,
  createStory,
  finishEndlessLine,
  plazaSnapshot,
} from '../src/story-engine.js'
import {
  enterDraftFor,
  plazaCardIntroFor,
  plazaTitleTierFor,
  plazaGateFor,
  plazaLengthLabel,
  plazaMineForget,
  plazaMineIds,
  plazaMineRemember,
  plazaReaderStory,
  plazaTemplateNameFor,
  plazaWorldNameFor,
} from '../src/plaza.js'

const AVATAR_ID = 'avatar-line-1'

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    current = acceptChapter(current, chapter, chapterKey(current, index))
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, chapter.choice.options[0].id)
    }
  }
  return current
}

const completedSeason = (overrides = {}) => walkLocal(createStory({
  genreId: 'cultivation',
  genreTemplateId: 'xianxia',
  storyLengthMode: 'season',
  originIdentityId: 'mystery',
  startPointName: '山神破庙',
  name: '沈砚',
  avatarId: AVATAR_ID,
  avatarAppearance: '银灰长发，左颊一颗泪痣',
  ability: '借火一瞬',
  ...overrides,
}), 24)

test('plaza gate accepts a finished avatar season line', () => {
  const gate = plazaGateFor(completedSeason())
  assert.equal(gate.publishable, true)
  assert.equal(gate.reason, '')
})

test('plaza gate rejects unfinished, avatar-less, short and merged lines', () => {
  const unfinished = walkLocal(createStory({
    genreId: 'cultivation', genreTemplateId: 'xianxia', storyLengthMode: 'season', avatarId: AVATAR_ID,
  }), 5)
  assert.equal(plazaGateFor(unfinished).publishable, false)
  assert.match(plazaGateFor(unfinished).reason, /还没走完/)

  const noAvatar = completedSeason({ avatarId: '' })
  assert.equal(plazaGateFor(noAvatar).publishable, false)
  assert.match(plazaGateFor(noAvatar).reason, /化身/)

  const short = walkLocal(createStory({
    genreId: 'mist', storyLengthMode: 'short', avatarId: AVATAR_ID,
  }), 6)
  assert.equal(plazaGateFor(short).publishable, false)
  assert.match(plazaGateFor(short).reason, /一季、长线、自定义篇幅或无限连载/)

  const merged = walkLocal(createMergedStory(
    createStory({ genreId: 'mist', avatarId: AVATAR_ID }),
    createStory({ genreId: 'neon' }),
  ), 6)
  assert.equal(plazaGateFor(merged).publishable, false)
  assert.match(plazaGateFor(merged).reason, /合流/)
})

test('plaza labels describe the world, the template and the season length', () => {
  const story = completedSeason()
  assert.equal(plazaWorldNameFor(story), '青岚宗')
  assert.equal(plazaTemplateNameFor(story), '修仙')
  assert.equal(plazaLengthLabel(story), '第 1 季 · 全 24 章')
})

test('plaza snapshot keeps the avatar name and drops private config text', () => {
  const MARKER = '私密标记-故乡-只有我知道'
  const story = completedSeason({ immersive: true, hometown: MARKER, friend: MARKER })
  assert.equal(story.config.hometown, MARKER, 'the source story really carries the private text')
  const snapshot = plazaSnapshot(story, { avatarName: '沈砚' })
  assert.equal(snapshot.chapters.length, 24)
  assert.equal(snapshot.config.name, '沈砚')
  assert.equal(snapshot.config.hometown, '')
  assert.equal(JSON.stringify(snapshot).includes(MARKER), false)
  assert.equal(snapshot.worldName, '青岚宗')
  assert.equal(snapshot.enterTemplate.worldBible.outline.length, 24)
  assert.equal(snapshot.beats.length, 24)
  assert.ok(snapshot.beats.every((beat) => beat.title && beat.summary))
})

test('enter draft seeds a new line from the publication template', () => {
  const story = completedSeason()
  const snapshot = plazaSnapshot(story, { avatarName: '沈砚' })
  const detail = {
    id: 'pub-test-1',
    title: story.title,
    genreId: snapshot.genreId,
    genreTemplateId: snapshot.genreTemplateId,
    storyLengthMode: snapshot.storyLengthMode,
    worldName: snapshot.worldName,
    snapshot,
    enterTemplate: snapshot.enterTemplate,
  }
  const entrantAvatar = {
    id: 'avatar-entrant-9',
    name: '林晚舟',
    appearance: { hairColor: 'black', hairStyle: 'long-wavy', outfit: 'coat', shoes: 'boots', face: 'mole-cheek' },
  }
  const draft = enterDraftFor(detail, { avatar: entrantAvatar, identityId: 'heir', startPointName: '外门柴房', ability: '读心一瞥' })
  assert.equal(draft.sourcePublicationId, 'pub-test-1')
  assert.equal(draft.name, '林晚舟')
  assert.equal(draft.avatarId, 'avatar-entrant-9')
  assert.match(draft.avatarAppearance, /大波浪/)
  assert.equal(draft.genreId, 'cultivation')
  assert.equal(draft.genreTemplateId, 'xianxia')
  assert.equal(draft.storyLengthMode, 'season')
  assert.equal(draft.originIdentityId, 'heir')
  assert.equal(draft.startPointName, '外门柴房')
  assert.equal(draft.ability, '读心一瞥')
  assert.equal(draft.step, 4)

  const seeded = createStory(draft)
  assert.equal(seeded.config.sourcePublicationId, 'pub-test-1')
  assert.equal(seeded.config.avatarId, 'avatar-entrant-9')
  assert.equal(seeded.config.name, '林晚舟')
})

test('plaza reader story renders the published line read-only', () => {
  const story = completedSeason()
  const snapshot = plazaSnapshot(story, { avatarName: '沈砚' })
  const detail = {
    id: 'pub-test-2',
    title: story.title,
    genreId: snapshot.genreId,
    genreTemplateId: snapshot.genreTemplateId,
    storyLengthMode: snapshot.storyLengthMode,
    worldName: snapshot.worldName,
    snapshot,
    enterTemplate: snapshot.enterTemplate,
  }
  const reader = plazaReaderStory(detail)
  assert.equal(reader.id, 'plaza-line-pub-test-2')
  assert.equal(reader.readOnly, true)
  assert.equal(reader.chapters.length, 24)
  assert.equal(reader.config.sourcePublicationId, '')
  assert.equal(plazaReaderStory(null), null)
  assert.equal(plazaReaderStory({ id: 'x' }), null)
})

const endlessLine = (chapters, overrides = {}) => walkLocal(createStory({
  genreId: 'mist',
  genreTemplateId: 'xuanhuan',
  storyLengthMode: 'endless',
  name: '阿遥',
  avatarId: AVATAR_ID,
  ability: '听见潮汐',
  ...overrides,
}), chapters)

test('plaza gate accepts a running endless line as a living publication (user order 2026-10-27 17:16)', () => {
  // One chapter is enough: the gate rejects nothing on endless grounds.
  const oneChapter = endlessLine(1)
  assert.equal(plazaGateFor(oneChapter).publishable, true)
  assert.equal(plazaGateFor(oneChapter).lineStatus, 'serializing')

  const grown = endlessLine(13)
  const gate = plazaGateFor(grown)
  assert.equal(gate.publishable, true)
  assert.equal(gate.lineStatus, 'serializing')
  assert.equal(plazaLengthLabel(grown), '连载中 · 已更 13 章')

  // A zero-chapter endless line has nothing to read: rejected.
  const empty = endlessLine(0)
  assert.equal(plazaGateFor(empty).publishable, false)
  assert.match(plazaGateFor(empty).reason, /第一章/)

  // Manual finish flips the same line to a finished publication.
  const finished = finishEndlessLine(grown)
  const finishedGate = plazaGateFor(finished)
  assert.equal(finishedGate.publishable, true)
  assert.equal(finishedGate.lineStatus, 'finished')
  assert.equal(plazaLengthLabel(finished), '全 13 章')
})

test('plaza snapshot of a running endless line carries its living status and count', () => {
  const snapshot = plazaSnapshot(endlessLine(5), { avatarName: '阿遥' })
  assert.equal(snapshot.storyLengthMode, 'endless')
  assert.equal(snapshot.lineStatus, 'serializing')
  assert.equal(snapshot.totalChapters, 5)
  assert.equal(snapshot.chapters.length, 5)
  // The snapshot config must not mark an entrant's fresh line as finished.
  assert.equal(snapshot.config.finishedAt, '')

  const finishedSnapshot = plazaSnapshot(finishEndlessLine(endlessLine(7)), { avatarName: '阿遥' })
  assert.equal(finishedSnapshot.lineStatus, 'finished')
  assert.equal(finishedSnapshot.totalChapters, 7)
})

test('entering a running endless publication seeds a running endless line', () => {
  const snapshot = plazaSnapshot(endlessLine(4), { avatarName: '阿遥' })
  const detail = {
    id: 'pub-endless-1',
    title: '连载中的线',
    genreId: snapshot.genreId,
    genreTemplateId: snapshot.genreTemplateId,
    storyLengthMode: snapshot.storyLengthMode,
    worldName: snapshot.worldName,
    snapshot,
    enterTemplate: snapshot.enterTemplate,
  }
  const entrantAvatar = {
    id: 'avatar-entrant-2',
    name: '后来者',
    appearance: { hairColor: 'black', hairStyle: 'long-wavy', outfit: 'coat', shoes: 'boots', face: 'mole-cheek' },
  }
  const draft = enterDraftFor(detail, { avatar: entrantAvatar, ability: '读心余光' })
  assert.equal(draft.storyLengthMode, 'endless')
  assert.equal(draft.targetChapters, null)
  const seeded = createStory(draft)
  assert.equal(seeded.config.storyLengthMode, 'endless')
  assert.equal(seeded.config.finishedAt, '')
  assert.equal(seeded.config.sourcePublicationId, 'pub-endless-1')
})

test('plaza gate and labels cover custom-length lines', () => {
  const custom = (chapters) => walkLocal(createStory({
    genreId: 'mist', genreTemplateId: 'xuanhuan', storyLengthMode: 'custom', targetChapters: 10,
    avatarId: AVATAR_ID, ability: '听见潮汐',
  }), chapters)
  assert.equal(plazaGateFor(custom(4)).publishable, false)
  assert.match(plazaGateFor(custom(4)).reason, /还没走完/)
  const done = custom(10)
  assert.equal(plazaGateFor(done).publishable, true)
  assert.equal(plazaLengthLabel(done), '全 10 章')
})

test('own-publication mapping round-trips through storage', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
  assert.equal(plazaMineIds(storage).size, 0)
  plazaMineRemember(storage, 'story-1', { id: 'pub-9', publishedAt: '2026-10-27T00:00:00.000Z' })
  assert.equal(plazaMineIds(storage).has('pub-9'), true)
  plazaMineForget(storage, 'pub-9')
  assert.equal(plazaMineIds(storage).has('pub-9'), false)
})

test('card intro (COVER-FIX): the author synopsis is the card line when one exists', () => {
  const line = plazaCardIntroFor({
    title: '某线', worldName: '诡市', synopsis: '王兴润成神之路！',
    avatar: { name: '王兴润', appearance: '乌黑，利落短发，长风衣，皮鞋' },
    chapterCount: 10, lineStatus: 'finished',
  })
  assert.equal(line, '王兴润成神之路！')
})

test('card intro (COVER-FIX): no synopsis → world-intro thread, no attribute string, no progress tail', () => {
  const line = plazaCardIntroFor({
    title: '某线', worldName: '诡市', synopsis: '',
    avatar: { name: '王兴润', appearance: '乌黑，利落短发，长风衣，皮鞋' },
    chapterCount: 10, lineStatus: 'finished',
  })
  assert.equal(line, '王兴润，是这个世界的主角。')
  assert.ok(!line.includes('乌黑'), 'the appearance attribute string never tops a card')
  assert.ok(!line.includes('全 10 章'), 'the meta row already carries the chapter count')
})

test('card intro (COVER-FIX): a serializing fallback drops its progress tail too', () => {
  const line = plazaCardIntroFor({
    title: '某线', worldName: '诡市',
    avatar: { name: '王兴润', appearance: '乌黑，利落短发' },
    chapterCount: 3, lineStatus: 'serializing', storyLengthMode: 'endless',
  })
  assert.equal(line, '王兴润，是这个世界的主角。')
  assert.ok(!line.includes('第 3 章'))
})

test('cover title tier (LOGIN-SKY addendum): length steps the size down, never wraps', () => {
  assert.equal(plazaTitleTierFor('短标题一二三四五'), 'lg') // exactly 8 chars
  assert.equal(plazaTitleTierFor('疯狂的王兴润 · 王兴润'), 'md') // the user's real case, 12 chars
  assert.equal(plazaTitleTierFor('一二三四五六七八九十一二三四'), 'md') // 14 chars, top of md
  assert.equal(plazaTitleTierFor('一二三四五六七八九十一二三四五'), 'sm') // 15 chars
  assert.equal(plazaTitleTierFor('雾海之上的第十三座钟楼与失落的航线 · 王兴润'), 'sm') // 23 chars
  assert.equal(plazaTitleTierFor(''), 'lg')
  assert.equal(plazaTitleTierFor(undefined), 'lg')
})
