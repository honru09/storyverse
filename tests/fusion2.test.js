import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createMergedStory,
  createStory,
  finishEndlessLine,
  fusionProductModeFor,
  fusionSourceStateFor,
  isManuallyFinished,
  isStoryComplete,
  outlineLengthFor,
  plazaSnapshot,
  storyLengthModeOf,
  structureFor,
  totalChaptersFor,
} from '../src/story-engine.js'
import { mergeSourceContext } from '../src/generation.js'
import { plazaGateFor } from '../src/plaza.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import { parseRoute, routeHash } from '../src/navigation.js'
import {
  fusionCandidatesFor,
  fusionLineMetaFor,
  resolveFusionPreselect,
} from '../src/fusion.js'
import { createGeminiGenerator } from '../server/gemini.js'

// ---------------------------------------------------------------------------
// 合流·无限融合批： a serializing (endless, still running) line may fuse
// with any other eligible line and the product inherits the endless mode;
// finished × finished keeps the historical 6-chapter short cap. Sources
// are annotated, fusion products can never be sources again, and the
// contextual entries preselect the current line.
// ---------------------------------------------------------------------------

const accept = (story, index) => acceptChapter(story, buildChapter(story, index), chapterKey(story, index))
const withChapters = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) current = accept(current, index)
  return current
}
const finishedShort = (options = {}) => withChapters(createStory({ genreId: 'mist', ...options }), 6)
const finishedSeason = (options = {}) => withChapters(
  createStory({ genreId: 'mist', storyLengthMode: 'season', ...options }), 24,
)
const serializing = (options = {}, chapters = 3) => withChapters(
  createStory({ genreId: 'mist', storyLengthMode: 'endless', ...options }), chapters,
)

test('source states: only a still-running endless line counts as serializing', () => {
  assert.equal(fusionSourceStateFor(finishedShort()), 'finished')
  assert.equal(fusionSourceStateFor(finishedSeason()), 'finished')
  assert.equal(fusionSourceStateFor(serializing()), 'serializing')
  // A finite line that has not been walked to its end is still on the
  // finished side: its unwritten remainder does not carry over.
  assert.equal(fusionSourceStateFor(withChapters(createStory({ genreId: 'mist' }), 2)), 'finished')
  // An endless line the reader finished by hand is finished, not serializing.
  assert.equal(fusionSourceStateFor(finishEndlessLine(serializing())), 'finished')
})

test('the four-combination product-mode table is pinned', () => {
  const done = finishedShort()
  const live = serializing()
  assert.equal(fusionProductModeFor(done, done), 'short') // 完结 × 完结
  assert.equal(fusionProductModeFor(done, live), 'endless') // 完结 × 连载中
  assert.equal(fusionProductModeFor(live, done), 'endless') // 连载中 × 完结
  assert.equal(fusionProductModeFor(live, live), 'endless') // 连载中 × 连载中
  // A manually finished endless line no longer passes the mode on.
  assert.equal(fusionProductModeFor(finishEndlessLine(serializing()), done), 'short')
  assert.equal(fusionProductModeFor(serializing(), finishEndlessLine(serializing())), 'endless')

  const shortProduct = createMergedStory(done, finishedSeason())
  assert.equal(storyLengthModeOf(shortProduct), 'short')
  assert.equal(totalChaptersFor(shortProduct), 6)
  const endlessProduct = createMergedStory(done, live)
  assert.equal(storyLengthModeOf(endlessProduct), 'endless')
  assert.equal(totalChaptersFor(endlessProduct), Infinity)
})

test('fusion length is the reader’s choice; the table only decides when unchosen (owner ruling 2026-10-30)', () => {
  const a = finishedShort({ avatarId: 'avatar-a' })
  const b = finishedShort({ avatarId: 'avatar-b' })

  // Explicit season: mode + total follow the choice, not the table.
  const season = createMergedStory(a, b, { storyLengthMode: 'season' })
  assert.equal(storyLengthModeOf(season), 'season')
  assert.equal(season.config.storyLengthMode, 'season')
  assert.equal(totalChaptersFor(season), 24)
  // At the old short cap the season fusion is still mid-run: the gate
  // refuses it (合流 reason) and the snapshot throws.
  const atSix = { ...withChapters(season, 6), engine: 'gemini' }
  assert.equal(isStoryComplete(atSix), false)
  const sixGate = plazaGateFor(atSix)
  assert.equal(sixGate.publishable, false)
  assert.match(sixGate.reason, /合流/)
  assert.throws(() => plazaSnapshot(atSix), /合流故事还没走完/)
  // Walked to 24/24 it publishes as a finished line and snapshots clean.
  const done = { ...withChapters(season, 24), engine: 'gemini' }
  assert.equal(isStoryComplete(done), true)
  const doneGate = plazaGateFor(done)
  assert.equal(doneGate.publishable, true)
  assert.equal(doneGate.lineStatus, 'finished')
  const snapshot = plazaSnapshot(done)
  assert.equal(snapshot.merged, true)
  assert.equal(snapshot.storyLengthMode, 'season')
  assert.equal(snapshot.totalChapters, 24)
  assert.equal(snapshot.lineStatus, 'finished')
  assert.equal(snapshot.chapters.length, 24)
  // Library validation caps a fused line at its CHOSEN total: 7
  // chapters are legal for a season fusion (the old fused-short cap
  // was 6), and a 25th chapter is not.
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [withChapters(season, 7)] }), [])
  const over = withChapters(season, 24)
  const extra = { ...over.chapters[23], id: 'extra-chapter', index: 24 }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [{ ...over, chapters: [...over.chapters, extra] }] }).length > 0)

  // Explicit long / endless on finished × finished override the
  // table's short default.
  const long = createMergedStory(a, b, { storyLengthMode: 'long' })
  assert.equal(storyLengthModeOf(long), 'long')
  assert.equal(totalChaptersFor(long), 100)
  assert.equal(plazaGateFor(withChapters(long, 6)).publishable, false)
  const endless = createMergedStory(a, b, { storyLengthMode: 'endless' })
  assert.equal(storyLengthModeOf(endless), 'endless')
  assert.equal(totalChaptersFor(endless), Infinity)
  const endlessGate = plazaGateFor(withChapters(endless, 2))
  assert.equal(endlessGate.publishable, true)
  assert.equal(endlessGate.lineStatus, 'serializing')

  // No choice — and an invalid choice — fall back to the table.
  assert.equal(storyLengthModeOf(createMergedStory(a, b)), 'short')
  assert.equal(storyLengthModeOf(createMergedStory(a, b, { storyLengthMode: 'bogus' })), 'short')
  assert.equal(storyLengthModeOf(createMergedStory(serializing(), b, { storyLengthMode: 'bogus' })), 'endless')
  // An explicit short on a serialising pair also wins over the table.
  assert.equal(storyLengthModeOf(createMergedStory(serializing(), b, { storyLengthMode: 'short' })), 'short')
})

test('a fused line is named from its source books, never the genre templates (FINAL-FIX)', () => {
  const a = { ...finishedShort({ name: '阿澜' }), title: '雾港来信' }
  const b = { ...finishedShort({ name: '沈砚' }), title: '剑碑夜行' }
  const merged = createMergedStory(a, b)
  assert.equal(merged.title, '合流：雾港来信 × 剑碑夜行')
  assert.deepEqual(merged.sourceTitles, ['雾港来信', '剑碑夜行'], 'the provenance stays on the record')
  // Two sources sharing one title fall back to their leads so the
  // fused line still reads as its own book.
  const twin = createMergedStory(a, { ...b, title: '雾港来信' })
  assert.equal(twin.title, '合流：阿澜 × 沈砚')
  // Long source titles clip per side instead of swallowing the line.
  const long = createMergedStory(
    { ...a, title: '这是一个非常非常长的书名超过十二个字' },
    { ...b, title: '这也是一个非常非常长的书名超过十二字' },
  )
  assert.ok(long.title.length <= '合流：'.length + 13 + ' × '.length + 13)
})

test('an endless fusion product rolls on: rolling arcs, no finale, dual-avatar cast', () => {
  const a = serializing({
    name: '阿澜', ability: '听潮', avatarId: 'avatar-a', avatarAppearance: '银发，左颊泪痣',
  })
  const b = finishedShort({
    name: '沈砚', ability: '借火', avatarId: 'avatar-b', avatarAppearance: '黑衣，背负长剑',
  })
  const merged = createMergedStory(a, b, { rules: 'shared', lead: 'a', bond: 'allies' })
  assert.equal(storyLengthModeOf(merged), 'endless')
  assert.equal(merged.config.targetChapters, null)
  assert.equal(merged.config.storyLengthMode, 'endless')
  assert.equal(isManuallyFinished(merged), false)
  // Rolling structure: chapters 12 and 24 are arc climaxes, never finales.
  assert.equal(structureFor(merged, 11).isUpgradePoint, true)
  assert.equal(structureFor(merged, 11).upgradeKind, '小升格')
  assert.equal(structureFor(merged, 11).isFinale, false)
  assert.equal(structureFor(merged, 23).isUpgradePoint, true)
  assert.equal(structureFor(merged, 23).isFinale, false)
  assert.equal(structureFor(merged, 5).isFinale, false)
  assert.equal(outlineLengthFor(merged), 24)
  // Both avatars walk the fused line: ids and appearances both recorded.
  assert.deepEqual(merged.config.protagonists.map((person) => person.avatarId), ['avatar-a', 'avatar-b'])
  assert.deepEqual(
    merged.config.protagonists.map((person) => person.appearance),
    ['银发，左颊泪痣', '黑衣，背负长剑'],
  )
  // Provenance: ids for the machine, titles for the reader.
  assert.deepEqual(merged.derivedFrom, [a.id, b.id])
  assert.deepEqual(merged.sourceTitles, [a.title, b.title])
  // The product generates past the old 6-chapter merged ceiling.
  const grown = withChapters(merged, 8)
  assert.equal(grown.chapters.length, 8)
  assert.equal(isStoryComplete(grown), false)
  // And it can still be finished by hand under the existing rule.
  assert.equal(isManuallyFinished(finishEndlessLine(grown)), true)
})

test('fusion refuses self-fusion and second-generation fusion', () => {
  const a = serializing()
  const b = finishedShort()
  assert.throws(() => createMergedStory(a, a), /不能和自己合流/)
  const merged = createMergedStory(a, b)
  assert.throws(() => createMergedStory(merged, b), /不能再作合流的来源/)
  assert.throws(() => createMergedStory(b, merged), /不能再作合流的来源/)
  // The candidate list the pickers show applies the same guard.
  const readOnly = { ...finishedShort(), id: 'read-only-copy', readOnly: true }
  assert.deepEqual(
    fusionCandidatesFor([a, b, merged, readOnly]).map((story) => story.id),
    [a.id, b.id],
  )
})

test('merge context carries both avatar appearances and both open-foreshadowing ledgers', () => {
  const a = serializing({ avatarId: 'avatar-a', avatarAppearance: '银发，左颊泪痣' })
  a.chapters.forEach((chapter) => { chapter.foreshadowing = [] })
  a.chapters[0].foreshadowing = ['海底的钟声还没解释']
  const b = finishedShort({ avatarId: 'avatar-b', avatarAppearance: '黑衣，背负长剑' })
  b.chapters.forEach((chapter) => { chapter.foreshadowing = [] })
  b.chapters[2].foreshadowing = ['剑碑上的旧名']
  const contextA = mergeSourceContext(a)
  const contextB = mergeSourceContext(b)
  assert.equal(contextA.avatarId, 'avatar-a')
  assert.equal(contextA.avatarAppearance, '银发，左颊泪痣')
  assert.equal(contextB.avatarId, 'avatar-b')
  assert.equal(contextB.avatarAppearance, '黑衣，背负长剑')
  // The ledger is chapter-derived: every hook a source planted and has
  // not closed moves onto the fused line's books, with its chapter.
  assert.deepEqual(contextA.openForeshadowing, [{ chapter: 1, text: '海底的钟声还没解释' }])
  assert.deepEqual(contextB.openForeshadowing, [{ chapter: 3, text: '剑碑上的旧名' }])
})

test('gemini merge context ships the open foreshadowing of both sources', async () => {
  const env = { GEMINI_API_KEY: 'fusion2-test-key' }
  const prose = {
    title: '合流之后的第一章',
    paragraphs: [
      '两条河流在旧桥下汇合，阿澜听见海底的钟声又响了一次。',
      '沈砚的剑碑在雾里发烫，碑上的旧名像被水洗过一样浮了出来。',
      '他们都知道，有些账必须在新世界里继续算下去。',
    ],
    summary: '阿澜与沈砚在汇合处重逢，两条原线未收的线索同时浮现。',
  }
  const output = {
    ...prose,
    worldBible: {
      premise: '两条故事线汇合之后的世界，旧账与新局并存。',
      rules: ['汇合的世界保留两边各自的规则。', '未回收的伏笔必须逐步回收。', '双主角的行动互相影响。'],
      endingAnchor: '这条线没有预设终章，故事按一弧一弧往前推进。',
      outline: Array.from({ length: 24 }, (_, index) => `第${index + 1}章推进汇合后的世界。`),
    },
  }
  const response = (value) => new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
  }), { status: 200 })

  const a = serializing({ avatarId: 'avatar-a', avatarAppearance: '银发，左颊泪痣' })
  a.chapters.forEach((chapter) => { chapter.foreshadowing = [] })
  a.chapters[0].foreshadowing = ['海底的钟声还没解释']
  const b = finishedShort({ avatarId: 'avatar-b', avatarAppearance: '黑衣，背负长剑' })
  b.chapters.forEach((chapter) => { chapter.foreshadowing = [] })
  b.chapters[2].foreshadowing = ['剑碑上的旧名']
  const merged = createMergedStory(a, b)
  // The persisted line does not carry its merge context: the client
  // attaches both sources' contexts to the generation request, exactly
  // as the merge flow does.
  const requestStory = { ...merged, mergeContext: [mergeSourceContext(a), mergeSourceContext(b)] }
  let context
  const generator = createGeminiGenerator({
    env,
    fetchImpl: async (_url, options) => {
      context = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text)
      return response(output)
    },
  })
  await generator.generate({ story: requestStory, index: 0 })
  // FINAL-FIX (fusion item): a fused chapter is held to the same length
  // band as any solo chapter, stated inside the merged context itself —
  // the one measured fused chapter landed at ~1300 chars against the
  // 1600–1950 band while the instruction lived only in the global
  // system prompt.
  assert.match(context.chapterLengthDirective || '', /1600–1950/)
  assert.match(context.chapterLengthDirective || '', /1550/)
  assert.equal(context.sourceWorlds.length, 2)
  assert.deepEqual(context.sourceWorlds[0].openForeshadowing, [{ chapter: 1, text: '海底的钟声还没解释' }])
  assert.deepEqual(context.sourceWorlds[1].openForeshadowing, [{ chapter: 3, text: '剑碑上的旧名' }])
  assert.deepEqual(
    context.config.protagonists.map((person) => person.appearance),
    ['银发，左颊泪痣', '黑衣，背负长剑'],
  )
})

test('a serializing fused line publishes to the plaza as a live line', () => {
  const lead = serializing({ avatarId: 'avatar-a' })
  const partner = finishedShort({ avatarId: 'avatar-b' })
  const merged = createMergedStory(lead, partner)
  // No chapters yet: the live-publication gate still wants a first chapter.
  const empty = plazaGateFor(merged)
  assert.equal(empty.publishable, false)
  assert.match(empty.reason, /至少走完第一章/)
  const walked = withChapters(merged, 2)
  const gate = plazaGateFor(walked)
  assert.equal(gate.publishable, true)
  assert.equal(gate.lineStatus, 'serializing')
  // Finished by hand, the same line publishes as a finished line.
  const done = plazaGateFor(finishEndlessLine(walked))
  assert.equal(done.publishable, true)
  assert.equal(done.lineStatus, 'finished')
  // A fused short gates on completion (owner ruling 2026-10-30):
  // unfinished is refused with a 合流 reason; complete (6/6) publishes.
  const shortProduct = createMergedStory(finishedShort(), finishedShort())
  const shortRunning = plazaGateFor(withChapters(shortProduct, 3))
  assert.equal(shortRunning.publishable, false)
  assert.match(shortRunning.reason, /合流/)
  const shortGate = plazaGateFor(withChapters(shortProduct, 6))
  assert.equal(shortGate.publishable, true)
  assert.equal(shortGate.lineStatus, 'finished')
})

test('plaza snapshot of a fused endless line keeps provenance and drops private fields', () => {
  const lead = serializing({
    name: '阿澜',
    ability: '听潮',
    avatarId: 'avatar-a',
    trait: 'secret-trait-a',
  })
  const partner = finishedShort({ name: '沈砚', ability: '借火', avatarId: 'avatar-b' })
  const merged = { ...createMergedStory(lead, partner), engine: 'gemini' }
  const walked = withChapters(merged, 2)
  const snapshot = plazaSnapshot(walked)
  assert.equal(snapshot.merged, true)
  assert.equal(snapshot.storyLengthMode, 'endless')
  assert.equal(snapshot.lineStatus, 'serializing')
  // Provenance rides along for readers; the source ids never leave.
  assert.deepEqual(snapshot.sourceTitles, [lead.title, partner.title])
  assert.deepEqual(snapshot.config.merge.sourceTitles, [lead.title, partner.title])
  assert.deepEqual(snapshot.config.protagonists.map((person) => person.name), ['阿澜', '沈砚'])
  // The share-snapshot rule: avatar ids and appearances stay home, and
  // the entrant inherits the endless mode from the template.
  assert.ok(snapshot.config.protagonists.every((person) => !('avatarId' in person) && !('appearance' in person)))
  assert.equal(snapshot.enterTemplate.config.storyLengthMode, 'endless')
  assert.equal(snapshot.enterTemplate.config.targetChapters, null)
  const serialized = JSON.stringify(snapshot)
  assert.ok(!serialized.includes('secret-trait-a'))
  assert.ok(!serialized.includes('听潮'))
  assert.ok(!serialized.includes('avatar-a'))
  assert.ok(!serialized.includes('"derivedFrom"'))
  assert.ok(!serialized.includes(lead.id))
  assert.ok(!serialized.includes(partner.id))
  // A fused short snapshots only once complete (owner ruling
  // 2026-10-30): unfinished throws; complete (6/6) snapshots as a
  // finished fused line.
  const shortProduct = { ...createMergedStory(finishedShort(), finishedShort()), engine: 'gemini' }
  assert.throws(() => plazaSnapshot(withChapters(shortProduct, 3)), /合流故事还没走完，不能发布到广场/)
  const shortSnapshot = plazaSnapshot(withChapters(shortProduct, 6))
  assert.equal(shortSnapshot.merged, true)
  assert.equal(shortSnapshot.storyLengthMode, 'short')
  assert.equal(shortSnapshot.lineStatus, 'finished')
  assert.equal(shortSnapshot.chapters.length, 6)
})

test('library validation accepts a long fused endless line and caps fused shorts', () => {
  const merged = createMergedStory(serializing(), finishedShort())
  const grown = withChapters(merged, 15)
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [grown] }), [])
  const shortProduct = withChapters(createMergedStory(finishedShort(), finishedShort()), 6)
  const seventh = { ...shortProduct.chapters[5], id: 'seventh-chapter', index: 6 }
  const overLong = { ...shortProduct, chapters: [...shortProduct.chapters, seventh] }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [overLong] }).length > 0)
})

test('preselect resolution: shelf entries win, plaza entries resolve three ways', () => {
  const mine = serializing()
  const other = finishedShort()
  const entered = { ...finishedShort(), id: 'entered-line', config: { ...finishedShort().config, sourcePublicationId: 'pub-1' } }
  const stories = [mine, other, entered]

  // 书籍详情 / 书架： the current line becomes the source side.
  assert.deepEqual(
    resolveFusionPreselect({ stories, storyId: mine.id }),
    { sourceId: mine.id, partnerId: '', publicationId: '', pendingPublication: '' },
  )
  // 广场详情， already entered: the entered telling is the partner side.
  assert.deepEqual(
    resolveFusionPreselect({ stories, publicationId: 'pub-1' }),
    { sourceId: '', partnerId: 'entered-line', publicationId: 'pub-1', pendingPublication: '' },
  )
  // 广场详情， my own publication: my original line is the source side.
  assert.deepEqual(
    resolveFusionPreselect({ stories, publicationId: 'pub-2', mine: { [mine.id]: { id: 'pub-2' } } }),
    { sourceId: mine.id, partnerId: '', publicationId: 'pub-2', pendingPublication: '' },
  )
  // 广场详情， never entered and not mine: pending — enter it first.
  assert.deepEqual(
    resolveFusionPreselect({ stories, publicationId: 'pub-3' }),
    { sourceId: '', partnerId: '', publicationId: 'pub-3', pendingPublication: 'pub-3' },
  )
  // A fused line can never be preselected as a source.
  const fused = createMergedStory(mine, other)
  assert.equal(resolveFusionPreselect({ stories: [...stories, fused], storyId: fused.id }).sourceId, '')
  // No preselection at all.
  assert.deepEqual(
    resolveFusionPreselect({ stories }),
    { sourceId: '', partnerId: '', publicationId: '', pendingPublication: '' },
  )
})

test('merge routes round-trip both preselection shapes', () => {
  assert.deepEqual(parseRoute('#/merge/story-1'), { view: 'merge', id: 'story-1' })
  assert.deepEqual(
    parseRoute('#/merge/plaza:pub-9'),
    { view: 'merge', publicationId: 'pub-9' },
  )
  assert.equal(routeHash({ view: 'merge', id: 'story-1' }), '#/merge/story-1')
  assert.equal(routeHash({ view: 'merge', publicationId: 'pub-9' }), '#/merge/plaza%3Apub-9')
  assert.equal(routeHash({ view: 'merge' }), '#/merge')
  assert.deepEqual(parseRoute(routeHash({ view: 'merge', publicationId: 'pub-9' })), { view: 'merge', publicationId: 'pub-9' })
})

test('source card meta states the mode, progress and fusion state', () => {
  const live = fusionLineMetaFor(serializing({}, 5))
  assert.equal(live.modeLabel, '无限连载')
  assert.equal(live.progressLabel, '已走 5 章')
  assert.equal(live.stateLabel, '连载中')
  const done = fusionLineMetaFor(finishedSeason())
  assert.equal(done.modeLabel, '一季')
  assert.equal(done.progressLabel, '24 / 24 章')
  assert.equal(done.stateLabel, '已完结')
  const walking = fusionLineMetaFor(withChapters(createStory({ genreId: 'mist' }), 2))
  assert.equal(walking.stateLabel, '进行中')
  assert.equal(walking.progressLabel, '2 / 6 章')
})
