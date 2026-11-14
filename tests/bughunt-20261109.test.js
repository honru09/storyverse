import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-09: guard assertions for this round's fixes.
// Base: origin/main a3320ea (bughunt-20261108 already merged and live).
// Lanes: audit A (write-desk/avatar/@ID/friend-compose/enter-page) and
// audit B (plaza tick/detail/ratings/connections/profile). None
// duplicates the 20261030–20261108 lists. The plaza-feed reload
// candidate from lane A was adjudicated NOT a bug (authClient is a
// session singleton, so the effect only re-runs on retry, when posts
// is already empty) and is not counted; the live defect there is the
// silent 60s tick, fixed as #9.

const slice = (startMarker, endMarker) => {
  const at = main.indexOf(startMarker)
  assert.notEqual(at, -1, `missing ${startMarker}`)
  const end = endMarker ? main.indexOf(endMarker, at) : main.length
  return main.slice(at, end === -1 ? main.length : end)
}

test('bughunt-1: write-desk nav buttons gate on the save result', () => {
  // A chapter past 100k words fails commitDraft(); the three nav
  // buttons used to drop the return value and navigate anyway, and
  // the unmount flush failed the same way — the draft was lost.
  // pickChapter/addChapter/moveChapter/finishBook already gate.
  const desk = slice('function WriteDesk(', 'function App()')
  assert.match(desk, /if \(!commitDraft\(\)\) return; onNavigate\("home"\)/)
  assert.match(desk, /if \(!commitDraft\(\)\) return; onNavigate\("reader"/)
  assert.match(desk, /if \(!commitDraft\(\)\) return; onNavigate\("plaza-publish"\)/)
  assert.doesNotMatch(desk, /commitDraft\(\); onNavigate\(/)
})

test('bughunt-2: a failed avatar delete keeps the confirm state', () => {
  // The catch used to close the confirm, so retrying meant re-walking
  // 删除这位化身 → 确认删除 while the error line was already shown.
  // Same family as the post delete fix (20261108 #8).
  const page = slice('function AvatarPage(', 'function PlazaFeed(')
  const at = page.indexOf('const removeSelected')
  assert.notEqual(at, -1)
  const fn = page.slice(at, page.indexOf('return (', at))
  assert.doesNotMatch(fn, /setConfirmDelete\(false\)/)
  // The success path still clears it via seedForm.
  assert.match(page, /setConfirmDelete\(false\)/)
})

test('bughunt-3: a stale @ID check verdict never lands under new text', () => {
  // checkHandle used to setState whatever resolved last, with no
  // sequence guard and no value check.
  const sheet = slice('function EditProfileSheet(', 'function FriendsPanel(')
  assert.match(sheet, /handleCheckSeq = useRef\(0\)/)
  assert.match(sheet, /handleRef = useRef\(handle\)/)
  const at = sheet.indexOf('const checkHandle')
  const fn = sheet.slice(at, sheet.indexOf('// REQ-27', at))
  assert.match(fn, /const seq = \+\+handleCheckSeq\.current/)
  assert.match(fn, /if \(fresh\(\)\) setHandleState\(result\)/)
  assert.match(fn, /if \(fresh\(\)\) setHandleState\(\{ available: null/)
  assert.doesNotMatch(fn, /setHandleState\(await checkHandleAvailable/)
})

test('bughunt-4: both friend-request note boxes count to 50', () => {
  // FriendsPanel search row and the profile-page add-friend row both
  // had maxLength={50} with no counter; a full box swallowed keys.
  const friends = slice('function FriendsPanel(', 'function ProfilePage(')
  assert.match(friends, /\{draft\.length\} \/ 50/)
  const profile = slice('function ProfilePage(', 'function WriteDesk(')
  assert.match(profile, /\{friendDraft\.length\} \/ 50/)
  assert.match(styles, /\.friend-compose-field\{flex:1;min-width:0;display:flex;flex-direction:column\}/)
  assert.match(styles, /\.friend-compose \.friend-compose-field input\{flex:none;width:100%\}/)
})

test('bughunt-5: the enter-page custom birthplace name counts to 30', () => {
  // The forge flow counts this field in two places; the enter page
  // was the one leak.
  const enter = slice('function PlazaEnter(', 'function MergeLineCard(')
  assert.match(enter, /\{\[\.\.\.spawnName\]\.length\} \/ \{START_POINT_NAME_MAX\}/)
})

test('bughunt-6: the enter-page custom birthplace keeps an opening hook', () => {
  // The custom branch had a name box only, and its onChange wiped
  // spawnHook — a custom birthplace could never carry an opening
  // situation, unlike the forge flow's name + hook pair.
  const enter = slice('function PlazaEnter(', 'function MergeLineCard(')
  assert.match(enter, /maxLength=\{START_POINT_HOOK_MAX\}/)
  assert.match(enter, /\{\[\.\.\.spawnHook\]\.length\} \/ \{START_POINT_HOOK_MAX\}/)
  assert.match(enter, /开局处境（选填）/)
  assert.doesNotMatch(enter, /setSpawnName\(event\.target\.value\); setSpawnHook\(""\)/)
})

test('bughunt-7: a failed followers/following list retries in place', () => {
  // The list only said so; retrying meant closing it and tapping the
  // count again. Same family as the friends search retry.
  const profile = slice('function ProfilePage(', 'function WriteDesk(')
  assert.match(profile, /\[connectionsRetry, setConnectionsRetry\] = useState\(0\)/)
  assert.match(profile, /\[connectionsKind, uid, getToken, connectionsRetry\]/)
  assert.match(profile, /setConnectionsRetry\(\(value\) => value \+ 1\)/)
})

test('bughunt-8: a failed profile refresh says the copy is stale', () => {
  // With a cached profile, a failed background refresh vanished
  // silently and the old data showed as if fresh.
  const profile = slice('function ProfilePage(', 'function WriteDesk(')
  assert.match(profile, /\[staleProfile, setStaleProfile\] = useState\(false\)/)
  assert.match(profile, /setStaleProfile\(true\)/)
  assert.match(profile, /这次没能刷新，显示的是上次打开时的内容。/)
})

test('bughunt-9: a failed plaza tick says the feed is stale', () => {
  // The 60s tick swallowed refresh failures whole; the list sat
  // stale with no word and no retry.
  const feed = slice('function PlazaFeed(', 'function BookRatingsSection(')
  assert.match(feed, /\[feedStale, setFeedStale\] = useState\(false\)/)
  assert.match(feed, /setFeedStale\(true\)/)
  assert.match(feed, /广场刚才没能刷新，显示的是之前的内容。/)
  assert.doesNotMatch(feed, /void refreshFeed\(\)\.catch\(\(\) => \{\}\)/)
})

test('bughunt-10: a failed ratings load retries in place', () => {
  // The detail ratings panel only said so; retrying meant leaving
  // the detail page and coming back. load() is only re-run on
  // mount/bookId change, so the button calls it directly.
  // BUGHUNT-20261114: the retry also refetches the header once the
  // list actually reloads — otherwise the header stays on the old
  // average after a save/delete whose reload just failed.
  const ratings = slice('function BookRatingsSection(', 'function PlazaDetail(')
  assert.match(ratings, /\{error && \(<p className="plaza-thread-error" role="alert">\{error\} <button type="button" className="small-link" onClick=\{\(\) => void load\(\)\.then\(\(payload\) => \{ if \(payload\) onRated\?\.\(\); \}\)\}>再试一次<\/button><\/p>\)\}/)
})

test('bughunt-11: a failed detail first load retries in place', () => {
  // The detail error page only offered 回去看看; retrying meant
  // leaving and re-entering. Same family as the ratings retry.
  const detail = slice('function PlazaDetail(', 'function EditProfileSheet(')
  assert.match(detail, /\[retry, setRetry\] = useState\(0\)/)
  assert.match(detail, /\}, \[id, retry\]\)/)
  assert.match(detail, /setRetry\(\(value\) => value \+ 1\)/)
  assert.match(detail, /再试一次<\/Button>/)
})
