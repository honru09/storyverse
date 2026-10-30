import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALL_ABILITIES,
  COMMUNITY_BOOKS,
  DEFAULT_DRAFT,
  FRIEND_BOOK,
  GENERIC_ABILITY_POOL,
  GENRES,
  GENRE_TEMPLATES,
  ORIGIN_IDENTITIES,
  START_POINT_HOOK_MAX,
  START_POINT_NAME_MAX,
  TEMPLATE_SIGNATURE_ABILITIES,
  WORLD_ABILITY_POOLS,
  abilityCandidatesFor,
  acceptChapter,
  buildChapter,
  chapterForReading,
  chapterKey,
  chooseBranch,
  createMergedStory,
  createStory,
  defaultStartPoint,
  finishEndlessLine,
  genreTemplateById,
  isManuallyFinished,
  validTargetChapters,
  localIdentityTitle,
  originIdentityById,
  originSpawnCell,
  originSummaryFor,
  isStoryComplete,
  outlineIndexFor,
  outlineLengthFor,
  publicSnapshot,
  queueIntervention,
  resolveStartPoint,
  startNextSeason,
  storyLengthModeOf,
  storyLedgerFor,
  structureFor,
  totalChaptersFor,
  spawnPointsForIdentity,
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
  // Choices are retired: no chapter carries one, at any position.
  for (const chapter of chapters) assert.equal(chapter.choice, null)
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

test('a recorded legacy branch rotates the chapter key but no longer steers its text', () => {
  // Product paths never record choices any more; chooseBranch survives as
  // the legacy replay for saves written before retirement. The recording
  // itself is inert data now: it still bumps the story revision (and with
  // it the chapter cache key), but the next chapter's scaffold is the
  // same whichever branch an old save happened to record.
  let story = accept(accept(createStory(draft()), 0), 1)
  const oldKey = chapterKey(story, 2)
  const branchA = chooseBranch(story, 1, 'open')
  assert.equal(branchA.revision, story.revision + 1)
  assert.equal(branchA.chapterIndex, 2)
  assert.equal(branchA.chapters.length, 2)
  assert.equal(acceptChapter(branchA, buildChapter(branchA, 2), oldKey), branchA)
  const branchB = chooseBranch(story, 1, 'wait')
  assert.deepEqual(buildChapter(branchA, 2).paragraphs, buildChapter(branchB, 2).paragraphs)
  assert.equal(chooseBranch(branchA, 1, 'open'), branchA)
})

test('no chapter in any world — or on a merged line — carries a choice anymore', () => {
  for (const genre of GENRES) {
    const story = createStory(draft({ genreId: genre.id }))
    for (let index = 0; index < 6; index += 1) {
      assert.equal(buildChapter(story, index).choice, null, `${genre.id} chapter ${index + 1}`)
    }
  }
  const merged = createMergedStory(
    createStory(draft({ name: '甲', genreId: 'mist' })),
    createStory(draft({ name: '乙', genreId: 'cultivation' })),
  )
  for (let index = 0; index < 6; index += 1) {
    assert.equal(buildChapter(merged, index).choice, null, `merged chapter ${index + 1}`)
  }
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

test('rewriting an earlier legacy branch truncates later chapters and clears later recordings', () => {
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
  // The replay accepts straight through: no gate waits at the old
  // decision chapters any more.
  let replayed = accept(rewritten, 2)
  replayed = accept(replayed, 3)
  replayed = accept(replayed, 4)
  assert.equal(replayed.chapters.length, 5)
})

test('no choice is required anywhere: the finale is reachable by accepting straight through', () => {
  let story = createStory(draft({ genreId: 'cultivation', name: '烬野' }))
  for (let index = 0; index < 6; index += 1) story = accept(story, index)
  assert.equal(story.chapters.length, 6)
  assert.equal(story.chapterIndex, 5)
  assert.deepEqual(story.choices, {})
  assert.equal(buildChapter(story, 5).choice, null)
})

test('an invalid persisted choice is inert: it neither contaminates text nor blocks the next chapter', () => {
  let story = createStory(draft())
  story = accept(story, 0)
  story = accept(story, 1)
  story = { ...story, choices: { ...story.choices, 1: 'not-a-real-option' } }
  const chapterTwo = buildChapter(story, 2)
  assert.doesNotMatch(chapterTwo.paragraphs.join(' '), /not-a-real-option/)
  const accepted = acceptChapter(story, chapterTwo, chapterKey(story, 2))
  assert.notEqual(accepted, story)
  assert.equal(accepted.chapters.length, 3)
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
    const [firstId, secondId] = source.kind === 'merged' ? ['join', 'guard'] : ['open', 'wait']
    const snapshot = publicSnapshot(chooseBranch(undecided, 1, firstId))
    const before = JSON.stringify(snapshot)

    assert.strictEqual(chooseBranch(snapshot, 1, secondId), snapshot)
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
  // Five since the length batch: world, protagonist, origin, ability, and
  // the structure line (mode / act position / upgrade points).
  assert.equal(beat0.prerequisites.length, 5)
  assert.ok(beat0.mustGround.some((item) => item.includes('第七码头')))
  assert.ok(beat0.mustGround.some((item) => item.includes('听见潮汐')))
  assert.match(beat0.toneDirective, /时间压力|因果逻辑/)
  assert.equal(beat0.paragraphShape.length, 4)

  const beat1 = storyBeatPlan(story, 1)
  assert.equal(beat1.paragraphShape.length, 3)

  story = accept(accept(story, 0), 1)
  // An intervention queued for chapter 3 becomes a landing prerequisite
  // in that chapter's plan…
  const queued = queueIntervention(story, { text: '一场突如其来的暴雨封住了码头', readerIndex: 1 })
  const beat2 = storyBeatPlan(queued, 2)
  assert.equal(beat2.chapterNumber, 3)
  assert.equal(beat2.prerequisites.length, 6)
  assert.ok(beat2.prerequisites.some((item) => item.includes('本章介入') && item.includes('暴雨封住了码头')))
  // …and once the chapter exists, later plans carry it as a landed fact.
  const landed = accept(queued, 2)
  const beat3 = storyBeatPlan(landed, 3)
  assert.equal(beat3.unlockedInterventions.length, 1)
  assert.equal(beat3.unlockedInterventions[0].chapter, 3)
  assert.match(beat3.unlockedInterventions[0].text, /暴雨封住了码头/)

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

test('genre templates are pure categories: twenty-six of them, none bound to a world', () => {
  assert.equal(GENRES.length, 6)
  assert.equal(GENRE_TEMPLATES.length, 26)
  for (const template of GENRE_TEMPLATES) {
    // Decoupled by product rule: a template carries no world reference at
    // all — only its own brick decoration (symbol/colour).
    assert.equal('worldId' in template, false, template.id)
    assert.equal(genreTemplateById(template.id), template)
    assert.ok(template.symbol && template.color, template.id)
  }
  // Any template can be told in any world: the story keeps the reader's own
  // world pick and the pinned category completely independently.
  const cross = createStory({ genreId: 'court', genreTemplateId: 'gaowu', name: '阿遥' })
  assert.equal(cross.genreId, 'court')
  assert.equal(cross.genreTemplateId, 'gaowu')
  assert.equal(cross.config.genreId, 'court')
  assert.equal(cross.config.genreTemplateId, 'gaowu')
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

test('every world keeps a spawn point registry whose first entry is its location default', () => {
  // The user's own examples must each exist in some world's registry.
  const allNames = GENRES.flatMap((genre) => genre.spawnPoints.map((point) => point.name))
  for (const example of ['山脚村落', '山神破庙', '下城贫民窟', '皇帝的卧室']) {
    assert.ok(allNames.includes(example), example)
  }
  for (const genre of GENRES) {
    // The registry now backs ten identity landing cells, so it is larger
    // than the old four-card list; each entry stays small and concrete.
    assert.ok(genre.spawnPoints.length >= 10, genre.id)
    // The default spawn point is the world's location, listed first, so a
    // pre-spawn-point save (no startPointName) opens exactly where it always did.
    assert.equal(genre.spawnPoints[0].name, genre.location, genre.id)
    assert.equal(defaultStartPoint(genre).name, genre.location, genre.id)
    const seen = new Set()
    const seenIds = new Set()
    for (const point of genre.spawnPoints) {
      assert.ok(point.name.length <= 6, `${genre.id}:${point.name}`)
      assert.ok(point.hook.length > 10, `${genre.id}:${point.name} hook`)
      assert.ok(point.situation.length >= 2, `${genre.id}:${point.name} situation`)
      assert.ok(!seen.has(point.name), `${genre.id}:${point.name} duplicate`)
      assert.ok(point.id && !seenIds.has(point.id), `${genre.id}:${point.id} duplicate id`)
      seen.add(point.name)
      seenIds.add(point.id)
    }
  }
})

test('origin identities: ten concepts, and every world lands every one of them', () => {
  assert.deepEqual(
    ORIGIN_IDENTITIES.map((identity) => identity.id),
    ['heir', 'official', 'mystery', 'commoner', 'underclass', 'fallen', 'hermit', 'outsider', 'exile', 'merchant'],
  )
  for (const identity of ORIGIN_IDENTITIES) {
    assert.ok(identity.name.length >= 2 && identity.description.length > 10 && identity.situation.length >= 2, identity.id)
    assert.equal(originIdentityById(identity.id), identity)
  }
  assert.equal(originIdentityById('不存在的身份'), null)
  for (const genre of GENRES) {
    for (const identity of ORIGIN_IDENTITIES) {
      const cell = originSpawnCell(genre, identity.id)
      assert.ok(cell, `${genre.id}:${identity.id} cell`)
      assert.ok(cell.title.length >= 2, `${genre.id}:${identity.id} local title`)
      assert.equal(localIdentityTitle(genre, identity.id), cell.title)
      assert.ok(cell.points.length >= 1 && cell.points.length <= 3, `${genre.id}:${identity.id} points`)
      for (const point of cell.points) {
        // Cells reference the registry's own objects — never copies.
        assert.ok(genre.spawnPoints.includes(point), `${genre.id}:${identity.id}:${point.name} is a registry object`)
      }
    }
  }
})

test('origin identities: the 24 legacy spawn points were regrouped, shared points never duplicated', () => {
  const legacyNames = {
    mist: ['第七码头', '疍家渔排', '沉船甲板', '灯塔守夜屋'],
    cultivation: ['后山灵田', '山神破庙', '山脚村落', '外门柴房'],
    neon: ['下城回收站', '下城贫民窟', '9号胶囊舱', '地下诊所后间'],
    city: ['长宁街口', '面馆后厨', '网吧包间', '夜班便利店'],
    court: ['长乐宫偏殿', '皇帝的卧室', '冷宫偏殿', '御膳房后院'],
    frontier: ['七号站配给舱', '冷冻休眠舱', '观测塔值班室', '货舱夹层'],
  }
  for (const genre of GENRES) {
    const names = genre.spawnPoints.map((point) => point.name)
    for (const legacy of legacyNames[genre.id]) assert.ok(names.includes(legacy), `${genre.id}:${legacy}`)
    // Every hook text exists exactly once in the registry, however many
    // identity cells reference the point.
    const hooks = genre.spawnPoints.map((point) => point.hook)
    assert.equal(new Set(hooks).size, hooks.length, `${genre.id} hook text duplicated`)
    // The cells reference more slots than there are points: sharing is real.
    const slots = ORIGIN_IDENTITIES.reduce((sum, identity) => sum + spawnPointsForIdentity(genre, identity.id).length, 0)
    assert.ok(slots > genre.spawnPoints.length, `${genre.id} cells share registry points`)
  }
  // One point, two identities, the identical object.
  const mist = GENRES.find((genre) => genre.id === 'mist')
  const viaHermit = spawnPointsForIdentity(mist, 'hermit').find((point) => point.name === '灯塔守夜屋')
  const viaMystery = spawnPointsForIdentity(mist, 'mystery').find((point) => point.name === '灯塔守夜屋')
  assert.ok(viaHermit && viaHermit === viaMystery)
  const cultivation = GENRES.find((genre) => genre.id === 'cultivation')
  const templeHermit = spawnPointsForIdentity(cultivation, 'hermit').find((point) => point.name === '山神破庙')
  const templeMystery = spawnPointsForIdentity(cultivation, 'mystery').find((point) => point.name === '山神破庙')
  assert.ok(templeHermit && templeHermit === templeMystery)
})

test('origin identity narrows spawn resolution to its landing cell', () => {
  const court = GENRES.find((genre) => genre.id === 'court')
  const cultivation = GENRES.find((genre) => genre.id === 'cultivation')
  // Inside the cell, a listed name resolves with its table hook.
  const bedroom = resolveStartPoint(court, { originIdentityId: 'heir', startPointName: '皇帝的卧室', startPointHook: '乱写的处境' })
  assert.equal(bedroom.name, '皇帝的卧室')
  assert.ok(bedroom.hook.includes('龙床边的脚踏'))
  // Unset name resolves to the cell default (its first point).
  assert.equal(resolveStartPoint(cultivation, { originIdentityId: 'hermit' }).name, '山神破庙')
  assert.equal(resolveStartPoint(court, { originIdentityId: 'heir' }).name, '皇帝的卧室')
  // A name from another identity's cell is outside the narrowed domain and
  // falls back to this identity's default instead of leaking across cells.
  assert.equal(resolveStartPoint(cultivation, { originIdentityId: 'heir', startPointName: '皇帝的卧室' }).name, '主峰藏经阁')
  assert.equal(resolveStartPoint(court, { originIdentityId: 'commoner', startPointName: '皇帝的卧室' }).name, '御膳房后院')
  // An invalid identity id is ignored: whole-table resolution, as before.
  const mist = GENRES.find((genre) => genre.id === 'mist')
  assert.equal(resolveStartPoint(mist, { originIdentityId: '不存在', startPointName: '灯塔守夜屋' }).name, '灯塔守夜屋')
  assert.equal(resolveStartPoint(mist, { originIdentityId: '' }).name, '第七码头')
  // God mode ignores identities for spawn resolution: typed text still rules.
  const custom = { id: 'custom', location: '故事开始的地方' }
  assert.equal(resolveStartPoint(custom, { originIdentityId: 'heir' }), null)
})

test('origin identity reaches the bible premise, the beat plan and the dossier', () => {
  const story = createStory(draft({ genreId: 'court', originIdentityId: 'heir', startPointName: '皇帝的卧室' }))
  assert.equal(story.config.originIdentityId, 'heir')
  assert.ok(story.worldBible.premise.includes('皇室嫡系（顶级势力核心）'), story.worldBible.premise)
  assert.ok(story.worldBible.premise.includes('皇帝的卧室'))
  const plan = storyBeatPlan(story, 0)
  assert.ok(plan.prerequisites.some((line) => line === '出身：皇室嫡系（顶级势力核心）'), plan.prerequisites.join('|'))
  assert.equal(storyNarrativeDossier(story, 0).protagonistOrigin, '顶级势力核心·皇室嫡系')
  // Later chapters may carry the origin as background but never the spawn hook.
  assert.ok(storyBeatPlan(story, 2).prerequisites.some((line) => line.startsWith('出身：')))
  // No identity: no origin lines anywhere, exactly the pre-identity shape.
  const plain = createStory(draft({ genreId: 'court' }))
  assert.equal(plain.config.originIdentityId, '')
  assert.ok(!storyBeatPlan(plain, 0).prerequisites.some((line) => line.startsWith('出身：')))
  assert.equal(storyNarrativeDossier(plain, 0).protagonistOrigin, '')
  // An invalid identity id is cleaned out of the stored config.
  assert.equal(createStory(draft({ originIdentityId: '伪造身份' })).config.originIdentityId, '')
  // God mode: the concept name itself is the title (no landing table there).
  const god = createStory(godDraft({ originIdentityId: 'mystery' }))
  assert.ok(god.worldBible.premise.includes('身世成谜'), god.worldBible.premise)
  assert.equal(originSummaryFor({ id: 'custom' }, god.config).localTitle, '身世成谜')
  // Snapshots keep the identity id (a concept, not private text) while the
  // free-form spawn text is still stripped.
  const snapshot = publicSnapshot(createStory(draft({ genreId: 'custom', originIdentityId: 'exile', startPointName: '破庙草席' })))
  assert.equal(snapshot.config.originIdentityId, 'exile')
  assert.equal(snapshot.config.startPointName, '')
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
  for (const chapter of chapters) assert.equal(chapter.choice, null)
  // The accept protocol works end to end for a custom world, and a
  // pre-retirement branch recording still replays through the legacy path.
  story = accept(story, 0)
  story = accept(story, 1)
  story = chooseBranch(story, 1, 'open')
  const third = buildChapter(story, 2)
  assert.ok(third.paragraphs.join('').includes('宁笙'))
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

// ---------------------------------------------------------------------------
// 爽文批次：篇幅双模式、季/弧结构、场景变奏、台账、下一季与旧档兼容。
// ---------------------------------------------------------------------------

const walkLocal = (story, count, picks = {}) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    const accepted = acceptChapter(current, chapter, chapterKey(current, index))
    assert.notEqual(accepted, current, `chapter ${index} must accept`)
    current = accepted
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, picks[index] || chapter.choice.options[0].id)
    }
  }
  return current
}

test('length modes derive totals; a missing or bogus mode is a short story', () => {
  assert.equal(storyLengthModeOf(createStory({ genreId: 'mist' })), 'short')
  assert.equal(totalChaptersFor(createStory({ genreId: 'mist' })), 6)
  assert.equal(totalChaptersFor(createStory({ genreId: 'mist', storyLengthMode: 'season' })), 24)
  assert.equal(totalChaptersFor(createStory({ genreId: 'mist', storyLengthMode: 'long' })), 100)
  assert.equal(totalChaptersFor(createStory({ genreId: 'mist', storyLengthMode: 'bogus' })), 6)
  // Merged stories stay capped at the shorter structure, whatever the sources were.
  const merged = createMergedStory(
    createStory({ genreId: 'mist', storyLengthMode: 'season' }),
    createStory({ genreId: 'neon', storyLengthMode: 'long' }),
  )
  assert.equal(storyLengthModeOf(merged), 'short')
  assert.equal(totalChaptersFor(merged), 6)
  assert.equal(outlineLengthFor(createStory({ genreId: 'mist', storyLengthMode: 'long' })), 20)
  assert.equal(outlineLengthFor(createStory({ genreId: 'mist', storyLengthMode: 'season' })), 24)
})

test('season structure: acts of six, small upgrades at act ends, big one at the finale', () => {
  const season = createStory({ genreId: 'mist', storyLengthMode: 'season' })
  for (const index of [5, 11, 17]) {
    const structure = structureFor(season, index)
    assert.equal(structure.isUnitEnd, true, `chapter ${index + 1}`)
    assert.equal(structure.upgradeKind, '小升格')
  }
  const finale = structureFor(season, 23)
  assert.equal(finale.upgradeKind, '季终大升格')
  assert.equal(finale.unitIndex, 3)
  assert.equal(structureFor(season, 6).unitIndex, 1)
  assert.equal(buildChapter(season, 23).summary.includes('终局'), true)
  const plan = storyBeatPlan(season, 23)
  assert.match(plan.prerequisites.join(''), /季终大升格点/)
  assert.equal(plan.structure.mode, 'season')
  // The world bible outline covers the whole season and every entry differs.
  assert.equal(season.worldBible.outline.length, 24)
  assert.equal(new Set(season.worldBible.outline).size, 24)
})

test('long structure: four arcs of twenty-five with arc-end nodes and a 20-entry outline', () => {
  const long = createStory({ genreId: 'neon', storyLengthMode: 'long' })
  assert.equal(long.worldBible.outline.length, 20)
  assert.equal(new Set(long.worldBible.outline).size, 20)
  for (const index of [24, 49, 74]) {
    assert.equal(structureFor(long, index).upgradeKind, '弧末大节点', `chapter ${index + 1}`)
  }
  assert.equal(structureFor(long, 99).upgradeKind, '长线终局结算')
  assert.equal(outlineIndexFor(0, long), 0)
  assert.equal(outlineIndexFor(99, long), 19)
  // No chapter carries a choice on the long line either.
  for (const index of [7, 8, 9, 24, 99]) assert.equal(buildChapter(long, index).choice, null)
})

test('scenes past chapter six vary by act and never replay the base table', () => {
  const season = walkLocal(createStory({ genreId: 'cultivation', storyLengthMode: 'season' }), 14, { 1: 'open', 7: 'wait' })
  const base = new Set()
  const fresh = createStory({ genreId: 'cultivation', storyLengthMode: 'season' })
  for (let index = 0; index < 6; index += 1) {
    for (const line of buildChapter(fresh, index).paragraphs) base.add(line)
  }
  const scene7 = buildChapter(season, 6).paragraphs.join('')
  const scene13 = buildChapter(season, 12).paragraphs.join('')
  const scene8 = buildChapter(season, 7).paragraphs.join('')
  assert.notEqual(scene7, scene13)
  for (const chapter of [buildChapter(season, 6), buildChapter(season, 12)]) {
    for (const line of chapter.paragraphs.slice(0, 3)) assert.equal(base.has(line), false, line)
  }
  assert.notEqual(scene8, buildChapter(season, 1).paragraphs.join(''))
  // A long-line chapter 25 opens its second arc with a fresh scene as well.
  const long = createStory({ genreId: 'cultivation', storyLengthMode: 'long' })
  assert.notEqual(buildChapter(long, 24).paragraphs[0], buildChapter(long, 0).paragraphs[0])
})

test('custom length: the season structure generalised to a reader-chosen total (10 and 37)', () => {
  const ten = createStory({ genreId: 'mist', storyLengthMode: 'custom', targetChapters: 10 })
  assert.equal(totalChaptersFor(ten), 10)
  assert.equal(storyLengthModeOf(ten), 'custom')
  assert.equal(ten.config.targetChapters, 10)
  // Quarter boundaries for 10: acts end at chapters 3, 5, 8 and the finale.
  for (const index of [2, 4, 7]) {
    const structure = structureFor(ten, index)
    assert.equal(structure.isUnitEnd, true, `chapter ${index + 1}`)
    assert.equal(structure.upgradeKind, '小升格', `chapter ${index + 1}`)
  }
  const finale = structureFor(ten, 9)
  assert.equal(finale.isFinale, true)
  assert.equal(finale.upgradeKind, '终章大升格')
  assert.equal(structureFor(ten, 3).unitIndex, 1)
  assert.equal(ten.worldBible.outline.length, 10)

  const thirtySeven = createStory({ genreId: 'cultivation', storyLengthMode: 'custom', targetChapters: 37 })
  assert.equal(totalChaptersFor(thirtySeven), 37)
  // Quarter boundaries for 37: acts end at chapters 10, 19, 28 and the finale.
  for (const index of [9, 18, 27]) {
    assert.equal(structureFor(thirtySeven, index).upgradeKind, '小升格', `chapter ${index + 1}`)
  }
  assert.equal(structureFor(thirtySeven, 36).upgradeKind, '终章大升格')
  assert.equal(structureFor(thirtySeven, 10).unitIndex, 1)
  assert.equal(structureFor(thirtySeven, 36).unitIndex, 3)
  // The beat plan speaks the custom total, and the outline compresses.
  const plan = storyBeatPlan(thirtySeven, 36)
  assert.match(plan.prerequisites.join(''), /自定义篇幅共 37 章/)
  assert.match(plan.prerequisites.join(''), /终章大升格点/)
  assert.equal(plan.structure.totalChapters, 37)
  assert.equal(thirtySeven.worldBible.outline.length, 20)
  // A custom line completes exactly at its own total.
  const walked = walkLocal(createStory({ genreId: 'mist', storyLengthMode: 'custom', targetChapters: 10, name: '遥' }), 10)
  assert.equal(isStoryComplete(walked), true)
})

test('custom length config validation: out-of-range targets are rejected, endless carries none', () => {
  assert.equal(validTargetChapters(10), 10)
  assert.equal(validTargetChapters(999), 999)
  assert.equal(validTargetChapters(9), null)
  assert.equal(validTargetChapters(1000), null)
  assert.equal(validTargetChapters(24.5), null)
  // A custom mode without a valid target never survives normalisation:
  // the config falls back to the season default instead of storing a
  // broken custom length.
  const rejected = createStory({ genreId: 'mist', storyLengthMode: 'custom', targetChapters: 5 })
  assert.equal(rejected.config.storyLengthMode, 'season')
  assert.equal(rejected.config.targetChapters, null)
  assert.equal(totalChaptersFor(rejected), 24)
  const noTarget = createStory({ genreId: 'mist', storyLengthMode: 'custom' })
  assert.equal(noTarget.config.storyLengthMode, 'season')
  // Endless: any stray target is dropped.
  const endless = createStory({ genreId: 'mist', storyLengthMode: 'endless', targetChapters: 50 })
  assert.equal(endless.config.storyLengthMode, 'endless')
  assert.equal(endless.config.targetChapters, null)
})

test('endless length: rolling 12-chapter arcs, no finale ever, manual finish freezes the line', () => {
  const endless = createStory({ genreId: 'mist', storyLengthMode: 'endless', name: '遥' })
  assert.equal(totalChaptersFor(endless), Infinity)
  assert.equal(isStoryComplete(endless), false)
  // Chapter 12 closes the first arc with a small upgrade; chapter 13 opens arc two.
  const arcEnd = structureFor(endless, 11)
  assert.equal(arcEnd.isUnitEnd, true)
  assert.equal(arcEnd.upgradeKind, '小升格')
  assert.equal(arcEnd.isFinale, false)
  // Chapter 25 (index 24): the arc roll — third arc, first position, no finale.
  const chapter25 = structureFor(endless, 24)
  assert.equal(chapter25.unitIndex, 2)
  assert.equal(chapter25.positionInUnit, 0)
  assert.equal(chapter25.isFinale, false)
  assert.equal(chapter25.total, Infinity)
  const plan25 = storyBeatPlan(endless, 24)
  assert.match(plan25.prerequisites.join(''), /无限连载/)
  assert.match(plan25.prerequisites.join(''), /第 3 弧/)
  assert.equal(plan25.structure.totalChapters, null, 'the beat plan reports no total for an endless line')
  // No chapter index is ever out of range, and the line never completes itself.
  const walked = walkLocal(createStory({ genreId: 'mist', storyLengthMode: 'endless', name: '遥' }), 30)
  assert.equal(walked.chapters.length, 30)
  assert.equal(isStoryComplete(walked), false)
  assert.equal(buildChapter(walked, 30).index, 30)
  // The world bible outlines two rolling arcs and never promises an ending.
  assert.equal(endless.worldBible.outline.length, 24)
  assert.equal(endless.worldBible.outline.some((line) => line.includes('终局会回答')), false)
  assert.match(endless.worldBible.endingAnchor, /没有预设的终点/)
  // Manual finish: total freezes at the reached count, status flips, and
  // no further chapter can be accepted.
  const finished = finishEndlessLine(walked)
  assert.equal(isManuallyFinished(finished), true)
  assert.equal(finished.status, 'complete')
  assert.equal(totalChaptersFor(finished), 30)
  assert.equal(isStoryComplete(finished), true)
  assert.throws(() => buildChapter(finished, 30), RangeError)
  // Finishing twice (or finishing a finite line) changes nothing.
  assert.equal(finishEndlessLine(finished), finished)
  const season = createStory({ genreId: 'mist', storyLengthMode: 'season' })
  assert.equal(finishEndlessLine(season), season)
})

test('a full season walks locally to completion and rolls into the next season', () => {
  const season = walkLocal(createStory({ genreId: 'mist', storyLengthMode: 'season', name: '遥' }), 24)
  assert.equal(season.chapters.length, 24)
  assert.equal(isStoryComplete(season), true)
  assert.equal(season.chapterIndex, 23)
  assert.throws(() => startNextSeason(createStory({ genreId: 'mist', storyLengthMode: 'season' })), /还没有读完/)
  assert.throws(() => startNextSeason(walkLocal(createStory({ genreId: 'mist' }), 6)), /季模式/)
  const next = startNextSeason(season)
  assert.equal(next.config.seasonNumber, 2)
  assert.equal(next.previousSeasonId, season.id)
  assert.equal(next.chapters.length, 0)
  assert.equal(totalChaptersFor(next), 24)
  assert.match(next.worldBible.premise, /^第2季——/)
  assert.ok(next.worldBible.rules.some((rule) => rule.includes('第2季升格')))
  assert.equal(next.worldBible.outline.length, 24)
})

test('every accepted chapter carries a ledger; the dossier aggregates it without spoiling ahead', () => {
  let season = walkLocal(createStory({ genreId: 'mist', storyLengthMode: 'season' }), 2)
  season = queueIntervention(season, { text: '退潮时分，灯塔的灯无故熄灭了一次', readerIndex: 1 })
  for (let index = 2; index < 8; index += 1) season = accept(season, index)
  for (const chapter of season.chapters) {
    assert.ok(Array.isArray(chapter.events) && chapter.events.length >= 1, `chapter ${chapter.index}`)
    assert.ok(Array.isArray(chapter.foreshadowing))
  }
  // The chapter an intervention landed in records it as an event.
  const after = season.chapters[2]
  assert.ok(after.events.some((event) => event.includes('介入事件') && event.includes('灯塔的灯无故熄灭')))
  // Upgrade-point chapters record their structure node.
  assert.ok(season.chapters[5].events.some((event) => event.includes('小升格')))
  const ledger = storyLedgerFor(season, 3)
  assert.ok(ledger.events.every((entry) => entry.chapter <= 4))
  assert.ok(ledger.foreshadowing.length >= 1)
  const dossier = storyNarrativeDossier(season, 7)
  assert.ok(dossier.ledger.events.length >= 1)
  assert.ok(dossier.ledger.openForeshadowing.length >= 1)
  assert.equal(dossier.timeline.length, 8)
  // No choices were recorded on this line, so the legacy consequence
  // view of the dossier stays empty.
  assert.equal(dossier.activeConsequences.length, 0)
})

test('pre-mode saves stay short stories and keep reading, merging and sharing', () => {
  const legacy = createStory({ genreId: 'mist', name: '旧档' })
  delete legacy.config.storyLengthMode
  assert.equal(storyLengthModeOf(legacy), 'short')
  const walked = walkLocal(legacy, 6, { 1: 'open', 3: 'cross' })
  assert.equal(isStoryComplete(walked), true)
  const snapshot = publicSnapshot(walked)
  assert.equal(snapshot.status, 'complete')
  assert.equal(snapshot.chapters.length, 6)
  // A season snapshot reports completion only at 24 chapters.
  const season = walkLocal(createStory({ genreId: 'mist', storyLengthMode: 'season' }), 12)
  assert.equal(publicSnapshot(season).status, 'ongoing')
  const fullSeason = walkLocal(createStory({ genreId: 'mist', storyLengthMode: 'season' }), 24)
  const seasonSnapshot = publicSnapshot(fullSeason)
  assert.equal(seasonSnapshot.status, 'complete')
  assert.equal(seasonSnapshot.chapters.length, 24)
  assert.equal(seasonSnapshot.config.storyLengthMode, 'season')
})

test('the default draft carries no preset origin or ability', () => {
  assert.equal(DEFAULT_DRAFT.origin, '')
  assert.equal(DEFAULT_DRAFT.ability, '')
  // Normalizing an untouched draft must not smuggle the old menu back in.
  const story = createStory({})
  assert.equal(story.config.origin, '')
  assert.equal(story.config.ability, '')
})

test('a new story takes its origin from the identity step, resolved in the world', () => {
  const story = createStory({ genreId: 'court', originIdentityId: 'heir', name: '阿遥' })
  assert.equal(story.config.origin, '')
  // Bible premise, beat plan and the local narrative all speak the
  // identity's local title — never a fixed origin menu entry.
  assert.match(story.worldBible.premise, /身为皇室嫡系（顶级势力核心）的阿遥/)
  const plan = storyBeatPlan(story, 0)
  assert.ok(plan.prerequisites.some((line) => line.includes('身份“皇室嫡系”')))
  assert.ok(plan.prerequisites.some((line) => line.includes('出身：皇室嫡系（顶级势力核心）')))
  const text = buildChapter(story, 0).paragraphs.join('\n')
  assert.match(text, /皇室嫡系（顶级势力核心）/)
  assert.doesNotMatch(text, /无名漂泊者|旧贵族旁支|失忆的继承人|被放逐的学徒/)
  // The empty ability falls back to the unnamed placeholder, never a crash.
  assert.ok(plan.prerequisites.some((line) => line.includes('能力：尚未命名的能力')))
})

test('a pre-identity-step story keeps its stored origin text readable', () => {
  const story = createStory({ genreId: 'mist', origin: '无名漂泊者', name: '旧客' })
  assert.equal(story.config.origin, '无名漂泊者')
  const text = buildChapter(story, 0).paragraphs.join('\n')
  assert.match(text, /无名漂泊者/)
  const plan = storyBeatPlan(story, 0)
  assert.ok(plan.prerequisites.some((line) => line.includes('身份“无名漂泊者”')))
})

test('ability pools: every world has four, and the four legacy abilities went home', () => {
  for (const genre of GENRES) {
    const pool = WORLD_ABILITY_POOLS[genre.id]
    assert.ok(Array.isArray(pool), `${genre.id} has a pool`)
    assert.equal(pool.length, 4, `${genre.id} pool has four abilities`)
  }
  const namesIn = (id) => WORLD_ABILITY_POOLS[id].map((item) => item.name)
  assert.ok(namesIn('mist').includes('听见潮汐'))
  assert.ok(namesIn('cultivation').includes('借火一瞬'))
  assert.ok(namesIn('neon').includes('读取备份'))
  assert.ok(namesIn('frontier').includes('缝合裂隙'))
  // Ids are unique across every pool, or a restored pick could cross wires.
  const ids = ALL_ABILITIES.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(GENERIC_ABILITY_POOL.length, 4)
})

test('every craft template brings exactly two signature abilities', () => {
  assert.equal(Object.keys(TEMPLATE_SIGNATURE_ABILITIES).length, GENRE_TEMPLATES.length)
  for (const template of GENRE_TEMPLATES) {
    const signatures = TEMPLATE_SIGNATURE_ABILITIES[template.id]
    assert.ok(Array.isArray(signatures), `${template.id} has signatures`)
    assert.equal(signatures.length, 2, `${template.id} has two signatures`)
  }
})

test('ability candidates compose from the (world × template) pair', () => {
  // Pinned template: signatures first, then the world pool.
  const mistXuanhuan = abilityCandidatesFor({ genreId: 'mist', genreTemplateId: 'xuanhuan' })
  assert.equal(mistXuanhuan.length, 6)
  assert.equal(mistXuanhuan[0].name, '气运加身')
  assert.equal(mistXuanhuan[1].name, '吞噬进化')
  assert.ok(mistXuanhuan.some((item) => item.name === '听见潮汐'))
  assert.ok(!mistXuanhuan.some((item) => item.name === '借火一瞬'))
  // No pinned template: the world pool alone.
  const mistBare = abilityCandidatesFor({ genreId: 'mist', genreTemplateId: '' })
  assert.deepEqual(mistBare.map((item) => item.name), WORLD_ABILITY_POOLS.mist.map((item) => item.name))
  // Switching the world changes the list; the other axis stays put.
  const courtLishi = abilityCandidatesFor({ genreId: 'court', genreTemplateId: 'lishi' })
  assert.ok(courtLishi.some((item) => item.name === '大势预读'))
  assert.ok(courtLishi.some((item) => item.name === '察言观色'))
  assert.ok(!courtLishi.some((item) => item.name === '听见潮汐'))
  assert.notDeepEqual(
    abilityCandidatesFor({ genreId: 'mist', genreTemplateId: 'lishi' }).map((item) => item.name),
    courtLishi.map((item) => item.name),
  )
  // God mode: the pinned craft's signatures only, or the generic pool.
  assert.deepEqual(
    abilityCandidatesFor({ genreId: 'custom', genreTemplateId: 'lishi', custom: true }).map((item) => item.name),
    ['大势预读', '名将旧梦'],
  )
  assert.deepEqual(
    abilityCandidatesFor({ genreId: 'custom', genreTemplateId: '', custom: true }).map((item) => item.name),
    GENERIC_ABILITY_POOL.map((item) => item.name),
  )
})
