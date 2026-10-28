/**
 * One-time ops: replace the OFFICIAL account's main-avatar portrait
 * with a new poster painting produced outside the app (POSTER-AVATAR
 * batch), without spending a generation or touching the daily quota.
 *
 *   node scripts/set-official-avatar-poster.mjs <image-file> [--dry-run] [--uid <uid>]
 *
 * The write replicates, step for step, what the avatar service's
 * repaint path (`produce` in server/avatar.js) persists when a new
 * portrait lands:
 *   - the incoming file goes through the same store-time transcode
 *     (`transcodePortraitImage`: baked-in top band trimmed, then the
 *     bounded-JPEG cover transcode), so the stored bytes have exactly
 *     the shape a generated portrait would have;
 *   - the painting currently at the main avatar's 'current' slot is
 *     rotated into the 'previous' slot untouched;
 *   - the new image record is written at 'current' in the service's
 *     own shape ({ uid, slot, version, contentType, image, bytes,
 *     model, updatedAt }) with the version bumped by one;
 *   - the profile's portrait state is committed as
 *     { status: 'ready', version, hasPrevious, updatedAt } through
 *     the collection write, which also refreshes the legacy `avatar`
 *     mirror every pre-collection reader uses.
 * Two deliberate differences from an in-app repaint, both because
 * this is an operator replacing an asset, not a reader generating
 * one: the daily generation counter is NOT incremented (no quota is
 * spent), and the image record's `model` is stamped
 * 'manual-import' instead of the image model — the ledger should
 * say where the painting actually came from. The lazy band-heal on
 * the serving paths needs no help: the transcode already trimmed
 * any band, and the first read stamps `bandChecked` as usual.
 *
 * `--dry-run` prints the current portrait state and exactly what
 * would be written, and writes nothing. The script is idempotent
 * in shape — re-running it rotates the poster it set into
 * 'previous' and bumps the version again — so run it once per
 * poster, deliberately.
 */
import { readFile } from 'node:fs/promises'
import { createAvatarStore, imageSlotFor } from '../server/avatar-store.js'
import { transcodePortraitImage } from '../server/portrait-image.js'

export const OFFICIAL_UID = 'username:storyweave'
export const POSTER_IMPORT_MODEL = 'manual-import'

const dryRun = process.argv.includes('--dry-run')

function argValue(flag) {
  const at = process.argv.indexOf(flag)
  if (at !== -1 && process.argv[at + 1]) return process.argv[at + 1]
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`))
  return inline ? inline.slice(flag.length + 1) : null
}

const imagePath = process.argv.slice(2).find((arg) => !arg.startsWith('--') && arg !== argValue('--uid'))

/**
 * The replacement itself, over any avatar store (the tests drive it
 * with the memory store; production runs the Firestore one). With
 * `dryRun` set it performs every read and the transcode, then stops
 * before the first write. Returns a summary of the before/after
 * portrait state.
 */
export async function setMainPortrait({ store, uid, buffer, dryRun: planOnly = false, now = () => new Date(), transcode = transcodePortraitImage }) {
  if (!store) throw new Error('化身存储未配置：需要 DATA_STORE=firestore 与 GOOGLE_CLOUD_PROJECT（或 Cloud Run 环境）。')
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('立绘图片为空，无法写入。')
  const collection = await store.getCollection(uid)
  if (!collection || collection.avatars.length === 0) throw new Error(`账号 ${uid} 还没有化身记录，无可替换的主化身。`)
  const main = collection.avatars.find((item) => item.id === collection.mainId) || collection.avatars[0]
  const currentSlot = imageSlotFor(collection, main.id, 'current')
  const previousSlot = imageSlotFor(collection, main.id, 'previous')
  const currentRecord = await store.getImage(uid, currentSlot)
  const image = transcode(buffer)
  const version = (Number.isInteger(main.portrait?.version) ? main.portrait.version : 0) + 1
  const summary = {
    uid,
    avatarId: main.id,
    avatarName: main.name,
    before: {
      portraitStatus: main.portrait?.status || 'none',
      version: Number.isInteger(main.portrait?.version) ? main.portrait.version : 0,
      hasPrevious: main.portrait?.hasPrevious === true,
      currentBytes: currentRecord?.image ? (currentRecord.bytes ?? null) : null,
      currentContentType: currentRecord?.contentType || null,
    },
    after: {
      version,
      bytes: image.buffer.length,
      contentType: image.contentType,
      hasPrevious: Boolean(currentRecord?.image),
    },
    written: false,
  }
  if (planOnly) return summary
  const timestamp = now().toISOString()
  if (currentRecord?.image) {
    await store.putImage(uid, previousSlot, { ...currentRecord, slot: previousSlot })
  }
  await store.putImage(uid, currentSlot, {
    uid,
    slot: currentSlot,
    version,
    contentType: image.contentType,
    image: image.buffer.toString('base64'),
    bytes: image.buffer.length,
    model: POSTER_IMPORT_MODEL,
    updatedAt: timestamp,
  })
  const nextMain = {
    ...main,
    portrait: { status: 'ready', version, hasPrevious: Boolean(currentRecord?.image), updatedAt: timestamp },
    updatedAt: timestamp,
  }
  await store.putCollection(uid, {
    mainId: collection.mainId,
    avatars: collection.avatars.map((item) => (item.id === main.id ? nextMain : item)),
  })
  summary.written = true
  return summary
}

async function main() {
  if (!imagePath) {
    console.error('用法：node scripts/set-official-avatar-poster.mjs <image-file> [--dry-run] [--uid <uid>]')
    process.exitCode = 1
    return
  }
  const uid = argValue('--uid') || OFFICIAL_UID
  const buffer = await readFile(imagePath)
  const store = createAvatarStore({ env: process.env })
  const summary = await setMainPortrait({ store, uid, buffer, dryRun })
  const { before, after } = summary
  console.log(`${dryRun ? '[dry-run] ' : ''}${uid} 主化身《${summary.avatarName}》（${summary.avatarId}）`)
  console.log(`  现立绘：status=${before.portraitStatus} version=${before.version} ${before.currentBytes === null ? '无图' : `${before.currentBytes} bytes ${before.currentContentType}`} hasPrevious=${before.hasPrevious}`)
  console.log(`  新海报：${imagePath} ${buffer.length} bytes → 转码后 ${after.bytes} bytes ${after.contentType}`)
  console.log(`  将写入：current 槽 version=${after.version}；旧图${after.hasPrevious ? '轮转到 previous 槽' : '不存在，无轮转'}；档案 portrait 同步为 ready/${after.version}`)
  console.log(dryRun ? 'done: dry run — nothing written' : `done: portrait replaced at version ${after.version}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
