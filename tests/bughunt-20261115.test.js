import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlazaFeedService } from '../server/plaza-feed.js'
import { createMemoryPlazaFeedStore } from '../server/plaza-feed-store.js'
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
const socialServer = readFileSync(new URL('../server/social.js', import.meta.url), 'utf8')
const feedServer = readFileSync(new URL('../server/plaza-feed.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-15: guard assertions for this round's fixes.
// Base: origin/main 1623ede (bughunt-20261111 already live). 7 fixes;
// the e2e baselines (intervention 1/2, bookstore-plaza stale assertion)
// are left alone — Playwright has no browser on this box, so they are
// recorded as leftovers, not fixed blind.

const slice = (startMarker, endMarker) => {
  const at = main.indexOf(startMarker)
  assert.notEqual(at, -1, `missing ${startMarker}`)
  const end = endMarker ? main.indexOf(endMarker, at) : main.length
  return main.slice(at, end === -1 ? main.length : end)
}

const iso = (ms) => new Date(ms).toISOString()
const T0 = Date.parse('2026-11-15T00:00:00.000Z')

test('bughunt-1: the 60s plaza tick refreshes loaded posts instead of freezing them', () => {
  // refreshFeed's paged branch used to prepend the fresh first page and
  // keep every loaded post verbatim — someone else's like / comment /
  // edit / delete on a loaded post never reached its card, because the
  // card only syncs from parent props. The fresh page now replaces its
  // own ids in place, so loaded posts refresh too.
  const branch = slice('const refreshFeed = useCallback', '}, [getToken]);')
  assert.match(branch, /\[\.\.\.fresh, \.\.\.\(current \|\| \[\]\)\.filter\(\(post\) => !freshIds\.has\(post\.id\)\)\]/)
  assert.doesNotMatch(branch, /\[\.\.\.\(result\.posts \|\| \[\]\), \.\.\.\(current \|\| \[\]\)\.filter/)
  assert.match(branch, /const fresh = result\.posts \|\| \[\]/)
  // Deeper pages are untouched and the cursor is still left alone.
  const pagedBranch = branch.slice(branch.indexOf('if (pagedRef.current)'), branch.indexOf('} else {'))
  assert.doesNotMatch(pagedBranch, /setNextCursor/)
})

test('bughunt-2: a visitor profile shows each book once — no shelf + 上架 double', () => {
  // Off-self ownBooks is null, so the shelf section and the 上架 section
  // both mapped the same publications list. The shelf is now the
  // owner's only; visitors keep 上架 with the full list.
  const shelf = slice('<section className="profile-sec profile-shelf"', '<section className="profile-sec" aria-label="上架"')
  assert.match(main, /\{isSelf && \(\n\s*<section className="profile-sec profile-shelf"/)
  const store = slice('aria-label="上架"', '</section>')
  assert.match(store, /publications\.map\(\(publication\) => \(/)
  assert.match(store, /ProfileStoreCard/)
})

test('bughunt-3: the shelf empty note echoes what the reader typed', () => {
  // query is the lowercased match key; the empty note used to echo it,
  // so "ABC" came back as "abc" while the box still showed "ABC".
  assert.match(main, /书架上没有找到「\{shelfQuery\.trim\(\)\}」/)
  assert.doesNotMatch(main, /书架上没有找到「\{query\}」/)
})

test('bughunt-4: renaming a borrowed spawn point in god mode keeps its hook, and the hook is editable', () => {
  // The custom-world branch's name box used to wipe startPointHook on
  // every keystroke, and the branch had no hook field to write it back
  // — the 11-09 #6 enter-page fix never reached the forge side.
  assert.doesNotMatch(main, /set\(\{ startPointName: event\.target\.value, startPointHook: "" \}\)/)
  // Three "开局处境（选填）" fields now: god mode, preset-world custom
  // point, and the enter page.
  assert.ok((main.match(/开局处境（选填）/g) || []).length >= 3)
  assert.match(main, /maxLength=\{START_POINT_HOOK_MAX\}[\s\S]{0,400}value=\{draft\.startPointHook \|\| ""\}/)
})

test('bughunt-5: a directory / bookmark / find jump cancels a pending cross-chapter slide', () => {
  // chapterTurn arms the slide before advancing; when the next chapter
  // is still generating the arm outlived the tap, and the next
  // unrelated jump played the stale direction's slide-in.
  // cancelCrossTurn had no caller in main.jsx at all before this fix.
  const calls = main.match(/reading\.cancelCrossTurn\(\)/g) || []
  assert.ok(calls.length >= 4, `expected 4+ cancel sites, got ${calls.length}`)
  assert.match(slice('const selectLocation =', 'const openTools ='), /reading\.cancelCrossTurn\(\)/)
  assert.match(slice('const enterProse =', 'const endMatter = ('), /reading\.cancelCrossTurn\(\)/)
  // The arm itself is still set by a real turn — the pending chapter
  // keeps its slide when it arrives.
  assert.match(slice('const chapterTurn =', 'useEffect(() => { reading.completeCrossTurn'), /reading\.beginCrossTurn\(direction\)/)
})

test('bughunt-6: picking "write your own" ability and leaving it blank stops on the step', () => {
  // next() used to roll a random library ability (flipping the source
  // to swap) — or quietly keep the previously picked one — while the
  // radio still showed "custom". An empty custom pick now blocks with
  // a message instead of rewriting the pick behind the reader's back.
  const nextFn = slice('const next = () => {', 'const back = ()')
  const guardAt = nextFn.indexOf('abilitySourceEff === "custom" && !customAbility.trim()')
  assert.notEqual(guardAt, -1, 'missing custom-empty guard in next()')
  const rollAt = nextFn.indexOf('if (step === 4 && !abilityPick) rollAbility()')
  assert.notEqual(rollAt, -1, 'missing roll fallback in next()')
  assert.ok(guardAt < rollAt, 'the guard must run before the roll')
  assert.match(nextFn, /先写下你的能力，再继续。/)
})

function makeSocialServiceWithStores(clock = T0) {
  const store = createMemorySocialStore()
  const feedStore = createMemoryFeedStore()
  const ratingsStore = createMemoryRatingsStore()
  const service = createSocialService({
    env: {}, store,
    plazaStore: createMemoryPlazaStore(),
    avatarStore: createMemoryAvatarStore(),
    coverStore: createMemoryCoverStore(),
    identityStore: createMemoryIdentityStore(),
    feedStore, ratingsStore,
    now: () => clock,
  })
  return { store, feedStore, ratingsStore, service }
}

test('bughunt-7: clipped notification quotes carry an ellipsis — comment, rating, like excerpt', async () => {
  // clip() is a silent slice; quotes rendered inside 「」 read as the
  // other person's full words. Over-long quotes now end with "…",
  // short ones are untouched.
  assert.match(socialServer, /const clipMarked = \(value, length\)/)
  assert.match(socialServer, /commentText: clipMarked\(record\.content, 120\)/)
  assert.match(socialServer, /ratingText: clipMarked\(record\.text, 120\)/)
  assert.match(feedServer, /postExcerpt: clipMarked\(post\.content, 60\)/)

  const { feedStore, ratingsStore, service } = makeSocialServiceWithStores()
  const author = 'username:author'
  const reader = 'username:reader'
  const longComment = '评'.repeat(150)
  const longRating = '好'.repeat(150)
  await feedStore.putComment({
    id: 'comment-long', postId: 'post-1', postAuthorUid: author, authorUid: reader,
    content: longComment, status: 'active', createdAt: iso(T0),
  })
  await feedStore.putComment({
    id: 'comment-short', postId: 'post-1', postAuthorUid: author, authorUid: reader,
    content: '短评', status: 'active', createdAt: iso(T0 - 1000),
  })
  await ratingsStore.putRating({
    bookId: 'book-1', bookTitle: '书', bookAuthorUid: author, userUid: reader,
    stars: 5, text: longRating, createdAt: iso(T0),
  })
  const payload = await service.notifications({ uid: author })
  const items = payload.categories.activity.items
  const commentNote = items.find((item) => item.kind === 'comment' && item.target.commentId === 'comment-long')
  assert.ok(commentNote, 'the long comment lands in 互动')
  assert.equal(commentNote.target.commentText, `${'评'.repeat(120)}…`)
  const shortNote = items.find((item) => item.kind === 'comment' && item.target.commentId === 'comment-short')
  assert.equal(shortNote.target.commentText, '短评')
  const ratingNote = items.find((item) => item.kind === 'rating')
  assert.ok(ratingNote, 'the rating lands in 互动')
  assert.equal(ratingNote.target.ratingText, `${'好'.repeat(120)}…`)

  // Like excerpt: clipped at write time in the feed service.
  const bareSocialStore = { getProfileRecord: async () => null, getPicture: async () => null }
  const bareAvatarStore = { getProfile: async () => null }
  const likeStore = createMemoryPlazaFeedStore()
  const feed = createPlazaFeedService({
    env: {}, store: likeStore, books: null, socialStore: bareSocialStore, avatarStore: bareAvatarStore,
  })
  const longPost = '帖'.repeat(100)
  await likeStore.putPost({
    id: 'post-long', type: 'free_text', authorUid: author, authorName: 'author',
    content: longPost, likeCount: 0, commentCount: 0, status: 'active',
    reporters: [], createdAt: iso(T0), updatedAt: iso(T0),
  })
  const liked = await feed.toggleLike({ uid: reader }, 'post-long')
  assert.equal(liked.liked, true)
  const likes = await likeStore.listLikesByPost('post-long')
  assert.equal(likes.length, 1)
  assert.equal(likes[0].postExcerpt, `${'帖'.repeat(60)}…`)
})
