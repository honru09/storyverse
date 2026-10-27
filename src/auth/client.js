const ERROR_MESSAGES = {
  'auth/unavailable': '账号服务尚未配置。你仍可继续本机阅读。',
  'auth/network-request-failed': '网络暂时无法连接，请检查网络后重试。',
  'auth/invalid-email': '请输入有效的邮箱地址。',
  'auth/invalid-credential': '邮箱或密码不正确，请重试或重置密码。',
  'auth/wrong-password': '邮箱或密码不正确，请重试或重置密码。',
  'auth/user-not-found': '邮箱或密码不正确，请重试或重置密码。',
  'auth/email-already-in-use': '此邮箱暂时无法注册，请尝试登录或重置密码。',
  'auth/weak-password': '密码强度不足，请按要求设置更长的密码。',
  'auth/password-does-not-meet-requirements': '密码未满足账号服务的安全要求，请更换密码。',
  'auth/too-many-requests': '操作过于频繁，请稍后再试。',
  'auth/operation-not-allowed': '此登录方式尚未启用，请使用其他方式或继续本机阅读。',
  'auth/unauthorized-domain': '当前访问地址尚未获准登录，请联系站点维护者。',
  'auth/popup-blocked': '登录窗口被浏览器拦截，请允许弹出窗口后重试，或使用邮箱登录。',
  'auth/cancelled': '已取消登录，你仍可继续本机阅读。',
  'auth/busy': '上一个账号操作尚未完成，请稍等。',
  'auth/account-unavailable': '账号验证服务暂时无法连接，请重试。本机故事不受影响。',
  'auth/session-invalid': '登录凭证无效或已过期，请重新登录。',
  'auth/invalid-code': '验证码不正确或已过期，请重新获取。',
  'auth/username-taken': '这个用户名已被占用，换个名字试试。',
  'auth/username-invalid': '用户名或密码不正确。',
  'auth/username-format': '用户名只能用字母、数字、下划线和点（3–20 个字符），密码至少 8 个字符。',
  'auth/requires-recent-login': '为了保护账号，请重新登录后再试。',
  'auth/user-disabled': '此账号暂时无法登录，请联系站点维护者。',
  'auth/account-exists-with-different-credential': '此邮箱已使用其他方式注册，请用原来的方式登录。',
}

function authError(code) {
  return Object.assign(new Error(ERROR_MESSAGES[code] || '账号操作暂时未完成，请稍后重试。'), { code })
}

function safeError(error) {
  const code = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code) ? 'auth/cancelled' : error?.code
  return authError(Object.hasOwn(ERROR_MESSAGES, code) ? code : 'auth/unknown')
}

async function defaultLoadSdk() {
  // One combined module on purpose — see firebase-sdk.js for why splitting
  // this into import('firebase/app') + import('firebase/auth') breaks auth.
  return import('./firebase-sdk.js')
}

function validConfig(config) {
  return config?.enabled === true && config.firebase && ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => typeof config.firebase[key] === 'string' && config.firebase[key])
}

function emailInput(email) {
  const value = typeof email === 'string' ? email.trim() : ''
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw authError('auth/invalid-email')
  return value
}

function passwordInput(password, registration = false) {
  if (typeof password !== 'string' || password.length === 0) throw authError('auth/invalid-credential')
  if (registration && password.length < 8) throw authError('auth/weak-password')
  return password
}

function usernameInput(username) {
  const value = typeof username === 'string' ? username.trim().toLowerCase() : ''
  if (!/^[a-z0-9_.]{3,20}$/.test(value)) throw authError('auth/username-format')
  return value
}

function normalizeUsage(value) {
  const usage = { prompt: 0, candidates: 0, thoughts: 0, cached: 0, total: 0, generations: 0, updatedAt: null }
  if (!value || typeof value !== 'object') return usage
  for (const key of ['prompt', 'candidates', 'thoughts', 'cached', 'total', 'generations']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0) usage[key] = Math.floor(value[key])
  }
  if (typeof value.updatedAt === 'string') usage.updatedAt = value.updatedAt
  return usage
}

const SITE_SESSION_KEY = 'storyweave.site-session'
const SITE_SESSION_FALLBACK_TTL = 30 * 24 * 60 * 60 * 1000

function defaultSessionStore() {
  try {
    const storage = globalThis.localStorage
    if (!storage) return null
    return {
      read: () => storage.getItem(SITE_SESSION_KEY),
      write: (value) => storage.setItem(SITE_SESSION_KEY, value),
      clear: () => storage.removeItem(SITE_SESSION_KEY),
    }
  } catch {
    return null
  }
}

/**
 * Three sign-in channels share one snapshot:
 * - Firebase (Google / email password): the SDK owns credential persistence;
 *   this module never stores passwords or Firebase tokens.
 * - Email code and username + password (this site's own API): the server
 *   issues an opaque session token and keeps only its hash. The token is
 *   kept in web storage, the same persistence level the Firebase SDK uses
 *   on this device, for up to 30 days; the server can revoke it at any
 *   time. The stored session records which site channel issued it.
 * Either way, a session only becomes `authenticated` after this server
 * confirms the identity through GET /api/account.
 */
export function createAuthClient({ fetchImpl = globalThis.fetch, loadSdk = defaultLoadSdk, sessionStore } = {}) {
  const store = sessionStore === undefined ? defaultSessionStore() : sessionStore
  let snapshot = { status: 'loading', user: null, error: null, notice: null, config: null, busy: false, usage: null }
  const listeners = new Set()
  const requests = new Set()
  let sdk
  let auth
  let active = false
  let epoch = 0
  let revision = 0
  let startup
  let unsubscribe
  let settleStartup
  let verification
  let siteVerification
  let pendingOperation = null
  let operationSequence = 0

  function publish(update) {
    if (!active) return
    snapshot = { ...snapshot, ...update }
    for (const listener of listeners) listener()
  }

  async function request(url, options = {}) {
    const controller = new AbortController()
    requests.add(controller)
    const timeout = setTimeout(() => controller.abort(), 12_000)
    try {
      return await fetchImpl(url, { ...options, cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
    } finally {
      clearTimeout(timeout)
      requests.delete(controller)
    }
  }

  function readSiteSession() {
    try {
      const raw = store?.read()
      if (!raw) return null
      const session = JSON.parse(raw)
      if (!session || typeof session.token !== 'string' || !session.token || typeof session.uid !== 'string' || !session.uid || typeof session.expiresAt !== 'number') return null
      if (session.expiresAt <= Date.now()) {
        clearSiteSession()
        return null
      }
      return session
    } catch {
      return null
    }
  }

  function writeSiteSession(session) {
    try { store?.write(JSON.stringify(session)) } catch { /* storage blocked: the session simply will not persist */ }
  }

  function clearSiteSession() {
    try { store?.clear() } catch { /* ignore */ }
  }

  async function revokeSiteSession(session) {
    try {
      await request('/api/auth/email/signout', { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } })
    } catch { /* revocation is best effort; the local copy is cleared regardless */ }
  }

  // Post-sign-in notices describe storage truthfully: when the deployment
  // offers the cloud library, the shelf syncs to the account; when it does
  // not, stories honestly stay in this browser.
  function storageNotice() {
    return snapshot.config?.storage === 'synced'
      ? '书架会自动同步到你的账号。'
      : '故事和阅读进度仍保存在本机。'
  }

  function confirmUser(user) {
    if (!active) return Promise.reject(authError('auth/cancelled'))
    if (!user) {
      revision++
      verification = null
      publish({ status: 'guest', user: null, error: null, usage: null })
      return Promise.resolve(null)
    }
    if (auth.currentUser !== user) return Promise.reject(authError('auth/cancelled'))
    if (verification?.user === user) return verification.promise
    const check = { user, epoch, revision: ++revision }
    const current = () => active && epoch === check.epoch && revision === check.revision && auth.currentUser === user
    publish({ status: 'loading', user: null, error: null })
    check.promise = (async () => {
      const token = await sdk.getIdToken(user)
      if (!current()) throw authError('auth/cancelled')
      const response = await request('/api/account', { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw authError(response.status === 401 ? 'auth/session-invalid' : 'auth/account-unavailable')
      const result = await response.json()
      if (result?.user?.uid !== user.uid || typeof result.user.emailVerified !== 'boolean') throw authError('auth/account-unavailable')
      if (!current()) throw authError('auth/cancelled')
      const verified = {
        uid: result.user.uid,
        email: typeof result.user.email === 'string' ? result.user.email : null,
        displayName: typeof result.user.displayName === 'string' ? result.user.displayName : null,
        emailVerified: result.user.emailVerified,
        provider: typeof result.provider === 'string' ? result.provider : 'firebase',
      }
      publish({ status: 'authenticated', user: verified, usage: normalizeUsage(result.usage), error: null })
      return verified
    })().catch((error) => {
      const failure = error?.code ? safeError(error) : authError('auth/account-unavailable')
      if (current()) publish({ status: 'error', user: null, error: failure.message })
      throw failure
    }).finally(() => { if (verification === check) verification = null })
    verification = check
    return check.promise
  }

  function confirmSiteSession(session) {
    if (!active) return Promise.reject(authError('auth/cancelled'))
    if (!session) {
      revision++
      siteVerification = null
      publish({ status: 'guest', user: null, error: null, usage: null })
      return Promise.resolve(null)
    }
    if (siteVerification?.session === session) return siteVerification.promise
    const check = { session, epoch, revision: ++revision }
    const current = () => active && epoch === check.epoch && revision === check.revision
    publish({ status: 'loading', user: null, error: null })
    check.promise = (async () => {
      const response = await request('/api/account', { headers: { Authorization: `Bearer ${session.token}` } })
      if (response.status === 401) {
        // The server no longer knows this session (expired or revoked).
        clearSiteSession()
        if (current()) publish({ status: 'guest', user: null, error: null, usage: null })
        return null
      }
      if (!response.ok) throw authError('auth/account-unavailable')
      const result = await response.json()
      if (result?.user?.uid !== session.uid || typeof result.user.emailVerified !== 'boolean') throw authError('auth/account-unavailable')
      if (!current()) throw authError('auth/cancelled')
      const verified = {
        uid: result.user.uid,
        email: typeof result.user.email === 'string' ? result.user.email : session.email,
        displayName: typeof result.user.displayName === 'string' ? result.user.displayName : null,
        emailVerified: result.user.emailVerified,
        provider: session.provider === 'username' ? 'username' : 'email-code',
      }
      publish({ status: 'authenticated', user: verified, usage: normalizeUsage(result.usage), error: null })
      return verified
    })().catch((error) => {
      const failure = error?.code ? safeError(error) : authError('auth/account-unavailable')
      if (current()) publish({ status: 'error', user: null, usage: null, error: failure.message })
      throw failure
    }).finally(() => { if (siteVerification === check) siteVerification = null })
    siteVerification = check
    return check.promise
  }

  /** Returns true when a stored site session existed and was checked. */
  async function restoreSiteSession() {
    const session = readSiteSession()
    if (!session) return false
    await confirmSiteSession(session).catch(() => {})
    return true
  }

  function start() {
    if (startup) return startup
    active = true
    const startEpoch = ++epoch
    auth = undefined
    publish({ status: 'loading', user: null, error: null, notice: null, config: null })
    startup = (async () => {
      try {
        const response = await request('/api/auth/config')
        if (!response.ok) throw authError('auth/unavailable')
        const config = await response.json()
        if (!active || epoch !== startEpoch) return snapshot
        publish({ config })
        const firebaseReady = validConfig(config)
        const codeReady = config?.emailCode === true
        const usernameReady = config?.providers?.username === true
        const siteReady = codeReady || usernameReady
        if (!firebaseReady && !siteReady) {
          publish({ status: 'unavailable', user: null, error: ERROR_MESSAGES['auth/unavailable'] })
          return snapshot
        }
        if (!firebaseReady) {
          // Site-channel-only deployment: the Firebase SDK is never loaded.
          if (!await restoreSiteSession() && active && epoch === startEpoch) {
            publish({ status: 'guest', user: null, error: null })
          }
          return snapshot
        }
        const loadedSdk = await loadSdk()
        if (!active || epoch !== startEpoch) return snapshot
        sdk = loadedSdk
        const name = `storyweave-auth-${config.firebase.projectId}`
        const app = sdk.getApps().find((entry) => entry.name === name) || sdk.initializeApp(config.firebase, name)
        auth = sdk.getAuth(app)
        auth.languageCode = 'zh-CN'
        await new Promise((resolve) => {
          settleStartup = resolve
          unsubscribe = sdk.onIdTokenChanged(auth, (user) => {
            if (!active || epoch !== startEpoch) return
            const settle = async () => {
              if (user) return confirmUser(user)
              // No Firebase user: a stored site session is a separate sign-in.
              if (siteReady && await restoreSiteSession()) return undefined
              return confirmUser(null)
            }
            void settle().catch(() => {}).finally(resolve)
          })
        })
      } catch {
        if (active && epoch === startEpoch) publish({ status: 'unavailable', user: null, error: '账号服务暂时无法连接。你仍可继续本机阅读。' })
      }
      return snapshot
    })()
    return startup
  }

  async function runInternal(operation, prepare) {
    if (pendingOperation !== null) throw authError('auth/busy')
    const operationId = ++operationSequence
    pendingOperation = operationId
    const ready = start()
    publish({ busy: true, error: null, notice: null })
    const operationEpoch = epoch
    const guard = () => { if (!active || epoch !== operationEpoch) throw authError('auth/cancelled') }
    try {
      await ready
      guard()
      prepare()
      const result = await operation(guard)
      guard()
      return result
    } catch (error) {
      const failure = safeError(error)
      if (active && epoch === operationEpoch) publish({ error: failure.code === 'auth/cancelled' ? null : failure.message, ...(failure.code === 'auth/cancelled' ? { notice: failure.message } : {}) })
      throw failure
    } finally {
      if (pendingOperation === operationId) pendingOperation = null
      if (active && epoch === operationEpoch) publish({ busy: false })
    }
  }

  function run(operation, provider) {
    return runInternal(operation, () => {
      if (!auth || !validConfig(snapshot.config)) throw authError('auth/unavailable')
      if (provider && snapshot.config.providers?.[provider] !== true) throw authError('auth/operation-not-allowed')
    })
  }

  function runSite(operation) {
    return runInternal(operation, () => {
      if (snapshot.config?.emailCode !== true) throw authError('auth/operation-not-allowed')
    })
  }

  function runUsername(operation) {
    return runInternal(operation, () => {
      if (snapshot.config?.providers?.username !== true) throw authError('auth/operation-not-allowed')
    })
  }

  const client = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    start,
    stop() {
      active = false
      epoch++
      revision++
      unsubscribe?.()
      unsubscribe = undefined
      settleStartup?.()
      settleStartup = undefined
      for (const controller of requests) controller.abort()
      requests.clear()
      verification = null
      siteVerification = null
      pendingOperation = null
      startup = undefined
      snapshot = { ...snapshot, status: 'loading', user: null, busy: false, error: null, notice: null, usage: null }
    },
    signInWithGoogle: () => run(async (guard) => {
      const result = await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider())
      guard()
      return confirmUser(result.user)
    }, 'google'),
    register: (email, password) => run(async (guard) => {
      const result = await sdk.createUserWithEmailAndPassword(auth, emailInput(email), passwordInput(password, true))
      guard()
      let verificationError
      try { await sdk.sendEmailVerification(result.user) } catch (error) { verificationError = safeError(error) }
      guard()
      let user
      try { user = await confirmUser(result.user) } catch (error) {
        guard()
        publish({ notice: '账号已创建，但本站暂时无法确认登录状态。请稍后刷新状态或使用邮箱登录，无需重复注册。' })
        throw error
      }
      guard()
      publish({ notice: verificationError ? '账号已创建，但验证邮件尚未发出。请在账号页重新发送验证邮件。' : '验证邮件已发出，请在邮箱中确认后返回刷新状态。' })
      return user
    }, 'email'),
    signIn: (email, password) => run(async (guard) => {
      const result = await sdk.signInWithEmailAndPassword(auth, emailInput(email), passwordInput(password))
      guard()
      return confirmUser(result.user)
    }, 'email'),
    resetPassword: (email) => run(async (guard) => {
      try { await sdk.sendPasswordResetEmail(auth, emailInput(email)) } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error
      }
      guard()
      publish({ notice: '如果该邮箱可以重置密码，你会收到重置邮件。请同时检查垃圾邮件。' })
    }, 'email'),
    requestEmailCode: (email) => runSite(async (guard) => {
      const response = await request('/api/auth/email/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput(email) }),
      })
      guard()
      if (!response.ok) throw authError(response.status === 429 ? 'auth/too-many-requests' : response.status === 503 ? 'auth/unavailable' : 'auth/account-unavailable')
      publish({ notice: '验证码已发送到你的邮箱，10 分钟内有效。如果没有收到，请检查垃圾邮件，或在一分钟后重新发送。' })
    }),
    signInWithEmailCode: (email, code) => runSite(async (guard) => {
      const address = emailInput(email)
      const value = typeof code === 'string' ? code.trim() : ''
      if (!/^\d{6}$/.test(value)) throw authError('auth/invalid-code')
      const response = await request('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, code: value }),
      })
      guard()
      if (!response.ok) throw authError(response.status === 401 ? 'auth/invalid-code' : response.status === 429 ? 'auth/too-many-requests' : 'auth/account-unavailable')
      const result = await response.json().catch(() => null)
      if (!result || typeof result.token !== 'string' || !result.token || typeof result.uid !== 'string' || !result.uid) throw authError('auth/account-unavailable')
      const session = {
        token: result.token,
        uid: result.uid,
        email: typeof result.email === 'string' ? result.email : address,
        expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : Date.now() + SITE_SESSION_FALLBACK_TTL,
      }
      writeSiteSession(session)
      guard()
      const user = await confirmSiteSession(session)
      guard()
      if (!user) throw authError('auth/session-invalid')
      publish({ notice: `已通过邮箱验证码登录。${storageNotice()}` })
      return user
    }),
    registerWithUsername: (username, password) => runUsername(async (guard) => {
      const name = usernameInput(username)
      const response = await request('/api/auth/username/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password: passwordInput(password, true) }),
      })
      guard()
      if (!response.ok) throw authError(response.status === 409 ? 'auth/username-taken' : response.status === 400 ? 'auth/username-format' : response.status === 429 ? 'auth/too-many-requests' : response.status === 503 ? 'auth/unavailable' : 'auth/account-unavailable')
      const result = await response.json().catch(() => null)
      if (!result || typeof result.token !== 'string' || !result.token || typeof result.uid !== 'string' || !result.uid) throw authError('auth/account-unavailable')
      const session = {
        token: result.token,
        uid: result.uid,
        email: null,
        displayName: typeof result.username === 'string' ? result.username : name,
        provider: 'username',
        expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : Date.now() + SITE_SESSION_FALLBACK_TTL,
      }
      writeSiteSession(session)
      guard()
      const user = await confirmSiteSession(session)
      guard()
      if (!user) throw authError('auth/session-invalid')
      publish({ notice: `账号已创建，你已登录。${storageNotice()}` })
      return user
    }),
    signInWithUsername: (username, password) => runUsername(async (guard) => {
      const name = usernameInput(username)
      const response = await request('/api/auth/username/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password: passwordInput(password) }),
      })
      guard()
      if (!response.ok) throw authError(response.status === 401 ? 'auth/username-invalid' : response.status === 400 ? 'auth/username-format' : response.status === 429 ? 'auth/too-many-requests' : response.status === 503 ? 'auth/unavailable' : 'auth/account-unavailable')
      const result = await response.json().catch(() => null)
      if (!result || typeof result.token !== 'string' || !result.token || typeof result.uid !== 'string' || !result.uid) throw authError('auth/account-unavailable')
      const session = {
        token: result.token,
        uid: result.uid,
        email: null,
        displayName: typeof result.username === 'string' ? result.username : name,
        provider: 'username',
        expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : Date.now() + SITE_SESSION_FALLBACK_TTL,
      }
      writeSiteSession(session)
      guard()
      const user = await confirmSiteSession(session)
      guard()
      if (!user) throw authError('auth/session-invalid')
      publish({ notice: `已用用户名登录。${storageNotice()}` })
      return user
    }),
    sendVerification: () => run(async (guard) => {
      const user = auth.currentUser
      if (!user) throw authError('auth/session-invalid')
      await sdk.sendEmailVerification(user)
      guard()
      publish({ notice: '验证邮件已发出，请在邮箱中确认后返回刷新状态。' })
    }),
    refreshUser: () => {
      if (snapshot.user?.provider === 'email-code' || snapshot.user?.provider === 'username') {
        return runInternal(async (guard) => {
          const session = readSiteSession()
          if (!session) {
            publish({ status: 'guest', user: null, error: null, usage: null })
            return null
          }
          const user = await confirmSiteSession(session)
          guard()
          return user
        }, () => {
          if (snapshot.config?.emailCode !== true && snapshot.config?.providers?.username !== true) throw authError('auth/operation-not-allowed')
        })
      }
      return run(async (guard) => {
        const user = auth.currentUser
        if (!user) return confirmUser(null)
        await sdk.reload(user)
        guard()
        await sdk.getIdToken(user, true)
        guard()
        return confirmUser(user)
      })
    },
    signOut: () => {
      if (snapshot.user?.provider === 'email-code' || snapshot.user?.provider === 'username' || (!auth && readSiteSession())) {
        // Site sessions end locally and on the server; no Firebase involved.
        return runInternal(async (guard) => {
          const session = readSiteSession()
          if (session) await revokeSiteSession(session)
          guard()
          clearSiteSession()
          siteVerification = null
          revision++
          publish({ status: 'guest', user: null, error: null, usage: null })
          return null
        }, () => {})
      }
      return run(async (guard) => {
        await sdk.signOut(auth)
        guard()
        const session = readSiteSession()
        if (session) {
          await revokeSiteSession(session)
          clearSiteSession()
          guard()
        }
        await confirmUser(null)
      })
    },
    async getIdToken() {
      if (snapshot.status !== 'authenticated' || !auth?.currentUser || auth.currentUser.uid !== snapshot.user.uid) throw authError('auth/session-invalid')
      try { return await sdk.getIdToken(auth.currentUser) } catch (error) { throw safeError(error) }
    },
    /**
     * The bearer credential for this site's own API, from whichever channel
     * the user signed in with. Returns null for guests and unusable sessions
     * instead of throwing, so callers can simply omit the header and let the
     * server decide (401 when auth is on, ignored when it is off).
     */
    async getAccessToken() {
      if (snapshot.status !== 'authenticated' || !snapshot.user) return null
      if (snapshot.user.provider === 'email-code' || snapshot.user.provider === 'username') {
        const session = readSiteSession()
        return session && session.uid === snapshot.user.uid ? session.token : null
      }
      try { return await client.getIdToken() } catch { return null }
    },
  }
  return client
}
