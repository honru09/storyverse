import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptChapter, buildChapter, chapterForReading, chapterKey, chooseBranch,
  createMergedStory, createStory, publicSnapshot,
} from '../src/story-engine.js'
import {
  lastAccessibleIndex, materialize, moveReadingPosition, prepareReadingWindow, readerIndexFor,
} from '../src/reading-flow.js'

const remoteStory = (draft = {}) => ({ ...createStory(draft), engine: 'gemini' })
const generatedChapter = (story, index, overrides = {}) => ({
  ...buildChapter(story, index),
  title: `模型章节 ${index + 1}`,
  paragraphs: [`模型创作的第 ${index + 1} 章。`, '纸做的鲸鱼在夜空缓缓游过。'],
  summary: `这是模型创作的第 ${index + 1} 章摘要。`,
  ...overrides,
})
const accept = (story, index, overrides) => acceptChapter(story, generatedChapter(story, index, overrides), chapterKey(story, index))

test('remote reading windows never materialize template prose, even for an empty story', () => {
  const empty = remoteStory()
  assert.strictEqual(materialize(empty, 6), empty)
  assert.strictEqual(prepareReadingWindow(empty), empty)
  assert.equal(empty.chapters.length, 0)
  let story = accept(accept(empty, 0), 1)
  story = chooseBranch(story, 1, 'open')
  const before = JSON.stringify(story)
  assert.strictEqual(materialize(story, 6), story)
  assert.strictEqual(prepareReadingWindow(story, 1), story)
  assert.equal(JSON.stringify(story), before)
  assert.equal(chapterForReading(story, 2), null)
})

test('remote chapter gates require a choice and a separately accepted response', () => {
  const initial = accept(accept(remoteStory(), 0), 1)
  const decision = moveReadingPosition(initial, 1)
  assert.equal(lastAccessibleIndex(decision), 1)
  assert.strictEqual(moveReadingPosition(decision, 2), decision)
  const earlyChapter = generatedChapter(decision, 2)
  assert.strictEqual(acceptChapter(decision, earlyChapter, chapterKey(decision, 2)), decision)
  const oldKey = chapterKey(decision, 2)
  const chosen = chooseBranch(decision, 1, 'open')
  assert.strictEqual(moveReadingPosition(chosen, 2), chosen)
  assert.strictEqual(acceptChapter(chosen, earlyChapter, oldKey), chosen)
  const ready = accept(chosen, 2)
  assert.equal(moveReadingPosition(ready, 2).readerIndex, 2)
  assert.equal(ready.chapters[2].paragraphs[1], '纸做的鲸鱼在夜空缓缓游过。')
})

test('rewriting remote content preserves the accepted decision and rejects stale future responses', () => {
  let story = accept(accept(remoteStory(), 0), 1)
  story = accept(accept(chooseBranch(story, 1, 'open'), 2), 3)
  story = accept(chooseBranch(story, 3, 'cross'), 4)
  const oldResponse = generatedChapter(story, 5)
  const oldKey = chapterKey(story, 5)
  const original = JSON.stringify(story)
  const rewritten = chooseBranch(story, 1, 'wait')
  assert.deepEqual(rewritten.chapters[1], story.chapters[1])
  assert.equal(rewritten.chapters.length, 2)
  assert.equal(rewritten.choices[3], undefined)
  assert.equal(readerIndexFor({ ...rewritten, readerIndex: 5 }), 1)
  assert.strictEqual(acceptChapter(rewritten, oldResponse, oldKey), rewritten)
  assert.strictEqual(materialize(rewritten, 6), rewritten)
  assert.equal(JSON.stringify(story), original)
})

test('a remote chapter matching an old prototype signature is never repaired as a template', () => {
  let story = accept(remoteStory({ name: '宁笙', immersive: true, destination: '白潮港' }), 0)
  const template = buildChapter(story, 1)
  story = accept(story, 1, {
    paragraphs: [template.paragraphs[0], 'TA让蓝火沿着指尖亮起，信纸背面浮出一条新的航线。', '航线指向白潮港，而潮汐正在倒着退去。'],
  })
  assert.strictEqual(chapterForReading(story, 1), story.chapters[1])
  assert.deepEqual(chooseBranch(story, 1, 'wait').chapters[1], story.chapters[1])
})

test('remote snapshots preserve actual prose and redact known values across all public text', () => {
  const fields = ['name', 'trait', 'origin', 'ability', 'tone', 'hometown', 'school', 'company', 'role', 'friend', 'destination']
  const draft = Object.fromEntries(fields.map(field => [field, `PRIVATE_${field.toUpperCase()}`]))
  let story = remoteStory({ ...draft, immersive: true })
  story = { ...story, title: '星鲸与 PRIVATE_NAME', internalPrompt: 'PRIVATE_TOP_EXTRA', config: { ...story.config, privateNote: 'PRIVATE_CONFIG_EXTRA' } }
  const privateSentence = `${Object.values(draft).join('、')}，以及 PRIVATE_CONFIG_EXTRA。`
  story = accept(story, 0, { title: 'PRIVATE_NAME 追逐星鲸', paragraphs: [privateSentence, '纸做的鲸鱼在夜空缓缓游过。'], summary: privateSentence, debugTrace: 'PRIVATE_CHAPTER_EXTRA' })
  const choice = buildChapter(story, 1).choice
  story = accept(story, 1, { choice: {
    ...choice, prompt: 'PRIVATE_NAME 要相信 PRIVATE_FRIEND 吗？', hidden: 'PRIVATE_CHOICE_EXTRA',
    options: choice.options.map(option => ({ ...option, label: `${option.label} PRIVATE_NAME`, detail: privateSentence, consequence: privateSentence, trace: 'PRIVATE_OPTION_EXTRA' })),
  } })
  story = chooseBranch(story, 1, 'wait')
  story.worldBible.privatePrompt = 'PRIVATE_WORLD_EXTRA'
  story.choices = { ...story.choices, 0: 'PRIVATE_BAD_CHOICE', 3: 'cross', 5: 'PRIVATE_FUTURE_CHOICE' }
  const before = JSON.stringify(story)
  const shared = publicSnapshot(story)
  const json = JSON.stringify(shared)
  assert.doesNotMatch(json, /PRIVATE_/)
  assert.equal(shared.title, '星鲸与 匿名旅者')
  assert.equal(shared.chapters[0].title, '匿名旅者 追逐星鲸')
  assert.equal(shared.chapters[0].paragraphs[1], story.chapters[0].paragraphs[1])
  assert.match(shared.chapters[0].paragraphs[0], /匿名旅者、匿名探索者、未知来处、匿名火种、温和叙事、某地、某所学校、某个组织、某种职业、一位故人、某处目的地/)
  assert.equal(shared.chapters[1].choice.prompt, '匿名旅者 要相信 一位故人 吗？')
  assert.deepEqual(shared.choices, { 1: 'wait' })
  assert.equal(shared.engine, 'gemini')
  assert.equal(shared.readOnly, true)
  assert.equal(shared.readerIndex, 0)
  assert.deepEqual(shared.sourceIds, [])
  assert.equal(shared.internalPrompt, undefined)
  assert.equal(shared.worldBible.privatePrompt, undefined)
  assert.equal(shared.chapters[0].debugTrace, undefined)
  assert.equal(shared.chapters[1].choice.hidden, undefined)
  assert.equal(shared.chapters[1].choice.options[0].trace, undefined)
  assert.equal(JSON.stringify(story), before)
  assert.strictEqual(chooseBranch(shared, 1, 'open'), shared)
  assert.strictEqual(materialize(shared, 6), shared)
  assert.strictEqual(acceptChapter(shared, generatedChapter(shared, 2), chapterKey(shared, 2)), shared)
})

test('literal redaction handles regexp characters, overlapping values and non-cascading aliases', () => {
  let story = remoteStory({ name: 'A+B', friend: 'A+B友', hometown: '匿名', immersive: true })
  story = accept(story, 0, { paragraphs: ['A+B友与 A+B 来自匿名。', 'AAB 并不是那个名字。'] })
  const shared = publicSnapshot(story)
  assert.equal(shared.chapters[0].paragraphs[0], '一位故人与 匿名旅者 来自某地。')
  assert.equal(shared.chapters[0].paragraphs[1], 'AAB 并不是那个名字。')
})

test('remote merged snapshots alias both protagonists and drop nested private metadata', () => {
  const a = createStory({ name: 'PRIVATE_A', genreId: 'mist' })
  const b = createStory({ name: 'PRIVATE_B', genreId: 'cultivation' })
  let story = { ...createMergedStory(a, b), engine: 'gemini' }
  story.config.protagonists = story.config.protagonists.map((person, index) => ({
    ...person,
    hometown: `PRIVATE_HOME_${index}`, school: `PRIVATE_SCHOOL_${index}`, company: `PRIVATE_COMPANY_${index}`,
    role: `PRIVATE_ROLE_${index}`, friend: `PRIVATE_FRIEND_${index}`, destination: `PRIVATE_DESTINATION_${index}`,
    internal: { detail: `PRIVATE_EXTRA_${index}` },
  }))
  story.config.merge.secret = 'PRIVATE_MERGE_EXTRA'
  story.sourceIds = ['PRIVATE_SOURCE_A', 'PRIVATE_SOURCE_B']
  story = accept(story, 0, { paragraphs: [
    'PRIVATE_A 与 PRIVATE_B 在纸鲸背上相遇。',
    'PRIVATE_HOME_0、PRIVATE_SCHOOL_0、PRIVATE_COMPANY_0、PRIVATE_ROLE_0、PRIVATE_FRIEND_0、PRIVATE_DESTINATION_0、PRIVATE_EXTRA_0。',
    'PRIVATE_HOME_1、PRIVATE_SCHOOL_1、PRIVATE_COMPANY_1、PRIVATE_ROLE_1、PRIVATE_FRIEND_1、PRIVATE_DESTINATION_1、PRIVATE_EXTRA_1。',
  ] })
  const before = JSON.stringify(story)
  const shared = publicSnapshot(story)
  assert.doesNotMatch(JSON.stringify(shared), /PRIVATE_/)
  assert.equal(shared.chapters[0].paragraphs[0], '旅者甲 与 旅者乙 在纸鲸背上相遇。')
  assert.deepEqual(shared.config.protagonists.map(person => person.name), ['旅者甲', '旅者乙'])
  assert.deepEqual(shared.config.sourceGenres, ['mist', 'cultivation'])
  assert.equal(shared.config.merge.secret, undefined)
  assert.equal(shared.config.protagonists[0].internal, undefined)
  assert.equal(JSON.stringify(story), before)
})

test('template snapshots also whitelist backup extras instead of leaking imported fields', () => {
  let story = accept(createStory(), 0)
  story = { ...story, id: 'PRIVATE_IMPORTED_ID', modelResponse: { secret: 'PRIVATE_PROVIDER_EXTRA' }, createdAt: 'PRIVATE_BAD_DATE', sourceIds: ['PRIVATE_SOURCE_ID'] }
  story.config.extra = 'PRIVATE_CONFIG_EXTRA'
  const shared = publicSnapshot(story)
  assert.doesNotMatch(JSON.stringify(shared), /PRIVATE_/)
  assert.deepEqual(shared.sourceIds, [])
})
