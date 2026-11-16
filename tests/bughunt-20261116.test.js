import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  refreshFocusPost,
  mergeRefreshedPosts,
  fetchPlazaRefreshPages,
  enterAbilityBlockedReason,
} from '../src/plaza.js'
import { FOLLOWING_CHANGED_EVENT, notifyFollowingChanged } from '../src/users.js'
import { mergedBookOriginHint, canStartNextSeason, manualTagsOf } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../src/components/ReadingTools.jsx', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-16: guard assertions for this round's fixes.
// Base: origin/main 1623ede (bughunt-20261111 merged; 20261112/13/14/15
// branches pushed but unmerged). 8 fixes; B-2 and C-1 are one item.

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})
const token = async () => 'tok-16'
const post = (id, v) => ({ id, content: `v${v}` })

// A-1: the pinned permalink post refreshes on the tick.
test('A-1 refreshFocusPost: fresh copy returns, gone post reports deleted, blip leaves the card alone', async () => {
  const fresh = await refreshFocusPost({
    id: 'post-9', getAccessToken: token,
    fetchImpl: async (url) => {
      assert.equal(url, '/api/plaza/posts/post-9')
      return jsonResponse(200, { post: post('post-9', 2) })
    },
  })
  assert.deepEqual(fresh, { post: post('post-9', 2), deleted: false })

  const gone = await refreshFocusPost({
    id: 'post-9', getAccessToken: token,
    fetchImpl: async () => jsonResponse(404, { error: 'gone' }),
  })
  assert.deepEqual(gone, { post: null, deleted: true })

  const empty = await refreshFocusPost({
    id: 'post-9', getAccessToken: token,
    fetchImpl: async () => jsonResponse(200, { post: null }),
  })
  assert.deepEqual(empty, { post: null, deleted: true })

  const blip = await refreshFocusPost({
    id: 'post-9', getAccessToken: token,
    fetchImpl: async () => { throw new Error('offline') },
  })
  assert.deepEqual(blip, { post: undefined, deleted: false }, 'a transient failure must not flash "deleted"')

  assert.ok(main.includes('refreshFocusPost({ id: focusId'), 'tick calls the focus refresh')
  assert.ok(main.includes('if (focus.deleted) { setFocusPost(null); setFocusFailed(true); }'), 'gone post clears the pin')
})

// A-2: the tick re-fetches the loaded window and swaps fresh copies in place.
test('A-2 mergeRefreshedPosts: page 1 leads, loaded posts refresh in place, never-loaded deep posts stay out', () => {
  const current = [post('a', 1), post('b', 1), post('c', 1)]
  const merged = mergeRefreshedPosts(current, [[post('b', 2), post('d', 1)], [post('a', 2), post('e', 1)]])
  assert.deepEqual(merged.map((entry) => entry.id), ['b', 'd', 'a', 'c'])
  assert.equal(merged.find((entry) => entry.id === 'a').content, 'v2', 'deep post refreshed in place')
  assert.equal(merged.find((entry) => entry.id === 'c').content, 'v1', 'unfetched post keeps its old copy')
  assert.equal(merged.find((entry) => entry.id === 'e'), undefined, 'a deep post never loaded is never appended')
  assert.deepEqual(mergeRefreshedPosts(null, [[post('x', 1)]]), [post('x', 1)])
  assert.deepEqual(mergeRefreshedPosts([post('a', 1)], []), [post('a', 1)])
})

test('A-2 fetchPlazaRefreshPages: walks one page past the loaded window, caps, and keeps page 1 on a mid-walk failure', async () => {
  const pagesByCursor = {
    '': { posts: Array.from({ length: 20 }, (_, i) => post(`p${i + 1}`, 1)), nextCursor: 'c1', onlineCount: 7 },
    c1: { posts: Array.from({ length: 20 }, (_, i) => post(`p${i + 21}`, 1)), nextCursor: 'c2', onlineCount: 7 },
    c2: { posts: Array.from({ length: 20 }, (_, i) => post(`p${i + 41}`, 1)), nextCursor: null, onlineCount: 7 },
  }
  const fetchImpl = async (url) => {
    const cursor = new URL(url, 'http://x').searchParams.get('cursor') || ''
    return jsonResponse(200, pagesByCursor[cursor])
  }
  const walked = await fetchPlazaRefreshPages({ getAccessToken: token, loadedCount: 40, fetchImpl })
  assert.equal(walked.pages.length, 3, '40 loaded posts walk 3 pages (one past the window)')
  assert.equal(walked.pages.flat().length, 60)
  assert.equal(walked.onlineCount, 7)

  const single = await fetchPlazaRefreshPages({ getAccessToken: token, loadedCount: 0, fetchImpl })
  assert.equal(single.pages.length, 1, 'an unpaged list only ever needs page 1')

  let calls = 0
  const flaky = await fetchPlazaRefreshPages({
    getAccessToken: token, loadedCount: 40,
    fetchImpl: async (url) => {
      calls += 1
      if (calls > 1) throw new Error('offline')
      return jsonResponse(200, pagesByCursor[''])
    },
  })
  assert.equal(flaky.pages.length, 1, 'a later page failing keeps page 1 instead of failing the tick')
  assert.equal(flaky.pages[0].length, 20)

  await assert.rejects(
    fetchPlazaRefreshPages({
      getAccessToken: token, loadedCount: 40,
      fetchImpl: async () => { throw new Error('offline') },
    }),
    /offline/,
    'page 1 failing throws so the caller can fall back to its old merge',
  )
  assert.ok(main.includes('fetchPlazaRefreshPages({ getAccessToken: getToken, loadedCount: postsRef.current?.length || 0 })'), 'tick walks the loaded window')
})

// A-3: follow/unfollow broadcasts so the keep-alive plaza strip re-reads.
test('A-3 following broadcast: event name is stable and notify dispatches it; plaza listens, profile notifies', () => {
  assert.equal(FOLLOWING_CHANGED_EVENT, 'storyweave:following-changed')
  const seen = []
  const previousWindow = globalThis.window
  globalThis.window = {
    dispatchEvent: (event) => { seen.push(event.type); return true },
    CustomEvent: class { constructor(type) { this.type = type } },
  }
  try {
    notifyFollowingChanged()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
  assert.deepEqual(seen, ['storyweave:following-changed'])
  assert.ok(main.includes('window.addEventListener(FOLLOWING_CHANGED_EVENT, refreshFollowing)'), 'plaza re-reads on the broadcast')
  assert.equal(main.split('notifyFollowingChanged()').length - 1, 2, 'both follow toggles broadcast (profile button + connections list)')
})

// B-1: the merged book's origin line names its real shape.
test('B-1 mergedBookOriginHint: short says 6, season says per-season 24, long says 100, endless keeps its line', () => {
  const merged = (mode, extra = {}) => ({ kind: 'merged', config: { storyLengthMode: mode, ...extra } })
  assert.equal(mergedBookOriginHint(merged('short')), '这是一本 6 章的合流书，走完即止。')
  assert.equal(mergedBookOriginHint(merged('season')), '这是一本季模式的合流书，每季 24 章，走完一季即告一段落。')
  assert.equal(mergedBookOriginHint(merged('long')), '这是一本 100 章的合流书，走完即止。')
  assert.equal(mergedBookOriginHint(merged('custom', { targetChapters: 10 })), '这是一本 10 章的合流书，走完即止。')
  assert.equal(mergedBookOriginHint(merged('endless')), '这条线继承了无限连载：没有预设终章，每 12 章一弧，直到你亲手为它完结。')
  assert.ok(!main.includes('这是一本 6 章的合流短篇'), 'the hard-coded "6 章短篇" copy is gone')
  assert.ok(main.includes('mergedBookOriginHint(story)'), 'settings uses the mode-aware hint')
})

// B-2/C-1: the in-book search box shows its 100-char count.
test('B-2/C-1 reading search box carries a live N / 100 count next to its cap', () => {
  const labelAt = tools.indexOf('reading-search-label')
  assert.notEqual(labelAt, -1, 'search label exists')
  const label = tools.slice(labelAt, tools.indexOf('</label>', labelAt))
  assert.ok(label.includes('maxLength={100}'), 'search box still caps at 100')
  assert.ok(label.includes('{query.length} / 100'), 'count sits next to the capped input')
  assert.ok(label.includes('className="da-count"'), 'count uses the house counter style')
})

// B-3: a blank custom ability on the enter page stops instead of silently swapping.
test('B-3 enterAbilityBlockedReason: blank custom ability stops with the forge wording; anything else proceeds', () => {
  assert.equal(enterAbilityBlockedReason({ source: 'custom', customText: '' }), '先写下你的能力，再继续。')
  assert.equal(enterAbilityBlockedReason({ source: 'custom', customText: '   ' }), '先写下你的能力，再继续。')
  assert.equal(enterAbilityBlockedReason({ source: 'custom', customText: '御剑' }), null)
  assert.equal(enterAbilityBlockedReason({ source: 'signature', customText: '' }), null)
  assert.equal(enterAbilityBlockedReason({ source: 'swap', customText: '' }), null)
  assert.ok(main.includes('enterAbilityBlockedReason({ source: enterSourceEff, customText: enterCustomAbility })'), 'enter page gates on it')
})

// B-4: a finished fused season never offers "开启下一季".
test('B-4 canStartNextSeason: season rolls over, a merged season does not', () => {
  const story = (mode, kind) => ({ kind, config: { storyLengthMode: mode } })
  assert.equal(canStartNextSeason(story('season', 'single')), true)
  assert.equal(canStartNextSeason(story('season', 'merged')), false)
  assert.equal(canStartNextSeason(story('short', 'single')), false)
  assert.equal(canStartNextSeason(story('endless', 'single')), false)
  assert.ok(main.includes('lengthMode === "season" && canStartNextSeason(story)'), 'chapter-end button is gated on it')
})

// C-2: the manual-book tag field discloses the 12-char per-tag cut.
test('C-2 manual tag field discloses the per-tag 12-char cut that cleanManualTags applies', () => {
  assert.ok(main.includes('标签（可不填，用顿号隔开，最多 5 个，每条最多 12 字）'), 'tag field names both caps')
  assert.deepEqual(manualTagsOf({ config: { tags: ['1234567890123', '短'] } }), ['123456789012', '短'])
})
