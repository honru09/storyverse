import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findInChapters } from '../src/reading-location.js'
import { fetchStoreBooks } from '../src/plaza.js'
import { createPlazaFeedService } from '../server/plaza-feed.js'
import { createMemoryPlazaFeedStore } from '../server/plaza-feed-store.js'
import { createBookRatingsService } from '../server/book-ratings.js'
import { createMemoryBookRatingsStore } from '../server/book-ratings-store.js'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createMemoryIdentityStore } from '../server/identity-store.js'
import { createMemoryPlazaFeedStore as createMemoryFeedStore } from '../server/plaza-feed-store.js'
import { createMemoryBookRatingsStore as createMemoryRatingsStore } from '../server/book-ratings-store.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const feedServer = readFileSync(new URL('../server/plaza-feed.js', import.meta.url), 'utf8')
const ratingsServer = readFileSync(new URL('../server/book-ratings.js', import.meta.url), 'utf8')
const socialServer = readFileSync(new URL('../server/social.js', import.meta.url), 'utf8')
const usersClient = readFileSync(new URL('../src/users.js', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../src/components/ReadingTools.jsx', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-11: guard assertions for this round's fixes.
// Base: origin/main aa885b1 (bughunt-20261110 already merged).

const slice = (startMarker, endMarker) => {
  const at = main.indexOf(startMarker)
  assert.notEqual(at, -1, `missing ${startMarker}`)
  const end = endMarker ? main.indexOf(endMarker, at) : main.length
  return main.slice(at, end === -1 ? main.length : end)
}

// A person resolver that never needs a profile record: the services
// under test resolve authors through it, and the fixture authors
// have no stored profile.
const bareSocialStore = {
  getProfileRecord: async () => null,
  getPicture: async () => null,
}
const bareAvatarStore = { getProfile: async () => null }
const iso = (ms) => new Date(ms).toISOString()
const T0 = Date.parse('2026-11-11T00:00:00.000Z')

function makeFeedService() {
  const store = createMemoryPlazaFeedStore()
  const service = createPlazaFeedService({
    env: {}, store, books: null, socialStore: bareSocialStore, avatarStore: bareAvatarStore,
  })
  return { store, service }
}

function makeRatingsService() {
  const store = createMemoryBookRatingsStore()
  const books = {
    bookCardFor: async () => ({ status: 'published', book: { id: 'book-1', title: '书', authorUid: 'author-1' } }),
    syncRatingSummary: async () => {},
  }
  const service = createBookRatingsService({
    env: {}, store, books, socialStore: bareSocialStore, avatarStore: bareAvatarStore,
  })
  return { store, service }
}

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

test('bughunt-1: same-millisecond pages lose nothing — feed, comments, ratings', async () => {
  // The cursor used to be the bare createdAt, so every record sharing
  // the page-boundary millisecond with the next page was dropped by
  // the strict comparison. It is `createdAt|id` now, with an id
  // tiebreak on the sort and a composite filter.
  assert.doesNotMatch(feedServer, /String\(post\.createdAt\) < String\(cursor\)/)
  assert.doesNotMatch(feedServer, /String\(comment\.createdAt\) > String\(cursor\)/)
  assert.doesNotMatch(ratingsServer, /String\(record\.createdAt\) < String\(cursor\)/)
  assert.match(feedServer, /const cursorOf = \(record\) => `\$\{record\.createdAt\}\|\$\{record\.id\}`/)
  assert.match(ratingsServer, /const cursorOf = \(record\) => `\$\{record\.createdAt\}\|\$\{record\.id\}`/)

  // Feed: three posts in one millisecond plus one older post.
  const { store: feedStore, service: feed } = makeFeedService()
  for (const id of ['post-001', 'post-002', 'post-003']) {
    await feedStore.putPost({
      id, type: 'free_text', authorUid: 'username:poster', authorName: 'poster',
      content: id, likeCount: 0, commentCount: 0, status: 'active',
      reporters: [], createdAt: iso(T0), updatedAt: iso(T0),
    })
  }
  await feedStore.putPost({
    id: 'post-000', type: 'free_text', authorUid: 'username:poster', authorName: 'poster',
    content: 'old', likeCount: 0, commentCount: 0, status: 'active',
    reporters: [], createdAt: iso(T0 - 1000), updatedAt: iso(T0 - 1000),
  })
  const seenPosts = []
  let cursor = ''
  for (let page = 0; page < 3; page += 1) {
    const result = await feed.feed({ viewer: null, cursor, limit: 2 })
    seenPosts.push(...result.posts.map((post) => post.id))
    cursor = result.nextCursor || ''
    if (!result.nextCursor) break
  }
  assert.deepEqual(seenPosts, ['post-003', 'post-002', 'post-001', 'post-000'])
  const firstPage = await feed.feed({ viewer: null, limit: 2 })
  assert.match(firstPage.nextCursor, /^\d{4}-\d{2}-\d{2}T.*\|post-002$/)

  // Comments: oldest first, same millisecond, ids break the tie up.
  for (const id of ['comment-001', 'comment-002', 'comment-003']) {
    await feedStore.putComment({
      id, postId: 'post-001', postAuthorUid: 'username:poster',
      authorUid: 'username:commenter', authorName: 'commenter',
      content: id, status: 'active', reporters: [], createdAt: iso(T0), updatedAt: iso(T0),
    })
  }
  const seenComments = []
  let commentCursor = ''
  for (let page = 0; page < 3; page += 1) {
    const result = await feed.listComments('post-001', { cursor: commentCursor, limit: 2 })
    seenComments.push(...result.comments.map((comment) => comment.id))
    commentCursor = result.nextCursor || ''
    if (!result.nextCursor) break
  }
  assert.deepEqual(seenComments, ['comment-001', 'comment-002', 'comment-003'])

  // Ratings: newest first, same millisecond, ids break the tie down.
  const { store: ratingsStore, service: ratings } = makeRatingsService()
  for (const uid of ['user-a', 'user-b', 'user-c']) {
    await ratingsStore.putRating({
      id: `rating:book-1:${uid}`, bookId: 'book-1', bookAuthorUid: 'author-1',
      userUid: uid, authorName: uid, stars: 5, text: '',
      createdAt: iso(T0), updatedAt: iso(T0),
    })
  }
  const seenRatings = []
  let ratingCursor = ''
  for (let page = 0; page < 3; page += 1) {
    const result = await ratings.list('book-1', { viewer: null, cursor: ratingCursor, limit: 2 })
    seenRatings.push(...result.ratings.map((rating) => rating.id))
    ratingCursor = result.nextCursor || ''
    if (!result.nextCursor) break
  }
  assert.deepEqual(seenRatings, ['rating:book-1:user-c', 'rating:book-1:user-b', 'rating:book-1:user-a'])
})

test('bughunt-2: the share picker searches the server, not just the first 60 books', async () => {
  // With a query the picker used to filter only the 60 books fetched
  // once, while the copy promised a search could find the rest. It
  // now asks the server (which searches title/author/world/handle),
  // debounced, with an in-flight sequence guard; clearing the query
  // restores the cached default 60 with no refetch.
  const composer = slice('function PlazaComposerEditor(', 'function PlazaCommentThread(')
  assert.match(composer, /fetchStoreBooks\(\{ q: pickQuery, limit: 60 \}\)/)
  assert.match(composer, /const searchSeqRef = useRef\(0\)/)
  assert.match(composer, /searchSeqRef\.current === seq/)
  assert.match(composer, /const \[defaultBooks, setDefaultBooks\] = useState\(null\)/)
  // BUGHUNT-20261112: clearing the query also clears the search
  // failure flag, so a stale "上一次的结果" note never survives
  // into the restored default list.
  assert.match(composer, /if \(!pickQuery\) \{ setBooks\(defaultBooks\); setBooksTotal\(defaultBooks\.length\); setPickSearchError\(false\); return undefined; \}/)
  assert.match(composer, /共 \{booksTotal\} 本符合，先显示前 12 本，换更具体的关键词缩小范围。/)
  // The no-query copy (20261110 #11) stays word for word.
  assert.match(composer, /只显示前 12 本，搜书名、作者或 @handle 能缩小范围找到其余的书。/)
  assert.match(composer, /没有找到符合「\$\{bookQuery\.trim\(\)\}」的书，换个关键词试试。/)

  // Behavioural: fetchStoreBooks puts q into the request params.
  let requestedUrl = ''
  const fetchImpl = async (url) => {
    requestedUrl = url
    return { ok: true, json: async () => ({ books: [{ id: 'book-61', title: '第六十一本' }], total: 61 }) }
  }
  const result = await fetchStoreBooks({ q: '六十一', limit: 60, fetchImpl })
  assert.match(requestedUrl, /[?&]q=%E5%85%AD%E5%8D%81%E4%B8%80/)
  assert.match(requestedUrl, /[?&]limit=60/)
  assert.equal(result.total, 61)
  assert.equal(result.books[0].id, 'book-61')
})

test('bughunt-3: a two-step profile save names both landed steps', () => {
  // landed used to be one string, so the banner upload overwrote
  // the avatar — when the field patch then failed, the error named
  // only the banner. It accumulates now; a single step reads exactly
  // as it did before ("头像已经换上了…").
  const sheet = slice('function EditProfileSheet(', 'function FriendsPanel(')
  const saveAt = sheet.indexOf('const save = async')
  assert.notEqual(saveAt, -1)
  const save = sheet.slice(saveAt, sheet.indexOf('return (', saveAt))
  assert.match(save, /let landed = \[\]/)
  assert.match(save, /landed\.push\("头像"\)/)
  assert.match(save, /landed\.push\("头图"\)/)
  assert.match(save, /if \(landed\.length\) \{/)
  assert.match(save, /landed\.join\("和"\)/)
  assert.match(save, /\$\{landed\.join\("和"\)\}已经换上了，资料的其他部分没能保存。/)
  assert.doesNotMatch(save, /let landed = ""/)
})

test('bughunt-4: the friends panel discloses its caps and pages incoming requests', async () => {
  // The friend list caps at 100 and incoming requests at 50 a page
  // while the counts are full — the panel used to show the full
  // counts with no hint that the lists were cut. It discloses both
  // now, and incoming requests page through incomingOffset.
  const panel = slice('function FriendsPanel(', 'function ProfilePage(')
  assert.match(panel, /只列出最近的 \{data\.friends\.length\} 位好友。/)
  assert.match(panel, /只列出前 \{data\.incoming\.length\} 条申请。/)
  assert.match(panel, /fetchFriends\(\{ getAccessToken: getToken, incomingOffset: data\.incoming\.length \}\)/)
  assert.match(panel, /loadingMoreIncoming/)
  assert.match(panel, /显示更多/)
  assert.match(usersClient, /incomingOffset/)
  // BUGHUNT-20261112: friends() gained outgoingOffset (the outgoing
  // side pages the same way now); the incoming paging this guard
  // nails is unchanged.
  assert.match(socialServer, /async friends\(identity, \{ incomingOffset = 0, outgoingOffset = 0 \} = \{\}\)/)

  const { store, service } = makeSocialService()
  const me = 'username:me'
  for (let i = 0; i < 55; i += 1) {
    await store.putFriendRequest({
      id: `req-${i}`, fromUid: `username:asker-${String(i).padStart(2, '0')}`, toUid: me,
      status: 'pending', message: '', createdAt: iso(T0 - i * 1000),
    })
  }
  const first = await service.friends({ uid: me })
  assert.equal(first.incoming.length, 50)
  assert.equal(first.counts.incomingPending, 55)
  const second = await service.friends({ uid: me }, { incomingOffset: 50 })
  assert.equal(second.incoming.length, 5)
  assert.equal(second.counts.incomingPending, 55)
  assert.deepEqual(
    [...first.incoming, ...second.incoming].map((entry) => entry.id).sort(),
    Array.from({ length: 55 }, (_, i) => `req-${i}`).sort(),
  )
  // Outgoing stays a single page for now (no count is shown for it).
  assert.equal(first.outgoing.length, 0)
})

test('bughunt-5: unread counts run on the full activity list, and readThrough caps the watermark', async () => {
  // Each sub-list used to be cut to 50 before merging, and the merge
  // cut to 50 again — items past 50 never counted as unread, yet
  // opening the panel marked them read anyway (watermark "now").
  // Unread now counts the full list first; the panel discloses the
  // cut; and the watermark can stop at the newest instant actually
  // shown (readThrough).
  const panel = slice('function NotificationsPanel(', 'function ChapterDirectory(')
  assert.match(panel, /只显示最近 50 条互动。/)
  assert.match(panel, /data\.activityTotal/)
  assert.match(panel, /readThrough/)
  assert.match(usersClient, /activityTotal: result\?\.activityTotal/)
  assert.match(usersClient, /readThrough/)
  assert.match(socialServer, /activityTotal: activityFull\.length/)
  assert.match(socialServer, /async markNotificationsRead\(identity, category, readThrough\)/)

  const { store, service } = makeSocialService()
  const author = 'username:author'
  for (let i = 0; i < 55; i += 1) {
    await store.putFollow({
      followerUid: `username:fan-${String(i).padStart(2, '0')}`,
      followeeUid: author,
      createdAt: iso(T0 - (54 - i) * 1000),
    })
  }
  const payload = await service.notifications({ uid: author })
  assert.equal(payload.categories.activity.items.length, 50)
  assert.equal(payload.categories.activity.total, 55)
  assert.equal(payload.categories.activity.unread, 55)
  assert.equal(payload.activityTotal, 55)
  assert.equal(payload.totalUnread, 55)

  // readThrough stops the watermark at the newest SHOWN item: the
  // items newer than it (none here — the shown set is the newest)
  // stay unread, and the returned watermark is the passed value,
  // not "now".
  const shownMaxAt = payload.categories.activity.items
    .map((item) => item.at).filter(Boolean).sort().at(-1)
  const marked = await service.markNotificationsRead({ uid: author }, 'activity', shownMaxAt)
  assert.equal(marked.readAt, shownMaxAt)
  const after = await service.notifications({ uid: author })
  assert.equal(after.categories.activity.unread, 0)

  // readThrough mid-list: only the items newer than it stay unread.
  const { service: second } = makeSocialService()
  const mid = iso(T0 - 30 * 1000)
  const markedMid = await second.markNotificationsRead({ uid: author }, 'activity', mid)
  assert.equal(markedMid.readAt, mid)
  // Without readThrough the watermark is still "now".
  const markedNow = await second.markNotificationsRead({ uid: author }, 'activity')
  assert.ok(markedNow.readAt >= mid)
  // An unparsable readThrough falls back to "now", never a bad write.
  const markedBad = await second.markNotificationsRead({ uid: author }, 'activity', 'not-a-date')
  assert.ok(Number.isFinite(Date.parse(markedBad.readAt)))
})

test('bughunt-6: exactly 60 hits is "60 处结果", not "前 60 处结果"', () => {
  // findInChapters capped at 60 and returned only the array, so the
  // caller read length === 60 as "the first 60" — a lie at exactly
  // 60 hits. It returns { results, total, hasMore } now, scanning
  // everything while keeping the first 60.
  const sixty = findInChapters(
    [{ title: '一', paragraphs: Array(60).fill('猫') }], '猫')
  assert.equal(sixty.results.length, 60)
  assert.equal(sixty.total, 60)
  assert.equal(sixty.hasMore, false)

  const sixtyOne = findInChapters(
    [{ title: '一', paragraphs: Array(61).fill('猫') }], '猫')
  assert.equal(sixtyOne.results.length, 60)
  assert.equal(sixtyOne.total, 61)
  assert.equal(sixtyOne.hasMore, true)

  const empty = findInChapters([{ title: '一', paragraphs: ['猫'] }], '   ')
  assert.deepEqual(empty, { results: [], total: 0, hasMore: false })

  assert.match(tools, /const \{ results, total, hasMore \} = useMemo\(\(\) => findInChapters\(chapters, query, lastAccessible\)/)
  assert.match(tools, /hasMore \? `前 60 处结果，共 \$\{total\} 处` : `\$\{total\} 处结果`/)
  assert.doesNotMatch(tools, /results\.length === 60 \? '前 ' : ''/)
})

test('bughunt-7: a 下一章 press skips the BILLING gate for exactly that pass', () => {
  // A non-member returning to a line untouched for 3+ days hit the
  // prepare gate on the on-demand path too — handleNext only bumped
  // retry into the same effect, the gate returned silently, and the
  // star map kept saying "下一章待生成". prepareChapter takes an
  // onDemand option now; the Reader flags the press before bumping
  // retry and the effect forwards the flag once. The gate itself —
  // member / 3-day rule — is untouched.
  const prepareAt = main.indexOf('const prepareChapter = useCallback')
  assert.notEqual(prepareAt, -1)
  const prepare = main.slice(prepareAt, main.indexOf('const reviseChapter = useCallback', prepareAt))
  assert.match(prepare, /async \(id, index, signal, options = \{\}\) => \{/)
  assert.match(prepare, /if \(!options\.onDemand && !activeRecently && !\(await billingGateMember/)
  assert.doesNotMatch(prepare, /opening it just stamped updatedAt/)

  const reader = slice('function Reader(', 'function PlazaDetail(')
  assert.match(reader, /const onDemandRef = useRef\(false\)/)
  const handleNextAt = reader.indexOf('const handleNext = () => {')
  assert.notEqual(handleNextAt, -1)
  const handleNext = reader.slice(handleNextAt, reader.indexOf('const chapterTurn = ', handleNextAt))
  assert.match(handleNext, /onDemandRef\.current = true;\s+setRetry\(\(value\) => value \+ 1\);/)
  const effectAt = reader.indexOf('const pendingIndex = readOnly')
  assert.notEqual(effectAt, -1)
  const effect = reader.slice(effectAt, reader.indexOf('useEffect(() => { celebratedRef', effectAt))
  assert.match(effect, /const onDemand = onDemandRef\.current;/)
  assert.match(effect, /onDemandRef\.current = false;/)
  assert.match(effect, /onPrepareChapter\(story\.id, pendingIndex, controller\.signal, \{ onDemand \}\)/)
})

test('bughunt-8: an over-cap paragraph says how far over, not that the tail was dropped', () => {
  // A model-grown paragraph already past 4000 words was fully shown
  // in the box, yet the note said "the extra words were not written
  // in" — false the moment the editor opened. Over the cap it now
  // says how far over and to trim before saving; exactly at the cap
  // keeps the original line.
  const editor = slice('function ProseEditor(', 'function Reader(')
  assert.match(editor, /const overLimit = length > CHAPTER_PROSE_PARAGRAPH_MAX;/)
  assert.match(editor, /const atLimit = length === CHAPTER_PROSE_PARAGRAPH_MAX;/)
  assert.match(editor, /这段已有 \{length\} 字，超过 \{CHAPTER_PROSE_PARAGRAPH_MAX\} 字上限，保存前请先删减到 \{CHAPTER_PROSE_PARAGRAPH_MAX\} 字以内。/)
  assert.match(editor, /已到 \{CHAPTER_PROSE_PARAGRAPH_MAX\} 字上限，多出的文字没有写进去。/)
  assert.doesNotMatch(editor, /const atLimit = length >= CHAPTER_PROSE_PARAGRAPH_MAX;/)
})
