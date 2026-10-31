// HERO-FLATTEN bake: REQ-71 shipped the free-creation hero as three
// stacked plates (nebula + screen-blended ring + screen-blended dust).
// Every plate is a rectangle with unfeathered edges, so wherever a
// plate's edge lands mid-frame the blend steps visibly (user report
// 2026-10-31: seam lines on the forge hero and on the Xiaohongshu
// poster built from the same plates). This script flattens the stack
// ONCE, offline: the ring plate's alpha is feathered to zero across
// its outer 16% band before the screen blend, so the baked plate is a
// single full-frame image whose edges are the nebula itself. Runtime
// code then shows ONE cover image; the only overlays left are CSS
// gradients/orbits, which have no rectangle to leak.
//
// Run: node scripts/bake-hero-genesis.mjs [--poster-dir <dir>]
// Outputs:
//   public/art/hero-genesis-baked-1122.webp / -640.webp  (platform)
//   <poster-dir>/assets/hero-genesis-baked-poster.webp   (if given)
//   /tmp/hero-bake/*.png                                 (masters)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artDir = path.join(repoRoot, 'public', 'art')
const outTmp = '/tmp/hero-bake'
fs.mkdirSync(outTmp, { recursive: true })
const posterDir = (() => {
  const idx = process.argv.indexOf('--poster-dir')
  return idx >= 0 ? process.argv[idx + 1] : null
})()

const srcDir = path.join(repoRoot, 'scripts', 'hero-genesis-src')
const asDataUrl = (file) => `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}`
const sources = {
  nebula: asDataUrl(path.join(srcDir, 'hero-genesis-nebula-1122.webp')),
  dust: asDataUrl(path.join(srcDir, 'hero-genesis-dust-1122.webp')),
  ring: asDataUrl(path.join(srcDir, 'hero-genesis-ring-640.webp')),
}

// Composition specs mirror the live stacks they replace:
// - platform: the forge card at its canonical 358 CSS px width, scaled
//   ×4.47 to a 1600×1280 master. Nebula cover; dust screen sheet at
//   -12% bleed, alpha .85; ring plate 1036px with its centre at
//   (1252, 277) — the .genre-hero-vortex geometry (252px box at
//   top:-64/right:-48, plate inset 10px) in master pixels.
// - poster: the Xiaohongshu cover at native 1242×1656. Ring centre
//   moved down to (621, 1260) so its bright arc clears the three
//   title lines (which end at y≈774); dust screen sheet alpha .45 on
//   top, as in the original poster stack.
const PLATFORM = { width: 1600, height: 1280, dustBox: [-192, -154, 1984, 1587], dustAlpha: 0.85, ring: { size: 1036, cx: 1252, cy: 277, alpha: 1 }, dustAfterRing: false }
const POSTER = { width: 1242, height: 1656, dustBox: [0, 0, 1242, 1656], dustAlpha: 0.45, ring: { size: 1180, cx: 621, cy: 1260, alpha: 0.96 }, dustAfterRing: true }

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()

async function bake(spec) {
  return page.evaluate(async ({ spec, sources }) => {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
    const [nebula, dust, ring] = await Promise.all([load(sources.nebula), load(sources.dust), load(sources.ring)])
    const { width: W, height: H } = spec
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    const cover = (img, x, y, w, h) => {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
      const dw = img.naturalWidth * s
      const dh = img.naturalHeight * s
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    }
    const drawDust = () => {
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = spec.dustAlpha
      cover(dust, ...spec.dustBox)
    }
    const drawRing = () => {
      // Feather the plate's alpha to zero over its outer 16% band on
      // every side BEFORE blending: a screen blend of the feathered
      // plate meets the base exactly (black = identity) long before
      // the plate's rectangle ends, so no edge can step.
      const S = ring.naturalWidth
      const pc = document.createElement('canvas')
      pc.width = S
      pc.height = S
      const pctx = pc.getContext('2d')
      pctx.drawImage(ring, 0, 0)
      const band = S * 0.16
      pctx.globalCompositeOperation = 'destination-out'
      const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const g = pctx.createLinearGradient(x0, y0, x1, y1)
        g.addColorStop(0, 'rgba(0,0,0,1)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        pctx.fillStyle = g
        pctx.fillRect(rx, ry, rw, rh)
      }
      fade(0, 0, band, 0, 0, 0, band, S) // left
      fade(S, 0, S - band, 0, S - band, 0, band, S) // right
      fade(0, 0, 0, band, 0, 0, S, band) // top
      fade(0, S, 0, S - band, 0, S - band, S, band) // bottom
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = spec.ring.alpha
      const size = spec.ring.size
      ctx.drawImage(pc, spec.ring.cx - size / 2, spec.ring.cy - size / 2, size, size)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    cover(nebula, 0, 0, W, H)
    if (spec.dustAfterRing) {
      drawRing()
      drawDust()
    } else {
      drawDust()
      drawRing()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    return canvas.toDataURL('image/png')
  }, { spec, sources })
}

async function resizeWebp(pngDataUrl, width, height, quality) {
  return page.evaluate(async ({ pngDataUrl, width, height, quality }) => {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = pngDataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/webp', quality)
  }, { pngDataUrl, width, height, quality })
}

function saveDataUrl(dataUrl, file) {
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('wrote', file, fs.statSync(file).size, 'bytes')
}

const platformPng = await bake(PLATFORM)
saveDataUrl(platformPng, path.join(outTmp, 'hero-genesis-baked-master.png'))
saveDataUrl(await resizeWebp(platformPng, 1122, 898, 0.8), path.join(artDir, 'hero-genesis-baked-1122.webp'))
saveDataUrl(await resizeWebp(platformPng, 640, 512, 0.8), path.join(artDir, 'hero-genesis-baked-640.webp'))

if (posterDir) {
  const posterPng = await bake(POSTER)
  saveDataUrl(posterPng, path.join(outTmp, 'hero-genesis-baked-poster-master.png'))
  saveDataUrl(await resizeWebp(posterPng, 1242, 1656, 0.82), path.join(posterDir, 'assets', 'hero-genesis-baked-poster.webp'))
}

await browser.close()
console.log('bake done')
