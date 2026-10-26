import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ApiError } from './gemini.js'
import { createIdentityStore } from './identity-store.js'
import { SESSION_TTL_MS } from './email-code.js'

const scryptAsync = promisify(scrypt)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LENGTH = 64

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/

/** Usernames are case-insensitive: one normalised (lowercase) form is the account key, the uid and the display name. */
export const normalizeUsername = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

export const usernameUid = (username) => `username:${username}`

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 10
const REGISTER_WINDOW_MS = 60 * 60 * 1000
const REGISTER_MAX_ATTEMPTS = 10

const notConfigured = () => new ApiError(503, '用户名登录尚未配置，请使用其他方式登录。')
const storeUnavailable = () => new ApiError(503, '用户名登录服务暂时不可用，请稍后重试。')
const invalidCredential = () => new ApiError(401, '用户名或密码不正确。')

// A throwaway credential pair, hashed once per process: logins for unknown
// usernames still pay the full scrypt cost against it, so response time
// does not reveal whether an account exists.
const DUMMY_SALT = randomBytes(16).toString('hex')
const DUMMY_HASH = scryptSync('storyweave-dummy-password', Buffer.from(DUMMY_SALT, 'hex'), KEY_LENGTH, SCRYPT_PARAMS).toString('hex')

/**
 * Username + password sign-in (channel C): no email, no codes, no external
 * identity provider — the whole exchange stays on this server, on the same
 * session machinery as the email-code channel (random 32-byte tokens, only
 * the hash stored, 30-day life, revocable). Passwords are stored as scrypt
 * hashes with a per-user random salt and never leave the server. Failed
 * logins share one message whether the username exists or not, and both
 * endpoints are throttled per client (logins also per username).
 */
export function createUsernameAuthService({
  env = process.env,
  store,
  now = () => Date.now(),
  randomBytesImpl = randomBytes,
  log = (message) => process.stderr.write(`${message}\n`),
} = {}) {
  const backend = store === undefined ? createIdentityStore({ env }) : store
  const enabled = env.AUTH_ENABLED === 'true' && env.USERNAME_ENABLED !== 'false' && backend !== null

  // In-process throttle ledger: key -> { count, firstAt }. Single-instance
  // deployments (Cloud Run max scale 1) make this the effective limit; the
  // window simply restarts with the process.
  const attempts = new Map()
  const windowCount = (key, windowMs) => {
    const entry = attempts.get(key)
    return !entry || now() - entry.firstAt >= windowMs ? 0 : entry.count
  }
  const bump = (key, windowMs) => {
    const at = now()
    const entry = attempts.get(key)
    if (!entry || at - entry.firstAt >= windowMs) attempts.set(key, { count: 1, firstAt: at })
    else entry.count += 1
    if (attempts.size > 4096) {
      for (const [key2, value] of attempts) {
        if (at - value.firstAt >= REGISTER_WINDOW_MS) attempts.delete(key2)
      }
    }
  }

  async function hashPassword(password, saltHex) {
    const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, SCRYPT_PARAMS)
    return derived.toString('hex')
  }

  async function issueSession(username, uid) {
    const token = randomBytesImpl(32).toString('base64url')
    const at = now()
    const expiresAt = at + SESSION_TTL_MS
    await backend.putSession(sha256(token), { uid, email: null, username, provider: 'username', createdAt: at, expiresAt })
    return { token, uid, username, expiresAt }
  }

  async function register(rawUsername, rawPassword, clientKey = 'unknown') {
    if (!enabled) throw notConfigured()
    const username = normalizeUsername(rawUsername)
    if (!USERNAME_PATTERN.test(username)) throw new ApiError(400, '用户名只能用字母、数字、下划线和点，3–20 个字符。')
    if (typeof rawPassword !== 'string' || rawPassword.length < 8 || rawPassword.length > 128) {
      throw new ApiError(400, '密码至少需要 8 个字符。')
    }
    const rateKey = `register:${clientKey}`
    if (windowCount(rateKey, REGISTER_WINDOW_MS) >= REGISTER_MAX_ATTEMPTS) {
      throw new ApiError(429, '注册过于频繁，请稍后再试。')
    }
    bump(rateKey, REGISTER_WINDOW_MS)
    try {
      if (await backend.getUser(username)) throw new ApiError(409, '这个用户名已被占用。')
      const salt = randomBytesImpl(16).toString('hex')
      const passwordHash = await hashPassword(rawPassword, salt)
      const uid = usernameUid(username)
      await backend.putUser(username, { username, uid, salt, passwordHash, createdAt: now() })
      return await issueSession(username, uid)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw storeUnavailable()
    }
  }

  async function login(rawUsername, rawPassword, clientKey = 'unknown') {
    if (!enabled) throw notConfigured()
    const username = normalizeUsername(rawUsername)
    const password = typeof rawPassword === 'string' ? rawPassword : ''
    const rateKey = `login:${clientKey}|${username}`
    if (windowCount(rateKey, LOGIN_WINDOW_MS) >= LOGIN_MAX_FAILURES) {
      throw new ApiError(429, '尝试次数过多，请稍后再试。')
    }
    try {
      const user = USERNAME_PATTERN.test(username) ? await backend.getUser(username) : null
      const candidate = await hashPassword(password || ' ', user?.salt || DUMMY_SALT)
      const expected = user?.passwordHash || DUMMY_HASH
      const matches = Boolean(user)
        && candidate.length === expected.length
        && timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'))
      if (!matches) {
        bump(rateKey, LOGIN_WINDOW_MS)
        throw invalidCredential()
      }
      attempts.delete(rateKey)
      return await issueSession(username, user.uid)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw storeUnavailable()
    }
  }

  /** Resolve a site session token to a username identity, or null. Never throws. */
  async function resolveSession(token) {
    if (!enabled || typeof token !== 'string' || !token || token.length > 512) return null
    try {
      const key = sha256(token)
      const session = await backend.getSession(key)
      if (!session || session.provider !== 'username' || typeof session.uid !== 'string' || typeof session.username !== 'string') return null
      if (session.expiresAt <= now()) {
        await backend.deleteSession(key)
        return null
      }
      return { uid: session.uid, email: null, displayName: session.username, emailVerified: false, provider: 'username' }
    } catch {
      log('username-auth: session lookup failed')
      return null
    }
  }

  return { enabled, register, login, resolveSession }
}
