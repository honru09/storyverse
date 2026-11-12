import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cardLorebookOverflow, LOREBOOK_MAX_ENTRIES } from '../src/lorebook.js'
import { aggregateStates, chapterStates } from '../src/story-map.js'
import { fetchFriends, fetchFriendsKeepingPages, mergeRequestPages } from '../src/users.js'
import { fetchPlazaPost } from '../src/plaza.js'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemoryPlazaFeedStore as createMemoryFeedStore } from '../server/plaza-feed-store.js'
import { createMemoryBookRatingsStore as createMemoryRatingsStore } from '../server/book-ratings-store.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const storyMap = readFileSync(new URL('../src/components/StoryMap.jsx', import.meta.url), 'utf8')
const socialServer = readFileSync(new URL('../server/social.js', import.meta.url), 'utf8')
const usersClient = readFileSync(new URL('../src/users.js', import.meta.url), 'utf8')
const lorebook = readFileSync(new URL('../src/lorebook.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-12: guard assertions for this round's fixes.
// Base: bughunt-20261111 (1623ede).

const slice = (startMarker, endMarker) => {
  const at = main.indexOf(startMarker)
  assert.notEqual(at, -1, `missing ${startMarker}`)
  const end = endMarker ? main.indexOf(endMarker, at) : main.length
  return main.slice(at, end === -1 ? main.length : end)
}

const bareSocialStore = {
  getProfileRecord: async () => null,
  getPicture: async () => null,
}
const bareAvatarStore = { getProfile: async () => null }
const iso = (ms) => new Date(ms).toISOString()
const T0 = Date.parse('2026-11-12T00:00:00.000Z')

function makeSocialService(clock = T0) {
  const store = createMemorySocialStore()
  const service = createSocialService({
    env: {}, store,
    plazaStore: createMemoryPlazaStore(),
    avatarStore: createMemoryAvatarStore(),
    coverStore: createMemoryCoverStore(),
    identityStore: createMemoryIdentityStore(),
    feedStore: createMemoryFeedStore(),
    ratingsStore: createMemoryRatingsStore(),
    now: () => clock,
  })
  return { store, service }
}

test('bughunt-1: the avatar refresh drops loaded before the real list lands', () => {
  // The guest pass used to mark loaded=true with an empty list, and
  // AvatarPage's seed effect ran on that stale empty list — a
  // signed-in owner with avatars landed on a blank creation form and
  // the seed never re-ran (editingId was already ""). The
  // authenticated branch drops loaded first; the finally raises it
  // when the real list lands.
  const hook = slice('function useAvatarProfile(', 'function AvatarPortrait(')
  const refreshAt = hook.indexOf('const refresh = useCallback')
  assert.notEqual(refreshAt, -1)
  const refresh = hook.slice(refreshAt, hook.indexOf('useEffect(() => { void refresh(); }', refreshAt))
  assert.match(refresh, /setLoaded\(false\);\s+try \{\s+const result = await fetchAvatars/)
  assert.match(refresh, /finally \{\s+setLoaded\(true\);/)
  // The seed effect still waits for loaded, and for sign-in.
  const page = slice('function AvatarPage(', 'function Stepper(')
  assert.match(page, /if \(!avatarState\.loaded \|\| editingId !== undefined\) return;/)
  // No surface reads loaded=false as "no avatar": every avatarLoaded
  // use is guarded (Forge waits, the publish/enter/picker branches
  // all carry avatarLoaded &&, the signature effect returns early).
  const forge = slice('function Forge(', 'function AvatarPage(')
  assert.match(forge, /if \(avatarPreselectDone\.current \|\| !avatarLoaded \|\| !mainId\) return;/)
  assert.match(main, /avatarLoaded && avatars\.length === 0/)
  assert.match(main, /if \(!viewerUid \|\| !avatarState\.loaded\) return;/)
})

test('bughunt-2: a failed pre-generation reaches the home hero, not just the reader', () => {
  // generationError lived only in the Reader, so the home hero kept
  // saying "下一章待生成" after the pre-generation had failed
  // (20261110 #1 fixed the reader side only). App keeps a
  // storyId -> message record, the Reader reports through a
  // callback shaped like onPrepareChapter, and the hero passes the
  // recorded error into the same generationState the reader uses.
  assert.match(main, /const \[genErrors, setGenErrors\] = useState\(\{\}\)/)
  assert.match(main, /const recordGenerationError = useCallback\(\(storyId, message\) => \{/)
  assert.match(main, /onGenerationError=\{recordGenerationError\}/)
  assert.match(main, /genErrors=\{genErrors\}/)
  const reader = slice('function Reader(', 'function PlazaDetail(')
  assert.match(reader, /onGenerationError,/)
  assert.match(reader, /\.then\(\(\) => \{ if \(!controller\.signal\.aborted\) onGenerationError\?\.\(story\.id, ""\); \}\)/)
  assert.match(reader, /onGenerationError\?\.\(story\.id, failure\.message\)/)
  assert.match(reader, /onPrepareChapter, onGenerationError\]/)
  const home = slice('function Home(', 'function AvatarPage(')
  assert.match(home, /genErrors = \{\}/)
  assert.match(home, /error: genErrors\[activeStory\.id\] \|\| ""/)
  // The shared state words: an error reads "下一章没能备好", never
  // "下一章待生成".
  assert.match(storyMap, /if \(error\) return \{ key: "error", label: "下一章没能备好", className: "is-error" \}/)
})

test('bughunt-3: the enter page cannot submit before the avatars load', () => {
  // The submit button used to look only at identityId/busy, so with
  // the avatars still loading it submitted with no avatar, and
  // enterPlazaLine navigated to #/avatar and then threw into a
  // component already unmounted by that navigate. The button is
  // disabled until the avatars land, says so while loading, and the
  // no-avatar path returns after navigating instead of throwing.
  const enter = slice('function PlazaEnter(', 'function MergeLineCard(')
  assert.match(enter, /disabled=\{!identityId \|\| busy \|\| !avatarLoaded\}/)
  assert.match(enter, /!avatarLoaded \? "化身加载中…" : `带\$\{chosenAvatar\?\.name \|\| ""\}进入 · 写下第一章`/)
  assert.match(enter, /正在确认你的化身…/)
  assert.match(main, /if \(!ownAvatar\) \{ navigate\("avatar"\); return; \}/)
  assert.doesNotMatch(main, /if \(!ownAvatar\) \{ navigate\("avatar"\); throw new Error\("先创建你的化身/)
})

test('bughunt-4: a card whose world book would overflow the cap is refused, not trimmed', () => {
  // applyCardPreview used to append the card's entries and let
  // normalizeLorebookEntries silently cut the tail past 200, while
  // the preview promised the card's book would "一并挂上". The
  // overflow is decided before applying and refused with the exact
  // numbers; nothing changes when it does not fit.
  assert.equal(LOREBOOK_MAX_ENTRIES, 200)
  assert.deepEqual(cardLorebookOverflow(190, 20), { overflow: true, existing: 190, card: 20, max: 200, excess: 10 })
  assert.deepEqual(cardLorebookOverflow(180, 20), { overflow: false, existing: 180, card: 20, max: 200, excess: 0 })
  assert.deepEqual(cardLorebookOverflow(200, 0), { overflow: false, existing: 200, card: 0, max: 200, excess: 0 })
  assert.deepEqual(cardLorebookOverflow(0, 200), { overflow: false, existing: 0, card: 200, max: 200, excess: 0 })
  assert.deepEqual(cardLorebookOverflow(199, 2), { overflow: true, existing: 199, card: 2, max: 200, excess: 1 })
  assert.match(lorebook, /export function cardLorebookOverflow\(existingCount, cardCount/)
  const forge = slice('function Forge(', 'function AvatarPage(')
  assert.match(forge, /const overflow = cardLorebookOverflow\(\(draft\.lorebook \|\| \[\]\)\.length, bookEntries\.length\);/)
  assert.match(forge, /if \(overflow\.overflow\) \{/)
  assert.match(forge, /这本书的世界书已有 \$\{overflow\.existing\} 条，加上这张卡的 \$\{overflow\.card\} 条会超过 \$\{overflow\.max\} 条上限，先删掉 \$\{overflow\.excess\} 条再用这张卡。/)
  assert.match(forge, /cardOverflow\?\.overflow/)
})

test('bughunt-5: 13–16 chapter maps give every label its own room', () => {
  // Past 12 nodes each node got 30 units of width, so at 13–16
  // chapters the spacing ((width-68)/(count-1), ~26.8–27.5) fell
  // under the ~31-unit width of a "第16章" label (10px) and same-side
  // neighbours overlapped. The >12档 is 44 now; ≤12 (64) and the
  // 17+ aggregation are untouched.
  assert.match(storyMap, /nodeCount \* \(nodeCount <= 12 \? 64 : 44\)/)
  assert.doesNotMatch(storyMap, /nodeCount <= 12 \? 64 : 30/)
  const labelWidth = 31
  for (const count of [13, 14, 15, 16]) {
    const width = Math.max(300, count * 44)
    const spacing = (width - 68) / (count - 1)
    assert.ok(spacing > labelWidth, `${count} chapters: spacing ${spacing} must exceed label ${labelWidth}`)
  }
  // 12 and under keep the 64档; 17+ aggregates to at most 12 nodes.
  assert.equal(Math.max(300, 12 * 64), 768)
  assert.ok(aggregateStates(chapterStates({ total: 17, generated: 5, current: 4 })).length <= 12)
  assert.equal(aggregateStates(chapterStates({ total: 16, generated: 5, current: 4 })).length, 16)
})

test('bughunt-6: outgoing requests disclose their cap and page like incoming', async () => {
  // Outgoing requests were silently cut at 50 with no count anywhere
  // (20261111 #4 fixed the incoming side only). The server pages
  // them through outgoingOffset and counts every sent request,
  // whatever its standing state; the client discloses and pages the
  // same way incoming does.
  assert.match(socialServer, /async friends\(identity, \{ incomingOffset = 0, outgoingOffset = 0 \} = \{\}\)/)
  assert.match(socialServer, /outgoingTotal: outgoing\.length/)
  assert.match(usersClient, /outgoingOffset/)
  assert.match(usersClient, /params\.set\('outgoingOffset', String\(outgoingOffset\)\)/)
  const panel = slice('function FriendsPanel(', 'function ProfilePage(')
  assert.match(panel, /只列出前 \{data\.outgoing\.length\} 条发出的申请。/)
  assert.match(panel, /loadMoreOutgoing/)
  assert.match(panel, /fetchFriends\(\{ getAccessToken: getToken, outgoingOffset: data\.outgoing\.length \}\)/)
  assert.match(panel, /\(data\.counts\.outgoingTotal \|\| 0\) > data\.outgoing\.length/)

  const { store, service } = makeSocialService()
  const me = 'username:me'
  const statuses = ['pending', 'declined', 'cancelled']
  for (let i = 0; i < 55; i += 1) {
    await store.putFriendRequest({
      id: `out-${i}`, fromUid: me, toUid: `username:target-${String(i).padStart(2, '0')}`,
      status: statuses[i % 3], message: '', createdAt: iso(T0 - i * 1000), updatedAt: iso(T0 - i * 1000),
    })
  }
  const first = await service.friends({ uid: me })
  assert.equal(first.outgoing.length, 50)
  assert.equal(first.counts.outgoingTotal, 55)
  const second = await service.friends({ uid: me }, { outgoingOffset: 50 })
  assert.equal(second.outgoing.length, 5)
  assert.equal(second.counts.outgoingTotal, 55)
  assert.deepEqual(
    [...first.outgoing, ...second.outgoing].map((entry) => entry.id).sort(),
    Array.from({ length: 55 }, (_, i) => `out-${i}`).sort(),
  )
  // The incoming paging from 20261111 still works alongside it.
  for (let i = 0; i < 55; i += 1) {
    await store.putFriendRequest({
      id: `in-${i}`, fromUid: `username:asker-${String(i).padStart(2, '0')}`, toUid: me,
      status: 'pending', message: '', createdAt: iso(T0 - i * 1000),
    })
  }
  const both = await service.friends({ uid: me })
  assert.equal(both.incoming.length, 50)
  assert.equal(both.counts.incomingPending, 55)
  const bothSecond = await service.friends({ uid: me }, { incomingOffset: 50, outgoingOffset: 50 })
  assert.equal(bothSecond.incoming.length, 5)
  assert.equal(bothSecond.outgoing.length, 5)

  // The client puts outgoingOffset into the request URL.
  let requestedUrl = ''
  const fetchImpl = async (url) => {
    requestedUrl = url
    return { ok: true, json: async () => ({ friends: [], incoming: [], outgoing: [], counts: { friends: 0, incomingPending: 0, outgoingTotal: 0 } }) }
  }
  await fetchFriends({ getAccessToken: async () => 'token', outgoingOffset: 50, fetchImpl })
  assert.match(requestedUrl, /[?&]outgoingOffset=50/)
})

test('bughunt-7: a failed share-picker search says the list is stale, with a retry', () => {
  // A failed search used to keep the previous list with no word at
  // all — the reader could not tell a stale list from a fresh one.
  // The failure is shown, the old list stays for context, and the
  // retry re-runs this query (the debounce effect watches the retry
  // count). A stale reply never sets the flag.
  const composer = slice('function PlazaComposerEditor(', 'function PlazaCommentThread(')
  assert.match(composer, /const \[pickSearchError, setPickSearchError\] = useState\(false\)/)
  assert.match(composer, /const \[pickRetry, setPickRetry\] = useState\(0\)/)
  assert.match(composer, /if \(searchSeqRef\.current === seq\) setPickSearchError\(true\)/)
  assert.match(composer, /setPickSearchError\(false\)/)
  assert.match(composer, /\[mode, pickQuery, defaultBooks, pickRetry\]/)
  assert.match(composer, /这次没能搜到，显示的是上一次的结果。/)
  assert.match(composer, /onClick=\{\(\) => setPickRetry\(\(value\) => value \+ 1\)\}/)
  assert.doesNotMatch(composer, /keep the previous list; the query just does not narrow/)
  // The initial-load failure state is untouched.
  assert.match(composer, /setBooksFailed\(true\)/)
})

test('bughunt-8: announcements and system tabs disclose their 50-item cut', async () => {
  // The server cuts announcements and system to 50 each and already
  // carries their totals; only the activity tab disclosed the cut
  // (20261111 #5). The other two tabs disclose in the same words.
  const panel = slice('function NotificationsPanel(', 'function ChapterDirectory(')
  assert.match(panel, /tab === "announcements" && \(data\.categories\?\.\[tab\]\?\.total \|\| 0\) > items\.length/)
  assert.match(panel, /只显示最近 50 条公告。/)
  assert.match(panel, /tab === "system" && \(data\.categories\?\.\[tab\]\?\.total \|\| 0\) > items\.length/)
  assert.match(panel, /只显示最近 50 条系统消息。/)
  assert.match(panel, /只显示最近 50 条互动。/)

  const { store, service } = makeSocialService()
  const me = 'username:me'
  for (let i = 0; i < 55; i += 1) {
    await store.putAnnouncement({ id: `ann-${i}`, title: `公告 ${i}`, body: '', createdAt: iso(T0 - i * 1000) })
    await store.putAccountEvent({ id: `evt-${i}`, uid: me, kind: 'password_reset', detail: '', createdAt: iso(T0 - i * 1000) })
  }
  const payload = await service.notifications({ uid: me })
  assert.equal(payload.categories.announcements.items.length, 50)
  assert.equal(payload.categories.announcements.total, 55)
  assert.equal(payload.categories.system.items.length, 50)
  assert.equal(payload.categories.system.total, 55)
})

test('bughunt-9: an act keeps the second page instead of collapsing to the first 50', async () => {
  // act() ended in an unconditional reload() that fetched page one
  // only, so a second page already flipped to silently collapsed
  // back to the first 50 rows. Reload re-reads page-preserving:
  // page one, then further pages until the rows already on screen
  // are covered again, deduplicated by id.
  assert.deepEqual(
    mergeRequestPages([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((entry) => entry.id),
    ['a', 'b', 'c'],
  )
  const page = (start, count) => Array.from({ length: count }, (_, i) => ({
    id: `req-${start + i}`, person: { uid: `u${start + i}` },
  }))
  let calls = 0
  const fetchImpl = async (url) => {
    calls += 1
    const params = new URL(url, 'http://localhost').searchParams
    const offset = Number(params.get('incomingOffset') || '0')
    const incoming = offset === 0 ? page(0, 50) : page(50, 10)
    return { ok: true, json: async () => ({ friends: [], incoming, outgoing: [], counts: { friends: 0, incomingPending: 60 } }) }
  }
  // 60 rows already on screen: the refetch walks both pages.
  const kept = await fetchFriendsKeepingPages({ getAccessToken: async () => 'token', alreadyLoaded: 60, fetchImpl })
  assert.equal(kept.incoming.length, 60)
  assert.equal(calls, 2)
  assert.deepEqual(kept.incoming.map((entry) => entry.id), Array.from({ length: 60 }, (_, i) => `req-${i}`))
  // Nothing loaded yet: a single first page, as before.
  calls = 0
  const fresh = await fetchFriendsKeepingPages({ getAccessToken: async () => 'token', alreadyLoaded: 0, fetchImpl })
  assert.equal(fresh.incoming.length, 50)
  assert.equal(calls, 1)
  // A short second page still covers the rows: 55 loaded, pages 50+5.
  const shortImpl = async (url) => {
    const params = new URL(url, 'http://localhost').searchParams
    const offset = Number(params.get('incomingOffset') || '0')
    return { ok: true, json: async () => ({ friends: [], incoming: offset === 0 ? page(0, 50) : page(50, 5), outgoing: [], counts: {} }) }
  }
  const covered = await fetchFriendsKeepingPages({ getAccessToken: async () => 'token', alreadyLoaded: 55, fetchImpl: shortImpl })
  assert.equal(covered.incoming.length, 55)

  const panel = slice('function FriendsPanel(', 'function ProfilePage(')
  assert.match(panel, /fetchFriendsKeepingPages\(\{ getAccessToken: getToken, alreadyLoaded: dataRef\.current\?\.incoming\?\.length \|\| 0 \}\)/)
  assert.match(panel, /dataRef\.current = data;/)
})

test('bughunt-10: a failed focus-post load is not reported as deleted', async () => {
  // The focus effect used to set one boolean on any failure, and the
  // render always said "已删除或不存在" with no retry. A real 404
  // keeps that sentence; anything else says the post could not be
  // opened for now and offers a retry.
  const feed = slice('function PlazaFeed(', 'function PlazaDetail(')
  assert.match(feed, /const \[focusError, setFocusError\] = useState\(null\)/)
  assert.match(feed, /const \[focusRetry, setFocusRetry\] = useState\(0\)/)
  assert.match(feed, /setFocusError\(failure\?\.code === "not-found" \? "not-found" : "failed"\)/)
  assert.match(feed, /\[focusPostId, getToken, focusRetry\]/)
  assert.match(feed, /focusError === "not-found" && !focusPost/)
  assert.match(feed, /这条帖子已删除或不存在，下面是广场的信息流。/)
  assert.match(feed, /focusError === "failed" && !focusPost/)
  assert.match(feed, /这条帖子暂时没能打开，请稍后再试。/)
  assert.match(feed, /onClick=\{\(\) => setFocusRetry\(\(value\) => value \+ 1\)\}/)
  assert.doesNotMatch(feed, /focusFailed/)

  // plazaError carries code 'not-found' only on a real 404.
  const notFoundImpl = async () => ({ ok: false, status: 404, json: async () => ({}) })
  await assert.rejects(
    fetchPlazaPost({ id: 'gone', fetchImpl: notFoundImpl }),
    (failure) => failure?.code === 'not-found',
  )
  const failedImpl = async () => ({ ok: false, status: 500, json: async () => ({}) })
  await assert.rejects(
    fetchPlazaPost({ id: 'flaky', fetchImpl: failedImpl }),
    (failure) => failure?.code !== 'not-found',
  )
  const downImpl = async () => { throw new Error('network down') }
  await assert.rejects(
    fetchPlazaPost({ id: 'flaky', fetchImpl: downImpl }),
    (failure) => failure?.code !== 'not-found',
  )
})
