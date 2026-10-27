import { randomUUID } from 'node:crypto'
import { ApiError, sanitizeSettingText } from './gemini.js'
import { dayKeyFor } from './usage.js'
import { createAvatarStore } from './avatar-store.js'
import { transcodeCoverImage } from './cover-image.js'
import {
  AVATAR_DESCRIPTION_MAX,
  AVATAR_FACE_NOTE_MAX,
  AVATAR_NAME_MAX,
  avatarAppearancePrompt,
  normalizeAppearance,
  validateAvatarProfile,
} from '../src/avatar.js'

/**
 * The avatar service: one fixed character per account, painted by the
 * same image model the covers use (gemini-2.5-flash-image on the Vertex
 * generateContent surface — the probe result recorded in server/cover.js
 * applies unchanged). Portraits are character reference paintings:
 * a single character, full or large half body, clean background, no text.
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

/**
 * Assemble the portrait prompt from the structured profile. The structured
 * appearance is restated in full every time (that is the text anchor);
 * with a reference image the prompt additionally instructs the model to
 * keep the same person and apply the stated look.
 */
export function buildAvatarPrompt(profile, { hasReference = false } = {}) {
  const look = avatarAppearancePrompt(profile?.appearance)
  const description = safeText(profile?.description, AVATAR_DESCRIPTION_MAX)
  const faceNote = safeText(profile?.appearance?.faceNote, AVATAR_FACE_NOTE_MAX)
  const parts = [
    'A vertical 3:4 character portrait illustration for a fiction companion character. The image must contain absolutely no text: no letters, no words, no typography, no watermark, no logo.',
    hasReference
      ? 'The attached reference image shows the SAME character. Keep the same person — same face, same identity, recognisably them — and repaint them with the look stated below. Where the stated look and the reference disagree, the stated look wins.'
      : 'Paint this character as a character reference portrait.',
    'Framing: one single character only, full body or large three-quarter body, standing in a relaxed natural pose, facing the viewer, against a clean plain softly-lit background with no scenery and no other people.',
    look ? `Appearance: ${look}.` : '',
    faceNote ? `Facial detail: ${faceNote}.` : '',
    description ? `Character impression (mood and personality to express, not scenery): ${description}` : '',
    'Style: polished 2.5D painterly illustration, gentle cel shading over soft rendering, calm cinematic light, consistent character-design quality.',
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

const publicAvatar = (record) => {
  if (!record?.avatar) return null
  const { uid: _uid, ...rest } = record
  return rest.avatar
}

/**
 * Avatar service. Generation is serialised per account like covers: the
 * daily cap is checked and spent inside the same critical section, the
 * portrait state (pending → ready/failed) is persisted on the profile so
 * a reload mid-paint still shows the truth, and the previous painting is
 * kept one version back for the reader to compare.
 */
export function createAvatarService({ env = process.env, store, imageGenerate, transcode = transcodeCoverImage, now = () => new Date() } = {}) {
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

  const persist = async (uid, avatar) => {
    await backend.putProfile(uid, { uid, avatar })
    return avatar
  }

  async function produce(identity, avatar) {
    const day = dayKeyFor(now())
    const used = await backend.getDailyCount(identity.uid, day)
    if (used >= limit) throw new ApiError(429, `今天的立绘生成次数已用完（每天 ${limit} 张），请明天再试。`, 'avatar-quota')
    const previousRecord = await backend.getImage(identity.uid, 'current')
    const reference = previousRecord?.image
      ? { buffer: Buffer.from(previousRecord.image, 'base64'), mimeType: previousRecord.contentType || 'image/jpeg' }
      : null
    const anchor = reference ? 'reference' : 'text'
    await persist(identity.uid, { ...avatar, portrait: { ...avatar.portrait, status: 'pending' } })
    const prompt = buildAvatarPrompt(avatar, { hasReference: Boolean(reference) })
    const generate = await getGenerate()
    let produced
    try {
      produced = await generate(prompt, reference)
    } catch (error) {
      await persist(identity.uid, { ...avatar, portrait: { ...avatar.portrait, status: 'failed', updatedAt: now().toISOString() } })
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
      await persist(identity.uid, { ...avatar, portrait: { ...avatar.portrait, status: 'failed', updatedAt: now().toISOString() } })
      throw new ApiError(502, '立绘图暂时无法处理，请稍后再试。')
    }
    const version = (Number.isInteger(avatar.portrait.version) ? avatar.portrait.version : 0) + 1
    if (previousRecord?.image) {
      await backend.putImage(identity.uid, 'previous', { ...previousRecord, slot: 'previous' })
    }
    await backend.putImage(identity.uid, 'current', {
      uid: identity.uid,
      slot: 'current',
      version,
      contentType: image.contentType,
      image: image.buffer.toString('base64'),
      bytes: image.buffer.length,
      model,
      updatedAt: now().toISOString(),
    })
    await backend.incrementDaily(identity.uid, day)
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
    await persist(identity.uid, ready)
    return { avatar: ready, usage: produced.usage ?? null, anchor, model }
  }

  return {
    available,
    model,
    dailyLimit: limit,
    async get(identity) {
      if (!backend) return null
      const record = await backend.getProfile(identity.uid)
      return publicAvatar(record)
    },
    async save(identity, body) {
      if (!backend) throw new ApiError(503, '化身服务尚未配置。')
      return serialise(identity.uid, async () => {
        const record = await backend.getProfile(identity.uid)
        const avatar = validatedProfile(body, record?.avatar || null)
        await persist(identity.uid, avatar)
        return avatar
      })
    },
    async generate(identity, body) {
      if (!available) throw new ApiError(503, '立绘生成尚未配置。')
      return serialise(identity.uid, async () => {
        const record = await backend.getProfile(identity.uid)
        let avatar = record?.avatar || null
        if (body && typeof body === 'object' && (body.profile || body.name || body.appearance)) {
          avatar = validatedProfile(body, avatar)
          await persist(identity.uid, avatar)
        }
        if (!avatar) throw new ApiError(400, '先创建你的化身，再生成立绘。')
        return produce(identity, avatar)
      })
    },
    async fetchImage(identity, which = 'current') {
      if (!backend) return null
      const slot = which === 'previous' ? 'previous' : 'current'
      const record = await backend.getImage(identity.uid, slot)
      if (!record?.image) return null
      return {
        buffer: Buffer.from(record.image, 'base64'),
        contentType: record.contentType || 'image/jpeg',
        version: record.version,
        updatedAt: record.updatedAt,
      }
    },
  }
}
