import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseWorldInfoJson, splitWorldTextIntoEntries, worldbookImportOverflow, LOREBOOK_MAX_ENTRIES } from '../src/lorebook.js'
import { fetchFriendsKeepingPages } from '../src/users.js'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../src/components/ReadingTools.jsx', import.meta.url), 'utf8')
const socialServer = readFileSync(new URL('../server/social.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-13: guard assertions for this round's fixes.
// Base: origin/main 1623ede (bughunt-20261111 merged; bughunt-20261112
// branch 3c4641e NOT in main — see LOG.md for the overlap note on #2,
// whose outgoing paging + page-preserving reload are landed here on
// the main base). Nine fixes, honestly counted — the round found no
// tenth real bug and reports 9 rather than padding.

// #1: a worldbook past 200 entries is refused with the real count —
// never silently trimmed while the success note reports the trimmed
// count as the whole file.
test('bughunt-1: parseWorldInfoJson counts every usable entry, keeps the first 200', () => {
  const book = { name: 'Big', entries: {} }
  for (let i = 0; i < 201; i += 1) book.entries[String(i)] = { key: ['k'], comment: `条目 ${i}`, content: `内容 ${i}` }
  const parsed = parseWorldInfoJson(JSON.stringify(book))
  assert.equal(parsed.totalEntries, 201)
  assert.equal(parsed.entries.length, 200)
})

test('bughunt-1: worldbookImportOverflow refuses over the cap with both numbers, passes at the cap', () => {
  assert.equal(worldbookImportOverflow(200), null)
  assert.equal(worldbookImportOverflow(199), null)
  const message = worldbookImportOverflow(201)
  assert.match(message, /201 条/)
  assert.match(message, /200 条上限/)
  assert.match(message, /1 条再导入/)
  assert.match(worldbookImportOverflow(250), /50 条再导入/)
})

test('bughunt-1: splitWorldTextIntoEntries reports the pre-cap total', () => {
  const text = Array.from({ length: 205 }, (_, i) => `# 节 ${i}\n内容 ${i}`).join('\n\n')
  const split = splitWorldTextIntoEntries(text)
  assert.equal(split.total, 205)
  assert.equal(split.entries.length, 200)
})

test('bughunt-1: the import handler refuses over-cap files instead of applying them', () => {
  const at = main.indexOf('const handleWorldFile')
  const fn = main.slice(at, main.indexOf('const handleCardFile', at))
  assert.match(fn, /worldbookImportOverflow\(parsed\.totalEntries\)/)
  assert.match(fn, /worldbookImportOverflow\(split\.total\)/)
  assert.match(fn, /if \(overflow\) \{ setError\(overflow\); return; \}/)
})

// #2: outgoing requests page like incoming ones, and an act's reload
// re-walks both lists to the depth already reached instead of
// collapsing page 2 back to the first 50.
test('bughunt-2: friends() pages outgoing requests and reports outgoingTotal', async () => {
  const store = createMemorySocialStore()
  const me = { uid: 'me', displayName: 'Me' }
  for (let i = 0; i < 55; i += 1) {
    await store.putFriendRequest({
      id: `out-${i}`, fromUid: 'me', toUid: `username:peer${i}`,
      status: i % 5 === 0 ? 'declined' : 'pending',
      createdAt: `2026-11-0${1 + (i % 9)}T00:00:00.000Z`,
      updatedAt: `2026-11-0${1 + (i % 9)}T00:00:00.000Z`,
    })
    await store.putFriendRequest({
      id: `in-${i}`, fromUid: `username:peer${i}`, toUid: 'me',
      status: 'pending',
      createdAt: `2026-11-0${1 + (i % 9)}T00:00:00.000Z`,
      updatedAt: `2026-11-0${1 + (i % 9)}T00:00:00.000Z`,
    })
  }
  const social = createSocialService({
    env: {}, store, plazaStore: createMemoryPlazaStore(),
    avatarStore: createMemoryAvatarStore(), coverStore: createMemoryCoverStore(),
    identityStore: createMemoryIdentityStore(), now: () => Date.parse('2026-11-13T00:00:00.000Z'),
  })
  const first = await social.friends(me)
  assert.equal(first.outgoing.length, 50)
  assert.equal(first.counts.outgoingTotal, 55)
  assert.equal(first.incoming.length, 50)
  assert.equal(first.counts.incomingPending, 55)
  const second = await social.friends(me, { incomingOffset: 50, outgoingOffset: 50 })
  assert.equal(second.outgoing.length, 5)
  assert.equal(second.incoming.length, 5)
  const ids = new Set([...first.outgoing, ...second.outgoing].map((entry) => entry.id))
  assert.equal(ids.size, 55)
})

test('bughunt-2: fetchFriendsKeepingPages re-walks both lists to the loaded depth', async () => {
  const incoming = Array.from({ length: 120 }, (_, i) => ({ id: `in-${i}` }))
  const outgoing = Array.from({ length: 120 }, (_, i) => ({ id: `out-${i}` }))
  const fetchImpl = async (url) => {
    const query = new URL(url, 'http://localhost').searchParams
    const inOff = Number.parseInt(query.get('incomingOffset') || '0', 10)
    const outOff = Number.parseInt(query.get('outgoingOffset') || '0', 10)
    return {
      ok: true,
      json: async () => ({
        friends: [], counts: { friends: 0, incomingPending: 120, outgoingTotal: 120 },
        incoming: incoming.slice(inOff, inOff + 50),
        outgoing: outgoing.slice(outOff, outOff + 50),
      }),
    }
  }
  const getAccessToken = async () => 'token'
  const merged = await fetchFriendsKeepingPages({ getAccessToken, alreadyLoadedIncoming: 100, alreadyLoadedOutgoing: 100, fetchImpl })
  assert.equal(merged.incoming.length, 100)
  assert.equal(merged.outgoing.length, 100)
  assert.equal(new Set(merged.incoming.map((entry) => entry.id)).size, 100)
  assert.equal(new Set(merged.outgoing.map((entry) => entry.id)).size, 100)
  // A first-page-only depth needs no walk at all.
  const shallow = await fetchFriendsKeepingPages({ getAccessToken, alreadyLoadedIncoming: 0, alreadyLoadedOutgoing: 0, fetchImpl })
  assert.equal(shallow.incoming.length, 50)
  assert.equal(shallow.outgoing.length, 50)
})

test('bughunt-2: the friends panel reloads keeping pages and discloses the outgoing cap', () => {
  assert.match(main, /fetchFriendsKeepingPages\(\{/)
  assert.match(main, /alreadyLoadedOutgoing: dataRef\.current\?\.outgoing\?\.length \|\| 0/)
  assert.match(main, /只列出前 \{data\.outgoing\.length\} 条发出的申请。/)
  assert.match(main, /loadMoreOutgoing/)
})

// #3: a profile first load with no cache can be retried in place.
test('bughunt-3: the profile page carries an in-place retry for a failed first load', () => {
  assert.match(main, /const \[profileRetry, setProfileRetry\] = useState\(0\)/)
  assert.match(main, /\[uid, getToken, viewerUid, profileRetry\]/)
  assert.match(main, /<Button variant="primary" onClick=\{\(\) => setProfileRetry\(\(value\) => value \+ 1\)\}>再试一次<\/Button>/)
})

// #4: the bookstore empty-result hint names @handle like the rest of the page.
test('bughunt-4: the bookstore no-result hint mentions @handle', () => {
  assert.match(main, /换个书名、作者名、世界名或 @handle 试试。/)
})

// #5: a disabled Google button says the channel is not open yet.
test('bughunt-5: the login card explains Google sign-in when it is not open', () => {
  assert.match(panel, /Google 登录还没开通。/)
})

// #6: the password-reset submit is not disabled away from its own
// "channel not open" error — the copy exists to be shown.
test('bughunt-6: the reset submit stays enabled for an email identifier so the channel error can surface', () => {
  assert.match(panel, /const resetDisabled = identifierIsEmail \? false :/)
  assert.match(panel, /邮箱密码登录还没开通。/)
})

// #7: applying for a fusion with no line of mine selected is refused
// at the tap, with the missing line named.
test('bughunt-7: a fusion apply with no line selected is refused, not filed blank', () => {
  const at = main.indexOf('const toggleLine')
  const fn = main.slice(at, main.indexOf('if (!gate.canFuse)', at))
  assert.match(fn, /先选一条自己的线，再向《\$\{book\.title\}》的作者提交合流申请。/)
  assert.match(main, /if \(!otherStory\) \{ setError\(`先选一条自己的线/)
})

// #8: marking / unmarking the current position says which one happened.
test('bughunt-8: the position-bookmark toggle reports added vs removed', () => {
  const at = main.indexOf('const togglePositionBookmark')
  const fn = main.slice(at, main.indexOf('const toggleStoryBookmark', at))
  assert.match(fn, /return added \? "added" : "removed"/)
  assert.match(tools, /ok === "added" \? "已标记当前位置。" : ok === "removed" \? "已取消标记。" : ""/)
})

// #9: the mark-read comment no longer claims the cut-off tail stays unread.
test('bughunt-9: the readThrough comment states the real coverage', () => {
  assert.match(socialServer, /the cut-off tail is OLDER than the watermark/)
  assert.doesNotMatch(socialServer, /items cut off past the 50-item page stay unread instead of/)
})
