/*
 * 外部导入 + 世界书 (lorebook): the parsers and the injection selector.
 *
 * Three import shapes land in the forge:
 *   - SillyTavern world-info JSON  → a custom world + lorebook entries
 *   - plain text / Markdown        → a custom world's setting text; a long
 *                                    text is ALSO split into lorebook
 *                                    entries so none of it is thrown away
 *   - character cards (JSON, or PNG with an embedded `chara` tEXt chunk)
 *                                  → the protagonist profile (name/persona)
 *
 * A lorebook entry is the story's private world material:
 *   { id, name, keys: [...], content, constant, enabled, source }
 * It lives on the story config, syncs with the book through the cloud
 * library like every other config field, and NEVER travels into a public
 * snapshot (the engine strips it at the snapshot layer). During
 * generation, entries are selected deterministically — constant entries
 * first, then entries whose keys appear in the upcoming chapter's context
 * — inside a fixed budget, and reach the model only as declared data
 * (see server/gemini.js contextFor).
 */

export const LOREBOOK_MAX_ENTRIES = 200
export const LOREBOOK_ENTRY_CONTENT_MAX = 2000
export const LOREBOOK_ENTRY_NAME_MAX = 60
export const LOREBOOK_KEY_MAX = 40
export const LOREBOOK_KEYS_MAX = 12
// The injection budget, in tokens. Metered in characters, which for the
// Chinese prose this app generates is the conservative direction (one
// CJK character ≈ one token), so the budget is never exceeded in tokens.
export const LOREBOOK_BUDGET_TOKENS = 1200
export const LOREBOOK_BUDGET_CHARS = LOREBOOK_BUDGET_TOKENS
// A plain-text world file is kept whole up to this cap; anything beyond
// it is truncated at import and the reader is told.
export const WORLD_TEXT_MAX = 12000
// One section of a split text world becomes one entry; sections are
// merged until they approach this size so entry contents stay well
// inside the per-entry bound.
export const WORLD_TEXT_SECTION_MAX = 1500

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''

let importCounter = 0
const makeEntryId = (prefix = 'lore') => `${prefix}-${Date.now().toString(36)}-${(importCounter += 1).toString(36)}`

/*
 * Normalise one raw entry into the stored shape. Content is the entry's
 * reason to exist: an entry without content is dropped (returns null).
 * Verbatim principle: content is preserved as written (trimmed at the
 * edges, capped at the per-entry bound) — never summarised or rewritten.
 */
export function normalizeLorebookEntry(raw, index = 0) {
  if (!isRecord(raw)) return null
  const content = cleanText(raw.content, LOREBOOK_ENTRY_CONTENT_MAX)
  if (!content) return null
  const seen = new Set()
  const keys = []
  for (const key of Array.isArray(raw.keys) ? raw.keys : []) {
    const cleaned = cleanText(key, LOREBOOK_KEY_MAX)
    if (cleaned && !seen.has(cleaned)) { seen.add(cleaned); keys.push(cleaned) }
    if (keys.length >= LOREBOOK_KEYS_MAX) break
  }
  return {
    id: cleanText(raw.id, 64) || `lore-${index}`,
    name: cleanText(raw.name, LOREBOOK_ENTRY_NAME_MAX) || keys[0] || `条目 ${index + 1}`,
    keys,
    content,
    constant: raw.constant === true,
    enabled: raw.enabled !== false,
    source: ['worldbook', 'text', 'manual'].includes(raw.source) ? raw.source : 'manual',
  }
}

export function normalizeLorebookEntries(raw) {
  if (!Array.isArray(raw)) return []
  const entries = []
  for (const item of raw) {
    const entry = normalizeLorebookEntry(item, entries.length)
    if (entry) entries.push(entry)
    if (entries.length >= LOREBOOK_MAX_ENTRIES) break
  }
  return entries
}

// ---------------------------------------------------------------------------
// SillyTavern world-info JSON
// ---------------------------------------------------------------------------

const keyListOf = (value) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
  if (typeof value === 'string') return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  return []
}

/*
 * Parse a SillyTavern world-info export. Permissive about the container:
 * the canonical { entries: { "0": {...} } } map, an entries array, or a
 * bare top-level array of entries. Entry fields are read under both
 * their canonical names (key / comment / disable) and the aliases other
 * tools emit (keys / name). Disabled entries are skipped entirely —
 * the author turned them off in their own book, and that decision is
 * part of the file. Returns { name, description, entries }.
 */
export function parseWorldInfoJson(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error('这个文件不是有效的 JSON，读不出世界书内容。换一个文件试试。') }
  let rawEntries = null
  if (Array.isArray(parsed)) rawEntries = parsed
  else if (isRecord(parsed) && isRecord(parsed.entries)) rawEntries = Object.values(parsed.entries)
  else if (isRecord(parsed) && Array.isArray(parsed.entries)) rawEntries = parsed.entries
  if (!rawEntries) throw new Error('这个 JSON 里没有找到世界书条目——它可能不是世界书文件。角色卡请在主角那一步导入。')
  const entries = []
  for (const raw of rawEntries) {
    if (!isRecord(raw)) continue
    if (raw.disable === true || raw.disabled === true) continue
    const content = typeof raw.content === 'string' ? raw.content : ''
    if (!content.trim()) continue
    const keys = [...keyListOf(raw.key), ...keyListOf(raw.keys), ...keyListOf(raw.keysecondary)]
    entries.push({
      id: makeEntryId('wb'),
      name: cleanText(raw.comment ?? raw.name, LOREBOOK_ENTRY_NAME_MAX),
      keys,
      content,
      constant: raw.constant === true,
      enabled: true,
      source: 'worldbook',
    })
    if (entries.length >= LOREBOOK_MAX_ENTRIES) break
  }
  if (!entries.length) throw new Error('这本世界书里的条目都是空的或已被禁用，没有可导入的内容。')
  return {
    name: isRecord(parsed) ? cleanText(parsed.name, 60) : '',
    description: isRecord(parsed) ? cleanText(parsed.description, 2000) : '',
    entries: normalizeLorebookEntries(entries),
  }
}

// ---------------------------------------------------------------------------
// Plain text / Markdown world files
// ---------------------------------------------------------------------------

/*
 * Split a long world text into lorebook entries. Markdown headings open
 * new sections (the heading becomes the entry's name and its trigger
 * key); without headings, blank-line blocks are merged up to the section
 * size. The FIRST entry is constant — it is the world's opener, the part
 * every chapter should know. All text is preserved verbatim.
 */
export function splitWorldTextIntoEntries(text) {
  const sections = []
  let current = { title: '', lines: [] }
  const flush = () => {
    const body = current.lines.join('\n').trim()
    if (body) sections.push({ title: current.title, body })
    current = { title: '', lines: [] }
  }
  for (const line of String(text || '').split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) { flush(); current = { title: heading[1].trim(), lines: [] } }
    else current.lines.push(line)
  }
  flush()
  // A single section longer than the section size is hard-split at line
  // boundaries, so no part of the file ever dies against the per-entry
  // content bound in the normaliser.
  const pieces = []
  for (const section of sections) {
    if (section.body.length <= WORLD_TEXT_SECTION_MAX) { pieces.push(section); continue }
    let part = ''
    const flushPart = () => { if (part) { pieces.push({ title: section.title, body: part }); part = '' } }
    for (const line of section.body.split('\n')) {
      if (line.length > WORLD_TEXT_SECTION_MAX) {
        // One unbroken mega-line: hard-cut it into section-sized slices.
        flushPart()
        for (let at = 0; at < line.length; at += WORLD_TEXT_SECTION_MAX) {
          pieces.push({ title: section.title, body: line.slice(at, at + WORLD_TEXT_SECTION_MAX) })
        }
        continue
      }
      if (part && part.length + line.length + 1 > WORLD_TEXT_SECTION_MAX) flushPart()
      part = part ? `${part}\n${line}` : line
    }
    flushPart()
  }
  sections.length = 0
  sections.push(...pieces)
  const entries = []
  let buffer = null
  const pushBuffer = () => {
    if (!buffer) return
    entries.push({
      id: makeEntryId('txt'),
      name: buffer.title || `世界设定 · 其${entries.length + 1}`,
      keys: buffer.title ? [buffer.title] : [],
      content: buffer.body,
      constant: entries.length === 0,
      enabled: true,
      source: 'text',
    })
    buffer = null
  }
  for (const section of sections) {
    if (buffer && (buffer.body.length + section.body.length + 1 > WORLD_TEXT_SECTION_MAX || section.title)) {
      pushBuffer()
    }
    if (!buffer) buffer = { title: section.title, body: section.body }
    else buffer = { title: buffer.title, body: `${buffer.body}\n${section.body}` }
    if (buffer.body.length >= WORLD_TEXT_SECTION_MAX) pushBuffer()
  }
  pushBuffer()
  return normalizeLorebookEntries(entries)
}

/*
 * A plain world-setting file. The leading excerpt (up to the god-mode
 * setting bound) becomes the editable setting text; a longer file is
 * kept whole as lorebook entries by the caller via
 * splitWorldTextIntoEntries, so nothing the author wrote is lost.
 */
export function parseWorldText(text, fileName = '') {
  const raw = typeof text === 'string' ? text.replace(/^﻿/, '') : ''
  const truncated = raw.length > WORLD_TEXT_MAX
  const kept = truncated ? raw.slice(0, WORLD_TEXT_MAX) : raw
  if (!kept.trim()) throw new Error('这个文件是空的，没有可导入的世界设定。')
  const heading = kept.match(/^#{1,6}\s+(.+)$/m)
  const fallbackName = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  return {
    name: cleanText(heading ? heading[1] : fallbackName, 60),
    text: kept,
    truncated,
  }
}

// ---------------------------------------------------------------------------
// Character cards (JSON shapes + PNG embedding)
// ---------------------------------------------------------------------------

const cardFieldsOf = (root) => {
  if (!isRecord(root)) return null
  // chara_card_v2 / v3 wrap the card in `data`; v1 and loose tools keep
  // the fields at the top level. Flai-style exports may nest once more
  // under `card`. All are the same card to us.
  const data = isRecord(root.data) ? root.data : isRecord(root.card) ? root.card : root
  const pick = (...fields) => {
    for (const field of fields) if (typeof data[field] === 'string' && data[field].trim()) return data[field].trim()
    return ''
  }
  const name = pick('name')
  if (!name) return null
  return {
    name: name.slice(0, 40),
    description: pick('description', 'desc'),
    personality: pick('personality'),
    scenario: pick('scenario'),
    firstMessage: pick('first_mes', 'firstMessage', 'first_message'),
  }
}

export function parseCharacterCardJson(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error('这个文件不是有效的 JSON，读不出角色卡。换一个文件试试。') }
  const card = cardFieldsOf(parsed)
  if (!card) throw new Error('这个 JSON 里没有读到角色名字——它可能不是角色卡。世界书请在世界那一步导入。')
  return card
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/*
 * Read the tEXt chunks of a PNG. The SillyTavern card embedding is a
 * tEXt chunk whose keyword is `chara` (v2) or `ccv3` (v3) and whose
 * value is the card JSON, base64-encoded. Chunk CRCs are not verified:
 * a card with a bruised ancillary chunk is still a card.
 */
export function pngTextChunks(bytes) {
  const chunks = {}
  if (!bytes || bytes.length < 8 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return chunks
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    const dataStart = offset + 8
    if (dataStart + length > bytes.length) break
    if (type === 'tEXt') {
      const data = bytes.subarray(dataStart, dataStart + length)
      const split = data.indexOf(0)
      if (split > 0) {
        const keyword = String.fromCharCode(...data.subarray(0, split))
        if (!(keyword in chunks)) {
          chunks[keyword] = new TextDecoder('latin1').decode(data.subarray(split + 1))
        }
      }
    }
    if (type === 'IEND') break
    offset = dataStart + length + 4
  }
  return chunks
}

const decodeBase64Utf8 = (value) => {
  const binary = typeof atob === 'function'
    ? atob(value.replace(/\s/g, ''))
    : Buffer.from(value, 'base64').toString('binary')
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export function parseCharacterCardPng(bytes) {
  const chunks = pngTextChunks(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []))
  const embedded = chunks.ccv3 || chunks.chara
  if (!embedded) throw new Error('这张 PNG 里没有找到内嵌的角色卡数据——它可能只是一张普通图片。')
  let parsed
  try { parsed = JSON.parse(decodeBase64Utf8(embedded)) } catch { throw new Error('PNG 里内嵌的角色卡数据损坏了，读不出来。') }
  const card = cardFieldsOf(parsed)
  if (!card) throw new Error('PNG 里的角色卡没有名字，读不出一张完整的卡。')
  return card
}

/*
 * Compose the protagonist persona text from a card: the description is
 * who they are, personality and scenario ride along labelled, in the
 * card's own words. first_mes is a chat opening line, not a profile —
 * it is deliberately not mapped (see IMPORT.md).
 */
export function personaTextFromCard(card) {
  const parts = []
  if (card.description) parts.push(card.description)
  if (card.personality) parts.push(`性格：${card.personality}`)
  if (card.scenario) parts.push(`处境：${card.scenario}`)
  return parts.join('\n').slice(0, 600)
}

/*
 * The leading excerpt of a long text, cut at a paragraph or sentence
 * boundary when one exists in the latter half of the window — used for
 * the editable setting text of an imported text world (the full text
 * survives as lorebook entries).
 */
export function leadingExcerpt(text, max) {
  const value = String(text || '')
  if (value.length <= max) return value.trim()
  const window = value.slice(0, max)
  const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('。'))
  return (cut > max * 0.4 ? window.slice(0, cut) : window).trim()
}

// ---------------------------------------------------------------------------
// Injection selection
// ---------------------------------------------------------------------------

/*
 * Pick the entries that ride into one chapter's generation context.
 * Deterministic: constant entries first (in stored order), then keyed
 * entries whose keys appear in the haystack (in stored order). An entry
 * is included whole or not at all — a truncated fact is worse than an
 * absent one — and selection stops being greedy only when the budget
 * is spent; a later, smaller entry may still fit.
 */
export function selectLorebookEntries(entries, haystack, budgetChars = LOREBOOK_BUDGET_CHARS) {
  const list = normalizeLorebookEntries(entries).filter((entry) => entry.enabled)
  if (!list.length) return []
  const hay = String(haystack || '').toLowerCase()
  const constant = list.filter((entry) => entry.constant)
  const keyed = list.filter((entry) => !entry.constant
    && entry.keys.some((key) => hay.includes(key.toLowerCase())))
  const selected = []
  let used = 0
  for (const entry of [...constant, ...keyed]) {
    const cost = entry.content.length + entry.name.length
    if (used + cost > budgetChars) continue
    selected.push(entry)
    used += cost
  }
  return selected
}
