import { ApiError, sanitizeSettingText } from './gemini.js'
import { GENRES } from '../src/story-engine.js'
import { dayKeyFor } from './usage.js'
import { createCoverStore } from './cover-store.js'
import { transcodeCoverImage } from './cover-image.js'

/**
 * Per-story cover generation. A cover is painted from the story's own
 * world — its world bible premise, its world, its template's craft flavour
 * and the imagery of its title — never from the shared world artwork.
 *
 * Image-model probe (2026-10-27, project of record, owner's credential):
 * Imagen publishers (imagen-3.0-generate-002 / imagen-4.0-generate-001 in
 * us-central1 and asia-northeast1) answer 404 "not found or your project
 * does not have access"; gemini-3-pro-image-preview is likewise absent.
 * `gemini-2.5-flash-image` on the Vertex generateContent surface (global
 * location — the same configuration the text backend runs) returned a
 * valid 864×1184 text-free illustration, so that is the cover model.
 * The Gemini Developer API is disabled in this project and is not used.
 */
export const COVER_IMAGE_MODEL = 'gemini-2.5-flash-image'
export const DEFAULT_COVER_DAILY_LIMIT = 5
const STORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function coverDailyLimit(env = {}) {
  const parsed = Number(env.COVER_DAILY_LIMIT)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : DEFAULT_COVER_DAILY_LIMIT
}

export function coverImageModel(env = {}) {
  const model = typeof env.COVER_IMAGE_MODEL === 'string' ? env.COVER_IMAGE_MODEL.trim() : ''
  return /^[a-zA-Z0-9._-]{1,100}$/.test(model) ? model : COVER_IMAGE_MODEL
}

// Craft flavour per story template (knowledge/genres.json ids). These are
// the site's own style words — fixed vocabulary, never reader input.
const TEMPLATE_STYLE = {
  xuanhuan: 'epic oriental fantasy, vast ancient worlds, dramatic scale and light',
  xianxia: 'ethereal Chinese xianxia illustration, misty immortal mountain sects, flowing robes, jade and cloud seas',
  gaowu: 'modern martial-arts metropolis, kinetic action energy, ranking-obsessed city',
  'romance-ancient': 'classical Chinese court romance, elegant palace architecture, silk and lantern light',
  scifi: 'cinematic science fiction, starships, frontier stations and deep-space colour',
  wuxianliu: 'surreal infinite-worlds thriller, liminal game-like spaces, uncanny calm',
  'guize-guatan': 'eerie rules-horror, liminal institutional spaces, unsettling stillness',
  horror: 'dark folk horror, candlelight, damp stone and long shadows',
  lishi: 'historical Chinese epic, period-authentic banners, maps and weathered bronze',
  'romance-modern': 'contemporary urban romance, warm city lights, quiet reunion mood',
  'suspense-supernatural': 'supernatural mystery, moonlit alleys, incense smoke and cold blue',
  campus: 'youthful school-days illustration, bright corridors, summer light, nostalgia',
  urban: 'modern city drama, neon streets, small people against a large skyline',
  'zhihu-short': 'minimalist literary mood, one striking scene, generous negative space',
}
const DEFAULT_STYLE = 'cinematic storybook illustration, one striking scene, rich painterly detail'

const clip = (value, length) => typeof value === 'string' ? value.slice(0, length) : ''
// Every reader-authored fragment that reaches the image prompt passes the
// same structural-impersonation scrub as god-mode settings do for text.
const safeText = (value, length) => sanitizeSettingText(clip(value, length)).trim()

function worldOf(payload) {
  const genreId = clip(payload?.config?.genreId || payload?.genreId, 60)
  const genre = GENRES.find((item) => item.id === genreId) || null
  const customName = safeText(payload?.config?.customWorldName, 40)
  return {
    name: customName || genre?.world || '',
    flavour: genre ? `${clip(genre.description, 300)} ${clip(genre.tagline, 80)}`.trim() : '',
  }
}

/**
 * Assemble the image prompt from a story's own materials. The output is an
 * instruction to paint a wordless illustration: the title contributes its
 * imagery only, and the prompt forbids text several times over — cover
 * titles are typeset by the UI, never baked into the picture.
 */
export function buildCoverPrompt(payload) {
  const world = worldOf(payload)
  const premise = safeText(payload?.worldBible?.premise, 600)
  const setting = safeText(payload?.config?.customWorldSetting, 300)
  const title = safeText(payload?.title, 80)
  const templateId = clip(payload?.genreTemplateId || payload?.config?.genreTemplateId, 60)
  const style = TEMPLATE_STYLE[templateId] || DEFAULT_STYLE
  const parts = [
    'A vertical 3:4 book cover illustration for a work of fiction. The image must contain absolutely no text: no letters, no words, no calligraphy, no typography, no watermark, no logo, no numbers.',
    world.name ? `World: ${world.name}.` : '',
    premise ? `The world as the story defines it: ${premise}` : '',
    setting ? `Creator's world notes: ${setting}` : '',
    world.flavour ? `Setting flavour: ${world.flavour}` : '',
    title ? `Evocative imagery suggested by the story's title (mood only — paint the scene, never the words): ${title}` : '',
    `Style: ${style}. One single striking scene, dramatic composition, cover-worthy focal subject, atmospheric depth.`,
  ]
  return parts.filter(Boolean).join('\n')
}

function validatedCoverPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, '封面请求格式有误，请重试。')
  const storyId = typeof body.storyId === 'string' ? body.storyId : ''
  if (!STORY_ID_PATTERN.test(storyId)) throw new ApiError(400, '故事编号无效。')
  const title = clip(body.title, 200).trim()
  if (!title) throw new ApiError(400, '这本书还没有标题，暂时不能生成封面。')
  const config = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : {}
  const bible = body.worldBible && typeof body.worldBible === 'object' && !Array.isArray(body.worldBible) ? body.worldBible : {}
  return {
    storyId,
    title,
    genreId: clip(body.genreId, 60),
    genreTemplateId: clip(body.genreTemplateId, 60),
    config: {
      genreId: clip(config.genreId, 60),
      genreTemplateId: clip(config.genreTemplateId, 60),
      customWorldName: clip(config.customWorldName, 100),
      customWorldSetting: clip(config.customWorldSetting, 1_200),
    },
    worldBible: { premise: clip(bible.premise, 1_000) },
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
  return async (prompt) => {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } },
    })
    const parts = response.candidates?.[0]?.content?.parts || []
    const image = parts.find((part) => part.inlineData?.data)
    if (!image) throw new ApiError(502, '封面暂时没能生成，请稍后再试。')
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
 * Cover service. Generation is deliberately serialised per account: the
 * daily cap is checked and spent inside the same critical section, and a
 * repeated request for the same book joins the in-flight one instead of
 * paying for a second painting.
 */
export function createCoverService({ env = process.env, store, imageGenerate, transcode = transcodeCoverImage, now = () => new Date() } = {}) {
  const backend = store === undefined ? createCoverStore({ env }) : store
  const model = coverImageModel(env)
  const limit = coverDailyLimit(env)
  const available = backend !== null && backend !== undefined && providerConfigured(env)
  let generatePromise = null
  const getGenerate = () => (generatePromise ??= (async () => imageGenerate || defaultImageGenerate({ env, model }))())
  const inFlight = new Map()
  const tails = new Map()

  const serialise = (uid, task) => {
    const previous = tails.get(uid) || Promise.resolve()
    const run = previous.then(task, task)
    tails.set(uid, run.catch(() => {}))
    return run
  }

  async function produce(identity, payload) {
    const day = dayKeyFor(now())
    const used = await backend.getDailyCount(identity.uid, day)
    if (used >= limit) throw new ApiError(429, `今天的封面生成次数已用完（每天 ${limit} 张），请明天再试。`, 'cover-quota')
    const prompt = buildCoverPrompt(payload)
    const generate = await getGenerate()
    let produced
    try {
      produced = await generate(prompt)
    } catch (error) {
      if (error instanceof ApiError) throw error
      const status = Number(error?.status || error?.code)
      if (status === 429 || status === 8) throw new ApiError(429, '封面生成请求较多，请稍后再试。')
      if ([400, 401, 403, 404, 7, 16].includes(status)) throw new ApiError(503, '封面生成暂时不可用，请稍后再试。')
      throw new ApiError(502, '封面暂时没能生成，请稍后再试。')
    }
    let image
    try {
      image = transcode(produced.buffer)
    } catch {
      throw new ApiError(502, '封面图暂时无法处理，请稍后再试。')
    }
    const existing = await backend.getCover(identity.uid, payload.storyId)
    const version = (Number.isInteger(existing?.version) ? existing.version : 0) + 1
    const record = {
      uid: identity.uid,
      storyId: payload.storyId,
      version,
      contentType: image.contentType,
      image: image.buffer.toString('base64'),
      bytes: image.buffer.length,
      model,
      updatedAt: now().toISOString(),
    }
    await backend.putCover(identity.uid, payload.storyId, record)
    await backend.incrementDaily(identity.uid, day)
    return { status: 'ready', version, model, usage: produced.usage ?? null }
  }

  return {
    available,
    model,
    dailyLimit: limit,
    async request(identity, body) {
      if (!available) throw new ApiError(503, '封面生成尚未配置。')
      const payload = validatedCoverPayload(body)
      const key = `${identity.uid}\n${payload.storyId}`
      if (inFlight.has(key)) return inFlight.get(key)
      const run = serialise(identity.uid, () => produce(identity, payload))
      inFlight.set(key, run)
      try {
        return await run
      } finally {
        inFlight.delete(key)
      }
    },
    async fetch(identity, storyId) {
      if (!backend || !STORY_ID_PATTERN.test(String(storyId || ''))) return null
      const record = await backend.getCover(identity.uid, storyId)
      if (!record?.image) return null
      return {
        buffer: Buffer.from(record.image, 'base64'),
        contentType: record.contentType || 'image/jpeg',
        version: record.version,
        updatedAt: record.updatedAt,
      }
    },
    async meta(identity, storyId) {
      if (!backend || !STORY_ID_PATTERN.test(String(storyId || ''))) return { status: 'none', version: 0 }
      const record = await backend.getCover(identity.uid, storyId)
      if (!record?.image) return { status: 'none', version: 0 }
      return { status: 'ready', version: record.version || 1, updatedAt: record.updatedAt || null }
    },
  }
}
