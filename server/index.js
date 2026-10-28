import { createServer as httpCreateServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { ApiError, createGeminiGenerator, MAX_REQUEST_BYTES } from './gemini.js'
import { createAuthService } from './auth.js'
import { createEmailCodeService } from './email-code.js'
import { createUsernameAuthService } from './username-auth.js'
import { createIdentityStore } from './identity-store.js'
import { createCoverService } from './cover.js'
import { createAvatarService } from './avatar.js'
import { createPlazaService } from './plaza.js'
import { createSocialService } from './social.js'
import { createLibraryService } from './library.js'

const DEFAULT_DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const GENERATION_PAUSED = {
  configured: false,
  reason: 'generation-disabled',
  message: '在线创作暂未开放。你仍可阅读已有故事和体验预设故事。',
}

function sendJson(response, status, payload) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) })
  response.end(JSON.stringify(payload))
}

/** Per-client key for auth throttling: the first forwarded hop when a proxy reports it, else the socket peer. */
function clientKeyOf(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || request.socket?.remoteAddress || 'unknown'
}

function allowedRequest(request, server, env, write) {
  const localPort = server.address()?.port
  let host
  try { host = new URL(`http://${request.headers.host}`) } catch { throw new ApiError(403, '请求来源无效。') }
  // Bind is local-only; Host checks additionally stop DNS rebinding into the API.
  const cloudRun = Boolean(env.K_SERVICE)
  if (!cloudRun && !LOOPBACK.has(host.hostname)) throw new ApiError(403, '请求来源无效。')
  const origin = request.headers.origin
  if (!origin) {
    if (write || request.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, '请从本机应用打开此操作。')
    return
  }
  const allowed = new Set([
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
    `http://localhost:${localPort}`, `http://127.0.0.1:${localPort}`,
  ])
  if (env.APP_ORIGIN) {
    try { allowed.add(new URL(env.APP_ORIGIN).origin) } catch { /* Invalid configured origins grant no access. */ }
  }
  if (cloudRun) {
    const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase()
    const forwardedHost = String(request.headers['x-forwarded-host'] || '').split(',')[0].trim().toLowerCase()
    const sameOriginHost = forwardedHost || host.host
    if (forwardedProtocol === 'https' && /^[a-z0-9.-]+(?::\d{1,5})?$/.test(sameOriginHost)) {
      allowed.add(`https://${sameOriginHost}`)
    }
  }
  if (!allowed.has(origin)) throw new ApiError(403, '请从本机应用打开此操作。')
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, '请使用 JSON 格式提交章节请求。')
  }
  if (Number(request.headers['content-length']) > MAX_REQUEST_BYTES) throw new ApiError(413, '故事数据过大，请先导出备份。')
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > MAX_REQUEST_BYTES) throw new ApiError(413, '故事数据过大，请先导出备份。')
    chunks.push(chunk)
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result) || !result.story || !Number.isInteger(result.index)) throw new Error()
    return result
  } catch { throw new ApiError(400, '章节请求格式有误，请重试。') }
}

async function readCoverJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, '请使用 JSON 格式提交。')
  }
  if (Number(request.headers['content-length']) > 64 * 1024) throw new ApiError(413, '请求数据过大。')
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 64 * 1024) throw new ApiError(413, '请求数据过大。')
    chunks.push(chunk)
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error()
    return result
  } catch { throw new ApiError(400, '请求格式有误，请重试。') }
}

async function readAuthJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, '请使用 JSON 格式提交。')
  }
  if (Number(request.headers['content-length']) > 16 * 1024) throw new ApiError(413, '请求数据过大。')
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 16 * 1024) throw new ApiError(413, '请求数据过大。')
    chunks.push(chunk)
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error()
    return result
  } catch { throw new ApiError(400, '请求格式有误，请重试。') }
}

async function readPlazaJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, '请使用 JSON 格式提交。')
  }
  if (Number(request.headers['content-length']) > MAX_REQUEST_BYTES) throw new ApiError(413, '故事数据过大，请先导出备份。')
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > MAX_REQUEST_BYTES) throw new ApiError(413, '故事数据过大，请先导出备份。')
    chunks.push(chunk)
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error()
    return result
  } catch { throw new ApiError(400, '请求格式有误，请重试。') }
}

async function readPictureJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, '请使用 JSON 格式提交。')
  }
  // A ≤1 MB picture travels as base64 (~1.4 MB) plus JSON framing.
  const LIMIT = 1_900_000
  if (Number(request.headers['content-length']) > LIMIT) throw new ApiError(413, '图片太大了，换一张 1MB 以内的。')
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > LIMIT) throw new ApiError(413, '图片太大了，换一张 1MB 以内的。')
    chunks.push(chunk)
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error()
    return result
  } catch { throw new ApiError(400, '请求格式有误，请重试。') }
}

async function serveStatic(request, response, pathname, distDir) {
  let decoded
  try { decoded = decodeURIComponent(pathname) } catch { throw new ApiError(400, '页面地址无效。') }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some((part) => part.startsWith('.'))) throw new ApiError(404, '页面不存在。')
  let root
  try { root = await realpath(distDir) } catch { throw new ApiError(404, '页面尚未构建，请先运行 npm run build。') }
  let candidate = path.resolve(root, `.${decoded}`)
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) throw new ApiError(404, '页面不存在。')
  try {
    if ((await stat(candidate)).isDirectory()) candidate = path.join(candidate, 'index.html')
    candidate = await realpath(candidate)
  } catch {
    if (path.extname(decoded)) throw new ApiError(404, '页面不存在。')
    candidate = await realpath(path.join(root, 'index.html')).catch(() => { throw new ApiError(404, '页面不存在。') })
  }
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new ApiError(404, '页面不存在。')
  const type = MIME[path.extname(candidate)]
  if (!type || candidate.endsWith('.map')) throw new ApiError(404, '页面不存在。')
  const bytes = await readFile(candidate)
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': candidate.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' })
  response.end(request.method === 'HEAD' ? undefined : bytes)
}

export function createServer({ env = process.env, fetchImpl = globalThis.fetch, generator = createGeminiGenerator({ env, fetchImpl }), auth, cover = createCoverService({ env }), avatar = createAvatarService({ env }), plaza = createPlazaService({ env }), social, library = createLibraryService({ env }), distDir = DEFAULT_DIST } = {}) {
  // Default services share ONE identity store: the accounts the auth
  // channels register must be the accounts the social service can see
  // (profile existence is account-based, ACCOUNT-POLISH §5). Firestore
  // deployments already share the underlying collections; in memory
  // mode separate stores would be separate Maps and the split would
  // silently hide every account from the profile endpoint. Callers
  // that inject their own auth/social wire their own stores, as the
  // test fixtures do.
  if (auth === undefined || social === undefined) {
    const identityStore = createIdentityStore({ env })
    auth ??= createAuthService({
      env,
      emailCode: createEmailCodeService({ env, store: identityStore }),
      usernameAuth: createUsernameAuthService({ env, store: identityStore }),
    })
    social ??= createSocialService({ env, identityStore })
  }
  // Explicit opt-out preserves existing deployments until the release owner sets it.
  const generationEnabled = env.GENERATION_ENABLED !== 'false'
  // The model id is static configuration; remember it the first time status
  // is read so the usage ledger does not consult the provider again.
  let ledgerModel = null
  const modelForLedger = () => {
    if (ledgerModel === null) ledgerModel = generator.status().model
    return ledgerModel
  }
  const authConfig = auth.config()
  const authOrigin = authConfig.enabled ? `https://${authConfig.firebase.authDomain}` : null
  const authScripts = authOrigin ? ' https://apis.google.com' : ''
  const authConnections = authOrigin ? ` https://identitytoolkit.googleapis.com https://securetoken.googleapis.com ${authOrigin}` : ''
  const authFrames = authOrigin ? `; frame-src ${authOrigin}` : ''
  const server = httpCreateServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    // img-src allows blob: because per-story covers are fetched with the
    // reader's bearer token and rendered through object URLs (an <img>
    // cannot send an Authorization header).
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${authScripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'${authConnections}; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'${authFrames}`)
    let requestPath = ''
    try {
      allowedRequest(request, server, env, request.method === 'POST')
      const pathname = new URL(request.url, 'http://localhost').pathname
      requestPath = pathname
      if ((pathname === '/api/health' || pathname === '/healthz') && request.method === 'GET') return sendJson(response, 200, { ok: true })
      if (pathname === '/api/status' && request.method === 'GET') {
        if (!generationEnabled) return sendJson(response, 200, GENERATION_PAUSED)
        const status = generator.status()
        ledgerModel = status.model
        return sendJson(response, 200, status)
      }
      if (pathname === '/api/auth/config' && request.method === 'GET') return sendJson(response, 200, auth.config())
      if (pathname === '/api/account' && request.method === 'GET') return sendJson(response, 200, await auth.account(request.headers.authorization))
      if (pathname === '/api/auth/email/start' && request.method === 'POST') {
        if (typeof auth.emailStart !== 'function') throw new ApiError(503, '邮箱验证码服务尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.emailStart(await readAuthJson(request)))
      }
      if (pathname === '/api/auth/email/verify' && request.method === 'POST') {
        if (typeof auth.emailVerify !== 'function') throw new ApiError(503, '邮箱验证码服务尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.emailVerify(await readAuthJson(request)))
      }
      if (pathname === '/api/auth/email/signout' && request.method === 'POST') {
        if (typeof auth.emailSignOut !== 'function') throw new ApiError(503, '邮箱验证码服务尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.emailSignOut(request.headers.authorization))
      }
      if (pathname === '/api/auth/username/register' && request.method === 'POST') {
        if (typeof auth.usernameRegister !== 'function') throw new ApiError(503, '用户名登录尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.usernameRegister(await readAuthJson(request), clientKeyOf(request)))
      }
      if (pathname === '/api/auth/username/login' && request.method === 'POST') {
        if (typeof auth.usernameLogin !== 'function') throw new ApiError(503, '用户名登录尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.usernameLogin(await readAuthJson(request), clientKeyOf(request)))
      }
      if (pathname === '/api/auth/username/recovery/status' && request.method === 'POST') {
        if (typeof auth.usernameRecoveryStatus !== 'function') throw new ApiError(503, '用户名登录尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.usernameRecoveryStatus(await readAuthJson(request), clientKeyOf(request)))
      }
      if (pathname === '/api/auth/username/recovery/start' && request.method === 'POST') {
        if (typeof auth.usernameRecoveryStart !== 'function') throw new ApiError(503, '用户名登录尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.usernameRecoveryStart(await readAuthJson(request), clientKeyOf(request)))
      }
      if (pathname === '/api/auth/username/recovery/reset' && request.method === 'POST') {
        if (typeof auth.usernameRecoveryReset !== 'function') throw new ApiError(503, '用户名登录尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.usernameRecoveryReset(await readAuthJson(request), clientKeyOf(request)))
      }
      if (pathname === '/api/auth/username/recovery-email' && request.method === 'POST') {
        if (typeof auth.usernameSetRecoveryEmail !== 'function') throw new ApiError(503, '用户名登录尚未配置，请使用其他方式登录。')
        return sendJson(response, 200, await auth.usernameSetRecoveryEmail(request.headers.authorization, await readAuthJson(request)))
      }
      if (pathname === '/api/generate' && request.method === 'POST') {
        if (!generationEnabled) throw new ApiError(503, GENERATION_PAUSED.message)
        // Once auth is switched on, paid generation is no longer public: a
        // valid identity from either channel is required, with a per-user
        // daily token cap checked before the provider is called. Usage
        // storage outages fail open (see server/usage.js) so bookkeeping
        // problems can never take generation down with them.
        let identity = null
        if (typeof auth.requiresIdentity === 'function' && auth.requiresIdentity()) {
          try {
            identity = await auth.identity(request.headers.authorization)
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) throw new ApiError(401, '请先登录，再继续在线创作。', 'auth-required')
            throw error
          }
          const usedToday = await auth.usageDailyTotal(identity.uid)
          if (usedToday !== null && usedToday >= auth.dailyTokenCap()) {
            throw new ApiError(429, '今天的生成额度已用完，请明天再继续创作。', 'quota-exceeded')
          }
        }
        const body = await readJson(request)
        const result = await generator.generate(body)
        // Usage ledger: identity, model, story/chapter ids and token counts
        // only — never prose. Best effort: a logging failure must not fail
        // the chapter. A cache hit returns a generation that was already
        // metered when it was produced, so it is flagged in the log and
        // NOT recorded a second time; a degraded result (written by the
        // fallback channel) is a real generation and meters normally,
        // with the flag keeping the fallback count auditable.
        try {
          process.stdout.write(`${JSON.stringify({
            type: 'generation-usage',
            uid: identity?.uid ?? null,
            model: modelForLedger(),
            storyId: typeof body.story?.id === 'string' ? body.story.id : null,
            chapter: body.index + 1,
            genreTemplateId: result?.genreTemplateId ?? null,
            usage: result?.usage ?? 'unknown',
            cached: Boolean(result?.cached),
            degraded: Boolean(result?.degraded),
          })}\n`)
        } catch { /* ledger is best-effort */ }
        if (identity && !result?.cached) await auth.recordUsage(identity.uid, result?.usage ?? 'unknown')
        return sendJson(response, 200, result)
      }
      if (pathname === '/api/cover' && request.method === 'POST') {
        // Covers are account property: a signed-in identity is always
        // required, and the same daily discipline as generation applies
        // through the cover service's own per-account limit.
        let identity
        try {
          identity = await auth.identity(request.headers.authorization)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) throw new ApiError(401, '请先登录，再生成封面。', 'auth-required')
          throw error
        }
        const coverBody = await readCoverJson(request)
        const result = await cover.request(identity, coverBody)
        // Cover ledger: identity, story id, model and provider usage only —
        // never the prompt and never image bytes.
        try {
          process.stdout.write(`${JSON.stringify({
            type: 'cover-usage',
            kind: 'cover',
            uid: identity.uid,
            storyId: typeof coverBody?.storyId === 'string' ? coverBody.storyId : null,
            model: cover.model,
            usage: result?.usage ?? 'unknown',
          })}\n`)
        } catch { /* ledger is best-effort */ }
        return sendJson(response, 200, { status: result.status, version: result.version })
      }
      if (pathname === '/api/cover/meta' && request.method === 'GET') {
        const identity = await auth.identity(request.headers.authorization)
        const storyId = new URL(request.url, 'http://localhost').searchParams.get('storyId') || ''
        return sendJson(response, 200, await cover.meta(identity, storyId))
      }
      if (pathname === '/api/cover' && request.method === 'GET') {
        const identity = await auth.identity(request.headers.authorization)
        const storyId = new URL(request.url, 'http://localhost').searchParams.get('storyId') || ''
        const image = await cover.fetch(identity, storyId)
        if (!image) throw new ApiError(404, '这本书还没有专属封面。')
        if (!response.destroyed && !response.writableEnded) {
          response.writeHead(200, {
            'Content-Type': image.contentType,
            'Content-Length': image.buffer.length,
            'Cache-Control': 'private, max-age=300',
          })
          response.end(image.buffer)
        }
        return
      }
      if (pathname === '/api/avatar' && request.method === 'GET') {
        const identity = await auth.identity(request.headers.authorization)
        return sendJson(response, 200, { avatar: await avatar.get(identity) })
      }
      if (pathname === '/api/avatar' && request.method === 'PUT') {
        const identity = await auth.identity(request.headers.authorization)
        const saved = await avatar.save(identity, await readCoverJson(request))
        return sendJson(response, 200, { avatar: saved })
      }
      if (pathname === '/api/avatars' && request.method === 'GET') {
        const identity = await auth.identity(request.headers.authorization)
        return sendJson(response, 200, await avatar.list(identity))
      }
      if (pathname === '/api/avatars' && request.method === 'POST') {
        const identity = await auth.identity(request.headers.authorization)
        const created = await avatar.create(identity, await readCoverJson(request))
        return sendJson(response, 200, { avatar: created })
      }
      const avatarMainMatch = pathname.match(/^\/api\/avatars\/([^/]+)\/main$/)
      if (avatarMainMatch && request.method === 'POST') {
        const identity = await auth.identity(request.headers.authorization)
        const result = await avatar.setMain(identity, decodeURIComponent(avatarMainMatch[1]))
        return sendJson(response, 200, result)
      }
      const avatarDeleteMatch = pathname.match(/^\/api\/avatars\/([^/]+)$/)
      if (avatarDeleteMatch && request.method === 'DELETE') {
        const identity = await auth.identity(request.headers.authorization)
        const result = await avatar.remove(identity, decodeURIComponent(avatarDeleteMatch[1]))
        return sendJson(response, 200, result)
      }
      if (pathname === '/api/avatar/generate' && request.method === 'POST') {
        // Portraits are account property, like covers: a signed-in identity
        // is always required, and the avatar service enforces its own
        // per-account daily limit.
        let identity
        try {
          identity = await auth.identity(request.headers.authorization)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) throw new ApiError(401, '请先登录，再生成立绘。', 'auth-required')
          throw error
        }
        const avatarBody = await readCoverJson(request)
        const result = await avatar.generate(identity, avatarBody)
        // Avatar ledger: identity, model, anchor kind and provider usage
        // only — never the description and never image bytes.
        try {
          process.stdout.write(`${JSON.stringify({
            type: 'avatar-usage',
            kind: 'avatar',
            uid: identity.uid,
            model: avatar.model,
            anchor: result?.anchor ?? null,
            usage: result?.usage ?? 'unknown',
          })}\n`)
        } catch { /* ledger is best-effort */ }
        return sendJson(response, 200, { avatar: result.avatar })
      }
      if (pathname === '/api/avatar/image' && request.method === 'GET') {
        const identity = await auth.identity(request.headers.authorization)
        const params = new URL(request.url, 'http://localhost').searchParams
        const which = params.get('which') || 'current'
        const image = await avatar.fetchImage(identity, which, params.get('avatarId') || null)
        if (!image) throw new ApiError(404, '还没有这张立绘。')
        if (!response.destroyed && !response.writableEnded) {
          response.writeHead(200, {
            'Content-Type': image.contentType,
            'Content-Length': image.buffer.length,
            'Cache-Control': 'private, max-age=300',
          })
          response.end(image.buffer)
        }
        return
      }
      // The cloud library is account property: every route resolves the
      // caller's identity and the service addresses records by that uid
      // alone, so a book can only ever be reached by its owner. Local
      // storage remains the offline working copy; this is the account
      // copy the shelf restores from on a fresh browser.
      const libraryIdentity = async () => {
        try {
          return await auth.identity(request.headers.authorization)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) throw new ApiError(401, '请先登录，再使用云端书架。', 'auth-required')
          throw error
        }
      }
      if (pathname === '/api/library' && request.method === 'GET') {
        const identity = await libraryIdentity()
        return sendJson(response, 200, await library.list(identity))
      }
      if (pathname === '/api/library/reading-state' && request.method === 'PUT') {
        const identity = await libraryIdentity()
        return sendJson(response, 200, await library.putReadingState(identity, await readPlazaJson(request)))
      }
      const libraryMatch = pathname.match(/^\/api\/library\/stories\/([^/]+)(?:\/(head|chunks\/(\d+)))?$/)
      if (libraryMatch) {
        const storyId = decodeURIComponent(libraryMatch[1])
        const part = libraryMatch[2]
        const identity = await libraryIdentity()
        if (!part && request.method === 'GET') {
          return sendJson(response, 200, { story: await library.getStory(identity, storyId) })
        }
        if (!part && request.method === 'PUT') {
          return sendJson(response, 200, await library.putStory(identity, storyId, await readPlazaJson(request)))
        }
        if (!part && request.method === 'DELETE') {
          // Deleting a book deletes the whole book: its plaza publication
          // (if the line was published) and its generated cover go first,
          // then the library copy is removed and the tombstone written as
          // the commit point other devices sync from. Every step is
          // idempotent and owner-scoped, so a retry after any failure
          // converges; if a cascade step fails the request fails before
          // the tombstone, and the book stays on the caller's shelf.
          // Lines derived from this one (entered or fused copies) are
          // independent stories and are never cascaded into.
          await plaza.removeForStory(identity, storyId)
          await cover.remove(identity, storyId)
          return sendJson(response, 200, await library.remove(identity, storyId))
        }
        if (part === 'head' && request.method === 'PUT') {
          return sendJson(response, 200, await library.putHead(identity, storyId, await readPlazaJson(request)))
        }
        const chunkMatch = part?.match(/^chunks\/(\d+)$/)
        if (chunkMatch && request.method === 'PUT') {
          return sendJson(response, 200, await library.putChunk(identity, storyId, Number(chunkMatch[1]), await readPlazaJson(request)))
        }
      }
      if (pathname === '/api/plaza' && request.method === 'GET') {
        const publications = await plaza.feed()
        // Presence rides along with the feed so the header count is never
        // staler than the list itself; a presence failure never sinks the feed.
        let onlineCount = 0
        try { onlineCount = await social.onlineCount() } catch { /* count is decorative */ }
        return sendJson(response, 200, { publications, onlineCount })
      }
      if (pathname === '/api/me/profile' && request.method === 'PUT') {
        // Profile customization is account property: a signed-in
        // identity is always required, and the social service validates
        // the name, the @handle (unique across profile handles and
        // login usernames) and the picture choice.
        let identity
        try {
          identity = await auth.identity(request.headers.authorization)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) throw new ApiError(401, '请先登录，再编辑资料。', 'auth-required')
          throw error
        }
        return sendJson(response, 200, { profile: await social.saveMyProfile(identity, await readCoverJson(request)) })
      }
      if (pathname === '/api/me/profile/picture' && request.method === 'POST') {
        let identity
        try {
          identity = await auth.identity(request.headers.authorization)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) throw new ApiError(401, '请先登录，再换头像。', 'auth-required')
          throw error
        }
        return sendJson(response, 200, { profile: await social.saveMyPicture(identity, await readPictureJson(request)) })
      }
      if (pathname === '/api/me/handle' && request.method === 'GET') {
        const identity = await auth.identity(request.headers.authorization)
        const value = new URL(request.url, 'http://localhost').searchParams.get('value') || ''
        return sendJson(response, 200, await social.checkHandle(identity, value))
      }
      if (pathname === '/api/presence/heartbeat' && request.method === 'POST') {
        const identity = await auth.identity(request.headers.authorization)
        await social.heartbeat(identity)
        return sendJson(response, 200, { ok: true })
      }
      const userMatch = pathname.match(/^\/api\/users\/([^/]+)(?:\/(profile|connections|portrait|picture|follow|unfollow|report))?$/)
      if (userMatch) {
        const uid = decodeURIComponent(userMatch[1])
        const action = userMatch[2]
        if (action === 'portrait' && request.method === 'GET') {
          // ?avatar=<id> serves that collection member's painting
          // (PROFILE-ENRICH §35); without it, the main avatar's.
          const avatarParam = new URL(request.url, 'http://localhost').searchParams.get('avatar')
          const image = await social.portrait(uid, avatarParam || undefined)
          if (!image) throw new ApiError(404, '这位用户还没有立绘。')
          if (!response.destroyed && !response.writableEnded) {
            response.writeHead(200, {
              'Content-Type': image.contentType,
              'Content-Length': image.buffer.length,
              'Cache-Control': 'public, max-age=300',
            })
            response.end(image.buffer)
          }
          return
        }
        if (action === 'picture' && request.method === 'GET') {
          // The resolved profile picture (upload or portrait). The
          // default avatar is a static asset and never lands here.
          const image = await social.picture(uid)
          if (!image) throw new ApiError(404, '这位用户还没有自定义头像。')
          if (!response.destroyed && !response.writableEnded) {
            response.writeHead(200, {
              'Content-Type': image.contentType,
              'Content-Length': image.buffer.length,
              'Cache-Control': 'public, max-age=300',
            })
            response.end(image.buffer)
          }
          return
        }
        if (action === 'profile' && request.method === 'GET') {
          // Public page; a valid credential only fills in viewerState —
          // an absent or stale one still gets the public profile.
          let viewer = null
          if (request.headers.authorization) {
            try { viewer = await auth.identity(request.headers.authorization) } catch { viewer = null }
          }
          return sendJson(response, 200, { profile: await social.profile(viewer, uid) })
        }
        if (action === 'connections' && request.method === 'GET') {
          // The name-list behind a profile's 粉丝/关注 counts — public
          // like the profile itself; a credential only adds the
          // viewer's own follow state to each row.
          let viewer = null
          if (request.headers.authorization) {
            try { viewer = await auth.identity(request.headers.authorization) } catch { viewer = null }
          }
          const kind = new URL(request.url, 'http://localhost').searchParams.get('kind') === 'following' ? 'following' : 'followers'
          return sendJson(response, 200, await social.connections(viewer, uid, kind))
        }
        if ((action === 'follow' || action === 'unfollow') && request.method === 'POST') {
          let identity
          try {
            identity = await auth.identity(request.headers.authorization)
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              throw new ApiError(401, action === 'follow' ? '请先登录，再关注。' : '请先登录，再取消关注。', 'auth-required')
            }
            throw error
          }
          const result = action === 'follow' ? await social.follow(identity, uid) : await social.unfollow(identity, uid)
          return sendJson(response, 200, result)
        }
        if (action === 'report' && request.method === 'POST') {
          let identity
          try {
            identity = await auth.identity(request.headers.authorization)
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              throw new ApiError(401, '请先登录，再举报。', 'auth-required')
            }
            throw error
          }
          return sendJson(response, 200, await social.reportUser(identity, uid))
        }
      }
      if (pathname === '/api/plaza/publish' && request.method === 'POST') {
        // Publishing is account property: a signed-in identity is always
        // required, and the plaza service re-validates the line, its gate
        // and the red-line scan before anything is stored.
        let identity
        try {
          identity = await auth.identity(request.headers.authorization)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) throw new ApiError(401, '请先登录，再发布到广场。', 'auth-required')
          throw error
        }
        const publication = await plaza.publish(identity, await readPlazaJson(request))
        return sendJson(response, 200, { publication })
      }
      const plazaMatch = pathname.match(/^\/api\/plaza\/([^/]+)(?:\/(report|withdraw|portrait|cover))?$/)
      if (plazaMatch) {
        const id = decodeURIComponent(plazaMatch[1])
        const action = plazaMatch[2]
        if (!action && request.method === 'GET') {
          return sendJson(response, 200, { publication: await plaza.detail(id) })
        }
        if (action === 'cover' && request.method === 'GET') {
          // The story's own generated cover is public like the portrait:
          // it is the book's face on the plaza, fetched by publication
          // id so the author's account id never appears in a URL.
          const image = await plaza.cover(id)
          if (!image) throw new ApiError(404, '这条故事线还没有专属封面。')
          if (!response.destroyed && !response.writableEnded) {
            response.writeHead(200, {
              'Content-Type': image.contentType,
              'Content-Length': image.buffer.length,
              'Cache-Control': 'public, max-age=300',
            })
            response.end(image.buffer)
          }
          return
        }
        if (action === 'portrait' && request.method === 'GET') {
          const image = await plaza.portrait(id)
          if (!image) throw new ApiError(404, '这条故事线还没有立绘。')
          if (!response.destroyed && !response.writableEnded) {
            response.writeHead(200, {
              'Content-Type': image.contentType,
              'Content-Length': image.buffer.length,
              'Cache-Control': 'public, max-age=300',
            })
            response.end(image.buffer)
          }
          return
        }
        if ((action === 'report' || action === 'withdraw') && request.method === 'POST') {
          let identity
          try {
            identity = await auth.identity(request.headers.authorization)
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              throw new ApiError(401, action === 'report' ? '请先登录，再举报。' : '请先登录，再下架。', 'auth-required')
            }
            throw error
          }
          const result = action === 'report' ? await plaza.report(identity, id) : await plaza.withdraw(identity, id)
          return sendJson(response, 200, result)
        }
      }
      if (pathname.startsWith('/api/')) throw new ApiError(404, '接口不存在。')
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new ApiError(405, '此操作不支持。')
      await serveStatic(request, response, pathname, distDir)
    } catch (error) {
      // A non-ApiError reaching this catch on the generate route is an
      // unclassified server fault (the cold-start 502 class): the client
      // still gets the plain generic copy, but the full stack lands in
      // the server log so the fault is diagnosable after the fact.
      if (requestPath === '/api/generate' && !(error instanceof ApiError)) {
        try {
          process.stderr.write(`${JSON.stringify({
            type: 'generation-route-error',
            message: String(error?.message || error),
            stack: String(error?.stack || ''),
          })}\n`)
        } catch { /* logging is best-effort */ }
      }
      const payload = { error: error instanceof ApiError ? error.message : '服务暂时无法完成请求，请稍后重试。' }
      if (error instanceof ApiError && error.code) payload.code = error.code
      sendJson(response, error instanceof ApiError ? error.status : 502, payload)
    }
  })
  // Generation is allowed a 270s total budget server-side (RELIABILITY.md)
  // and Cloud Run gives the request 300s; the socket must not cut either
  // short — the old 70s requestTimeout was a second, hidden deadline that
  // killed slow-evening chapters after the generator's own cap was raised.
  server.requestTimeout = 300_000
  server.headersTimeout = 15_000
  server.keepAliveTimeout = 5_000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write('PORT 必须是 1–65535 之间的端口号。\n')
    process.exitCode = 1
  } else {
    const server = createServer()
    server.on('error', () => { process.stderr.write('本机服务无法启动，请检查端口是否已被占用。\n'); process.exitCode = 1 })
    const host = process.env.HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1')
    server.listen(port, host, () => process.stdout.write(`织界服务已启动：http://${host}:${port}\n`))
  }
}
