import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from './gemini.js'
import { productById } from './billing.js'

/**
 * BILLING — Stripe checkout preparation (code only, env-gated).
 *
 * Nothing here runs until the operator finishes the account-side
 * setup listed in BILLING.md: a Stripe account with Alipay and
 * WeChat Pay activated, STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET /
 * STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL in the environment. With
 * any piece missing the service reports `enabled: false`, the member
 * page hides every purchase control, and checkout answers 503 —
 * the site never shows a buy button that cannot work.
 *
 * The integration deliberately uses Stripe's REST API and the
 * documented webhook signature scheme (HMAC-SHA256 over
 * `${timestamp}.${rawBody}`) instead of the SDK: fulfilment is one
 * grant call into the same entitlement engine redemption codes use,
 * keyed idempotently by checkout session id.
 */

const textValue = (value) => typeof value === 'string' ? value.trim() : ''

export function stripeEnabled(env = {}) {
  return textValue(env.STRIPE_SECRET_KEY).startsWith('sk_')
    && textValue(env.STRIPE_WEBHOOK_SECRET).startsWith('whsec_')
    && /^https?:\/\//.test(textValue(env.STRIPE_SUCCESS_URL))
    && /^https?:\/\//.test(textValue(env.STRIPE_CANCEL_URL))
}

const SIGNATURE_TOLERANCE_MS = 5 * 60_000

export function createStripeService({ env = process.env, billing, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const enabled = stripeEnabled(env)
  const secretKey = textValue(env.STRIPE_SECRET_KEY)
  const webhookSecret = textValue(env.STRIPE_WEBHOOK_SECRET)

  /** Verify a Stripe-Signature header against the raw body; returns the parsed event. */
  function verifyEvent(rawBody, signatureHeader) {
    if (typeof rawBody !== 'string' || typeof signatureHeader !== 'string') {
      throw new ApiError(400, 'webhook 签名无效。')
    }
    let timestamp = ''
    const signatures = []
    for (const part of signatureHeader.split(',')) {
      const [key, value] = part.split('=', 2)
      if (key === 't') timestamp = value || ''
      if (key === 'v1' && value) signatures.push(value)
    }
    const stamp = Number(timestamp)
    if (!timestamp || !Number.isFinite(stamp) || signatures.length === 0) {
      throw new ApiError(400, 'webhook 签名无效。')
    }
    if (Math.abs(now().getTime() - stamp * 1000) > SIGNATURE_TOLERANCE_MS) {
      throw new ApiError(400, 'webhook 签名已过期。')
    }
    const expected = createHmac('sha256', webhookSecret).update(`${timestamp}.${rawBody}`).digest()
    const matched = signatures.some((signature) => {
      let candidate
      try { candidate = Buffer.from(signature, 'hex') } catch { return false }
      return candidate.length === expected.length && timingSafeEqual(candidate, expected)
    })
    if (!matched) throw new ApiError(400, 'webhook 签名无效。')
    try {
      return JSON.parse(rawBody)
    } catch {
      throw new ApiError(400, 'webhook 内容无效。')
    }
  }

  return {
    enabled,

    async createCheckoutSession(identity, productId) {
      if (!enabled) throw new ApiError(503, '购买通道即将开通，可先用兑换码。')
      const product = productById(typeof productId === 'string' ? productId : '')
      if (!product) throw new ApiError(400, '请选择要购买的商品。')
      if (!identity?.uid) throw new ApiError(401, '请先登录，再购买。', 'auth-required')
      const form = new URLSearchParams()
      form.set('mode', 'payment')
      form.set('success_url', textValue(env.STRIPE_SUCCESS_URL))
      form.set('cancel_url', textValue(env.STRIPE_CANCEL_URL))
      form.set('client_reference_id', identity.uid)
      form.set('metadata[uid]', identity.uid)
      form.set('metadata[productId]', product.id)
      form.set('line_items[0][quantity]', '1')
      form.set('line_items[0][price_data][currency]', 'cny')
      form.set('line_items[0][price_data][unit_amount]', String(product.priceCny * 100))
      form.set('line_items[0][price_data][product_data][name]', `织界 · ${product.name}`)
      // Alipay and WeChat Pay ride Checkout as payment method types;
      // WeChat Pay on the web flow asks for the `web` client hint.
      form.append('payment_method_types[0]', 'card')
      form.append('payment_method_types[1]', 'alipay')
      form.append('payment_method_types[2]', 'wechat_pay')
      form.set('payment_method_options[wechat_pay][client]', 'web')
      let payload
      try {
        const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        })
        payload = await response.json().catch(() => null)
        if (!response.ok || typeof payload?.url !== 'string') throw new Error('checkout-session-failed')
      } catch {
        throw new ApiError(502, '支付通道暂时不可用，请稍后再试。')
      }
      return { url: payload.url }
    },

    /**
     * Fulfil a webhook delivery. Only a PAID checkout.session.completed
     * grants, exactly once per session id; every other event type is
     * acknowledged and ignored so Stripe stops retrying it.
     */
    async handleWebhook(rawBody, signatureHeader) {
      if (!enabled) throw new ApiError(503, '购买通道尚未开通。')
      const event = verifyEvent(rawBody, signatureHeader)
      if (event?.type !== 'checkout.session.completed') return { received: true, granted: false }
      const session = event.data?.object
      if (!session || session.payment_status !== 'paid') return { received: true, granted: false }
      const uid = typeof session.metadata?.uid === 'string' ? session.metadata.uid : ''
      const productId = typeof session.metadata?.productId === 'string' ? session.metadata.productId : ''
      if (!uid || !productById(productId) || typeof session.id !== 'string' || !session.id) {
        return { received: true, granted: false }
      }
      if (await billing.stripeEventSeen(session.id)) return { received: true, granted: false, duplicate: true }
      await billing.grantProduct(uid, productId, 'stripe')
      await billing.recordStripeEvent(session.id, { uid, productId, eventId: event.id || null })
      return { received: true, granted: true }
    },
  }
}
