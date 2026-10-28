// Membership, quota balances and redemption codes — the client
// half. The server is the source of truth for every number shown on
// the member page; this module only moves payloads and maps failures
// to reader language, following the users/plaza client conventions.

function billingError(response, result) {
  if (response.status === 401 || result?.code === 'auth-required') {
    return Object.assign(new Error('请先登录，再继续。'), { code: 'auth-required' })
  }
  if (response.status === 429) return new Error(result?.error || '操作太频繁了，请稍后再试。')
  if (response.status === 503) return new Error(result?.error || '这个功能还没开通，过段时间再来看看。')
  if (result?.error && (response.status === 400 || response.status === 403)) return new Error(result.error)
  return new Error('暂时没能完成，请稍后再试。')
}

async function billingHeaders(getAccessToken) {
  const headers = {}
  if (getAccessToken) {
    try {
      const token = await getAccessToken()
      if (typeof token === 'string' && token) headers.Authorization = `Bearer ${token}`
    } catch { /* no credential; the server decides */ }
  }
  return headers
}

async function billingJson(response) {
  let result = null
  try { result = await response.json() } catch { /* mapped by caller */ }
  if (!response.ok) throw billingError(response, result)
  return result
}

/** The member page payload: my entitlement state + the catalog. */
export async function fetchBillingState({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = await billingHeaders(getAccessToken)
  const response = await fetchImpl('/api/billing/me', { headers })
  return billingJson(response)
}

/** Redeem one code. Success returns the grant + the fresh state. */
export async function redeemBillingCode({ code, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await billingHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/billing/redeem', {
    method: 'POST', headers, body: JSON.stringify({ code }),
  })
  return billingJson(response)
}

/** Start a Stripe checkout for one product; resolves to the hosted page URL. */
export async function startBillingCheckout({ productId, getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await billingHeaders(getAccessToken)) }
  const response = await fetchImpl('/api/billing/checkout', {
    method: 'POST', headers, body: JSON.stringify({ productId }),
  })
  const result = await billingJson(response)
  return result?.url || ''
}

// The pre-generation gate (BILLING): preparing the next chapter ahead
// of the reader is a background spend, so it is reserved for members
// and for lines touched within the last three days. The member half
// of the answer is cached for the session — the gate runs on every
// chapter turn and must not become a request per page; redeeming or
// buying invalidates the cache through `invalidateBillingGate`.
let gatePromise = null
export function billingGateMember({ getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  gatePromise ??= fetchBillingState({ getAccessToken, fetchImpl })
    .then((state) => Boolean(state?.member?.active))
    .catch(() => false)
  return gatePromise
}
export function invalidateBillingGate() {
  gatePromise = null
}
