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
  bringAvatarIntoStory,
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
  plazaWorldIntroFor,
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

test('plaza gate rejects unfinished, avatar-less and short lines; a fused short gates on completion', () => {
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

  const mergedSources = () => createMergedStory(
    createStory({ genreId: 'mist', avatarId: AVATAR_ID }),
    createStory({ genreId: 'neon' }),
  )
  // An unfinished fused short is still refused, with a 合流 reason.
  const mergedRunning = walkLocal(mergedSources(), 3)
  assert.equal(plazaGateFor(mergedRunning).publishable, false)
  assert.match(plazaGateFor(mergedRunning).reason, /合流/)
  assert.match(plazaGateFor(mergedRunning).reason, /还没走完/)
  // A completed fused short (6/6) publishes as a finished line
  // (owner ruling 2026-10-30).
  const mergedDone = walkLocal(mergedSources(), 6)
  const mergedGate = plazaGateFor(mergedDone)
  assert.equal(mergedGate.publishable, true)
  assert.equal(mergedGate.reason, '')
  assert.equal(mergedGate.lineStatus, 'finished')
})

test('an avatar-less line can take an avatar in and then passes the gate (FINAL-FIX R-06)', () => {
  const noAvatar = completedSeason({ avatarId: '', avatarAppearance: '' })
  const gate = plazaGateFor(noAvatar)
  assert.equal(gate.publishable, false)
  assert.equal(gate.needsAvatar, true, 'the avatar refusal is the one carrying the remedy flag')

  const avatar = { id: AVATAR_ID, name: '沈砚', description: '银灰短发，眼神很冷。' }
  const carried = bringAvatarIntoStory(noAvatar, avatar)
  assert.notEqual(carried, noAvatar)
  assert.equal(carried.config.avatarId, AVATAR_ID)
  assert.equal(carried.config.avatarAppearance, '银灰短发，眼神很冷。', 'the written description rides along (AVATAR-TRIM)')
  assert.equal(plazaGateFor(carried).publishable, true, 'the gate re-reads clean after the bring-in')
  assert.equal(noAvatar.config.avatarId, '', 'the original record is untouched')

  // Refusals return the story itself: already-carried, read-only,
  // fused and hand-written lines never take this path.
  assert.equal(bringAvatarIntoStory(carried, avatar), carried)
  assert.equal(bringAvatarIntoStory({ ...noAvatar, readOnly: true }, avatar).config.avatarId, '')
  assert.equal(bringAvatarIntoStory(noAvatar, null), noAvatar)
  assert.equal(bringAvatarIntoStory(noAvatar, {}), noAvatar)
})

test('plaza labels describe the world, the template and the season length', () => {
  const story = completedSeason()
  assert.equal(plazaWorldNameFor(story), '青岚宗')
  assert.equal(plazaTemplateNameFor(story), '修仙')
  assert.equal(plazaLengthLabel(story), '第 1 季 · 全 24 章')
})

test('plaza snapshot keeps the avatar name, strips config fields structurally, and carries prose verbatim', () => {
  const MARKER = '标记-故乡-桥洞镇'
  const story = completedSeason({ immersive: true, hometown: MARKER, friend: MARKER })
  assert.equal(story.config.hometown, MARKER, 'the source story really carries the text')
  const snapshot = plazaSnapshot(story, { avatarName: '沈砚' })
  assert.equal(snapshot.chapters.length, 24)
  assert.equal(snapshot.config.name, '沈砚')
  // Structural, not textual: the snapshot CONFIG (the entrant template
  // shape) never carries the author's own config fields — they have no
  // business in a template a stranger starts from.
  assert.equal(snapshot.config.hometown, '')
  assert.equal(snapshot.config.avatarId, '')
  // BOOK-FACE-FIX (owner order 2026-10-30): replacement redaction is
  // abolished — the book's own text publishes as written. The bible
  // premise (which quotes the hometown as part of the book's own
  // introduction) and the title/synopsis ride byte for byte; nothing
  // is rewritten into 「已隐去」/「匿名」 placeholders.
  assert.equal(snapshot.worldBible.premise, story.worldBible.premise)
  assert.ok(snapshot.worldBible.premise.includes(MARKER), 'the premise is the book’s own text, verbatim')
  assert.equal(snapshot.title, story.title)
  assert.deepEqual(snapshot.worldBible.rules, story.worldBible.rules)
  // The owner's synopsis rides the snapshot byte for byte (its loss
  // point is upstream — a synopsis stored anywhere but story.synopsis
  // never reaches the snapshot at all).
  const blurb = '简介原文：从桥洞镇出发的信，一字不改。'
  assert.equal(plazaSnapshot({ ...story, synopsis: blurb }, { avatarName: '沈砚' }).synopsis, blurb)
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
    description: '黑色大波浪长发，左颊一颗痣。',
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
  assert.equal(line, '王兴润是这个世界的主角。')
  assert.ok(!line.includes('乌黑'), 'the appearance attribute string never tops a card')
  assert.ok(!line.includes('全 10 章'), 'the meta row already carries the chapter count')
})

test('card intro (COVER-FIX): a serializing fallback drops its progress tail too', () => {
  const line = plazaCardIntroFor({
    title: '某线', worldName: '诡市',
    avatar: { name: '王兴润', appearance: '乌黑，利落短发' },
    chapterCount: 3, lineStatus: 'serializing', storyLengthMode: 'endless',
  })
  assert.equal(line, '王兴润是这个世界的主角。')
  assert.ok(!line.includes('第 3 章'))
})

test('cover title tier: length steps the size down, never wraps (widened one step, FINAL-FIX N6)', () => {
  // The old steps (lg ≤8 / md ≤14 at 18/15/12.5px) ellipsised a plain
  // six-character title on a 390px two-column store cover. Tiers,
  // sizes and store-cover insets moved together; the single-line rule
  // itself is unchanged.
  assert.equal(plazaTitleTierFor('短标题一二三四五'), 'lg') // 8 chars
  assert.equal(plazaTitleTierFor('一二三四五六七八九十'), 'lg') // 10 chars, top of lg
  assert.equal(plazaTitleTierFor('疯狂的王兴润 · 王兴润'), 'md') // the user's real case, 12 chars
  assert.equal(plazaTitleTierFor('一二三四五六七八九十一二三四五六七八'), 'md') // 18 chars, top of md
  assert.equal(plazaTitleTierFor('一二三四五六七八九十一二三四五六七八九'), 'sm') // 19 chars
  assert.equal(plazaTitleTierFor('雾海之上的第十三座钟楼与失落的航线 · 王兴润'), 'sm') // 23 chars
  assert.equal(plazaTitleTierFor(''), 'lg')
  assert.equal(plazaTitleTierFor(undefined), 'lg')
})

test('BOOK-FACE-FIX: the world intro is built from the book’s own bible — no cross-book borrowing, no template filler', () => {
  // The A-book shape (《从灵田杂役开始登天》): the snapshot bible is the
  // engine's local template bible, premise and rules verbatim.
  const detail = {
    title: '从灵田杂役开始登天',
    genreId: 'cultivation',
    worldName: '青岚宗',
    avatar: { name: '沈砚' },
    chapterCount: 100,
    lineStatus: 'finished',
    worldBible: {
      premise: '青岚宗里，杂役出身的沈砚在外门柴房发现一条会被无名外力搅动的世界线。他先要活下来，再决定是否改写身边人的命运。',
      rules: [
        '青岚宗的秘密只能通过具体行动被唤醒，旁观者无法替任何人承担代价。',
        '已经发生的事会留下可追踪的回声，不能被无痕抹去。',
        '沈砚拥有的借火一瞬每次只能借天地或外物一息真火，使用后经脉必遭烈火反噬半个时辰。',
        '能力有边界；每一次越界都会改变关系或世界稳定度。',
      ],
    },
    beats: [
      { number: 1, title: '柴房借火', state: '开局' },
      { number: 100, title: '青岚之巅', state: '收束' },
    ],
  }
  const intro = plazaWorldIntroFor(detail, '玄幻')
  assert.ok(intro.background.includes('外门柴房发现一条会被无名外力搅动的世界线'), intro.background)
  assert.ok(!intro.background.includes('沉潮港'), 'another world’s description never leaks in')
  assert.deepEqual(intro.rules, ['沈砚拥有的借火一瞬每次只能借天地或外物一息真火，使用后经脉必遭烈火反噬半个时辰。'], 'only the book’s own concrete rule survives — template filler and engine腔 are out')
})

test('BOOK-FACE-FIX: a legacy redacted record never prints placeholders and never borrows another world', () => {
  // The A-book's STORED shape before this fix: premise/rules baked
  // through the retired redactor (「已隐去的设定」/「匿名火种」), and
  // the publish path composed the intro without genreId.
  const legacy = {
    title: '从灵田杂役开始登天',
    worldName: '青岚宗',
    avatar: { name: '沈砚' },
    chapterCount: 100,
    lineStatus: 'finished',
    worldBible: {
      premise: '青岚宗里，杂役出身的沈砚在已隐去的设定发现一条会被无名外力搅动的世界线。他先要活下来。',
      rules: ['匿名火种每次只能借天地或外物一息真火，使用后经脉必遭烈火反噬半个时辰。'],
    },
    beats: [
      { number: 1, title: '柴房借火', state: '开局' },
      { number: 100, title: '青岚之巅', state: '收束' },
    ],
  }
  const intro = plazaWorldIntroFor(legacy, '玄幻')
  const whole = `${intro.background}\n${intro.rules.join('\n')}\n${intro.thread}`
  assert.ok(!whole.includes('已隐去'), 'a placeholder sentence is dropped whole, never printed')
  assert.ok(!whole.includes('匿名火种'), 'a placeholder rule is dropped whole, never printed')
  assert.ok(!whole.includes('沉潮港'), 'no genreId on the record → no other world’s description is borrowed')
  assert.ok(!whole.includes('灵脉正在枯竭'), 'no genreId on the record → not even this world’s catalogue text is guessed')
  assert.deepEqual(intro.rules, [])
})

test('BOOK-FACE-FIX: the plaza reader copy carries the publication cover path', () => {
  const story = completedSeason()
  const snapshot = plazaSnapshot(story, { avatarName: '沈砚' })
  const detail = {
    id: 'pub-face-1',
    title: story.title,
    genreId: snapshot.genreId,
    coverUrl: '/api/plaza/pub-face-1/cover?v=2',
    snapshot,
  }
  const readerStory = plazaReaderStory(detail)
  assert.equal(readerStory.coverUrl, '/api/plaza/pub-face-1/cover?v=2')
  const bare = plazaReaderStory({ ...detail, coverUrl: undefined })
  assert.equal(bare.coverUrl, '')
})
