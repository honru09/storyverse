// Delete-book e2e: a reader can delete their own unsatisfying book.
//
// Runs against the same fixture server as the cloud-library walk
// (cloud-library-shots/dev-server.mjs — real server, memory stores,
// username sign-in; spawned automatically unless TARGET_URL points at
// an already-running instance of it). Two fixture books are seeded
// into local storage and sync to the account, then:
//
//   A. The shelf book is deleted from its shelf cell: the confirmation
//      names the book, the shelf drops it at once, the account index
//      keeps a tombstone (and the body is gone), and a reload does not
//      resurrect it.
//   B. The active book is deleted from inside the reader, through its
//      设定集 danger section: after confirming, the app returns home
//      and the account index tombstones this book too.
//
//   node e2e/delete-book.cjs
//   TARGET_URL=http://127.0.0.1:8927 node e2e/delete-book.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'delete-book-shots');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const headless = /^(true|1)$/i.test(process.env.HEADLESS ?? process.env.PW_HEADLESS ?? 'false');
const FIXTURE_PORT = 8927;

const STORAGE_KEY = 'storyweave:v2';
const SESSION_KEY = 'storyweave.site-session';

function chapter(index, paragraphs) {
  return {
    id: `del-fixture-ch-${index}`,
    title: `第 ${index + 1} 章`,
    index,
    paragraphs,
    summary: '',
    events: [`事件 ${index}`],
    foreshadowing: [],
  };
}

function fixtureStory(id, title) {
  return {
    id,
    title,
    genreId: 'fantasy',
    config: { protagonist: '守塔人', storyLengthMode: 'season' },
    worldBible: { premise: '雾港的灯塔守着一封没有署名的信。', rules: ['潮声会带回信'], outline: ['起雾', '得信', '启程'] },
    chapterIndex: 3,
    chapters: [
      chapter(0, ['雾从港口升起来的时候，守塔人听见了潮声里的回信。', '他把灯芯拨亮，等那封信自己走上塔来。']),
      chapter(1, ['信没有署名，只有一枚被海水泡软的印章。', '印章上刻着一座他从未去过的城。']),
      chapter(2, ['天亮之前，他把灯塔的门锁好，沿着堤岸向那座城走去。']),
    ],
    choices: {},
    revision: 1,
    readerIndex: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    status: 'reading',
  };
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
    method: 'POST', body: { username, password: 'delete-book-pass-1' },
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
  const child = spawn(process.execPath, [path.join(repoRoot, 'cloud-library-shots', 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await waitFor(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  }, 'fixture server health', 30_000);
  return { base, child };
}

async function main() {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch({ headless });
  const results = [];
  const check = (name, fn) => { fn(); results.push(name); };
  try {
    const shelfBook = fixtureStory('fixture-del-shelf', '将被删掉的书');
    const activeBook = fixtureStory('fixture-del-active', '从设定集删掉的书');
    const { token, session } = await registerUser(base, `delete_walk_${Date.now().toString(36)}`);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ sessionValue, shelfBookValue, activeBookValue }) => {
      localStorage.setItem('storyweave.site-session', JSON.stringify(sessionValue));
      localStorage.setItem('storyweave:v2', JSON.stringify({
        version: 2,
        stories: [activeBookValue, shelfBookValue],
        activeStoryId: activeBookValue.id,
        publications: [],
        favorites: [],
        draft: null,
      }));
    }, { sessionValue: session, shelfBookValue: shelfBook, activeBookValue: activeBook });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Both fixture books sync up to the account first — the delete below
    // must take the cloud copies down with the local ones.
    await waitFor(async () => {
      const { json } = await api(base, '/api/library', { token });
      return json?.stories?.length === 2 ? json : null;
    }, 'both fixture books to reach the account index');
    check('setup: both books are on the shelf and synced to the account', () => {});

    // --- A: delete the shelf book from its shelf cell -----------------
    await page.waitForSelector('.wood-book-delete', { timeout: 15_000 });
    await page.locator('.wood-book-delete').click();
    const shelfDialog = page.locator('.reading-dialog');
    await shelfDialog.waitFor({ state: 'visible' });
    const shelfDialogText = await shelfDialog.innerText();
    check('A: the confirmation names the consequences, not a bare 确定', () => {
      assert.match(shelfDialogText, /将被删掉的书/);
      assert.match(shelfDialogText, /无法恢复/);
      assert.match(shelfDialogText, /广场/);
    });
    await page.screenshot({ path: path.join(shotsDir, '01-confirm-shelf.png') });
    await shelfDialog.getByRole('button', { name: '删除《将被删掉的书》', exact: true }).click();
    await waitFor(async () => {
      const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
      return raw && !raw.includes(shelfBook.id) ? raw : null;
    }, 'the shelf book to leave local storage');
    check('A: the book leaves the local shelf as soon as the delete lands', () => {});
    const afterShelf = await waitFor(async () => {
      const { json } = await api(base, '/api/library', { token });
      return json?.deleted?.some((entry) => entry.id === shelfBook.id) ? json : null;
    }, 'the tombstone for the shelf book');
    check('A: the account index keeps a tombstone and drops the book', () => {
      assert.ok(!afterShelf.stories.some((entry) => entry.id === shelfBook.id));
      assert.ok(afterShelf.stories.some((entry) => entry.id === activeBook.id), 'the other book is untouched');
    });
    const goneBody = await api(base, `/api/library/stories/${shelfBook.id}`, { token });
    check('A: the cloud body of the deleted book is gone', () => {
      assert.equal(goneBody.status, 404);
    });
    assert.equal(await page.locator('.wood-book-delete').count(), 0, 'the shelf cell is gone from the page');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=从设定集删掉的书', { timeout: 15_000 });
    await page.waitForTimeout(1200);
    check('A: a reload does not resurrect the deleted book', async () => {});
    assert.equal(await page.locator('.wood-book-delete').count(), 0, 'the deleted book stays off the shelf after reload');
    const localAfterReload = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    assert.ok(!localAfterReload.includes(shelfBook.id), 'local storage keeps the book deleted after reload');

    // --- B: delete the active book from its 设定集 ---------------------
    await page.getByRole('button', { name: '继续阅读', exact: true }).click();
    await page.locator('[data-reading-paragraph]').first().waitFor({ timeout: 15_000 });
    // Summon the reader chrome with centre taps, as a reader would: the
    // first tap right after the page settles can land on the chapter
    // navigation layer instead, so tap again until the menu is up.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.touchscreen.tap(195, 422);
      try {
        await page.locator('.reader-chrome-top').waitFor({ state: 'visible', timeout: 2_000 });
        break;
      } catch { if (attempt === 2) throw new Error('reader chrome never appeared after centre taps'); }
    }
    await page.getByRole('button', { name: '设定集', exact: true }).click();
    const settingsDialog = page.locator('.reading-dialog');
    await settingsDialog.waitFor({ state: 'visible' });
    await settingsDialog.getByRole('button', { name: '删除这本书', exact: true }).click();
    const confirmDialog = page.locator('.reading-dialog');
    await confirmDialog.waitFor({ state: 'visible' });
    const confirmText = await confirmDialog.innerText();
    check('B: the 设定集 delete lands on the same named confirmation', () => {
      assert.match(confirmText, /删除这本书/);
      assert.match(confirmText, /从设定集删掉的书/);
    });
    await page.screenshot({ path: path.join(shotsDir, '02-confirm-settings.png') });
    await confirmDialog.getByRole('button', { name: '删除《从设定集删掉的书》', exact: true }).click();
    await page.waitForSelector('text=你是主角', { timeout: 15_000 });
    check('B: deleting the open book returns home to the empty-shelf state', () => {});
    const afterActive = await waitFor(async () => {
      const { json } = await api(base, '/api/library', { token });
      return json?.deleted?.some((entry) => entry.id === activeBook.id) ? json : null;
    }, 'the tombstone for the active book');
    check('B: the account index tombstones the second book too', () => {
      assert.equal(afterActive.stories.length, 0);
      assert.equal(afterActive.deleted.length, 2);
    });
    assert.deepEqual(errors, [], 'page errors');
    await context.close();
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
  fs.writeFileSync(path.join(artifactDir, 'delete-book-report.json'), JSON.stringify({ ok: true, checks: results }, null, 2));
  process.stdout.write(`delete-book e2e: ${results.length} checks passed\n${results.map((name) => `  ✓ ${name}`).join('\n')}\n`);
}

main().catch((error) => {
  process.stderr.write(`delete-book e2e FAILED: ${error.stack || error}\n`);
  process.exitCode = 1;
});
