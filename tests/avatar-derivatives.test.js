// REQ-73 (DESIGN §59): the avatar derivative pipeline — the
// normalisation that seven CSS rounds could not do, done in
// pixels. These pins exercise the REAL module on synthetic
// paintings composed like the production failure modes (a
// white-matted poster with a big head, a full-bleed scene with a
// small face, a faceless image) plus the storage contract
// (bake-at-generation, stamp-keyed lazy healing, derivatives
// travelling with their paintings through main swaps and
// deletions). The six REAL production portraits are exercised by
// the acceptance run recorded in AVATAR-DERIVATIVES.md — repo
// tests stay hermetic.
import test from 'node:test'
import assert from 'node:assert/strict'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import {
  buildAvatarDerivatives,
  derivativeSlotFor,
  derivativeSourceStamp,
  detectFaceWindow,
  ensureAvatarDerivative,
  ensurePictureFaceDerivative,
  sampleEdgeColorsRgb,
} from '../server/avatar-derivatives.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createAvatarService } from '../server/avatar.js'

const SKIN = [232, 183, 148]
const HAIR = [52, 40, 34]
const TEAL = [64, 120, 130]
const DARK = [26, 32, 52]
const WHITE = [255, 255, 255]

function compose(width, height, paint) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  return { data, width, height }
}

const encodeJpeg = (image, quality = 92) => Buffer.from(jpeg.encode(image, quality).data)
const decodeJpeg = (buffer) => jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true })

/** A white-matted poster: panel inset, big skin head, hair cap, coat shoulders. */
function mattedPoster() {
  return compose(400, 540, (x, y) => {
    if (x < 40 || x >= 360 || y < 30 || y >= 510) return WHITE
    const head = (x - 200) ** 2 + (y - 125) ** 2 <= 48 ** 2
    const hair = (x - 200) ** 2 + (y - 112) ** 2 <= 50 ** 2 && y < 108
    if (hair) return HAIR
    if (head) {
      if ((Math.abs(x - 182) < 5 && Math.abs(y - 122) < 3) || (Math.abs(x - 218) < 5 && Math.abs(y - 122) < 3)) return HAIR
      return SKIN
    }
    if (y > 175 && Math.abs(x - 200) < 95) return TEAL
    return [188, 208, 214]
  })
}

/** A full-bleed scene: a gradient sky (corners not alike, so no
 * matte is ever stripped), a small face in the upper centre. */
function fullBleedScene() {
  return compose(400, 520, (x, y) => {
    const head = (x - 200) ** 2 + (y - 115) ** 2 <= 40 ** 2
    if (head) {
      if ((Math.abs(x - 186) < 4 && Math.abs(y - 112) < 3) || (Math.abs(x - 214) < 4 && Math.abs(y - 112) < 3)) return HAIR
      return SKIN
    }
    if (y > 160 && Math.abs(x - 200) < 80) return [40, 48, 74]
    const t = y / 520
    return [Math.round(20 + 24 * t), Math.round(26 + 10 * t), Math.round(44 + 16 * t)]
  })
}

test('REQ-73: edge tones — a white-matted portrait samples white, a dark scene samples its own dark', () => {
  const matted = sampleEdgeColorsRgb(decodeJpeg(encodeJpeg(mattedPoster())))
  for (const side of ['top', 'bottom', 'left', 'right', 'average']) {
    assert.ok(matted[side].every((v) => v >= 235), `${side} is matte-white: ${matted[side]}`)
  }
  const scene = sampleEdgeColorsRgb(decodeJpeg(encodeJpeg(fullBleedScene())))
  assert.ok(scene.top.every((v) => v <= 90), `top stays dark: ${scene.top}`)
  assert.ok(scene.bottom.every((v) => v <= 110), `bottom stays dark: ${scene.bottom}`)
  assert.equal(sampleEdgeColorsRgb(null), null)
})

test('REQ-73: face window — the matted poster: canvas is the panel, window holds the whole head', () => {
  const image = decodeJpeg(encodeJpeg(mattedPoster()))
  const found = detectFaceWindow(image)
  assert.equal(found.fallback, false)
  // Canvas ≈ the panel (grid tolerance).
  assert.ok(Math.abs(found.canvas.x0 - 40) <= 6 && Math.abs(found.canvas.x1 - 360) <= 6, JSON.stringify(found.canvas))
  assert.ok(Math.abs(found.canvas.y0 - 30) <= 8 && Math.abs(found.canvas.y1 - 510) <= 8, JSON.stringify(found.canvas))
  // The skin of the head spans x 152..248, y ~108..173 (the hair
  // cap is not skin; the WINDOW must still hold the whole head,
  // hair top at y 62 included — that is what the top margin is for).
  assert.ok(found.face.x0 <= 165 && found.face.x1 >= 235, `face width: ${JSON.stringify(found.face)}`)
  assert.ok(found.face.y0 >= 95 && found.face.y0 <= 120, `face top is the skin line under the hair: ${JSON.stringify(found.face)}`)
  assert.ok(found.face.y1 >= 160, `face bottom: ${JSON.stringify(found.face)}`)
  const win = found.window
  assert.ok(win.x0 <= found.face.x0 && win.y0 <= 65, 'window reaches above the hair')
  assert.ok(win.x0 + win.side >= found.face.x1 && win.y0 + win.side >= 173, 'window ends below the chin')
  assert.ok(win.x0 >= found.canvas.x0 - 1 && win.y0 >= found.canvas.y0 - 1, 'window inside canvas (top/left)')
  assert.ok(win.x0 + win.side <= found.canvas.x1 + 1 && win.y0 + win.side <= found.canvas.y1 + 1, 'window inside canvas (bottom/right)')
})

test('REQ-73: face window — the full-bleed scene: no matte stripped, small face still found', () => {
  const image = decodeJpeg(encodeJpeg(fullBleedScene()))
  const found = detectFaceWindow(image)
  assert.equal(found.fallback, false)
  assert.deepEqual(
    [found.canvas.x0, found.canvas.y0, found.canvas.x1, found.canvas.y1],
    [0, 0, 400, 520],
    'the gradient sky is never mistaken for a matte',
  )
  assert.ok(found.face.x0 <= 175 && found.face.x1 >= 225, JSON.stringify(found.face))
  assert.ok(found.face.y0 <= 95 && found.face.y1 >= 140, JSON.stringify(found.face))
})

test('REQ-73: face window — a wide face cluster on a tight person-canvas is NOT backdrop (transcode regression)', () => {
  // The owner's silver-haired portrait, after the store-time
  // transcode merged a hairline fringe into the face cluster,
  // measured cluster width 0.49 of its (tight, person-shaped)
  // canvas — an unconditional 0.46 width cap rejected the real
  // face and a neck cluster won, baking a chest close-up as the
  // "face". The cap now binds only clusters spanning the canvas
  // edge to edge. This fixture pins the shape: panel = the person
  // bbox, head disc spans 0.48 of the canvas width, touches
  // neither edge.
  const image = decodeJpeg(encodeJpeg(compose(400, 540, (x, y) => {
    if (x < 100 || x >= 300 || y < 30 || y >= 510) return WHITE
    const head = (x - 200) ** 2 + (y - 125) ** 2 <= 48 ** 2
    if (head) {
      if ((Math.abs(x - 182) < 5 && Math.abs(y - 122) < 3) || (Math.abs(x - 218) < 5 && Math.abs(y - 122) < 3)) return HAIR
      return SKIN
    }
    if (y > 175 && Math.abs(x - 200) < 70) return TEAL
    return [188, 208, 214]
  })))
  const found = detectFaceWindow(image)
  assert.equal(found.fallback, false)
  assert.ok(found.face.x0 <= 165 && found.face.x1 >= 235, JSON.stringify(found.face))
  assert.ok(found.window.y0 <= 82, 'window still reaches the head top')
})

test('REQ-73: face window — a skin-toned band spanning the canvas IS backdrop and loses to the face', () => {
  // The other half of the width rule: an edge-to-edge skin-toned
  // band keeps the strict cap and must not outvote a real face
  // below it.
  const image = decodeJpeg(encodeJpeg(compose(360, 480, (x, y) => {
    if (y < 92) return SKIN
    if (y < 100) return HAIR
    const head = (x - 180) ** 2 + (y - 150) ** 2 <= 42 ** 2
    if (head) {
      if ((Math.abs(x - 165) < 4 && Math.abs(y - 146) < 3) || (Math.abs(x - 195) < 4 && Math.abs(y - 146) < 3)) return HAIR
      return SKIN
    }
    return DARK
  })))
  const found = detectFaceWindow(image)
  assert.equal(found.fallback, false)
  assert.ok(found.face.y0 >= 100, `the winner is the face below the band, not the band: ${JSON.stringify(found.face)}`)
})

test('REQ-73: face window — a faceless image falls back to the canvas top-centre, still square', () => {
  const image = decodeJpeg(encodeJpeg(compose(360, 480, (x, y) => [30 + (x % 60), 90, 140 - (y % 50)])))
  const found = detectFaceWindow(image)
  assert.equal(found.fallback, true)
  assert.equal(found.face, null)
  assert.equal(found.window.y0, found.canvas.y0)
  const centre = found.window.x0 + found.window.side / 2
  assert.ok(Math.abs(centre - (found.canvas.x0 + found.canvas.x1) / 2) <= 2)
})

test('REQ-73: derivatives — exact sizes, pad carries the painting\'s own tones, face is a head shot', () => {
  const built = buildAvatarDerivatives(encodeJpeg(mattedPoster()))
  assert.ok(built)
  assert.equal(built.meta.fallback, false)
  // Portrait: the 400x540 source pads to exactly 3:4.
  const portrait = decodeJpeg(built.portrait.buffer)
  assert.equal(portrait.width / portrait.height, 0.75)
  assert.ok(built.portrait.buffer.length <= 200 * 1024)
  // A pad pixel (far left column) is the painting's own matte white.
  const pad = (270 * portrait.width + 1) * 4
  assert.ok(portrait.data[pad] >= 235 && portrait.data[pad + 1] >= 235 && portrait.data[pad + 2] >= 235, 'pad is matte white')
  // A centre pixel is still the painting (pale panel), not pad tone confusion.
  const mid = (300 * portrait.width + 202) * 4
  assert.ok(portrait.data[mid] < 235, 'interior untouched')
  // Face: exactly 288², centre reads as skin.
  const face = decodeJpeg(built.face.buffer)
  assert.equal(face.width, 288)
  assert.equal(face.height, 288)
  assert.ok(built.face.buffer.length <= 96 * 1024)
  const centre = (144 * 288 + 144) * 4
  assert.ok(face.data[centre] > face.data[centre + 1] && face.data[centre + 1] > face.data[centre + 2], 'face centre is a warm skin tone')
  assert.ok(face.data[centre] >= 170, 'face centre is bright skin, not the coat or matte')
})

test('REQ-73: derivatives — an already-exact 3:4 painting carries over byte for byte', () => {
  const source = encodeJpeg(compose(300, 400, (x, y) => {
    const head = (x - 150) ** 2 + (y - 90) ** 2 <= 34 ** 2
    return head ? SKIN : TEAL
  }))
  const built = buildAvatarDerivatives(source)
  assert.ok(built)
  assert.ok(built.portrait.buffer.equals(source))
  assert.equal(built.portrait.padded, 0)
})

test('REQ-73: derivatives — undecodable bytes yield null, never a throw', () => {
  assert.equal(buildAvatarDerivatives(Buffer.from('not an image')), null)
  assert.equal(buildAvatarDerivatives(Buffer.alloc(0)), null)
  assert.equal(buildAvatarDerivatives(null), null)
})

test('REQ-73: lazy healing — ensure builds both derivatives, serves by stamp, rebuilds on change', async () => {
  const store = createMemoryAvatarStore()
  const uid = 'user-deriv-1'
  const sourceBuffer = encodeJpeg(mattedPoster())
  const record = {
    uid, slot: 'current', version: 3, contentType: 'image/jpeg',
    image: sourceBuffer.toString('base64'), updatedAt: '2026-10-31T00:00:00.000Z',
  }
  await store.putImage(uid, 'current', record)
  const face = await ensureAvatarDerivative(store, uid, 'current', record, 'face')
  assert.ok(face)
  assert.deepEqual([decodeJpeg(face.buffer).width, decodeJpeg(face.buffer).height], [288, 288])
  const storedFace = await store.getImage(uid, derivativeSlotFor('current', 'face'))
  const storedPortrait = await store.getImage(uid, derivativeSlotFor('current', 'portrait'))
  assert.ok(storedFace?.image && storedPortrait?.image, 'both derivatives were written back')
  assert.equal(storedFace.sourceStamp, derivativeSourceStamp(record))
  // Same stamp: served from the store record, bytes identical.
  const again = await ensureAvatarDerivative(store, uid, 'current', record, 'face')
  assert.ok(again.buffer.equals(face.buffer))
  // A repaint (new version + timestamp): the stamp moves, the
  // derivative rebuilds against the new painting.
  const repainted = { ...record, version: 4, updatedAt: '2026-10-31T01:00:00.000Z', image: encodeJpeg(fullBleedScene()).toString('base64') }
  await store.putImage(uid, 'current', repainted)
  const rebuilt = await ensureAvatarDerivative(store, uid, 'current', repainted, 'face')
  assert.ok(rebuilt)
  const storedAfter = await store.getImage(uid, derivativeSlotFor('current', 'face'))
  assert.equal(storedAfter.sourceStamp, derivativeSourceStamp(repainted))
  // No source image: null (the caller serves the original route's 404).
  assert.equal(await ensureAvatarDerivative(store, uid, 'current', null, 'face'), null)
  assert.equal(await ensureAvatarDerivative(store, uid, 'current', record, 'bogus'), null)
})

test('REQ-73: upload face derivative — baked on ensure, keyed to the upload record', async () => {
  const store = createMemorySocialStore()
  const uid = 'user-deriv-2'
  const record = {
    image: encodeJpeg(fullBleedScene()).toString('base64'),
    contentType: 'image/jpeg',
    updatedAt: '2026-10-31T00:00:00.000Z',
  }
  const face = await ensurePictureFaceDerivative(store, uid, record)
  assert.ok(face)
  assert.deepEqual([decodeJpeg(face.buffer).width, decodeJpeg(face.buffer).height], [288, 288])
  assert.ok((await store.getPictureFace(uid))?.image, 'the face record was written back')
  assert.equal(await ensurePictureFaceDerivative(store, uid, null), null)
})

// --- service level: derivatives travel with their paintings ---

const identity = { uid: 'user-deriv-3', email: null, displayName: '衍生同行', emailVerified: false, provider: 'username' }

function tinyPng(seed = 0) {
  const png = new PNG({ width: 60, height: 80 })
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 200 - seed
    png.data[index + 1] = 120
    png.data[index + 2] = 60
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

const profile = (overrides = {}) => ({
  name: '林晚舟',
  description: '清冷安静的剑客。',
  appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
  ...overrides,
})

test('REQ-73: generation bakes derivatives; setMain and remove move them with the paintings', async () => {
  const store = createMemoryAvatarStore()
  let paints = 0
  const service = createAvatarService({
    env: { GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-test-123', AVATAR_DAILY_LIMIT: '50' },
    store,
    imageGenerate: async () => {
      paints += 1
      return { buffer: tinyPng(paints), mimeType: 'image/png', usage: null }
    },
  })
  const a = await service.create(identity, { profile: profile() })
  const b = await service.create(identity, { profile: profile({ name: '阿灿' }) })
  await service.generate(identity, { avatarId: a.id })
  await service.generate(identity, { avatarId: b.id })

  const stampOf = async (slot) => {
    const painting = await store.getImage(identity.uid, slot)
    return painting ? derivativeSourceStamp(painting) : null
  }
  const derivativeStamp = async (slot) => (await store.getImage(identity.uid, slot))?.sourceStamp || null

  // A is main: its derivatives sit at the main derivative slots,
  // stamped against A's painting; B's at B's own derivative slots.
  assert.equal(await derivativeStamp('current:face'), await stampOf('current'))
  assert.equal(await derivativeStamp('current:portrait'), await stampOf('current'))
  assert.equal(await derivativeStamp(`${b.id}:current:face`), await stampOf(`${b.id}:current`))
  assert.ok(await derivativeStamp('current:face'), 'main face derivative exists')

  // Variant fetch serves derivative-shaped bytes (288²).
  const faceImage = await service.fetchImage(identity, 'current', a.id, 'face')
  assert.ok(faceImage)
  assert.deepEqual([decodeJpeg(faceImage.buffer).width, decodeJpeg(faceImage.buffer).height], [288, 288])

  // Swap mains: each derivative set follows its own painting.
  const stampABefore = await stampOf('current')
  await service.setMain(identity, b.id)
  assert.equal(await derivativeStamp('current:face'), await stampOf('current'), 'main derivative now belongs to B')
  assert.notEqual(await stampOf('current'), stampABefore, 'the main painting really swapped')
  assert.equal(await derivativeStamp(`${a.id}:current:face`), await stampOf(`${a.id}:current`), 'A derivative followed A home')

  // Remove the main (B): A is promoted and its derivatives come
  // back to the main slots; nothing of B's remains addressable.
  await service.remove(identity, b.id)
  assert.equal(await derivativeStamp('current:face'), await stampOf('current'), 'promoted A derivative is at the main slot')
  assert.equal(await store.getImage(identity.uid, `${b.id}:current:face`), null)
})
