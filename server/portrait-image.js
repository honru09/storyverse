import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { transcodeCoverImage } from './cover-image.js'

/**
 * Portrait top-band normalisation (DEDUP-FIX §40 ③a).
 *
 * The image model sometimes bakes a solid near-black band into the
 * TOP of a generated portrait. The band is part of the stored pixels,
 * so every surface that crops from the top (the face-anchored tiles)
 * faithfully showed it as a black bar — the client was innocent; the
 * asset was not. The fix therefore lives at the asset layer:
 *
 *  - generation: the avatar pipeline trims the band before the
 *    normal cover transcode stores the image;
 *  - legacy rows: the two serving paths lazily heal a stored image
 *    on first read and write the trimmed bytes back (see
 *    `normalizedStoredImage`), so existing portraits clean
 *    themselves up without a migration.
 *
 * Detection is deliberately conservative — a row only counts as band
 * when it is near-black across its whole width (low MEAN and low MAX
 * luminance, sampled). A genuinely dark painting (deep-blue night
 * scene, mean luminance ≈ 22) never qualifies, and a composition
 * whose top quarter-plus is black is treated as intentional and left
 * alone: trimming is capped, never open-ended.
 */

export const BAND_ROW_MEAN_MAX = 18
export const BAND_ROW_MAX_MAX = 30
export const BAND_MIN_FRACTION = 0.03
export const BAND_MAX_FRACTION = 0.24

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Count the contiguous near-black rows at the top of an RGBA image.
 * Pure function over decoded pixels — the unit tests drive it with
 * synthetic buffers.
 */
export function countTopBandRows({ data, width, height }) {
  if (!data || !width || !height) return 0
  const stepX = Math.max(1, Math.floor(width / 48))
  let rows = 0
  for (let y = 0; y < height; y += 1) {
    let sum = 0
    let max = 0
    let samples = 0
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * 4
      const value = luminance(data[offset], data[offset + 1], data[offset + 2])
      sum += value
      if (value > max) max = value
      samples += 1
    }
    const mean = samples ? sum / samples : 255
    if (mean <= BAND_ROW_MEAN_MAX && max <= BAND_ROW_MAX_MAX) rows += 1
    else break
  }
  return rows
}

/** Band height worth trimming, or 0 when the top is honest content. */
export function topBandCrop({ data, width, height }) {
  const rows = countTopBandRows({ data, width, height })
  if (rows === 0) return 0
  const fraction = rows / height
  if (fraction < BAND_MIN_FRACTION) return 0
  if (fraction > BAND_MAX_FRACTION) return 0
  return rows
}

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

/**
 * Trim a baked-in top band from an image buffer. Returns
 * { buffer (PNG), rows } when a band was cut, null when the image is
 * clean, over the cap, or undecodable — callers fall back to the
 * original bytes, so a decode hiccup can never break generation.
 */
export function trimTopBandFromImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null
  let image
  try {
    image = decode(buffer)
  } catch {
    return null
  }
  if (!image) return null
  const rows = topBandCrop(image)
  if (rows === 0) return null
  const { data, width, height } = image
  const croppedHeight = height - rows
  const cropped = Buffer.alloc(width * croppedHeight * 4)
  cropped.set(data.subarray(rows * width * 4))
  const png = new PNG({ width, height: croppedHeight })
  png.data.set(cropped)
  return { buffer: PNG.sync.write(png), rows }
}

/**
 * The full store-time portrait transcode: trim any baked-in top band,
 * then the standard bounded-JPEG cover transcode. Used as the avatar
 * pipeline's default transcode.
 */
export function transcodePortraitImage(buffer) {
  const trimmed = trimTopBandFromImage(buffer)
  return transcodeCoverImage(trimmed?.buffer ?? buffer)
}

/**
 * Lazy legacy healing for the serving paths: a stored image record
 * that has never been band-checked is checked on first read; a found
 * band is trimmed, re-transcoded and written back, and clean images
 * are stamped so the check runs once per image. Any failure serves
 * the original bytes — healing must never break a portrait read.
 * Returns { buffer, contentType } ready to serve.
 */
export async function normalizedStoredImage(store, uid, slot, record) {
  const original = {
    buffer: Buffer.from(record.image, 'base64'),
    contentType: record.contentType || 'image/jpeg',
  }
  if (!store || record.bandChecked) return original
  try {
    const trimmed = trimTopBandFromImage(original.buffer)
    if (!trimmed) {
      await store.putImage(uid, slot, { ...record, bandChecked: true })
      return original
    }
    const image = transcodeCoverImage(trimmed.buffer)
    await store.putImage(uid, slot, {
      ...record,
      image: image.buffer.toString('base64'),
      contentType: image.contentType,
      bytes: image.buffer.length,
      bandChecked: true,
    })
    return { buffer: image.buffer, contentType: image.contentType }
  } catch {
    return original
  }
}
