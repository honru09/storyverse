/**
 * One-time refresh: bake the composed public world outline (§40 ④)
 * into every stored plaza publication that predates it.
 *
 *   node scripts/refresh-world-intros.mjs [--dry-run]
 *
 * Reads publications through the plaza store (Firestore in
 * production, chosen by the same env the server uses), recomputes
 * each record's `worldIntro` with the shared composer from the
 * record's OWN already-public fields (title / worldName / avatar /
 * snapshot worldBible+beats+synopsis — the private source story is
 * never read, and nothing private is written anywhere), and writes
 * the record back stamped with the current WORLD_INTRO_VERSION.
 * Records already at the current version are skipped, so the script
 * is safe to re-run. `--dry-run` prints what would change and writes
 * nothing.
 */
import { createPlazaStore } from '../server/plaza-store.js'
import { plazaTemplateNameFor, plazaWorldIntroFor, WORLD_INTRO_VERSION } from '../src/plaza.js'

const dryRun = process.argv.includes('--dry-run')

export function worldIntroForRecord(record) {
  return plazaWorldIntroFor({
    title: record.title,
    worldName: record.worldName,
    avatar: record.avatar,
    worldBible: record.snapshot?.worldBible,
    beats: record.snapshot?.beats,
    synopsis: record.snapshot?.synopsis,
    chapterCount: record.chapterCount,
    lineStatus: record.lineStatus,
  }, plazaTemplateNameFor(record))
}

async function main() {
  const store = createPlazaStore({ env: process.env })
  const records = await store.listPublications()
  let refreshed = 0
  let skipped = 0
  for (const record of records) {
    if (record.worldIntroVersion === WORLD_INTRO_VERSION && record.worldIntro) {
      skipped += 1
      continue
    }
    const worldIntro = worldIntroForRecord(record)
    console.log(`${dryRun ? '[dry-run] ' : ''}${record.id} 《${record.title}》`)
    console.log(`  背景：${worldIntro.background}`)
    console.log(`  规则：${worldIntro.rules.length} 条`)
    console.log(`  主线：${worldIntro.thread}`)
    if (!dryRun) {
      await store.putPublication({ ...record, worldIntro, worldIntroVersion: WORLD_INTRO_VERSION })
    }
    refreshed += 1
  }
  console.log(`done: ${refreshed} refreshed, ${skipped} already current, ${records.length} total${dryRun ? ' (dry run — nothing written)' : ''}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
