import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

/**
 * Cover transcode: whatever the image model returns becomes a bounded
 * JPEG before it is stored or served. Vertex's Gemini image model answers
 * with an ~864×1184 PNG of more than a megabyte; a shelf full of those
 * would sink first paint, so the stored cover is capped at 768 px wide
 * and 200 KB, walking a JPEG quality ladder until it fits. Pure-JS codecs
 * (pngjs / jpeg-js) keep the server free of native image tooling.
 */
export const COVER_MAX_BYTES = 200 * 1024
export const COVER_TARGET_WIDTH = 768
const QUALITY_LADDER = [82, 74, 66, 58, 50]

function decode(buffer) {
  if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNG.sync.read(buffer)
    return { data: png.data, width: png.width, height: png.height }
  }
  if (buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true })
    if (!decoded?.width) throw new Error('cover image could not be decoded')
    return { data: decoded.data, width: decoded.width, height: decoded.height }
  }
  throw new Error('cover image format is not supported')
}

/** Bilinear resample of an RGBA buffer; never upscales. */
function resize({ data, width, height }, targetWidth) {
  if (width <= targetWidth) return { data, width, height }
  const targetHeight = Math.max(1, Math.round(height * targetWidth / width))
  const out = new Uint8Array(targetWidth * targetHeight * 4)
  const scaleX = width / targetWidth
  const scaleY = height / targetHeight
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(height - 1.001, y * scaleY)
    const y0 = Math.floor(srcY)
    const y1 = Math.min(height - 1, y0 + 1)
    const fy = srcY - y0
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(width - 1.001, x * scaleX)
      const x0 = Math.floor(srcX)
      const x1 = Math.min(width - 1, x0 + 1)
      const fx = srcX - x0
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

export function transcodeCoverImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('cover image is empty')
  const image = resize(decode(buffer), COVER_TARGET_WIDTH)
  let smallest = null
  for (const quality of QUALITY_LADDER) {
    const encoded = jpeg.encode({ data: Buffer.from(image.data), width: image.width, height: image.height }, quality).data
    if (!smallest || encoded.length < smallest.data.length) smallest = { data: encoded, quality }
    if (encoded.length <= COVER_MAX_BYTES) {
      return { buffer: encoded, contentType: 'image/jpeg', width: image.width, height: image.height, quality }
    }
  }
  // The ladder bottomed out above the cap (an extremely noisy image): serve
  // the smallest encode rather than failing the cover outright.
  return { buffer: smallest.data, contentType: 'image/jpeg', width: image.width, height: image.height, quality: smallest.quality }
}
