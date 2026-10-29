import { createHash } from 'node:crypto'
import { dataStoreKind } from './data-store.js'
import { loadFirestore } from './firebase-app.js'

/**
 * Persistence for the social graph, plaza presence, custom profile
 * records, uploaded profile pictures and user reports.
 *
 * Follows are one record per (follower, followee) pair, keyed by a hash
 * of the pair so neither uid needs to be a valid document id. Friend
 * requests are one record per directional (from, to) pair carrying a
 * status (pending / accepted / declined / cancelled); a friendship is
 * one record per unordered pair, written when a request is accepted.
 * Presence
 * is one record per account holding only the last heartbeat instant —
 * no location, no device, nothing else. Profile records hold only what
 * the owner chose to publish (display name, @handle, picture choice);
 * a handle index maps each claimed handle to its owner's uid so
 * uniqueness is one lookup. Counts are computed by listing,
 * which is fine at plaza scale (the same trade plaza publications make)
 * and keeps a single source of truth: the pair records themselves.
 */
export const followKeyFor = (followerUid, followeeUid) =>
  createHash('sha256').update(`follow\n${followerUid}\n${followeeUid}`).digest('hex')
export const presenceKeyFor = (uid) => createHash('sha256').update(`presence\n${uid}`).digest('hex')
export const profileKeyFor = (uid) => createHash('sha256').update(`user-profile\n${uid}`).digest('hex')
export const pictureKeyFor = (uid) => createHash('sha256').update(`profile-picture\n${uid}`).digest('hex')
export const bannerKeyFor = (uid) => createHash('sha256').update(`profile-banner\n${uid}`).digest('hex')
export const userReportKeyFor = (reporterUid, targetUid) =>
  createHash('sha256').update(`user-report\n${reporterUid}\n${targetUid}`).digest('hex')
export const notifyReadKeyFor = (uid, category) =>
  createHash('sha256').update(`notify-read\n${uid}\n${category}`).digest('hex')
export const friendRequestKeyFor = (fromUid, toUid) =>
  createHash('sha256').update(`friend-request\n${fromUid}\n${toUid}`).digest('hex')
/** Friendships are mutual: one record per unordered pair, keyed by the sorted pair. */
export const friendshipKeyFor = (a, b) => {
  const [first, second] = [String(a), String(b)].sort()
  return createHash('sha256').update(`friendship\n${first}\n${second}`).digest('hex')
}

/**
 * Which picture a profile shows, given the owner's stored preference and
 * what actually exists. The chain always ends at the designed default
 * avatar asset — a profile never renders an empty placeholder.
 * - 'upload' chosen → the uploaded picture, else the default asset
 * - 'avatar' chosen → the avatar portrait, else the default asset
 * - 'default' chosen → the default asset
 * - unset (null) → the uploaded picture if one exists, else the portrait
 *   if one is ready, else the default asset (the historical behaviour:
 *   painting a portrait lights the profile up without further setup)
 */
export function pictureSourceFor(record, { hasUpload = false, portraitReady = false } = {}) {
  const kind = record?.pictureKind
  if (kind === 'upload') return hasUpload ? 'upload' : 'default'
  if (kind === 'avatar') return portraitReady ? 'avatar' : 'default'
  if (kind === 'default') return 'default'
  if (hasUpload) return 'upload'
  if (portraitReady) return 'avatar'
  return 'default'
}

/**
 * Which banner a profile hero shows (DEVICE-FIX REQ-19). There is no
 * stored preference: an uploaded banner wins outright; without one the
 * hero may still borrow the main avatar's portrait (the historical
 * blurred-ambience treatment); with neither, the designed default
 * banner asset carries the hero. Deleting the upload is the owner's
 * "恢复默认" — resolution then falls through the same chain.
 */
export function bannerSourceFor({ hasUpload = false, portraitReady = false } = {}) {
  if (hasUpload) return 'upload'
  if (portraitReady) return 'avatar'
  return 'default'
}

export function createMemorySocialStore() {
  const follows = new Map()
  const presence = new Map()
  const profiles = new Map()
  const handles = new Map()
  const pictures = new Map()
  const banners = new Map()
  const reports = new Map()
  const announcements = new Map()
  const notifyReads = new Map()
  const accountEvents = new Map()
  const friendRequests = new Map()
  const friendships = new Map()
  return {
    kind: 'memory',
    async getFollow(followerUid, followeeUid) {
      return follows.get(followKeyFor(followerUid, followeeUid)) ?? null
    },
    async putFollow(record) {
      follows.set(followKeyFor(record.followerUid, record.followeeUid), { ...record })
    },
    async deleteFollow(followerUid, followeeUid) {
      follows.delete(followKeyFor(followerUid, followeeUid))
    },
    async listFollowsByFollower(uid) {
      return [...follows.values()].filter((record) => record.followerUid === uid).map((record) => ({ ...record }))
    },
    async listFollowsByFollowee(uid) {
      return [...follows.values()].filter((record) => record.followeeUid === uid).map((record) => ({ ...record }))
    },
    async putPresence(uid, lastSeen) { presence.set(uid, { uid, lastSeen }) },
    async listPresence() { return [...presence.values()].map((record) => ({ ...record })) },
    async getProfileRecord(uid) {
      const record = profiles.get(profileKeyFor(uid))
      return record ? { ...record } : null
    },
    async putProfileRecord(record) {
      const key = profileKeyFor(record.uid)
      const existing = profiles.get(key)
      if (existing?.handle && existing.handle !== record.handle && handles.get(existing.handle) === record.uid) {
        handles.delete(existing.handle)
      }
      profiles.set(key, { ...record })
      if (record.handle) handles.set(record.handle, record.uid)
    },
    async getUidByHandle(handle) { return handles.get(handle) ?? null },
    async getPicture(uid) {
      const record = pictures.get(pictureKeyFor(uid))
      return record ? { ...record } : null
    },
    async putPicture(uid, record) { pictures.set(pictureKeyFor(uid), { ...record }) },
    async deletePicture(uid) { pictures.delete(pictureKeyFor(uid)) },
    async getBanner(uid) {
      const record = banners.get(bannerKeyFor(uid))
      return record ? { ...record } : null
    },
    async putBanner(uid, record) { banners.set(bannerKeyFor(uid), { ...record }) },
    async deleteBanner(uid) { banners.delete(bannerKeyFor(uid)) },
    async getUserReport(reporterUid, targetUid) {
      return reports.get(userReportKeyFor(reporterUid, targetUid)) ?? null
    },
    async putUserReport(record) {
      reports.set(userReportKeyFor(record.reporterUid, record.targetUid), { ...record })
    },
    async putAnnouncement(record) {
      announcements.set(record.id, { ...record })
    },
    async listAnnouncements() {
      return [...announcements.values()].map((record) => ({ ...record }))
    },
    async getNotifyRead(uid, category) {
      return notifyReads.get(notifyReadKeyFor(uid, category)) ?? null
    },
    async putNotifyRead(uid, category, readAt) {
      notifyReads.set(notifyReadKeyFor(uid, category), readAt)
    },
    async putAccountEvent(record) {
      accountEvents.set(record.id, { ...record })
    },
    async listAccountEvents(uid) {
      return [...accountEvents.values()].filter((record) => record.uid === uid).map((record) => ({ ...record }))
    },
    async listProfileRecords() {
      return [...profiles.values()].map((record) => ({ ...record }))
    },
    async getFriendRequest(fromUid, toUid) {
      return friendRequests.get(friendRequestKeyFor(fromUid, toUid)) ?? null
    },
    async putFriendRequest(record) {
      friendRequests.set(friendRequestKeyFor(record.fromUid, record.toUid), { ...record })
    },
    async listFriendRequestsByFrom(uid) {
      return [...friendRequests.values()].filter((record) => record.fromUid === uid).map((record) => ({ ...record }))
    },
    async listFriendRequestsByTo(uid) {
      return [...friendRequests.values()].filter((record) => record.toUid === uid).map((record) => ({ ...record }))
    },
    async getFriendship(a, b) {
      return friendships.get(friendshipKeyFor(a, b)) ?? null
    },
    async putFriendship(record) {
      friendships.set(friendshipKeyFor(record.uidA, record.uidB), { ...record })
    },
    async listFriendships(uid) {
      return [...friendships.values()]
        .filter((record) => record.uidA === uid || record.uidB === uid)
        .map((record) => ({ ...record }))
    },
  }
}

export function createFirestoreSocialStore(loadDb) {
  let dbPromise
  const db = () => (dbPromise ??= Promise.resolve().then(loadDb).catch((error) => { dbPromise = undefined; throw error }))
  const listBy = async (field, uid) => {
    const snapshot = await (await db()).collection('follows').where(field, '==', uid).get()
    return snapshot.docs.map((doc) => doc.data())
  }
  return {
    kind: 'firestore',
    async getFollow(followerUid, followeeUid) {
      const snapshot = await (await db()).collection('follows').doc(followKeyFor(followerUid, followeeUid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putFollow(record) {
      await (await db()).collection('follows')
        .doc(followKeyFor(record.followerUid, record.followeeUid))
        .set({ ...record })
    },
    async deleteFollow(followerUid, followeeUid) {
      await (await db()).collection('follows').doc(followKeyFor(followerUid, followeeUid)).delete()
    },
    listFollowsByFollower: (uid) => listBy('followerUid', uid),
    listFollowsByFollowee: (uid) => listBy('followeeUid', uid),
    async putPresence(uid, lastSeen) {
      await (await db()).collection('presence').doc(presenceKeyFor(uid)).set({ uid, lastSeen })
    },
    async listPresence() {
      const snapshot = await (await db()).collection('presence').get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async getProfileRecord(uid) {
      const snapshot = await (await db()).collection('user_profiles').doc(profileKeyFor(uid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putProfileRecord(record) {
      const database = await db()
      const existing = await database.collection('user_profiles').doc(profileKeyFor(record.uid)).get()
      const previous = existing.exists ? existing.data() : null
      if (previous?.handle && previous.handle !== record.handle) {
        const stale = await database.collection('profile_handles').doc(previous.handle).get()
        if (stale.exists && stale.data()?.uid === record.uid) await stale.ref.delete()
      }
      await database.collection('user_profiles').doc(profileKeyFor(record.uid)).set({ ...record })
      if (record.handle) {
        await database.collection('profile_handles').doc(record.handle).set({ uid: record.uid })
      }
    },
    async getUidByHandle(handle) {
      const snapshot = await (await db()).collection('profile_handles').doc(handle).get()
      return snapshot.exists ? (snapshot.data()?.uid ?? null) : null
    },
    async getPicture(uid) {
      const snapshot = await (await db()).collection('profile_pictures').doc(pictureKeyFor(uid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putPicture(uid, record) {
      await (await db()).collection('profile_pictures').doc(pictureKeyFor(uid)).set({ ...record })
    },
    async deletePicture(uid) {
      await (await db()).collection('profile_pictures').doc(pictureKeyFor(uid)).delete()
    },
    async getBanner(uid) {
      const snapshot = await (await db()).collection('profile_banners').doc(bannerKeyFor(uid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putBanner(uid, record) {
      await (await db()).collection('profile_banners').doc(bannerKeyFor(uid)).set({ ...record })
    },
    async deleteBanner(uid) {
      await (await db()).collection('profile_banners').doc(bannerKeyFor(uid)).delete()
    },
    async getUserReport(reporterUid, targetUid) {
      const snapshot = await (await db()).collection('user_reports').doc(userReportKeyFor(reporterUid, targetUid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putUserReport(record) {
      await (await db()).collection('user_reports')
        .doc(userReportKeyFor(record.reporterUid, record.targetUid))
        .set({ ...record })
    },
    async putAnnouncement(record) {
      await (await db()).collection('announcements').doc(record.id).set({ ...record })
    },
    async listAnnouncements() {
      const snapshot = await (await db()).collection('announcements').get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async getNotifyRead(uid, category) {
      const snapshot = await (await db()).collection('notify_reads').doc(notifyReadKeyFor(uid, category)).get()
      return snapshot.exists ? (snapshot.data()?.readAt ?? null) : null
    },
    async putNotifyRead(uid, category, readAt) {
      await (await db()).collection('notify_reads').doc(notifyReadKeyFor(uid, category)).set({ uid, category, readAt })
    },
    async putAccountEvent(record) {
      await (await db()).collection('account_events').doc(record.id).set({ ...record })
    },
    async listAccountEvents(uid) {
      const snapshot = await (await db()).collection('account_events').where('uid', '==', uid).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async listProfileRecords() {
      const snapshot = await (await db()).collection('user_profiles').get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async getFriendRequest(fromUid, toUid) {
      const snapshot = await (await db()).collection('friend_requests').doc(friendRequestKeyFor(fromUid, toUid)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putFriendRequest(record) {
      await (await db()).collection('friend_requests')
        .doc(friendRequestKeyFor(record.fromUid, record.toUid))
        .set({ ...record })
    },
    async listFriendRequestsByFrom(uid) {
      const snapshot = await (await db()).collection('friend_requests').where('fromUid', '==', uid).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async listFriendRequestsByTo(uid) {
      const snapshot = await (await db()).collection('friend_requests').where('toUid', '==', uid).get()
      return snapshot.docs.map((doc) => doc.data())
    },
    async getFriendship(a, b) {
      const snapshot = await (await db()).collection('friendships').doc(friendshipKeyFor(a, b)).get()
      return snapshot.exists ? snapshot.data() : null
    },
    async putFriendship(record) {
      await (await db()).collection('friendships')
        .doc(friendshipKeyFor(record.uidA, record.uidB))
        .set({ ...record })
    },
    async listFriendships(uid) {
      const database = await db()
      const [asA, asB] = await Promise.all([
        database.collection('friendships').where('uidA', '==', uid).get(),
        database.collection('friendships').where('uidB', '==', uid).get(),
      ])
      return [...asA.docs, ...asB.docs].map((doc) => doc.data())
    },
  }
}

export function createSocialStore({ env = process.env, db } = {}) {
  const kind = dataStoreKind(env)
  if (kind === null) return null
  if (kind === 'memory') return createMemorySocialStore()
  return createFirestoreSocialStore(db ? async () => db : () => loadFirestore(env))
}
