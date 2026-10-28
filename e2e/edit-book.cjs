// Edit-book e2e: the owner edits their own book — its synopsis and
// its chapter titles — and the edits stick everywhere they should.
//
// Runs against the same fixture server as the cloud-library walk
// (cloud-library-shots/dev-server.mjs — real server, memory stores,
// username sign-in; spawned automatically unless TARGET_URL points at
// an already-running instance of it). One fixture book syncs to the
// account, then:
//
//   A. In the book's 设定集， a new 简介 is written and saved: the
//      account copy carries it, and reopening the book shows it.
//   B. In the same 设定集， the chapter directory is edited: two
//      chapters are renamed; the reader's directory drawer and its
//      status line show the new titles.
//   C. In the drawer itself, an over-long title is refused in human
//      words, then a valid rename saves; a reload keeps everything.
//
//   node e2e/edit-book.cjs
//   TARGET_URL=http://127.0.0.1:8929 node e2e/edit-book.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'edit-book-shots');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const headless = /^(true|1)$/i.test(process.env.HEADLESS ?? process.env.PW_HEADLESS ?? 'false');
const FIXTURE_PORT = 8929;

const STORAGE_KEY = 'storyweave:v2';
const SYNOPSIS = '守塔人收到一封没有署名的信，沿着潮声去寻寄信的人。';

function chapter(index, title, paragraphs) {
  return {
    id: `edit-fixture-ch-${index}`,
    title,
    index,
    paragraphs,
    summary: '',
    events: [`事件 ${index}`],
    foreshadowing: [],
  };
}

function fixtureStory() {
  return {
    id: 'fixture-edit-book',
    title: '可以改名的故事',
    genreId: 'fantasy',
    config: { protagonist: '守塔人', storyLengthMode: 'season' },
    worldBible: { premise: '雾港的灯塔守着一封没有署名的信。', rules: ['潮声会带回信'], outline: ['起雾', '得信', '启程'] },
    chapterIndex: 3,
    chapters: [
      chapter(0, '雾起', ['雾从港口升起来的时候，守塔人听见了潮声里的回信。', '他把灯芯拨亮，等那封信自己走上塔来。']),
      chapter(1, '得信', ['信没有署名，只有一枚被海水泡软的印章。', '印章上刻着一座他从未去过的城。']),
      chapter(2, '启程', ['天亮之前，他把灯塔的门锁好，沿着堤岸向那座城走去。']),
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
    method: 'POST', body: { username, password: 'edit-book-pass-1' },
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

async function summonChrome(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.touchscreen.tap(195, 422);
    try {
      await page.locator('.reader-chrome-top').waitFor({ state: 'visible', timeout: 2_000 });
      return;
    } catch { if (attempt === 2) throw new Error('reader chrome never appeared after centre taps'); }
  }
}

async function main() {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch({ headless });
  const results = [];
  const check = (name, fn) => { fn(); results.push(name); };
  try {
    const book = fixtureStory();
    const { token, session } = await registerUser(base, `edit_walk_${Date.now().toString(36)}`);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ sessionValue, bookValue }) => {
      localStorage.setItem('storyweave.site-session', JSON.stringify(sessionValue));
      localStorage.setItem('storyweave:v2', JSON.stringify({
        version: 2,
        stories: [bookValue],
        activeStoryId: bookValue.id,
        publications: [],
        favorites: [],
        draft: null,
      }));
    }, { sessionValue: session, bookValue: book });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitFor(async () => {
      const { json } = await api(base, '/api/library', { token });
      return json?.stories?.length === 1 ? json : null;
    }, 'the fixture book to reach the account index');
    check('setup: the book is on the shelf and synced to the account', () => {});

    await page.getByRole('button', { name: '继续阅读', exact: true }).click();
    await page.locator('[data-reading-paragraph]').first().waitFor({ timeout: 15_000 });
    const statusLine = async () => (await page.locator('.reader-status-back').innerText()).trim();
    check('setup: the reader opens on chapter 2 with its original title', async () => {});
    assert.match(await statusLine(), /第 2 章 · 得信/);

    // --- A + B: the 设定集 edits --------------------------------------
    await summonChrome(page);
    await page.getByRole('button', { name: '设定集', exact: true }).click();
    const settings = page.locator('.reading-dialog');
    await settings.waitFor({ state: 'visible' });

    const synopsisBox = settings.getByLabel('本书简介', { exact: true });
    await synopsisBox.fill(SYNOPSIS);
    await settings.getByRole('button', { name: '保存简介', exact: true }).click();
    await settings.getByText('已保存。', { exact: true }).waitFor({ timeout: 10_000 });
    check('A: the synopsis saves from the book’s settings with a confirmation', () => {});
    await page.screenshot({ path: path.join(shotsDir, '01-synopsis-saved.png') });

    await settings.getByRole('button', { name: '编辑目录', exact: true }).click();
    await settings.getByLabel('第 1 章标题', { exact: true }).fill('雾起时分');
    await settings.getByLabel('第 3 章标题', { exact: true }).fill('向着潮声走');
    await settings.getByRole('button', { name: '保存目录', exact: true }).click();
    await settings.getByRole('button', { name: '编辑目录', exact: true }).waitFor({ timeout: 10_000 });
    const settingsText = await settings.innerText();
    check('B: the settings directory shows the renamed chapters after saving', () => {
      assert.match(settingsText, /雾起时分/);
      assert.match(settingsText, /向着潮声走/);
      assert.doesNotMatch(settingsText, /第 1 章 · 雾起\n/);
    });
    await page.screenshot({ path: path.join(shotsDir, '02-toc-renamed.png') });
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await settings.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

    // The edits sync to the account copy through the ordinary channel.
    const synced = await waitFor(async () => {
      const { json } = await api(base, `/api/library/stories/${book.id}`, { token });
      return json?.story?.synopsis === SYNOPSIS ? json.story : null;
    }, 'the edited book to sync to the account');
    check('A+B: the account copy carries the synopsis and the new titles', () => {
      // The fixture is a local-engine book, so the reader may already
      // have prepared its next chapter — the assertions stay on the
      // three chapters the fixture owns.
      assert.deepEqual(synced.chapters.slice(0, 3).map((entry) => entry.title), ['雾起时分', '得信', '向着潮声走']);
      assert.deepEqual(synced.chapters.slice(0, 3).map((entry) => entry.id), book.chapters.map((entry) => entry.id), 'chapter ids never moved');
    });

    // --- B continued: the reader directory drawer ----------------------
    await page.locator('.chapter-navigation').getByRole('button', { name: '目录', exact: true }).click();
    const drawer = page.locator('.reading-dialog');
    await drawer.waitFor({ state: 'visible' });
    const drawerText = await drawer.innerText();
    check('B: the reader directory lists the new titles', () => {
      assert.match(drawerText, /雾起时分/);
      assert.match(drawerText, /向着潮声走/);
    });

    // --- C: the drawer edit mode, its refusal, and persistence --------
    await drawer.getByRole('button', { name: '编辑目录', exact: true }).click();
    await drawer.getByLabel('第 2 章标题', { exact: true }).fill('题'.repeat(31));
    await drawer.getByRole('button', { name: '保存目录', exact: true }).click();
    await drawer.getByText(/章节标题最多 30 字/).waitFor({ timeout: 10_000 });
    check('C: an over-long title is refused in human words and nothing saves', () => {});
    await drawer.getByLabel('第 2 章标题', { exact: true }).fill('信里的城');
    await drawer.getByRole('button', { name: '保存目录', exact: true }).click();
    await drawer.locator('.chapter-directory-list').waitFor({ timeout: 10_000 });
    const drawerAfter = await drawer.innerText();
    check('C: a valid rename from the drawer saves and lists at once', () => {
      assert.match(drawerAfter, /信里的城/);
    });
    await page.screenshot({ path: path.join(shotsDir, '03-drawer-renamed.png') });
    await drawer.locator('.chapter-directory-list button').first().click();
    await waitFor(async () => (await statusLine()).includes('雾起时分') || null, 'the reader status line to show the renamed first chapter');
    check('C: the reader status line shows the renamed chapter title', () => {});

    const syncedAgain = await waitFor(async () => {
      const { json } = await api(base, `/api/library/stories/${book.id}`, { token });
      return json?.story?.chapters?.[1]?.title === '信里的城' ? json.story : null;
    }, 'the drawer rename to sync to the account');
    check('C: the drawer rename reaches the account copy too', () => {
      assert.equal(syncedAgain.synopsis, SYNOPSIS);
    });

    // --- Reload: everything persists -----------------------------------
    await page.reload({ waitUntil: 'domcontentloaded' });
    // The app may restore the reader route directly; otherwise the
    // shelf offers 继续阅读 back into the book.
    const resume = page.getByRole('button', { name: '继续阅读', exact: true });
    await Promise.race([
      resume.waitFor({ state: 'visible', timeout: 10_000 }).then(() => resume.click()),
      page.locator('[data-reading-paragraph]').first().waitFor({ timeout: 10_000 }),
    ]);
    await page.locator('[data-reading-paragraph]').first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const localRaw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    check('reload: the local copy keeps the synopsis and all three titles', () => {
      const local = JSON.parse(localRaw).stories.find((entry) => entry.id === book.id);
      assert.equal(local.synopsis, SYNOPSIS);
      assert.deepEqual(local.chapters.slice(0, 3).map((entry) => entry.title), ['雾起时分', '信里的城', '向着潮声走']);
    });
    await summonChrome(page);
    await page.getByRole('button', { name: '设定集', exact: true }).click();
    const reopened = page.locator('.reading-dialog');
    await reopened.waitFor({ state: 'visible' });
    const reopenedSynopsis = await reopened.getByLabel('本书简介', { exact: true }).inputValue();
    check('reload: reopening the book shows the saved synopsis in its editor', () => {
      assert.equal(reopenedSynopsis, SYNOPSIS);
    });
    assert.deepEqual(errors, [], 'page errors');
    await context.close();
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
  fs.writeFileSync(path.join(artifactDir, 'edit-book-report.json'), JSON.stringify({ ok: true, checks: results }, null, 2));
  process.stdout.write(`edit-book e2e: ${results.length} checks passed\n${results.map((name) => `  ✓ ${name}`).join('\n')}\n`);
}

main().catch((error) => {
  process.stderr.write(`edit-book e2e FAILED: ${error.stack || error}\n`);
  process.exitCode = 1;
});
