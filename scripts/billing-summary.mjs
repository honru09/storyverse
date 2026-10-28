/**
 * Internal cost summary (BILLING): what generation really costs, by
 * day / by user / by scene, and what became of the pre-generated
 * chapters (opened vs discarded vs still unread vs never synced).
 *
 *   DATA_STORE=firestore node --env-file-if-exists=.env scripts/billing-summary.mjs
 *
 * Reads cost records through the billing store and joins pre-gen
 * records against the synced cloud library (a pre-generated chapter
 * counts as opened when the story's opened-through watermark reached
 * it and the chapter on file is still the paid copy; discarded when
 * the slot now holds another chapter or none; unknown when the story
 * never synced — local-only reading cannot be judged honestly).
 * Prints one JSON document; writes nothing.
 */
import { createBillingService, summarizeCostRecords, summarizePregeneration } from '../server/billing.js'
import { createLibraryService } from '../server/library.js'

const billing = createBillingService({ env: process.env })
if (!billing.available) {
  process.stderr.write('billing store unavailable: set DATA_STORE=firestore (production) or DATA_STORE=memory.\n')
  process.exitCode = 1
} else {
  const records = await billing.listCostRecords()
  const library = createLibraryService({ env: process.env })
  const lookup = new Map()
  const wanted = new Map()
  for (const record of records) {
    if (record?.pregenerated && record.kind === 'text' && record.uid && record.storyId) {
      wanted.set(`${record.uid}\n${record.storyId}`, { uid: record.uid, storyId: record.storyId })
    }
  }
  for (const { uid, storyId } of wanted.values()) {
    try {
      const story = await library.getStory({ uid }, storyId)
      if (story) {
        lookup.set(`${uid}\n${storyId}`, {
          openedThrough: Number.isInteger(story.openedThrough) ? story.openedThrough : null,
          chapterIds: (story.chapters || []).map((chapter) => chapter?.id ?? null),
        })
      }
    } catch { /* an unreadable story stays an honest unknown */ }
  }
  process.stdout.write(`${JSON.stringify({
    priceTableAsOf: '2026-10-28',
    totals: summarizeCostRecords(records),
    pregeneration: summarizePregeneration(records, lookup),
  }, null, 2)}\n`)
}
