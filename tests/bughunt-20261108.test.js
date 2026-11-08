import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const readerFlow = readFileSync(new URL('../src/reader-flow.css', import.meta.url), 'utf8')
const { fragmentAlreadyAdded, INSPIRATION_FRAGMENTS } = await import('../src/inspiration-fragments.js')

// Daily bug-hunt 2026-11-08: guard assertions for this round's fixes.
// Base: origin/main c6af162 (bughunt-20261107 already merged and live).
// Lanes: audit A (reader/forge/settings-book/write-desk/avatar) and
// audit B (plaza/store/detail/home/shelf/friends/messages/settings/
// login). None duplicates the 20261030–20261107 lists. Fix 1 is a
// regression of 20261107 #3; its old guard is updated in place there.

test('bughunt-1: the fragment dedup actually fires on real fragment text', () => {
  // The 20261107 check split the setting on 。！？ (stripping the
  // punctuation) and compared each part against the fragment WITH its
  // trailing punctuation — the two sides could never be equal, so the
  // dedup was dead for all 89 fragments ending in 。！？. The predicate
  // now runs against the real library, not a source regex.
  assert.equal(INSPIRATION_FRAGMENTS.length, 100)
  for (const fragment of INSPIRATION_FRAGMENTS) {
    assert.equal(fragmentAlreadyAdded(fragment.text, fragment.text), true, `self: ${fragment.id}`)
    assert.equal(fragmentAlreadyAdded('', fragment.text), false, `empty: ${fragment.id}`)
  }
  // No fragment's text is a substring of another's, so containment
  // cannot false-positive anywhere in the library.
  for (const a of INSPIRATION_FRAGMENTS) {
    for (const b of INSPIRATION_FRAGMENTS) {
      if (a.id === b.id) continue
      assert.equal(fragmentAlreadyAdded(b.text, a.text), false, `${a.id} inside ${b.id}`)
    }
  }
  const at = main.indexOf('const appendFragment')
  const fn = main.slice(at, main.indexOf('const [rolled', at))
  assert.match(fn, /fragmentAlreadyAdded\(current, fragment\)/)
  assert.doesNotMatch(fn, /split\(\/\[。！？\]\//)
})

test('bughunt-2: a failed store reload keeps the books on screen', () => {
  // The catch used to wipe the catalogue (setData to empty) and the
  // render swapped the whole grid for the error page — same family as
  // the friends panel and the message centre, both already fixed.
  assert.doesNotMatch(main, /setData\(\{ books: \[\], total: 0 \}\)/)
  const at = main.indexOf('function Store(')
  const fn = main.slice(at, main.indexOf('function PlazaAvatarThumb', at))
  assert.match(fn, /\{error && data && <p className="plaza-thread-error"/)
  assert.match(fn, /\{error && !data && \(/)
})

test('bughunt-3: a near-full prose paragraph shows its count, a full one says so', () => {
  assert.match(main, /CHAPTER_PROSE_PARAGRAPH_MAX - 400/)
  assert.match(main, /maxLength=\{CHAPTER_PROSE_PARAGRAPH_MAX\}/)
  assert.match(main, /prose-limit-note/)
  assert.match(main, /已到 \{CHAPTER_PROSE_PARAGRAPH_MAX\} 字上限，多出的文字没有写进去。/)
  assert.match(styles, /\.da-unit-count\.is-over\{color:var\(--danger\);font-weight:700\}/)
  assert.match(readerFlow, /\.prose-editor-row \.prose-limit-note \{ font-size: 12px; color: var\(--danger\); \}/)
})

test('bughunt-4: lorebook keys show their count and warn on an overlong key', () => {
  const at = main.indexOf('条目 ${position + 1} 关键词')
  const region = main.slice(at, main.indexOf('条目 ${position + 1} 内容', at))
  assert.match(region, /\{\(entry\.keys \|\| \[\]\)\.length\} \/ \{LOREBOOK_KEYS_MAX\}/)
  assert.match(region, /lore-key-warning/)
  assert.match(region, /有个关键词超过 \{LOREBOOK_KEY_MAX\} 字，保存时只会留下前 \{LOREBOOK_KEY_MAX\} 字。/)
  assert.match(styles, /\.lore-key-warning\{display:block;margin-top:6px;font-size:12px;color:var\(--danger\)\}/)
})

test('bughunt-5: the post-rating refetch cannot overwrite another book', () => {
  const at = main.indexOf('function PlazaDetail(')
  const fn = main.slice(at, main.indexOf('function PlazaPublish', at))
  assert.match(fn, /const idRef = useRef\(id\);/)
  assert.match(fn, /idRef\.current = id;/)
  assert.match(fn, /const wanted = id; fetchPlazaDetail\(\{ id: wanted \}\)\.then\(\(next\) => \{ if \(idRef\.current === wanted\) setDetail\(next\); \}\)/)
})

test('bughunt-6: a decided fusion row leaves at once and says so', () => {
  const at = main.indexOf('const decideFusion = async')
  const fn = main.slice(at, main.indexOf('useEffect(() => {', at))
  assert.match(fn, /setDecideNote\(approve \? "已同意这次合流申请。" : "已拒绝这次合流申请。"\)/)
  assert.match(fn, /items: \(activity\.items \|\| \[\]\)\.filter\(\(row\) => row\.requestId !== item\.requestId\)/)
  assert.match(main, /\{decideNote && <p className="plaza-note" role="status">\{decideNote\}<\/p>\}/)
})

test('bughunt-7: a failed comment load does not claim there are no comments', () => {
  const at = main.indexOf('function PlazaCommentThread(')
  const fn = main.slice(at, main.indexOf('function PlazaPostCard(', at))
  assert.match(fn, /\{comments !== null && comments\.length === 0 && !error && \(/)
})

test('bughunt-8: a failed post delete keeps the confirm box open', () => {
  const at = main.indexOf('function PlazaPostCard(')
  const fn = main.slice(at, main.indexOf('function PlazaDetail(', at))
  const removeAt = fn.indexOf('const remove = async () => {')
  assert.ok(removeAt > 0)
  const removeFn = fn.slice(removeAt, fn.indexOf('\n  };', removeAt))
  assert.match(removeFn, /setNote\("这条帖子没能删掉，请稍后再试。"\)/)
  assert.match(removeFn, /setBusy\(false\)/)
  assert.doesNotMatch(removeFn, /setConfirmingDelete\(false\)/)
})

test('bughunt-9: the hand-written ability boxes count like their siblings', () => {
  const at = main.indexOf('avatar-ability-custom')
  const region = main.slice(at, main.indexOf('avatar-ability-actions', at))
  assert.match(region, /\{abilityCustomName\.length\} \/ 40/)
  assert.match(region, /\{abilityCustomDesc\.length\} \/ 120/)
})

test('bughunt-10: login and recovery codes time separate cooldowns', () => {
  assert.match(panel, /const \[loginCooldown, setLoginCooldown\] = useState\(0\);/)
  assert.match(panel, /const \[recoveryCooldown, setRecoveryCooldown\] = useState\(0\);/)
  assert.doesNotMatch(panel, /const \[cooldown, setCooldown\]/)
  assert.doesNotMatch(panel, /setCooldown\(/)
  assert.doesNotMatch(panel, /cooldown > 0/)
  assert.doesNotMatch(panel, /cooldown <= 0/)
  const sendAt = panel.indexOf('const sendCode = () => {')
  const sendFn = panel.slice(sendAt, panel.indexOf('\n  };', sendAt))
  assert.match(sendFn, /loginCooldown > 0/)
  assert.match(sendFn, /setLoginCooldown\(60\)/)
  const resendAt = panel.indexOf('const resendRecoveryCode = () => {')
  const resendFn = panel.slice(resendAt, panel.indexOf('\n  };', resendAt))
  assert.match(resendFn, /recoveryCooldown > 0/)
  assert.match(resendFn, /setRecoveryCooldown\(60\)/)
  assert.match(panel, /\{loginCooldown > 0 \? `\$\{loginCooldown\} 秒后重发` : "发送验证码"\}/)
  assert.match(panel, /\{recoveryCooldown > 0 \? `\$\{recoveryCooldown\} 秒后重发` : "重新发送"\}/)
})
