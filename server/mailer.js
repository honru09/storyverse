const textValue = (value) => typeof value === 'string' && value.length < 512 && !/[\r\n]/.test(value) ? value.trim() : ''

export function smtpConfigured(env = {}) {
  const port = Number(env.SMTP_PORT)
  return Boolean(
    textValue(env.SMTP_HOST)
    && Number.isInteger(port) && port >= 1 && port <= 65535
    && textValue(env.SMTP_USER)
    && typeof env.SMTP_PASS === 'string' && env.SMTP_PASS.length > 0 && !/[\r\n]/.test(env.SMTP_PASS)
    && textValue(env.SMTP_FROM),
  )
}

/**
 * SMTP sender for login codes. Credentials come only from the environment;
 * the transporter is built lazily so an unconfigured deployment never loads
 * nodemailer. `createTransport` is injectable for tests.
 */
export function createMailer({ env = process.env, createTransport } = {}) {
  const configured = smtpConfigured(env)
  let transporterPromise
  async function transporter() {
    if (!transporterPromise) {
      transporterPromise = (async () => {
        const factory = createTransport || (await import('nodemailer')).createTransport
        const port = Number(env.SMTP_PORT)
        return factory({
          host: textValue(env.SMTP_HOST),
          port,
          secure: port === 465,
          auth: { user: textValue(env.SMTP_USER), pass: env.SMTP_PASS },
        })
      })().catch((error) => { transporterPromise = undefined; throw error })
    }
    return transporterPromise
  }
  return {
    configured,
    async sendCode(to, code) {
      if (!configured) throw new Error('SMTP is not configured')
      const transport = await transporter()
      await transport.sendMail({
        from: textValue(env.SMTP_FROM),
        to,
        subject: '织界登录验证码',
        text: `你的织界登录验证码是：${code}\n\n验证码 10 分钟内有效，请勿告诉他人。\n如果不是你本人操作，请忽略这封邮件。`,
      })
    },
  }
}
