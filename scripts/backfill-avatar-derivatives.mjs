/**
 * Avatar derivative backfill / preheat (REQ-73, DESIGN §59).
 *
 * Derivatives normally converge on their own — the first variant
 * read of any painting builds and writes back both baked siblings
 * (lazy healing, the §40 pattern), so no account can be missed for
 * long. This script exists to warm the known accounts ahead of
 * traffic and to PROVE, account by account, that the pipeline
 * serves real derivatives rather than silently falling back to
 * originals: it walks each profile's avatar collection through the
 * PUBLIC endpoints and checks the returned bytes' real dimensions
 * (portrait exactly 3:4, face exactly 288×288). A derivative that
 * failed to build shows up here as a dimension mismatch, not as a
 * quiet pass.
 *
 *   node scripts/backfill-avatar-derivatives.mjs [--base URL] [--uids uid,uid,...]
 *
 * Defaults: the production origin and the known username accounts.
 * Accounts whose uid is not a `username:<name>` id (the owner's own
 * Firebase-uid account) can be passed via --uids; until then they
 * warm lazily on first read, which the profile page itself triggers.
 * Writes nothing locally; the only writes are the server's own
 * derivative records, created by the reads.
 */
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : null
}
const base = (flag('--base') || 'https://story.tabarcade.online').replace(/\/$/, '')
const DEFAULT_UIDS = [
  'username:storyweave',
  'username:qingshan_ke',
  'username:beichen_09',
  'username:nanqiao_07',
  'username:jiangfeng_walk',
]
const uids = (flag('--uids') || '').split(',').map((item) => item.trim()).filter(Boolean)
const targets = uids.length ? uids : DEFAULT_UIDS

function dimensionsOf(buffer) {
  try {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      const png = PNG.sync.read(buffer)
      return { width: png.width, height: png.height }
    }
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true })
    return decoded?.width ? { width: decoded.width, height: decoded.height } : null
  } catch {
    return null
  }
}

async function fetchBuffer(url) {
  const response = await fetch(url)
  if (!response.ok) return { status: response.status, buffer: null }
  return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()) }
}

const withVariant = (url, variant) => {
  const full = new URL(url, base)
  full.searchParams.set('variant', variant)
  return full.toString()
}

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} — ${detail}`)
  if (!ok) failures += 1
}

for (const uid of targets) {
  const enc = encodeURIComponent(uid)
  const profileResponse = await fetch(`${base}/api/users/${enc}/profile`)
  if (!profileResponse.ok) {
    check(uid, false, `profile HTTP ${profileResponse.status}`)
    continue
  }
  const { profile } = await profileResponse.json()
  const avatars = Array.isArray(profile?.avatars) ? profile.avatars : []
  console.log(`== ${uid} (${profile?.displayName || profile?.handle || '?'}) — ${avatars.length} avatar(s), picture kind ${profile?.picture?.kind || 'default'}`)
  for (const avatar of avatars) {
    if (!avatar.hasPortrait || !avatar.portraitUrl) {
      console.log(`  ..  ${avatar.name || avatar.id} — no portrait yet, skipped`)
      continue
    }
    for (const variant of ['portrait', 'face']) {
      const { status, buffer } = await fetchBuffer(withVariant(avatar.portraitUrl, variant))
      if (!buffer) {
        check(`${uid} / ${avatar.name || avatar.id} / ${variant}`, false, `HTTP ${status}`)
        continue
      }
      const dims = dimensionsOf(buffer)
      if (!dims) {
        check(`${uid} / ${avatar.name || avatar.id} / ${variant}`, false, 'undecodable bytes')
        continue
      }
      if (variant === 'portrait') {
        const ratioOk = Math.abs(dims.width / dims.height - 0.75) <= 0.01
        check(`${uid} / ${avatar.name || avatar.id} / portrait`, ratioOk, `${dims.width}x${dims.height}, ${buffer.length} bytes`)
      } else {
        check(`${uid} / ${avatar.name || avatar.id} / face`, dims.width === 288 && dims.height === 288, `${dims.width}x${dims.height}, ${buffer.length} bytes`)
      }
    }
  }
  if (profile?.picture?.kind && profile.picture.kind !== 'default') {
    const { status, buffer } = await fetchBuffer(`${base}/api/users/${enc}/picture?variant=face`)
    if (!buffer) {
      check(`${uid} / picture face`, false, `HTTP ${status}`)
    } else {
      const dims = dimensionsOf(buffer)
      check(`${uid} / picture face`, Boolean(dims) && dims.width === dims.height, dims ? `${dims.width}x${dims.height}, ${buffer.length} bytes` : 'undecodable bytes')
    }
  }
}

console.log(failures === 0 ? 'BACKFILL CHECK: all derivatives verified' : `BACKFILL CHECK: ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
