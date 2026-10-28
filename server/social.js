import { ApiError, sanitizeSettingText } from './gemini.js'
import { avatarAppearanceText } from '../src/avatar.js'
import { CUSTOM_GENRE_ID } from '../src/story-engine.js'
import { createSocialStore, pictureSourceFor } from './social-store.js'
import { createPlazaStore } from './plaza-store.js'
import { createAvatarStore } from './avatar-store.js'
import { createCoverStore } from './cover-store.js'
import { createIdentityStore } from './identity-store.js'
import { plazaSummaryOf } from './plaza.js'

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
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/

const WORLD_ART_IDS = new Set(['mist', 'cultivation', 'neon', 'city', 'court', 'frontier', CUSTOM_GENRE_ID])
const clip = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : ''
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
  avatarStore,
  identityStore,
  coverStore,
  now = () => Date.now(),
} = {}) {
  const backend = store === undefined ? createSocialStore({ env }) : store
  const plazaBackend = plazaStore === undefined ? createPlazaStore({ env }) : plazaStore
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

  async function profileRecordOf(uid) {
    if (!backend) return null
    try {
      return await backend.getProfileRecord(uid)
    } catch {
      return null
    }
  }

  async function exists(uid, viewerIdentity) {
    if (viewerIdentity?.uid === uid) return true
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

  async function handleProblem(identity, handle) {
    if (!HANDLE_PATTERN.test(handle)) return HANDLE_INVALID_MESSAGE
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

    async profile(viewerIdentity, uid) {
      const target = clip(uid, 512)
      if (!target) throw NOT_FOUND()
      const [record, profile, publications, following, followers] = await Promise.all([
        profileRecordOf(target),
        avatarProfileOf(target),
        visiblePublicationsOf(target),
        backend ? backend.listFollowsByFollower(target) : Promise.resolve([]),
        backend ? backend.listFollowsByFollowee(target) : Promise.resolve([]),
      ])
      const isSelf = viewerIdentity?.uid === target
      if (!record && !profile && publications.length === 0 && !isSelf) {
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
      const payload = {
        uid: target,
        displayName,
        handle,
        picture,
        avatar: profile ? {
          name: sanitizeSettingText(clip(profile.name, 40)).trim(),
          description: sanitizeSettingText(clip(profile.description, 300)).trim(),
          appearance: avatarAppearanceText(profile.appearance),
          hasPortrait,
          ...(hasPortrait ? { portraitUrl: `/api/users/${encodeURIComponent(target)}/portrait` } : {}),
        } : null,
        counts: {
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
          pictureKind: record?.pictureKind ?? null,
          hasUpload: backend ? Boolean(await backend.getPicture(target).catch(() => null)) : false,
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
      const viewerUid = viewerIdentity?.uid || ''
      const people = await Promise.all(page.map(async (record) => {
        const personUid = kind === 'following' ? record.followeeUid : record.followerUid
        const [personRecord, personAvatar, personPublications] = await Promise.all([
          profileRecordOf(personUid),
          avatarProfileOf(personUid),
          visiblePublicationsOf(personUid),
        ])
        const fallback = publicIdentityFor(personUid, personPublications, viewerIdentity)
        const merged = identityFromRecord(personRecord, fallback)
        const avatarName = personAvatar ? sanitizeSettingText(clip(personAvatar.name, 40)).trim() : ''
        return {
          uid: personUid,
          displayName: publicDisplayName([merged.displayName, avatarName]),
          handle: publicHandle(merged.handle),
          picture: await pictureFor(personUid, personRecord, personAvatar),
          isSelf: Boolean(viewerUid) && viewerUid === personUid,
          isFollowing: viewerUid && viewerUid !== personUid
            ? Boolean(await backend.getFollow(viewerUid, personUid))
            : false,
        }
      }))
      return { kind: kind === 'following' ? 'following' : 'followers', people, total: records.length }
    },

    /** Availability of a @handle for the signed-in owner (editor feedback). */
    async checkHandle(identity, rawHandle) {
      const handle = clip(rawHandle, 64).toLowerCase()
      if (!handle) return { available: true, message: '留空会用你的默认用户名。' }
      const problem = await handleProblem(identity, handle)
      return problem
        ? { available: false, message: problem }
        : { available: true, message: '这个用户名可以用。' }
    },

    /** PUT /api/me/profile — display name, @handle and picture choice. */
    async saveMyProfile(identity, body) {
      if (!backend) throw new ApiError(503, '主页服务尚未配置。')
      const input = body && typeof body === 'object' ? body : {}
      return serialise(`profile:${identity.uid}`, async () => {
        const existing = await profileRecordOf(identity.uid)
        const record = {
          uid: identity.uid,
          displayName: existing?.displayName || '',
          handle: existing?.handle || '',
          pictureKind: existing?.pictureKind ?? null,
          pictureVersion: existing?.pictureVersion || 0,
        }
        if ('displayName' in input) {
          const name = sanitizeSettingText(clip(input.displayName, 60)).trim()
          if (!name || charCount(name) > 20) throw new ApiError(400, '显示名要有 1–20 个字。')
          record.displayName = name
        }
        if ('handle' in input) {
          const handle = input.handle === null ? '' : clip(input.handle, 64).toLowerCase()
          if (handle && handle !== record.handle) {
            const problem = await handleProblem(identity, handle)
            if (problem === HANDLE_TAKEN_MESSAGE) throw new ApiError(409, problem)
            if (problem) throw new ApiError(400, problem)
          }
          record.handle = handle
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
          pictureKind: 'upload',
          pictureVersion: (existing?.pictureVersion || 0) + 1,
          updatedAt: new Date(now()).toISOString(),
        })
        return this.profile(identity, identity.uid)
      })
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

    /** The profile owner's current portrait painting (public: profiles are public). */
    async portrait(uid) {
      if (!avatars) return null
      const target = clip(uid, 512)
      if (!target) return null
      const image = await avatars.getImage(target, 'current')
      if (!image?.image) return null
      return {
        buffer: Buffer.from(image.image, 'base64'),
        contentType: image.contentType || 'image/jpeg',
      }
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
  }
}
