import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMMUNITY_BOOKS,
  DEFAULT_DRAFT,
  FRIEND_BOOK,
  GENRES,
  GENRE_TEMPLATES,
  START_POINT_HOOK_MAX,
  START_POINT_NAME_MAX,
  acceptChapter,
  buildChapter,
  chapterForReading,
  chapterKey,
  chooseBranch,
  createMergedStory,
  createStory,
  defaultStartPoint,
  genreTemplateById,
  publicSnapshot,
  recommendedTemplateFor,
  resolveStartPoint,
  startPointByName,
  storyBeatPlan,
  storyNarrativeDossier,
} from '../src/story-engine.js'

const draft = (overrides = {}) => ({
  ...DEFAULT_DRAFT,
  genreId: 'mist',
  name: '宁笙',
  trait: '冷静观察者',
  origin: '无名漂泊者',
  ability: '听见潮汐',
  tone: '诗性冒险',
  immersive: true,
  hometown: '海陵',
  role: '潮汐档案员',
  friend: '烬野',
  destination: '白潮港',
  ...overrides,
})

const accept = (story, index) => {
  const chapter = buildChapter(story, index)
  const accepted = acceptChapter(story, chapter, chapterKey(story, index))
  assert.notStrictEqual(accepted, story)
  return accepted
}

test('exports four worlds and normalizes a draft into a complete story', () => {
  assert.ok(GENRES.some((genre) => genre.id === 'mist'))
  assert.ok(GENRES.some((genre) => genre.id === 'cultivation'))
  assert.ok(GENRES.some((genre) => genre.id === 'neon'))
  assert.ok(GENRES.some((genre) => genre.id === 'city'))
  const story = createStory(draft())
  assert.equal(story.kind, 'solo')
  assert.equal(story.chapterIndex, 0)
  assert.deepEqual(story.choices, {})
  assert.equal(story.config.hometown, '海陵')
  assert.equal(story.config.role, '潮汐档案员')
  assert.ok(story.worldBible.rules.length >= 3)
  assert.equal(story.worldBible.outline.length, 6)
})

test('six chapters use real world, identity, ability and life-spark details', () => {
  const story = createStory(draft())
  const chapters = Array.from({ length: 6 }, (_, index) => buildChapter(story, index))
  assert.equal(chapters[0].choice, null)
  assert.ok(chapters[1].choice?.options.length >= 2)
  assert.equal(chapters[2].choice, null)
  assert.ok(chapters[3].choice?.options.length >= 2)
  assert.equal(chapters[5].choice, null)
  const text = chapters.flatMap((chapter) => chapter.paragraphs).join('\n')
  for (const value of ['宁笙', '无名漂泊者', '听见潮汐', '海陵', '潮汐档案员', '白潮港', '沉潮港']) {
    assert.match(text, new RegExp(value))
  }
  assert.notEqual(chapters[0].title, chapters[1].title)
  assert.notEqual(chapters[4].summary, chapters[5].summary)
})

test('additional life sparks enrich the opening and stay private in snapshots', () => {
  const story = createStory(draft({ school: '南城大学', company: '潮汐档案馆' }))
  const opening = buildChapter(story, 0).paragraphs.join(' ')
  assert.match(opening, /南城大学/)
  assert.match(opening, /潮汐档案馆/)
  const snapshot = publicSnapshot(story)
  const json = JSON.stringify(snapshot)
  assert.doesNotMatch(json, /南城大学/)
  assert.doesNotMatch(json, /潮汐档案馆/)
})

test('turning off life immersion excludes retained personal fields without changing the draft', () => {
  const input = draft({
    immersive: false,
    hometown: 'PRIVATE_HOME', school: 'PRIVATE_SCHOOL', company: 'PRIVATE_COMPANY',
    role: 'PRIVATE_ROLE', friend: 'PRIVATE_FRIEND', destination: 'PRIVATE_DESTINATION',
  })
  const before = JSON.stringify(input)
  const story = createStory(input)
  for (const field of ['hometown', 'school', 'company', 'role', 'friend', 'destination']) {
    assert.equal(story.config[field], '')
  }
  for (const field of ['name', 'trait', 'origin', 'ability', 'tone']) {
    assert.equal(story.config[field], input[field])
  }
  const chapters = Array.from({ length: 6 }, (_, index) => buildChapter(story, index))
  assert.doesNotMatch(JSON.stringify({ story, chapters }), /PRIVATE_/)
  assert.equal(JSON.stringify(input), before)
})

test('opting into life immersion retains all optional personal fields', () => {
  const input = draft({ immersive: true, school: '南城大学', company: '潮汐档案馆' })
  const story = createStory(input)
  for (const field of ['hometown', 'school', 'company', 'role', 'friend', 'destination']) {
    assert.equal(story.config[field], input[field])
  }
  assert.match(story.worldBible.outline[0], /潮汐档案员/)
  assert.match(buildChapter(story, 2).paragraphs.join(' '), /烬野/)
})

test('all world openings avoid repeating an identity identical to its origin', () => {
  for (const genre of GENRES) {
    const plain = createStory(draft({ genreId: genre.id, immersive: false }))
    const opening = buildChapter(plain, 0).paragraphs[1]
    assert.match(opening, /无名漂泊者/)
    assert.doesNotMatch(opening, /无名漂泊者（无名漂泊者）/)
    assert.equal(opening.split('无名漂泊者').length - 1, 1)

    const same = createStory(draft({ genreId: genre.id, role: '无名漂泊者' }))
    assert.doesNotMatch(buildChapter(same, 0).paragraphs[1], /无名漂泊者（无名漂泊者）/)
    const distinct = createStory(draft({ genreId: genre.id, role: '潮汐档案员' }))
    assert.match(buildChapter(distinct, 0).paragraphs[1], /潮汐档案员（无名漂泊者）/)
  }
})

test('acceptance is sequential, key-bound and idempotent', () => {
  const story = createStory(draft())
  const chapter0 = buildChapter(story, 0)
  assert.equal(acceptChapter(story, chapter0, 'wrong-key'), story)
  const after0 = accept(story, 0)
  assert.equal(after0.chapters.length, 1)
  assert.equal(after0.chapterIndex, 1)
  assert.equal(acceptChapter(after0, chapter0, chapterKey(after0, 0)), after0)
  const skipped = buildChapter(after0, 2)
  assert.equal(acceptChapter(after0, skipped, chapterKey(after0, 2)), after0)
  const after1 = accept(after0, 1)
  assert.equal(after1.chapterIndex, 2)
  assert.equal(acceptChapter(after1, buildChapter(after1, 3), chapterKey(after1, 3)), after1)
})

test('branching changes the next chapter and invalidates concurrent keys', () => {
  let story = accept(accept(createStory(draft()), 0), 1)
  const oldKey = chapterKey(story, 2)
  const chapterOne = story.chapters.find((chapter) => chapter.index === 1)
  const firstChoice = chapterOne.choice.options[0].id
  const secondChoice = chapterOne.choice.options[1].id
  const branchA = chooseBranch(story, 1, firstChoice)
  assert.equal(branchA.revision, story.revision + 1)
  assert.equal(branchA.chapterIndex, 2)
  assert.equal(branchA.chapters.length, 2)
  assert.equal(acceptChapter(branchA, buildChapter(branchA, 2), oldKey), branchA)
  const nextA = buildChapter(branchA, 2)
  const branchB = chooseBranch(story, 1, secondChoice)
  const nextB = buildChapter(branchB, 2)
  assert.notDeepEqual(nextA.paragraphs, nextB.paragraphs)
  assert.ok(nextA.paragraphs.join(' ').includes(chapterOne.choice.options[0].label))
  assert.ok(nextB.paragraphs.join(' ').includes(chapterOne.choice.options[1].label))
  assert.equal(chooseBranch(branchA, 1, firstChoice), branchA)
})

const verifyDecisionScene = (story, index) => {
  const before = buildChapter(story, index)
  const [first, second] = before.choice.options
  const branchA = chooseBranch(story, index, first.id)
  const branchB = chooseBranch(story, index, second.id)

  // A decision scene must end before the action, regardless of the chosen
  // answer. Otherwise a reader sees the protagonist act before being asked.
  for (const branch of [branchA, branchB]) {
    assert.deepEqual(branch.chapters[index].paragraphs, before.paragraphs)
    assert.deepEqual(buildChapter(branch, index).paragraphs, before.paragraphs)
  }
  const nextA = buildChapter(branchA, index + 1)
  const nextB = buildChapter(branchB, index + 1)
  // The action itself, not merely an appended choice label, must differ.
  assert.notEqual(nextA.paragraphs[0], nextB.paragraphs[0])
  assert.match(nextA.paragraphs.join(' '), new RegExp(first.label))
  assert.match(nextB.paragraphs.join(' '), new RegExp(second.label))
  for (const chapter of [nextA, nextB]) {
    assert.doesNotMatch(chapter.paragraphs.join(' '), /“(?:open|wait|cross|return|join|guard|bridge|separate)”/)
  }
  return branchB
}

for (const genre of GENRES) {
  test(`${genre.id} decisions precede their consequences at both story gates`, () => {
    let story = accept(accept(createStory(draft({ genreId: genre.id })), 0), 1)
    story = verifyDecisionScene(story, 1)
    story = accept(accept(story, 2), 3)
    verifyDecisionScene(story, 3)
  })
}

test('merged decisions leave both protagonists waiting until the next chapter', () => {
  const a = createStory(draft({ name: '甲', genreId: 'mist' }))
  const b = createStory(draft({ name: '乙', genreId: 'cultivation' }))
  let story = accept(accept(createMergedStory(a, b), 0), 1)
  story = verifyDecisionScene(story, 1)
  story = accept(accept(story, 2), 3)
  verifyDecisionScene(story, 3)
})

test('rewriting replaces a legacy decision scene that prematurely revealed its outcome', () => {
  let story = accept(accept(createStory(draft()), 0), 1)
  story = {
    ...story,
    chapters: story.chapters.map((chapter) => chapter.index === 1
      ? { ...chapter, paragraphs: [chapter.paragraphs[0], 'TA让蓝火沿着指尖亮起，信纸背面浮出一条新的航线。', '航线指向白潮港，而潮汐正在倒着退去。'] }
      : chapter),
  }
  const rewritten = chooseBranch(story, 1, 'wait')
  assert.deepEqual(rewritten.chapters[1].paragraphs, buildChapter(rewritten, 1).paragraphs)
  assert.doesNotMatch(rewritten.chapters[1].paragraphs.join(' '), /TA让蓝火沿着指尖亮起/)
  assert.match(buildChapter(rewritten, 2).paragraphs[0], /把信压在掌心/)
})

test('reading an unchosen legacy decision shows a pending scene without modifying the saved story', () => {
  const created = accept(accept(createStory(draft()), 0), 1)
  const story = {
    ...created,
    chapters: created.chapters.map((chapter) => chapter.index === 1
      ? { ...chapter, paragraphs: [chapter.paragraphs[0], 'TA让蓝火沿着指尖亮起，信纸背面浮出一条新的航线。', '航线指向白潮港，而潮汐正在倒着退去。'] }
      : chapter),
  }
  const before = JSON.stringify(story)
  const displayed = chapterForReading(story, 1)
  assert.deepEqual(displayed.paragraphs, buildChapter(story, 1).paragraphs)
  assert.equal(displayed.id, story.chapters[1].id)
  assert.equal(JSON.stringify(story), before)
  assert.deepEqual(story.choices, {})
})

test('a legacy read-only merged snapshot displays the recorded guard choice without narrating join first', () => {
  const a = createStory(draft({ name: '甲' }))
  const b = createStory(draft({ name: '乙', genreId: 'cultivation' }))
  const snapshot = publicSnapshot(accept(accept(createMergedStory(a, b), 0), 1))
  const story = {
    ...snapshot,
    choices: { 1: 'guard' },
    chapters: snapshot.chapters.map((chapter) => chapter.index === 1
      ? { ...chapter, paragraphs: [chapter.paragraphs[0], '他们并肩踏入合流点，脚下同时亮起两种不同颜色的光。', chapter.paragraphs[2]] }
      : chapter),
  }
  const before = JSON.stringify(story)
  const displayed = chapterForReading(story, 1)
  assert.deepEqual(displayed.paragraphs, buildChapter(story, 1).paragraphs)
  assert.doesNotMatch(displayed.paragraphs.join(' '), /他们并肩踏入合流点/)
  assert.equal(story.readOnly, true)
  assert.equal(JSON.stringify(story), before)
})

test('legacy later decision repair preserves notes and converts only known internal annotations', () => {
  let story = accept(accept(createStory(draft({ genreId: 'neon' })), 0), 1)
  story = accept(accept(chooseBranch(story, 1, 'wait'), 2), 3)
  story = {
    ...story,
    choices: { 1: 'wait', 3: 'return' },
    chapters: story.chapters.map((chapter) => chapter.index === 3
      ? { ...chapter, title: '保留的章节标题', paragraphs: [
        chapter.paragraphs[0],
        'TA用“听见潮汐”把两份冲突人格暂时缝在一起，让系统看见自己的盲点。',
        '雨幕第一次把所有人的脸还给了他们。',
        '选择“wait”留下的回声正在改变这一章。',
        '用户保存的章节手记。',
      ] }
      : chapter),
  }
  const before = JSON.stringify(story)
  const displayed = chapterForReading(story, 3)
  assert.deepEqual(displayed.paragraphs.slice(0, 3), buildChapter(story, 3).paragraphs.slice(0, 3))
  assert.match(displayed.paragraphs[3], /先按下不动/)
  assert.equal(displayed.paragraphs[4], '用户保存的章节手记。')
  assert.equal(displayed.title, '保留的章节标题')
  assert.equal(JSON.stringify(story), before)
})

test('reading and rewriting never replace non-template prose or materialize a missing chapter', () => {
  const created = accept(accept(createStory(draft()), 0), 1)
  const story = {
    ...created,
    chapters: created.chapters.map((chapter) => chapter.index === 1
      ? { ...chapter, paragraphs: ['真实内容的开场。', 'TA让蓝火沿着指尖亮起，信纸背面浮出一条新的航线。', '真实内容的后文。'] }
      : chapter),
  }
  const before = JSON.stringify(story)
  assert.strictEqual(chapterForReading(story, 0), story.chapters[0])
  assert.strictEqual(chapterForReading(story, 1), story.chapters[1])
  assert.equal(chapterForReading(story, 2), null)
  assert.equal(JSON.stringify(story), before)
  assert.deepEqual(chooseBranch(story, 1, 'wait').chapters[1].paragraphs, story.chapters[1].paragraphs)
})

test('rewriting an earlier branch clears later choices and gates', () => {
  let story = createStory(draft())
  story = accept(story, 0)
  story = accept(story, 1)
  story = chooseBranch(story, 1, 'open')
  story = accept(story, 2)
  story = accept(story, 3)
  story = chooseBranch(story, 3, 'cross')
  story = accept(story, 4)

  const rewritten = chooseBranch(story, 1, 'wait')
  assert.equal(rewritten.choices[3], undefined)
  assert.equal(rewritten.chapters.length, 2)
  let replayed = accept(rewritten, 2)
  replayed = accept(replayed, 3)
  assert.equal(acceptChapter(replayed, buildChapter(replayed, 4), chapterKey(replayed, 4)), replayed)
})

test('chapter three choice is required before chapter four and finale remains reachable', () => {
  let story = createStory(draft({ genreId: 'cultivation', name: '烬野' }))
  story = accept(story, 0)
  story = accept(story, 1)
  story = chooseBranch(story, 1, 'open')
  story = accept(story, 2)
  story = accept(story, 3)
  assert.equal(story.chapterIndex, 4)
  const blocked = acceptChapter(story, buildChapter(story, 5), chapterKey(story, 5))
  assert.equal(blocked, story)
  story = chooseBranch(story, 3, 'cross')
  story = accept(story, 4)
  story = accept(story, 5)
  assert.equal(story.chapters.length, 6)
  assert.equal(story.chapterIndex, 5)
  assert.equal(buildChapter(story, 5).choice, null)
})

test('invalid persisted choice cannot satisfy a chapter gate or contaminate text', () => {
  let story = createStory(draft())
  story = accept(story, 0)
  story = accept(story, 1)
  story = { ...story, choices: { ...story.choices, 1: 'not-a-real-option' } }
  const chapterTwo = buildChapter(story, 2)
  assert.doesNotMatch(chapterTwo.paragraphs.join(' '), /not-a-real-option/)
  assert.equal(acceptChapter(story, chapterTwo, chapterKey(story, 2)), story)
})

test('merged stories contain both protagonists and do not mutate sources', () => {
  const a = createStory(draft({ name: '甲', genreId: 'mist' }))
  const b = createStory(draft({ name: '乙', genreId: 'cultivation', ability: '借火一瞬' }))
  const merged = createMergedStory(a, b, { rules: 'separate', lead: 'b', bond: 'rivals' })
  assert.equal(merged.kind, 'merged')
  assert.deepEqual(merged.sourceIds, [a.id, b.id])
  assert.equal(merged.config.protagonists.length, 2)
  const text = buildChapter(merged, 0).paragraphs.join(' ')
  assert.match(text, /甲/)
  assert.match(text, /乙/)
  assert.equal(a.chapters.length, 0)
  assert.equal(b.chapters.length, 0)
})

test('public snapshot removes reality and private names while preserving read-only chapters', () => {
  let story = createStory(draft())
  story = accept(story, 0)
  story = accept(story, 1)
  story = chooseBranch(story, 1, 'open')
  const snapshot = publicSnapshot(story)
  const json = JSON.stringify(snapshot)
  assert.equal(snapshot.author, '我 · 本地分享')
  assert.equal(snapshot.readOnly, true)
  assert.equal(snapshot.chapters.length, story.chapters.length)
  for (const secret of ['宁笙', '海陵', '潮汐档案员']) assert.doesNotMatch(json, new RegExp(secret))
  assert.doesNotMatch(json, /immersive":true/)
  assert.deepEqual(story.config.name, '宁笙')
  assert.equal(snapshot.sourceIds.length, 0)
})

test('public merged snapshots remove both protagonists private details', () => {
  const a = createStory(draft({
    name: 'PRIVATE_A_NAME', hometown: 'PRIVATE_A_HOME', school: 'PRIVATE_A_SCHOOL',
    company: 'PRIVATE_A_COMPANY', role: 'PRIVATE_A_ROLE', friend: 'PRIVATE_A_FRIEND',
    trait: 'PRIVATE_A_TRAIT', origin: 'PRIVATE_A_ORIGIN', ability: 'PRIVATE_A_ABILITY',
    tone: 'PRIVATE_A_TONE', destination: 'PRIVATE_A_DESTINATION',
  }))
  const b = createStory(draft({
    genreId: 'cultivation', name: 'PRIVATE_B_NAME', hometown: 'PRIVATE_B_HOME', school: 'PRIVATE_B_SCHOOL',
    company: 'PRIVATE_B_COMPANY', role: 'PRIVATE_B_ROLE', friend: 'PRIVATE_B_FRIEND',
    trait: 'PRIVATE_B_TRAIT', origin: 'PRIVATE_B_ORIGIN', ability: 'PRIVATE_B_ABILITY',
    tone: 'PRIVATE_B_TONE', destination: 'PRIVATE_B_DESTINATION',
  }))
  const merged = accept(accept(createMergedStory(a, b), 0), 1)
  const before = JSON.stringify(merged)
  const snapshot = publicSnapshot(merged)
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_[AB]_/)
  assert.equal(snapshot.config.protagonists.length, 2)
  assert.match(snapshot.chapters[0].paragraphs.join(' '), /旅者甲与旅者乙/)
  assert.equal(JSON.stringify(merged), before)
})

test('public solo and merged snapshots reject branch changes and new chapters', () => {
  const solo = createStory(draft())
  const merged = createMergedStory(solo, createStory(draft({ genreId: 'cultivation' })))
  for (const source of [solo, merged]) {
    const undecided = accept(accept(source, 0), 1)
    const [first, second] = undecided.chapters[1].choice.options
    const snapshot = publicSnapshot(chooseBranch(undecided, 1, first.id))
    const before = JSON.stringify(snapshot)

    assert.strictEqual(chooseBranch(snapshot, 1, second.id), snapshot)
    const next = buildChapter(snapshot, 2)
    assert.strictEqual(acceptChapter(snapshot, next, chapterKey(snapshot, 2)), snapshot)
    assert.equal(JSON.stringify(snapshot), before)
  }
})

test('community fixtures are distinct, contain enough chapters and include merged/complete examples', () => {
  assert.ok(COMMUNITY_BOOKS.length >= 3)
  assert.ok(COMMUNITY_BOOKS.every((book) => book.isDemo === true && book.chapters.length >= 3))
  assert.ok(COMMUNITY_BOOKS.some((book) => book.kind === 'merged'))
  assert.ok(COMMUNITY_BOOKS.some((book) => book.status === 'complete'))
  assert.ok(COMMUNITY_BOOKS.some((book) => book.status === 'ongoing'))
  assert.ok(FRIEND_BOOK.isDemo)
  assert.equal(FRIEND_BOOK.genreId, 'cultivation')
  assert.equal(new Set(COMMUNITY_BOOKS.map((book) => book.title)).size, COMMUNITY_BOOKS.length)
  assert.ok(COMMUNITY_BOOKS.every((book) => !('readers' in book) && !('views' in book)))
})

test('storyBeatPlan models prerequisites, concept grounding, tone shape, and branch consequences', () => {
  let story = createStory(draft({ tone: '悬疑推进' }))
  const beat0 = storyBeatPlan(story, 0)
  assert.equal(beat0.chapterNumber, 1)
  assert.equal(beat0.act, '第 1 章 · 开篇')
  assert.equal(beat0.prerequisites.length, 4)
  assert.ok(beat0.mustGround.some((item) => item.includes('第七码头')))
  assert.ok(beat0.mustGround.some((item) => item.includes('听见潮汐')))
  assert.match(beat0.toneDirective, /时间压力|因果逻辑/)
  assert.equal(beat0.paragraphShape.length, 4)

  const beat1 = storyBeatPlan(story, 1)
  assert.equal(beat1.paragraphShape.length, 3)

  story = accept(accept(story, 0), 1)
  story = chooseBranch(story, 1, 'wait')
  const beat2 = storyBeatPlan(story, 2)
  assert.equal(beat2.chapterNumber, 3)
  assert.equal(beat2.prerequisites.length, 5)
  assert.equal(beat2.unlockedConsequences.length, 1)
  assert.equal(beat2.unlockedConsequences[0].choiceId, 'wait')
  assert.match(beat2.unlockedConsequences[0].consequence, /稳定度上升/)

  const merged = createMergedStory(story, createStory(draft({ name: '烬野', genreId: 'cultivation' })))
  const mergedBeat = storyBeatPlan(merged, 2)
  assert.ok(mergedBeat.prerequisites.some((item) => item.includes('双主角合流')))
  assert.ok(mergedBeat.mustGround.some((item) => item.includes('双主角在合流点的配合与新冲突')))
})

test('storyNarrativeDossier builds a spoiler-free narrative dossier bounded by maxChapterIndex', () => {
  let story = createStory(draft())
  story = accept(story, 0)
  story = accept(story, 1)
  story = chooseBranch(story, 1, 'open')
  story = accept(story, 2)

  const earlyDossier = storyNarrativeDossier(story, 0)
  assert.equal(earlyDossier.timeline.length, 1)
  assert.equal(earlyDossier.activeConsequences.length, 0)

  const midDossier = storyNarrativeDossier(story, 2)
  assert.equal(midDossier.timeline.length, 3)
  assert.equal(midDossier.activeConsequences.length, 1)
  assert.equal(midDossier.activeConsequences[0].choiceId, 'open')
  assert.ok(midDossier.groundedConcepts.length >= 2)
})

test('createStory pins an explicitly chosen genre template at the top level', () => {
  const story = createStory({ name: '阿遥', genreId: 'court', genreTemplateId: 'romance-ancient' })
  assert.equal(story.genreId, 'court')
  assert.equal(story.genreTemplateId, 'romance-ancient')
  assert.equal(story.config.genreTemplateId, 'romance-ancient')
})

test('createStory without a template choice carries no top-level template id', () => {
  const story = createStory({ name: '阿遥' })
  assert.equal('genreTemplateId' in story, false)
  assert.equal(story.config.genreTemplateId, '')
})

test('every genre template binds to a real world and recommendations cover all stages', () => {
  const worldIds = new Set(GENRES.map((genre) => genre.id))
  assert.equal(GENRES.length, 6)
  assert.equal(GENRE_TEMPLATES.length, 8)
  for (const template of GENRE_TEMPLATES) {
    assert.ok(worldIds.has(template.worldId), template.id)
    assert.equal(genreTemplateById(template.id), template)
  }
  assert.equal(recommendedTemplateFor('court').id, 'romance-ancient')
  assert.equal(recommendedTemplateFor('frontier').id, 'scifi')
  assert.equal(recommendedTemplateFor('mist').id, 'xuanhuan')
  assert.equal(recommendedTemplateFor('cultivation').id, 'xianxia')
  assert.equal(recommendedTemplateFor('city').id, 'romance-modern')
  // The legacy cyber stage has no bound template; it falls back to sci-fi craft.
  assert.equal(recommendedTemplateFor('neon').id, 'scifi')
})

test('stage display names are small concrete places while ids stay stable', () => {
  const names = Object.fromEntries(GENRES.map((genre) => [genre.id, genre.world]))
  assert.deepEqual(names, {
    mist: '沉潮港',
    cultivation: '青岚宗',
    neon: '霓虹下城',
    city: '长宁街',
    court: '长乐宫',
    frontier: '七号前哨站',
  })
  for (const genre of GENRES) {
    assert.ok(genre.tagline.length >= 6, genre.id)
    assert.ok(genre.description.includes(genre.world), genre.id)
  }
})

test('every world offers 3-4 small concrete spawn points and its location is the default', () => {
  // The user's own examples must each exist in some world's list.
  const allNames = GENRES.flatMap((genre) => genre.spawnPoints.map((point) => point.name))
  for (const example of ['山脚村落', '山神破庙', '下城贫民窟', '皇帝的卧室']) {
    assert.ok(allNames.includes(example), example)
  }
  for (const genre of GENRES) {
    assert.ok(genre.spawnPoints.length >= 3 && genre.spawnPoints.length <= 4, genre.id)
    // The default spawn point is the world's location, listed first, so a
    // pre-spawn-point save (no startPointName) opens exactly where it always did.
    assert.equal(genre.spawnPoints[0].name, genre.location, genre.id)
    assert.equal(defaultStartPoint(genre).name, genre.location, genre.id)
    const seen = new Set()
    for (const point of genre.spawnPoints) {
      assert.ok(point.name.length <= 6, `${genre.id}:${point.name}`)
      assert.ok(point.hook.length > 10, `${genre.id}:${point.name} hook`)
      assert.ok(point.situation.length >= 2, `${genre.id}:${point.name} situation`)
      assert.ok(!seen.has(point.name), `${genre.id}:${point.name} duplicate`)
      seen.add(point.name)
    }
  }
})

test('resolveStartPoint: unset falls back to the world default, listed names use the table hook', () => {
  const mist = GENRES.find((genre) => genre.id === 'mist')
  assert.equal(resolveStartPoint(mist, {}).name, '第七码头')
  assert.equal(resolveStartPoint(mist, { startPointName: '' }).name, '第七码头')
  const tower = resolveStartPoint(mist, { startPointName: '灯塔守夜屋', startPointHook: '用户乱写的处境' })
  assert.equal(tower.name, '灯塔守夜屋')
  assert.ok(tower.hook.includes('守夜日志'), 'a listed spawn point keeps its table hook, not a stale typed one')
  assert.equal(tower.situation, '隐秘')
  assert.equal(startPointByName(mist, '灯塔守夜屋').name, '灯塔守夜屋')
  assert.equal(startPointByName(mist, '不存在的地方'), null)
  // A hand-written name outside the list is tolerated with its own hook.
  const foreign = resolveStartPoint(mist, { startPointName: '雾外灯塔', startPointHook: '自己写的处境。' })
  assert.deepEqual(foreign, { name: '雾外灯塔', hook: '自己写的处境。', situation: '' })
  // God mode: empty name means the setting decides; a typed name resolves as-is.
  const custom = { id: 'custom', location: '故事开始的地方' }
  assert.equal(resolveStartPoint(custom, {}), null)
  assert.deepEqual(
    resolveStartPoint(custom, { startPointName: '破庙草席', startPointHook: '借来的处境。' }),
    { name: '破庙草席', hook: '借来的处境。', situation: '' },
  )
})

test('spawn point: createStory bounds the fields and chapter one opens at the spawn point', () => {
  const story = createStory(draft({ startPointName: '灯塔守夜屋' }))
  assert.equal(story.config.startPointName, '灯塔守夜屋')
  assert.ok(story.worldBible.premise.includes('灯塔守夜屋'))
  assert.ok(story.worldBible.outline[0].includes('灯塔守夜屋'))
  const first = buildChapter(story, 0)
  assert.ok(first.paragraphs[0].includes('守夜日志'), 'chapter one opens with the spawn hook')
  assert.ok(first.summary.includes('灯塔守夜屋'))
  assert.ok(storyBeatPlan(story, 0).prerequisites[0].includes('出生点：灯塔守夜屋'))
  assert.ok(storyBeatPlan(story, 0).mustGround[0].includes('灯塔守夜屋'))
  assert.equal(storyNarrativeDossier(story, 0).location, '灯塔守夜屋')
  // Later chapters are not bound by the spawn point.
  const third = buildChapter(story, 2)
  assert.ok(!third.paragraphs.join('').includes('守夜日志'))
  // Bounds: over-long free-form values are clipped to the field limits.
  const bounded = createStory(draft({ genreId: 'custom', startPointName: '点'.repeat(50), startPointHook: '境'.repeat(200) }))
  assert.equal(bounded.config.startPointName.length, START_POINT_NAME_MAX)
  assert.equal(bounded.config.startPointHook.length, START_POINT_HOOK_MAX)
})

test('spawn point: old drafts without the fields open at the world default', () => {
  const legacy = { ...draft() }
  delete legacy.startPointName
  delete legacy.startPointHook
  const story = createStory(legacy)
  assert.equal(story.config.startPointName, '')
  assert.ok(story.worldBible.premise.includes('第七码头'))
  assert.ok(buildChapter(story, 0).paragraphs[0].includes('不是你的信'))
})

test('spawn point: god mode typed spawn reaches premise, outline and chapter one; snapshots strip it', () => {
  const story = createStory(godDraft({ startPointName: '破庙草席' }))
  assert.ok(story.worldBible.premise.includes('第一幕落在破庙草席'))
  assert.ok(story.worldBible.outline[0].includes('在破庙草席醒来'))
  assert.ok(buildChapter(story, 0).paragraphs.join('').includes('破庙草席'))
  assert.ok(storyBeatPlan(story, 0).prerequisites[0].includes('出生点：破庙草席'))
  const snapshot = publicSnapshot(story)
  assert.equal(snapshot.config.startPointName, '')
  assert.equal(snapshot.config.startPointHook, '')
  // A merged story keeps the lead side's spawn point in config and never crashes.
  const merged = createMergedStory(createStory(draft({ startPointName: '沉船甲板' })), story)
  assert.equal(merged.config.startPointName, '沉船甲板')
  assert.equal(buildChapter(merged, 0).paragraphs.length > 0, true)
})

const godDraft = (overrides = {}) => draft({
  genreId: 'custom',
  genreTemplateId: '',
  customWorldName: '倒流港',
  customWorldSetting: '海水每晚倒流一小时，倒流时死者会回到岸边说一句话。镇上的人靠替亡者传话为生。',
  ...overrides,
})

test('god mode: createStory carries the custom world into config and bible', () => {
  const story = createStory(godDraft())
  assert.equal(story.genreId, 'custom')
  assert.equal(story.config.customWorldName, '倒流港')
  assert.ok(story.config.customWorldSetting.includes('海水每晚倒流'))
  assert.equal('genreTemplateId' in story, false)
  assert.equal(story.title, '倒流港 · 宁笙')
  assert.ok(story.worldBible.premise.includes('倒流港'))
  assert.ok(story.worldBible.premise.includes('海水每晚倒流一小时'))
  assert.ok(story.worldBible.rules.some((rule) => rule.includes('创世设定')))
  assert.ok(story.worldBible.rules[0].includes('镇上的人靠替亡者传话为生'))
  assert.equal(story.worldBible.outline.length, 6)
})

test('god mode: blank name falls back to the unnamed world placeholder', () => {
  const story = createStory(godDraft({ customWorldName: '   ', customWorldSetting: '' }))
  assert.equal(story.config.customWorldName, '')
  assert.equal(story.title, '未命名世界 · 宁笙')
  assert.ok(story.worldBible.premise.includes('未命名世界'))
  assert.ok(story.worldBible.rules[0].includes('尚无成文规则'))
})

test('god mode: name and setting are trimmed and bounded at 40 / 600 chars', () => {
  const story = createStory(godDraft({
    customWorldName: `  ${'名'.repeat(50)}  `,
    customWorldSetting: `  ${'设'.repeat(700)}  `,
  }))
  assert.equal(story.config.customWorldName.length, 40)
  assert.equal(story.config.customWorldSetting.length, 600)
  const wrongTypes = createStory(godDraft({ customWorldName: 42, customWorldSetting: null }))
  assert.equal(wrongTypes.config.customWorldName, '')
  assert.equal(wrongTypes.config.customWorldSetting, '')
})

test('god mode: local chapters run all six chapters on the generic scaffold', () => {
  let story = createStory(godDraft())
  const chapters = Array.from({ length: 6 }, (_, index) => buildChapter(story, index))
  const text = chapters.flatMap((chapter) => chapter.paragraphs).join('\n')
  assert.ok(text.includes('倒流港'))
  assert.ok(text.includes('海水每晚倒流一小时'))
  assert.equal(chapters[0].title, '倒流港 · 初声')
  assert.ok(chapters[1].choice?.options.length >= 2)
  assert.ok(chapters[3].choice?.prompt.includes('倒流港'))
  assert.equal(chapters[5].choice, null)
  // The accept/choose protocol works end to end for a custom world.
  story = accept(story, 0)
  story = accept(story, 1)
  story = chooseBranch(story, 1, 'open')
  const third = buildChapter(story, 2)
  assert.ok(third.paragraphs.join('').includes('改写了下一行设定'))
  assert.equal(chapterForReading(story, 1)?.index, 1)
})

test('god mode: an optional template can still be pinned as the craft', () => {
  const story = createStory(godDraft({ genreTemplateId: 'suspense-supernatural' }))
  assert.equal(story.genreTemplateId, 'suspense-supernatural')
  assert.equal(story.config.genreTemplateId, 'suspense-supernatural')
  assert.equal(story.genreId, 'custom')
})

test('god mode: beat plan grounds the story in the creator setting', () => {
  const story = createStory(godDraft())
  const beat = storyBeatPlan(story, 0)
  assert.ok(beat.prerequisites.some((item) => item.includes('倒流港')))
  assert.ok(beat.prerequisites.some((item) => item.startsWith('创世设定：') && item.includes('海水每晚倒流')))
  assert.ok(beat.mustGround.some((item) => item.includes('倒流港')))
  const dossier = storyNarrativeDossier(story, 0)
  assert.equal(dossier.worldName, '倒流港')
})

test('god mode: a custom story can merge without crashing', () => {
  const custom = createStory(godDraft())
  const merged = createMergedStory(custom, FRIEND_BOOK, { rules: 'bridge', lead: 'a', bond: 'allies' })
  assert.equal(merged.kind, 'merged')
  assert.ok(merged.worldBible.premise.includes('倒流港'))
  const chapter = buildChapter(merged, 0)
  assert.ok(chapter.paragraphs.length >= 2)
  const snapshot = publicSnapshot(createStory(godDraft()))
  assert.equal(snapshot.genreId, 'custom')
})
