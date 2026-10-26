import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { ApiError } from './gemini.js'
import { createMailer } from './mailer.js'
import { createIdentityStore } from './identity-store.js'

export const CODE_TTL_MS = 10 * 60 * 1000
export const RESEND_COOLDOWN_MS = 60 * 1000
export const MAX_CODE_ATTEMPTS = 5
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export const normalizeEmailAddress = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

export function validEmailAddress(value) {
  return value.length > 0 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Stable per-email identity: the same address always maps to the same uid. */
export function emailCodeUid(email) {
  return `em_${sha256(email).slice(0, 32)}`
}

const notConfigured = () => new ApiError(503, '邮箱验证码服务尚未配置，请使用其他方式登录。')
const storeUnavailable = () => new ApiError(503, '邮箱验证码服务暂时不可用，请稍后重试。')
const invalidCode = () => new ApiError(401, '验证码不正确或已过期，请重新获取。')

/**
 * Email-code sign-in (channel B): no Google service is involved at any
 * point, so it works wherever plain email works. Codes are stored only as
 * salted hashes with a 10-minute life, at most 5 attempts and a 60-second
 * resend cooldown; sessions are random 32-byte tokens of which the server
 * keeps only the hash, valid for 30 days and revocable.
 */
export function createEmailCodeService({
  env = process.env,
  store,
  mailer,
  now = () => Date.now(),
  randomIntImpl = randomInt,
  randomBytesImpl = randomBytes,
  log = (message) => process.stderr.write(`${message}\n`),
} = {}) {
  const backend = store === undefined ? createIdentityStore({ env }) : store
  const sender = mailer === undefined ? createMailer({ env }) : mailer
  const enabled = env.EMAIL_CODE_ENABLED !== 'false' && backend !== null && sender.configured === true

  async function start(rawEmail) {
    if (!enabled) throw notConfigured()
    const email = normalizeEmailAddress(rawEmail)
    if (!validEmailAddress(email)) throw new ApiError(400, '请输入有效的邮箱地址。')
    const key = sha256(email)
    const at = now()
    let existing
    try {
      existing = await backend.getCode(key)
      // Inside the cooldown the previous code stays valid and nothing new is
      // sent, but the response is identical either way (no enumeration).
      if (existing && existing.expiresAt > at && at - existing.lastSentAt < RESEND_COOLDOWN_MS) return { ok: true }
      const salt = randomBytesImpl(16).toString('hex')
      const code = String(randomIntImpl(0, 1_000_000)).padStart(6, '0')
      await backend.putCode(key, {
        codeHash: sha256(`${salt}:${code}`),
        salt,
        attempts: 0,
        createdAt: at,
        lastSentAt: at,
        expiresAt: at + CODE_TTL_MS,
      })
      try {
        await sender.sendCode(email, code)
      } catch {
        // The response stays generic so mail infrastructure state is not an
        // oracle; the failure is visible in server logs for the operator.
        log('email-code: send failed (see SMTP configuration)')
      }
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw storeUnavailable()
    }
  }

  async function verify(rawEmail, rawCode) {
    if (!enabled) throw notConfigured()
    const email = normalizeEmailAddress(rawEmail)
    const code = typeof rawCode === 'string' ? rawCode.trim() : ''
    if (!validEmailAddress(email) || !/^\d{6}$/.test(code)) throw invalidCode()
    const key = sha256(email)
    const at = now()
    let record
    try {
      record = await backend.getCode(key)
      if (!record || record.expiresAt <= at) {
        if (record) await backend.deleteCode(key)
        throw invalidCode()
      }
      if (record.attempts >= MAX_CODE_ATTEMPTS) {
        await backend.deleteCode(key)
        throw invalidCode()
      }
      const candidate = Buffer.from(sha256(`${record.salt}:${code}`), 'hex')
      const expected = Buffer.from(String(record.codeHash || ''), 'hex')
      const matches = candidate.length === expected.length && timingSafeEqual(candidate, expected)
      if (!matches) {
        await backend.putCode(key, { ...record, attempts: record.attempts + 1 })
        throw invalidCode()
      }
      await backend.deleteCode(key)
      const token = randomBytesImpl(32).toString('base64url')
      const uid = emailCodeUid(email)
      const expiresAt = at + SESSION_TTL_MS
      await backend.putSession(sha256(token), { uid, email, createdAt: at, expiresAt })
      return { token, uid, email, expiresAt }
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw storeUnavailable()
    }
  }

  /** Resolve a site session token to an identity, or null. Never throws. */
  async function resolveSession(token) {
    if (!enabled || typeof token !== 'string' || !token || token.length > 512) return null
    try {
      const key = sha256(token)
      const session = await backend.getSession(key)
      if (!session || typeof session.uid !== 'string' || typeof session.email !== 'string') return null
      if (session.expiresAt <= now()) {
        await backend.deleteSession(key)
        return null
      }
      return { uid: session.uid, email: session.email, displayName: null, emailVerified: true, provider: 'email-code' }
    } catch {
      log('email-code: session lookup failed')
      return null
    }
  }

  async function revokeSession(token) {
    if (!enabled || typeof token !== 'string' || !token) return { ok: true }
    try { await backend.deleteSession(sha256(token)) } catch { log('email-code: session revoke failed') }
    return { ok: true }
  }

  return { enabled, start, verify, resolveSession, revokeSession }
}
