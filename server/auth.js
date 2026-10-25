import { readFile } from 'node:fs/promises'
import { ApiError } from './gemini.js'

const textValue = (value) => typeof value === 'string' && value.length < 512 && !/[\r\n]/.test(value) ? value.trim() : ''

function publicConfig(env) {
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
  return {
    enabled,
    providers: { google: enabled && env.AUTH_GOOGLE_ENABLED !== 'false', email: enabled && env.AUTH_EMAIL_ENABLED !== 'false' },
    firebase: enabled ? firebase : null,
    storage: 'local',
    message: enabled ? '账号仅用于身份识别。故事和阅读进度仍保存在本机，不会自动云同步。' : '账号服务尚未配置。故事和阅读进度仍保存在本机。',
  }
}

async function loadVerifier(env) {
  // Never allow the Admin SDK's unsigned emulator-token shortcut on this API.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Auth emulator is not supported here')
  const [{ initializeApp, getApps, applicationDefault, cert }, { getAuth }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/auth'),
  ])
  const projectId = env.FIREBASE_PROJECT_ID
  const name = `storyweave-auth-${projectId}`
  let app = getApps().find((entry) => entry.name === name)
  if (!app) {
    const credential = env.FIREBASE_ADMIN_CREDENTIALS_FILE
      ? cert(JSON.parse(await readFile(env.FIREBASE_ADMIN_CREDENTIALS_FILE, 'utf8')))
      : applicationDefault()
    app = initializeApp({ projectId, credential }, name)
  }
  return (token, checkRevoked) => getAuth(app).verifyIdToken(token, checkRevoked)
}

const INVALID_TOKEN_CODES = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token', 'auth/id-token-expired',
  'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found', 'auth/tenant-id-mismatch',
])

export function createAuthService({ env = process.env, verifyIdToken } = {}) {
  const config = publicConfig(env)
  let verifierPromise
  return {
    config: () => config,
    async account(authorization) {
      const token = typeof authorization === 'string' && /^Bearer [^\s]+$/i.test(authorization) ? authorization.slice(7) : null
      if (!token || token.length > 16_384) throw new ApiError(401, '请先登录后再查看账号。')
      if (!config.enabled) throw new ApiError(503, '账号服务尚未配置，请先继续本机阅读。')
      try {
        const verify = verifyIdToken || await (verifierPromise ||= loadVerifier(env).catch((error) => { verifierPromise = undefined; throw error }))
        const claims = await verify(token, true)
        if (!claims || typeof claims.uid !== 'string' || !claims.uid) throw new ApiError(401, '登录凭证无效或已过期，请重新登录。')
        return {
          user: {
            uid: claims.uid,
            email: typeof claims.email === 'string' ? claims.email : null,
            displayName: typeof claims.name === 'string' ? claims.name : null,
            emailVerified: claims.email_verified === true,
          },
          storage: 'local', entitlements: null, subscription: null,
        }
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (INVALID_TOKEN_CODES.has(error?.code)) throw new ApiError(401, '登录凭证无效或已过期，请重新登录。')
        throw new ApiError(503, '账号验证服务暂时不可用，请稍后重试。本机故事不受影响。')
      }
    },
  }
}
