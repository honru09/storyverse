import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

/**
 * Avatar derivatives (REQ-73): the presentation normalisation moved
 * INTO the pixels. Seven rounds of CSS cropping (REQ-28/35/44/48/
 * 62/64/70) kept failing on real devices for one structural reason —
 * CSS does not know where the subject or the face is in an arbitrary
 * painting, so every contain/cover/transform recipe was a guess that
 * some real portrait broke. The fix bakes the answer into the asset:
 * when a portrait lands (generation, repaint, ops import) — and,
 * lazily, the first time a legacy portrait is read — the server
 * derives two normalised siblings of the stored painting:
 *
 *   portrait — the painting at an exact 3:4. The deficient dimension
 *     is padded with the painting's OWN edge tones (the REQ-70
 *     sampling, moved server-side), so the subject is never cropped
 *     and the pad is the picture's own colour, not a foreign fill.
 *   face — a 288×288 square carrying the head at a fixed scale: the
 *     face is located by a skin-tone cluster analysis over a
 *     matte-stripped canvas (see detectFaceWindow), and the crop
 *     window is sized from the face itself, so a chibi head and a
 *     realistic head land in tiles at the same presence. Detection
 *     failure falls back to the canvas top-centre window — still
 *     baked, still square, still consistent.
 *
 * The UI then does the dumbest possible thing everywhere: a 3:4
 * frame with one cover image for the showcase, and the face square
 * with plain cover in every small slot. No transforms, no anchors.
 *
 * Derivatives live in their own image slots next to the painting
 * (`<slot>:portrait` / `<slot>:face`, following avatar-store's slot
 * convention), stamped with the source painting's version stamp; a
 * stale or missing derivative is rebuilt on read and written back
 * (the normalizedStoredImage healing pattern), so every stored
 * painting converges without a migration.
 */

export const DERIVATIVE_KINDS = Object.freeze(['portrait', 'face'])
export const FACE_DERIVATIVE_SIZE = 288
export const PORTRAIT_MAX_BYTES = 200 * 1024
export const FACE_MAX_BYTES = 96 * 1024

export const derivativeSlotFor = (slot, kind) => `${slot}:${kind}`

/** The stamp a derivative is built against; any change rebuilds it. */
export function derivativeSourceStamp(record) {
  return `${record?.version ?? 0}|${record?.updatedAt ?? ''}|${record?.bandChecked ? 1 : 0}`
}

// --- decoding (same two formats the portrait pipeline stores) ---

function decode(buffer) {
  if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNG.sync.read(buffer)
    return { data: png.data, width: png.width, height: png.height }
  }
  if (buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true })
    if (!decoded?.width) return null
    return { data: decoded.data, width: decoded.width, height: decoded.height }
  }
  return null
}

// --- edge tones (server port of the REQ-70 sampler) ---

/** Mean RGB of the four edge bands of a decoded image. */
export function sampleEdgeColorsRgb(image, bandRatio = 0.05) {
  const { data, width, height } = image || {}
  if (!data || !width || !height) return null
  const bandX = Math.max(1, Math.round(width * bandRatio))
  const bandY = Math.max(1, Math.round(height * bandRatio))
  const sum = (x0, y0, x1, y1) => {
    let r = 0; let g = 0; let b = 0; let n = 0
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1
      }
    }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0]
  }
  const top = sum(0, 0, width, bandY)
  const bottom = sum(0, height - bandY, width, height)
  const left = sum(0, 0, bandX, height)
  const right = sum(width - bandX, 0, width, height)
  const average = [0, 1, 2].map((i) => Math.round((top[i] + bottom[i] + left[i] + right[i]) / 4))
  return { top, bottom, left, right, average }
}

// --- face location (constants measured on the production portraits;
// see AVATAR-DERIVATIVES.md for the per-painting evidence table) ---

export const FACE_GRID_WIDTH = 192
export const FACE_FRACTION_OF_WINDOW = 0.55
export const FACE_WIDTH_FRACTION_OF_WINDOW = 0.60
export const FACE_TOP_MARGIN_OF_WINDOW = 0.30
export const FALLBACK_WINDOW_OF_CANVAS = 0.52

function downscaleToGrid({ data, width, height }, gridWidth) {
  const gridHeight = Math.max(1, Math.round(height * gridWidth / width))
  const out = new Uint8Array(gridWidth * gridHeight * 4)
  const scaleX = width / gridWidth
  const scaleY = height / gridHeight
  for (let y = 0; y < gridHeight; y += 1) {
    const y0 = Math.floor(y * scaleY)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY))
    for (let x = 0; x < gridWidth; x += 1) {
      const x0 = Math.floor(x * scaleX)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX))
      let r = 0; let g = 0; let b = 0; let n = 0
      for (let yy = y0; yy < y1 && yy < height; yy += 1) {
        for (let xx = x0; xx < x1 && xx < width; xx += 1) {
          const i = (yy * width + xx) * 4
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1
        }
      }
      const o = (y * gridWidth + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255
    }
  }
  return { data: out, width: gridWidth, height: gridHeight }
}

const colorDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * The canvas the face hunt runs on. Paintings that arrive inside a
 * near-uniform matte (the model loves baking a white frame around a
 * poster) get the matte stripped: the canvas is the bounding box of
 * the content inside it. Full-bleed paintings keep the whole frame.
 * Detection is corner-based — all four corners must be near-uniform
 * and alike — so a busy scene poster never loses its edges.
 */
export function detectCanvas(grid) {
  const { data, width: W, height: H } = grid
  const full = { x0: 0, y0: 0, x1: W, y1: H }
  const patchW = Math.max(2, Math.round(W * 0.10))
  const patchH = Math.max(2, Math.round(H * 0.06))
  const patch = (x0, y0) => {
    const cols = []
    for (let y = y0; y < y0 + patchH; y += 1) {
      for (let x = x0; x < x0 + patchW; x += 1) {
        const i = (y * W + x) * 4
        cols.push([data[i], data[i + 1], data[i + 2]])
      }
    }
    const med = [0, 1, 2].map((c) => medianOf(cols.map((col) => col[c])))
    const near = cols.filter((col) => colorDistance(col, med) <= 16).length / cols.length
    return { med, near }
  }
  const corners = [patch(0, 0), patch(W - patchW, 0), patch(0, H - patchH), patch(W - patchW, H - patchH)]
  const matte = [0, 1, 2].map((c) => medianOf(corners.map((corner) => corner.med[c])))
  const uniform = Math.min(...corners.map((corner) => corner.near))
  const alike = Math.max(...corners.map((corner) => colorDistance(corner.med, matte)))
  if (uniform < 0.88 || alike > 22) return { canvas: full, matte: null }
  const far = (x, y) => {
    const i = (y * W + x) * 4
    return colorDistance([data[i], data[i + 1], data[i + 2]], matte) > 30
  }
  let x0 = W; let y0 = H; let x1 = -1; let y1 = -1
  for (let x = 0; x < W; x += 1) {
    let n = 0
    for (let y = 0; y < H; y += 1) if (far(x, y)) n += 1
    if (n >= H * 0.03) { if (x < x0) x0 = x; if (x > x1) x1 = x }
  }
  for (let y = 0; y < H; y += 1) {
    let n = 0
    for (let x = 0; x < W; x += 1) if (far(x, y)) n += 1
    if (n >= W * 0.03) { if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0 || y1 < 0) return { canvas: full, matte }
  return { canvas: { x0, y0, x1: x1 + 1, y1: y1 + 1 }, matte }
}

function hsvOf(r, g, b) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max ? delta / max : 0, max]
}

/**
 * Skin-tone mask over the canvas's top band. The hue cap at 40°
 * keeps mustard-gold backdrop blocks out; saturation up to 0.92
 * keeps a saturated orange chibi head in.
 */
export function skinMask(grid, canvas) {
  const { data, width: W, height: H } = grid
  const mask = new Uint8Array(W * H)
  const yEnd = Math.floor(canvas.y0 + (canvas.y1 - canvas.y0) * 0.45)
  for (let y = canvas.y0; y < yEnd; y += 1) {
    for (let x = canvas.x0; x < canvas.x1; x += 1) {
      const i = (y * W + x) * 4
      const [h, s, v] = hsvOf(data[i], data[i + 1], data[i + 2])
      if (h >= 3 && h <= 40 && s >= 0.05 && s <= 0.92 && v >= 0.24) mask[y * W + x] = 1
    }
  }
  return mask
}

function connectedComponents(mask, W, H) {
  const seen = new Uint8Array(W * H)
  const out = []
  for (let i = 0; i < W * H; i += 1) {
    if (!mask[i] || seen[i]) continue
    const stack = [i]
    seen[i] = 1
    let n = 0; let x0 = W; let y0 = H; let x1 = 0; let y1 = 0
    while (stack.length) {
      const p = stack.pop()
      const px = p % W; const py = Math.floor(p / W)
      n += 1
      if (px < x0) x0 = px; if (px > x1) x1 = px
      if (py < y0) y0 = py; if (py > y1) y1 = py
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      for (const [dx, dy] of neighbours) {
        const nx = px + dx; const ny = py + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q) }
      }
    }
    out.push({ n, x0, y0, x1: x1 + 1, y1: y1 + 1 })
  }
  return out
}

/**
 * Locate the face window in a decoded image. Returns full-resolution
 * coordinates: the canvas that was hunted on, the face box that won
 * (null on fallback), and the square window to crop. The scoring is
 * deliberately plural — area alone crowns flames and backdrop
 * blocks; gradient density (faces carry features, flat blocks do
 * not), fill ratio, centrality, topness and an edge-touch penalty
 * vote together. Every constant here was measured against the six
 * production portraits in AVATAR-DERIVATIVES.md.
 */
export function detectFaceWindow(image) {
  const { width, height } = image
  const grid = downscaleToGrid(image, Math.min(FACE_GRID_WIDTH, width))
  const { canvas: gridCanvas } = detectCanvas(grid)
  const mask = skinMask(grid, gridCanvas)
  const comps = connectedComponents(mask, grid.width, grid.height)
  const cw = gridCanvas.x1 - gridCanvas.x0
  const ch = gridCanvas.y1 - gridCanvas.y0
  const canvasArea = cw * ch
  const luminance = (x, y) => {
    const i = (y * grid.width + x) * 4
    return 0.2126 * grid.data[i] + 0.7152 * grid.data[i + 1] + 0.0722 * grid.data[i + 2]
  }
  const gradientOf = (c) => {
    let sum = 0; let n = 0
    for (let y = c.y0; y < c.y1 - 1; y += 2) {
      for (let x = c.x0; x < c.x1 - 1; x += 2) {
        sum += Math.abs(luminance(x + 1, y) - luminance(x, y)) + Math.abs(luminance(x, y + 1) - luminance(x, y))
        n += 2
      }
    }
    return n ? sum / n : 0
  }
  const scored = []
  for (const raw of comps) {
    let c = raw
    const rawW = raw.x1 - raw.x0
    const rawH = raw.y1 - raw.y0
    // A much-taller-than-wide cluster is a face bleeding into a pale
    // torso (a white hoodie reads as skin): keep its head-length top.
    if (rawH > rawW * 1.45) {
      const y1 = raw.y0 + Math.round(rawW * 1.45)
      let n = 0
      for (let y = raw.y0; y < y1; y += 1) {
        for (let x = raw.x0; x < raw.x1; x += 1) if (mask[y * grid.width + x]) n += 1
      }
      c = { ...raw, y1, n }
    }
    const w = c.x1 - c.x0
    const h = c.y1 - c.y0
    const aspect = w / h
    const cxFrac = ((c.x0 + c.x1) / 2 - gridCanvas.x0) / cw
    const cyFrac = ((c.y0 + c.y1) / 2 - gridCanvas.y0) / ch
    const topFrac = (c.y0 - gridCanvas.y0) / ch
    const fill = c.n / (w * h)
    const grad = gradientOf(c)
    // The width cap exists to reject skin-toned BACKDROP bands —
    // and a band spans the canvas edge to edge. A real face on a
    // tight person-canvas legitimately runs wider (the owner's
    // silver-haired portrait measures 0.49 after the store-time
    // transcode merges a hairline fringe into the cluster), so the
    // strict cap binds only edge-to-edge clusters.
    const spansCanvas = c.x0 <= gridCanvas.x0 + 1 && c.x1 >= gridCanvas.x1 - 1
    const widthOk = spansCanvas ? (w / cw) <= 0.46 : (w / cw) <= 0.62
    const ok = c.n >= canvasArea * 0.0012
      && aspect >= 0.5 && aspect <= 1.9
      && widthOk
      && cyFrac <= 0.34
      && cxFrac >= 0.15 && cxFrac <= 0.85
      && (h / ch) >= 0.03 && (h / ch) <= 0.5
    if (!ok) continue
    let score = Math.sqrt(c.n)
      * (0.55 + 0.45 * Math.min(1, grad / 16))
      * Math.max(0.55, 1.45 - 1.9 * topFrac)
      * Math.max(0.3, 1 - Math.abs(cxFrac - 0.5) * 1.6)
      * (0.35 + 0.65 * fill)
    // A wide cluster glued to the canvas top is backdrop, not a face.
    if ((c.y0 - gridCanvas.y0) <= ch * 0.01 && (w / cw) >= 0.30) score *= 0.5
    scored.push({ ...c, score })
  }
  scored.sort((a, b) => b.score - a.score)
  const scaleX = width / grid.width
  const scaleY = height / grid.height
  const canvas = {
    x0: Math.round(gridCanvas.x0 * scaleX), y0: Math.round(gridCanvas.y0 * scaleY),
    x1: Math.round(gridCanvas.x1 * scaleX), y1: Math.round(gridCanvas.y1 * scaleY),
  }
  const canvasW = canvas.x1 - canvas.x0
  const canvasH = canvas.y1 - canvas.y0
  const clampWindow = (cx, cy, side) => {
    const s = Math.min(side, canvasW, canvasH)
    let x0 = cx - s / 2
    let y0 = cy - s / 2
    x0 = Math.max(canvas.x0, Math.min(x0, canvas.x1 - s))
    y0 = Math.max(canvas.y0, Math.min(y0, canvas.y1 - s))
    return { x0: Math.round(x0), y0: Math.round(y0), side: Math.round(s) }
  }
  if (scored.length === 0) {
    const side = canvasW * FALLBACK_WINDOW_OF_CANVAS
    const win = clampWindow((canvas.x0 + canvas.x1) / 2, canvas.y0 + side / 2, side)
    return { canvas, face: null, window: win, fallback: true }
  }
  const winner = scored[0]
  const face = {
    x0: Math.round(winner.x0 * scaleX), y0: Math.round(winner.y0 * scaleY),
    x1: Math.round(winner.x1 * scaleX), y1: Math.round(winner.y1 * scaleY),
  }
  const faceW = face.x1 - face.x0
  const faceH = face.y1 - face.y0
  const side = Math.max(faceH / FACE_FRACTION_OF_WINDOW, faceW / FACE_WIDTH_FRACTION_OF_WINDOW)
  const cx = (face.x0 + face.x1) / 2
  // The window's top sits a fixed margin above the face's top, so
  // hair (and one famous leaf) stay in frame; clamp-shifting into
  // the canvas keeps that margin wherever the canvas allows it.
  let winSide = Math.min(side, canvasW, canvasH)
  let x0 = Math.max(canvas.x0, Math.min(cx - winSide / 2, canvas.x1 - winSide))
  let y0 = Math.max(canvas.y0, Math.min(face.y0 - winSide * FACE_TOP_MARGIN_OF_WINDOW, canvas.y1 - winSide))
  return {
    canvas,
    face,
    window: { x0: Math.round(x0), y0: Math.round(y0), side: Math.round(winSide) },
    fallback: false,
  }
}

// --- composition ---

/** Bilinear resample of an RGBA image to an exact size. */
export function resizeImage({ data, width, height }, targetWidth, targetHeight) {
  if (width === targetWidth && height === targetHeight) return { data, width, height }
  const out = new Uint8Array(targetWidth * targetHeight * 4)
  const scaleX = width / targetWidth
  const scaleY = height / targetHeight
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(height - 1.001, (y + 0.5) * scaleY - 0.5)
    const y0 = Math.max(0, Math.floor(srcY))
    const y1 = Math.min(height - 1, y0 + 1)
    const fy = Math.min(1, Math.max(0, srcY - y0))
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(width - 1.001, (x + 0.5) * scaleX - 0.5)
      const x0 = Math.max(0, Math.floor(srcX))
      const x1 = Math.min(width - 1, x0 + 1)
      const fx = Math.min(1, Math.max(0, srcX - x0))
      const target = (y * targetWidth + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const top = data[(y0 * width + x0) * 4 + channel] * (1 - fx) + data[(y0 * width + x1) * 4 + channel] * fx
        const bottom = data[(y1 * width + x0) * 4 + channel] * (1 - fx) + data[(y1 * width + x1) * 4 + channel] * fx
        out[target + channel] = Math.round(top * (1 - fy) + bottom * fy)
      }
      out[target + 3] = 255
    }
  }
  return { data: out, width: targetWidth, height: targetHeight }
}

function encodeJpeg(image, maxBytes, ladder) {
  let smallest = null
  for (const quality of ladder) {
    const encoded = jpeg.encode({ data: Buffer.from(image.data), width: image.width, height: image.height }, quality).data
    if (!smallest || encoded.length < smallest.length) smallest = encoded
    if (encoded.length <= maxBytes) return { buffer: encoded, quality }
  }
  return { buffer: smallest, quality: ladder[ladder.length - 1] }
}

/**
 * The portrait derivative: the painting at an exact 3:4, the
 * deficient dimension padded with the painting's own edge tones.
 * An already-exact painting is carried over byte for byte.
 */
export function composePortraitDerivative(image) {
  const { data, width, height } = image
  const targetW = Math.max(width, Math.round(height * 3 / 4))
  const targetH = Math.max(height, Math.round(width * 4 / 3))
  // Both maxes can grow only one dimension for any real ratio; when
  // both grew the ratio was already 3:4 within rounding.
  const padW = targetW - width
  const padH = targetH - height
  if (padW === 0 && padH === 0) return null
  if (padW > 0 && padH > 0) return null
  const edges = sampleEdgeColorsRgb(image)
  const out = new Uint8Array(targetW * targetH * 4)
  const fillAll = ([r, g, b]) => {
    for (let i = 0; i < targetW * targetH; i += 1) {
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255
    }
  }
  const fillRect = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * targetW + x) * 4
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255
      }
    }
  }
  fillAll(edges.average)
  const offX = Math.floor(padW / 2)
  const offY = Math.floor(padH / 2)
  if (padW > 0) {
    fillRect(0, 0, offX + (padW % 2), targetH, edges.left)
    fillRect(offX + width, 0, targetW, targetH, edges.right)
  }
  if (padH > 0) {
    fillRect(0, 0, targetW, offY + (padH % 2), edges.top)
    fillRect(0, offY + height, targetW, targetH, edges.bottom)
  }
  for (let y = 0; y < height; y += 1) {
    const src = data.subarray(y * width * 4, (y + 1) * width * 4)
    out.set(src, ((y + offY) * targetW + offX) * 4)
  }
  return { data: out, width: targetW, height: targetH }
}

/**
 * Build both derivatives of a stored painting. Returns null only
 * when the bytes cannot be decoded at all — callers then serve the
 * original, so a derivative failure can never break a portrait read.
 */
export function buildAvatarDerivatives(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null
  let image
  try {
    image = decode(buffer)
  } catch {
    return null
  }
  if (!image) return null
  const detection = detectFaceWindow(image)
  const win = detection.window
  const faceCrop = {
    data: (() => {
      const out = new Uint8Array(win.side * win.side * 4)
      for (let y = 0; y < win.side; y += 1) {
        const src = image.data.subarray(((win.y0 + y) * image.width + win.x0) * 4, ((win.y0 + y) * image.width + win.x0 + win.side) * 4)
        out.set(src, y * win.side * 4)
      }
      return out
    })(),
    width: win.side,
    height: win.side,
  }
  const faceImage = resizeImage(faceCrop, FACE_DERIVATIVE_SIZE, FACE_DERIVATIVE_SIZE)
  const faceEncoded = encodeJpeg(faceImage, FACE_MAX_BYTES, [85, 78, 70, 62])
  const composed = composePortraitDerivative(image)
  let portrait
  if (composed === null) {
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
    portrait = { buffer, contentType: isPng ? 'image/png' : 'image/jpeg', width: image.width, height: image.height, padded: 0 }
  } else {
    const encoded = encodeJpeg(composed, PORTRAIT_MAX_BYTES, [82, 74, 66, 58, 50])
    portrait = {
      buffer: encoded.buffer,
      contentType: 'image/jpeg',
      width: composed.width,
      height: composed.height,
      padded: Math.max(composed.width - image.width, composed.height - image.height),
    }
  }
  return {
    portrait,
    face: {
      buffer: faceEncoded.buffer,
      contentType: 'image/jpeg',
      width: FACE_DERIVATIVE_SIZE,
      height: FACE_DERIVATIVE_SIZE,
    },
    meta: {
      canvas: detection.canvas,
      face: detection.face,
      window: detection.window,
      fallback: detection.fallback,
      sourceWidth: image.width,
      sourceHeight: image.height,
    },
  }
}

/** The face derivative alone (profile-picture uploads). */
export function buildFaceDerivative(buffer) {
  const built = buildAvatarDerivatives(buffer)
  return built ? { ...built.face, meta: built.meta } : null
}

// --- storage: build-on-read healing over the avatar image store ---

function derivativeRecord(uid, sourceSlot, kind, built, stamp) {
  const part = kind === 'portrait' ? built.portrait : built.face
  return {
    uid,
    slot: derivativeSlotFor(sourceSlot, kind),
    kind,
    sourceSlot,
    sourceStamp: stamp,
    contentType: part.contentType,
    image: part.buffer.toString('base64'),
    bytes: part.buffer.length,
    width: part.width,
    height: part.height,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Build both derivatives of a stored painting and write their
 * records. Used by the generation path (bake at store time) and by
 * the read path below. Returns the build, or null when the bytes
 * cannot be decoded.
 */
export async function storeAvatarDerivatives(store, uid, sourceSlot, sourceRecord) {
  if (!store || !sourceRecord?.image) return null
  const built = buildAvatarDerivatives(Buffer.from(sourceRecord.image, 'base64'))
  if (!built) return null
  const stamp = derivativeSourceStamp(sourceRecord)
  for (const each of DERIVATIVE_KINDS) {
    await store.putImage(uid, derivativeSlotFor(sourceSlot, each), derivativeRecord(uid, sourceSlot, each, built, stamp))
  }
  return built
}

/**
 * The derivative of one stored painting, built and written back
 * when missing or stale. `store` is the avatar image store (memory
 * or Firestore shape). Returns { buffer, contentType } or null —
 * null always means "serve the original instead".
 */
export async function ensureAvatarDerivative(store, uid, sourceSlot, sourceRecord, kind) {
  if (!store || !sourceRecord?.image || !DERIVATIVE_KINDS.includes(kind)) return null
  const stamp = derivativeSourceStamp(sourceRecord)
  try {
    const existing = await store.getImage(uid, derivativeSlotFor(sourceSlot, kind))
    if (existing?.image && existing.sourceStamp === stamp) {
      return { buffer: Buffer.from(existing.image, 'base64'), contentType: existing.contentType || 'image/jpeg' }
    }
    const built = await storeAvatarDerivatives(store, uid, sourceSlot, sourceRecord)
    if (!built) return null
    const part = kind === 'portrait' ? built.portrait : built.face
    return { buffer: part.buffer, contentType: part.contentType }
  } catch {
    return null
  }
}

/**
 * The face derivative of an uploaded profile picture, over the
 * social store's picture-face record. Same contract as above.
 */
export async function ensurePictureFaceDerivative(store, uid, pictureRecord) {
  if (!store || !pictureRecord?.image) return null
  const stamp = `upload|${pictureRecord.updatedAt ?? ''}|${pictureRecord.image.length}`
  try {
    const existing = await store.getPictureFace(uid)
    if (existing?.image && existing.sourceStamp === stamp) {
      return { buffer: Buffer.from(existing.image, 'base64'), contentType: existing.contentType || 'image/jpeg' }
    }
    const built = buildFaceDerivative(Buffer.from(pictureRecord.image, 'base64'))
    if (!built) return null
    await store.putPictureFace(uid, {
      uid,
      kind: 'face',
      sourceStamp: stamp,
      contentType: built.contentType,
      image: built.buffer.toString('base64'),
      bytes: built.buffer.length,
      width: built.width,
      height: built.height,
      updatedAt: new Date().toISOString(),
    })
    return { buffer: built.buffer, contentType: built.contentType }
  } catch {
    return null
  }
}
