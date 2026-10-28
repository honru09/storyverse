// Fusion （合流） UI helpers: which lines may serve as a fusion source,
// what a source card says about a line, and how a contextual entry's
// preselection resolves against the reader's own shelf. The rules
// themselves (combination table, product mode) live in story-engine.js —
// this module only presents them.

import {
  fusionSourceStateFor,
  isManualStory,
  isStoryComplete,
  storyLengthModeOf,
  totalChaptersFor,
} from './story-engine.js'

/**
 * Lines that may serve as a fusion source: my own lines （自己走的线 +
 * 已带化身进入过的广场线， which are ordinary local stories by then),
 * never a fused line itself （防套娃） and never a read-only copy.
 */
export function fusionCandidatesFor(stories) {
  return (Array.isArray(stories) ? stories : [])
    .filter((story) => story && typeof story === 'object' && story.kind !== 'merged' && !story.readOnly && !isManualStory(story))
}

/** The card facts for one source line: mode, progress, fusion state. */
export function fusionLineMetaFor(story) {
  const mode = storyLengthModeOf(story)
  const chapters = Array.isArray(story?.chapters) ? story.chapters.length : 0
  const modeLabel = mode === 'season'
    ? '一季'
    : mode === 'long'
      ? '长线'
      : mode === 'custom'
        ? '自定义篇幅'
        : mode === 'endless'
          ? '无限连载'
          : '短篇'
  const progressLabel = mode === 'endless'
    ? `已走 ${chapters} 章`
    : `${chapters} / ${totalChaptersFor(story)} 章`
  const serializing = fusionSourceStateFor(story) === 'serializing'
  const stateLabel = serializing ? '连载中' : isStoryComplete(story) ? '已完结' : '进行中'
  const stateKind = serializing ? 'is-serial' : isStoryComplete(story) ? 'is-done' : 'is-going'
  return { modeLabel, progressLabel, stateLabel, stateKind }
}

/**
 * Resolve a contextual entry's preselection against the shelf.
 * - storyId （书籍详情 / 书架）: that own line becomes the source side.
 * - publicationId （广场详情）: the partner side is the line as entered
 *   on this shelf (a local story carrying sourcePublicationId); failing
 *   that, my own original behind the publication (the plaza-mine map)
 *   becomes the source side; failing both, the publication is reported
 *   as pending — it must be entered before it can fuse (a plaza line is
 *   a fusion source only once it lives on my shelf).
 */
export function resolveFusionPreselect({ stories = [], storyId = '', publicationId = '', mine = {} } = {}) {
  const candidates = fusionCandidatesFor(stories)
  const empty = { sourceId: '', partnerId: '', publicationId: '', pendingPublication: '' }
  if (storyId) {
    const story = candidates.find((item) => item.id === storyId)
    if (story) return { ...empty, sourceId: story.id }
  }
  if (publicationId) {
    const entered = candidates.find((item) => item.config?.sourcePublicationId === publicationId)
    if (entered) return { ...empty, partnerId: entered.id, publicationId }
    const ownStoryId = Object.entries(mine || {}).find(([, entry]) => entry?.id === publicationId)?.[0]
    const own = ownStoryId ? candidates.find((item) => item.id === ownStoryId) : null
    if (own) return { ...empty, sourceId: own.id, publicationId }
    return { ...empty, publicationId, pendingPublication: publicationId }
  }
  return empty
}

/**
 * The plaza detail page's fusion entry, stated honestly (ENTRY-OPTIONS):
 * the same shelf resolution the merge page runs, collapsed to the three
 * things the detail card must distinguish —
 * - 'no-line': the reader has no line of their own at all; fusion has
 *   nothing to fuse with, so the card says so and points at the forge
 *   instead of walking the reader into the merge page's empty state.
 * - 'needs-enter': the reader has lines, but this publication is not on
 *   their shelf yet; it joins the fusion choices only after they enter
 *   it with an avatar (the merge page carries that guidance + button).
 * - 'ready': the partner side already resolves (entered, or the
 *   reader's own line behind the publication).
 */
export function plazaFusionEntryFor({ stories = [], publicationId = '', mine = {} } = {}) {
  if (!fusionCandidatesFor(stories).length) return { state: 'no-line' }
  const resolution = resolveFusionPreselect({ stories, publicationId, mine })
  if (resolution.pendingPublication) return { state: 'needs-enter' }
  return { state: 'ready' }
}
