import { randomUUID } from 'node:crypto'
import { ApiError, sanitizeSettingText } from './gemini.js'
import { findSettingViolation } from '../src/setting-guard.js'
import { plazaSnapshot } from '../src/story-engine.js'
import { PLAZA_REPORT_THRESHOLD, plazaGateFor } from '../src/plaza.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import { avatarAppearanceText } from '../src/avatar.js'
import { createPlazaStore } from './plaza-store.js'
import { createAvatarStore } from './avatar-store.js'
import { createCoverStore } from './cover-store.js'
import { createSocialStore, pictureSourceFor } from './social-store.js'

/**
 * The plaza service: publication of avatar lines (finished lines whole,
 * endless lines as living publications while still serialising), the
 * public feed and detail, and the minimal moderation loop (report →
 * auto-hide, author withdraw).
 *
 * Trust boundaries:
 * - The publish endpoint re-checks everything the client claims: the
 *   story must validate as a library story, pass the shared publish gate
 *   (avatar line; season/long/custom finished, or endless at ≥1 chapter),
 *   belong to the caller's CURRENT
 *   avatar (the avatar snapshot is read from the caller's own server-side
 *   profile, never from the request body), and pass the setting-guard
 *   red-line scan over the world setting and every chapter.
 * - What is stored is the engine's sanitized snapshot (private free-form
 *   fields stripped, private literals scrubbed from prose). The record
 *   additionally carries server-only fields — author uid, reporter uids —
 *   which summaryOf/detailOf never copy out.
 */
const clip = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : ''

function authorNameFor(identity) {
  // A public author name is never an email address: an identity whose
  // only "name" is its email (email/password or email-code accounts
  // that never set a name) yields no name here, and callers fall back
  // to their own neutral label. Copying the email into author fields
  // once put users' addresses on plaza cards and profile titles.
  const name = sanitizeSettingText(clip(identity?.displayName, 40)).trim()
  return name && !name.includes('@') ? name : ''
}

function summaryOf(record) {
  return {
    id: record.id,
    title: record.title,
    authorName: record.authorName,
    avatar: record.avatar,
    genreId: record.genreId,
    genreTemplateId: record.genreTemplateId,
    worldName: record.worldName,
    storyLengthMode: record.storyLengthMode,
    seasonNumber: record.seasonNumber,
    chapterCount: record.chapterCount,
    totalChapters: record.totalChapters,
    // Living-publication state: a still-running endless line serialises
    // (its chapter count is the live one); everything else is finished.
    // Older records predate the field and read as finished.
    lineStatus: record.lineStatus === 'serializing' ? 'serializing' : 'finished',
    premise: clip(record.snapshot?.worldBible?.premise, 120),
    publishedAt: record.publishedAt,
    completedAt: record.lineStatus === 'serializing' ? null : (record.completedAt || record.publishedAt),
    // The story's own generated cover, resolved live by the identity
    // pass below (null until one exists — surfaces then fall back to
    // the shared world artwork, exactly as before covers existed).
    coverUrl: typeof record.coverUrl === 'string' && record.coverUrl ? record.coverUrl : null,
  }
}

function detailOf(record) {
  return {
    ...summaryOf(record),
    // The author's uid rides along on feed/detail payloads only, so a
    // reader can open the author's public profile. It is an opaque id
    // (or the public username); the publish response keeps using the
    // bare summary, and emails never appear anywhere.
    authorUid: record.authorUid,
    worldBible: record.snapshot.worldBible,
    beats: record.snapshot.beats,
    enterTemplate: record.snapshot.enterTemplate,
    snapshot: {
      config: record.snapshot.config,
      chapters: record.snapshot.chapters,
      choices: record.snapshot.choices,
      ...(record.snapshot.engine ? { engine: record.snapshot.engine } : {}),
    },
  }
}

const NOT_FOUND = () => new ApiError(404, '这条故事线已下架或不存在。')

function redLineViolation(story) {
  const texts = []
  const push = (value) => { if (typeof value === 'string' && value) texts.push(value) }
  push(story.config?.customWorldName)
  push(story.config?.customWorldSetting)
  const bible = story.worldBible || {}
  push(bible.premise)
  push(bible.endingAnchor)
  for (const line of Array.isArray(bible.rules) ? bible.rules : []) push(line)
  for (const line of Array.isArray(bible.outline) ? bible.outline : []) push(line)
  for (const chapter of Array.isArray(story.chapters) ? story.chapters : []) {
    push(chapter?.title)
    push(chapter?.summary)
    for (const line of Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : []) push(line)
    for (const line of Array.isArray(chapter?.events) ? chapter.events : []) push(line)
    for (const line of Array.isArray(chapter?.foreshadowing) ? chapter.foreshadowing : []) push(line)
    push(chapter?.choice?.prompt)
    for (const option of Array.isArray(chapter?.choice?.options) ? chapter.choice.options : []) {
      push(option?.label)
      push(option?.detail)
      push(option?.consequence)
    }
  }
  for (const text of texts) {
    const violation = findSettingViolation(text)
    if (violation) return violation
  }
  return null
}

// The god-mode setting is the one free-form text a snapshot keeps verbatim
// (it IS the world). It still goes through the same structural-impersonation
// scrub as every other prompt-bound text before it is stored, and any
// verbatim copy inside the bible follows it.
function scrubSnapshotSetting(snapshot) {
  const raw = snapshot.enterTemplate?.config?.customWorldSetting || ''
  if (!raw) return snapshot
  const safe = sanitizeSettingText(raw)
  if (safe === raw) return snapshot
  const swap = (value) => typeof value === 'string' ? value.split(raw).join(safe) : value
  const bible = snapshot.worldBible || {}
  const nextBible = {
    premise: swap(bible.premise || ''),
    rules: (bible.rules || []).map(swap),
    endingAnchor: swap(bible.endingAnchor || ''),
    outline: (bible.outline || []).map(swap),
  }
  return {
    ...snapshot,
    worldBible: nextBible,
    config: { ...snapshot.config, customWorldSetting: safe },
    enterTemplate: {
      ...snapshot.enterTemplate,
      config: { ...snapshot.enterTemplate.config, customWorldSetting: safe },
      worldBible: nextBible,
    },
  }
}

export function createPlazaService({ env = process.env, store, avatarStore, socialStore, coverStore, now = () => new Date() } = {}) {
  const backend = store === undefined ? createPlazaStore({ env }) : store
  const avatars = avatarStore === undefined ? createAvatarStore({ env }) : avatarStore
  const socialBackend = socialStore === undefined ? createSocialStore({ env }) : socialStore
  const covers = coverStore === undefined ? createCoverStore({ env }) : coverStore
  const tails = new Map()
  const serialise = (key, task) => {
    const previous = tails.get(key) || Promise.resolve()
    const run = previous.then(task, task)
    tails.set(key, run.catch(() => {}))
    return run
  }

  async function findOwnPublication(uid, sourceStoryId) {
    const all = await backend.listPublications()
    return all.find((record) => record.authorUid === uid && record.sourceStoryId === sourceStoryId) || null
  }

  // The avatar snapshot stores a portrait REFERENCE, not a copy: whether
  // a portrait exists follows the author's current profile, so painting
  // (or repainting) after publishing lights the card up without a
  // re-publish. The author's public identity resolves through their
  // profile record the same way: a custom display name set on the
  // 编辑资料 sheet replaces the publish-time name everywhere, and the
  // author picture follows the shared chain (uploaded picture → avatar
  // portrait → the designed default avatar asset).
  async function withAuthorIdentity(record) {
    let portraitReady = Boolean(record.avatar?.hasPortrait)
    if (avatars) {
      try {
        const profileRecord = await avatars.getProfile(record.authorUid)
        portraitReady = profileRecord?.avatar?.portrait?.status === 'ready'
      } catch { /* keep the publish-time flag */ }
    }
    let authorName = record.authorName
    let pictureKind = 'default'
    let pictureUrl = '/default-avatar.svg'
    if (socialBackend) {
      try {
        const profileRecord = await socialBackend.getProfileRecord(record.authorUid)
        if (profileRecord?.displayName) authorName = profileRecord.displayName
        const hasUpload = Boolean(await socialBackend.getPicture(record.authorUid))
        pictureKind = pictureSourceFor(profileRecord, { hasUpload, portraitReady })
        pictureUrl = pictureKind === 'default'
          ? '/default-avatar.svg'
          : `/api/users/${encodeURIComponent(record.authorUid)}/picture?v=${profileRecord?.pictureVersion || 0}`
      } catch { /* fall back to the default asset */ }
    } else if (portraitReady) {
      pictureKind = 'avatar'
      pictureUrl = `/api/users/${encodeURIComponent(record.authorUid)}/picture?v=0`
    }
    // The publication's own cover follows the same live-reference rule
    // as the portrait: the cover store is keyed by author + source
    // story, so painting (or repainting) the book lights its plaza and
    // profile cards up without a re-publish. The URL rides under the
    // publication id, so no account id is exposed to fetch it.
    let coverUrl = null
    if (covers) {
      try {
        const coverRecord = await covers.getCover(record.authorUid, record.sourceStoryId)
        if (coverRecord?.image) {
          coverUrl = `/api/plaza/${encodeURIComponent(record.id)}/cover?v=${coverRecord.version || 1}`
        }
      } catch { /* the world artwork remains the fallback */ }
    }
    return {
      ...record,
      authorName,
      coverUrl,
      avatar: { ...record.avatar, hasPortrait: portraitReady, pictureKind, pictureUrl },
    }
  }

  return {
    available: backend !== null && backend !== undefined,

    async feed() {
      if (!backend) return []
      const all = await backend.listPublications()
      const visible = all
        .filter((record) => record.status === 'published')
        .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
      return (await Promise.all(visible.map(withAuthorIdentity)))
        .map((record) => ({ ...summaryOf(record), authorUid: record.authorUid }))
    },

    async detail(id) {
      if (!backend) throw NOT_FOUND()
      const record = await backend.getPublication(id)
      if (!record || record.status !== 'published') throw NOT_FOUND()
      return detailOf(await withAuthorIdentity(record))
    },

    async publish(identity, body) {
      if (!backend) throw new ApiError(503, '广场服务尚未配置。')
      return serialise(`publish:${identity.uid}`, async () => {
        const story = body && typeof body === 'object' ? body.story : null
        if (!story || typeof story !== 'object' || Array.isArray(story)) {
          throw new ApiError(400, '没有收到要发布的故事线。')
        }
        const errors = validateLibrary({ ...emptyLibrary(), stories: [story] })
        if (errors.length) throw new ApiError(400, '这条故事线的数据不完整，暂时不能发布。')
        const gate = plazaGateFor(story)
        if (!gate.publishable) throw new ApiError(400, gate.reason)
        if (!avatars) throw new ApiError(400, '先创建你的化身，再发布它的故事线。')
        // The line may have been lived by ANY of the author's avatars,
        // not only the main one: resolve the avatar that walked it from
        // the collection (legacy single-avatar records resolve the same
        // way through collectionFromRecord inside the store).
        const collection = typeof avatars.getCollection === 'function'
          ? await avatars.getCollection(identity.uid)
          : null
        let profile = collection?.avatars.find((item) => item.id === story.config.avatarId) || null
        if (!collection) {
          const legacy = (await avatars.getProfile(identity.uid))?.avatar || null
          if (legacy?.id === story.config.avatarId) profile = legacy
        }
        if (!profile) {
          throw new ApiError(400, '这条故事线不是用你的化身走完的，无法发布。')
        }
        const violation = redLineViolation(story)
        if (violation) throw new ApiError(400, violation)
        const snapshot = scrubSnapshotSetting(plazaSnapshot(story, { avatarName: profile.name }))
        const timestamp = now().toISOString()
        const existing = await findOwnPublication(identity.uid, story.id)
        const record = {
          id: existing?.id || `pub-${randomUUID().slice(0, 12)}`,
          authorUid: identity.uid,
          authorName: authorNameFor(identity) || '织界旅人',
          sourceStoryId: story.id,
          title: snapshot.title,
          genreId: snapshot.genreId,
          genreTemplateId: snapshot.genreTemplateId,
          worldName: snapshot.worldName,
          storyLengthMode: snapshot.storyLengthMode,
          seasonNumber: snapshot.seasonNumber,
          chapterCount: snapshot.chapters.length,
          totalChapters: snapshot.totalChapters,
          // The snapshot's own publication state: 'serializing' while an
          // endless line still runs — re-publishes (the client's live
          // sync) keep the snapshot and count current, and the record
          // flips to 'finished' when the line is finished by hand.
          lineStatus: gate.lineStatus,
          avatar: {
            name: profile.name,
            appearance: avatarAppearanceText(profile.appearance),
            hasPortrait: profile.portrait?.status === 'ready',
          },
          snapshot,
          status: 'published',
          reporters: existing?.reporters || [],
          createdAt: existing?.createdAt || timestamp,
          // The line's finish line: for a finished line, the story's own
          // last-accept stamp (acceptChapter maintains updatedAt), falling
          // back to the publish instant for stories that carry none. A
          // still-serialising endless line has no finish line yet — the
          // field stays empty until the sync that carries its manual
          // finish arrives.
          completedAt: gate.lineStatus === 'serializing'
            ? null
            : existing?.completedAt
              || (typeof story.updatedAt === 'string' && !Number.isNaN(Date.parse(story.updatedAt)) ? story.updatedAt : timestamp),
          publishedAt: timestamp,
          updatedAt: timestamp,
        }
        await backend.putPublication(record)
        return summaryOf(record)
      })
    },

    async report(identity, id) {
      if (!backend) throw NOT_FOUND()
      return serialise(`publication:${id}`, async () => {
        const record = await backend.getPublication(id)
        if (!record || record.status !== 'published') throw NOT_FOUND()
        if (record.authorUid === identity.uid) throw new ApiError(400, '这是你发布的故事线，不能举报。')
        const reporters = Array.isArray(record.reporters) ? [...record.reporters] : []
        if (!reporters.includes(identity.uid)) reporters.push(identity.uid)
        const next = { ...record, reporters, updatedAt: now().toISOString() }
        if (reporters.length >= PLAZA_REPORT_THRESHOLD && next.status === 'published') {
          next.status = 'hidden'
          next.hiddenReason = 'reports'
          next.hiddenAt = now().toISOString()
        }
        await backend.putPublication(next)
        return { reported: true }
      })
    },

    async withdraw(identity, id) {
      if (!backend) throw NOT_FOUND()
      return serialise(`publication:${id}`, async () => {
        const record = await backend.getPublication(id)
        if (!record || record.authorUid !== identity.uid) throw NOT_FOUND()
        if (record.status !== 'withdrawn') {
          await backend.putPublication({
            ...record,
            status: 'withdrawn',
            withdrawnAt: now().toISOString(),
            updatedAt: now().toISOString(),
          })
        }
        return { withdrawn: true, id: record.id }
      })
    },

    /** The story's own generated cover, served under the publication so no account id is ever exposed. */
    async cover(id) {
      if (!backend || !covers) return null
      const record = await backend.getPublication(id)
      if (!record || record.status !== 'published') return null
      const coverRecord = await covers.getCover(record.authorUid, record.sourceStoryId)
      if (!coverRecord?.image) return null
      return {
        buffer: Buffer.from(coverRecord.image, 'base64'),
        contentType: coverRecord.contentType || 'image/jpeg',
      }
    },

    /** The author's current portrait, served under the publication so no account id is ever exposed. */
    async portrait(id) {
      if (!backend || !avatars) return null
      const record = await backend.getPublication(id)
      if (!record || record.status !== 'published') return null
      const image = await avatars.getImage(record.authorUid, 'current')
      if (!image?.image) return null
      return {
        buffer: Buffer.from(image.image, 'base64'),
        contentType: image.contentType || 'image/jpeg',
      }
    },
  }
}

// Shared with the social service: profile pages resolve author display
// names and publication summaries through exactly the same helpers the
// plaza itself uses, so a name reads identically everywhere it appears.
export { authorNameFor as plazaAuthorNameFor, summaryOf as plazaSummaryOf }
