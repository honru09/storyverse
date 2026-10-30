// The plaza （广场）: avatar lines, published for other readers to
// read as written or to re-enter with their own avatar. This module is the
// shared vocabulary — the publish gate, display helpers and the shape of
// an "enter" draft — plus the client-side API. The server imports the pure
// parts so the gate a reader sees in the publish screen is exactly the
// gate the publish endpoint enforces.
//
// Product rules that live here and nowhere else:
// - A publishable line is a story an avatar actually walked (config
//   carries avatarId). Finite lines (season / long / custom) publish once
//   finished. An ENDLESS line publishes while still running — as a living
//   publication marked 连载中 whose content follows the line as new
//   chapters land, flipping to 完结 when the owner finishes it by hand —
//   but never at zero chapters. Short lines never publish. A fused
//   （合流） line publishes only when the fusion itself inherited endless
//   mode (FUSION2) — it then follows the endless rule exactly; a short
//   fused line never publishes.
// - Entering a line never touches the original: it seeds a brand-new local
//   story from the publication's sanitized world template, with the
//   entrant's own avatar as protagonist, and records where it came from
//   in config.sourcePublicationId. Generation then flows through the
//   ordinary chapter endpoint, so the cost meters to the entrant.
// - Moderation threshold: three distinct reporters auto-hide a line.

import {
  buildChapter,
  chapterTitleTextFor,
  CUSTOM_GENRE_ID,
  GENRES,
  genreFor,
  genreTemplateById,
  isManuallyFinished,
  isManualStory,
  isStoryComplete,
  manualChapterHasProse,
  manualTagsOf,
  storyLengthModeOf,
  totalChaptersFor,
  worldBibleFor,
} from './story-engine.js'
import { avatarAppearanceText } from './avatar.js'

export const PLAZA_REPORT_THRESHOLD = 3

/**
 * The pure book title (BOOKSTORE-PLAZA): a story's title is composed
 * at creation time as 「世界/题材 · 主角名」 when the creator never
 * typed a title of their own (story-engine's titleFor), so the avatar
 * name rides INSIDE the stored title — it is data, not a display-time
 * concatenation. A book's public title never carries that suffix: the
 * publish path cleans the snapshot title with this, and the one-time
 * migration cleans stored records with the same rule. Only the exact
 * trailing ` · <avatar name>` is cut — a title the owner deliberately
 * renamed keeps whatever it says.
 */
export function cleanBookTitle(title, avatarName) {
  const text = typeof title === 'string' ? title.trim() : ''
  const name = typeof avatarName === 'string' ? avatarName.trim() : ''
  if (text && name && text.endsWith(` · ${name}`)) {
    const cut = text.slice(0, text.length - name.length - 3).trim()
    if (cut) return cut
  }
  return text
}

const genreByWorldId = (id) => GENRES.find((genre) => genre.id === id) || null

/**
 * The snapshot-source guard (MIGRATION batch, DESIGN §27). plazaSnapshot
 * re-derives chapters with the local engine for any story not marked
 * engine:'gemini' — correct for genuine local stories (the snapshot is
 * the local engine's current rendering of them either way), but a
 * silent fabrication for a story that carries real externally-written
 * prose without the engine mark (the cold-start incident: a
 * server-driven season published as scaffold text). Two signals must
 * BOTH hold before the publish is stopped: the stored prose differs
 * from the local engine's own chapter (legacy local stories drift with
 * engine versions, so prose alone proves nothing), AND the story's
 * world bible is not the local template bible for its config (a model
 * wrote that bible). Returns the violation text, or '' when the source
 * is provable.
 */
export function snapshotSourceViolation(story) {
  if (!story || typeof story !== 'object' || story.engine === 'gemini') return ''
  const chapters = Array.isArray(story.chapters) ? story.chapters : []
  let proseDiffers = false
  for (let position = 0; position < chapters.length; position += 1) {
    const chapter = chapters[position]
    const prose = (Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : [])
      .filter((paragraph) => typeof paragraph === 'string')
      .join('\n')
      .trim()
    if (!prose) continue
    let local = ''
    try {
      const index = Number.isInteger(chapter?.index) ? chapter.index : position
      local = (buildChapter(story, index).paragraphs || []).join('\n').trim()
    } catch { local = '' }
    if (prose !== local) { proseDiffers = true; break }
  }
  if (!proseDiffers) return ''
  let bibleIsLocalTemplate = false
  try {
    const genre = genreFor(story.genreId || story.config?.genreId)
    const template = worldBibleFor(genre, story.config)
    const bible = story.worldBible || {}
    bibleIsLocalTemplate = bible.premise === template.premise
      && bible.endingAnchor === template.endingAnchor
      && JSON.stringify(bible.rules || []) === JSON.stringify(template.rules || [])
      && JSON.stringify(bible.outline || []) === JSON.stringify(template.outline || [])
  } catch { bibleIsLocalTemplate = false }
  if (bibleIsLocalTemplate) return ''
  return '这条故事线缺少生成来源标记，正文来源无法确认，已拦下发布（避免把错误正文发到广场）。请在生成它的设备上重新打开这条线后再发布。'
}

/** The publish gate, identical on the publish screen and the server. */
export function plazaGateFor(story) {
  if (!story || typeof story !== 'object') return { publishable: false, reason: '故事不存在。', lineStatus: 'finished' }
  // 自己写 (WRITE-MODE §50): a hand-written book has no avatar journey
  // to prove and no designed total to finish — its one gate is that at
  // least one chapter is actually written. While the author keeps
  // writing it shelves as 连载中； once they finish it by hand it
  // shelves as finished. The avatar rule below never applies to it.
  if (isManualStory(story)) {
    const written = (Array.isArray(story.chapters) ? story.chapters : []).filter(manualChapterHasProse).length
    if (written < 1) {
      return { publishable: false, reason: '至少写完一章，才能把这本书上架。', lineStatus: 'serializing' }
    }
    return { publishable: true, reason: '', lineStatus: isManuallyFinished(story) ? 'finished' : 'serializing' }
  }
  // A short fused line never publishes. A fused line that inherited
  // endless mode falls through to the ordinary endless rule below (the
  // avatar check and the ≥1-chapter floor included).
  if (story.kind === 'merged' && storyLengthModeOf(story) !== 'endless') {
    return { publishable: false, reason: '合流故事不能发布到广场。', lineStatus: 'finished' }
  }
  if (typeof story.config?.avatarId !== 'string' || !story.config.avatarId) {
    // needsAvatar marks the ONE gate refusal with a remedy
    // (bringAvatarIntoStory): surfaces key on the flag, never on the
    // human wording of the reason (FINAL-FIX R-06).
    return { publishable: false, reason: '只有用化身走完的故事线才能发布。', lineStatus: 'finished', needsAvatar: true }
  }
  const mode = storyLengthModeOf(story)
  if (mode === 'endless') {
    // The one gate an endless line can fail (besides avatar/merged):
    // nothing to read yet. Any reached chapter count publishes, running
    // or hand-finished.
    const chapters = Array.isArray(story.chapters) ? story.chapters.length : 0
    if (chapters < 1) {
      return { publishable: false, reason: '至少走完第一章，才能把连载中的线放到广场。', lineStatus: 'serializing' }
    }
    return { publishable: true, reason: '', lineStatus: isManuallyFinished(story) ? 'finished' : 'serializing' }
  }
  if (mode !== 'season' && mode !== 'long' && mode !== 'custom') {
    return { publishable: false, reason: '只有一季、长线、自定义篇幅或无限连载的故事线才能发布。', lineStatus: 'finished' }
  }
  if (!isStoryComplete(story)) {
    const reason = mode === 'season'
      ? '这一季还没走完，完结后才能发布。'
      : mode === 'long'
        ? '这条长线还没走完，完结后才能发布。'
        : '这条线还没走完，完结后才能发布。'
    return { publishable: false, reason, lineStatus: 'finished' }
  }
  return { publishable: true, reason: '', lineStatus: 'finished' }
}

/**
 * Bringing an avatar into a finished line (FINAL-FIX R-06). The
 * publish gate asks for a carried avatar, and until now a line forged
 * without one was a dead end: the gate said no, and nothing anywhere
 * offered the remedy. This is the remedy — the chosen avatar becomes
 * the line's carried companion (the same two config fields the forge
 * and the plaza entry write), so the gate re-reads clean. Lines that
 * already carry one, read-only lines, fused lines (their cast is
 * fixed at the merge) and hand-written books (a different shelf
 * contract) are refused by returning the story untouched.
 */
export function bringAvatarIntoStory(story, avatar) {
  if (!story || !avatar?.id) return story
  if (story.readOnly || story.kind === 'merged' || story.creationMode === 'manual') return story
  if (story.config?.avatarId) return story
  return {
    ...story,
    config: {
      ...story.config,
      avatarId: avatar.id,
      avatarAppearance: avatarAppearanceText(avatar),
    },
    updatedAt: new Date().toISOString(),
  }
}

/**
 * The public snapshot of a hand-written book (WRITE-MODE §50). Unlike an
 * avatar line there is nothing to desensitise: the author wrote every
 * word for readers, so the snapshot carries the prose verbatim and the
 * author's own introduction as the book's synopsis — the red-line scan
 * on the server is the only gate, and it runs over the same fields it
 * scans for any line. Only chapters with real prose are shelved (an
 * untouched draft chapter stays home), re-indexed so the published
 * book reads 1..N with no gaps. There is deliberately NO enterTemplate:
 * nobody can bring an avatar into a hand-written book or fuse with it.
 */
export function manualSnapshotFor(story) {
  const written = (Array.isArray(story?.chapters) ? story.chapters : []).filter(manualChapterHasProse)
  const chapters = written.map((chapter, index) => ({
    id: `${story.id}:chapter:${index}:manual`,
    index,
    title: chapter.title,
    paragraphs: (Array.isArray(chapter.paragraphs) ? chapter.paragraphs : []).filter((paragraph) => typeof paragraph === 'string'),
    summary: '',
    choice: null,
    events: [],
    foreshadowing: [],
  }))
  const synopsis = typeof story?.synopsis === 'string' && story.synopsis.trim()
    ? story.synopsis.trim()
    : (typeof story?.worldBible?.premise === 'string' ? story.worldBible.premise.trim() : '')
  return {
    title: story.title,
    ...(synopsis ? { synopsis } : {}),
    manual: true,
    genreId: CUSTOM_GENRE_ID,
    genreTemplateId: '',
    worldName: '',
    storyLengthMode: 'endless',
    seasonNumber: 1,
    totalChapters: chapters.length,
    lineStatus: isManuallyFinished(story) ? 'finished' : 'serializing',
    config: {
      genreId: CUSTOM_GENRE_ID,
      storyLengthMode: 'endless',
      manualShelfId: typeof story?.config?.manualShelfId === 'string' ? story.config.manualShelfId : '',
      tags: manualTagsOf(story),
    },
    worldBible: { premise: synopsis, rules: [], endingAnchor: '', outline: [] },
    chapters,
    choices: {},
    beats: chapters.map((chapter, index) => ({ chapter: index + 1, title: chapter.title, summary: '', events: [] })),
    engine: 'manual',
  }
}

/** The world's display name for a story or a publication-shaped object. */
export function plazaWorldNameFor(source) {
  if (!source || typeof source !== 'object') return ''
  if (typeof source.worldName === 'string' && source.worldName) return source.worldName
  const genreId = source.genreId || source.config?.genreId || ''
  if (genreId === CUSTOM_GENRE_ID) {
    const custom = typeof source.config?.customWorldName === 'string' ? source.config.customWorldName.trim() : ''
    return custom || '未命名世界'
  }
  return genreByWorldId(genreId)?.world || ''
}

/** The craft （题材） display name for a story or publication. */
export function plazaTemplateNameFor(source) {
  const id = source?.genreTemplateId || source?.config?.genreTemplateId || ''
  return genreTemplateById(id)?.name || ''
}

// The premise a plaza detail may print (PERSONA-QA N-04): the raw
// desensitised premise stands when it reads whole; when redaction
// placeholders survive inside it — or it is empty — the panel falls
// back to a composed introduction built only from public fields, so
// the surface never shows a sentence with holes punched in it.
export const REDACTION_PLACEHOLDERS = ['已隐去的设定', '某处目的地', '某所学校', '某个组织', '某种职业', '一位故人']
export function plazaPublicPremise(detail, templateName = '') {
  const raw = typeof detail?.worldBible?.premise === 'string' ? detail.worldBible.premise.trim() : ''
  if (raw && !REDACTION_PLACEHOLDERS.some((marker) => raw.includes(marker))) return raw
  const world = detail?.worldName || '这个世界'
  const avatarName = detail?.avatar?.name || '主角'
  const kind = templateName ? `${templateName}的世界` : '一个完整的世界'
  return `${world}——${kind}。${avatarName}在这里走完了整条故事线；更完整的世界设定是作者的私有底稿，不随发布公开，留在这里的只有这条已经真实发生的故事。`
}

/**
 * The public world introduction (DEDUP-FIX §40 ④): the detail page's
 * 世界设定 used to print the raw snapshot premise — engine-assembled
 * prose that could open with the book's TITLE stuffed in as the
 * sentence subject ("《疯狂的王兴润》是一个…世界") and leak engine
 * vocabulary (资产与负债 / 因果账目制约）. The public form is now a
 * composed outline in plain words, three parts — 世界背景 / 核心规则 /
 * 主角与主线 — built ONLY from fields that are already public on the
 * detail payload:
 *
 *  - background: the world name + craft, plus the premise's own
 *    world-describing sentences once title-subject stuffing and
 *    engine-term sentences are cut;
 *  - rules: the snapshot's rules with engine-vocabulary entries
 *    filtered out (the redaction boundary does not move — these were
 *    already the desensitised snapshot's rules);
 *  - thread: the protagonist and the PUBLISHED beats only. The
 *    bible's endingAnchor and outline are never read here: both
 *    describe where the story has not gone yet, and printing them
 *    would leak the unpublished future.
 *
 * Pure and total: any detail-shaped object yields a printable
 * outline, so the one-time refresh script can bake the same text
 * into stored publications.
 */
export const WORLD_INTRO_VERSION = 2
const WORLD_INTRO_ENGINE_TERMS = ['资产与负债', '因果账目', '制约', '稳定度', '数值', '参数', '提示词', '回合制', '账目制', '世界线扰动值']
export function plazaWorldIntroFor(detail, templateName = '') {
  const world = detail?.worldName || '这个世界'
  const avatarName = detail?.avatar?.name || '主角'
  const title = typeof detail?.title === 'string' ? detail.title.trim() : ''
  const rawPremise = typeof detail?.worldBible?.premise === 'string' ? detail.worldBible.premise.trim() : ''
  const sentences = rawPremise
    .split(/(?<=[。；;])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((sentence) => !(title && sentence.startsWith(title)))
    .filter((sentence) => !REDACTION_PLACEHOLDERS.some((marker) => sentence.includes(marker)))
    .filter((sentence) => !WORLD_INTRO_ENGINE_TERMS.some((term) => sentence.includes(term)))
  const backgroundBody = sentences.slice(0, 2).join('')
  // When every premise sentence was filtered out (title-subject
  // stuffing, engine terms), the background used to be the bare
  // template sentence and nothing else — a label, not an introduction
  // (FINAL-FIX N7, the official book's own page). The world's own
  // catalogue description is the honest fallback: it is what the
  // forge shows when the reader picks this world.
  const worldDescription = !backgroundBody
    ? (genreFor(detail?.genreId)?.description || '').trim()
    : ''
  const background = `「${world}」——${templateName ? `${templateName}题材的世界` : '一个自成一体的世界'}。`
    + (backgroundBody && !backgroundBody.startsWith(`「${world}」`) ? backgroundBody : '')
    + (worldDescription && !worldDescription.startsWith(`「${world}」`) ? worldDescription : '')

  const rules = (Array.isArray(detail?.worldBible?.rules) ? detail.worldBible.rules : [])
    .filter((rule) => typeof rule === 'string' && rule.trim())
    .map((rule) => rule.trim())
    .filter((rule) => !REDACTION_PLACEHOLDERS.some((marker) => rule.includes(marker)))
    .filter((rule) => !WORLD_INTRO_ENGINE_TERMS.some((term) => rule.includes(term)))
    .slice(0, 3)

  const synopsis = typeof detail?.synopsis === 'string' ? detail.synopsis.trim() : ''
  // Bare-number beat titles (an early generation artifact) are not
  // titles at all — the composed thread must never say 故事从「3」开始.
  const beats = Array.isArray(detail?.beats) ? detail.beats.filter((beat) => beat && chapterTitleTextFor(beat.title)) : []
  const status = plazaLineStatusFor(detail)
  const count = Number(detail?.chapterCount) || beats.length
  let thread
  if (synopsis) {
    thread = synopsis
  } else {
    const journey = beats.length
      ? `故事从「${beats[0].title}」开始${beats.length > 1 ? `，一路走到「${beats[beats.length - 1].title}」` : ''}。`
      : ''
    const progress = status === 'serializing'
      ? `这条线还在连载，已更新到第 ${count} 章。`
      : `这条线已经完结，全 ${count} 章。`
    // The avatar's appearance string never joins this sentence
    // (FINAL-FIX N7): 「沈知遥——乌黑，长直发，长风衣…，是这个世界的主角」
    // welded a spec sheet into the introduction. The look lives on
    // the detail page's avatar panel; the thread names the person.
    thread = `${avatarName}是这个世界的主角。${journey}${progress}`
  }
  return { background, rules, thread }
}

/**
 * The one introduction line a plaza card shows under its byline
 * (COVER-FIX): the author's own synopsis first — it is the book's
 * real blurb. Without one, the world intro's thread segment, composed
 * WITHOUT the avatar's appearance string (an attribute list is a spec
 * sheet, not an introduction; it lives on the detail page's avatar
 * panel) and with the progress tail trimmed (the card's meta row
 * already carries status and chapter count). '' when there is
 * nothing honest to show — never an attribute string standing in
 * for an introduction.
 */
export function plazaCardIntroFor(detail) {
  const synopsis = typeof detail?.synopsis === 'string' ? detail.synopsis.trim() : ''
  if (synopsis) return synopsis
  const intro = plazaWorldIntroFor({
    ...detail,
    avatar: { name: typeof detail?.avatar?.name === 'string' ? detail.avatar.name : '' },
  })
  return intro.thread
    .replace(/这条线(还在连载，已更新到第 \d+ 章|已经完结，全 \d+ 章)。$/, '')
    .trim()
}

/* ————————————————————————————————————————————————————————————————
 * DEVICE-FIX3 §54: card text budgets. The rule the owner set is
 * spec-first — every string a card can show has a budget fixed by
 * its longest reachable form, the layout is built so the budget
 * always fits whole, and over-long input is capped where it is
 * written. Nothing on a card may be rescued by an ellipsis.
 * Budgets are counted in wide units: a CJK / fullwidth glyph is 2
 * units, anything else 1 (a unit ≈ half an em at the slot's size).
 * ———————————————————————————————————————————————————————————————— */

/** Wide-unit width of a string (CJK/fullwidth = 2, else 1). */
export function textUnitsFor(value) {
  let units = 0
  for (const ch of String(value ?? '')) {
    units += /[ᄀ-ᅟ⺀-꓏가-힣豈-﷏︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1
  }
  return units
}

/** Longest whole-character prefix within a wide-unit budget. Never splits a character, never adds an ellipsis. */
export function clipToUnits(value, budget) {
  const text = String(value ?? '')
  let units = 0
  let out = ''
  for (const ch of text) {
    const next = units + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﷏︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1)
    if (next > budget) break
    units = next
    out += ch
  }
  return out
}

/** §54 count format: plain digits below 10k, 万 with at most one decimal at and above it ('1.2万', '12万'). */
export function countTextFor(count) {
  const n = Number.isInteger(count) && count > 0 ? count : 0
  if (n < 10000) return String(n)
  const wan = n / 10000
  return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`
}

const SENTENCE_BREAKS = '。；！？.;!?'
const CLAUSE_BREAKS = '，,'

/**
 * The store card's intro slot (§54): the intro text, whole, when it
 * fits the budget (40 units = the slot's two lines at the narrowest
 * supported card width, 20 units per line at 13px in a 132px slot);
 * otherwise the longest prefix inside the budget that ends at a
 * sentence break (。；！？), or failing that at a comma — a complete
 * statement, never a mid-word cut and never an ellipsis. Colons and
 * enumeration commas never terminate an excerpt: '摆渡人雾生的手记：'
 * alone in the slot reads as a fragment, which is worse than the
 * documented fallback — a whole-character clip at the budget (no
 * partial glyph, no ellipsis) for texts with no usable break.
 */
export function cardIntroExcerptFor(detail, budgetUnits = 40) {
  const full = plazaCardIntroFor(detail)
  if (!full) return ''
  if (textUnitsFor(full) <= budgetUnits) return full
  let sentenceBest = ''
  let clauseBest = ''
  let units = 0
  let current = ''
  for (const ch of full) {
    const next = units + (/[ᄀ-ᅟ⺀-꓏가-힣︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1)
    if (next > budgetUnits) break
    units = next
    current += ch
    if (SENTENCE_BREAKS.includes(ch)) sentenceBest = current
    else if (CLAUSE_BREAKS.includes(ch)) clauseBest = current
  }
  return sentenceBest || clauseBest || clipToUnits(full, budgetUnits)
}

/** The line's publication status: a running endless line serialises; everything else is finished. */
export function plazaLineStatusFor(source) {
  if (source?.lineStatus === 'serializing' || source?.lineStatus === 'finished') return source.lineStatus
  return storyLengthModeOf(source) === 'endless' && !isManuallyFinished(source) ? 'serializing' : 'finished'
}

/**
 * Cover-title size tier (LOGIN-SKY addendum, user wording: a book
 * title laid over a cover NEVER wraps — 「拒绝出现这种换行」). The
 * rendered string is 《title》 on one line: short titles keep the
 * surface's full size (lg), longer ones step down (md, then sm),
 * and past the smallest tier the CSS ellipsis takes the tail.
 * Length counts the title's own characters (code points).
 */
export function plazaTitleTierFor(title) {
  const length = [...String(title ?? '')].length
  // Widened one step (FINAL-FIX, designer N6): on a 390px phone the
  // two-column store cover leaves ~137px of text width, and at the old
  // lg size a six-character title already overflowed into an ellipsis
  // — the single-line rule held, but ordinary titles paid for it. The
  // tiers and the cover sizes moved together (16.5/14/12px, 12px
  // insets on store covers): lg now covers ≤10 chars, md ≤18.
  if (length <= 10) return 'lg'
  if (length <= 18) return 'md'
  return 'sm'
}

/**
 * The length line for a story or publication: 「第 1 季 · 全 24 章」/
 * 「长线 · 全 100 章」/「全 37 章」 for finished lines — real fields only —
 * and 「连载中 · 已更 N 章」 for a living endless publication, where N is
 * the count it has actually reached.
 */
export function plazaLengthLabel(source) {
  const mode = source?.storyLengthMode || storyLengthModeOf(source)
  if (mode === 'endless') {
    const reached = Number.isInteger(source?.chapterCount)
      ? source.chapterCount
      : Array.isArray(source?.chapters) ? source.chapters.length : 0
    return plazaLineStatusFor(source) === 'serializing' ? `连载中 · 已更 ${reached} 章` : `全 ${reached} 章`
  }
  const total = Number.isInteger(source?.totalChapters) ? source.totalChapters : totalChaptersFor(source)
  if (mode === 'long') return `长线 · 全 ${total} 章`
  if (mode === 'season') {
    const season = Number.isInteger(source?.seasonNumber)
      ? source.seasonNumber
      : Number.isInteger(source?.config?.seasonNumber) ? source.config.seasonNumber : 1
    return `第 ${season} 季 · 全 ${total} 章`
  }
  return `全 ${total} 章`
}

/**
 * The draft an entrant's new story is created from: the publication's
 * world template (world, craft, length, god-mode setting) plus the
 * entrant's own avatar and the picks they made on the enter screen
 * (identity, spawn point, ability). story-engine's createStory consumes
 * exactly this shape.
 */
export function enterDraftFor(detail, { avatar, identityId = '', startPointName = '', startPointHook = '', ability = '' } = {}) {
  const template = detail?.enterTemplate?.config || {}
  return {
    genreId: template.genreId || detail?.genreId || 'mist',
    genreTemplateId: template.genreTemplateId || detail?.genreTemplateId || '',
    storyLengthMode: template.storyLengthMode || detail?.storyLengthMode || 'season',
    targetChapters: Number.isInteger(template.targetChapters) ? template.targetChapters : null,
    seasonNumber: Number.isInteger(template.seasonNumber) ? template.seasonNumber : 1,
    customWorldName: template.customWorldName || '',
    customWorldSetting: template.customWorldSetting || '',
    originIdentityId: identityId || '',
    startPointName: startPointName || '',
    startPointHook: startPointHook || '',
    avatarId: avatar?.id || '',
    avatarAppearance: avatar ? avatarAppearanceText(avatar) : '',
    name: avatar?.name || '',
    trait: '冷静观察者',
    origin: '',
    ability: ability || '',
    tone: '诗性冒险',
    sourcePublicationId: detail?.id || '',
    // Bookkeeping only: the entrant's story is created directly from this
    // draft (no forge pass), the step just records how far the equivalent
    // start flow had been walked — protagonist and ability confirmed.
    step: 4,
  }
}

/**
 * The fused book's detail-page sources (REQ-53). The server resolves
 * each entry's state live ('live' | 'gone' | 'own'); this helper is the
 * client-side floor for details that arrive WITHOUT a resolved list —
 * older servers, offline caches, pre-REQ-53 payloads: entries rebuild
 * from the detail's own fields (detail.sources when present but plain,
 * else sourceTitles + the snapshot's per-source genres). An entry whose
 * publication is still on the shelf renders as a link; without a state
 * the client cannot know a source went down, so plain entries with an
 * id arrive as 'live' links and id-less ones as display-only 'listed'
 * rows — never a dead link, never a blank section.
 */
export function detailSourcesFor(detail) {
  if (!detail || detail.merged !== true) return []
  const genres = Array.isArray(detail.snapshot?.config?.sourceGenres) ? detail.snapshot.config.sourceGenres : []
  const listed = Array.isArray(detail.sources) && detail.sources.length
    ? detail.sources
    : (Array.isArray(detail.sourceTitles) ? detail.sourceTitles : []).map((title, index) => ({
      publicationId: '',
      title,
      authorName: '',
      authorHandle: '',
      genreId: genres[index] || '',
      coverUrl: null,
      state: 'listed',
    }))
  return listed.slice(0, 10).map((entry, index) => ({
    publicationId: typeof entry?.publicationId === 'string' ? entry.publicationId : '',
    title: typeof entry?.title === 'string' && entry.title ? entry.title : '未命名故事',
    authorName: typeof entry?.authorName === 'string' ? entry.authorName : '',
    authorHandle: typeof entry?.authorHandle === 'string' ? entry.authorHandle : '',
    genreId: typeof entry?.genreId === 'string' && entry.genreId ? entry.genreId : (genres[index] || ''),
    coverUrl: typeof entry?.coverUrl === 'string' && entry.coverUrl ? entry.coverUrl : null,
    state: ['live', 'gone', 'own', 'listed'].includes(entry?.state) ? entry.state : (entry?.publicationId ? 'live' : 'listed'),
  })).filter((entry) => entry.title)
}

/**
 * The read-only story the reader opens for 读原作线： the publication's
 * sanitized snapshot, shaped exactly like a local story. The author's
 * choices ride along in `choices`, so the reader sees the path that was
 * actually taken; nothing here can generate or be edited.
 */
export function plazaReaderStory(detail) {
  const snapshot = detail?.snapshot
  if (!snapshot || !Array.isArray(snapshot.chapters)) return null
  return {
    id: `plaza-line-${detail.id}`,
    title: detail.title || '',
    genreId: detail.genreId || snapshot.config?.genreId || '',
    ...(detail.genreTemplateId ? { genreTemplateId: detail.genreTemplateId } : {}),
    ...(snapshot.engine ? { engine: snapshot.engine } : {}),
    // A hand-written book reads as what it is (WRITE-MODE §50): the mark
    // keeps every generation/repair path away from its chapters.
    ...(detail.manual ? { creationMode: 'manual' } : {}),
    // A published fused line reads as what it is — a merged line whose
    // cast is every source's lead — and carries its source titles and
    // the resolved sources list for the provenance label and the
    // reader's sources block; the local story ids never leave the server.
    kind: detail.merged ? 'merged' : 'solo',
    ...(detail.merged && Array.isArray(detail.sourceTitles) ? { sourceTitles: detail.sourceTitles } : {}),
    ...(detail.merged ? { sources: detailSourcesFor(detail) } : {}),
    config: snapshot.config || {},
    worldBible: snapshot.worldBible || { premise: '', rules: [], endingAnchor: '', outline: [] },
    chapters: snapshot.chapters,
    choices: snapshot.choices || {},
    revision: 0,
    chapterIndex: Math.max(0, snapshot.chapters.length - 1),
    readOnly: true,
    readerIndex: 0,
    author: detail.authorName || '',
    createdAt: detail.publishedAt || '',
    updatedAt: detail.publishedAt || '',
    bookmarked: false,
    sourceIds: [],
  }
}

// ---- Own publications (this device's memory of what I published) ---------
//
// The server is the source of truth for status; this small local map only
// lets the UI recognise "mine" (feed badge, withdraw instead of report)
// without an extra round-trip. It is keyed by the local story id.

const PLAZA_MINE_KEY = 'storyweave.plaza-mine'

function mineStore(storage) {
  try {
    const resolved = storage || globalThis.localStorage
    if (!resolved) return null
    return {
      read: () => resolved.getItem(PLAZA_MINE_KEY),
      write: (value) => resolved.setItem(PLAZA_MINE_KEY, value),
    }
  } catch { return null }
}

export function plazaMine(storage) {
  const store = mineStore(storage)
  if (!store) return {}
  try {
    const parsed = JSON.parse(store.read() || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

export function plazaMineRemember(storage, storyId, entry) {
  if (typeof storyId !== 'string' || !storyId || !entry?.id) return plazaMine(storage)
  const next = { ...plazaMine(storage), [storyId]: { id: entry.id, publishedAt: entry.publishedAt || '' } }
  const store = mineStore(storage)
  try { store?.write(JSON.stringify(next)) } catch { /* recognition is best-effort */ }
  return next
}

export function plazaMineForget(storage, publicationId) {
  const mine = plazaMine(storage)
  const next = Object.fromEntries(Object.entries(mine).filter(([, entry]) => entry?.id !== publicationId))
  const store = mineStore(storage)
  try { store?.write(JSON.stringify(next)) } catch { /* best-effort */ }
  return next
}

export function plazaMineIds(storage) {
  return new Set(Object.values(plazaMine(storage)).map((entry) => entry?.id).filter(Boolean))
}

// ---- Client API -----------------------------------------------------------

function plazaError(response, result) {
  if (response.status === 401 || result?.code === 'auth-required') {
    return Object.assign(new Error('请先登录，再使用广场。'), { code: 'auth-required' })
  }
  if (response.status === 404) return Object.assign(new Error('这条故事线已下架或不存在。'), { code: 'not-found' })
  if (response.status === 503) return new Error('广场服务还没开通，过段时间再试。')
  if (result?.error && response.status === 400) return new Error(result.error)
  return new Error('广场暂时没能打开，请稍后再试。')
}

async function plazaHeaders(getAccessToken) {
  const headers = {}
  if (getAccessToken) {
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* no credential; the server decides */ }
  }
  return headers
}

async function plazaJson(response) {
  let result = null
  try { result = await response.json() } catch { /* mapped by caller */ }
  if (!response.ok) throw plazaError(response, result)
  return result
}

/**
 * The bookstore list (BOOKSTORE-PLAZA): publishing a line now means
 * shelving it in the bookstore — the formal catalogue with family
 * shelves, honest rankings and search. `sort` is 'latest' | 'hot' |
 * 'complete', all computed from real fields server-side.
 */
export async function fetchStoreBooks({ shelfId = '', sort = 'latest', q = '', limit = 50, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams()
  if (shelfId) params.set('shelf', shelfId)
  if (sort && sort !== 'latest') params.set('sort', sort)
  if (q) params.set('q', q)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  const response = await fetchImpl(`/api/store${query ? `?${query}` : ''}`)
  const result = await plazaJson(response)
  return {
    books: Array.isArray(result?.books) ? result.books : [],
    total: Number.isInteger(result?.total) ? result.total : 0,
  }
}

/** One book's detail: summary + sanitized bible, beats, read copy and enter template. */
export async function fetchStoreDetail({ id, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`/api/store/${encodeURIComponent(id)}`)
  const result = await plazaJson(response)
  return result?.book ?? null
}

/** Pre-BOOKSTORE-PLAZA name for the book detail fetch; same endpoint family. */
export const fetchPlazaDetail = fetchStoreDetail

/** Publish one of my avatar lines (finished, or a living endless publication) — onto the bookstore shelf. The server re-checks everything. */
export async function publishToStore({ story, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/store/publish', {
    method: 'POST', headers, body: JSON.stringify({ story }),
  })
  const result = await plazaJson(response)
  return result?.book ?? result?.publication ?? null
}

/** Pre-BOOKSTORE-PLAZA name for the publish call; same endpoint family. */
export const publishToPlaza = publishToStore

/** Report a book. One report per reader; three readers auto-hide it. */
export async function reportPublication({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/store/${encodeURIComponent(id)}/report`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

/** Withdraw my own book from the bookstore. The local original is never touched. */
export async function withdrawPublication({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/store/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

/**
 * Record one read of a shelved book (READ-COUNT, REQ-42): fired as
 * the book's text opens in the reader. The server owns the counting
 * rule (signed-in, not the author, once per reader per book per
 * day); callers treat this as fire-and-forget — a failed or refused
 * record must never surface in the reading experience.
 */
export async function recordPlazaRead({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/store/${encodeURIComponent(id)}/read`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

// ---- Plaza posts (the social feed) --------------------------------------
//
// The plaza itself is now a social timeline: free-text posts and
// book-share posts in one reverse-chronological stream. These calls
// mirror the server contract in server/plaza-feed.js — likes and
// comments included; deleting a post never touches the book it shared.

/** The public post timeline, newest first, cursor-paginated. A token adds the viewer's own like state. */
export async function fetchPlazaPosts({ getAccessToken, cursor = '', limit = 20, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  const headers = await plazaHeaders(getAccessToken)
  const response = await fetchImpl(`/api/plaza${query ? `?${query}` : ''}`, { headers })
  const result = await plazaJson(response)
  return {
    posts: Array.isArray(result?.posts) ? result.posts : [],
    nextCursor: typeof result?.nextCursor === 'string' ? result.nextCursor : null,
    onlineCount: Number.isInteger(result?.onlineCount) ? result.onlineCount : 0,
  }
}

/** One post on its own (permalink target): body, author, embedded book card, like state. */
export async function fetchPlazaPost({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await plazaHeaders(getAccessToken)
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(id)}`, { headers })
  const result = await plazaJson(response)
  return result?.post ?? null
}

/** Post to the plaza: a free-text post, or a share of a bookstore book with my own words on it. */
export async function createPlazaPost({ type, content, bookId, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/plaza/posts', {
    method: 'POST',
    headers,
    body: JSON.stringify({ type, content, ...(bookId ? { bookId } : {}) }),
  })
  const result = await plazaJson(response)
  return result?.post ?? null
}

/** Delete my own post. The book it shared stays on the bookstore shelf. */
export async function deletePlazaPost({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(id)}`, { method: 'DELETE', headers })
  return plazaJson(response)
}

/** Like / unlike toggle on a post. */
export async function togglePlazaPostLike({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(id)}/like`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

/** Report a post. One report per reader; three readers auto-hide it. */
export async function reportPlazaPost({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(id)}/report`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

/** A post's flat comment thread, oldest first. */
export async function fetchPostComments({ postId, cursor = '', limit = 50, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(postId)}/comments${query ? `?${query}` : ''}`)
  const result = await plazaJson(response)
  return {
    comments: Array.isArray(result?.comments) ? result.comments : [],
    nextCursor: typeof result?.nextCursor === 'string' ? result.nextCursor : null,
    total: Number.isInteger(result?.total) ? result.total : 0,
  }
}

/** Comment on a post (flat thread, ≤300 chars, red-line scanned server-side). */
export async function createPostComment({ postId, content, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST', headers, body: JSON.stringify({ content }),
  })
  const result = await plazaJson(response)
  return result?.comment ?? null
}

/** Delete a comment — mine, or any comment under my own post. */
export async function deletePostComment({ postId, commentId, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE', headers })
  return plazaJson(response)
}

/** Report a comment. One report per reader; three readers auto-hide it. */
export async function reportPostComment({ postId, commentId, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/report`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

/** Public URL of the author's avatar portrait as published (may 404 → placeholder). */
export const plazaPortraitPath = (id) => `/api/plaza/${encodeURIComponent(id)}/portrait`

// ---- Book ratings (RATINGS) ----------------------------------------------
//
// Five stars plus an optional written review, hung on the bookstore
// book — never on a plaza post. One rating per reader per book:
// posting again edits the same rating. The average a surface prints
// is formatted to one decimal here so every surface rounds the same
// way; a book with no ratings has no average to print at all.

/** The one-decimal average a card or detail prints ('4.5'); '' when there is nothing honest to show. */
export function ratingAverageText(book) {
  const count = Number.isInteger(book?.ratingCount) ? book.ratingCount : 0
  const average = typeof book?.ratingAverage === 'number' ? book.ratingAverage : 0
  if (count <= 0 || !(average > 0)) return ''
  return average.toFixed(1)
}

/** A book's rating panel payload: summary pair, review list page, the viewer's own rating and authorship. */
export async function fetchBookRatings({ id, getAccessToken, cursor = '', limit, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  const headers = await plazaHeaders(getAccessToken)
  const response = await fetchImpl(`/api/store/${encodeURIComponent(id)}/ratings${query ? `?${query}` : ''}`, { headers })
  return plazaJson(response)
}

/** Rate a book (stars 1–5, optional review text), or edit my existing rating of it. */
export async function rateBook({ id, stars, text = '', getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/store/${encodeURIComponent(id)}/ratings`, {
    method: 'POST', headers, body: JSON.stringify({ stars, text }),
  })
  return plazaJson(response)
}

/** Delete my own rating of a book. */
export async function deleteBookRating({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/store/${encodeURIComponent(id)}/ratings`, { method: 'DELETE', headers })
  return plazaJson(response)
}
