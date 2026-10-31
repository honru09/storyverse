// Avatar-switch repro seed (companion to repro.mjs):
//   A  svsw_a      — the viewer.
//   B  svsw_b      — FIVE avatars, five DIFFERENT production paintings,
//                    walked through the real generation path so the
//                    REQ-73 derivatives bake at store time:
//                      1 甲·阿灿 REALACAN   (main)
//                      2 乙·橘子 REALJUZI
//                      3 丙·知遥 REALZHIYAO
//                      4 丁·沈砚 REALSHENYAN
//                      5 戊·陆鸣 REALLUMING
//   A follows B (the window-form profile is reached through the
//   viewer's following list, exactly like the REQ-73 acceptance).
// Usage: node seed-switch.mjs <baseUrl> <seedOutPath>
import fs from 'node:fs'

const [base, outPath] = process.argv.slice(2)
if (!base || !outPath) throw new Error('usage: node seed-switch.mjs <baseUrl> <seedOutPath>')

async function api(route, { credential, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json().catch(() => null) }
}
function must(result, label) {
  if (result.status !== 200) throw new Error(`${label}: HTTP ${result.status} ${JSON.stringify(result.json)?.slice(0, 300)}`)
  return result.json
}

async function register(username) {
  const reg = must(await api('/api/auth/username/register', {
    method: 'POST', body: { username, password: 'switch-pass-1' },
  }), `register ${username}`)
  return {
    uid: reg.uid,
    token: reg.token,
    session: { uid: reg.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, token: reg.token },
  }
}

const PAINTINGS = [
  { name: '甲·阿灿', token: 'REALACAN', note: '笑起来很亮的街头少年。' },
  { name: '乙·橘子', token: 'REALJUZI', note: '一颗橘子，大家的好朋友。' },
  { name: '丙·知遥', token: 'REALZHIYAO', note: '沉潮港的守灯人。' },
  { name: '丁·沈砚', token: 'REALSHENYAN', note: '长发的灵田杂役。' },
  { name: '戊·陆鸣', token: 'REALLUMING', note: '灰夹克的年轻人。' },
]

const viewer = await register('svsw_a')
const owner = await register('svsw_b')

const avatars = []
for (const [index, painting] of PAINTINGS.entries()) {
  const profile = { name: painting.name, description: `${painting.token} ${painting.note}` }
  const created = index === 0
    ? must(await api('/api/avatar', { credential: owner.token, method: 'PUT', body: { profile } }), 'B avatar 1 PUT')
    : must(await api('/api/avatars', { credential: owner.token, method: 'POST', body: { profile } }), `B avatar ${index + 1} POST`)
  const id = created.avatar?.id
  if (!id) throw new Error(`avatar ${index + 1}: no id in response ${JSON.stringify(created)?.slice(0, 200)}`)
  must(await api('/api/avatar/generate', { credential: owner.token, method: 'POST', body: { avatarId: id } }), `B avatar ${index + 1} generate`)
  avatars.push({ id, name: painting.name, token: painting.token })
  console.log(`B avatar ${index + 1}:`, id, painting.name)
}

must(await api(`/api/users/${encodeURIComponent(owner.uid)}/follow`, {
  credential: viewer.token, method: 'POST', body: {},
}), 'A follows B')

// Sanity: the public profile payload must carry five distinct
// portrait URLs before any browser work starts.
const pub = must(await api(`/api/users/${encodeURIComponent(owner.uid)}/profile`, { credential: viewer.token }), 'B public profile')
const summaries = pub.profile?.avatars || []
console.log('payload avatars:', summaries.map((a) => `${a.name} -> ${a.portraitUrl || 'NO-URL'}`).join('\n  '))
if (summaries.length !== 5) throw new Error(`expected 5 avatar summaries, got ${summaries.length}`)

fs.writeFileSync(outPath, JSON.stringify({ viewer, owner, avatars }, null, 2))
console.log('seed written', outPath)
