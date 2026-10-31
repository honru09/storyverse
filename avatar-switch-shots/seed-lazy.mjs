// Lazy-derivative seed: an account whose four avatars were
// "painted before 00055" — profiles exist via the real API, then
// the paintings are planted straight into the store (see
// fixture-server-lazy.mjs) with NO derivative records, so every
// read must heal + bake lazily.
//   viewer  svsw_lviewer
//   old     svsw_old     4 avatars: 甲·阿灿 / 乙·橘子 / 丙·知遥 / 丁·沈砚
// Usage: node seed-lazy.mjs <baseUrl> <plantUrl> <seedOutPath>
import fs from 'node:fs'

const [base, plantUrl, outPath] = process.argv.slice(2)
if (!base || !plantUrl || !outPath) throw new Error('usage: node seed-lazy.mjs <baseUrl> <plantUrl> <seedOutPath>')

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
]

const viewer = await register('svsw_lviewer')
const owner = await register('svsw_old')

const avatars = []
for (const [index, painting] of PAINTINGS.entries()) {
  const profile = { name: painting.name, description: `${painting.token} ${painting.note}` }
  const created = index === 0
    ? must(await api('/api/avatar', { credential: owner.token, method: 'PUT', body: { profile } }), 'old avatar 1 PUT')
    : must(await api('/api/avatars', { credential: owner.token, method: 'POST', body: { profile } }), `old avatar ${index + 1} POST`)
  const id = created.avatar?.id
  if (!id) throw new Error(`avatar ${index + 1}: no id`)
  avatars.push({ id, name: painting.name, token: painting.token })
  console.log(`old avatar ${index + 1}:`, id, painting.name)
}

const plantResponse = await fetch(plantUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: owner.uid, items: avatars.map(({ id, token }) => ({ avatarId: id, token })) }),
})
const plantJson = await plantResponse.json().catch(() => null)
if (plantResponse.status !== 200) throw new Error(`plant failed: ${plantResponse.status} ${JSON.stringify(plantJson)}`)
console.log('planted all paintings (no derivatives baked)')

must(await api(`/api/users/${encodeURIComponent(owner.uid)}/follow`, {
  credential: viewer.token, method: 'POST', body: {},
}), 'viewer follows old')

const pub = must(await api(`/api/users/${encodeURIComponent(owner.uid)}/profile`, { credential: viewer.token }), 'old public profile')
console.log('payload avatars:', (pub.profile?.avatars || []).map((a) => `${a.name} -> ${a.portraitUrl || 'NO-URL'}`).join('\n  '))

fs.writeFileSync(outPath, JSON.stringify({ viewer, owner, avatars }, null, 2))
console.log('seed written', outPath)
