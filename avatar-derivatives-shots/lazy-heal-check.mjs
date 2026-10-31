// REQ-73 lazy-heal proof: a painting stored WITHOUT derivatives
// (the entire legacy catalogue's shape) gains both derivatives on
// its first variant read, written back under the source stamp —
// and a bogus variant, like a missing one, serves the original.
// Runs in-process against the real social service + memory stores.
import fs from 'node:fs'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryPlazaFeedStore } from '../server/plaza-feed-store.js'

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const avatarStore = createMemoryAvatarStore()
const social = createSocialService({
  env: {},
  store: createMemorySocialStore(),
  plazaStore: createMemoryPlazaStore(),
  avatarStore,
  feedStore: createMemoryPlazaFeedStore(),
})

const uid = 'username:legacy_walker'
const painting = fs.readFileSync(new URL('./acan-portrait.jpg', import.meta.url))
// A legacy record: no derivative slots, no band stamp, version 7.
await avatarStore.putImage(uid, 'current', {
  uid,
  slot: 'current',
  version: 7,
  contentType: 'image/jpeg',
  image: painting.toString('base64'),
  bytes: painting.length,
  updatedAt: '2026-10-20T00:00:00.000Z',
})
check('precondition: no derivative slots exist', (await avatarStore.getImage(uid, 'current:face')) === null
  && (await avatarStore.getImage(uid, 'current:portrait')) === null)

const face = await social.portrait(uid, undefined, 'face')
check('first variant read returns bytes', Boolean(face?.buffer))
const jpeg = (await import('jpeg-js')).default
const faceDecoded = face ? jpeg.decode(face.buffer, { useTArray: true, formatAsRGBA: true }) : null
check('face derivative is 288x288', faceDecoded?.width === 288 && faceDecoded?.height === 288,
  faceDecoded ? `${faceDecoded.width}x${faceDecoded.height}` : 'undecodable')

const faceRecord = await avatarStore.getImage(uid, 'current:face')
const portraitRecord = await avatarStore.getImage(uid, 'current:portrait')
check('both derivatives written back', Boolean(faceRecord?.image && portraitRecord?.image))
check('write-back carries the source stamp', Boolean(faceRecord?.sourceStamp?.startsWith('7|')),
  faceRecord?.sourceStamp || 'none')

const portrait = await social.portrait(uid, undefined, 'portrait')
const portraitDecoded = portrait ? jpeg.decode(portrait.buffer, { useTArray: true, formatAsRGBA: true }) : null
check('portrait derivative is exact 3:4', portraitDecoded && Math.abs(portraitDecoded.width / portraitDecoded.height - 0.75) <= 0.002,
  portraitDecoded ? `${portraitDecoded.width}x${portraitDecoded.height}` : 'undecodable')

const again = await social.portrait(uid, undefined, 'face')
check('second read serves the stored derivative (identical bytes)', Boolean(again?.buffer?.equals(face.buffer)))

const original = await social.portrait(uid, undefined, null)
check('no variant serves the original painting', Boolean(original?.buffer?.equals(painting)))
const bogus = await social.portrait(uid, undefined, 'bogus')
check('bogus variant serves the original painting', Boolean(bogus?.buffer?.equals(painting)))

console.log(failures === 0 ? 'LAZY-HEAL: PASS' : `LAZY-HEAL: ${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
