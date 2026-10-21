export const STORAGE_KEY = 'storyweave:v2'

const LEGACY_STORAGE_KEY = 'storyweave:story-state'
const CURRENT_VERSION = 2

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

function validateStory(story, index) {
  const errors = []
  const prefix = `stories[${index}]`

  if (!isRecord(story)) return [`${prefix} must be an object`]
  if (!isNonEmptyString(story.id)) errors.push(`${prefix}.id must be a non-empty string`)
  if (!isNonEmptyString(story.title)) errors.push(`${prefix}.title must be a non-empty string`)
  if (!isNonEmptyString(story.genreId)) errors.push(`${prefix}.genreId must be a non-empty string`)
  if (!isRecord(story.config)) errors.push(`${prefix}.config must be an object`)
  if (!isRecord(story.worldBible)) errors.push(`${prefix}.worldBible must be an object`)
  if (!Number.isInteger(story.chapterIndex) || story.chapterIndex < 0) {
    errors.push(`${prefix}.chapterIndex must be a non-negative integer`)
  }
  if (!Array.isArray(story.chapters)) errors.push(`${prefix}.chapters must be an array`)
  // StoryWeave v2 stores choices as an index -> choice id map. Keep accepting
  // the early array shape so old test fixtures and hand-written snapshots can
  // still be opened without wiping the user's library.
  if (!Array.isArray(story.choices) && !isRecord(story.choices)) {
    errors.push(`${prefix}.choices must be an array or object`)
  }
  if (!Number.isInteger(story.revision) || story.revision < 0) {
    errors.push(`${prefix}.revision must be a non-negative integer`)
  }

  return errors
}

function validateLibrary(library) {
  if (!isRecord(library)) return ['library must be an object']
  const errors = []

  if (library.version !== CURRENT_VERSION) errors.push(`version must be ${CURRENT_VERSION}`)
  if (!Array.isArray(library.stories)) errors.push('stories must be an array')
  if (library.activeStoryId !== null && !isNonEmptyString(library.activeStoryId)) {
    errors.push('activeStoryId must be null or a non-empty string')
  }
  if (!Array.isArray(library.publications)) errors.push('publications must be an array')
  if (!Array.isArray(library.favorites)) errors.push('favorites must be an array')
  if (library.draft !== null && !isRecord(library.draft)) errors.push('draft must be null or an object')

  if (Array.isArray(library.stories)) {
    const seen = new Set()
    library.stories.forEach((story, index) => {
      errors.push(...validateStory(story, index))
      if (isRecord(story) && isNonEmptyString(story.id)) {
        if (seen.has(story.id)) errors.push(`stories contains duplicate id: ${story.id}`)
        seen.add(story.id)
      }
    })
  }

  return errors
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

  const errors = validateLibrary(library)
  if (errors.length > 0) {
    return { ok: false, error: `书库结构无效：${errors.slice(0, 3).join('；')}` }
  }

  let serialized
  try {
    serialized = JSON.stringify(library)
  } catch (error) {
    return { ok: false, error: `书库无法序列化：${error?.message || '未知错误'}` }
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
    return valueFrom(value, ['name', 'title', 'label', 'value', 'id']) ?? fallback
  }
  return value === undefined || value === null || value === '' ? fallback : value
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
