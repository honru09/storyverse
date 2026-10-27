// The plaza （广场）: finished avatar lines, published for other readers to
// read as written or to re-enter with their own avatar. This module is the
// shared vocabulary — the publish gate, display helpers and the shape of
// an "enter" draft — plus the client-side API. The server imports the pure
// parts so the gate a reader sees in the publish screen is exactly the
// gate the publish endpoint enforces.
//
// Product rules that live here and nowhere else:
// - A publishable line is a solo story an avatar actually walked (config
//   carries avatarId), in season or long mode, and finished. Short lines
//   and merged lines never publish.
// - Entering a line never touches the original: it seeds a brand-new local
//   story from the publication's sanitized world template, with the
//   entrant's own avatar as protagonist, and records where it came from
//   in config.sourcePublicationId. Generation then flows through the
//   ordinary chapter endpoint, so the cost meters to the entrant.
// - Moderation threshold: three distinct reporters auto-hide a line.

import {
  CUSTOM_GENRE_ID,
  GENRES,
  genreTemplateById,
  isStoryComplete,
  storyLengthModeOf,
  totalChaptersFor,
} from './story-engine.js'
import { avatarAppearanceText } from './avatar.js'

export const PLAZA_REPORT_THRESHOLD = 3

const genreByWorldId = (id) => GENRES.find((genre) => genre.id === id) || null

/** The publish gate, identical on the publish screen and the server. */
export function plazaGateFor(story) {
  if (!story || typeof story !== 'object') return { publishable: false, reason: '故事不存在。' }
  if (story.kind === 'merged') return { publishable: false, reason: '合流故事不能发布到广场。' }
  if (typeof story.config?.avatarId !== 'string' || !story.config.avatarId) {
    return { publishable: false, reason: '只有用化身走完的故事线才能发布。' }
  }
  const mode = storyLengthModeOf(story)
  if (mode !== 'season' && mode !== 'long') {
    return { publishable: false, reason: '只有一季或长线走完的故事线才能发布。' }
  }
  if (!isStoryComplete(story)) {
    return { publishable: false, reason: mode === 'season' ? '这一季还没走完，完结后才能发布。' : '这条长线还没走完，完结后才能发布。' }
  }
  return { publishable: true, reason: '' }
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

/** 「第 1 季 · 全 24 章」/「长线 · 全 100 章」— real fields only. */
export function plazaLengthLabel(source) {
  const mode = source?.storyLengthMode || storyLengthModeOf(source)
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
    step: 6,
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
    kind: 'solo',
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

/** Publish one of my finished avatar lines. The server re-checks everything. */
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
