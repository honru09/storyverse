import { randomUUID } from 'node:crypto'
import { ApiError, sanitizeSettingText } from './gemini.js'
import { findSettingViolation } from '../src/setting-guard.js'
import { isManualStory, plazaSnapshot, redactedTitleFor, shelfForTemplate } from '../src/story-engine.js'
import { cleanBookTitle, manualSnapshotFor, PLAZA_REPORT_THRESHOLD, plazaGateFor, plazaTemplateNameFor, plazaWorldIntroFor, snapshotSourceViolation, WORLD_INTRO_VERSION } from '../src/plaza.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'
import { avatarAppearanceText } from '../src/avatar.js'
import { usernameUid } from './username-auth.js'
import { createPlazaStore } from './plaza-store.js'
import { createReadCountStore } from './read-count-store.js'
import { dayKeyFor } from './usage.js'
import { createAvatarStore } from './avatar-store.js'
import { createCoverStore } from './cover-store.js'
import { createSocialStore, pictureSourceFor } from './social-store.js'
// publicHandle is a hoisted pure helper; social.js already imports
// from this module the same way, and neither side calls the other
// during module evaluation.
import { publicHandle } from './social.js'

/**
 * The bookstore service (the plaza service, renamed by BOOKSTORE-PLAZA:
 * publishing a line now means shelving it in the bookstore — the
 * formal catalogue): publication of avatar lines (finished lines
 * whole, endless lines as living publications while still
 * serialising), the catalogue list and book detail, and the minimal
 * moderation loop (report → auto-hide, author withdraw). The social
 * timeline that used to BE the plaza lives in plaza-feed.js; the two
 * services meet at bookCardFor / adjustShareCount.
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

// The designated official accounts: lines published from here are the
// site's own showcase samples, labelled 官方示例 everywhere they render.
// The flag is DERIVED from the author's uid at read time — it is never
// read from a request body or a client-supplied record field, so no
// client input can claim it. The usernames are server-owned constants
// (the registration in COLDSTART.md claims the first that is free; the
// fallback name stays official so the sample survives either way).
export const OFFICIAL_USERNAMES = ['storyweave', 'storyweave_official']
export const isOfficialUid = (uid) => typeof uid === 'string'
  && OFFICIAL_USERNAMES.some((name) => uid === usernameUid(name))

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
    // The author's public @ID for the card byline (COVER-FIX),
    // resolved live by the identity pass below; '' when the author
    // has none a card may show.
    authorHandle: typeof record.authorHandle === 'string' ? record.authorHandle : '',
    // Official-sample flag, derived from the server-side author uid —
    // see OFFICIAL_USERNAMES above. Rides every summary surface (feed,
    // detail, author profiles) because they all pass through here.
    official: isOfficialUid(record.authorUid),
    // 自己写 (WRITE-MODE §50): a hand-written book shelves beside the
    // avatar lines with no special card treatment; the flag exists so
    // the detail page can label it 作者手写 and hide the enter/fusion
    // entries that do not exist for it.
    manual: record.manual === true,
    avatar: record.avatar,
    genreId: record.genreId,
    genreTemplateId: record.genreTemplateId,
    // The L1 family shelf this book files under in the bookstore
    // (BOOKSTORE-PLAZA): derived from the template, never stored, so
    // the taxonomy can be re-shelved without touching records. A
    // hand-written book carries the family its author picked at
    // creation time (it has no template to derive one from).
    shelfId: (typeof record.manualShelfId === 'string' && record.manualShelfId)
      || shelfForTemplate(record.genreTemplateId)?.id || '',
    worldName: record.worldName,
    // Real counters only (BOOKSTORE-PLAZA): how many plaza posts share
    // this book, maintained by the feed service as posts come and go;
    // the rating pair (RATINGS) is the ratings service's denormalised
    // summary of the book's real rating records — honestly zero until
    // a real rating exists, and never set by anything else. readCount
    // (READ-COUNT, REQ-42) is the read claims' denormalised total:
    // signed-in non-author readers who opened the book's text, once
    // per reader per day — honestly zero until a real read exists.
    shareCount: Math.max(0, record.shareCount || 0),
    ratingAverage: typeof record.ratingAverage === 'number' ? record.ratingAverage : 0,
    ratingCount: Math.max(0, record.ratingCount || 0),
    readCount: Math.max(0, record.readCount || 0),
    // Fused-line provenance (FUSION2): a fused endless line publishes
    // like any endless line; the flag and the two source titles (already
    // redacted inside the snapshot) let every surface label it
    // 「由《A》×《B》融合而来」. The source ids never leave the server.
    merged: record.merged === true,
    sourceTitles: Array.isArray(record.sourceTitles) ? record.sourceTitles : [],
    storyLengthMode: record.storyLengthMode,
    seasonNumber: record.seasonNumber,
    chapterCount: record.chapterCount,
    totalChapters: record.totalChapters,
    // Living-publication state: a still-running endless line serialises
    // (its chapter count is the live one); everything else is finished.
    // Older records predate the field and read as finished.
    lineStatus: record.lineStatus === 'serializing' ? 'serializing' : 'finished',
    premise: clip(record.snapshot?.worldBible?.premise, 120),
    // The owner's own blurb, when the published snapshot carries one
    // (EDIT-BOOK): surfaces prefer it over the premise as the book's
    // introduction. Empty string on every pre-synopsis publication.
    synopsis: clip(record.snapshot?.synopsis, 300),
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
    worldIntro: record.worldIntro || null,
    worldIntroVersion: record.worldIntroVersion || 0,
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

/**
 * The 热门 ranking's rating prior strength (RATINGS): a book's mean
 * stars enter its heat at weight count / (count + this). Ten real
 * ratings halve the shrinkage; one rating barely moves the needle,
 * so a brand-new book with a single friendly 5-star can never ride
 * its average past books with real shares and likes.
 */
export const RATING_PRIOR_STRENGTH = 10

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

export function createPlazaService({ env = process.env, store, avatarStore, socialStore, coverStore, readStore, now = () => new Date() } = {}) {
  const backend = store === undefined ? createPlazaStore({ env }) : store
  const readClaims = readStore === undefined ? createReadCountStore({ env }) : readStore
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
    // The byline's @ID: a handle claimed on the profile record wins;
    // a username account's @ID is its login name, carried in the uid
    // itself (the profile page resolves it the same way). Email-shaped
    // values are credentials, never handles — publicHandle drops them.
    let authorHandle = ''
    let pictureKind = 'default'
    let pictureUrl = '/default-avatar.svg'
    if (socialBackend) {
      try {
        const profileRecord = await socialBackend.getProfileRecord(record.authorUid)
        if (profileRecord?.displayName) authorName = profileRecord.displayName
        authorHandle = publicHandle(profileRecord?.handle)
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
    if (!authorHandle && typeof record.authorUid === 'string' && record.authorUid.startsWith('username:')) {
      authorHandle = publicHandle(record.authorUid.slice('username:'.length))
    }
    return {
      ...record,
      authorName,
      authorHandle,
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

    /**
     * The bookstore catalogue (BOOKSTORE-PLAZA): published books only,
     * optionally narrowed to one family shelf and/or a plain substring
     * search over title, author and world. Rankings are honest by
     * construction — 'latest' is shelving time, 'complete' is finish
     * time over finished books only, and 'hot' is real engagement: the
     * book's share count plus the likes its share posts earned (the
     * caller supplies that map from the feed service; without it the
     * share count alone ranks). Nothing is ever synthesised.
     */
    async books({ shelfId = '', sort = 'latest', q = '', limit = 50, engagement = null } = {}) {
      if (!backend) return { books: [], total: 0 }
      const all = await backend.listPublications()
      const visible = all.filter((record) => record.status === 'published')
      const enriched = await Promise.all(visible.map(withAuthorIdentity))
      let books = enriched.map((record) => ({ ...summaryOf(record), authorUid: record.authorUid }))
      if (shelfId) books = books.filter((book) => book.shelfId === shelfId)
      const needle = typeof q === 'string' ? q.trim().toLowerCase() : ''
      if (needle) {
        books = books.filter((book) => [book.title, book.authorName, book.worldName]
          .some((value) => String(value || '').toLowerCase().includes(needle)))
      }
      if (sort === 'complete') {
        books = books
          .filter((book) => book.lineStatus !== 'serializing')
          .sort((a, b) => String(b.completedAt || b.publishedAt).localeCompare(String(a.completedAt || a.publishedAt)))
      } else if (sort === 'hot') {
        // Ratings join the heat SHRUNK (RATINGS): the average counts
        // at weight n/(n+10), so a single 5-star rating contributes
        // ≈0.45 — visible, but it can never outrank one real share —
        // while a book with a dozen ratings earns its average almost
        // in full. Real engagement (shares + post likes) stays the
        // spine of the ranking; the average itself is display-only
        // everywhere else.
        const ratingHeat = (book) => (book.ratingCount || 0) > 0
          ? (book.ratingAverage || 0) * (book.ratingCount / (book.ratingCount + RATING_PRIOR_STRENGTH))
          : 0
        const heat = (book) => (book.shareCount || 0) + (engagement?.get(book.id) || 0) + ratingHeat(book)
        books = books.sort((a, b) => heat(b) - heat(a)
          || String(b.publishedAt).localeCompare(String(a.publishedAt)))
      } else {
        books = books.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
      }
      const total = books.length
      const pageSize = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50))
      return { books: books.slice(0, pageSize), total }
    },

    /**
     * The card a plaza share post embeds for its book, resolved at
     * read time: a live summary while the book is shelved; just the
     * pure title and the state when it is not (withdrawn by its
     * author, or hidden by reports) so the post can render its 已下架
     * placeholder; null when the record itself is gone (the book was
     * deleted), which the caller renders as the deleted placeholder
     * under the title the post kept. Re-shelving the same book flips
     * every historical post's card back to the live summary on its
     * own — nothing here is cached into the post.
     */
    async bookCardFor(id) {
      if (!backend) return null
      const record = await backend.getPublication(id)
      if (!record) return null
      if (record.status !== 'published') {
        return { status: record.status, id: record.id, title: record.title }
      }
      const enriched = await withAuthorIdentity(record)
      return { status: 'published', book: { ...summaryOf(enriched), authorUid: record.authorUid } }
    },

    /**
     * The share counter the feed service maintains as posts come and
     * go. Any record state counts (a withdrawn book keeps the shares
     * it had; they show again if it is re-shelved). Floors at zero;
     * a missing record is a no-op, never an error — a post about a
     * since-deleted book must not fail to be deleted itself.
     */
    async adjustShareCount(id, delta) {
      if (!backend) return null
      return serialise(`publication:${id}`, async () => {
        const record = await backend.getPublication(id)
        if (!record) return null
        const shareCount = Math.max(0, (record.shareCount || 0) + delta)
        if (shareCount === (record.shareCount || 0)) return shareCount
        await backend.putPublication({ ...record, shareCount, updatedAt: now().toISOString() })
        return shareCount
      })
    },

    /**
     * The rating summary the ratings service mirrors onto the book
     * after every rating write (RATINGS): it recomputes the pair
     * from the rating records (the source of truth) and this applies
     * it, serialised with the record's other counter writes. Any
     * record state accepts the mirror (a withdrawn book keeps the
     * ratings it earned; they show again if it is re-shelved); a
     * missing record is a no-op, never an error.
     */
    async syncRatingSummary(id, { ratingAverage = 0, ratingCount = 0 } = {}) {
      if (!backend) return null
      return serialise(`publication:${id}`, async () => {
        const record = await backend.getPublication(id)
        if (!record) return null
        const next = {
          ratingAverage: typeof ratingAverage === 'number' && Number.isFinite(ratingAverage) ? ratingAverage : 0,
          ratingCount: Math.max(0, Math.trunc(ratingCount) || 0),
        }
        if (next.ratingAverage === (record.ratingAverage || 0) && next.ratingCount === (record.ratingCount || 0)) {
          return next
        }
        await backend.putPublication({ ...record, ...next, updatedAt: now().toISOString() })
        return next
      })
    },

    /**
     * Record one read of a shelved book (READ-COUNT, REQ-42). The
     * counting rule lives here, where the request cannot talk its way
     * around it:
     * - only a published book can accrue reads (anything else 404s,
     *   exactly like detail);
     * - the author reading their own line never counts;
     * - an unsigned caller never counts (the route already 401s
     *   guests; this is the second lock);
     * - one count per reader per book per day — the day is the
     *   platform's UTC quota day (usage.js dayKeyFor), and the
     *   (book, reader, day) claim record is the dedup fact: the total
     *   increments only when the claim lands.
     * When no claim store is configured the read is reported but not
     * counted: without the dedup fact the total could double-count,
     * and an honest uncounted read beats an inflated number.
     * The whole pass is serialised with the record's other counter
     * writes, and the increment rides the same task — a separate
     * serialised helper would queue behind itself and deadlock.
     */
    async recordRead(identity, id) {
      if (!backend) throw NOT_FOUND()
      return serialise(`publication:${id}`, async () => {
        const record = await backend.getPublication(id)
        if (!record || record.status !== 'published') throw NOT_FOUND()
        const current = Math.max(0, record.readCount || 0)
        if (!identity?.uid || record.authorUid === identity.uid || !readClaims) {
          return { readCount: current, counted: false }
        }
        const claimed = await readClaims.claimRead({
          bookId: id,
          userUid: identity.uid,
          day: dayKeyFor(now()),
          createdAt: now().toISOString(),
        })
        if (!claimed) return { readCount: current, counted: false }
        const readCount = current + 1
        await backend.putPublication({ ...record, readCount, updatedAt: now().toISOString() })
        return { readCount, counted: true }
      })
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
        // 自己写 (WRITE-MODE §50): a hand-written book shelves through
        // its own branch — there is no avatar to resolve and no engine
        // mark to demand, because the author wrote every word for
        // readers in the first place. What still applies, unchanged:
        // the shared gate (≥1 written chapter) and the red-line scan
        // over the introduction and every chapter — a violation blocks
        // the shelving, never the draft on the author's own shelf. The
        // snapshot is the author's text verbatim (manualSnapshotFor);
        // the world outline stays empty, because the introduction IS
        // the book's public description.
        if (isManualStory(story)) {
          const violation = redLineViolation(story)
          if (violation) throw new ApiError(400, violation)
          const snapshot = manualSnapshotFor(story)
          const timestamp = now().toISOString()
          const existing = await findOwnPublication(identity.uid, story.id)
          const authorName = authorNameFor(identity) || '织界旅人'
          const record = {
            id: existing?.id || `pub-${randomUUID().slice(0, 12)}`,
            authorUid: identity.uid,
            authorName,
            sourceStoryId: story.id,
            title: snapshot.title,
            shareCount: Math.max(0, existing?.shareCount || 0),
            ratingAverage: typeof existing?.ratingAverage === 'number' ? existing.ratingAverage : 0,
            ratingCount: Math.max(0, existing?.ratingCount || 0),
            readCount: Math.max(0, existing?.readCount || 0),
            manual: true,
            manualShelfId: snapshot.config.manualShelfId || '',
            genreId: snapshot.genreId,
            genreTemplateId: '',
            worldName: '',
            merged: false,
            sourceTitles: [],
            storyLengthMode: snapshot.storyLengthMode,
            seasonNumber: 1,
            chapterCount: snapshot.chapters.length,
            totalChapters: snapshot.totalChapters,
            lineStatus: gate.lineStatus,
            avatar: { name: authorName, appearance: '', hasPortrait: false },
            worldIntro: null,
            worldIntroVersion: WORLD_INTRO_VERSION,
            snapshot,
            status: 'published',
            reporters: existing?.reporters || [],
            createdAt: existing?.createdAt || timestamp,
            completedAt: gate.lineStatus === 'serializing'
              ? null
              : existing?.completedAt
                || (typeof story.updatedAt === 'string' && !Number.isNaN(Date.parse(story.updatedAt)) ? story.updatedAt : timestamp),
            publishedAt: timestamp,
            updatedAt: timestamp,
          }
          await backend.putPublication(record)
          return summaryOf(record)
        }
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
        // A fused line was walked by TWO avatars; the caller's may be
        // either lead (config.avatarId names the lead side only). Either
        // protagonist's avatar, resolved from the caller's own
        // collection, qualifies the line as theirs to publish.
        if (!profile && story.kind === 'merged' && Array.isArray(story.config?.protagonists)) {
          for (const person of story.config.protagonists) {
            if (!person?.avatarId) continue
            profile = collection?.avatars.find((item) => item.id === person.avatarId) || null
            if (profile) break
          }
        }
        if (!profile) {
          throw new ApiError(400, '这条故事线不是用你的化身走完的，无法发布。')
        }
        const violation = redLineViolation(story)
        if (violation) throw new ApiError(400, violation)
        // Snapshot-source guard (DESIGN §27): a story carrying real
        // prose without the engine mark must never publish as locally
        // re-derived scaffold — stop loudly instead.
        const sourceViolation = snapshotSourceViolation(story)
        if (sourceViolation) throw new ApiError(400, sourceViolation)
        const rawSnapshot = scrubSnapshotSetting(plazaSnapshot(story, { avatarName: profile.name }))
        // The public book title is the PURE title (BOOKSTORE-PLAZA):
        // a story title composed at creation time carries the avatar
        // name as a ` · <name>` suffix inside the data itself, and a
        // book is never shelved under its protagonist's name. The
        // cleaned title replaces the snapshot's, so the record, the
        // read copy and the baked world outline all agree.
        const cleanTitle = cleanBookTitle(rawSnapshot.title, profile.name)
        const snapshot = cleanTitle && cleanTitle !== rawSnapshot.title
          ? { ...rawSnapshot, title: cleanTitle }
          : rawSnapshot
        const timestamp = now().toISOString()
        const existing = await findOwnPublication(identity.uid, story.id)
        const record = {
          id: existing?.id || `pub-${randomUUID().slice(0, 12)}`,
          authorUid: identity.uid,
          authorName: authorNameFor(identity) || '织界旅人',
          sourceStoryId: story.id,
          title: snapshot.title,
          // Bookstore counters (BOOKSTORE-PLAZA): a re-publish keeps
          // the counts the book already earned; a first shelving
          // starts from honest zeros.
          shareCount: Math.max(0, existing?.shareCount || 0),
          ratingAverage: typeof existing?.ratingAverage === 'number' ? existing.ratingAverage : 0,
          ratingCount: Math.max(0, existing?.ratingCount || 0),
          readCount: Math.max(0, existing?.readCount || 0),
          genreId: snapshot.genreId,
          genreTemplateId: snapshot.genreTemplateId,
          worldName: snapshot.worldName,
          merged: snapshot.merged === true,
          sourceTitles: Array.isArray(snapshot.sourceTitles) ? snapshot.sourceTitles : [],
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
            appearance: avatarAppearanceText(profile),
            hasPortrait: profile.portrait?.status === 'ready',
          },
          // The composed public world outline (§40 ④), baked at
          // publish time from the snapshot's already-public fields —
          // the legacy refresh script re-bakes the same shape for
          // records published before it existed.
          worldIntro: plazaWorldIntroFor({
            title: snapshot.title,
            worldName: snapshot.worldName,
            avatar: { name: profile.name, appearance: avatarAppearanceText(profile) },
            worldBible: snapshot.worldBible,
            beats: snapshot.beats,
            synopsis: snapshot.synopsis,
            chapterCount: snapshot.chapters.length,
            lineStatus: gate.lineStatus,
          }, plazaTemplateNameFor(snapshot)),
          worldIntroVersion: WORLD_INTRO_VERSION,
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

    /**
     * Book deletion cascade: when the author deletes the source book
     * itself, its publication goes with it — the record is removed
     * outright (not merely withdrawn), so the line leaves the feed,
     * detail pages and profile shelves in one step. Lines other readers
     * derived from it (entered or fused copies) are independent stories
     * with their own records and are never touched. Idempotent: a book
     * with no publication, or a repeat call, reports removed:false.
     * Owner-only by construction — the lookup matches the caller's uid.
     */
    async removeForStory(identity, sourceStoryId) {
      if (!backend) return { removed: false, id: null }
      return serialise(`publish:${identity.uid}`, async () => {
        const record = await findOwnPublication(identity.uid, sourceStoryId)
        if (!record) return { removed: false, id: null }
        await backend.deletePublication(record.id)
        return { removed: true, id: record.id }
      })
    },

    /**
     * Rename sync (TITLE-FLOW): a book's title is its name on every
     * surface, so — unlike the synopsis, which stays a publish-time
     * snapshot — a rename the owner saves to their cloud library is
     * mirrored onto the book's plaza publication immediately. Only the
     * title moves: the record's title, its snapshot's title and the
     * baked world outline (re-composed with the new name, since the
     * outline's premise filter keys on the title). The change leaves a
     * trace in the server-only titleHistory (never copied out by
     * summaryOf/detailOf). The mirrored title passes through the same
     * redaction the publish-time snapshot used, rebuilt from the
     * record's own safe config.
     *
     * Best-effort by contract: this runs after the library write that
     * carries the rename has already succeeded, and it must never fail
     * that write — every failure path reports { synced: false }.
     * Owner-only by construction, like removeForStory.
     */
    async syncTitleForStory(identity, story) {
      if (!backend || !story || typeof story.id !== 'string' || typeof story.title !== 'string') {
        return { synced: false }
      }
      try {
        return await serialise(`publish:${identity.uid}`, async () => {
          const record = await findOwnPublication(identity.uid, story.id)
          if (!record || record.status !== 'published') return { synced: false }
          const safeConfig = record.snapshot?.config
          if (!safeConfig) return { synced: false }
          // A hand-written book's title needs no redaction round-trip —
          // the author typed it for the public cover — and its record
          // carries no baked world outline to re-bake (WRITE-MODE §50).
          if (record.manual === true) {
            const nextTitle = story.title.trim()
            if (!nextTitle || nextTitle === record.title) return { synced: false }
            const timestamp = now().toISOString()
            const next = {
              ...record,
              title: nextTitle,
              snapshot: { ...record.snapshot, title: nextTitle },
              titleHistory: [
                ...(Array.isArray(record.titleHistory) ? record.titleHistory : []),
                { from: record.title, to: nextTitle, at: timestamp },
              ].slice(-10),
              updatedAt: timestamp,
            }
            await backend.putPublication(next)
            return { synced: true, id: record.id }
          }
          const nextTitle = redactedTitleFor(story, safeConfig).trim()
          if (!nextTitle || nextTitle === record.title) return { synced: false }
          const timestamp = now().toISOString()
          const snapshot = { ...record.snapshot, title: nextTitle }
          const next = {
            ...record,
            title: nextTitle,
            snapshot,
            worldIntro: plazaWorldIntroFor({
              title: nextTitle,
              worldName: record.worldName,
              avatar: record.avatar,
              worldBible: record.snapshot.worldBible,
              beats: record.snapshot.beats,
              synopsis: record.snapshot.synopsis,
              chapterCount: record.chapterCount,
              lineStatus: record.lineStatus,
            }, plazaTemplateNameFor(snapshot)),
            worldIntroVersion: WORLD_INTRO_VERSION,
            titleHistory: [
              ...(Array.isArray(record.titleHistory) ? record.titleHistory : []),
              { from: record.title, to: nextTitle, at: timestamp },
            ].slice(-10),
            updatedAt: timestamp,
          }
          await backend.putPublication(next)
          return { synced: true, id: record.id }
        })
      } catch {
        return { synced: false }
      }
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
