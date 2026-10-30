import { randomUUID } from 'node:crypto'
import { ApiError } from './gemini.js'
import { createPlazaStore } from './plaza-store.js'
import { createSocialStore } from './social-store.js'
import { fusionPermissionOfRecord, normalizeFusionPermission } from '../src/fusion-permission.js'

/**
 * 合流权限 (REQ-49): the consent layer for fusing someone else's book.
 *
 * The setting itself lives on the author's profile record
 * (fusionPermission: free | ask | forbidden, absent = free — see
 * social.js saveMyProfile). This service owns the two record kinds
 * the setting produces, both stored in the social store family:
 * - fusion_requests: one application from a reader to the author of a
 *   publication, status pending → approved | rejected. While one is
 *   pending, the same reader cannot apply again for the same book.
 * - fusion_grants: the durable authorisation written by an approval,
 *   one per (applicant, publication). A grant is never revoked by a
 *   later setting change — the author promised, the promise stands.
 *
 * Decisions notify through the surfaces that already exist: pending
 * applications surface in the author's message centre （互动， derived
 * by social.notifications from these very records), and the outcome
 * lands in the applicant's 系统 category as an account event, exactly
 * like a password reset does.
 *
 * Enforcement boundary (stated plainly, see FUSION-PERMISSION.md):
 * story creation is local to the reader's client, and a published
 * book's text is public by design — so the hard server-side checks
 * live here (the application/grant APIs only ever act on the real
 * records) and at the plaza publish gate, which re-verifies every
 * outside source of a fused book against the author's CURRENT setting
 * plus these grants. The official client's merge page enforces the
 * same states at selection time.
 */
const clip = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : ''
const STATUS_ID_CAP = 50
const LIST_CAP = 50

const NOT_FOUND = () => new ApiError(404, '这本书已下架或不存在。')

export function createFusionService({ env = process.env, store, socialStore, plazaStore, now = () => Date.now() } = {}) {
  const socialBackend = store === undefined
    ? (socialStore === undefined ? createSocialStore({ env }) : socialStore)
    : store
  const plazaBackend = plazaStore === undefined ? createPlazaStore({ env }) : plazaStore
  const tails = new Map()
  const serialise = (key, task) => {
    const previous = tails.get(key) || Promise.resolve()
    const run = previous.then(task, task)
    tails.set(key, run.catch(() => {}))
    return run
  }
  const stamp = () => new Date(now()).toISOString()

  async function permissionOf(uid) {
    if (!socialBackend) return 'free'
    try {
      return fusionPermissionOfRecord(await socialBackend.getProfileRecord(uid))
    } catch {
      return 'free'
    }
  }

  async function publishedPublication(publicationId) {
    if (!plazaBackend) return null
    const record = await plazaBackend.getPublication(publicationId)
    return record && record.status === 'published' ? record : null
  }

  async function pendingRequestOf(applicantUid, publicationId) {
    if (!socialBackend) return null
    const mine = await socialBackend.listFusionRequestsByApplicant(applicantUid)
    return mine.find((record) => record.publicationId === publicationId && record.status === 'pending') || null
  }

  const requestView = (record) => ({
    id: record.id,
    publicationId: record.publicationId,
    bookTitle: record.bookTitle || '',
    applicantUid: record.applicantUid,
    authorUid: record.authorUid,
    storyTitle: record.storyTitle || '',
    avatarName: record.avatarName || '',
    status: record.status,
    createdAt: record.createdAt || null,
    decidedAt: record.decidedAt || null,
  })

  return {
    /** The author's account-level setting for one uid (absent record = free). */
    async permissionFor(uid) {
      return permissionOf(uid)
    },

    /**
     * The merge page's per-publication truth for the caller: whose
     * book it is, the author's current setting, whether a durable
     * grant already covers the caller, and whether an application is
     * still waiting on the author. A publication that is gone (or was
     * never published) answers state 'gone' and nothing else — the
     * merge page then falls back to its offline posture for that line.
     */
    async status(identity, publicationIds) {
      if (!socialBackend || !plazaBackend) throw new ApiError(503, '合流权限服务尚未配置。')
      const ids = [...new Set((Array.isArray(publicationIds) ? publicationIds : [])
        .map((id) => clip(id, 128)).filter(Boolean))].slice(0, STATUS_ID_CAP)
      const statuses = {}
      for (const publicationId of ids) {
        const record = await publishedPublication(publicationId)
        if (!record) {
          statuses[publicationId] = { state: 'gone' }
          continue
        }
        const own = record.authorUid === identity.uid
        const [permission, grant, pending] = await Promise.all([
          own ? Promise.resolve('free') : permissionOf(record.authorUid),
          own ? Promise.resolve(null) : socialBackend.getFusionGrant(identity.uid, publicationId),
          own ? Promise.resolve(null) : pendingRequestOf(identity.uid, publicationId),
        ])
        statuses[publicationId] = {
          authorUid: record.authorUid,
          permission,
          granted: Boolean(grant),
          pending: Boolean(pending),
          own,
        }
      }
      return { statuses }
    },

    /**
     * Apply to fuse one book whose author asks first. Every refusal
     * names its reason: your own book needs no application, a free
     * book needs none either, a forbidden book takes none at all, and
     * a pending application blocks a second one.
     */
    async apply(identity, body) {
      if (!socialBackend || !plazaBackend) throw new ApiError(503, '合流权限服务尚未配置。')
      const input = body && typeof body === 'object' ? body : {}
      const publicationId = clip(input.publicationId, 128)
      if (!publicationId) throw new ApiError(400, '没有说清要合流哪本书。')
      return serialise(`fusion-apply:${identity.uid}:${publicationId}`, async () => {
        const record = await publishedPublication(publicationId)
        if (!record) throw NOT_FOUND()
        if (record.authorUid === identity.uid) {
          throw new ApiError(400, '这是你自己的书，直接合流就可以，不用申请。')
        }
        if (await socialBackend.getFusionGrant(identity.uid, publicationId)) {
          throw new ApiError(409, '你已经拿到这本书的合流授权了，可以直接合流。', 'fusion-granted')
        }
        const permission = await permissionOf(record.authorUid)
        if (permission === 'free') {
          throw new ApiError(400, '这本书的作者开放自由合流，不用申请，直接合就可以。', 'fusion-free')
        }
        if (permission === 'forbidden') {
          throw new ApiError(403, '这本书的作者未开放合流，不能申请。', 'fusion-forbidden')
        }
        if (await pendingRequestOf(identity.uid, publicationId)) {
          throw new ApiError(409, '已经提交过申请了，等对方回应就好。', 'fusion-pending')
        }
        const request = {
          id: `fusion-req-${randomUUID()}`,
          applicantUid: identity.uid,
          authorUid: record.authorUid,
          publicationId,
          // The book's title is the server's own record, never the
          // applicant's claim; the applicant's line/avatar are their
          // stated intent, clipped like every creator string here.
          bookTitle: clip(record.title, 120),
          storyTitle: clip(input.storyTitle, 120),
          avatarName: clip(input.avatarName, 40),
          status: 'pending',
          createdAt: stamp(),
          decidedAt: null,
        }
        await socialBackend.putFusionRequest(request)
        return { request: requestView(request) }
      })
    },

    /** Both directions of the caller's applications, newest first. */
    async listMine(identity) {
      if (!socialBackend) throw new ApiError(503, '合流权限服务尚未配置。')
      const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      const [incoming, outgoing] = await Promise.all([
        socialBackend.listFusionRequestsByAuthor(identity.uid),
        socialBackend.listFusionRequestsByApplicant(identity.uid),
      ])
      return {
        incoming: [...incoming].sort(byNewest).slice(0, LIST_CAP).map(requestView),
        outgoing: [...outgoing].sort(byNewest).slice(0, LIST_CAP).map(requestView),
      }
    },

    /**
     * The author answers. Only the application that names the caller
     * as its author can be decided, only once, and only while pending
     * (a second answer is a 409, never a silent overwrite). Approval
     * writes the durable grant in the same serialised step; both
     * outcomes leave the applicant a 系统 message-centre event.
     */
    async decide(identity, body) {
      if (!socialBackend) throw new ApiError(503, '合流权限服务尚未配置。')
      const input = body && typeof body === 'object' ? body : {}
      const requestId = clip(input.requestId, 128)
      if (!requestId) throw new ApiError(400, '没有说清要回应哪条申请。')
      const approve = input.approve === true
      return serialise(`fusion-decide:${requestId}`, async () => {
        const record = await socialBackend.getFusionRequest(requestId)
        if (!record || record.authorUid !== identity.uid) throw new ApiError(404, '这条申请不存在。')
        if (record.status !== 'pending') throw new ApiError(409, '这条申请已经回应过了。')
        const decidedAt = stamp()
        const next = { ...record, status: approve ? 'approved' : 'rejected', decidedAt }
        await socialBackend.putFusionRequest(next)
        if (approve) {
          await socialBackend.putFusionGrant({
            applicantUid: record.applicantUid,
            authorUid: record.authorUid,
            publicationId: record.publicationId,
            bookTitle: record.bookTitle || '',
            requestId: record.id,
            grantedAt: decidedAt,
          })
        }
        // The applicant's 系统 reminder (NOTIFY-SETTINGS pattern): an
        // account event on THEIR timeline. Best-effort by contract —
        // the decision itself has already landed.
        try {
          await socialBackend.putAccountEvent({
            id: `evt-${randomUUID()}`,
            uid: record.applicantUid,
            kind: approve ? 'fusion-approved' : 'fusion-rejected',
            detail: clip(record.bookTitle, 40),
            createdAt: decidedAt,
          })
        } catch { /* the reminder is a record of the decision, never a gate on it */ }
        return { request: requestView(next), granted: approve }
      })
    },

    /**
     * The publish gate's one question, answered from the same records:
     * may this account fuse this publication into a book they publish?
     * Own book, durable grant, or the author's current free setting —
     * anything else says no. A publication that no longer exists
     * answers true: there is no author left to ask, and the fused
     * product is the publisher's own work by then (see the note).
     */
    async fusionAllowedFor(uid, publicationId) {
      if (!socialBackend || !plazaBackend) return true
      const record = await publishedPublication(publicationId)
      if (!record) return true
      if (record.authorUid === uid) return true
      if (await socialBackend.getFusionGrant(uid, publicationId)) return true
      return (await permissionOf(record.authorUid)) === 'free'
    },
  }
}

export { normalizeFusionPermission }
