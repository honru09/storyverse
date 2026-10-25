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
  const [app, auth] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  return { ...app, ...auth }
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

/** Firebase owns credential persistence; this module never stores passwords or tokens. */
export function createAuthClient({ fetchImpl = globalThis.fetch, loadSdk = defaultLoadSdk } = {}) {
  let snapshot = { status: 'loading', user: null, error: null, notice: null, config: null, busy: false }
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

  function confirmUser(user) {
    if (!active) return Promise.reject(authError('auth/cancelled'))
    if (!user) {
      revision++
      verification = null
      publish({ status: 'guest', user: null, error: null })
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
      }
      publish({ status: 'authenticated', user: verified, error: null })
      return verified
    })().catch((error) => {
      const failure = error?.code ? safeError(error) : authError('auth/account-unavailable')
      if (current()) publish({ status: 'error', user: null, error: failure.message })
      throw failure
    }).finally(() => { if (verification === check) verification = null })
    verification = check
    return check.promise
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
        if (!validConfig(config)) {
          publish({ status: 'unavailable', user: null, error: ERROR_MESSAGES['auth/unavailable'] })
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
            void confirmUser(user).catch(() => {}).finally(resolve)
          })
        })
      } catch {
        if (active && epoch === startEpoch) publish({ status: 'unavailable', user: null, error: '账号服务暂时无法连接。你仍可继续本机阅读。' })
      }
      return snapshot
    })()
    return startup
  }

  async function run(operation, provider) {
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
      if (!auth || !validConfig(snapshot.config)) throw authError('auth/unavailable')
      if (provider && snapshot.config.providers?.[provider] !== true) throw authError('auth/operation-not-allowed')
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
      pendingOperation = null
      startup = undefined
      snapshot = { ...snapshot, status: 'loading', user: null, busy: false, error: null, notice: null }
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
    sendVerification: () => run(async (guard) => {
      const user = auth.currentUser
      if (!user) throw authError('auth/session-invalid')
      await sdk.sendEmailVerification(user)
      guard()
      publish({ notice: '验证邮件已发出，请在邮箱中确认后返回刷新状态。' })
    }),
    refreshUser: () => run(async (guard) => {
      const user = auth.currentUser
      if (!user) return confirmUser(null)
      await sdk.reload(user)
      guard()
      await sdk.getIdToken(user, true)
      guard()
      return confirmUser(user)
    }),
    signOut: () => run(async (guard) => {
      await sdk.signOut(auth)
      guard()
      await confirmUser(null)
    }),
    async getIdToken() {
      if (snapshot.status !== 'authenticated' || !auth?.currentUser || auth.currentUser.uid !== snapshot.user.uid) throw authError('auth/session-invalid')
      try { return await sdk.getIdToken(auth.currentUser) } catch (error) { throw safeError(error) }
    },
  }
  return client
}
