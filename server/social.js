import { randomUUID } from 'node:crypto'
import { ApiError, sanitizeSettingText } from './gemini.js'
import { avatarAppearanceText, normalizeAvatarAbility } from '../src/avatar.js'
import { CUSTOM_GENRE_ID, normalizeProtagonistAnchors } from '../src/story-engine.js'
import { createSocialStore, pictureSourceFor, bannerSourceFor, friendshipKeyFor } from './social-store.js'
import { emailCodeUid, normalizeEmailAddress, validEmailAddress } from './email-code.js'
import { isReservedUsername } from './username-auth.js'
import { createPlazaStore } from './plaza-store.js'
import { createPlazaFeedStore } from './plaza-feed-store.js'
import { createBookRatingsStore } from './book-ratings-store.js'
import { createAvatarStore, collectionFromRecord, imageSlotFor } from './avatar-store.js'
import { normalizedStoredImage } from './portrait-image.js'
import { createCoverStore } from './cover-store.js'
import { createIdentityStore } from './identity-store.js'
import { isOfficialUid, plazaSummaryOf } from './plaza.js'
import { fusionPermissionOfRecord } from '../src/fusion-permission.js'

/**
 * The social service: public profile pages, the follow graph, plaza
 * presence, and profile customization (display name / @handle / picture).
 *
 * Identity resolution is layered. A stored profile record — what the
 * owner deliberately set on the 编辑资料 sheet — wins outright. Below it
 * sit the records that already exist, following the plaza's precedent
 * (there is no separate account registry):
 * - a username account's uid IS its public name (`username:<name>` is
 *   the uid, the handle and the display name in one);
 * - the signed-in caller's own name resolves from the raw name on
 *   their live identity;
 * - anyone else's name is the author name stored on their most recent
 *   plaza publication (captured from their identity at publish time).
 * Whatever the layer, a candidate that is empty — or that looks like
 * an email address — never reaches the payload: resolution then falls
 * to the avatar's name, and finally to the neutral label 未命名旅人.
 * Emails are never copied into any profile payload.
 *
 * The profile picture resolves uploaded picture → avatar portrait →
 * the designed default avatar asset (`/default-avatar.svg`), gated by
 * the owner's stored pictureKind (see pictureSourceFor). A profile
 * therefore always has a picture to show, and never an empty slot.
 *
 * Presence is deliberately thin: a heartbeat stamps (uid, instant) and
 * "online" means a stamp inside the last 90 seconds. Nothing else about
 * the reader is recorded.
 */
export const PRESENCE_WINDOW_MS = 90_000
export const DEFAULT_AVATAR_PATH = '/default-avatar.svg'
export const PROFILE_PICTURE_MAX_BYTES = 1_048_576
export const PROFILE_BANNER_MAX_BYTES = 1_048_576
export const DEFAULT_BANNER_PATH = '/art/banner-profile-1600.webp'
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/

/**
 * The message centre's three categories (NOTIFY-SETTINGS §36). 互动 is
 * ONE bucket for everything another person does that concerns the
 * reader — its item `kind` is an open enum ('follow', 'friend_request',
 * 'friend_accepted', and — since BOOKSTORE-PLAZA — 'like' and
 * 'comment' from the plaza feed, derived from the like/comment records
 * themselves; RATINGS added 'rating', derived from the book-rating
 * records the same way). All slot into the same category, the same list shape
 * and the same read watermark, which is kept per user × category, never per kind).
 * 公告 is official-only. 系统 is the account's own security events,
 * written by the account routes at the moment the action succeeds —
 * never invented, never back-filled.
 */
export const NOTIFY_CATEGORIES = ['activity', 'announcements', 'system']
export const NOTIFY_ACTIVITY_KINDS = ['follow', 'like', 'comment', 'friend_request', 'friend_accepted', 'rating', 'fusion_request']
const NOTIFY_ITEM_CAP = 50

/**
 * Friends (FRIENDS batch): requests are application-based — one
 * directional record per (from, to) pair with a status, and accepting
 * writes the single mutual friendship record. A request may carry one
 * short note from the sender. Declines never notify the sender (the
 * state only changes in their own outgoing list); acceptances do,
 * through the 互动 category like every other person-event.
 */
export const FRIEND_MESSAGE_MAX = 50
export const PEOPLE_SEARCH_LIMIT = 20
const EMAIL_SEARCH_WINDOW_MS = 15 * 60 * 1000
const EMAIL_SEARCH_MAX = 10

const WORLD_ART_IDS = new Set(['mist', 'cultivation', 'neon', 'city', 'court', 'frontier', CUSTOM_GENRE_ID])
const clip = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : ''
/* DEVICE-FIX3 (DESIGN §54): card-facing strings are budgeted in
 * wide units (CJK/fullwidth = 2, else 1) — the same measure the
 * client uses (src/plaza.js textUnitsFor). The display name's card
 * budget is 18 units, so the write path enforces units, not just
 * characters: 9 CJK characters or 18 latin ones, in any mix. */
const textUnitsOf = (value) => {
  let units = 0
  for (const ch of String(value ?? '')) units += /[ᄀ-ᅟ⺀-꓏가-힣︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1
  return units
}
const charCount = (value) => [...value].length

const NOT_FOUND = () => new ApiError(404, '这位用户还不存在。')
const HANDLE_INVALID_MESSAGE = '用户名只能用小写字母、数字和下划线，3–20 个字符。'
const HANDLE_TAKEN_MESSAGE = '这个用户名已经被占用了，换一个试试。'

/**
 * Raw identity candidates for a uid, most deliberate first. Nothing
 * here is presentable yet: values may be empty, and a stored author
 * name captured before the email guard existed may BE an email
 * address. `resolveProfileIdentity` does the presenting.
 */
function publicIdentityFor(uid, publications, viewerIdentity) {
  if (uid.startsWith('username:')) {
    const name = clip(uid.slice('username:'.length), 40)
    if (name) return { displayName: name, handle: name }
  }
  if (viewerIdentity && viewerIdentity.uid === uid) {
    return { displayName: clip(viewerIdentity.displayName, 40), handle: '' }
  }
  const named = publications.find((record) => record.authorName)
  if (named) return { displayName: named.authorName, handle: '' }
  return { displayName: '', handle: '' }
}

/** The resolved display identity for any surface that names an author. */
export function identityFromRecord(record, fallback) {
  return {
    displayName: record?.displayName || fallback.displayName,
    handle: record?.handle || fallback.handle,
  }
}

export const PROFILE_FALLBACK_NAME = '未命名旅人'

const looksLikeEmail = (value) => typeof value === 'string' && value.includes('@')

/**
 * The one place a public display name is decided. The first candidate
 * that is non-empty and not email-shaped wins; an unset or
 * email-shaped name falls back through the avatar's name to the
 * neutral label. An email address is an account credential, never a
 * name — accounts that signed up by email and never set a name used
 * to render their full address as the profile's giant title.
 */
export function publicDisplayName(candidates) {
  for (const candidate of candidates) {
    const name = typeof candidate === 'string' ? candidate.trim() : ''
    if (name && !looksLikeEmail(name)) return name
  }
  return PROFILE_FALLBACK_NAME
}

/** A public @handle, or '' (no handle line) when there is none. */
export function publicHandle(candidate) {
  const handle = typeof candidate === 'string' ? candidate.trim() : ''
  return handle && !looksLikeEmail(handle) ? handle : ''
}

export function createSocialService({
  env = process.env,
  store,
  plazaStore,
  feedStore,
  ratingsStore,
  avatarStore,
  identityStore,
  coverStore,
  now = () => Date.now(),
} = {}) {
  const backend = store === undefined ? createSocialStore({ env }) : store
  const plazaBackend = plazaStore === undefined ? createPlazaStore({ env }) : plazaStore
  // The plaza feed's records (BOOKSTORE-PLAZA): the 互动 category
  // derives its like/comment items from the like and comment records
  // pointing at the caller's posts — the same derive-from-real-records
  // discipline as follows and friend requests, so un-liking a post
  // retracts the item it made. Absent backend (no data store) simply
  // contributes no items.
  const feedBackend = feedStore === undefined ? createPlazaFeedStore({ env }) : feedStore
  // Book ratings (RATINGS): the 互动 category derives a "rated your
  // book" item from each rating record pointing at one of the
  // caller's books — same derive-from-real-records discipline, so
  // deleting a rating retracts the item, and an edit (which keeps
  // the record's createdAt) never re-notifies.
  const ratingsBackend = ratingsStore === undefined ? createBookRatingsStore({ env }) : ratingsStore
  const avatars = avatarStore === undefined ? createAvatarStore({ env }) : avatarStore
  const identities = identityStore === undefined ? createIdentityStore({ env }) : identityStore
  const covers = coverStore === undefined ? createCoverStore({ env }) : coverStore

  // A publication's own generated cover, resolved live exactly the way
  // the plaza feed resolves it (the store is keyed by author + source
  // story), so profile bookshelves show each book's own painting the
  // moment it exists. Null keeps the world-artwork fallback.
  async function coverUrlOf(publication) {
    if (!covers) return null
    try {
      const coverRecord = await covers.getCover(publication.authorUid, publication.sourceStoryId)
      return coverRecord?.image
        ? `/api/plaza/${encodeURIComponent(publication.id)}/cover?v=${coverRecord.version || 1}`
        : null
    } catch {
      return null
    }
  }

  // Profile writes are serialised per account (and handle claims are
  // check-then-write inside that serialisation window), the same
  // discipline the plaza publish path uses.
  const tails = new Map()
  const serialise = (key, task) => {
    const previous = tails.get(key) || Promise.resolve()
    const run = previous.then(task, task)
    tails.set(key, run.catch(() => {}))
    return run
  }

  async function visiblePublicationsOf(uid) {
    if (!plazaBackend) return []
    const all = await plazaBackend.listPublications()
    return all
      .filter((record) => record.authorUid === uid && record.status === 'published')
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
  }

  async function avatarProfileOf(uid) {
    if (!avatars) return null
    try {
      const record = await avatars.getProfile(uid)
      return record?.avatar || null
    } catch {
      return null
    }
  }

  /**
   * The owner's whole avatar collection (PROFILE-ENRICH §35): the
   * profile page's 化身区 shows every avatar the person keeps, not
   * only the main one. The store record normalises through
   * collectionFromRecord (legacy single-avatar records included);
   * stores that expose getCollection use it directly.
   */
  async function avatarCollectionOf(uid) {
    if (!avatars) return null
    try {
      if (typeof avatars.getCollection === 'function') return await avatars.getCollection(uid)
      return collectionFromRecord(await avatars.getProfile(uid))
    } catch {
      return null
    }
  }

  async function profileRecordOf(uid) {
    if (!backend) return null
    try {
      return await backend.getProfileRecord(uid)
    } catch {
      return null
    }
  }

  /**
   * One person, resolved for a viewer: the same identity layers the
   * profile payload itself uses (stored record → layered fallback →
   * avatar name), the resolved picture, and the viewer's follow state
   * towards them. Every people list on the site — 粉丝 / 关注， search
   * results, friend lists — renders rows built here, so a person is
   * the same person everywhere. The payload never carries an email:
   * resolution inputs may include one (an email-shaped stored name)
   * and the guards in publicDisplayName / publicHandle strip it.
   */
  async function resolvedPerson(personUid, viewerIdentity) {
    const [personRecord, personAvatar, personPublications] = await Promise.all([
      profileRecordOf(personUid),
      avatarProfileOf(personUid),
      visiblePublicationsOf(personUid),
    ])
    const fallback = publicIdentityFor(personUid, personPublications, viewerIdentity)
    const merged = identityFromRecord(personRecord, fallback)
    const avatarName = personAvatar ? sanitizeSettingText(clip(personAvatar.name, 40)).trim() : ''
    const viewerUid = viewerIdentity?.uid || ''
    return {
      uid: personUid,
      displayName: publicDisplayName([merged.displayName, avatarName]),
      handle: publicHandle(merged.handle),
      picture: await pictureFor(personUid, personRecord, personAvatar),
      isSelf: Boolean(viewerUid) && viewerUid === personUid,
      isFollowing: viewerUid && viewerUid !== personUid && backend
        ? Boolean(await backend.getFollow(viewerUid, personUid))
        : false,
    }
  }

  /**
   * The relationship between two accounts, from the viewer's side:
   * 'friends' (a friendship record exists), 'pending-out' (the viewer
   * asked, still waiting), 'pending-in' (they asked the viewer), or
   * 'none'. Resolved request records (declined / cancelled) read as
   * 'none' here — the state machine keeps them for the lists, not for
   * the relationship.
   */
  async function friendStateBetween(viewerUid, targetUid) {
    if (!backend || !viewerUid || !targetUid || viewerUid === targetUid) return 'none'
    if (await backend.getFriendship(viewerUid, targetUid)) return 'friends'
    const [mine, theirs] = await Promise.all([
      backend.getFriendRequest(viewerUid, targetUid),
      backend.getFriendRequest(targetUid, viewerUid),
    ])
    if (mine?.status === 'pending') return 'pending-out'
    if (theirs?.status === 'pending') return 'pending-in'
    return 'none'
  }

  async function personWithFriendState(personUid, viewerIdentity) {
    const row = await resolvedPerson(personUid, viewerIdentity)
    row.friendState = viewerIdentity ? await friendStateBetween(viewerIdentity.uid, personUid) : 'none'
    return row
  }

  const friendshipRecordFor = (a, b, at) => {
    const [uidA, uidB] = [a, b].sort()
    return { uidA, uidB, createdAt: at }
  }

  // The email people-search throttle: per account, in-process (the
  // deployment is single-instance, the same posture as the auth
  // channels' ledgers). Name search stays unthrottled — it only reads
  // public names; an exact-address lookup is the enumeration risk.
  const searchAttempts = new Map()
  const searchWindowCount = (key, windowMs) => {
    const entry = searchAttempts.get(key)
    return !entry || now() - entry.firstAt >= windowMs ? 0 : entry.count
  }
  const searchBump = (key, windowMs) => {
    const at = now()
    const entry = searchAttempts.get(key)
    if (!entry || at - entry.firstAt >= windowMs) searchAttempts.set(key, { count: 1, firstAt: at })
    else entry.count += 1
    if (searchAttempts.size > 1024) {
      for (const [key2, value] of searchAttempts) {
        if (at - value.firstAt >= windowMs) searchAttempts.delete(key2)
      }
    }
  }

  /**
   * Account-level existence: the account registry itself, not any
   * footprint the account may have left. Username accounts live in the
   * identity store (`site_users`, keyed by the normalised name the uid
   * carries); that record is created at registration, before any
   * avatar, publication or profile record can exist. An account with
   * no avatar yet is still an account — deep links to it must open an
   * (honestly empty) profile page, not a 404.
   */
  async function accountExists(uid) {
    if (!identities || !uid.startsWith('username:')) return false
    const name = clip(uid.slice('username:'.length), 40)
    if (!name) return false
    try {
      return Boolean(await identities.getUser(name))
    } catch {
      return false
    }
  }

  async function exists(uid, viewerIdentity) {
    if (viewerIdentity?.uid === uid) return true
    if (await accountExists(uid)) return true
    if (await profileRecordOf(uid)) return true
    if (await avatarProfileOf(uid)) return true
    return (await visiblePublicationsOf(uid)).length > 0
  }

  /**
   * Resolve the picture a profile (or an author row) shows for `uid`:
   * `{ kind, url }` where kind is 'upload' | 'avatar' | 'default'. The
   * default is the designed asset, served as a static file; the other
   * two ride this service's picture route with a version stamp so a
   * change is never hidden behind a cache.
   */
  async function pictureFor(uid, record, avatarProfile) {
    const hasUpload = backend ? Boolean(await backend.getPicture(uid).catch(() => null)) : false
    const portraitReady = avatarProfile?.portrait?.status === 'ready'
    const kind = pictureSourceFor(record, { hasUpload, portraitReady })
    if (kind === 'default') return { kind, url: DEFAULT_AVATAR_PATH }
    const stamp = (record?.pictureVersion || 0) + (kind === 'avatar' ? (avatarProfile?.portrait?.version || 0) : 0)
    return { kind, url: `/api/users/${encodeURIComponent(uid)}/picture?v=${stamp}` }
  }

  /**
   * Resolve the profile hero banner (DEVICE-FIX REQ-19):
   * `{ kind, url }` where kind is 'upload' | 'avatar' | 'default'.
   * Uploads ride this service's banner route with the record's
   * bannerVersion stamp; the default is the designed banner asset;
   * 'avatar' carries url=null — the client renders the main portrait
   * with its blurred-ambience treatment instead of a banner file.
   */
  async function bannerFor(uid, record, avatarProfile) {
    const hasUpload = backend ? Boolean(await backend.getBanner(uid).catch(() => null)) : false
    const kind = bannerSourceFor({ hasUpload, portraitReady: avatarProfile?.portrait?.status === 'ready' })
    if (kind === 'upload') return { kind, url: `/api/users/${encodeURIComponent(uid)}/banner?v=${record?.bannerVersion || 0}` }
    if (kind === 'avatar') return { kind, url: null }
    return { kind, url: DEFAULT_BANNER_PATH }
  }

  async function handleProblem(identity, handle) {
    if (!HANDLE_PATTERN.test(handle)) return HANDLE_INVALID_MESSAGE
    // Reserved names (REQ-69) can never be claimed as a @handle
    // either — a handle must not impersonate the official account.
    // The account that legitimately owns such a login name keeps it:
    // for a username account the handle IS the uid's name part.
    if (isReservedUsername(handle) && identity.uid !== `username:${handle}`) return HANDLE_TAKEN_MESSAGE
    if (!backend) return null
    const owner = await backend.getUidByHandle(handle)
    if (owner && owner !== identity.uid) return HANDLE_TAKEN_MESSAGE
    // A handle may not shadow someone else's login username either:
    // that name belongs to the `username:<handle>` account.
    if (identities && `username:${handle}` !== identity.uid) {
      try {
        if (await identities.getUser(handle)) return HANDLE_TAKEN_MESSAGE
      } catch { /* the profile-handle index still guards profile claims */ }
    }
    return null
  }

  return {
    available: backend !== null && backend !== undefined,

    async follow(identity, targetUid) {
      if (!backend) throw new ApiError(503, '关注服务尚未配置。')
      const target = clip(targetUid, 512)
      if (!target) throw NOT_FOUND()
      if (target === identity.uid) throw new ApiError(400, '不能关注自己。')
      if (!(await exists(target, identity))) throw NOT_FOUND()
      const existing = await backend.getFollow(identity.uid, target)
      if (!existing) {
        await backend.putFollow({
          followerUid: identity.uid,
          followeeUid: target,
          createdAt: new Date(now()).toISOString(),
        })
      }
      const followers = await backend.listFollowsByFollowee(target)
      return { following: true, followers: followers.length }
    },

    async unfollow(identity, targetUid) {
      if (!backend) throw new ApiError(503, '关注服务尚未配置。')
      const target = clip(targetUid, 512)
      if (!target) throw NOT_FOUND()
      await backend.deleteFollow(identity.uid, target)
      const followers = await backend.listFollowsByFollowee(target)
      return { following: false, followers: followers.length }
    },

    async reportUser(identity, targetUid) {
      if (!backend) throw new ApiError(503, '举报服务尚未配置。')
      const target = clip(targetUid, 512)
      if (!target) throw NOT_FOUND()
      if (target === identity.uid) throw new ApiError(400, '不能举报自己。')
      if (!(await exists(target, identity))) throw NOT_FOUND()
      const existing = await backend.getUserReport(identity.uid, target)
      if (!existing) {
        await backend.putUserReport({
          reporterUid: identity.uid,
          targetUid: target,
          createdAt: new Date(now()).toISOString(),
        })
      }
      return { reported: true }
    },

    /**
     * Send a friend request. Idempotent by state: already friends or
     * already waiting returns the standing state untouched. Asking
     * someone who is already asking YOU completes the handshake
     * instead — a request in return is consent in any reading of it —
     * so the pair lands in the same accepted state an explicit 同意
     * would produce. A resolved record (declined / cancelled) may be
     * asked again: the new ask replaces it with a fresh pending one.
     */
    async sendFriendRequest(identity, targetUid, body) {
      if (!backend) throw new ApiError(503, '好友功能尚未配置。')
      const target = clip(targetUid, 512)
      if (!target) throw NOT_FOUND()
      if (target === identity.uid) throw new ApiError(400, '不能给自己发好友申请。')
      if (!(await exists(target, identity))) throw NOT_FOUND()
      const input = body && typeof body === 'object' ? body : {}
      const message = sanitizeSettingText(clip(input.message, 200)).trim()
      if (charCount(message) > FRIEND_MESSAGE_MAX) {
        throw new ApiError(400, `留言最多 ${FRIEND_MESSAGE_MAX} 个字。`)
      }
      return serialise(`friend:${friendshipKeyFor(identity.uid, target)}`, async () => {
        if (await backend.getFriendship(identity.uid, target)) return { state: 'friends' }
        const mine = await backend.getFriendRequest(identity.uid, target)
        if (mine?.status === 'pending') return { state: 'pending-out' }
        const theirs = await backend.getFriendRequest(target, identity.uid)
        const at = new Date(now()).toISOString()
        if (theirs?.status === 'pending') {
          await backend.putFriendRequest({ ...theirs, status: 'accepted', updatedAt: at })
          await backend.putFriendship(friendshipRecordFor(identity.uid, target, at))
          return { state: 'friends' }
        }
        await backend.putFriendRequest({
          id: mine?.id || `fr-${randomUUID()}`,
          fromUid: identity.uid,
          toUid: target,
          message,
          status: 'pending',
          createdAt: at,
          updatedAt: at,
        })
        return { state: 'pending-out' }
      })
    },

    /**
     * Answer a request addressed to the caller. 同意 writes the mutual
     * friendship; 拒绝 only flips the record — the sender is never
     * notified of a decline (their outgoing list simply shows the new
     * state). Re-answering with the same answer is idempotent; the
     * opposite answer after resolution is a conflict, not a rewrite.
     */
    async respondFriendRequest(identity, fromUid, body) {
      if (!backend) throw new ApiError(503, '好友功能尚未配置。')
      const from = clip(fromUid, 512)
      if (!from) throw NOT_FOUND()
      const accept = Boolean(body && typeof body === 'object' && body.accept === true)
      return serialise(`friend:${friendshipKeyFor(identity.uid, from)}`, async () => {
        const request = await backend.getFriendRequest(from, identity.uid)
        if (!request) throw new ApiError(404, '这条好友申请已经不在了。')
        if (request.status === 'accepted' && accept) return { state: 'friends' }
        if (request.status === 'declined' && !accept) return { state: 'declined' }
        if (request.status !== 'pending') throw new ApiError(409, '这条好友申请已经处理过了。')
        const at = new Date(now()).toISOString()
        if (accept) {
          await backend.putFriendship(friendshipRecordFor(identity.uid, from, at))
          await backend.putFriendRequest({ ...request, status: 'accepted', updatedAt: at })
          return { state: 'friends' }
        }
        await backend.putFriendRequest({ ...request, status: 'declined', updatedAt: at })
        return { state: 'declined' }
      })
    },

    /** Withdraw my own pending request. Anything else is a no-op state read. */
    async cancelFriendRequest(identity, targetUid) {
      if (!backend) throw new ApiError(503, '好友功能尚未配置。')
      const target = clip(targetUid, 512)
      if (!target) throw NOT_FOUND()
      return serialise(`friend:${friendshipKeyFor(identity.uid, target)}`, async () => {
        const mine = await backend.getFriendRequest(identity.uid, target)
        if (mine?.status === 'pending') {
          await backend.putFriendRequest({ ...mine, status: 'cancelled', updatedAt: new Date(now()).toISOString() })
        }
        return { state: await friendStateBetween(identity.uid, target) }
      })
    },

    /**
     * The caller's own 好友区 in one payload: the friend list, the
     * pending requests waiting on THEM (with the sender's note), and
     * every request they sent with its standing state — the only place
     * a decline is ever visible, and only to the person who asked.
     */
    async friends(identity) {
      if (!backend) throw new ApiError(503, '好友功能尚未配置。')
      const me = identity.uid
      const [friendships, incoming, outgoing] = await Promise.all([
        backend.listFriendships(me),
        backend.listFriendRequestsByTo(me),
        backend.listFriendRequestsByFrom(me),
      ])
      const byCreated = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      const byUpdated = (a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
      const friendRows = await Promise.all([...friendships].sort(byCreated).slice(0, 100).map(async (record) => {
        const other = record.uidA === me ? record.uidB : record.uidA
        const row = await resolvedPerson(other, identity)
        return { ...row, friendState: 'friends', since: record.createdAt || null }
      }))
      const pendingIncoming = incoming.filter((record) => record.status === 'pending')
      const incomingRows = await Promise.all([...pendingIncoming].sort(byCreated).slice(0, NOTIFY_ITEM_CAP).map(async (record) => ({
        id: record.id,
        message: record.message || '',
        at: record.createdAt || null,
        person: await resolvedPerson(record.fromUid, identity),
      })))
      const outgoingRows = await Promise.all([...outgoing].sort(byUpdated).slice(0, NOTIFY_ITEM_CAP).map(async (record) => ({
        id: record.id,
        status: record.status,
        message: record.message || '',
        at: record.updatedAt || record.createdAt || null,
        person: await resolvedPerson(record.toUid, identity),
      })))
      return {
        friends: friendRows,
        incoming: incomingRows,
        outgoing: outgoingRows,
        counts: { friends: friendships.length, incomingPending: pendingIncoming.length },
      }
    },

    /**
     * Find people, two modes with deliberately different rules.
     *
     * Name mode is fuzzy over PUBLIC names only — the @handle and the
     * display name, as resolved for the caller — gathered from the
     * three places a public name can live: the account registry
     * (username accounts), stored profile records, and plaza
     * publication bylines. Paged, exact-handle matches first.
     *
     * Email mode is exact and enumeration-proof: the address itself
     * never appears in the payload, a miss is indistinguishable from
     * "no such account", and lookups are throttled per caller. Two
     * kinds of account can be found this way: an email-code account
     * (whose uid IS derived from the address — findable once it has
     * any public footprint) and a username account that bound the
     * address for recovery. Firebase accounts keep their addresses
     * inside Firebase Auth and are not enumerable from here.
     */
    async searchPeople(identity, { q, email, limit, offset } = {}) {
      if (!backend) throw new ApiError(503, '找朋友尚未配置。')
      const me = identity.uid
      const emailQuery = typeof email === 'string' ? normalizeEmailAddress(email) : ''
      if (emailQuery) {
        const key = `friend-email:${me}`
        if (searchWindowCount(key, EMAIL_SEARCH_WINDOW_MS) >= EMAIL_SEARCH_MAX) {
          throw new ApiError(429, '用邮箱找人太频繁了，请稍后再试。')
        }
        searchBump(key, EMAIL_SEARCH_WINDOW_MS)
        if (!validEmailAddress(emailQuery)) return { mode: 'email', people: [], total: 0 }
        const found = new Set()
        const emailUid = emailCodeUid(emailQuery)
        if (emailUid !== me && await exists(emailUid, identity)) found.add(emailUid)
        if (identities && typeof identities.listUidsByRecoveryEmail === 'function') {
          try {
            // The identity store answers with bare uids: the bound
            // address is matched inside the layer that owns it and
            // never crosses into this service (RECOVERY pin).
            for (const uid of await identities.listUidsByRecoveryEmail(emailQuery)) {
              if (uid && uid !== me) found.add(uid)
            }
          } catch { /* a registry read failure reads as "not found", never as an oracle */ }
        }
        const people = await Promise.all([...found].map((uid) => personWithFriendState(uid, identity)))
        return { mode: 'email', people, total: people.length }
      }
      const needle = clip(q, 40).trim().toLowerCase()
      if (!needle) return { mode: 'name', people: [], total: 0 }
      const candidates = new Set()
      if (identities && typeof identities.listUserSummaries === 'function') {
        try {
          for (const user of await identities.listUserSummaries()) {
            if (user?.uid && typeof user.username === 'string' && user.username.toLowerCase().includes(needle)) {
              candidates.add(user.uid)
            }
          }
        } catch { /* a failed source simply contributes nobody */ }
      }
      try {
        for (const record of await backend.listProfileRecords()) {
          if (!record?.uid) continue
          const handleHit = typeof record.handle === 'string' && record.handle.toLowerCase().includes(needle)
          const nameHit = typeof record.displayName === 'string' && record.displayName.toLowerCase().includes(needle)
          if (handleHit || nameHit) candidates.add(record.uid)
        }
      } catch { /* a failed source simply contributes nobody */ }
      if (plazaBackend) {
        const publications = await plazaBackend.listPublications()
        for (const record of publications) {
          if (record?.authorUid && typeof record.authorName === 'string'
            && record.authorName.toLowerCase().includes(needle)) {
            candidates.add(record.authorUid)
          }
        }
      }
      candidates.delete(me)
      const resolved = await Promise.all(
        [...candidates].slice(0, 200).map((uid) => personWithFriendState(uid, identity)),
      )
      const matched = resolved.filter((row) => (
        row.handle.toLowerCase().includes(needle) || row.displayName.toLowerCase().includes(needle)
      ))
      const rank = (row) => {
        const handle = row.handle.toLowerCase()
        if (handle === needle) return 0
        if (handle.startsWith(needle)) return 1
        if (row.displayName.toLowerCase().startsWith(needle)) return 2
        return 3
      }
      matched.sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName))
      const pageSize = Math.min(PEOPLE_SEARCH_LIMIT, Math.max(1, Number.parseInt(limit, 10) || PEOPLE_SEARCH_LIMIT))
      const start = Math.max(0, Number.parseInt(offset, 10) || 0)
      return { mode: 'name', people: matched.slice(start, start + pageSize), total: matched.length }
    },

    async profile(viewerIdentity, uid) {
      const target = clip(uid, 512)
      if (!target) throw NOT_FOUND()
      const [record, profile, publications, following, followers, collection] = await Promise.all([
        profileRecordOf(target),
        avatarProfileOf(target),
        visiblePublicationsOf(target),
        backend ? backend.listFollowsByFollower(target) : Promise.resolve([]),
        backend ? backend.listFollowsByFollowee(target) : Promise.resolve([]),
        avatarCollectionOf(target),
      ])
      const isSelf = viewerIdentity?.uid === target
      if (!record && !profile && publications.length === 0 && !isSelf && !(await accountExists(target))) {
        throw NOT_FOUND()
      }
      const fallback = publicIdentityFor(target, publications, viewerIdentity)
      const merged = identityFromRecord(record, fallback)
      const avatarName = profile ? sanitizeSettingText(clip(profile.name, 40)).trim() : ''
      const displayName = publicDisplayName([merged.displayName, avatarName])
      const handle = publicHandle(merged.handle)
      const picture = await pictureFor(target, record, profile)
      const coverUrls = await Promise.all(publications.map((publication) => coverUrlOf(publication)))
      const worlds = []
      const seenWorlds = new Set()
      for (const publication of publications) {
        const worldId = publication.genreId || ''
        if (!worldId || seenWorlds.has(worldId)) continue
        seenWorlds.add(worldId)
        worlds.push({
          worldId,
          name: publication.worldName || '',
          coverRef: WORLD_ART_IDS.has(worldId) ? `/art/${worldId}-640.webp` : null,
        })
      }
      const hasPortrait = profile?.portrait?.status === 'ready'
      // Where each avatar currently resides (PROFILE-ENRICH §35): the
      // world of the newest public line that avatar walked, matched by
      // the snapshot's avatar name (publications arrive newest-first).
      // No public line, no residence — the field is omitted rather
      // than invented.
      const worldByAvatarName = new Map()
      for (const publication of publications) {
        const name = typeof publication.avatar?.name === 'string' ? publication.avatar.name.trim() : ''
        if (name && publication.worldName && !worldByAvatarName.has(name)) {
          worldByAvatarName.set(name, publication.worldName)
        }
      }
      const mainAvatarId = collection?.mainId || null
      const avatarSummaries = (collection?.avatars || []).map((item) => {
        const ready = item?.portrait?.status === 'ready'
        const name = sanitizeSettingText(clip(item.name, 40)).trim()
        // The signature ability (REQ-57) is part of who this avatar
        // publicly is — one line on the profile stage — so it rides
        // the summary, scrubbed and bounded like the other fields.
        const ability = normalizeAvatarAbility(item?.ability)
        return {
          id: item.id,
          name,
          description: sanitizeSettingText(clip(item.description, 300)).trim(),
          appearance: avatarAppearanceText(item),
          isMain: Boolean(mainAvatarId) && item.id === mainAvatarId,
          hasPortrait: ready,
          ...(ability ? {
            ability: {
              id: ability.id,
              name: sanitizeSettingText(clip(ability.name, 40)).trim(),
              desc: sanitizeSettingText(clip(ability.desc, 120)).trim(),
              ...(ability.bounds ? { bounds: sanitizeSettingText(clip(ability.bounds, 120)).trim() } : {}),
            },
          } : {}),
          // REQ-69 W5: the avatar's anchors are part of who they
          // publicly are (age + key years), carried like the ability.
          ...(normalizeProtagonistAnchors(item?.anchors) ? {
            anchors: normalizeProtagonistAnchors(item.anchors),
          } : {}),
          ...(ready ? { portraitUrl: `/api/users/${encodeURIComponent(target)}/portrait?avatar=${encodeURIComponent(item.id)}&v=${item.portrait?.version || 1}` } : {}),
          ...(worldByAvatarName.get(name) ? { currentWorld: worldByAvatarName.get(name) } : {}),
        }
      })
      const payload = {
        uid: target,
        displayName,
        handle,
        // The owner's own one-line introduction (PHONE-FIX §37): a
        // stored profile field like the display name — never borrowed
        // from the avatar's description, which describes the avatar,
        // not the person. Empty string when never written.
        bio: record?.bio || '',
        picture,
        banner: await bannerFor(target, record, profile),
        avatar: profile ? {
          name: sanitizeSettingText(clip(profile.name, 40)).trim(),
          description: sanitizeSettingText(clip(profile.description, 300)).trim(),
          appearance: avatarAppearanceText(profile),
          hasPortrait,
          ...(hasPortrait ? { portraitUrl: `/api/users/${encodeURIComponent(target)}/portrait` } : {}),
          ...(worldByAvatarName.get(avatarName) ? { currentWorld: worldByAvatarName.get(avatarName) } : {}),
        } : null,
        avatars: avatarSummaries,
        counts: {
          works: publications.length,
          following: following.length,
          followers: followers.length,
          publications: publications.length,
        },
        worlds,
        publications: publications.map((publication, index) => ({
          ...plazaSummaryOf({ ...publication, coverUrl: coverUrls[index] }),
          // The stored publish-time author name may predate the email
          // guard; the profile payload speaks with the resolved name.
          authorName: displayName,
          authorUid: publication.authorUid,
          // Same live-portrait rule as the plaza feed: the snapshot only
          // carries a reference, so readiness follows the author's
          // current profile, not the publish-time flag.
          avatar: { ...publication.avatar, hasPortrait },
        })),
        viewerState: {
          isSelf: Boolean(isSelf),
          isFollowing: viewerIdentity && backend
            ? Boolean(await backend.getFollow(viewerIdentity.uid, target))
            : false,
          // The friend relationship rides the same viewer state, so a
          // profile page can offer 加好友 / 申请中 / 同意申请 / 已是好友
          // without a second round-trip.
          friendState: viewerIdentity && !isSelf
            ? await friendStateBetween(viewerIdentity.uid, target)
            : 'none',
        },
      }
      if (isSelf) {
        // The viewer's own follow list, exposed only to themselves: the
        // plaza's 关注动态 strip filters the public feed by these uids
        // client-side (F-22 minimum viable — no new endpoint).
        payload.followingUids = following.map((record) => record.followeeUid).filter(Boolean)
        payload.editable = {
          displayName: record?.displayName || '',
          handle: record?.handle || '',
          bio: record?.bio || '',
          // 合流权限 (REQ-49): the owner's current setting, so the
          // settings surface renders its saved state, never a guess.
          fusionPermission: fusionPermissionOfRecord(record),
          pictureKind: record?.pictureKind ?? null,
          hasUpload: backend ? Boolean(await backend.getPicture(target).catch(() => null)) : false,
          hasBanner: backend ? Boolean(await backend.getBanner(target).catch(() => null)) : false,
          hasPortrait,
        }
      }
      return payload
    },

    /**
     * The public name-list behind a profile's counts （粉丝 / 关注）:
     * every row resolved through the same identity layers as the
     * profile payload itself, so a name in the list is the name on
     * that person's page. Rows carry the viewer's own follow state so
     * the list can offer follow toggles without a second round-trip.
     * Capped — a profile with more history than the cap still gets a
     * truthful, most-recent-first page of it.
     */
    async connections(viewerIdentity, uid, kind) {
      if (!backend) throw new ApiError(503, '关注服务尚未配置。')
      const target = clip(uid, 512)
      if (!target) throw NOT_FOUND()
      if (!(await exists(target, viewerIdentity))) throw NOT_FOUND()
      const records = kind === 'following'
        ? await backend.listFollowsByFollower(target)
        : await backend.listFollowsByFollowee(target)
      const ordered = [...records].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      const page = ordered.slice(0, 100)
      const people = await Promise.all(page.map((record) => resolvedPerson(
        kind === 'following' ? record.followeeUid : record.followerUid,
        viewerIdentity,
      )))
      return { kind: kind === 'following' ? 'following' : 'followers', people, total: records.length }
    },

    /** Availability of a @handle for the signed-in owner (editor feedback). */
    async checkHandle(identity, rawHandle) {
      const handle = clip(rawHandle, 64).toLowerCase()
      if (!handle) return { available: true, message: '留空会用你的默认用户名。' }
      // USERNAME-IMMUTABLE: once an @ID exists it cannot move, so the
      // editor's feedback says so instead of quoting availability for
      // a change the save would refuse anyway.
      const existing = await profileRecordOf(identity.uid)
      const loginName = identity.uid.startsWith('username:')
        ? clip(identity.uid.slice('username:'.length), 40)
        : ''
      const effective = existing?.handle || loginName
      if (effective) {
        return handle === effective
          ? { available: true, message: '这是你现在的用户名。' }
          : { available: false, message: '用户名（@ID）定下后不能修改。' }
      }
      const problem = await handleProblem(identity, handle)
      return problem
        ? { available: false, message: problem }
        : { available: true, message: '这个用户名可以用。' }
    },

    /** PUT /api/me/profile — display name, @handle, bio and picture choice. */
    async saveMyProfile(identity, body) {
      if (!backend) throw new ApiError(503, '主页服务尚未配置。')
      const input = body && typeof body === 'object' ? body : {}
      return serialise(`profile:${identity.uid}`, async () => {
        const existing = await profileRecordOf(identity.uid)
        const record = {
          uid: identity.uid,
          displayName: existing?.displayName || '',
          handle: existing?.handle || '',
          bio: existing?.bio || '',
          pictureKind: existing?.pictureKind ?? null,
          pictureVersion: existing?.pictureVersion || 0,
          bannerVersion: existing?.bannerVersion || 0,
          // 合流权限 (REQ-49): the account-level fusion consent,
          // carried on the profile record so every surface resolves
          // the same value from the same place. Absent = free.
          fusionPermission: fusionPermissionOfRecord(existing),
        }
        if ('fusionPermission' in input) {
          if (!['free', 'ask', 'forbidden'].includes(input.fusionPermission)) {
            throw new ApiError(400, '合流权限选项不对。')
          }
          record.fusionPermission = input.fusionPermission
        }
        if ('displayName' in input) {
          const name = sanitizeSettingText(clip(input.displayName, 60)).trim()
          // §54 source cap: the card name slot is budgeted at 18 wide
          // units (measured against the narrowest supported card);
          // reject over-budget names here instead of letting a card
          // clip them later.
          if (!name || charCount(name) > 20 || textUnitsOf(name) > 18) throw new ApiError(400, '显示名太长了：最多 9 个汉字或 18 个英文字母。')
          record.displayName = name
        }
        if ('bio' in input) {
          // One short paragraph, same sanitising口径 as every other
          // owner-written text; clearing it (empty string) is a
          // legitimate save, unlike the display name.
          const bio = sanitizeSettingText(clip(input.bio, 400)).trim()
          if (charCount(bio) > 120) throw new ApiError(400, '简介最多 120 个字。')
          record.bio = bio
        }
        if ('handle' in input) {
          const submitted = input.handle === null ? '' : clip(input.handle, 64).toLowerCase()
          // USERNAME-IMMUTABLE (2026-10-28 user rule): the @ID is
          // fixed the moment it exists — for a username account it IS
          // the login name (carried by the uid, never duplicated into
          // the record); for every other account it is the handle they
          // claimed. An update that tries to move it — rename OR
          // clear — is refused 400, loudly, rather than silently
          // ignored: the editor surfaces the message, and a client
          // round-tripping the current value never trips this. Only a
          // first claim (no @ID yet) still goes through the usual
          // shape / uniqueness / shadowing validation.
          const loginName = identity.uid.startsWith('username:')
            ? clip(identity.uid.slice('username:'.length), 40)
            : ''
          const effective = record.handle || loginName
          if (submitted !== effective) {
            if (effective) throw new ApiError(400, '用户名（@ID）定下后不能修改。')
            const problem = await handleProblem(identity, submitted)
            if (problem === HANDLE_TAKEN_MESSAGE) throw new ApiError(409, problem)
            if (problem) throw new ApiError(400, problem)
            record.handle = submitted
          }
        }
        if ('pictureKind' in input) {
          const kind = input.pictureKind
          if (kind !== null && kind !== 'upload' && kind !== 'avatar' && kind !== 'default') {
            throw new ApiError(400, '头像选择不对。')
          }
          if (kind === 'upload' && !await backend.getPicture(identity.uid)) {
            throw new ApiError(400, '先上传一张图片，再使用它作头像。')
          }
          if (kind !== record.pictureKind) {
            record.pictureKind = kind
            record.pictureVersion += 1
          }
        }
        record.updatedAt = new Date(now()).toISOString()
        await backend.putProfileRecord(record)
        return this.profile(identity, identity.uid)
      })
    },

    /** POST /api/me/profile/picture — the owner's uploaded picture. */
    async saveMyPicture(identity, body) {
      if (!backend) throw new ApiError(503, '主页服务尚未配置。')
      const input = body && typeof body === 'object' ? body : {}
      const contentType = typeof input.contentType === 'string' ? input.contentType : ''
      if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
        throw new ApiError(400, '头像只支持 JPG 或 PNG 图片。')
      }
      const encoded = typeof input.image === 'string'
        ? input.image.replace(/^data:image\/[a-z+]+;base64,/, '')
        : ''
      const buffer = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0)
      if (!buffer.length || buffer.length > PROFILE_PICTURE_MAX_BYTES) {
        throw new ApiError(400, '图片太大了，换一张 1MB 以内的。')
      }
      const magicOk = contentType === 'image/jpeg'
        ? buffer[0] === 0xff && buffer[1] === 0xd8
        : buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
      if (!magicOk) throw new ApiError(400, '图片格式对不上，请换一张 JPG 或 PNG。')
      return serialise(`profile:${identity.uid}`, async () => {
        await backend.putPicture(identity.uid, {
          image: buffer.toString('base64'),
          contentType,
          updatedAt: new Date(now()).toISOString(),
        })
        const existing = await profileRecordOf(identity.uid)
        await backend.putProfileRecord({
          uid: identity.uid,
          displayName: existing?.displayName || '',
          handle: existing?.handle || '',
          bio: existing?.bio || '',
          pictureKind: 'upload',
          pictureVersion: (existing?.pictureVersion || 0) + 1,
          bannerVersion: existing?.bannerVersion || 0,
          fusionPermission: fusionPermissionOfRecord(existing),
          updatedAt: new Date(now()).toISOString(),
        })
        return this.profile(identity, identity.uid)
      })
    },

    /** POST /api/me/profile/banner — the owner's uploaded hero banner (REQ-19). */
    async saveMyBanner(identity, body) {
      if (!backend) throw new ApiError(503, '主页服务尚未配置。')
      const input = body && typeof body === 'object' ? body : {}
      const contentType = typeof input.contentType === 'string' ? input.contentType : ''
      if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
        throw new ApiError(400, '头图只支持 JPG 或 PNG 图片。')
      }
      const encoded = typeof input.image === 'string'
        ? input.image.replace(/^data:image\/[a-z+]+;base64,/, '')
        : ''
      const buffer = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0)
      if (!buffer.length || buffer.length > PROFILE_BANNER_MAX_BYTES) {
        throw new ApiError(400, '图片太大了，换一张 1MB 以内的。')
      }
      const magicOk = contentType === 'image/jpeg'
        ? buffer[0] === 0xff && buffer[1] === 0xd8
        : buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
      if (!magicOk) throw new ApiError(400, '图片格式对不上，请换一张 JPG 或 PNG。')
      return serialise(`profile:${identity.uid}`, async () => {
        await backend.putBanner(identity.uid, {
          image: buffer.toString('base64'),
          contentType,
          updatedAt: new Date(now()).toISOString(),
        })
        const existing = await profileRecordOf(identity.uid)
        await backend.putProfileRecord({
          uid: identity.uid,
          displayName: existing?.displayName || '',
          handle: existing?.handle || '',
          bio: existing?.bio || '',
          pictureKind: existing?.pictureKind ?? null,
          pictureVersion: existing?.pictureVersion || 0,
          bannerVersion: (existing?.bannerVersion || 0) + 1,
          fusionPermission: fusionPermissionOfRecord(existing),
          updatedAt: new Date(now()).toISOString(),
        })
        return this.profile(identity, identity.uid)
      })
    },

    /** DELETE /api/me/profile/banner — back to the resolved default chain. */
    async deleteMyBanner(identity) {
      if (!backend) throw new ApiError(503, '主页服务尚未配置。')
      return serialise(`profile:${identity.uid}`, async () => {
        await backend.deleteBanner(identity.uid)
        const existing = await profileRecordOf(identity.uid)
        await backend.putProfileRecord({
          uid: identity.uid,
          displayName: existing?.displayName || '',
          handle: existing?.handle || '',
          bio: existing?.bio || '',
          pictureKind: existing?.pictureKind ?? null,
          pictureVersion: existing?.pictureVersion || 0,
          bannerVersion: (existing?.bannerVersion || 0) + 1,
          fusionPermission: fusionPermissionOfRecord(existing),
          updatedAt: new Date(now()).toISOString(),
        })
        return this.profile(identity, identity.uid)
      })
    },

    /**
     * The uploaded banner bytes for `uid` (REQ-19). Only the 'upload'
     * resolution has bytes here — the avatar and default banners are
     * the portrait route and a static asset respectively.
     */
    async banner(uid) {
      const target = clip(uid, 512)
      if (!target || !backend) return null
      const stored = await backend.getBanner(target).catch(() => null)
      if (!stored?.image) return null
      return { buffer: Buffer.from(stored.image, 'base64'), contentType: stored.contentType || 'image/jpeg' }
    },

    /**
     * The resolved profile picture bytes for `uid` (upload or avatar
     * portrait). The default asset is a static file — callers use the
     * URL from the profile payload — so a 'default' resolution is 404
     * here by design.
     */
    async picture(uid) {
      const target = clip(uid, 512)
      if (!target) return null
      const [record, profile] = await Promise.all([profileRecordOf(target), avatarProfileOf(target)])
      const hasUpload = backend ? Boolean(await backend.getPicture(target).catch(() => null)) : false
      const kind = pictureSourceFor(record, {
        hasUpload,
        portraitReady: profile?.portrait?.status === 'ready',
      })
      if (kind === 'upload') {
        const stored = await backend.getPicture(target)
        if (!stored?.image) return null
        return { buffer: Buffer.from(stored.image, 'base64'), contentType: stored.contentType || 'image/jpeg' }
      }
      if (kind === 'avatar') return this.portrait(target)
      return null
    },

    /**
     * The profile owner's portrait painting (public: profiles are
     * public). Without an avatar id this is the main avatar's current
     * painting — the historic 'current' slot every existing surface
     * reads. With one (PROFILE-ENRICH §35), it is that collection
     * member's own current painting, resolved through imageSlotFor so
     * the main avatar keeps its historic slot; an id that is not in
     * the collection is a 404, never a silent swap to the main image.
     */
    async portrait(uid, avatarId) {
      if (!avatars) return null
      const target = clip(uid, 512)
      if (!target) return null
      let slot = 'current'
      if (avatarId) {
        const collection = await avatarCollectionOf(target)
        if (!collection || !collection.avatars.some((item) => item.id === avatarId)) return null
        slot = imageSlotFor(collection, avatarId, 'current')
      }
      const image = await avatars.getImage(target, slot)
      if (!image?.image) return null
      // Same lazy top-band healing as the avatar service (§40 ③a):
      // public tiles read through here.
      return normalizedStoredImage(avatars, target, slot, image)
    },

    /** The resolved author identity + picture for plaza surfaces. */
    async authorIdentity(uid) {
      const target = clip(uid, 512)
      if (!target) return null
      const [record, profile] = await Promise.all([profileRecordOf(target), avatarProfileOf(target)])
      const picture = await pictureFor(target, record, profile)
      return {
        displayName: record?.displayName || '',
        handle: record?.handle || '',
        picture,
        portraitReady: profile?.portrait?.status === 'ready',
      }
    },

    async heartbeat(identity) {
      if (!backend) throw new ApiError(503, '在线状态尚未配置。')
      await backend.putPresence(identity.uid, now())
      return { ok: true }
    },

    async onlineCount() {
      if (!backend) return 0
      const at = now()
      const all = await backend.listPresence()
      return all.filter((record) => Number.isFinite(record?.lastSeen) && at - record.lastSeen < PRESENCE_WINDOW_MS).length
    },

    /**
     * One account event for the 系统 category, recorded by the account
     * routes at the moment the action it describes succeeds (a
     * password reset, a recovery-email bind/change/unbind). Only
     * uid/kind/detail/instant are stored — never an address, never a
     * code. Recording is best-effort by contract: callers swallow
     * failures so an event can never break the account action itself.
     */
    async recordAccountEvent(uid, kind, detail = '') {
      if (!backend || !uid) return
      await backend.putAccountEvent({
        id: `evt-${randomUUID()}`,
        uid,
        kind: clip(kind, 40),
        detail: clip(detail, 40),
        createdAt: new Date(now()).toISOString(),
      })
    },

    /**
     * The message centre payload: three categories, each with its
     * items and its unread count against the caller's per-category
     * read watermark. Every item is derived from a real record —
     * 互动 from the follow edges pointing at the caller plus the
     * friend-request records (pending incoming requests, acceptances
     * of the caller's own requests), 公告 from the announcements
     * collection, 系统 from the caller's own account events. A follow edge stored
     * before edges carried timestamps has no `at`: it is listed (the
     * followers list is the present truth) but it never counts as
     * unread — an unknown age is not a new event, and no time is
     * invented for it.
     */
    async notifications(identity) {
      if (!backend) throw new ApiError(503, '消息服务尚未配置。')
      const byNewest = (a, b) => String(b.at || '').localeCompare(String(a.at || ''))
      const [edges, announcementRecords, eventRecords, readMarks, incomingRequests, outgoingRequests, postLikes, postComments, bookRatings, fusionRequests] = await Promise.all([
        backend.listFollowsByFollowee(identity.uid),
        backend.listAnnouncements(),
        backend.listAccountEvents(identity.uid),
        Promise.all(NOTIFY_CATEGORIES.map((category) => backend.getNotifyRead(identity.uid, category))),
        backend.listFriendRequestsByTo(identity.uid),
        backend.listFriendRequestsByFrom(identity.uid),
        feedBackend ? feedBackend.listLikesByPostAuthor(identity.uid).catch(() => []) : [],
        feedBackend ? feedBackend.listCommentsByPostAuthor(identity.uid).catch(() => []) : [],
        ratingsBackend ? ratingsBackend.listRatingsByBookAuthor(identity.uid).catch(() => []) : [],
        // 合流申请 (REQ-49): pending applications naming the caller as
        // the book's author, read from the fusion service's own
        // records. Stores predating the fusion collections simply
        // contribute none.
        typeof backend.listFusionRequestsByAuthor === 'function'
          ? backend.listFusionRequestsByAuthor(identity.uid).catch(() => [])
          : [],
      ])
      const followItems = await Promise.all([...edges]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map(async (record) => {
          const person = await resolvedPerson(record.followerUid, identity)
          return {
            id: `follow:${record.followerUid}`,
            kind: 'follow',
            actorUid: record.followerUid,
            displayName: person.displayName,
            handle: person.handle,
            picture: person.picture,
            at: typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : null,
          }
        }))
      // Friend events join 互动 from the same real records the 好友区
      // reads: a request still waiting on the caller (with the note
      // they sent), and an acceptance of a request the caller sent.
      // A decline writes NO item anywhere — the sender only sees the
      // state change in their own outgoing list, by design.
      const friendRequestItems = await Promise.all(incomingRequests
        .filter((record) => record.status === 'pending')
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map(async (record) => {
          const person = await resolvedPerson(record.fromUid, identity)
          return {
            id: `friend-request:${record.fromUid}`,
            kind: 'friend_request',
            actorUid: record.fromUid,
            displayName: person.displayName,
            handle: person.handle,
            picture: person.picture,
            message: record.message || '',
            at: record.createdAt || null,
          }
        }))
      const friendAcceptedItems = await Promise.all(outgoingRequests
        .filter((record) => record.status === 'accepted')
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map(async (record) => {
          const person = await resolvedPerson(record.toUid, identity)
          return {
            id: `friend-accepted:${record.toUid}`,
            kind: 'friend_accepted',
            actorUid: record.toUid,
            displayName: person.displayName,
            handle: person.handle,
            picture: person.picture,
            at: record.updatedAt || record.createdAt || null,
          }
        }))
      // Plaza engagement on the caller's own posts (BOOKSTORE-PLAZA):
      // a like or a comment by SOMEONE ELSE is an 互动 item; acting on
      // your own post never notifies you. The items are derived, not
      // stored — un-like deletes the like record and the item goes
      // with it, unread count and all.
      const likeItems = await Promise.all(postLikes
        .filter((record) => record.userUid && record.userUid !== identity.uid)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map(async (record) => {
          const person = await resolvedPerson(record.userUid, identity)
          return {
            id: `like:${record.postId}:${record.userUid}`,
            kind: 'like',
            actorUid: record.userUid,
            displayName: person.displayName,
            handle: person.handle,
            picture: person.picture,
            target: { type: 'post', postId: record.postId, excerpt: record.postExcerpt || '' },
            at: record.createdAt || null,
          }
        }))
      const commentItems = await Promise.all(postComments
        .filter((record) => record.status === 'active' && record.authorUid && record.authorUid !== identity.uid)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map(async (record) => {
          const person = await resolvedPerson(record.authorUid, identity)
          return {
            id: `comment:${record.id}`,
            kind: 'comment',
            actorUid: record.authorUid,
            displayName: person.displayName,
            handle: person.handle,
            picture: person.picture,
            target: {
              type: 'post',
              postId: record.postId,
              excerpt: record.postExcerpt || '',
              commentId: record.id,
              commentText: clip(record.content, 120),
            },
            at: record.createdAt || null,
          }
        }))
      // Ratings of the caller's own books (RATINGS): an 互动 item per
      // rating record, keyed and TIMED by the record's createdAt —
      // editing a rating updates the stars/text the item shows (the
      // record is read live) without making it new again, and
      // deleting the rating deletes the record, so the item retracts
      // like an un-like. Your own books cannot be rated by you, and
      // the actor filter below is the same belt-and-braces the like
      // and comment items wear.
      const ratingItems = await Promise.all(bookRatings
        .filter((record) => record.userUid && record.userUid !== identity.uid)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map(async (record) => {
          const person = await resolvedPerson(record.userUid, identity)
          return {
            id: `rating:${record.bookId}:${record.userUid}`,
            kind: 'rating',
            actorUid: record.userUid,
            displayName: person.displayName,
            handle: person.handle,
            picture: person.picture,
            target: {
              type: 'book',
              bookId: record.bookId,
              bookTitle: record.bookTitle || '',
              stars: record.stars,
              ratingText: clip(record.text, 120),
            },
            at: record.createdAt || null,
          }
        }))
      // A pending fusion application is an 互动 item the author ACTS
      // on (同意 / 拒绝 in the message centre): it exists exactly
      // while the application record is pending — deciding it (either
      // way) retracts the item, like an answered friend request, and
      // the outcome reaches the applicant through their 系统 events.
      const fusionRequestItems = await Promise.all(fusionRequests
        .filter((record) => record.status === 'pending' && record.applicantUid && record.applicantUid !== identity.uid)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map(async (record) => {
          const person = await resolvedPerson(record.applicantUid, identity)
          return {
            id: `fusion-request:${record.id}`,
            kind: 'fusion_request',
            requestId: record.id,
            actorUid: record.applicantUid,
            displayName: person.displayName,
            handle: person.handle,
            picture: person.picture,
            target: {
              type: 'book',
              bookId: record.publicationId,
              bookTitle: record.bookTitle || '',
              storyTitle: record.storyTitle || '',
              avatarName: record.avatarName || '',
            },
            at: record.createdAt || null,
          }
        }))
      const activityItems = [...followItems, ...friendRequestItems, ...friendAcceptedItems, ...likeItems, ...commentItems, ...ratingItems, ...fusionRequestItems]
        .sort(byNewest)
        .slice(0, NOTIFY_ITEM_CAP)
      const announcementItems = [...announcementRecords]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map((record) => ({
          id: record.id,
          kind: 'announcement',
          title: record.title,
          body: record.body,
          at: record.createdAt || null,
        }))
      const systemItems = [...eventRecords]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map((record) => ({
          id: record.id,
          kind: record.kind,
          detail: record.detail || '',
          at: record.createdAt || null,
        }))
      const itemsByCategory = { activity: activityItems, announcements: announcementItems, system: systemItems }
      const categories = {}
      let totalUnread = 0
      NOTIFY_CATEGORIES.forEach((category, index) => {
        const readAt = readMarks[index] || ''
        const items = itemsByCategory[category]
        const unread = items.filter((item) => item.at && item.at > readAt).length
        categories[category] = { unread, items }
        totalUnread += unread
      })
      return { categories, totalUnread }
    },

    /**
     * Opening a category marks THAT category read: the watermark is
     * the server's own instant, stored per user × category, so the
     * badge, another device and a later visit all agree — and reading
     * one category never touches the others.
     */
    async markNotificationsRead(identity, category) {
      if (!backend) throw new ApiError(503, '消息服务尚未配置。')
      if (!NOTIFY_CATEGORIES.includes(category)) throw new ApiError(400, '消息分类不对。')
      const readAt = new Date(now()).toISOString()
      await backend.putNotifyRead(identity.uid, category, readAt)
      return { category, readAt }
    },

    /** The public announcement list — what the 公告 category shows everyone. */
    async listAnnouncements() {
      if (!backend) return { announcements: [] }
      const records = await backend.listAnnouncements()
      const announcements = [...records]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, NOTIFY_ITEM_CAP)
        .map((record) => ({ id: record.id, title: record.title, body: record.body, at: record.createdAt || null }))
      return { announcements }
    },

    /**
     * Publishing an announcement is official-only: the same derived
     * test as the plaza's official samples (the uid IS a designated
     * official username account) — never a request flag. Title and
     * body are plain text, clipped and sanitised like every other
     * creator-authored string on the site.
     */
    async publishAnnouncement(identity, body) {
      if (!backend) throw new ApiError(503, '公告服务尚未配置。')
      if (!isOfficialUid(identity?.uid)) throw new ApiError(403, '只有织界官方可以发布公告。')
      const input = body && typeof body === 'object' ? body : {}
      const title = sanitizeSettingText(clip(input.title, 80)).trim()
      const text = sanitizeSettingText(clip(input.body, 2000)).trim()
      if (!title || !text) throw new ApiError(400, '公告要有标题和内容。')
      const record = { id: `ann-${randomUUID()}`, title, body: text, createdAt: new Date(now()).toISOString() }
      await backend.putAnnouncement(record)
      return { id: record.id, title: record.title, body: record.body, at: record.createdAt }
    },
  }
}
