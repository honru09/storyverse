import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import {
  countTopBandRows,
  topBandCrop,
  trimTopBandFromImage,
  transcodePortraitImage,
  normalizedStoredImage,
} from '../server/portrait-image.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { plazaWorldIntroFor } from '../src/plaza.js'
import { worldIntroForRecord } from '../scripts/refresh-world-intros.mjs'

// The portrait fixtures live with the shot harnesses that made them:
// the clean generated portrait (avatar batch), the dark-painting
// stand-in (phone-fix batch), and the banded composite (this batch).
const asset = (path) => readFileSync(new URL(`../${path}`, import.meta.url))
const CLEAN_PORTRAIT = 'avatar-shots/sample-portrait-v1-black-hair.png'
const DARK_PORTRAIT = 'phone-fix-shots/fixture-portrait-dark.png'
const BANDED_PORTRAIT = 'dedup-shots/fixture-portrait-banded.png'

function pngWithTopBand({ width = 120, height = 160, bandRows = 24, band = [5, 5, 8], body = [235, 232, 225] } = {}) {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const [r, g, b] = y < bandRows ? band : body
      png.data[offset] = r
      png.data[offset + 1] = g
      png.data[offset + 2] = b
      png.data[offset + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

function decodedOf(buffer) {
  const png = PNG.sync.read(buffer)
  return { data: png.data, width: png.width, height: png.height }
}

test('③a a clean white-ground portrait has no band to trim', () => {
  const clean = asset(CLEAN_PORTRAIT)
  assert.equal(trimTopBandFromImage(clean), null)
  const image = decodedOf(clean)
  assert.equal(topBandCrop(image), 0)
})

test('③a a dark painting top (deep blue) is NOT a band — no false trim', () => {
  const dark = asset(DARK_PORTRAIT)
  const image = decodedOf(dark)
  // The fixture's top rows sit at luminance ≈ 22: above the mean gate.
  assert.equal(countTopBandRows(image), 0)
  assert.equal(trimTopBandFromImage(dark), null)
})

test('③a a baked-in black band is detected and trimmed to clean rows', () => {
  const banded = asset(BANDED_PORTRAIT)
  const decoded = decodedOf(banded)
  const rows = countTopBandRows(decoded)
  assert.ok(rows > decoded.height * 0.1, `band rows ${rows}`)
  const trimmed = trimTopBandFromImage(banded)
  assert.ok(trimmed, 'trim returns a buffer')
  assert.ok(trimmed.rows >= rows - 2 && trimmed.rows <= rows + 2)
  const after = decodedOf(trimmed.buffer)
  assert.equal(after.height, decoded.height - trimmed.rows)
  assert.equal(countTopBandRows(after), 0)
})

test('③a the crop refuses hairlines and majority-black compositions', () => {
  const hairline = pngWithTopBand({ bandRows: 3 }) // 1.9% < 3% floor
  assert.equal(trimTopBandFromImage(hairline), null)
  const mostlyBlack = pngWithTopBand({ bandRows: 80 }) // 50% > 24% cap
  assert.equal(trimTopBandFromImage(mostlyBlack), null)
  const normal = pngWithTopBand({ bandRows: 24 }) // 15% — trims
  assert.ok(trimTopBandFromImage(normal))
})

test('③a the store-time transcode trims the band before the JPEG encode', () => {
  const banded = asset(BANDED_PORTRAIT)
  const out = transcodePortraitImage(banded)
  assert.equal(out.contentType, 'image/jpeg')
  assert.ok(out.buffer.length > 0)
})

test('③a stored legacy images heal on first read and stamp the record', async () => {
  const store = createMemoryAvatarStore()
  const banded = asset(BANDED_PORTRAIT)
  const transcoded = transcodePortraitImage(banded) // already trimmed at store time
  await store.putImage('uid-1', 'slot-a', {
    uid: 'uid-1', slot: 'slot-a', version: 1,
    contentType: transcoded.contentType,
    image: transcoded.buffer.toString('base64'),
    bytes: transcoded.buffer.length,
  })
  const cleanRead = await normalizedStoredImage(store, 'uid-1', 'slot-a', await store.getImage('uid-1', 'slot-a'))
  assert.ok(cleanRead.buffer.length > 0)
  const stamped = await store.getImage('uid-1', 'slot-a')
  assert.equal(stamped.bandChecked, true)

  // A record still carrying the band (stored before the fix, raw PNG
  // bytes) is rewritten trimmed.
  await store.putImage('uid-1', 'slot-b', {
    uid: 'uid-1', slot: 'slot-b', version: 1,
    contentType: 'image/png',
    image: banded.toString('base64'),
    bytes: banded.length,
  })
  const record = await store.getImage('uid-1', 'slot-b')
  const healed = await normalizedStoredImage(store, 'uid-1', 'slot-b', record)
  assert.equal(healed.contentType, 'image/jpeg')
  const after = await store.getImage('uid-1', 'slot-b')
  assert.equal(after.bandChecked, true)
  assert.equal(after.image, healed.buffer.toString('base64'))
  assert.ok(Buffer.from(after.image, 'base64').length < banded.length)
})

test('③a healing never breaks a read: undecodable bytes pass through', async () => {
  const junk = Buffer.from('not an image at all')
  const record = { image: junk.toString('base64'), contentType: 'image/png' }
  const out = await normalizedStoredImage(null, 'uid', 'slot', record)
  assert.deepEqual(out.buffer, junk)
})

const geminiStyleDetail = {
  title: '疯狂的王兴润',
  worldName: '诡市',
  avatar: { name: '王兴润', appearance: '二十出头的青年，眉眼锋利' },
  chapterCount: 24,
  lineStatus: 'finished',
  worldBible: {
    premise: '疯狂的王兴润是一个现实与诡异鬼市交织重叠的世界，活人以资产与负债计价，死人排队等一个名额。鬼市的摊主从不收钱，只收因果。',
    rules: [
      '活人以资产与负债计价，入市先称命。',
      '已经发生的事会留下可追踪的回声，不能被无痕抹去。',
      '能力越界会改变世界稳定度。',
      '鬼市的规矩只认账，不认人。',
      '第四条不会出现在这里。',
    ],
    endingAnchor: '结局锚点：王兴润必须烧掉整本账簿，世界才会醒来。',
    outline: ['第 25 章 未公开大纲'],
  },
  beats: [
    { number: 1, title: '夜市开锣', state: '开局' },
    { number: 24, title: '账清', state: '收束' },
  ],
}

test('④ the intro cuts the title-stuffed subject and engine vocabulary', () => {
  const intro = plazaWorldIntroFor(geminiStyleDetail, '都市')
  assert.ok(intro.background.startsWith('「诡市」'), intro.background)
  assert.ok(!intro.background.startsWith('「诡市」——都市题材的世界。疯狂的王兴润'), 'title must not be the subject')
  assert.ok(!intro.background.includes('资产与负债'), 'engine term sentence dropped from background')
  assert.ok(intro.background.includes('只收因果'), 'human world description survives')
  assert.ok(intro.rules.every((rule) => !rule.includes('资产与负债') && !rule.includes('稳定度')), 'engine rules filtered')
  assert.ok(intro.rules.length <= 3)
  assert.ok(intro.rules.includes('鬼市的规矩只认账，不认人。'))
})

test('④ the intro never leaks the unpublished future', () => {
  const intro = plazaWorldIntroFor(geminiStyleDetail, '都市')
  const whole = `${intro.background}\n${intro.rules.join('\n')}\n${intro.thread}`
  assert.ok(!whole.includes('烧掉整本账簿'), 'endingAnchor stays private')
  assert.ok(!whole.includes('未公开大纲'), 'outline stays private')
  assert.ok(intro.thread.includes('王兴润'))
  assert.ok(intro.thread.includes('「夜市开锣」'))
  assert.ok(intro.thread.includes('「账清」'))
  assert.ok(intro.thread.includes('已经完结') || intro.thread.includes('已完结') || intro.thread.includes('全 24 章'))
})

test('④ a serialising line reports live progress; the author synopsis leads when present', () => {
  const live = plazaWorldIntroFor({ ...geminiStyleDetail, lineStatus: 'serializing', chapterCount: 7 }, '都市')
  assert.ok(live.thread.includes('连载'))
  assert.ok(live.thread.includes('第 7 章'))
  const withSynopsis = plazaWorldIntroFor({ ...geminiStyleDetail, synopsis: '作者亲笔：这是一个关于讨债的故事。' }, '都市')
  assert.equal(withSynopsis.thread, '作者亲笔：这是一个关于讨债的故事。')
})

test('④ the refresh script composes from the stored record alone', () => {
  const record = {
    ...geminiStyleDetail,
    snapshot: {
      worldBible: geminiStyleDetail.worldBible,
      beats: geminiStyleDetail.beats,
    },
  }
  const intro = worldIntroForRecord(record)
  assert.ok(intro.background.includes('诡市'))
  assert.ok(!intro.thread.includes('烧掉整本账簿'))
})
