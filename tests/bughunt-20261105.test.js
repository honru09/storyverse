import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interventionFateText, queueIntervention } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
const engine = readFileSync(new URL('../src/story-engine.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-05: guard assertions for this round's fixes.
// Base: origin/main bd6b616 (bughunt-20261104 already merged).
// Lane B (plaza / friends / login) contributed 1–8; lane A
// (reader / forge / shelf) contributed 9–10. None duplicates the
// 20261030 / 20261031 / 20261101 / 20261102 / 20261103 / 20261104 lists.

test('bughunt-1: a landed like reaches the feed list, so the resync reads fresh props', () => {
  const cardAt = main.indexOf('const [likeBusy, setLikeBusy] = useState(false)')
  const card = main.slice(cardAt, main.indexOf('const report = async', cardAt))
  // The 20261102 resync guard stays verbatim: it still gates on
  // !likeBusy and still syncs from props. What changed is the props
  // themselves — the card now publishes the landed result upward.
  assert.match(card, /if \(!likeBusy\) \{\s+setLiked\(Boolean\(post\.viewerLiked\)\)/)
  assert.ok(card.includes('onLikeChange?.(post.id, result)'))
  assert.match(card, /onLikeChange/)
  const feedAt = main.indexOf('const handleLikeChange = (postId, result)')
  assert.ok(feedAt > 0)
  const feed = main.slice(feedAt, feedAt + 500)
  assert.match(feed, /viewerLiked: Boolean\(result\.liked\), likeCount: result\.likeCount/)
  assert.match(main, /onLikeChange=\{handleLikeChange\}/)
})

test('bughunt-2: loading more comments never duplicates a locally posted one', () => {
  const fnAt = main.indexOf('const loadMoreComments = async')
  const fn = main.slice(fnAt, main.indexOf('const send = async', fnAt))
  assert.match(fn, /new Set\(\(current \|\| \[\]\)\.map\(\(entry\) => entry\.id\)\)/)
  assert.match(fn, /filter\(\(entry\) => !seen\.has\(entry\.id\)\)/)
})

test('bughunt-3: deleting a permalink post removes it from the stream too', () => {
  const feedAt = main.indexOf('onDeleted={(postId) => {\n            // BUGHUNT-20261105')
  assert.ok(feedAt > 0)
  const fn = main.slice(feedAt, feedAt + 600)
  assert.match(fn, /setFocusPost\(null\)/)
  assert.match(fn, /filter\(\(entry\) => entry\.id !== postId\)/)
})

test('bughunt-4: the share picker searches by @handle, case-insensitively', () => {
  const at = main.indexOf('const pickQuery = bookQuery.trim()')
  const fn = main.slice(at, main.indexOf('const submit = async', at))
  assert.match(fn, /replace\(\/\^@\/, ""\)\.toLowerCase\(\)/)
  assert.match(fn, /entry\.authorHandle/)
  assert.match(fn, /toLowerCase\(\)\.includes\(pickQuery\)/)
})

test('bughunt-5: switching friend-search mode drops the other mode\'s result', () => {
  const at = main.indexOf('friends-search-modes')
  const block = main.slice(at, at + 900)
  assert.match(block, /setSearchMode\("name"\); setSearchResult\(null\); setSearchError\(""\)/)
  assert.match(block, /setSearchMode\("email"\); setSearchResult\(null\); setSearchError\(""\)/)
})

test('bughunt-6: changing the recovery identifier clears the new password too', () => {
  const at = panel.indexOf('const changeAccountId')
  const fn = panel.slice(at, at + 400)
  assert.match(fn, /setRecoveryCode\(""\)/)
  assert.match(fn, /setNewPassword\(""\)/)
})

test('bughunt-7: a decided request leaves the requests tab even if reload fails', () => {
  const at = main.indexOf('BUGHUNT-20261105: the requests tab renders data.incoming')
  assert.ok(at > 0)
  const block = main.slice(at, at + 2200)
  assert.match(block, /incoming: \(current\.incoming \|\| \[\]\)\.filter/)
  assert.match(block, /incomingPending: Math\.max\(0, \(current\.counts\.incomingPending \|\| 0\) - 1\)/)
  assert.match(block, /outgoing: \(current\.outgoing \|\| \[\]\)\.filter/)
})

test('bughunt-8: a picker query with no match says so instead of crying empty', () => {
  const at = main.indexOf('没有找到符合')
  assert.ok(at > 0)
  const block = main.slice(at - 400, at + 200)
  assert.match(block, /bookQuery\.trim\(\)/)
  assert.match(block, /书城里还没有能分享的书/)
})

test('bughunt-9: text + 听天命 submits the words AND the fate roll', () => {
  const story = { id: 's1', interventions: [] }
  const fate = interventionFateText(story)
  assert.equal(typeof fate, 'string')
  assert.ok(fate.length > 0)
  // Same queue length, same fate — the sheet's merged text and the
  // engine's chip-only roll must agree.
  const rolled = queueIntervention(
    { id: 's1', interventions: [], chapters: [], readOnly: false, config: {} },
    { kind: 'chip', chipId: 'fate', readerIndex: 0 },
  )
  assert.ok(rolled.interventions.some((entry) => entry.text === fate))
  const sheetAt = main.indexOf('if (chipId === "fate")')
  assert.ok(sheetAt > 0)
  const sheet = main.slice(sheetAt, sheetAt + 900)
  assert.match(sheet, /interventionFateText\(story\)/)
  assert.match(sheet, /onSubmit\(\{ kind: "text", text: combined \}\)/)
  assert.match(engine, /export function interventionFateText/)
})

test('bughunt-10: delete / fuse cancels a pending shelf pull', () => {
  const at = main.indexOf('const cancelPull = ()')
  assert.ok(at > 0)
  const block = main.slice(at, at + 400)
  assert.match(block, /clearTimeout\(pullTimer\.current\)/)
  assert.match(block, /setPulledId\(null\)/)
  assert.match(main, /onClick=\{\(\) => \{ cancelPull\(\); onDeleteStory\(story\); \}\}/)
  assert.match(main, /onClick=\{\(\) => \{ cancelPull\(\); onFuseStory\(story\.id\); \}\}/)
})
