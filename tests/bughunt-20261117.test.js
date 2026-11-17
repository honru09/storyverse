import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { replacePlazaPost, appendRatingsPage } from '../src/plaza.js'
import { FRIENDS_CHANGED_EVENT, notifyFriendsChanged } from '../src/users.js'
import { withFollowingCount } from '../src/profile-cache.js'
import {
  appendManualChapter,
  chapterForReading,
  createManualStory,
  createStory,
  finishEndlessLine,
  isManualStory,
  isManuallyFinished,
  manualWrittenChapterCount,
} from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const social = readFileSync(new URL('../server/social.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-17: guard assertions for this round's fixes.
// Base: origin/main 1623ede (bughunt-20261111 merged; 20261112/13/14/15/16
// branches pushed but unmerged). 10 fixes: A-1…A-5, B-1…B-3, C-1…C-2.

const post = (id, content) => ({ id, content, likeCount: 0 })

// A-1: an edited post is written back into the parent's list, so the
// resync effect reads fresh props instead of replaying the old text.
test('A-1 replacePlazaPost: swaps the saved copy in place, leaves the rest alone', () => {
  const posts = [post('a', 'old'), post('b', 'keep')]
  const merged = replacePlazaPost(posts, post('a', 'new'))
  assert.equal(merged.find((entry) => entry.id === 'a').content, 'new')
  assert.equal(merged.find((entry) => entry.id === 'b').content, 'keep')
  assert.notEqual(merged, posts, 'a new list, not a mutation')
  assert.deepEqual(replacePlazaPost(posts, post('z', 'ghost')), posts)
  assert.equal(replacePlazaPost(null, post('a', 'new')), null)
  assert.equal(replacePlazaPost(posts, null), posts)

  assert.ok(main.includes('onEdited?.(updated);'), 'saveEdit writes the saved copy back up')
  assert.ok(main.includes('onEdited={(updated) => setPosts((current) => replacePlazaPost(current, updated))}'), 'stream card passes the write-back')
  assert.ok(main.includes('setPosts((current) => replacePlazaPost(current, updated));'), 'focus card writes back to the stream too')
})

// A-2: following from someone else's page moves the viewer's own
// following count in the cached own payload.
test('A-2 withFollowingCount: follow +1, unfollow −1, never below zero', () => {
  const profile = { uid: 'me', counts: { following: 3, followers: 9 } }
  assert.equal(withFollowingCount(profile, true).counts.following, 4)
  assert.equal(withFollowingCount(profile, false).counts.following, 2)
  assert.equal(withFollowingCount({ uid: 'me', counts: { following: 0 } }, false).counts.following, 0)
  assert.equal(withFollowingCount({ uid: 'me' }, true).counts.following, 1, 'a payload without counts starts at zero')
  assert.equal(withFollowingCount(profile, true).counts.followers, 9, 'other counts untouched')
  assert.equal(profile.counts.following, 3, 'no mutation')
  assert.equal(withFollowingCount(null, true), null)

  assert.ok(main.includes('withFollowingCount(own, result.following)'), 'both follow paths bump the cached own payload')
  assert.ok(main.includes('peekProfile({ viewerUid, uid: viewerUid })'), 'the bump reads the cached own profile')
})

// A-3: friend actions from a profile window broadcast; the panel listens.
test('A-3 notifyFriendsChanged: dispatches the event, silent without a window', () => {
  const seen = []
  const fakeWindow = {
    dispatchEvent: (event) => { seen.push(event.type); return true },
    CustomEvent: class { constructor(type) { this.type = type } },
  }
  globalThis.window = fakeWindow
  try {
    notifyFriendsChanged()
  } finally {
    delete globalThis.window
  }
  assert.deepEqual(seen, [FRIENDS_CHANGED_EVENT])
  assert.equal(FRIENDS_CHANGED_EVENT, 'storyweave:friends-changed')
  assert.doesNotThrow(() => notifyFriendsChanged(), 'no window is a silent no-op')

  assert.ok(main.includes('window.addEventListener(FRIENDS_CHANGED_EVENT, onFriendsChanged);'), 'FriendsPanel listens')
  assert.ok(main.includes('notifyFriendsChanged();'), 'actOnFriend broadcasts after a successful action')
})

// A-4: a save/delete re-fetches the pages the reader already opened.
test('A-4 appendRatingsPage: appends a page and advances the cursor', () => {
  const first = { ratings: [{ id: 'r1' }], nextCursor: 'c1', ratingCount: 3 }
  const second = { ratings: [{ id: 'r2' }], nextCursor: null }
  const merged = appendRatingsPage(first, second)
  assert.deepEqual(merged.ratings.map((entry) => entry.id), ['r1', 'r2'])
  assert.equal(merged.nextCursor, null)
  assert.equal(merged.ratingCount, 3, 'summary fields survive the append')
  assert.equal(appendRatingsPage(null, second), second)
  assert.equal(appendRatingsPage(first, null), first)

  assert.ok(main.includes('reloadKeepingPages'), 'save/delete reload through the page-keeping path')
  assert.ok(main.includes('loadedPagesRef'), 'the opened depth is tracked')
  assert.ok(main.includes('appendRatingsPage(merged, page)'), 'the re-fetch replays the same append')
  assert.ok(main.includes('const payload = await reloadKeepingPages();'), 'submit keeps pages')
  assert.ok(main.includes('const removedPayload = await reloadKeepingPages();'), 'delete keeps pages')
})

// A-5: one action, one note — save clears the delete note and back.
test('A-5 save and delete clear each other\'s note', () => {
  const section = main.slice(main.indexOf('function BookRatingsSection'))
  const submit = section.slice(section.indexOf('const submit = async'), section.indexOf('const remove = async'))
  const remove = section.slice(section.indexOf('const remove = async'), section.indexOf('const loadMore = async'))
  assert.ok(submit.includes('setRemoveNote("");'), 'save clears the delete note')
  assert.ok(remove.includes('setSaveNote("");'), 'delete clears the save note')
})

// B-1: a zero-chapter hand-written book has nothing to read — the
// reader must show an empty state, never template prose.
test('B-1 zero-chapter manual book: no stored chapter, nothing to fabricate from', () => {
  const book = createManualStory({ title: '雾港手记' })
  assert.equal(isManualStory(book), true)
  assert.equal(book.chapters.length, 0)
  assert.equal(manualWrittenChapterCount(book), 0)
  assert.equal(book.chapters[0], undefined, 'the empty-state condition (!story.chapters[index]) holds')

  assert.ok(main.includes('(isManualStory(story) ? null : buildChapter(story, index))'), 'the reader never fabricates a manual chapter')
  assert.ok(main.includes('story && chapter ? chapterLocationKey'), 'no location key without a real chapter')
  assert.ok(main.includes('这本书还没有章节。'), 'the empty state says so')
  assert.ok(main.includes('去写作台写第一章'), 'the empty state offers the desk')
})

// B-2: a hand-written book with no written chapter cannot be finished.
test('B-2 finishEndlessLine: empty manual book stays unfinished, written one finishes', () => {
  const empty = createManualStory({ title: '雾港手记' })
  assert.equal(finishEndlessLine(empty), empty, 'returned untouched, no finishedAt')
  assert.equal(isManuallyFinished(empty), false)

  const blankChapter = appendManualChapter(empty, { title: '第一章', text: '' })
  assert.equal(manualWrittenChapterCount(blankChapter), 0, 'an empty chapter is not a written chapter')
  assert.equal(finishEndlessLine(blankChapter), blankChapter)

  const written = appendManualChapter(empty, { title: '第一章', text: '雾从海上来。' })
  assert.equal(manualWrittenChapterCount(written), 1)
  const finished = finishEndlessLine(written)
  assert.equal(isManuallyFinished(finished), true)

  // A gemini endless line is untouched by the manual gate.
  const gemini = { ...createStory({ genreId: 'cultivation', storyLengthMode: 'endless' }), engine: 'gemini' }
  assert.equal(isManuallyFinished(finishEndlessLine(gemini)), true)

  assert.ok(main.includes('写完一章就能标记完结。'), 'the desk says so instead of offering the button')
})

// B-3: the queued-intervention note is no longer cleared by the
// revision effect that the queue itself triggers.
test('B-3 queued-intervention note: cleared on chapter change, not on revision', () => {
  const reader = main.slice(main.indexOf('function Reader'))
  const revisionEffect = reader.slice(
    reader.indexOf('useEffect(() => {\n    setSnapshotIndex(0);'),
    reader.indexOf('}, [story?.id, story?.revision, readOnly]);'),
  )
  assert.ok(revisionEffect.includes('setSnapshotIndex(0)'), 'found the reader reset effect')
  assert.ok(!revisionEffect.includes('setInterveneNote'), 'the revision effect no longer clears the note')
  assert.ok(main.includes('}, [story?.id, index, readOnly]);'), 'a chapter-scoped effect clears it instead')
  assert.ok(main.includes('setInterveneNote(`介入已记下，将落在第 ${(target ?? index) + 1} 章。`);'), 'the queue branch still sets the note')
})

// C-1: a malformed address is rejected before it can burn throttle.
test('C-1 email search: format checked before the throttle bump', () => {
  const checkAt = social.indexOf('if (!validEmailAddress(emailQuery))')
  const bumpAt = social.indexOf('searchBump(key, EMAIL_SEARCH_WINDOW_MS)')
  assert.ok(checkAt !== -1 && bumpAt !== -1 && checkAt < bumpAt, 'validate first, bump after')
  assert.ok(social.includes("throw new ApiError(400, '邮箱格式不对，先检查一下再搜。')"), 'a loud 400, not a silent empty page')
  assert.ok(main.includes('邮箱格式不对，先检查一下再搜。'), 'the client pre-check shows the same words')
})

// C-2: the fusion request row shows the avatar the applicant brings.
test('C-2 fusion request row renders the applicant avatar name', () => {
  assert.ok(main.includes('对方带来的化身：{item.target.avatarName}'), 'the row shows the carried avatar name')
  assert.ok(social.includes("avatarName: record.avatarName || ''"), 'the payload already carries it')
})
