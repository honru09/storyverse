import { createServer as httpCreateServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { ApiError, createGeminiGenerator, MAX_REQUEST_BYTES } from './gemini.js'
import { createAuthService } from './auth.js'

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

export function createServer({ env = process.env, fetchImpl = globalThis.fetch, generator = createGeminiGenerator({ env, fetchImpl }), auth = createAuthService({ env }), distDir = DEFAULT_DIST } = {}) {
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
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${authScripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${authConnections}; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'${authFrames}`)
    try {
      allowedRequest(request, server, env, request.method === 'POST')
      const pathname = new URL(request.url, 'http://localhost').pathname
      if ((pathname === '/api/health' || pathname === '/healthz') && request.method === 'GET') return sendJson(response, 200, { ok: true })
      if (pathname === '/api/status' && request.method === 'GET') {
        if (!generationEnabled) return sendJson(response, 200, GENERATION_PAUSED)
        const status = generator.status()
        ledgerModel = status.model
        return sendJson(response, 200, status)
      }
      if (pathname === '/api/auth/config' && request.method === 'GET') return sendJson(response, 200, auth.config())
      if (pathname === '/api/account' && request.method === 'GET') return sendJson(response, 200, await auth.account(request.headers.authorization))
      if (pathname === '/api/generate' && request.method === 'POST') {
        if (!generationEnabled) throw new ApiError(503, GENERATION_PAUSED.message)
        const body = await readJson(request)
        const result = await generator.generate(body)
        // Usage ledger: model, story/chapter ids and token counts only — never
        // prose. Best effort: a logging failure must not fail the chapter.
        try {
          process.stdout.write(`${JSON.stringify({
            type: 'generation-usage',
            model: modelForLedger(),
            storyId: typeof body.story?.id === 'string' ? body.story.id : null,
            chapter: body.index + 1,
            genreTemplateId: result?.genreTemplateId ?? null,
            usage: result?.usage ?? 'unknown',
          })}\n`)
        } catch { /* ledger is best-effort */ }
        return sendJson(response, 200, result)
      }
      if (pathname.startsWith('/api/')) throw new ApiError(404, '接口不存在。')
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new ApiError(405, '此操作不支持。')
      await serveStatic(request, response, pathname, distDir)
    } catch (error) {
      sendJson(response, error instanceof ApiError ? error.status : 502, { error: error instanceof ApiError ? error.message : '服务暂时无法完成请求，请稍后重试。' })
    }
  })
  server.requestTimeout = 70_000
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
