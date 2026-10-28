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
  CUSTOM_GENRE_ID,
  GENRES,
  genreFor,
  genreTemplateById,
  isManuallyFinished,
  isStoryComplete,
  storyLengthModeOf,
  totalChaptersFor,
  worldBibleFor,
} from './story-engine.js'
import { avatarAppearanceText } from './avatar.js'

export const PLAZA_REPORT_THRESHOLD = 3

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
  // A short fused line never publishes. A fused line that inherited
  // endless mode falls through to the ordinary endless rule below (the
  // avatar check and the ≥1-chapter floor included).
  if (story.kind === 'merged' && storyLengthModeOf(story) !== 'endless') {
    return { publishable: false, reason: '合流故事不能发布到广场。', lineStatus: 'finished' }
  }
  if (typeof story.config?.avatarId !== 'string' || !story.config.avatarId) {
    return { publishable: false, reason: '只有用化身走完的故事线才能发布。', lineStatus: 'finished' }
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
export const WORLD_INTRO_VERSION = 1
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
  const background = `「${world}」——${templateName ? `${templateName}题材的世界` : '一个自成一体的世界'}。`
    + (backgroundBody && !backgroundBody.startsWith(`「${world}」`) ? backgroundBody : '')

  const rules = (Array.isArray(detail?.worldBible?.rules) ? detail.worldBible.rules : [])
    .filter((rule) => typeof rule === 'string' && rule.trim())
    .map((rule) => rule.trim())
    .filter((rule) => !REDACTION_PLACEHOLDERS.some((marker) => rule.includes(marker)))
    .filter((rule) => !WORLD_INTRO_ENGINE_TERMS.some((term) => rule.includes(term)))
    .slice(0, 3)

  const appearance = typeof detail?.avatar?.appearance === 'string' ? detail.avatar.appearance.trim() : ''
  const synopsis = typeof detail?.synopsis === 'string' ? detail.synopsis.trim() : ''
  const beats = Array.isArray(detail?.beats) ? detail.beats.filter((beat) => beat && typeof beat.title === 'string' && beat.title) : []
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
    thread = `${avatarName}${appearance ? `——${appearance}` : ''}，是这个世界的主角。${journey}${progress}`
  }
  return { background, rules, thread }
}

/** The line's publication status: a running endless line serialises; everything else is finished. */
export function plazaLineStatusFor(source) {
  if (source?.lineStatus === 'serializing' || source?.lineStatus === 'finished') return source.lineStatus
  return storyLengthModeOf(source) === 'endless' && !isManuallyFinished(source) ? 'serializing' : 'finished'
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
    avatarAppearance: avatar ? avatarAppearanceText(avatar.appearance) : '',
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
    // A published fused line reads as what it is — a two-protagonist
    // merged line — and carries its source titles for the provenance
    // label; the ids themselves never leave the server.
    kind: detail.merged ? 'merged' : 'solo',
    ...(detail.merged && Array.isArray(detail.sourceTitles) ? { sourceTitles: detail.sourceTitles } : {}),
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

/** The public feed: visible publication summaries, newest first, plus the live presence count. */
export async function fetchPlazaFeed({ fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl('/api/plaza')
  const result = await plazaJson(response)
  return {
    publications: Array.isArray(result?.publications) ? result.publications : [],
    onlineCount: Number.isInteger(result?.onlineCount) ? result.onlineCount : 0,
  }
}

/** One publication's detail: summary + sanitized bible, beats, read copy and enter template. */
export async function fetchPlazaDetail({ id, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`/api/plaza/${encodeURIComponent(id)}`)
  const result = await plazaJson(response)
  return result?.publication ?? null
}

/** Publish one of my avatar lines (finished, or a living endless publication). The server re-checks everything. */
export async function publishToPlaza({ story, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/plaza/publish', {
    method: 'POST', headers, body: JSON.stringify({ story }),
  })
  const result = await plazaJson(response)
  return result?.publication ?? null
}

/** Report a publication. One report per reader; three readers auto-hide it. */
export async function reportPublication({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/${encodeURIComponent(id)}/report`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

/** Withdraw my own publication. The local original is never touched. */
export async function withdrawPublication({ id, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await plazaHeaders(getAccessToken)) }
  const response = await fetchImpl(`/api/plaza/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST', headers, body: JSON.stringify({}),
  })
  return plazaJson(response)
}

/** Public URL of the author's avatar portrait as published (may 404 → placeholder). */
export const plazaPortraitPath = (id) => `/api/plaza/${encodeURIComponent(id)}/portrait`
