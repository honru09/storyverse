import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer as createTcpServer } from 'node:net'
import { createServer } from '../server/index.js'

// End-to-end wiring check with NO injected fakes on the app side: the real
// createServer builds the real auth service from env, the real nodemailer
// transport talks to a minimal local SMTP sink, and the real email-code
// channel completes a sign-in. This is the path production actually runs.

function decodeBody(raw) {
  const splitAt = raw.indexOf('\r\n\r\n')
  const headers = splitAt === -1 ? '' : raw.slice(0, splitAt)
  const body = splitAt === -1 ? raw : raw.slice(splitAt + 4)
  if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
  }
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    return body.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .split('').map((char) => char).join('')
  }
  return body
}

async function startSmtpSink(t) {
  const messages = []
  const server = createTcpServer((socket) => {
    socket.setEncoding('utf8')
    let buffer = ''
    let inData = false
    let raw = ''
    let authStage = 0
    socket.write('220 sink.local ESMTP ready\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) return
          raw += buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          inData = false
          messages.push(raw)
          raw = ''
          socket.write('250 2.0.0 Ok\r\n')
          continue
        }
        const lineEnd = buffer.indexOf('\r\n')
        if (lineEnd === -1) return
        const line = buffer.slice(0, lineEnd)
        buffer = buffer.slice(lineEnd + 2)
        if (authStage === 1) { authStage = 2; socket.write('334 UGFzc3dvcmQ6\r\n'); continue }
        if (authStage === 2) { authStage = 0; socket.write('235 2.7.0 Authentication successful\r\n'); continue }
        const command = line.split(' ')[0].toUpperCase()
        if (command === 'EHLO' || command === 'HELO') socket.write('250-sink.local\r\n250 AUTH LOGIN\r\n')
        else if (command === 'AUTH') { authStage = 1; socket.write('334 VXNlcm5hbWU6\r\n') }
        else if (command === 'MAIL' || command === 'RCPT' || command === 'RSET' || command === 'NOOP') socket.write('250 2.1.0 Ok\r\n')
        else if (command === 'DATA') { inData = true; socket.write('354 End data with <CR><LF>.<CR><LF>\r\n') }
        else if (command === 'QUIT') { socket.write('221 Bye\r\n'); socket.end() }
        else socket.write('502 5.5.2 Command not implemented\r\n')
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return { port: server.address().port, messages }
}

const postJson = (base, path, body, headers = {}) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

test('default env wiring: SMTP sink receives a code and the session signs in', async (t) => {
  const sink = await startSmtpSink(t)
  const env = {
    AUTH_ENABLED: 'true',
    DATA_STORE: 'memory',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(sink.port),
    SMTP_USER: 'no-reply@example.com',
    SMTP_PASS: 'app-specific-password',
    SMTP_FROM: '织界 <no-reply@example.com>',
  }
  const server = createServer({ env })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}`

  const config = await (await fetch(`${base}/api/auth/config`)).json()
  assert.equal(config.emailCode, true)
  assert.equal(config.enabled, false, 'the Firebase channel stays off without Firebase env')

  const started = await postJson(base, '/api/auth/email/start', { email: 'wiring@example.com' })
  assert.equal(started.status, 200)
  assert.deepEqual(await started.json(), { ok: true })
  assert.equal(sink.messages.length, 1)
  const mail = decodeBody(sink.messages[0])
  const code = mail.match(/验证码是：(\d{6})/)?.[1]
  assert.ok(code, 'the delivered mail carries a six-digit code')

  const verified = await postJson(base, '/api/auth/email/verify', { email: 'wiring@example.com', code })
  assert.equal(verified.status, 200)
  const session = await verified.json()
  assert.match(session.uid, /^em_[0-9a-f]{32}$/)

  const account = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${session.token}` } })
  assert.equal(account.status, 200)
  assert.equal((await account.json()).provider, 'email-code')

  const anonymous = await postJson(base, '/api/generate', { story: { id: 's' }, index: 0 })
  assert.equal(anonymous.status, 401)
  assert.equal((await anonymous.json()).code, 'auth-required')
  const authed = await postJson(base, '/api/generate', { story: { id: 's' }, index: 0 }, { Authorization: `Bearer ${session.token}` })
  assert.notEqual(authed.status, 401, 'a signed-in user passes the gate (the unconfigured model then answers for itself)')
  await authed.text()
})
