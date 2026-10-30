import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../server/index.js'
import { createAuthService } from '../server/auth.js'
import { createUsernameAuthService } from '../server/username-auth.js'
import { createEmailCodeService } from '../server/email-code.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'

// REQ-69 follow-up micro-batch (integrate-00052): plaza posts had no
// author edit path, which left two live posts stuck with superseded
// promises their authors could not fix. PATCH /api/plaza/posts/:id is
// the author's own repair channel — these tests pin its contract:
// author-only (403 for anyone else), gone posts are 404, and the new
// text passes the same cleanPostText gate as publishing (sanitize,
// 500-char cap, setting-guard red-line scan).

const ORIGIN = { Origin: 'http://localhost:5173' }

async function startServer(t) {
  const identityStore = createMemoryIdentityStore()
  const mailer = { configured: false, sendCode: async () => {}, sendRecoveryCode: async () => {} }
  const usernameAuth = createUsernameAuthService({ env: { AUTH_ENABLED: 'true' }, store: identityStore, mailer, log: () => {} })
  const emailCode = createEmailCodeService({ env: {}, store: identityStore, mailer, log: () => {} })
  const auth = createAuthService({ env: { AUTH_ENABLED: 'true' }, usernameAuth, emailCode })
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    auth,
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  return `http://127.0.0.1:${server.address().port}`
}

async function register(base, username) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { ...ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'edit-pass-123' }),
  })
  assert.equal(response.status, 200, `register ${username}`)
  return (await response.json()).token
}

const authHeaders = (token) => ({ ...ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function createPost(base, token, content) {
  const response = await fetch(`${base}/api/plaza/posts`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ type: 'free_text', content }),
  })
  assert.equal(response.status, 200, 'create post')
  return (await response.json()).post
}

const patchPost = (base, token, id, content) => fetch(`${base}/api/plaza/posts/${id}`, {
  method: 'PATCH',
  headers: token ? authHeaders(token) : { ...ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ content }),
})

const getPost = async (base, id) => {
  const response = await fetch(`${base}/api/plaza/posts/${id}`, { headers: { ...ORIGIN } })
  return response
}

test('the author can edit their own post; the feed and detail show the new words', async (t) => {
  const base = await startServer(t)
  const token = await register(base, 'edit_author')
  const post = await createPost(base, token, '第一版分享语。')
  const before = post.updatedAt

  const response = await patchPost(base, token, post.id, '改过的分享语，这次说准了。')
  assert.equal(response.status, 200)
  const { post: updated } = await response.json()
  assert.equal(updated.content, '改过的分享语，这次说准了。')
  assert.ok(updated.updatedAt >= before, 'updatedAt moves on edit')
  assert.equal(updated.createdAt, post.createdAt)

  const detail = await getPost(base, post.id)
  assert.equal(detail.status, 200)
  assert.equal((await detail.json()).post.content, '改过的分享语，这次说准了。')
})

test('editing another reader’s post is a 403 and changes nothing', async (t) => {
  const base = await startServer(t)
  const authorToken = await register(base, 'edit_owner')
  const otherToken = await register(base, 'edit_intruder')
  const post = await createPost(base, authorToken, '这是我的帖子。')

  const response = await patchPost(base, otherToken, post.id, '被别人改掉的话。')
  assert.equal(response.status, 403)

  const detail = await getPost(base, post.id)
  assert.equal((await detail.json()).post.content, '这是我的帖子。')
})

test('editing a post that does not exist — or is already deleted — is a 404', async (t) => {
  const base = await startServer(t)
  const token = await register(base, 'edit_ghost')

  const missing = await patchPost(base, token, 'post-does-not-exist', '说什么都行。')
  assert.equal(missing.status, 404)

  const post = await createPost(base, token, '马上要删掉的帖子。')
  const deleted = await fetch(`${base}/api/plaza/posts/${post.id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  assert.equal(deleted.status, 200)
  const afterDelete = await patchPost(base, token, post.id, '删了就改不了。')
  assert.equal(afterDelete.status, 404)
})

test('the edit gate is the publish gate: red-line text, over-length and empty bodies are 400s', async (t) => {
  const base = await startServer(t)
  const token = await register(base, 'edit_gate')
  const post = await createPost(base, token, '原本干干净净的一句。')

  const redLine = await patchPost(base, token, post.id, '设定：一个初中生在夜里遭遇性侵，故事围绕这件事展开。')
  assert.equal(redLine.status, 400)

  const tooLong = await patchPost(base, token, post.id, '长'.repeat(501))
  assert.equal(tooLong.status, 400)

  const empty = await patchPost(base, token, post.id, '   ')
  assert.equal(empty.status, 400)
  // Whitespace-only content must never have replaced the good text.
  const stillBad = await patchPost(base, token, post.id, '影射现实中以真人为原型的人物，编造他出轨的黑料。')
  assert.equal(stillBad.status, 400)

  const detail = await getPost(base, post.id)
  assert.equal((await detail.json()).post.content, '原本干干净净的一句。')
})

test('editing requires a signed-in identity', async (t) => {
  const base = await startServer(t)
  const token = await register(base, 'edit_anon')
  const post = await createPost(base, token, '匿名改不了这句。')

  const response = await patchPost(base, null, post.id, '没登录就想改。')
  assert.equal(response.status, 401)
  assert.equal((await response.json()).code, 'auth-required')
})
