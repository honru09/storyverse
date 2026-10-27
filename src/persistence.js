export const STORAGE_KEY = 'storyweave:v2'

const LEGACY_STORAGE_KEY = 'storyweave:story-state'
const CURRENT_VERSION = 2
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024

// A story's chapter total derives from its length mode (mirrors the
// engine's STORY_LENGTH_MODES so this storage layer stays dependency-free):
// short 6 / season 24 / long 100; merged stories and pre-mode saves are 6.
// The cursor points to the next accepted chapter and stays at total-1 once
// the final chapter exists.
const LENGTH_TOTALS = { short: 6, season: 24, long: 100 }
const MAX_SUPPORTED_CHAPTERS = 100
const totalForStory = (story) => {
  if (story?.kind === 'merged') return 6
  return LENGTH_TOTALS[story?.config?.storyLengthMode] || 6
}
const CONFIG_TEXT_FIELDS = [
  'genreId', 'genreTemplateId', 'storyLengthMode', 'originIdentityId', 'customWorldName', 'customWorldSetting', 'startPointName', 'startPointHook', 'name', 'trait', 'origin', 'ability', 'tone', 'hometown',
  'school', 'company', 'role', 'friend', 'destination', 'protagonist',
]

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

function validateConfig(config, prefix, errors, merged = false) {
  if (!isRecord(config)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  validateOptionalFields(config, prefix, CONFIG_TEXT_FIELDS, 'string', errors)
  validateOptionalFields(config, prefix, ['immersive', 'worldChosen'], 'boolean', errors)
  validateOptionalFields(config, prefix, ['seasonNumber'], 'number', errors)
  if (config.storyLengthMode !== undefined && !['short', 'season', 'long'].includes(config.storyLengthMode)) {
    errors.push(`${prefix}.storyLengthMode is invalid`)
  }
  if (config.step !== undefined && (!Number.isInteger(config.step) || config.step < 1 || config.step > 7)) {
    errors.push(`${prefix}.step must be an integer from 1 to 7`)
  }
  if (config.sourceGenres !== undefined) validateStringArray(config.sourceGenres, `${prefix}.sourceGenres`, errors)
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

  // Decision chapters repeat on the six-chapter rhythm in every length mode.
  const expectedIds = index % 6 === 1
    ? (merged ? ['join', 'guard'] : ['open', 'wait'])
    : index % 6 === 3 ? (merged ? ['bridge', 'separate'] : ['cross', 'return']) : null
  if (!expectedIds) {
    if (chapter.choice != null) errors.push(`${prefix}.choice is not available for this chapter`)
    return
  }
  if (!isRecord(chapter.choice)) {
    errors.push(`${prefix}.choice must be an object at a decision chapter`)
    return
  }
  if (!isNonEmptyString(chapter.choice.prompt)) errors.push(`${prefix}.choice.prompt must be a non-empty string`)
  const options = chapter.choice.options
  if (!Array.isArray(options) || options.length !== expectedIds.length) {
    errors.push(`${prefix}.choice.options must contain both branches`)
    return
  }
  const ids = new Set()
  for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
    const option = options[optionIndex]
    const optionPrefix = `${prefix}.choice.options[${optionIndex}]`
    if (!isRecord(option)) errors.push(`${optionPrefix} must be an object`)
    else {
      if (!expectedIds.includes(option.id) || ids.has(option.id)) errors.push(`${optionPrefix}.id is invalid or duplicated`)
      ids.add(option.id)
      if (!isNonEmptyString(option.label)) errors.push(`${optionPrefix}.label must be a non-empty string`)
      validateOptionalFields(option, optionPrefix, ['detail', 'consequence'], 'string', errors)
    }
  }
}

function validateStory(story, prefix) {
  const errors = []

  if (!isRecord(story)) return [`${prefix} must be an object`]
  if (!isNonEmptyString(story.id)) errors.push(`${prefix}.id must be a non-empty string`)
  if (!isNonEmptyString(story.title)) errors.push(`${prefix}.title must be a non-empty string`)
  if (!isNonEmptyString(story.genreId)) errors.push(`${prefix}.genreId must be a non-empty string`)
  validateConfig(story.config, `${prefix}.config`, errors, story.kind === 'merged')
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
  if (!Number.isInteger(story.revision) || story.revision < 0) {
    errors.push(`${prefix}.revision must be a non-negative integer`)
  }
  if (story.readerIndex !== undefined && (!Number.isInteger(story.readerIndex) || story.readerIndex < 0)) {
    errors.push(`${prefix}.readerIndex must be a non-negative integer`)
  }
  validateOptionalFields(story, prefix, ['author', 'createdAt', 'updatedAt', 'status', 'genreTemplateId', 'previousSeasonId'], 'string', errors)
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
