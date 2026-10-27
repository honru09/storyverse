import { ApiError } from './gemini.js'
import { dataStoreKind } from './data-store.js'
import { loadFirebaseApp } from './firebase-app.js'
import { createEmailCodeService, validEmailAddress } from './email-code.js'
import { createUsernameAuthService } from './username-auth.js'
import { createUsageService, dailyTokenCap } from './usage.js'

const textValue = (value) => typeof value === 'string' && value.length < 512 && !/[\r\n]/.test(value) ? value.trim() : ''

function publicConfig(env, emailCode, usernameEnabled = false) {
  const firebase = {
    apiKey: textValue(env.FIREBASE_API_KEY), authDomain: textValue(env.FIREBASE_AUTH_DOMAIN),
    projectId: textValue(env.FIREBASE_PROJECT_ID), appId: textValue(env.FIREBASE_APP_ID),
  }
  const valid = Object.values(firebase).every(Boolean)
    && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(firebase.authDomain)
    && /^[a-z][a-z0-9-]{4,29}$/.test(firebase.projectId)
    && firebase.apiKey !== env.GEMINI_API_KEY
    && !env.FIREBASE_AUTH_EMULATOR_HOST
  const enabled = env.AUTH_ENABLED === 'true' && valid
    && (env.AUTH_GOOGLE_ENABLED !== 'false' || env.AUTH_EMAIL_ENABLED !== 'false')
  // The cloud library rides the same durable store as the login channels:
  // when one is configured, a signed-in reader's stories and reading
  // progress sync to the account; when none is, they honestly stay local.
  const storage = dataStoreKind(env) ? 'synced' : 'local'
  const storageNote = storage === 'synced'
    ? '登录后，故事和阅读进度会自动同步到你的账号。'
    : '故事和阅读进度仍保存在本机，不会自动云同步。'
  return {
    enabled,
    providers: { google: enabled && env.AUTH_GOOGLE_ENABLED !== 'false', email: enabled && env.AUTH_EMAIL_ENABLED !== 'false', username: usernameEnabled },
    emailCode,
    firebase: enabled ? firebase : null,
    storage,
    message: enabled
      ? `账号仅用于身份识别。${storageNote}`
      : emailCode
        ? `邮箱验证码登录可用。${storageNote}`
        : usernameEnabled
          ? `用户名登录可用。${storageNote}`
          : '账号服务尚未配置。故事和阅读进度仍保存在本机。',
  }
}

async function loadVerifier(env) {
  const app = await loadFirebaseApp(env)
  const { getAuth } = await import('firebase-admin/auth')
  return (token, checkRevoked) => getAuth(app).verifyIdToken(token, checkRevoked)
}

const INVALID_TOKEN_CODES = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token', 'auth/id-token-expired',
  'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found', 'auth/tenant-id-mismatch',
])

function bearerToken(authorization) {
  return typeof authorization === 'string' && /^Bearer [^\s]+$/i.test(authorization) ? authorization.slice(7) : null
}

// Internal marker so identity resolution can tell "this credential is wrong"
// (fall through to the other channel, then 401) from "the verifier itself is
// down" (503, and never masked as a bad login).
function identityFailure(kind, cause) {
  return Object.assign(new Error('identity-resolution-failed'), { kind, cause })
}

export function createAuthService({ env = process.env, verifyIdToken, usageService, emailCode, usernameAuth } = {}) {
  const email = emailCode ?? createEmailCodeService({ env })
  const username = usernameAuth ?? createUsernameAuthService({ env })
  const config = publicConfig(env, email.enabled === true, username.enabled === true)
  const usage = usageService ?? createUsageService({ env })
  const cap = dailyTokenCap(env)
  let verifierPromise

  async function firebaseIdentity(token) {
    let claims
    try {
      const verify = verifyIdToken || await (verifierPromise ||= loadVerifier(env).catch((error) => { verifierPromise = undefined; throw error }))
      claims = await verify(token, true)
    } catch (error) {
      throw identityFailure(INVALID_TOKEN_CODES.has(error?.code) ? 'invalid' : 'infra', error)
    }
    if (!claims || typeof claims.uid !== 'string' || !claims.uid) throw identityFailure('invalid')
    return {
      uid: claims.uid,
      email: typeof claims.email === 'string' ? claims.email : null,
      displayName: typeof claims.name === 'string' ? claims.name : null,
      emailVerified: claims.email_verified === true,
      provider: 'firebase',
    }
  }

  /**
   * Resolve a bearer credential from either channel to one identity shape.
   * Firebase is tried first when enabled; site session tokens fall through
   * because they are not Firebase JWTs. Throws ApiError 401/503 only.
   */
  async function identity(authorization) {
    const token = bearerToken(authorization)
    if (!token || token.length > 16_384) throw new ApiError(401, '请先登录后再查看账号。')
    if (!config.enabled && !email.enabled && !username.enabled) throw new ApiError(503, '账号服务尚未配置，请先继续本机阅读。')
    let failure
    if (config.enabled) {
      try {
        return await firebaseIdentity(token)
      } catch (error) {
        if (error instanceof ApiError) throw error
        failure = error
      }
    }
    if (email.enabled) {
      const session = await email.resolveSession(token)
      if (session) return session
    }
    if (username.enabled) {
      const session = await username.resolveSession(token)
      if (session) return session
    }
    if (failure?.kind === 'infra') throw new ApiError(503, '账号验证服务暂时不可用，请稍后重试。本机故事不受影响。')
    throw new ApiError(401, '登录凭证无效或已过期，请重新登录。')
  }

  async function account(authorization) {
    const resolved = await identity(authorization)
    return {
      user: {
        uid: resolved.uid,
        email: resolved.email,
        displayName: resolved.displayName,
        emailVerified: resolved.emailVerified,
      },
      provider: resolved.provider,
      usage: await usage.totals(resolved.uid),
      storage: dataStoreKind(env) ? 'synced' : 'local', entitlements: null, subscription: null,
    }
  }

  const bodyEmail = (body) => {
    if (!body || typeof body !== 'object' || typeof body.email !== 'string') throw new ApiError(400, '请求格式有误，请重试。')
    return body.email
  }

  const bodyCredentials = (body) => {
    if (!body || typeof body !== 'object' || typeof body.username !== 'string' || typeof body.password !== 'string') {
      throw new ApiError(400, '请求格式有误，请重试。')
    }
    return { username: body.username, password: body.password }
  }

  return {
    config: () => config,
    identity,
    account,
    emailStart: (body) => email.start(bodyEmail(body)),
    emailVerify: (body) => {
      const address = bodyEmail(body)
      if (typeof body.code !== 'string') throw new ApiError(400, '请求格式有误，请重试。')
      if (!validEmailAddress(address.trim().toLowerCase())) throw new ApiError(400, '请输入有效的邮箱地址。')
      return email.verify(address, body.code)
    },
    emailSignOut: (authorization) => email.revokeSession(bearerToken(authorization)),
    usernameRegister: (body, clientKey) => {
      const credentials = bodyCredentials(body)
      return username.register(credentials.username, credentials.password, clientKey)
    },
    usernameLogin: (body, clientKey) => {
      const credentials = bodyCredentials(body)
      return username.login(credentials.username, credentials.password, clientKey)
    },
    /** Generation requires a signed-in identity once the operator turns auth on and at least one channel works. */
    requiresIdentity: () => env.AUTH_ENABLED === 'true' && (config.enabled || email.enabled || username.enabled),
    dailyTokenCap: () => cap,
    usageDailyTotal: (uid) => usage.dailyTotal(uid),
    recordUsage: (uid, value) => usage.record(uid, value),
  }
}
