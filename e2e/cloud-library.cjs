// Cloud library e2e: books follow the account.
//
// Runs against the fixture server in cloud-library-shots/dev-server.mjs
// (spawned automatically unless TARGET_URL points at an already-running
// instance of it). The flow, all in isolated browser contexts:
//
//   A. A signed-in browser holding a local book uploads it (and its
//      reading position) to the account — verified against the API.
//   B. A FRESH browser with only the sign-in session restores the book
//      and its reading position from the cloud, and the shelf says so.
//   C. A signed-out browser with a local book shows the honest
//      "browser only" line (screenshot).
//
// No real generation and no paid calls: the book is a fixture written
// straight into local storage, exactly the shape the app itself saves.
//
//   node e2e/cloud-library.cjs            (spawns the fixture server)
//   TARGET_URL=http://127.0.0.1:8927 node e2e/cloud-library.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'cloud-library-shots');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const headless = /^(true|1)$/i.test(process.env.HEADLESS ?? process.env.PW_HEADLESS ?? 'false');
const FIXTURE_PORT = 8927;

const STORAGE_KEY = 'storyweave:v2';
const SESSION_KEY = 'storyweave.site-session';
const READING_KEY = 'storyweave:reading-locations:v1';

function chapter(index, paragraphs) {
  const base = {
    id: `fixture-ch-${index}`,
    title: `第 ${index + 1} 章`,
    index,
    paragraphs,
    summary: '',
    events: [`事件 ${index}`],
    foreshadowing: [],
  };
  if (index % 6 === 1) {
    base.choice = { prompt: '如何抉择？', options: [{ id: 'open', label: '迎上去' }, { id: 'wait', label: '再等等' }] };
  }
  return base;
}

function fixtureStory(id, title) {
  const chapters = [
    chapter(0, ['雾从港口升起来的时候，守塔人听见了潮声里的回信。', '他把灯芯拨亮，等那封信自己走上塔来。']),
    chapter(1, ['信没有署名，只有一枚被海水泡软的印章。', '印章上刻着一座他从未去过的城。']),
    chapter(2, ['天亮之前，他把灯塔的门锁好，沿着堤岸向那座城走去。']),
  ];
  return {
    id,
    title,
    genreId: 'fantasy',
    config: { protagonist: '守塔人', storyLengthMode: 'season' },
    worldBible: { premise: '雾港的灯塔守着一封没有署名的信。', rules: ['潮声会带回信'], outline: ['起雾', '得信', '启程'] },
    chapterIndex: 3,
    chapters,
    choices: { 1: 'open' },
    revision: 1,
    readerIndex: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    status: 'reading',
  };
}

function fixtureLibrary(story) {
  return { version: 2, stories: [story], activeStoryId: story.id, publications: [], favorites: [], draft: null };
}

// The reading-location key for a chapter, recomputed the way
// src/reading-location.js builds it (FNV-1a over the joined paragraphs).
function chapterLocationKey(storyId, chapterIndex, paragraphs) {
  let hash = 2166136261;
  for (const char of paragraphs.join('\n')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `private:${storyId}:${chapterIndex}:${(hash >>> 0).toString(36)}`;
}

async function waitFor(check, label, timeoutMs = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function api(base, route, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function registerUser(base, username) {
  const { status, json } = await api(base, '/api/auth/username/register', {
    method: 'POST', body: { username, password: 'cloud-library-pass-1' },
  });
  assert.equal(status, 200, `register ${username}`);
  assert.ok(json.token && json.uid, 'register returns a session token and uid');
  return {
    token: json.token,
    session: {
      token: json.token,
      uid: json.uid,
      email: null,
      provider: 'username',
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
  };
}

async function startFixtureServer() {
  if (process.env.TARGET_URL) return { base: process.env.TARGET_URL, child: null };
  const child = spawn(process.execPath, [path.join(shotsDir, 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await waitFor(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  }, 'fixture server health', 30_000);
  return { base, child };
}

async function seedContext(browser, base, seed) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/#/home`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ session, library, reading }) => {
    if (session) localStorage.setItem('storyweave.site-session', JSON.stringify(session));
    if (library) localStorage.setItem('storyweave:v2', JSON.stringify(library));
    if (reading) localStorage.setItem('storyweave:reading-locations:v1', JSON.stringify(reading));
  }, seed);
  // A reload, not a second goto: the URL (hash included) is unchanged, so
  // a goto would stay in the same document and the app would keep the
  // empty in-memory shelf it booted with.
  await page.reload({ waitUntil: 'domcontentloaded' });
  return { context, page, errors };
}

async function noOverflow(page, label) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(Math.max(sizes.document, sizes.body) <= sizes.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(sizes)}`);
}

async function main() {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch({ headless });
  const results = [];
  const check = (name, fn) => { fn(); results.push(name); };
  try {
    const story = fixtureStory('fixture-mist-01', '雾港守塔人');
    const anchorKey = chapterLocationKey(story.id, 1, story.chapters[1].paragraphs);
    const reading = { version: 1, locations: [{ key: anchorKey, anchor: { paragraph: 1, offset: 0.25 } }], bookmarks: [] };
    const { token, session } = await registerUser(base, `cloud_walk_${Date.now().toString(36)}`);

    // --- A: a signed-in browser uploads its local book ----------------
    const a = await seedContext(browser, base, { session, library: fixtureLibrary(story), reading });
    const uploaded = await waitFor(async () => {
      const { json } = await api(base, '/api/library', { token });
      return json?.stories?.some((entry) => entry.id === story.id) ? json : null;
    }, 'the local book to reach the account index');
    check('A: local book uploaded to the account on sign-in', () => {
      assert.equal(uploaded.stories.find((entry) => entry.id === story.id).chapterCount, 3);
    });
    const cloudStory = await waitFor(async () => {
      const { status, json } = await api(base, `/api/library/stories/${story.id}`, { token });
      return status === 200 ? json.story : null;
    }, 'the uploaded story body');
    check('A: uploaded story keeps chapters, world bible and reading position', () => {
      assert.equal(cloudStory.chapters.length, 3);
      assert.equal(cloudStory.readerIndex, 1);
      assert.equal(cloudStory.worldBible.premise, story.worldBible.premise);
    });
    const cloudReading = await waitFor(async () => {
      const { json } = await api(base, '/api/library', { token });
      return json?.readingState?.state?.locations?.some((entry) => entry.key === anchorKey) ? json.readingState : null;
    }, 'the reading position to reach the account');
    check('A: paragraph reading position uploaded with the shelf', () => {
      assert.equal(cloudReading.state.locations[0].anchor.paragraph, 1);
    });
    assert.deepEqual(a.errors, [], 'context A page errors');

    // --- B: a fresh browser restores book + position ------------------
    const b = await seedContext(browser, base, { session, library: null, reading: null });
    const restoredRaw = await waitFor(async () => b.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), 'the shelf to restore locally');
    check('B: fresh browser restores the book from the account', () => {
      const restored = JSON.parse(restoredRaw);
      const book = restored.stories.find((entry) => entry.id === story.id);
      assert.ok(book, 'the fixture book is back on the shelf');
      assert.equal(book.readerIndex, 1, 'the chapter position came back with it');
      assert.equal(book.chapters.length, 3);
    });
    const restoredReading = await waitFor(async () => {
      const raw = await b.page.evaluate((key) => localStorage.getItem(key), READING_KEY);
      return raw && raw.includes(anchorKey) ? raw : null;
    }, 'the paragraph anchor to restore');
    check('B: paragraph reading position restored too', () => {
      assert.ok(restoredReading.includes('"paragraph":1'));
    });
    await b.page.waitForSelector('text=雾港守塔人', { timeout: 15_000 });
    await b.page.waitForSelector('text=第 2 / 24 章', { timeout: 15_000 });
    check('B: the shelf shows the book at its reading position', () => {});
    const syncedNote = await b.page.textContent('.library-sync-note');
    check('B: the shelf states the book is account-synced', () => {
      assert.match(syncedNote, /已同步到你的账号/);
    });
    await noOverflow(b.page, 'B home');
    // The note sits one flick below the fold; the app scrolls through
    // Lenis, so drive it with a real wheel gesture and let it settle.
    await b.page.mouse.move(195, 422);
    await b.page.mouse.wheel(0, 420);
    await b.page.waitForTimeout(900);
    await b.page.screenshot({ path: path.join(shotsDir, '02-restored-shelf.png') });
    assert.deepEqual(b.errors, [], 'context B page errors');

    // --- C: signed out, the shelf says the book is browser-only -------
    const guestStory = fixtureStory('fixture-guest-01', '未登录的雾港');
    const c = await seedContext(browser, base, { session: null, library: fixtureLibrary(guestStory), reading: null });
    await c.page.waitForSelector('text=未登录的雾港', { timeout: 15_000 });
    const guestNote = await c.page.textContent('.library-sync-note');
    check('C: signed-out shelf states books live in this browser and sync on sign-in', () => {
      assert.match(guestNote, /只保存在当前浏览器/);
      assert.match(guestNote, /登录后自动同步到账号/);
    });
    await noOverflow(c.page, 'C home');
    await c.page.mouse.move(195, 422);
    await c.page.mouse.wheel(0, 420);
    await c.page.waitForTimeout(900);
    await c.page.screenshot({ path: path.join(shotsDir, '01-logged-out-local-note.png') });
    assert.deepEqual(c.errors, [], 'context C page errors');

    for (const { context } of [a, b, c]) await context.close();
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
  fs.writeFileSync(path.join(artifactDir, 'cloud-library-report.json'), JSON.stringify({ ok: true, checks: results }, null, 2));
  process.stdout.write(`cloud-library e2e: ${results.length} checks passed\n${results.map((name) => `  ✓ ${name}`).join('\n')}\n`);
}

main().catch((error) => {
  process.stderr.write(`cloud-library e2e FAILED: ${error.stack || error}\n`);
  process.exitCode = 1;
});
