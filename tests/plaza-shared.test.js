import test from 'node:test'
import assert from 'node:assert/strict'

import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createMergedStory,
  createStory,
  plazaSnapshot,
} from '../src/story-engine.js'
import {
  enterDraftFor,
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
  assert.match(plazaGateFor(short).reason, /一季或长线/)

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
  assert.equal(draft.step, 6)

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
