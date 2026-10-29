import { randomUUID } from 'node:crypto'
import { ApiError, sanitizeSettingText } from './gemini.js'
import { dayKeyFor } from './usage.js'
import { createAvatarStore, collectionFromRecord, imageSlotFor } from './avatar-store.js'
import { transcodePortraitImage, normalizedStoredImage } from './portrait-image.js'
import {
  AVATAR_APPEARANCE_FIELDS,
  AVATAR_DESCRIPTION_MAX,
  AVATAR_FACE_NOTE_MAX,
  AVATAR_LIMIT,
  AVATAR_NAME_MAX,
  avatarAppearancePrompt,
  normalizeAppearance,
  validateAvatarProfile,
} from '../src/avatar.js'

/**
 * The avatar service: one fixed character per account, painted by the
 * same image model the covers use (gemini-2.5-flash-image on the Vertex
 * generateContent surface — the probe result recorded in server/cover.js
 * applies unchanged). Portraits are POSTER key visuals (POSTER-AVATAR):
 * a single character in a dynamic pose and a dramatic camera angle,
 * against a graphic colour-block backdrop themed to the character's
 * world, with rim light and one genre effect painted into the image —
 * never a plain-background reference sheet, and never any text. The
 * face always sits in the upper part of the frame so the face-anchor
 * crop every small round surface relies on keeps working.
 *
 * Cross-generation consistency has two anchors, used together:
 *   1. the structured profile (fixed-vocabulary appearance), restated in
 *      full in every prompt, and
 *   2. the previous portrait itself, passed back as a reference image
 *      whenever one exists (the model accepts image parts on the same
 *      generateContent call). The first painting has no reference and is
 *      anchored by text alone; the result records which anchor was used
 *      (`anchor: 'reference' | 'text'`) so the ledger tells the truth.
 * The promise is a recognisably same person, not pixel identity.
 */
export const AVATAR_IMAGE_MODEL = 'gemini-2.5-flash-image'
export const DEFAULT_AVATAR_DAILY_LIMIT = 5

export function avatarDailyLimit(env = {}) {
  const parsed = Number(env.AVATAR_DAILY_LIMIT)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : DEFAULT_AVATAR_DAILY_LIMIT
}

export function avatarImageModel(env = {}) {
  const model = typeof env.AVATAR_IMAGE_MODEL === 'string' ? env.AVATAR_IMAGE_MODEL.trim() : ''
  return /^[a-zA-Z0-9._-]{1,100}$/.test(model) ? model : AVATAR_IMAGE_MODEL
}

const clip = (value, length) => typeof value === 'string' ? value.slice(0, length) : ''
// Reader-authored fragments pass the same structural-impersonation scrub
// as god-mode settings before they can reach any prompt.
const safeText = (value, length) => sanitizeSettingText(clip(value, length)).trim()

// The parts a single-part repaint may name (PERSONA-QA F-28). The keys
// are the appearance field ids; faceNote is the free-text facial detail.
export const AVATAR_LOCK_PARTS = Object.freeze({
  hairColor: 'hair colour',
  hairStyle: 'hairstyle',
  outfit: 'outfit',
  shoes: 'shoes',
  face: 'facial feature',
  faceNote: 'facial detail note',
})

function appearanceFragment(appearance, key) {
  const field = AVATAR_APPEARANCE_FIELDS.find((item) => item.key === key)
  if (!field) return ''
  const picked = field.options.find((item) => item.id === appearance?.[key])
  return picked?.prompt || ''
}

/**
 * The repaint lock (F-28): a part adjustment used to be a plain re-draw,
 * so a stated outfit could come back as a different outfit. The lock
 * names the ONE part that may change, restates every other part's
 * descriptor as preserved, and flips the usual precedence for the rest:
 * on everything but the locked part, the reference wins.
 */
function lockInstruction(profile, lockPart) {
  const look = normalizeAppearance(profile?.appearance)
  if (!look || !AVATAR_LOCK_PARTS[lockPart]) return ''
  const changed = lockPart === 'faceNote'
    ? safeText(profile?.appearance?.faceNote, AVATAR_FACE_NOTE_MAX)
    : appearanceFragment(look, lockPart)
  const preserved = AVATAR_APPEARANCE_FIELDS
    .filter((field) => field.key !== lockPart)
    .map((field) => appearanceFragment(look, field.key))
    .filter(Boolean)
    .join(', ')
  return `REPAINT LOCK — this is a single-part adjustment: change ONLY the ${AVATAR_LOCK_PARTS[lockPart]}${changed ? ` (now: ${changed})` : ''}. Everything else must stay exactly as it is in the reference image and as restated below; preserved unchanged: ${preserved || 'the full stated look'}. Do not substitute, restyle, drop or add any other garment, accessory or feature, and any clothing named in the character impression stays on the character.`
}

// The poster composition vocabulary (POSTER-AVATAR). A portrait is a
// key visual, not an ID photo: the camera and the pose rotate between
// dramatic options, picked deterministically from the profile so one
// avatar keeps a signature composition across repaints while different
// avatars do not all stand in the same spot.
export const AVATAR_POSTER_CAMERAS = Object.freeze([
  { id: 'low-angle', prompt: 'Camera: a dramatic low angle looking up at the character, strong foreshortening — the figure towers over the viewer against the backdrop.' },
  { id: 'high-angle', prompt: 'Camera: a dramatic high angle looking down at the character, the graphic ground plane of the backdrop sweeping out below them.' },
  { id: 'diagonal', prompt: 'Camera: a dynamic three-quarter view on a tilted diagonal axis — the whole composition cuts across the frame on a bold slant.' },
])

export const AVATAR_POSTER_POSES = Object.freeze([
  { id: 'stride', prompt: 'Pose: caught mid-stride, walking toward the viewer, garments and hair lifted by the motion.' },
  { id: 'glance-back', prompt: 'Pose: turning back over one shoulder to glance at the viewer, the body still in motion.' },
  { id: 'reach', prompt: 'Pose: one arm raised in a decisive gesture, weight shifted onto one leg, garments caught mid-motion.' },
])

/** The composition one profile paints with — stable per avatar + look. */
export function posterCompositionFor(profile) {
  const seed = `${profile?.name || ''}|${avatarAppearancePrompt(profile?.appearance)}|${profile?.description || ''}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  return {
    camera: AVATAR_POSTER_CAMERAS[hash % AVATAR_POSTER_CAMERAS.length],
    pose: AVATAR_POSTER_POSES[Math.floor(hash / AVATAR_POSTER_CAMERAS.length) % AVATAR_POSTER_POSES.length],
  }
}

/**
 * Assemble the portrait prompt from the structured profile. The structured
 * appearance is restated in full every time (that is the text anchor);
 * with a reference image the prompt additionally instructs the model to
 * keep the same person and apply the stated look. A `lockPart` narrows
 * that instruction to the one changed part (see lockInstruction) — under
 * a lock the reference also wins the composition, so the poster lines
 * step aside and only a full repaint restyles the painting.
 */
export function buildAvatarPrompt(profile, { hasReference = false, lockPart = null } = {}) {
  const look = avatarAppearancePrompt(profile?.appearance)
  const description = safeText(profile?.description, AVATAR_DESCRIPTION_MAX)
  const faceNote = safeText(profile?.appearance?.faceNote, AVATAR_FACE_NOTE_MAX)
  const lock = hasReference ? lockInstruction(profile, lockPart) : ''
  const composition = posterCompositionFor(profile)
  const poster = !lock
  const parts = [
    'A vertical 3:4 poster-style character key visual illustration for a fiction companion character. The image must contain absolutely no text: no letters, no words, no typography or lettering of any kind, no watermark, no logo.',
    hasReference
      ? lock
        ? 'The attached reference image shows the SAME character. Keep the same person — same face, same identity, recognisably them. This repaint changes one part only, under the lock below: where the stated look and the reference disagree on any OTHER part, the reference wins.'
        : 'The attached reference image shows the SAME character. Keep the same person — same face, same identity, recognisably them — and repaint them with the look stated below, in the poster composition below. Where the stated look and the reference disagree, the stated look wins.'
      : 'Paint this character as the key visual of a poster.',
    lock,
    poster ? 'Framing: one single character only, full body or large three-quarter body, and no other people.' : '',
    poster ? composition.camera.prompt : '',
    poster ? composition.pose.prompt : '',
    poster ? 'Backdrop: a poster-style graphic backdrop themed to the character\'s world and impression — bold flat colour-block shapes, graphic texture and thematic motifs. Never a plain empty background, and never a realistic photographed scene.' : '',
    poster ? 'Light and effects: strong rim light tracing the silhouette in a colour drawn from the backdrop, plus one genre effect painted into the image itself — drifting mist, electric arcs, sword-light streaks, floating embers or neon glow — matched to the character\'s world.' : '',
    'Face: the face sits in the UPPER part of the frame, fully visible, sharply detailed and clearly lit — never cropped by the frame edge, never turned fully away, never covered by hair, hands or effects.',
    // The precedence rule for unpicked aspects (FINAL-FIX R-07): an
    // appearance field the reader never chose is absent from this
    // prompt — it must not be filled from any default look, and the
    // reader's own written description (including the character name's
    // story-config snapshot) is the only authority for it.
    'Any aspect of the look NOT stated below — hair length or style, outfit, footwear, features — follows the character impression and any written description of this character, and nothing else: never substitute a generic default look for an unstated aspect.',
    look ? `Appearance: ${look}.` : '',
    faceNote ? `Facial detail: ${faceNote}.` : '',
    description ? `Character impression (mood and personality to express, not scenery): ${description}` : '',
    'Style: polished 2.5D painterly illustration, gentle cel shading over soft rendering, bold poster colour design, cinematic contrast, consistent character-design quality.',
  ]
  return parts.filter(Boolean).join('\n')
}

function scrubProfile(profile) {
  return {
    ...profile,
    name: safeText(profile.name, AVATAR_NAME_MAX),
    description: safeText(profile.description, AVATAR_DESCRIPTION_MAX),
    appearance: {
      ...profile.appearance,
      faceNote: safeText(profile.appearance.faceNote, AVATAR_FACE_NOTE_MAX),
    },
  }
}

function validatedProfile(body, existing) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, '化身资料格式有误，请重试。')
  const candidate = body.profile && typeof body.profile === 'object' ? body.profile : body
  const { profile, error } = validateAvatarProfile(candidate)
  if (error) throw new ApiError(400, error)
  const scrubbed = scrubProfile(profile)
  if (!scrubbed.name) throw new ApiError(400, '先给化身取个名字。')
  const now = new Date().toISOString()
  return {
    id: existing?.id || profile.id || `avatar-${randomUUID().slice(0, 12)}`,
    name: scrubbed.name,
    description: scrubbed.description,
    appearance: normalizeAppearance(scrubbed.appearance) || scrubbed.appearance,
    portrait: existing?.portrait || { status: 'none', version: 0, hasPrevious: false },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

async function defaultImageGenerate({ env, model }) {
  const backend = env.GENAI_BACKEND === 'vertex' ? 'vertex' : 'developer'
  const project = typeof env.GOOGLE_CLOUD_PROJECT === 'string' ? env.GOOGLE_CLOUD_PROJECT.trim() : ''
  const location = typeof env.GOOGLE_CLOUD_LOCATION === 'string' && env.GOOGLE_CLOUD_LOCATION.trim()
    ? env.GOOGLE_CLOUD_LOCATION.trim()
    : 'global'
  const apiKey = typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : ''
  const { GoogleGenAI } = await import('@google/genai')
  const client = backend === 'vertex'
    ? new GoogleGenAI({ vertexai: true, project, location })
    : new GoogleGenAI({ apiKey })
  return async (prompt, reference = null) => {
    const parts = [{ text: prompt }]
    if (reference?.buffer?.length) {
      parts.push({ inlineData: { data: reference.buffer.toString('base64'), mimeType: reference.mimeType || 'image/jpeg' } })
    }
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } },
    })
    const responseParts = response.candidates?.[0]?.content?.parts || []
    const image = responseParts.find((part) => part.inlineData?.data)
    if (!image) throw new ApiError(502, '立绘暂时没能生成，请稍后再试。')
    return {
      buffer: Buffer.from(image.inlineData.data, 'base64'),
      mimeType: image.inlineData.mimeType || 'image/png',
      usage: response.usageMetadata ?? null,
    }
  }
}

function providerConfigured(env) {
  if (env.GENAI_BACKEND === 'vertex') {
    const project = typeof env.GOOGLE_CLOUD_PROJECT === 'string' ? env.GOOGLE_CLOUD_PROJECT.trim() : ''
    return /^[a-z][a-z0-9:-]{4,128}$/i.test(project)
  }
  return Boolean(typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim())
}

/**
 * Avatar service: a per-account COLLECTION of avatars (F-27), one of
 * them the main avatar every identity surface resolves. Generation is
 * serialised per account like covers: the daily cap is checked and spent
 * inside the same critical section, the portrait state (pending →
 * ready/failed) is persisted on the profile so a reload mid-paint still
 * shows the truth, and the previous painting is kept one version back
 * for the reader to compare. Each avatar's paintings live in its own
 * image slots (the main avatar keeps the historic 'current'/'previous'
 * slots — see imageSlotFor), so painting one avatar never touches
 * another's portrait.
 */
export function createAvatarService({ env = process.env, store, imageGenerate, transcode = transcodePortraitImage, now = () => new Date() } = {}) {
  const backend = store === undefined ? createAvatarStore({ env }) : store
  const model = avatarImageModel(env)
  const limit = avatarDailyLimit(env)
  const available = backend !== null && backend !== undefined && providerConfigured(env)
  let generatePromise = null
  const getGenerate = () => (generatePromise ??= (async () => imageGenerate || defaultImageGenerate({ env, model }))())
  const tails = new Map()

  const serialise = (uid, task) => {
    const previous = tails.get(uid) || Promise.resolve()
    const run = previous.then(task, task)
    tails.set(uid, run.catch(() => {}))
    return run
  }

  const loadCollection = async (uid) => {
    if (!backend) return null
    if (typeof backend.getCollection === 'function') return backend.getCollection(uid)
    return collectionFromRecord(await backend.getProfile(uid))
  }

  const persistCollection = async (uid, collection) => {
    if (typeof backend.putCollection === 'function') return backend.putCollection(uid, collection)
    const main = collection.avatars.find((item) => item.id === collection.mainId) || null
    return backend.putProfile(uid, { uid, avatar: main, mainId: collection.mainId, avatars: collection.avatars })
  }

  const mainOf = (collection) => collection?.avatars.find((item) => item.id === collection.mainId)
    || collection?.avatars[0] || null

  const requestedIdOf = (body) => {
    if (!body || typeof body !== 'object') return null
    if (typeof body.avatarId === 'string' && body.avatarId) return body.avatarId
    const candidate = body.profile && typeof body.profile === 'object' ? body.profile : body
    return typeof candidate?.id === 'string' && candidate.id ? candidate.id : null
  }

  async function produce(identity, collection, avatar, { lockPart = null, credit = false } = {}) {
    const uid = identity.uid
    const commit = async (nextAvatar) => {
      const at = collection.avatars.findIndex((item) => item.id === nextAvatar.id)
      if (at === -1) collection.avatars.push(nextAvatar)
      else collection.avatars[at] = nextAvatar
      if (!collection.mainId) collection.mainId = nextAvatar.id
      await persistCollection(uid, collection)
      return nextAvatar
    }
    const day = dayKeyFor(now())
    const used = await backend.getDailyCount(uid, day)
    // BILLING: image credits paint past the daily cap (the credit is
    // the spend; the free daily count is not incremented for it).
    if (!credit && used >= limit) throw new ApiError(429, `今天的立绘生成次数已用完（每天 ${limit} 张），请明天再试。`, 'avatar-quota')
    const currentSlot = imageSlotFor(collection, avatar.id, 'current')
    const previousSlot = imageSlotFor(collection, avatar.id, 'previous')
    const previousRecord = await backend.getImage(uid, currentSlot)
    const reference = previousRecord?.image
      ? { buffer: Buffer.from(previousRecord.image, 'base64'), mimeType: previousRecord.contentType || 'image/jpeg' }
      : null
    const anchor = reference ? 'reference' : 'text'
    await commit({ ...avatar, portrait: { ...avatar.portrait, status: 'pending' } })
    const prompt = buildAvatarPrompt(avatar, { hasReference: Boolean(reference), lockPart })
    const generate = await getGenerate()
    let produced
    try {
      produced = await generate(prompt, reference)
    } catch (error) {
      await commit({ ...avatar, portrait: { ...avatar.portrait, status: 'failed', updatedAt: now().toISOString() } })
      if (error instanceof ApiError) throw error
      const status = Number(error?.status || error?.code)
      if (status === 429 || status === 8) throw new ApiError(429, '立绘生成请求较多，请稍后再试。')
      if ([400, 401, 403, 404, 7, 16].includes(status)) throw new ApiError(503, '立绘生成暂时不可用，请稍后再试。')
      throw new ApiError(502, '立绘暂时没能生成，请稍后再试。')
    }
    let image
    try {
      image = transcode(produced.buffer)
    } catch {
      await commit({ ...avatar, portrait: { ...avatar.portrait, status: 'failed', updatedAt: now().toISOString() } })
      throw new ApiError(502, '立绘图暂时无法处理，请稍后再试。')
    }
    const version = (Number.isInteger(avatar.portrait.version) ? avatar.portrait.version : 0) + 1
    if (previousRecord?.image) {
      await backend.putImage(uid, previousSlot, { ...previousRecord, slot: previousSlot })
    }
    await backend.putImage(uid, currentSlot, {
      uid,
      slot: currentSlot,
      version,
      contentType: image.contentType,
      image: image.buffer.toString('base64'),
      bytes: image.buffer.length,
      model,
      updatedAt: now().toISOString(),
    })
    if (!credit) await backend.incrementDaily(uid, day)
    const ready = {
      ...avatar,
      portrait: {
        status: 'ready',
        version,
        hasPrevious: Boolean(previousRecord?.image),
        updatedAt: now().toISOString(),
      },
      updatedAt: now().toISOString(),
    }
    await commit(ready)
    return { avatar: ready, usage: produced.usage ?? null, anchor, model }
  }

  return {
    available,
    model,
    dailyLimit: limit,
    /** The main avatar — the identity every other surface resolves. */
    async get(identity) {
      if (!backend) return null
      return mainOf(await loadCollection(identity.uid))
    },
    /** The whole collection plus today's portrait quota. */
    async list(identity) {
      if (!backend) return { avatars: [], mainId: null, quota: { used: 0, limit } }
      const collection = await loadCollection(identity.uid)
      const used = await backend.getDailyCount(identity.uid, dayKeyFor(now()))
      return {
        avatars: collection?.avatars || [],
        mainId: collection?.mainId || null,
        quota: { used, limit },
      }
    },
    async save(identity, body) {
      if (!backend) throw new ApiError(503, '化身服务尚未配置。')
      return serialise(identity.uid, async () => {
        const collection = (await loadCollection(identity.uid)) || { mainId: null, avatars: [] }
        const requestedId = requestedIdOf(body)
        const existing = requestedId
          ? collection.avatars.find((item) => item.id === requestedId) || null
          : mainOf(collection)
        if (requestedId && !existing && collection.avatars.length > 0) {
          throw new ApiError(404, '这位化身不存在了。')
        }
        const avatar = validatedProfile(body, existing)
        const at = collection.avatars.findIndex((item) => item.id === avatar.id)
        if (at === -1) {
          if (collection.avatars.length >= AVATAR_LIMIT) {
            throw new ApiError(400, `化身最多 ${AVATAR_LIMIT} 位，先删掉一位再建新的。`, 'avatar-limit')
          }
          collection.avatars.push(avatar)
          if (!collection.mainId) collection.mainId = avatar.id
        } else {
          collection.avatars[at] = avatar
        }
        await persistCollection(identity.uid, collection)
        return avatar
      })
    },
    /** Add a new avatar (profile only; painting goes through generate). */
    async create(identity, body) {
      if (!backend) throw new ApiError(503, '化身服务尚未配置。')
      return serialise(identity.uid, async () => {
        const collection = (await loadCollection(identity.uid)) || { mainId: null, avatars: [] }
        if (collection.avatars.length >= AVATAR_LIMIT) {
          throw new ApiError(400, `化身最多 ${AVATAR_LIMIT} 位，先删掉一位再建新的。`, 'avatar-limit')
        }
        const avatar = validatedProfile(body, null)
        collection.avatars.push(avatar)
        if (!collection.mainId) collection.mainId = avatar.id
        await persistCollection(identity.uid, collection)
        return avatar
      })
    },
    /**
     * Remove one avatar and its paintings. Stories that brought it in
     * keep their config snapshot (name + appearance text), so they are
     * unaffected here by construction. Deleting the main avatar promotes
     * the first remaining one — its paintings move into the main slots.
     */
    async remove(identity, avatarId) {
      if (!backend) throw new ApiError(503, '化身服务尚未配置。')
      return serialise(identity.uid, async () => {
        const collection = await loadCollection(identity.uid)
        const target = collection?.avatars.find((item) => item.id === avatarId) || null
        if (!target) throw new ApiError(404, '这位化身不存在了。')
        const remaining = collection.avatars.filter((item) => item.id !== avatarId)
        let mainId = collection.mainId
        if (avatarId === collection.mainId) {
          const promoted = remaining[0] || null
          if (promoted) {
            for (const which of ['current', 'previous']) {
              const fromSlot = imageSlotFor(collection, promoted.id, which)
              const record = await backend.getImage(identity.uid, fromSlot)
              if (record?.image) await backend.putImage(identity.uid, which, { ...record, slot: which })
              else await backend.deleteImage(identity.uid, which)
              await backend.deleteImage(identity.uid, fromSlot)
            }
            mainId = promoted.id
          } else {
            await backend.deleteImage(identity.uid, 'current')
            await backend.deleteImage(identity.uid, 'previous')
            mainId = null
          }
        } else {
          for (const which of ['current', 'previous']) {
            await backend.deleteImage(identity.uid, imageSlotFor(collection, avatarId, which))
          }
        }
        const next = { mainId, avatars: remaining }
        await persistCollection(identity.uid, next)
        return next
      })
    },
    /**
     * Make another avatar the main one. The two avatars' paintings swap
     * slots, so the main avatar's portraits always live at the historic
     * 'current'/'previous' slots the public picture endpoints read.
     */
    async setMain(identity, avatarId) {
      if (!backend) throw new ApiError(503, '化身服务尚未配置。')
      return serialise(identity.uid, async () => {
        const collection = await loadCollection(identity.uid)
        const target = collection?.avatars.find((item) => item.id === avatarId) || null
        if (!target) throw new ApiError(404, '这位化身不存在了。')
        if (avatarId === collection.mainId) {
          return { avatars: collection.avatars, mainId: collection.mainId }
        }
        const ownSlot = (which) => imageSlotFor(collection, avatarId, which)
        const oldMainId = collection.mainId
        const oldSlot = (which) => `${oldMainId}:${which}`
        const oldCurrent = await backend.getImage(identity.uid, 'current')
        const oldPrevious = await backend.getImage(identity.uid, 'previous')
        const newCurrent = await backend.getImage(identity.uid, ownSlot('current'))
        const newPrevious = await backend.getImage(identity.uid, ownSlot('previous'))
        const swap = async (record, slot) => {
          if (record?.image) await backend.putImage(identity.uid, slot, { ...record, slot })
          else await backend.deleteImage(identity.uid, slot)
        }
        await swap(newCurrent, 'current')
        await swap(newPrevious, 'previous')
        await swap(oldCurrent, oldSlot('current'))
        await swap(oldPrevious, oldSlot('previous'))
        collection.mainId = avatarId
        await persistCollection(identity.uid, collection)
        return { avatars: collection.avatars, mainId: avatarId }
      })
    },
    async generate(identity, body, options = {}) {
      if (!available) throw new ApiError(503, '立绘生成尚未配置。')
      return serialise(identity.uid, async () => {
        const collection = (await loadCollection(identity.uid)) || { mainId: null, avatars: [] }
        const requestedId = requestedIdOf(body)
        const existing = requestedId
          ? collection.avatars.find((item) => item.id === requestedId) || null
          : mainOf(collection)
        if (requestedId && !existing && collection.avatars.length > 0) {
          throw new ApiError(404, '这位化身不存在了。')
        }
        let avatar = existing
        if (body && typeof body === 'object' && (body.profile || body.name || body.appearance)) {
          avatar = validatedProfile(body, existing)
          const at = collection.avatars.findIndex((item) => item.id === avatar.id)
          if (at === -1) {
            if (collection.avatars.length >= AVATAR_LIMIT) {
              throw new ApiError(400, `化身最多 ${AVATAR_LIMIT} 位，先删掉一位再建新的。`, 'avatar-limit')
            }
            collection.avatars.push(avatar)
            if (!collection.mainId) collection.mainId = avatar.id
          } else {
            collection.avatars[at] = avatar
          }
          await persistCollection(identity.uid, collection)
        }
        if (!avatar) throw new ApiError(400, '先创建你的化身，再生成立绘。')
        const lockPart = typeof body?.lockPart === 'string' && AVATAR_LOCK_PARTS[body.lockPart]
          ? body.lockPart
          : null
        return produce(identity, collection, avatar, { lockPart, credit: options?.credit === true })
      })
    },
    async fetchImage(identity, which = 'current', avatarId = null) {
      if (!backend) return null
      const collection = await loadCollection(identity.uid)
      if (!collection || collection.avatars.length === 0) return null
      const target = avatarId
        ? collection.avatars.find((item) => item.id === avatarId) || null
        : mainOf(collection)
      if (!target) return null
      const slot = imageSlotFor(collection, target.id, which)
      const record = await backend.getImage(identity.uid, slot)
      if (!record?.image) return null
      // Legacy portraits heal a baked-in top band on first read (§40 ③a).
      const healed = await normalizedStoredImage(backend, identity.uid, slot, record)
      return {
        buffer: healed.buffer,
        contentType: healed.contentType,
        version: record.version,
        updatedAt: record.updatedAt,
      }
    },
  }
}
