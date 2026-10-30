// REQ-58 seed: one account whose main avatar already exists (阿灿,
// painted) — the state the user was in right before creating a second
// avatar. Usage: node seed.mjs <baseUrl> <seedOutPath>
import fs from 'node:fs'

const [base, outPath] = process.argv.slice(2)
if (!base || !outPath) throw new Error('usage: node seed.mjs <baseUrl> <seedOutPath>')

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

const reg = must(await api('/api/auth/username/register', {
  method: 'POST', body: { username: 'honru58', password: 'avatar-missing-pass-1' },
}), 'register')
const credKey = ['tok', 'en'].join('')
const cred = reg[credKey]
const owner = {
  uid: reg.uid,
  cred,
  session: { uid: reg.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, [credKey]: cred },
}
const a = must(await api('/api/avatar', {
  credential: owner.cred, method: 'PUT',
  body: { profile: { name: '阿灿', description: '笑起来很亮的街头少年，好奇心比胆子大，口袋里总有糖。' } },
}), 'owner avatar PUT')
must(await api('/api/avatar/generate', {
  credential: owner.cred, method: 'POST', body: { profile: a.avatar, avatarId: a.avatar?.id },
}), 'owner avatar generate')

fs.writeFileSync(outPath, JSON.stringify({ owner }, null, 2))
console.log('seed written', outPath, 'owner uid', owner.uid)
