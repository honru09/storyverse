import { createHash, randomBytes, randomInt, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ApiError } from './gemini.js'
import { createIdentityStore } from './identity-store.js'
import { createMailer } from './mailer.js'
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS, RESEND_COOLDOWN_MS, SESSION_TTL_MS, normalizeEmailAddress, validEmailAddress } from './email-code.js'

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
const channelClosed = () => new ApiError(503, '邮箱找回通道尚未开通。', 'recovery-channel-closed')
const invalidRecoveryCode = () => new ApiError(401, '验证码不正确或已过期，请重新获取。')

/**
 * The only shape in which a bound recovery address may ever leave the
 * server: first local-part character plus the domain (a***@gmail.com).
 * A one-character local part would be fully exposed by that rule, so it
 * collapses to a bare *** instead.
 */
export function maskRecoveryEmail(email) {
  if (typeof email !== 'string') return null
  const at = email.indexOf('@')
  if (at < 1 || at === email.length - 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return `${local.length >= 2 ? `${local[0]}***` : '***'}@${domain}`
}

const RECOVERY_START_WINDOW_MS = 15 * 60 * 1000
const RECOVERY_START_MAX = 5
const RECOVERY_RESET_WINDOW_MS = 15 * 60 * 1000
const RECOVERY_RESET_MAX_FAILURES = 10
const RECOVERY_STATUS_WINDOW_MS = 15 * 60 * 1000
const RECOVERY_STATUS_MAX = 20

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
 * Accounts may bind one recovery email (stored on the same record, only
 * ever exposed masked); password recovery reuses the email-code machine
 * (6-digit salted-hash codes, 10-minute life, attempt caps) and stays
 * closed until the deployment's mail switch is on — see RECOVERY.md.
 */
export function createUsernameAuthService({
  env = process.env,
  store,
  mailer,
  now = () => Date.now(),
  randomBytesImpl = randomBytes,
  randomIntImpl = randomInt,
  log = (message) => process.stderr.write(`${message}\n`),
} = {}) {
  const backend = store === undefined ? createIdentityStore({ env }) : store
  const sender = mailer === undefined ? createMailer({ env }) : mailer
  const enabled = env.AUTH_ENABLED === 'true' && env.USERNAME_ENABLED !== 'false' && backend !== null
  // The recovery channel rides the exact switch that makes the email-code
  // channel live (RECOVERY.md): mail can actually be sent only when SMTP
  // is configured, and the operator's EMAIL_CODE_ENABLED opt-out covers
  // code mail as a whole. Until then the recovery endpoints answer with
  // the explicit `recovery-channel-closed` business code, never a fake
  // "sent".
  const recoveryEnabled = enabled && env.EMAIL_CODE_ENABLED !== 'false' && sender.configured === true

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

  const checkedPassword = (rawPassword) => {
    if (typeof rawPassword !== 'string' || rawPassword.length < 8 || rawPassword.length > 128) {
      throw new ApiError(400, '密码至少需要 8 个字符。')
    }
    return rawPassword
  }

  /** Optional recovery address: absent stays null; present must be a real email shape. */
  const checkedRecoveryEmail = (rawRecoveryEmail) => {
    if (rawRecoveryEmail === undefined || rawRecoveryEmail === null || rawRecoveryEmail === '') return null
    const email = normalizeEmailAddress(rawRecoveryEmail)
    if (!validEmailAddress(email)) throw new ApiError(400, '恢复邮箱格式不正确，请检查。', 'recovery-email-invalid')
    return email
  }

  async function register(rawUsername, rawPassword, clientKey = 'unknown', rawRecoveryEmail = undefined) {
    if (!enabled) throw notConfigured()
    const username = normalizeUsername(rawUsername)
    if (!USERNAME_PATTERN.test(username)) throw new ApiError(400, '用户名只能用字母、数字、下划线和点，3–20 个字符。')
    const password = checkedPassword(rawPassword)
    const recoveryEmail = checkedRecoveryEmail(rawRecoveryEmail)
    const rateKey = `register:${clientKey}`
    if (windowCount(rateKey, REGISTER_WINDOW_MS) >= REGISTER_MAX_ATTEMPTS) {
      throw new ApiError(429, '注册过于频繁，请稍后再试。')
    }
    bump(rateKey, REGISTER_WINDOW_MS)
    try {
      if (await backend.getUser(username)) throw new ApiError(409, '这个用户名已被占用。')
      const salt = randomBytesImpl(16).toString('hex')
      const passwordHash = await hashPassword(password, salt)
      const uid = usernameUid(username)
      await backend.putUser(username, { username, uid, salt, passwordHash, recoveryEmail, createdAt: now() })
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

  const recoveryCodeKey = (username) => sha256(`recovery:${username}`)

  /**
   * Recovery state for the login page's reset panel and the signed-in
   * account view. Deliberately uniform: an unknown username answers
   * exactly like a known one without a bound address (the login channel's
   * anti-enumeration posture), so this is never an existence oracle. The
   * only disclosure is the masked form of a bound address — see
   * maskRecoveryEmail and RECOVERY.md for the trade-off record.
   */
  async function recoveryState(rawUsername) {
    if (!enabled) throw notConfigured()
    const username = normalizeUsername(rawUsername)
    const closed = { hasRecoveryEmail: false, maskedRecoveryEmail: null, channelOpen: recoveryEnabled }
    if (!USERNAME_PATTERN.test(username)) return closed
    let user
    try {
      user = await backend.getUser(username)
    } catch {
      throw storeUnavailable()
    }
    const email = typeof user?.recoveryEmail === 'string' && user.recoveryEmail ? user.recoveryEmail : null
    return { hasRecoveryEmail: email !== null, maskedRecoveryEmail: email ? maskRecoveryEmail(email) : null, channelOpen: recoveryEnabled }
  }

  /**
   * The public, unauthenticated lookup behind the reset panel. Same
   * answer as recoveryState, but throttled per client + username like
   * the login channel throttles guesses: the bound/masked disclosure is
   * deliberately minimal (RECOVERY.md) and must not be sweepable. The
   * signed-in account view uses recoveryState directly and is never
   * throttled.
   */
  async function recoveryStatus(rawUsername, clientKey = 'unknown') {
    const username = normalizeUsername(rawUsername)
    const rateKey = `recovery-status:${clientKey}|${username}`
    if (windowCount(rateKey, RECOVERY_STATUS_WINDOW_MS) >= RECOVERY_STATUS_MAX) {
      throw new ApiError(429, '尝试次数过多，请稍后再试。')
    }
    bump(rateKey, RECOVERY_STATUS_WINDOW_MS)
    return recoveryState(username)
  }

  /**
   * Ask for a recovery code. Once the channel is open the answer is the
   * email channel's uniform `{ ok: true }` for every input — bound,
   * unbound or unknown — so the action itself is not an oracle either.
   * A code is generated and mailed only when the account exists and has
   * a recovery address; inside the resend cooldown the previous code
   * stays valid and nothing new is sent. While the channel is closed
   * the endpoint refuses with the explicit business code instead of
   * pretending a mail went out.
   */
  async function requestRecoveryCode(rawUsername, clientKey = 'unknown') {
    if (!enabled) throw notConfigured()
    if (!recoveryEnabled) throw channelClosed()
    const username = normalizeUsername(rawUsername)
    const rateKey = `recovery-start:${clientKey}|${username}`
    if (windowCount(rateKey, RECOVERY_START_WINDOW_MS) >= RECOVERY_START_MAX) {
      throw new ApiError(429, '操作过于频繁，请稍后再试。')
    }
    bump(rateKey, RECOVERY_START_WINDOW_MS)
    if (!USERNAME_PATTERN.test(username)) return { ok: true }
    try {
      const user = await backend.getUser(username)
      const email = typeof user?.recoveryEmail === 'string' && user.recoveryEmail ? user.recoveryEmail : null
      if (!user || !email) return { ok: true }
      const key = recoveryCodeKey(username)
      const at = now()
      const existing = await backend.getCode(key)
      if (existing && existing.expiresAt > at && at - existing.lastSentAt < RESEND_COOLDOWN_MS) return { ok: true }
      const salt = randomBytesImpl(16).toString('hex')
      const code = String(randomIntImpl(0, 1_000_000)).padStart(6, '0')
      await backend.putCode(key, {
        purpose: 'username-recovery',
        codeHash: sha256(`${salt}:${code}`),
        salt,
        attempts: 0,
        createdAt: at,
        lastSentAt: at,
        expiresAt: at + CODE_TTL_MS,
      })
      try {
        await sender.sendRecoveryCode(email, code)
      } catch {
        // Same posture as the login-code channel: delivery state is an
        // operator concern (server log), never response surface.
        log('username-auth: recovery code send failed (see SMTP configuration)')
      }
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw storeUnavailable()
    }
  }

  /**
   * Set a new password from a recovery code. Every failure — unknown
   * user, no code, expired, wrong digits, exhausted attempts — shares
   * the email channel's one message. On success the code is consumed,
   * the password hash rotates to a fresh salt, all of the account's
   * other sessions are revoked (a reset must end a possible hijack, not
   * coexist with it), and the caller is signed in with the new password.
   */
  async function resetPasswordWithCode(rawUsername, rawCode, rawPassword, clientKey = 'unknown') {
    if (!enabled) throw notConfigured()
    if (!recoveryEnabled) throw channelClosed()
    const username = normalizeUsername(rawUsername)
    const password = checkedPassword(rawPassword)
    const code = typeof rawCode === 'string' ? rawCode.trim() : ''
    const rateKey = `recovery-reset:${clientKey}|${username}`
    if (windowCount(rateKey, RECOVERY_RESET_WINDOW_MS) >= RECOVERY_RESET_MAX_FAILURES) {
      throw new ApiError(429, '尝试次数过多，请稍后再试。')
    }
    if (!USERNAME_PATTERN.test(username) || !/^\d{6}$/.test(code)) throw invalidRecoveryCode()
    const key = recoveryCodeKey(username)
    const at = now()
    try {
      const user = await backend.getUser(username)
      const record = user ? await backend.getCode(key) : null
      if (!record || record.purpose !== 'username-recovery' || record.expiresAt <= at) {
        if (record && record.expiresAt <= at) await backend.deleteCode(key)
        bump(rateKey, RECOVERY_RESET_WINDOW_MS)
        throw invalidRecoveryCode()
      }
      if (record.attempts >= MAX_CODE_ATTEMPTS) {
        await backend.deleteCode(key)
        bump(rateKey, RECOVERY_RESET_WINDOW_MS)
        throw invalidRecoveryCode()
      }
      const candidate = Buffer.from(sha256(`${record.salt}:${code}`), 'hex')
      const expected = Buffer.from(String(record.codeHash || ''), 'hex')
      const matches = candidate.length === expected.length && timingSafeEqual(candidate, expected)
      if (!matches) {
        await backend.putCode(key, { ...record, attempts: record.attempts + 1 })
        bump(rateKey, RECOVERY_RESET_WINDOW_MS)
        throw invalidRecoveryCode()
      }
      await backend.deleteCode(key)
      const salt = randomBytesImpl(16).toString('hex')
      const passwordHash = await hashPassword(password, salt)
      await backend.putUser(username, { ...user, salt, passwordHash, passwordChangedAt: at })
      if (typeof backend.deleteSessionsForUid === 'function') await backend.deleteSessionsForUid(user.uid)
      attempts.delete(rateKey)
      return await issueSession(username, user.uid)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw storeUnavailable()
    }
  }

  /**
   * Bind, change or clear the recovery address of a signed-in account.
   * The caller is already authenticated as this username; the current
   * password is still required so a borrowed session cannot quietly
   * re-point the account's only way back in. Empty input unbinds.
   */
  async function setRecoveryEmail(rawUsername, rawPassword, rawRecoveryEmail) {
    if (!enabled) throw notConfigured()
    const username = normalizeUsername(rawUsername)
    const recoveryEmail = checkedRecoveryEmail(rawRecoveryEmail)
    let user
    try {
      user = USERNAME_PATTERN.test(username) ? await backend.getUser(username) : null
    } catch {
      throw storeUnavailable()
    }
    const password = typeof rawPassword === 'string' ? rawPassword : ''
    const candidate = await hashPassword(password || ' ', user?.salt || DUMMY_SALT)
    const expected = user?.passwordHash || DUMMY_HASH
    const matches = Boolean(user)
      && candidate.length === expected.length
      && timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'))
    if (!matches) throw new ApiError(401, '当前密码不正确。')
    try {
      await backend.putUser(username, { ...user, recoveryEmail })
    } catch {
      throw storeUnavailable()
    }
    return {
      hasRecoveryEmail: recoveryEmail !== null,
      maskedRecoveryEmail: recoveryEmail ? maskRecoveryEmail(recoveryEmail) : null,
      channelOpen: recoveryEnabled,
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

  return { enabled, recoveryEnabled, register, login, resolveSession, recoveryState, recoveryStatus, requestRecoveryCode, resetPasswordWithCode, setRecoveryEmail }
}
