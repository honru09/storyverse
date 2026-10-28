/**
 * One-time ops: paint the dedicated cover the OFFICIAL example line
 * never got, so its plaza / bookstore / profile cards stop falling
 * back to the shared world artwork (COVER-FIX §41: a book's own
 * cover outranks every fallback, but only once it exists).
 *
 *   node scripts/generate-official-cover.mjs [--dry-run] [--force] [--publication <id>]
 *
 * Nothing here re-implements generation: the payload is assembled
 * from the publication record's own already-public fields (title /
 * genre / the snapshot's config + world bible premise — the same
 * materials the client sends for a reader's own book, see
 * `coverPayloadFor` in src/cover.js) and handed to the cover
 * service's `request`, so the prompt, the image model, the
 * transcode and the stored record shape are the production ones,
 * and the painting lands in the cover store under the key every
 * reader resolves live: (authorUid, sourceStoryId). The generation
 * counts against the official account's daily cover quota, exactly
 * like an in-app request — that is the pipeline's own ledger, and
 * five-a-day is plenty for a one-off.
 *
 * A publication that already has a cover is skipped (the painting
 * is live the moment it exists; nothing needs re-publishing);
 * `--force` repaints anyway. `--dry-run` prints the current state
 * and what would happen, and calls no model. Default publication
 * is the official example line, pub-ff498576-b52.
 */
import { createPlazaStore } from '../server/plaza-store.js'
import { createCoverStore } from '../server/cover-store.js'
import { createCoverService } from '../server/cover.js'

export const OFFICIAL_PUBLICATION_ID = 'pub-ff498576-b52'

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

function argValue(flag) {
  const at = process.argv.indexOf(flag)
  if (at !== -1 && process.argv[at + 1]) return process.argv[at + 1]
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`))
  return inline ? inline.slice(flag.length + 1) : null
}

/**
 * The cover request payload for a stored publication, mirroring
 * `coverPayloadFor` (src/cover.js) field for field — except the
 * materials come from the publication snapshot instead of the
 * author's private library copy, so the script never needs the
 * source story itself.
 */
export function coverPayloadForPublication(record) {
  const snapshot = record?.snapshot && typeof record.snapshot === 'object' ? record.snapshot : {}
  const config = snapshot.config && typeof snapshot.config === 'object' ? snapshot.config : {}
  const text = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '')
  return {
    storyId: record.sourceStoryId,
    title: text(record.title || snapshot.title, 200),
    genreId: text(record.genreId || snapshot.genreId, 60),
    genreTemplateId: text(record.genreTemplateId || snapshot.genreTemplateId, 60),
    config: {
      genreId: text(config.genreId, 60),
      genreTemplateId: text(config.genreTemplateId || record.genreTemplateId || snapshot.genreTemplateId, 60),
      customWorldName: text(config.customWorldName, 100),
      customWorldSetting: text(config.customWorldSetting, 1200),
    },
    worldBible: { premise: text(snapshot.worldBible?.premise, 1000) },
  }
}

/**
 * The ensure-a-cover flow over injected stores + service (the tests
 * drive it with memory stores and a fake generator; production uses
 * the Firestore stores and the real Vertex-backed service). Returns
 * what happened: 'generated' | 'would-generate' | 'skipped'.
 */
export async function ensureOfficialCover({ plazaStore, coverStore, coverService, publicationId = OFFICIAL_PUBLICATION_ID, force: forcePaint = false, dryRun: planOnly = false, log = console.log }) {
  if (!plazaStore || !coverStore) throw new Error('存储未配置：需要 DATA_STORE=firestore 与 GOOGLE_CLOUD_PROJECT（或 Cloud Run 环境）。')
  const record = await plazaStore.getPublication(publicationId)
  if (!record) throw new Error(`广场上找不到发布记录 ${publicationId}。`)
  if (!record.authorUid || !record.sourceStoryId) throw new Error(`发布记录 ${publicationId} 缺 authorUid/sourceStoryId，无法定位封面。`)
  if (record.status !== 'published') throw new Error(`发布记录 ${publicationId} 状态为 ${record.status || '未知'}，不是 published，先不生成封面。`)
  const existing = await coverStore.getCover(record.authorUid, record.sourceStoryId)
  const hasCover = Boolean(existing?.image)
  const prefix = planOnly ? '[dry-run] ' : ''
  log(`${prefix}${record.id} 《${record.title}》 author=${record.authorUid} story=${record.sourceStoryId}`)
  log(`  现封面：${hasCover ? `有，version=${existing.version || 1} ${existing.bytes ?? '?'} bytes updatedAt=${existing.updatedAt || '?'}` : '无（卡面现在回落到世界图）'}`)
  log(`  封面端点：/api/plaza/${record.id}/cover${hasCover ? `?v=${existing.version || 1}` : '（生成后以 ?v=1 亮起）'}`)
  if (hasCover && !forcePaint) {
    log('done: cover already exists — skipped (use --force to repaint)')
    return { action: 'skipped', record, existing }
  }
  if (planOnly) {
    log(`done: dry run — would ${hasCover ? 'repaint' : 'generate'} the cover through the cover service`)
    return { action: 'would-generate', record, existing: hasCover ? existing : null }
  }
  if (!coverService) throw new Error('封面服务未注入。')
  if (coverService.available === false) throw new Error('封面生成尚未配置：需要 GENAI_BACKEND=vertex 与 GOOGLE_CLOUD_PROJECT。')
  const result = await coverService.request({ uid: record.authorUid }, coverPayloadForPublication(record))
  log(`done: cover generated, version=${result.version}`)
  return { action: 'generated', record, version: result.version }
}

async function main() {
  const publicationId = argValue('--publication') || OFFICIAL_PUBLICATION_ID
  const plazaStore = createPlazaStore({ env: process.env })
  const coverStore = createCoverStore({ env: process.env })
  const coverService = coverStore ? createCoverService({ env: process.env, store: coverStore }) : null
  await ensureOfficialCover({ plazaStore, coverStore, coverService, publicationId, force, dryRun })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
