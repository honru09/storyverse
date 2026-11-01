// GENFIX-20261101 guard tests — DESIGN §61 生成单次点击死规则 +
// the forge confirmation-step display fixes (topbar bleed-through,
// floating action bar covering the last text line).
//
// The dead rule, pinned: one click finishes the job by itself.
// Transient failures (network error, 502/503/504, plain 429, a lost
// or unparseable response) retry automatically with growing backoff,
// replaying the IDENTICAL payload — the replay is the reconciliation,
// because the server's delivery registry answers a settled chapter
// from its fingerprint before any freeze or provider call, so a
// chapter is never generated or charged twice. Refusals a retry
// cannot change (sign-in, quota, coins) never retry. Only spent
// retries surface the error, with the caller's resume affordance as
// the last resort.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acceptChapter, buildChapter, chapterKey, createStory, queueIntervention } from '../src/story-engine.js'
import { GENERATION_RETRY_DELAYS_MS, requestChapter, requestChapterRevision } from '../src/generation.js'

const fresh = () => ({ ...createStory({ name: '旅人' }), engine: 'gemini' })
const resultFor = (story, index) => ({ chapter: buildChapter(story, index), key: chapterKey(story, index) })
const NO_WAIT = [0, 0, 0]

test('dead rule: the retry ladder is three growing delays after the first attempt', () => {
  assert.equal(GENERATION_RETRY_DELAYS_MS.length, 3)
  assert.ok(GENERATION_RETRY_DELAYS_MS[0] >= 1_000)
  assert.ok(GENERATION_RETRY_DELAYS_MS[0] < GENERATION_RETRY_DELAYS_MS[1])
  assert.ok(GENERATION_RETRY_DELAYS_MS[1] < GENERATION_RETRY_DELAYS_MS[2])
})

test('one click: a network error on the first attempt recovers by itself', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls < 3) throw new TypeError('fetch failed')
    return Response.json(result)
  }
  assert.deepEqual(await requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT }), result)
  assert.equal(calls, 3)
})

test('one click: a 502 on the first attempt recovers by itself', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) return Response.json({ error: 'bad gateway' }, { status: 502 })
    return Response.json(result)
  }
  assert.deepEqual(await requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT }), result)
  assert.equal(calls, 2)
})

test('one click: a lost (unparseable) response recovers by itself', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    // The chapter may already be settled server-side; the body just
    // never made it back in one piece.
    if (calls === 1) return new Response('<html>proxy error</html>', { status: 200 })
    return Response.json(result)
  }
  assert.deepEqual(await requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT }), result)
  assert.equal(calls, 2)
})

test('reconciliation: every replay sends the identical payload, byte for byte', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  const bodies = []
  let calls = 0
  const fetchImpl = async (_url, options) => {
    bodies.push(options.body)
    calls += 1
    if (calls < 3) return Response.json({ error: 'busy' }, { status: 503 })
    return Response.json(result)
  }
  await requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT })
  assert.equal(bodies.length, 3)
  assert.ok(bodies.every((body) => body === bodies[0]), 'replays must reproduce the delivery fingerprint exactly')
})

test('spent retries: the error surfaces only after every attempt, and onRetry reported each one', async () => {
  let calls = 0
  const retries = []
  await assert.rejects(
    requestChapter(fresh(), 0, {
      fetchImpl: async () => { calls += 1; return Response.json({ error: 'busy' }, { status: 503 }) },
      retryDelaysMs: NO_WAIT,
      onRetry: (info) => retries.push(info),
    }),
    /暂不可用/,
  )
  assert.equal(calls, 4, 'first attempt + 3 retries, then it may fail')
  assert.equal(retries.length, 3)
  assert.deepEqual(retries.map((info) => info.attempt), [1, 2, 3])
})

test('refusals a retry cannot change never retry: quota, coins, sign-in', async () => {
  let calls = 0
  const quotaFetch = async () => { calls += 1; return Response.json({ error: 'x', code: 'quota-exceeded' }, { status: 429 }) }
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl: quotaFetch, retryDelaysMs: NO_WAIT }), /额度已用完/)
  assert.equal(calls, 1)

  calls = 0
  const coinsFetch = async () => { calls += 1; return Response.json({ error: 'x', code: 'coins-exhausted' }, { status: 402 }) }
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl: coinsFetch, retryDelaysMs: NO_WAIT }), /织币不足/)
  assert.equal(calls, 1)

  calls = 0
  const authFetch = async () => { calls += 1; return Response.json({ error: 'x', code: 'auth-required' }, { status: 401 }) }
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl: authFetch, retryDelaysMs: NO_WAIT }), /请先登录/)
  assert.equal(calls, 1)
})

test('a plain 429 (provider busy, no quota code) is transient and retries', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) return Response.json({ error: 'busy' }, { status: 429 })
    return Response.json(result)
  }
  assert.deepEqual(await requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT }), result)
  assert.equal(calls, 2)
})

test('aborting during the backoff stops the loop at once — a cancel is not a failure', async () => {
  const controller = new AbortController()
  let calls = 0
  const fetchImpl = async () => { calls += 1; throw new TypeError('fetch failed') }
  const pending = requestChapter(fresh(), 0, {
    fetchImpl,
    signal: controller.signal,
    retryDelaysMs: [60_000, 60_000, 60_000],
  })
  // Let the first attempt fail and the backoff begin, then cancel.
  await new Promise((resolve) => setTimeout(resolve, 25))
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('freeze race: coins-exhausted DURING a recovery sequence is not final — the in-flight attempt may be about to land', async () => {
  // Attempt 1 drops off the network while the server keeps
  // generating; the replay arrives before settlement, misses the
  // registry and is refused at the coin freeze the first attempt is
  // still holding. The loop must not surface 织币不足 there: the
  // next replay reconciles with the landed chapter.
  const story = fresh()
  const result = resultFor(story, 0)
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) throw new TypeError('fetch failed')
    if (calls === 2) return Response.json({ error: 'x', code: 'coins-exhausted' }, { status: 402 })
    return Response.json(result)
  }
  assert.deepEqual(await requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT }), result)
  assert.equal(calls, 3)
})

test('freeze race, spent: if every replay still meets the freeze, the coins error surfaces at the end', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) throw new TypeError('fetch failed')
    return Response.json({ error: 'x', code: 'coins-exhausted' }, { status: 402 })
  }
  await assert.rejects(requestChapter(fresh(), 0, { fetchImpl, retryDelaysMs: NO_WAIT }), /织币不足/)
  assert.equal(calls, 4)
})

test('Retry-After floors the next wait instead of the ladder burning retries inside the cooldown', async () => {
  const story = fresh()
  const result = resultFor(story, 0)
  const retries = []
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) return Response.json({ error: 'busy' }, { status: 429, headers: { 'Retry-After': '1' } })
    return Response.json(result)
  }
  assert.deepEqual(await requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT, onRetry: (info) => retries.push(info) }), result)
  assert.equal(retries.length, 1)
  assert.ok(retries[0].delayMs >= 1_000, `Retry-After 1s must floor the wait, got ${retries[0].delayMs}ms`)
})

test('the intervention revision path recovers through the same loop', async () => {
  const accept = (story, index) => acceptChapter(story, buildChapter(story, index), chapterKey(story, index))
  let story = { ...accept(accept(createStory({ name: '阿遥' }), 0), 1), engine: 'gemini', readerIndex: 0 }
  story = queueIntervention(story, { text: '让雾在午夜散开一次', readerIndex: 0 })
  const revised = { chapter: buildChapter(story, 1), key: chapterKey(story, 1) }
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) return Response.json({ error: 'timeout' }, { status: 504 })
    return Response.json(revised)
  }
  const result = await requestChapterRevision(story, 1, { fetchImpl, retryDelaysMs: NO_WAIT })
  assert.equal(result.key, revised.key)
  assert.equal(calls, 2)
})

test('a mismatched result is a validation refusal, not a transient failure — no retry', async () => {
  const story = fresh()
  let calls = 0
  const fetchImpl = async () => { calls += 1; return Response.json({ ...resultFor(story, 0), key: 'wrong' }) }
  await assert.rejects(requestChapter(story, 0, { fetchImpl, retryDelaysMs: NO_WAIT }), /不匹配/)
  assert.equal(calls, 1)
})

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('confirm-step display: the topbar is densified without touching the pinned theme tokens', () => {
  // The salt guards pin --topbar-bg value-for-value (aurora freeze),
  // so the no-ghost fix must NOT rewrite the tokens — it densifies
  // the bar's effective background in the salt topbar rule by mixing
  // the token toward each theme's own opaque --surface-solid
  // (effective alpha .95–.97, hue in-family).
  assert.ok(css.includes('--topbar-bg:rgba(6,13,31,.93)'), 'aurora topbar token stands')
  assert.ok(css.includes('--topbar-bg:rgba(17,18,20,.88)'), 'black topbar token stands')
  assert.ok(css.includes('--topbar-bg:rgba(246,245,242,.90)'), 'white topbar token stands')
  assert.match(
    css,
    /html\[data-shell-theme='black'\] \.topbar,html\[data-shell-theme='white'\] \.topbar,html\[data-shell-theme='aurora'\] \.topbar\{[^}]*background:color-mix\(in srgb,var\(--topbar-bg\) 40%,var\(--surface-solid\)\)/,
  )
})

test('confirm-step display: the floating action bar keeps its fixed positioning', () => {
  // Root cause (owner screenshot 2026-11-01): the bar computed to
  // position:relative on phone widths — aurora.css's pixelfx layering
  // rule `.forge-main>*:not(.forge-ambient-fx)` (specificity 0,2,0)
  // silently beat the `.forge-actions{position:fixed}` capsule rule
  // (0,1,0), so the bar fell back into the flow and sat on the
  // column's last text lines. Both halves are pinned: the fixed rule
  // exists, and the layering rule exempts the bar.
  assert.match(css, /\.forge-actions\{position:fixed;/)
  const aurora = readFileSync(new URL('../src/aurora.css', import.meta.url), 'utf8')
  assert.match(aurora, /\.forge-main>\*:not\(\.forge-ambient-fx\):not\(\.forge-actions\)\{position:relative;z-index:1\}/)
  // With fixed restored, the column's bottom padding is the second
  // line of defence: at max scroll the last line must clear the
  // capsule (top edge ~150px above the viewport bottom).
  const match = css.match(/\.forge-main\{padding-bottom:calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)\}/)
  assert.ok(match, 'forge-main bottom padding rule exists')
  assert.ok(Number(match[1]) >= 160, `forge-main bottom padding ${match[1]}px no longer clears the capsule`)
})

test('DESIGN §61 records the dead rule for review and future batches', () => {
  const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8')
  assert.match(design, /## §61 生成单次点击死规则/)
  assert.match(design, /GENERATION_RETRY_DELAYS_MS/)
})
