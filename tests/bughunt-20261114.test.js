import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fusionGateFor } from '../src/fusion-permission.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
const billing = readFileSync(new URL('../src/components/BillingPanel.jsx', import.meta.url), 'utf8')
const prefs = readFileSync(new URL('../src/components/ReadingPreferences.jsx', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-14: guard assertions for this round's fixes.
// Base: origin/main 1623ede (bughunt-20261111 already merged; the
// 20261112 and 20261113 branches are still unmerged, so their fixes
// are NOT in this baseline and are not re-asserted here).

const slice = (startMarker, endMarker) => {
  const at = main.indexOf(startMarker)
  assert.notEqual(at, -1, `missing ${startMarker}`)
  const end = endMarker ? main.indexOf(endMarker, at) : main.length
  return main.slice(at, end === -1 ? main.length : end)
}

test('bughunt-1: PlazaEnter first-load failure offers an in-place retry', () => {
  // The error page used to offer only "回到广场" — a failed first load
  // was a dead end. Same retry pattern as PlazaDetail.
  const enter = slice('function PlazaEnter(', 'function MergeLineCard(')
  assert.match(enter, /const \[enterRetry, setEnterRetry\] = useState\(0\)/)
  assert.match(enter, /}, \[id, enterRetry\]\);/)
  assert.match(enter, /onClick=\{\(\) => setEnterRetry\(\(value\) => value \+ 1\)\}>再试一次<\/Button>/)
})

test('bughunt-2: a rating save/delete still refreshes the header when the list reload fails', () => {
  // load() resolves null on failure, and onRated used to be gated on a
  // non-null payload — the header kept the old average with no recovery
  // path. The refetch is unconditional now; a failed refetch lands in
  // the stale-head banner, and the list retry refreshes the head too.
  const ratings = slice('function BookRatingsSection(', 'function PlazaDetail(')
  assert.match(ratings, /const payload = await load\(\);\n[\s\S]*?onRated\?\.\(\);/)
  // The only "if (payload) onRated" left is the list retry's own guard
  // (it refetches the head only once the list actually reloaded) — the
  // save and delete paths no longer gate on it.
  assert.equal(ratings.split('if (payload) onRated?.();').length - 1, 1)
  assert.match(ratings, /await load\(\);\n\s+onRated\?\.\(\);/)
  assert.match(ratings, /onClick=\{\(\) => void load\(\)\.then\(\(payload\) => \{ if \(payload\) onRated\?\.\(\); \}\)\}>再试一次<\/button>/)
  const detail = slice('function PlazaDetail(', 'function formatProfileDate(')
  assert.match(detail, /评价刚有变化，但头部数据没能刷新。 <button type="button" className="small-link" onClick=\{refreshHead\}>再试一次<\/button>/)
  assert.doesNotMatch(detail, /评分已保存，但头部数据没能刷新。/)
})

test('bughunt-3: switching permalinks clears the old focus post first', () => {
  // The old post stayed pinned on top until the new one arrived, and
  // was missing from the stream at the same time.
  const plaza = slice('function PlazaFeed(', 'function PlazaDetail(')
  const effect = plaza.slice(plaza.indexOf('if (!focusPostId)'))
  assert.match(effect, /setFocusPost\(null\);\n\s+setFocusFailed\(false\);/)
})

test('bughunt-4: a failed avatar first load says so instead of seeding a blank form', () => {
  // refresh() swallowed the error and finally still raised loaded, so
  // AvatarPage seeded the blank creation form over a real collection.
  const hook = slice('function useAvatarProfile(', 'function AvatarPortrait(')
  assert.match(hook, /const \[loadFailed, setLoadFailed\] = useState\(false\)/)
  assert.match(hook, /setLoadFailed\(false\);[\s\S]*?return result;/)
  assert.match(hook, /catch \{\n\s+setLoadFailed\(true\);/)
  assert.match(hook, /loadFailed, refresh, updateAvatar, applyCollection/)
  const page = slice('function AvatarPage(', 'function Stepper(')
  assert.match(page, /if \(!avatarState\.loaded \|\| avatarState\.loadFailed \|\| editingId !== undefined\) return;/)
  assert.match(page, /if \(avatarState\.loaded && avatarState\.loadFailed && !form\) \{/)
  assert.match(page, /化身暂时没能打开。/)
  assert.match(page, /onClick=\{\(\) => void avatarState\.refresh\(\)\}>再试一次<\/Button>/)
})

test('bughunt-5: merge seeds are pruned once the fusion gates arrive', () => {
  // Seeds were picked before the gates loaded, so a forbidden / ask /
  // pending line opened selected and was only refused at 开始合流.
  const merge = slice('function Merge(', 'function legacyDraftToDraft(')
  assert.match(merge, /useEffect\(\(\) => \{\n\s+if \(!fusionStatusKey\) return;\n\s+setSelectedIds\(\(current\) => \{/)
  assert.match(merge, /return gateForStory\(story\)\.canFuse;/)
  assert.match(merge, /}, \[fusionStatus\]\)/)
})

test('bughunt-5b: fusionGateFor refuses exactly the non-fusing states', () => {
  // The prune predicate above: unknown / own / free / granted fuse;
  // forbidden / ask / pending do not.
  assert.equal(fusionGateFor(undefined).canFuse, true)
  assert.equal(fusionGateFor(null).canFuse, true)
  assert.equal(fusionGateFor({ own: true }).canFuse, true)
  assert.equal(fusionGateFor({ permission: 'free' }).canFuse, true)
  assert.equal(fusionGateFor({ permission: 'ask', granted: true }).canFuse, true)
  assert.equal(fusionGateFor({ permission: 'forbidden' }).canFuse, false)
  assert.equal(fusionGateFor({ permission: 'ask' }).canFuse, false)
  assert.equal(fusionGateFor({ permission: 'ask', pending: true }).canFuse, false)
})

test('bughunt-6: a world import says how many lorebook entries it replaced', () => {
  // A second import wholesale-replaced draft.lorebook — card entries
  // included — without a word. The replacement stands, but the note
  // now names the cleared count.
  const imported = slice('const applyImportedWorld', 'const handleWorldFile')
  assert.match(imported, /const replaced = \(draft\.lorebook \|\| \[\]\)\.length;/)
  assert.match(imported, /原有的 \$\{replaced\} 条世界书条目已被这次导入替换。/)
  assert.match(imported, /setWorldImportNote\(note \? `\$\{note\}\$\{replacedNote\}` : replacedNote\);/)
})

test('bughunt-7: the write-desk placeholder no longer promises a blank-line rule', () => {
  // manualTextToParagraphs splits on ANY newline run (its own comment
  // says so) — a single Enter has always been a new paragraph. The
  // placeholder promised "回车两次，就是新的一段".
  const desk = slice('function WriteDesk(', 'function App(')
  assert.match(desk, /placeholder="在这里写这一章。回车就是新的一段。"/)
  assert.doesNotMatch(desk, /回车两次，就是新的一段/)
})

test('bughunt-8: the page-mode hint no longer describes scrolling', () => {
  // The hint rendered only under 逐屏阅读 but described the scroll
  // mode (overlap + free scrolling), neither of which exists there.
  assert.match(prefs, /点页面左／右两侧逐屏翻页，也可以左右拖动翻页。/)
  assert.doesNotMatch(prefs, /保留少量内容重叠，也可以直接上下滚动。/)
})

test('bughunt-9: the merge page can re-check fusion gates after mount', () => {
  // The gates loaded once at mount; an author approving mid-session
  // left the page stuck on 申请中 with no refresh path.
  const merge = slice('function Merge(', 'function legacyDraftToDraft(')
  assert.match(merge, /const refreshFusionStatus = useCallback\(async \(\) => \{/)
  assert.match(merge, /useEffect\(\(\) => \{ void refreshFusionStatus\(\); \}, \[refreshFusionStatus\]\)/)
  assert.match(merge, /onClick=\{\(\) => void refreshFusionStatus\(\)\}>/)
  assert.match(merge, /正在确认合流状态…/)
  assert.match(merge, /刷新合流状态/)
})

test('bughunt-10: the register hint never promises a closed username channel', () => {
  // With the email channel off the username copy won even when the
  // username channel was off too — a form that could never submit
  // promised "用户名注册可用" — and the recovery-email box rode along.
  assert.match(panel, /: usernameAvailable\n\s+\? "用户名 3–20 个字符，大小写不敏感；注册后直接登录，不用邮箱。"\n\s+: "邮箱密码与用户名注册都还没开通。";/)
  assert.match(panel, /const usernameForm = activeMode === "register" && usernameAvailable &&/)
  assert.match(panel, /邮箱密码登录还没开通。\{account\.config\?\.providers\?\.google \? "请用 Google 登录。" : alternativeLoginText\(\)\}/)
})

test('bughunt-11: a billing refresh failure shows over stale numbers too', () => {
  // loadError rendered only when there was no state at all — a refresh
  // that failed after a successful redemption left the success note
  // standing over stale coins with no word and no retry.
  const banner = billing.slice(billing.indexOf('return (\n    <div className="billing-panel">'))
  assert.match(banner, /\{loadError && \(\n\s+<p className="billing-error" role="alert">\{loadError\} <button type="button" className="billing-retry" onClick=\{\(\) => void load\(\)\}>重试<\/button><\/p>\n\s+\)\}/)
})

test('bughunt-12: the friend search box is capped at the server\'s 40-char clip', () => {
  // The server clips name queries at 40 chars while the box took any
  // length, so a 41+ char query silently searched its first 40. Email
  // mode is exempt: the email path never clips.
  const friends = slice('function FriendsPanel(', 'function ProfileShelfStoryBook(')
  assert.match(friends, /maxLength=\{searchMode === "name" \? 40 : undefined\}/)
  assert.match(friends, /\{searchText\.length\} \/ 40/)
})
