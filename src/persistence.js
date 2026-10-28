export const STORAGE_KEY = 'storyweave:v2'

const LEGACY_STORAGE_KEY = 'storyweave:story-state'
const CURRENT_VERSION = 2
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024

// A story's chapter total derives from its length mode (mirrors the
// engine's length resolution so this storage layer stays dependency-free):
// short 6 / season 24 / long 100 / custom = the story's own stored target
// (10–999) / endless = unbounded, capped here at the largest supported
// chapter count; merged stories are 6, except a fused line that
// inherited endless mode from a still-serialising source (FUSION2),
// which is unbounded like any endless line. Pre-mode saves are 6.
// The cursor points to the next accepted chapter and stays at total-1 once
// the final chapter exists.
const LENGTH_TOTALS = { short: 6, season: 24, long: 100 }
const MAX_SUPPORTED_CHAPTERS = 999
const totalForStory = (story) => {
  if (story?.kind === 'merged') {
    return story?.config?.storyLengthMode === 'endless' ? MAX_SUPPORTED_CHAPTERS : 6
  }
  const mode = story?.config?.storyLengthMode
  if (mode === 'custom') {
    const target = story?.config?.targetChapters
    return Number.isInteger(target) && target >= 10 && target <= 999 ? target : 24
  }
  if (mode === 'endless') return MAX_SUPPORTED_CHAPTERS
  return LENGTH_TOTALS[mode] || 6
}
const CONFIG_TEXT_FIELDS = [
  'genreId', 'genreTemplateId', 'storyLengthMode', 'originIdentityId', 'customWorldName', 'customWorldSetting', 'bookTitle', 'startPointName', 'startPointHook', 'avatarId', 'avatarAppearance', 'sourcePublicationId', 'name', 'persona', 'trait', 'origin', 'ability', 'tone', 'hometown',
  'school', 'company', 'role', 'friend', 'destination', 'protagonist', 'appearance', 'finishedAt', 'stylePreset',
]

// 文风预设 ids, mirrored from src/story-engine.js STYLE_PRESETS (this
// storage layer stays dependency-free, like the length totals above).
const STYLE_PRESET_IDS = ['default', 'compact', 'immersive', 'austere']

// 世界书 bounds, mirrored from src/lorebook.js (this storage layer stays
// dependency-free, like the length totals above).
const LOREBOOK_LIMITS = { entries: 200, content: 2000, name: 60, key: 40, keys: 12 }

function validateLorebook(lorebook, prefix, errors) {
  if (!Array.isArray(lorebook)) {
    errors.push(`${prefix} must be an array`)
    return
  }
  if (lorebook.length > LOREBOOK_LIMITS.entries) errors.push(`${prefix} exceeds the supported entry count`)
  for (let index = 0; index < lorebook.length; index += 1) {
    const entry = lorebook[index]
    const entryPrefix = `${prefix}[${index}]`
    if (!isRecord(entry)) { errors.push(`${entryPrefix} must be an object`); continue }
    if (!isNonEmptyString(entry.id)) errors.push(`${entryPrefix}.id must be a non-empty string`)
    if (!isNonEmptyString(entry.content) || entry.content.length > LOREBOOK_LIMITS.content) {
      errors.push(`${entryPrefix}.content must be a non-empty string of at most ${LOREBOOK_LIMITS.content} characters`)
    }
    validateOptionalFields(entry, entryPrefix, ['name', 'source'], 'string', errors)
    if (typeof entry.name === 'string' && entry.name.length > LOREBOOK_LIMITS.name) {
      errors.push(`${entryPrefix}.name is too long`)
    }
    if (entry.keys !== undefined) {
      if (!Array.isArray(entry.keys) || entry.keys.length > LOREBOOK_LIMITS.keys
        || entry.keys.some((key) => typeof key !== 'string' || key.length > LOREBOOK_LIMITS.key)) {
        errors.push(`${entryPrefix}.keys must be an array of at most ${LOREBOOK_LIMITS.keys} short strings`)
      }
    }
    validateOptionalFields(entry, entryPrefix, ['constant', 'enabled'], 'boolean', errors)
  }
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function defaultStorage() {
  try {
    return typeof globalThis === 'undefined' ? undefined : globalThis.localStorage
  } catch {
    // Some browsers expose localStorage but throw while reading it in a
    // restricted/private context. Callers still get an in-memory library.
    return undefined
  }
}

export function emptyLibrary() {
  return {
    version: CURRENT_VERSION,
    stories: [],
    activeStoryId: null,
    publications: [],
    favorites: [],
    draft: null,
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateOptionalFields(value, prefix, fields, type, errors) {
  for (const key of fields) {
    if (value[key] !== undefined && typeof value[key] !== type) {
      errors.push(`${prefix}.${key} must be a ${type}`)
    }
  }
}

function validateStringArray(value, prefix, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${prefix} must be an array`)
    return
  }
  if (nonEmpty && value.length === 0) errors.push(`${prefix} must not be empty`)
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== 'string') errors.push(`${prefix}[${index}] must be a string`)
  }
}

function validateConfig(config, prefix, errors, merged = false, forStory = false) {
  if (!isRecord(config)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  validateOptionalFields(config, prefix, CONFIG_TEXT_FIELDS, 'string', errors)
  validateOptionalFields(config, prefix, ['immersive', 'worldChosen'], 'boolean', errors)
  validateOptionalFields(config, prefix, ['seasonNumber'], 'number', errors)
  if (config.storyLengthMode !== undefined && !['short', 'season', 'long', 'custom', 'endless'].includes(config.storyLengthMode)) {
    errors.push(`${prefix}.storyLengthMode is invalid`)
  }
  if (config.stylePreset !== undefined && !STYLE_PRESET_IDS.includes(config.stylePreset)) {
    errors.push(`${prefix}.stylePreset is invalid`)
  }
  // 篇幅自由化: a stored custom target must be an integer in range — an
  // out-of-range value (e.g. 5) is a rejected config, not a short custom
  // line. Null means "not chosen yet" and is only tolerated on drafts.
  if (config.targetChapters !== undefined && config.targetChapters !== null) {
    if (!Number.isInteger(config.targetChapters) || config.targetChapters < 10 || config.targetChapters > 999) {
      errors.push(`${prefix}.targetChapters must be an integer from 10 to 999`)
    }
  }
  if (forStory && config.storyLengthMode === 'custom' && !Number.isInteger(config.targetChapters)) {
    errors.push(`${prefix}.targetChapters is required for a custom-length story`)
  }
  if (forStory && config.storyLengthMode === 'endless' && config.targetChapters != null) {
    errors.push(`${prefix}.targetChapters must be empty for an endless story`)
  }
  if (config.step !== undefined && (!Number.isInteger(config.step) || config.step < 1 || config.step > 7)) {
    errors.push(`${prefix}.step must be an integer from 1 to 7`)
  }
  if (config.sourceGenres !== undefined) validateStringArray(config.sourceGenres, `${prefix}.sourceGenres`, errors)
  // 世界书 （外部导入）: the owner's imported/maintained lorebook entries.
  // Absent on every pre-import save and on every public snapshot (the
  // engine strips it there); when present it is a bounded entry list.
  if (config.lorebook !== undefined) validateLorebook(config.lorebook, `${prefix}.lorebook`, errors)
  if (merged || config.protagonists !== undefined) {
    if (!Array.isArray(config.protagonists) || config.protagonists.length !== 2) {
      errors.push(`${prefix}.protagonists must contain two characters`)
    } else {
      for (let index = 0; index < config.protagonists.length; index += 1) {
        const person = config.protagonists[index]
        const personPrefix = `${prefix}.protagonists[${index}]`
        if (!isRecord(person)) errors.push(`${personPrefix} must be an object`)
        else {
          if (!isNonEmptyString(person.name)) errors.push(`${personPrefix}.name must be a non-empty string`)
          validateOptionalFields(person, personPrefix, CONFIG_TEXT_FIELDS, 'string', errors)
        }
      }
    }
  }
  if (config.merge !== undefined) {
    if (!isRecord(config.merge)) errors.push(`${prefix}.merge must be an object`)
    else {
      for (const [field, allowed] of Object.entries({ rules: ['bridge', 'separate'], lead: ['a', 'b'], bond: ['allies', 'rivals'] })) {
        if (!allowed.includes(config.merge[field])) errors.push(`${prefix}.merge.${field} is invalid`)
      }
    }
  }
}

function validateChapter(chapter, prefix, index, merged, errors) {
  if (!isRecord(chapter)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  if (!isNonEmptyString(chapter.id)) errors.push(`${prefix}.id must be a non-empty string`)
  if (!isNonEmptyString(chapter.title)) errors.push(`${prefix}.title must be a non-empty string`)
  if (chapter.index !== index) errors.push(`${prefix}.index must match its position`)
  validateStringArray(chapter.paragraphs, `${prefix}.paragraphs`, errors, { nonEmpty: true })
  validateOptionalFields(chapter, prefix, ['summary'], 'string', errors)
  for (const field of ['events', 'foreshadowing']) {
    if (chapter[field] !== undefined) validateStringArray(chapter[field], `${prefix}.${field}`, errors)
  }

  // Choices retired with the intervention batch: a chapter minted now
  // carries choice: null at EVERY position, and nothing is required. A
  // pre-retirement chapter may still carry its choice object — inert
  // historical data — so a present choice is shape-checked (a record with
  // a prompt and two well-formed options) but never matched against an
  // era's option ids and never treated as a gate.
  if (chapter.choice != null) {
    if (!isRecord(chapter.choice)) {
      errors.push(`${prefix}.choice must be an object`)
      return
    }
    if (!isNonEmptyString(chapter.choice.prompt)) errors.push(`${prefix}.choice.prompt must be a non-empty string`)
    const options = chapter.choice.options
    if (!Array.isArray(options) || options.length !== 2) {
      errors.push(`${prefix}.choice.options must contain both branches`)
      return
    }
    const ids = new Set()
    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      const option = options[optionIndex]
      const optionPrefix = `${prefix}.choice.options[${optionIndex}]`
      if (!isRecord(option)) errors.push(`${optionPrefix} must be an object`)
      else {
        if (!isNonEmptyString(option.id) || ids.has(option.id)) errors.push(`${optionPrefix}.id is invalid or duplicated`)
        ids.add(option.id)
        if (!isNonEmptyString(option.label)) errors.push(`${optionPrefix}.label must be a non-empty string`)
        validateOptionalFields(option, optionPrefix, ['detail', 'consequence'], 'string', errors)
      }
    }
  }
  // 介入印记： the interventions that landed in this chapter, stamped at
  // generation time. Only the owner's copy carries them; snapshots omit
  // the field entirely.
  if (chapter.interventions !== undefined) {
    if (!Array.isArray(chapter.interventions)) errors.push(`${prefix}.interventions must be an array`)
    else {
      for (let entryIndex = 0; entryIndex < chapter.interventions.length; entryIndex += 1) {
        const entry = chapter.interventions[entryIndex]
        const entryPrefix = `${prefix}.interventions[${entryIndex}]`
        if (!isRecord(entry)) errors.push(`${entryPrefix} must be an object`)
        else {
          if (!isNonEmptyString(entry.text)) errors.push(`${entryPrefix}.text must be a non-empty string`)
          validateOptionalFields(entry, entryPrefix, ['kind'], 'string', errors)
        }
      }
    }
  }
  // 备用通道标记： a chapter the fallback channel wrote carries
  // degraded: true so the reader can be told in the open (RELIABILITY.md).
  // Absent on every chapter the primary channel wrote.
  if (chapter.degraded !== undefined && typeof chapter.degraded !== 'boolean') {
    errors.push(`${prefix}.degraded must be a boolean`)
  }
}

function validateStory(story, prefix) {
  const errors = []

  if (!isRecord(story)) return [`${prefix} must be an object`]
  if (!isNonEmptyString(story.id)) errors.push(`${prefix}.id must be a non-empty string`)
  if (!isNonEmptyString(story.title)) errors.push(`${prefix}.title must be a non-empty string`)
  if (!isNonEmptyString(story.genreId)) errors.push(`${prefix}.genreId must be a non-empty string`)
  validateConfig(story.config, `${prefix}.config`, errors, story.kind === 'merged', true)
  if (!isRecord(story.worldBible)) errors.push(`${prefix}.worldBible must be an object`)
  else {
    validateOptionalFields(story.worldBible, `${prefix}.worldBible`, ['premise', 'endingAnchor'], 'string', errors)
    for (const field of ['rules', 'outline']) {
      if (story.worldBible[field] !== undefined) validateStringArray(story.worldBible[field], `${prefix}.worldBible.${field}`, errors)
    }
  }
  if (!Array.isArray(story.chapters)) errors.push(`${prefix}.chapters must be an array`)
  else {
    const total = totalForStory(story)
    if (story.chapters.length > Math.min(total, MAX_SUPPORTED_CHAPTERS)) errors.push(`${prefix}.chapters exceeds the supported chapter count`)
    for (let index = 0; index < story.chapters.length; index += 1) {
      validateChapter(story.chapters[index], `${prefix}.chapters[${index}]`, index, story.kind === 'merged', errors)
    }
    if (story.chapterIndex !== Math.min(story.chapters.length, total - 1)) {
      errors.push(`${prefix}.chapterIndex does not match accepted chapters`)
    }
  }
  // StoryWeave v2 stores choices as an index -> choice id map. Keep accepting
  // the early array shape so old test fixtures and hand-written snapshots can
  // still be opened without wiping the user's library.
  if (!Array.isArray(story.choices) && !isRecord(story.choices)) {
    errors.push(`${prefix}.choices must be an array or object`)
  } else {
    const total = totalForStory(story)
    for (const [chapter, choice] of Object.entries(story.choices)) {
      // Sparse legacy arrays become null-filled arrays after JSON serialization.
      if (choice === null && Array.isArray(story.choices)) continue
      const chapterIndex = Number(chapter)
      if (!Number.isInteger(chapterIndex) || String(chapterIndex) !== chapter || chapterIndex < 0 || chapterIndex >= total || !isNonEmptyString(choice)) {
        errors.push(`${prefix}.choices contains an invalid entry`)
      }
    }
  }
  // 介入队列： the reader's queued/applied interventions. Absent on every
  // pre-intervention save; when present it is a flat list of small records
  // whose targetIndex names the one chapter each nudge may touch.
  if (story.interventions !== undefined) {
    if (!Array.isArray(story.interventions)) errors.push(`${prefix}.interventions must be an array`)
    else {
      for (let entryIndex = 0; entryIndex < story.interventions.length; entryIndex += 1) {
        const entry = story.interventions[entryIndex]
        const entryPrefix = `${prefix}.interventions[${entryIndex}]`
        if (!isRecord(entry)) { errors.push(`${entryPrefix} must be an object`); continue }
        if (!isNonEmptyString(entry.id)) errors.push(`${entryPrefix}.id must be a non-empty string`)
        if (!Number.isInteger(entry.targetIndex) || entry.targetIndex < 0) errors.push(`${entryPrefix}.targetIndex must be a non-negative integer`)
        if (!isNonEmptyString(entry.text)) errors.push(`${entryPrefix}.text must be a non-empty string`)
        if (!['text', 'chip', 'random'].includes(entry.kind)) errors.push(`${entryPrefix}.kind is invalid`)
        if (!['queued', 'applied'].includes(entry.status)) errors.push(`${entryPrefix}.status is invalid`)
        validateOptionalFields(entry, entryPrefix, ['chipId', 'createdAt'], 'string', errors)
      }
    }
  }
  if (!Number.isInteger(story.revision) || story.revision < 0) {
    errors.push(`${prefix}.revision must be a non-negative integer`)
  }
  if (story.readerIndex !== undefined && (!Number.isInteger(story.readerIndex) || story.readerIndex < 0)) {
    errors.push(`${prefix}.readerIndex must be a non-negative integer`)
  }
  // 已打开水位 (FRONTIER-FIX): the highest chapter index the reader has
  // ever opened; it decides which chapter is still the editable
  // frontier. Absent on every pre-watermark save — those keep behaving
  // as they always did until the first recorded open seeds the field.
  if (story.openedThrough !== undefined && (!Number.isInteger(story.openedThrough) || story.openedThrough < 0)) {
    errors.push(`${prefix}.openedThrough must be a non-negative integer`)
  }
  validateOptionalFields(story, prefix, ['author', 'createdAt', 'updatedAt', 'status', 'genreTemplateId', 'previousSeasonId', 'synopsis'], 'string', errors)
  // 本书简介 (EDIT-BOOK): an optional owner-written blurb; the bound
  // mirrors SYNOPSIS_MAX in src/story-engine.js (this storage layer
  // stays dependency-free, like the lorebook limits above).
  if (typeof story.synopsis === 'string' && story.synopsis.length > 300) {
    errors.push(`${prefix}.synopsis must be at most 300 characters`)
  }
  validateOptionalFields(story, prefix, ['bookmarked', 'readOnly', 'isDemo'], 'boolean', errors)
  // Per-story generated cover: only the state and a version live on the
  // story; the image itself stays on the server under the owner's account.
  // Absent means "never requested" — every pre-cover save stays valid.
  if (story.cover !== undefined) {
    if (!isRecord(story.cover)) errors.push(`${prefix}.cover must be an object`)
    else {
      if (!['none', 'pending', 'ready', 'failed'].includes(story.cover.status)) {
        errors.push(`${prefix}.cover.status is invalid`)
      }
      if (story.cover.version !== undefined && (!Number.isInteger(story.cover.version) || story.cover.version < 0)) {
        errors.push(`${prefix}.cover.version must be a non-negative integer`)
      }
      validateOptionalFields(story.cover, `${prefix}.cover`, ['updatedAt'], 'string', errors)
    }
  }
  if (story.kind !== undefined && !['solo', 'merged'].includes(story.kind)) errors.push(`${prefix}.kind is invalid`)
  if (story.sourceIds !== undefined) validateStringArray(story.sourceIds, `${prefix}.sourceIds`, errors)
  // 来源标注 (FUSION2): a fused line records the two source ids and their
  // titles at fusion time. Absent on every solo line and on fused lines
  // minted before the field existed.
  if (story.derivedFrom !== undefined) validateStringArray(story.derivedFrom, `${prefix}.derivedFrom`, errors)
  if (story.sourceTitles !== undefined) validateStringArray(story.sourceTitles, `${prefix}.sourceTitles`, errors)

  return errors
}

function validateLibraryStructure(library) {
  if (!isRecord(library)) return ['library must be an object']
  const errors = []

  if (library.version !== CURRENT_VERSION) errors.push(`version must be ${CURRENT_VERSION}`)
  if (!Array.isArray(library.stories)) errors.push('stories must be an array')
  if (library.activeStoryId !== null && !isNonEmptyString(library.activeStoryId)) {
    errors.push('activeStoryId must be null or a non-empty string')
  }
  if (!Array.isArray(library.publications)) errors.push('publications must be an array')
  else {
    const ids = new Set()
    for (let index = 0; index < library.publications.length; index += 1) {
      const item = library.publications[index]
      const prefix = `publications[${index}]`
      if (!isRecord(item)) errors.push(`${prefix} must be an object`)
      else {
        if (!isNonEmptyString(item.id) || ids.has(item.id)) errors.push(`${prefix}.id is invalid or duplicated`)
        ids.add(item.id)
        validateOptionalFields(item, prefix, ['storyId', 'createdAt'], 'string', errors)
        // Early libraries stored publication references only. Preserve those;
        // the bookstore can display only entries that have a readable snapshot.
        if (item.snapshot !== undefined) errors.push(...validateStory(item.snapshot, `${prefix}.snapshot`))
      }
    }
  }
  validateStringArray(library.favorites, 'favorites', errors)
  if (library.draft !== null && !isRecord(library.draft)) errors.push('draft must be null or an object')
  else if (library.draft !== null) validateConfig(library.draft, 'draft', errors)

  if (Array.isArray(library.stories)) {
    const seen = new Set()
    for (let index = 0; index < library.stories.length; index += 1) {
      const story = library.stories[index]
      errors.push(...validateStory(story, `stories[${index}]`))
      if (isRecord(story) && isNonEmptyString(story.id)) {
        if (seen.has(story.id)) errors.push(`stories contains duplicate id: ${story.id}`)
        seen.add(story.id)
      }
    }
  }

  return errors
}

function validateLibrary(library) {
  try {
    return validateLibraryStructure(library)
  } catch {
    // Accessors or proxies are not valid portable data. Saving should report a
    // recoverable failure even when inspecting a caller's object itself throws.
    return ['library contains unreadable values']
  }
}

function assertValidLibrary(library) {
  const errors = validateLibrary(library)
  if (errors.length > 0) throw new Error(`书库结构无效：${errors.slice(0, 3).join('；')}`)
}

function serializeLibrary(library, pretty = false) {
  assertValidLibrary(library)
  let serialized
  try {
    serialized = JSON.stringify(library, null, pretty ? 2 : undefined)
  } catch {
    throw new Error('书库无法序列化，请检查数据是否包含循环引用或不支持的值。')
  }
  // A toJSON hook may alter otherwise valid input during serialization. Never
  // commit a payload that this application would be unable to load again.
  let parsed
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('书库无法序列化为有效的 JSON。')
  }
  assertValidLibrary(parsed)
  return serialized
}

function assertBackupSize(raw) {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('备份文件超过 5 MB，请选择较小的书库文件。')
  }
}

// Pure helpers: neither function reads nor changes browser storage. The caller
// owns the file download and explicit confirmation before replacing a library.
export function exportLibrary(library) {
  const serialized = serializeLibrary(library, true)
  assertBackupSize(serialized)
  return serialized
}

export function importLibrary(raw) {
  if (typeof raw !== 'string') throw new Error('请选择 JSON 格式的书库备份文件。')
  assertBackupSize(raw)
  let parsed
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('备份文件不是有效的 JSON，原书库未更改。')
  }
  if (isRecord(parsed) && parsed.version !== CURRENT_VERSION) {
    throw new Error(`暂不支持此备份版本，需要版本 ${CURRENT_VERSION} 的书库。`)
  }
  assertValidLibrary(parsed)
  return parsed
}

/*
 * IMPORT-DAYLIGHT: a backup import MERGES into the current shelf; it
 * no longer replaces it wholesale. The merge rules are the ones the
 * confirmation summary states to the reader, word for word:
 *   - a story only in the backup is added;
 *   - a story in both with different content is updated to the
 *     backup's copy (importing a backup means trusting that copy);
 *   - an identical story is left alone;
 *   - publication records merge by id, favourites union;
 *   - an in-progress forge draft on THIS device is never overwritten
 *     by the backup's draft; the backup's draft is adopted only when
 *     there is none here.
 * Avatars are NOT part of a shelf backup: they live on the account
 * server-side and come back at sign-in. The summary says so.
 */
export function summarizeLibraryImport(current, incoming) {
  const currentById = new Map((current?.stories || []).map((story) => [story.id, story]))
  let added = 0
  let updated = 0
  let unchanged = 0
  for (const story of incoming?.stories || []) {
    const existing = currentById.get(story.id)
    if (!existing) added += 1
    else if (JSON.stringify(existing) !== JSON.stringify(story)) updated += 1
    else unchanged += 1
  }
  const currentPublicationIds = new Set((current?.publications || []).map((item) => item.id))
  const publicationsAdded = (incoming?.publications || []).filter((item) => !currentPublicationIds.has(item.id)).length
  return {
    totalStories: (incoming?.stories || []).length,
    added,
    updated,
    unchanged,
    publicationsAdded,
    currentStories: (current?.stories || []).length,
    draftAdopted: !current?.draft && Boolean(incoming?.draft),
  }
}

export function mergeLibraryImport(current, incoming) {
  const base = isRecord(current) ? current : emptyLibrary()
  const summary = summarizeLibraryImport(base, incoming)
  const incomingById = new Map((incoming.stories || []).map((story) => [story.id, story]))
  const stories = (base.stories || []).map((story) => incomingById.get(story.id) || story)
  const known = new Set(stories.map((story) => story.id))
  for (const story of incoming.stories || []) {
    if (!known.has(story.id)) { stories.push(story); known.add(story.id) }
  }
  const publicationIds = new Set((base.publications || []).map((item) => item.id))
  const publications = [...(base.publications || [])]
  for (const item of incoming.publications || []) {
    if (!publicationIds.has(item.id)) { publications.push(item); publicationIds.add(item.id) }
  }
  const merged = {
    version: CURRENT_VERSION,
    stories,
    activeStoryId: base.activeStoryId && known.has(base.activeStoryId)
      ? base.activeStoryId
      : (incoming.activeStoryId && known.has(incoming.activeStoryId) ? incoming.activeStoryId : stories[0]?.id ?? null),
    publications,
    favorites: [...new Set([...(base.favorites || []), ...(incoming.favorites || [])])].filter((id) => known.has(id)),
    draft: base.draft ?? incoming.draft ?? null,
  }
  assertValidLibrary(merged)
  return { library: merged, summary }
}

function warningFor(message) {
  return `${message} 原始数据已保留，未覆盖。`
}

export function loadLibrary(storage = defaultStorage()) {
  const fallback = emptyLibrary()

  if (!storage || typeof storage.getItem !== 'function') {
    return { library: fallback, warning: '无法访问本地存储，当前使用临时空书库。' }
  }

  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch (error) {
    return {
      library: fallback,
      warning: `读取本地书库失败：${error?.message || '存储权限被拒绝'}。当前使用临时空书库。`,
    }
  }

  if (raw === null || raw === undefined || raw === '') {
    return { library: fallback, warning: null }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { library: fallback, warning: warningFor('本地书库 JSON 已损坏。') }
  }

  if (!isRecord(parsed)) {
    return { library: fallback, warning: warningFor('本地书库数据格式无效。') }
  }

  if (parsed.version !== CURRENT_VERSION) {
    return {
      library: fallback,
      warning: warningFor(`本地书库版本 ${String(parsed.version ?? '未知')} 暂不支持。`),
    }
  }

  const errors = validateLibrary(parsed)
  if (errors.length > 0) {
    return {
      library: fallback,
      warning: warningFor(`本地书库结构无效：${errors.slice(0, 3).join('；')}`),
    }
  }

  return { library: parsed, warning: null }
}

export function saveLibrary(storage = defaultStorage(), library) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, error: '无法访问本地存储。' }
  }

  let serialized
  try {
    serialized = serializeLibrary(library)
  } catch (error) {
    return { ok: false, error: error?.message || '书库无法保存。' }
  }

  try {
    storage.setItem(STORAGE_KEY, serialized)
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: `保存本地书库失败：${error?.message || '存储空间或权限不足'}` }
  }
}

export function upsertStory(library, story) {
  const base = isRecord(library) ? library : emptyLibrary()
  const stories = Array.isArray(base.stories) ? [...base.stories] : []

  if (!isRecord(story) || !isNonEmptyString(story.id)) {
    return { ...base, stories }
  }

  const nextStory = { ...story }
  const existingIndex = stories.findIndex((item) => isRecord(item) && item.id === story.id)
  if (existingIndex === -1) stories.push(nextStory)
  else stories[existingIndex] = nextStory

  return { ...base, stories, activeStoryId: story.id }
}

function valueFrom(source, keys) {
  if (!isRecord(source)) return undefined
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key]
  }
  return undefined
}

function displayValue(value, fallback = undefined) {
  if (isRecord(value)) {
    value = valueFrom(value, ['name', 'title', 'label', 'value', 'id'])
  }
  return ['string', 'number', 'boolean'].includes(typeof value) && value !== '' ? value : fallback
}

function idValue(value, fallback = undefined) {
  if (isRecord(value)) return displayValue(valueFrom(value, ['id']), fallback)
  return displayValue(value, fallback)
}

function legacyDraft(source) {
  const root = isRecord(source?.draft) ? { ...source, ...source.draft } : source
  if (!isRecord(root)) return null

  const world = root.world ?? root.worldConfig
  const protagonist = root.protagonist ?? root.character
  const ability = root.ability ?? root.power
  const tone = root.tone ?? root.narrativeTone

  const draft = {
    storyId: displayValue(root.storyId),
    chapter: displayValue(root.chapter ?? root.chapterIndex),
    lastChoice: displayValue(root.lastChoice ?? root.choice),
    preheatStatus: displayValue(root.preheatStatus),
    updatedAt: displayValue(root.updatedAt),
    firstBook: displayValue(root.firstBook),
    worldId: idValue(valueFrom(world, ['id']) ?? world ?? root.worldId),
    worldName: displayValue(world, displayValue(root.worldName)),
    worldLabel: displayValue(valueFrom(world, ['label', 'genre']) ?? root.worldLabel),
    protagonistName: displayValue(valueFrom(protagonist, ['name']) ?? protagonist ?? root.protagonistName),
    protagonistTrait: displayValue(valueFrom(protagonist, ['trait']) ?? root.protagonistTrait),
    protagonistOrigin: displayValue(valueFrom(protagonist, ['origin']) ?? root.protagonistOrigin),
    protagonistImmersive: displayValue(valueFrom(protagonist, ['immersive']) ?? root.protagonistImmersive),
    hometown: displayValue(valueFrom(protagonist, ['hometown']) ?? root.hometown),
    role: displayValue(valueFrom(protagonist, ['role']) ?? root.role),
    abilityId: idValue(valueFrom(ability, ['id']) ?? ability ?? root.abilityId),
    abilityName: displayValue(ability, displayValue(root.abilityName)),
    abilityDescription: displayValue(valueFrom(ability, ['desc', 'description']) ?? root.abilityDescription),
    toneId: idValue(valueFrom(tone, ['id']) ?? tone ?? root.toneId),
    toneName: displayValue(tone, displayValue(root.toneName)),
    toneDescription: displayValue(valueFrom(tone, ['desc', 'description']) ?? root.toneDescription),
  }

  const hasLegacyValue = Object.values(draft).some((value) => value !== undefined)
  return hasLegacyValue ? draft : null
}

export function migrateLegacy(storage = defaultStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return null

  let raw
  try {
    raw = storage.getItem(LEGACY_STORAGE_KEY)
  } catch {
    return null
  }

  if (raw === null || raw === undefined || raw === '') return null

  try {
    const draft = legacyDraft(JSON.parse(raw))
    return draft ? { draft } : null
  } catch {
    return null
  }
}

export { validateLibrary }
