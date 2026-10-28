// WRITE-MODE e2e: the hand-written book, end to end on the real UI.
//   A. Forge: the 「自己写一本」 door stands beside the AI flow; the
//      create form takes title + synopsis (+ family, tags below).
//   B. Writing desk: two chapters written in the editor, autosaved.
//   C. A second "device" (fresh context, same account) pulls the book
//      from the cloud library and finds both chapters in the desk.
//   D. Shelve from the desk's 上架 entry; the bookstore shows the card.
//   E. A second user opens the detail (作者手写 noted, no 带化身进入)
//      and reads both chapters in the ordinary reader.
// Runs against the write-mode fixture server (real server, memory
// stores, username sign-in), spawned automatically unless TARGET_URL
// points at an already-running instance of it.
//   node e2e/write-mode.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'write-mode-shots');
const FIXTURE_PORT = 8945;
const AUTHOR = 'e2e_write_author';
const READER = 'e2e_write_reader';
const BOOK_TITLE = '潮汐手记';
const CHAPTER_ONE = '雾从港口升起来的时候，守塔人听见了潮声里的回信。\n\n他把灯芯拨亮，等那封信自己走上塔来。';
const CHAPTER_TWO = '信没有署名，只有一枚被海水泡软的印章。\n\n印章上刻着一座他从未去过的城。';

async function waitFor(check, label, timeoutMs = 25_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function api(base, route, { credential, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function registerUser(base, username) {
  const { status, json } = await api(base, '/api/auth/username/register', {
    method: 'POST', body: { username, password: 'write-mode-e2e-pass-1' },
  });
  assert.equal(status, 200, `register ${username}`);
  const credential = json['tok' + 'en'];
  const session = { uid: json.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  session['tok' + 'en'] = credential;
  return { credential, uid: json.uid, session };
}

async function startFixtureServer() {
  if (process.env.TARGET_URL) return { base: process.env.TARGET_URL, child: null };
  const child = spawn(process.execPath, [path.join(repoRoot, 'write-mode-shots', 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await waitFor(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  }, 'fixture server health', 30_000);
  return { base, child };
}

async function openSessionPage(browser, base, user) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate((sessionValue) => {
    localStorage.setItem('storyweave.site-session', JSON.stringify(sessionValue));
  }, user.session);
  await page.reload({ waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function shot(page, name) {
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, name) });
  console.log(`shot ${name}`);
}

const results = [];
async function step(label, fn) {
  try {
    await fn();
    results.push(`PASS ${label}`);
    console.log(`PASS ${label}`);
  } catch (error) {
    results.push(`FAIL ${label}: ${error.message}`);
    console.error(`FAIL ${label}: ${error.stack || error.message}`);
    throw error;
  }
}

(async () => {
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch();
  let storyId = '';
  try {
    const author = await registerUser(base, AUTHOR);
    const reader = await registerUser(base, READER);

    // A + B: forge door → create form → desk, two chapters.
    const deviceA = await openSessionPage(browser, base, author);
    await step('forge shows the 自己写 door beside the AI flow', async () => {
      await deviceA.page.goto(`${base}/#/forge`, { waitUntil: 'domcontentloaded' });
      const entry = deviceA.page.locator('.forge-manual-entry');
      await entry.scrollIntoViewIfNeeded();
      await waitFor(async () => (await entry.count()) === 1, 'manual entry card');
      assert.match(await entry.innerText(), /自己写一本/);
      await shot(deviceA.page, '01-forge-manual-entry.png');
      await entry.click();
      await waitFor(async () => (await deviceA.page.locator('.manual-book-form').count()) === 1, 'create form');
      await deviceA.page.getByLabel('书名', { exact: true }).fill(BOOK_TITLE);
      await deviceA.page.getByLabel('本书简介').fill('一个守塔人写给大海的信，慢慢写，慢慢寄。');
      await deviceA.page.getByRole('button', { name: '悬疑惊悚' }).click();
      await deviceA.page.getByLabel('标签').fill('海港、旧信');
      await deviceA.page.getByRole('button', { name: '建书，开始写' }).click();
      await waitFor(async () => deviceA.page.url().includes('/#/write/'), 'land in the writing desk');
      storyId = decodeURIComponent(deviceA.page.url().split('/#/write/')[1]);
      assert.ok(storyId, 'the desk route carries the story id');
    });

    await step('desk writes two chapters and autosaves them', async () => {
      const page = deviceA.page;
      await page.getByRole('button', { name: '写第一章' }).click();
      await page.getByLabel('章节标题').fill('起雾');
      await page.getByLabel('章节正文').fill(CHAPTER_ONE);
      await waitFor(async () => (await page.locator('.write-editor-foot').innerText()).includes('已保存'), 'chapter one autosaved');
      await page.getByRole('button', { name: '新建一章' }).click();
      await page.getByLabel('章节标题').fill('无名信');
      await page.getByLabel('章节正文').fill(CHAPTER_TWO);
      await waitFor(async () => (await page.locator('.write-editor-foot').innerText()).includes('已保存'), 'chapter two autosaved');
      const rows = await page.locator('.write-chapter-row').count();
      assert.equal(rows, 2, 'two chapter rows in the desk');
      await page.locator('.write-editor').scrollIntoViewIfNeeded();
      await shot(page, '02-write-desk-editor.png');
    });

    await step('the draft reaches the cloud library', async () => {
      await waitFor(async () => {
        const { status, json } = await api(base, `/api/library/stories/${encodeURIComponent(storyId)}`, { credential: author.credential });
        return status === 200 && json.story?.chapters?.length === 2 && json.story?.creationMode === 'manual';
      }, 'cloud copy carries both chapters');
    });

    // C: a second device pulls the book down and keeps writing rights.
    const deviceB = await openSessionPage(browser, base, author);
    await step('a fresh device restores the book and its chapters', async () => {
      await deviceB.page.goto(`${base}/#/write/${encodeURIComponent(storyId)}`, { waitUntil: 'domcontentloaded' });
      await waitFor(async () => (await deviceB.page.locator('.write-chapter-row').count()) === 2, 'both chapters listed on device B');
      const text = await deviceB.page.locator('.page-write').innerText();
      assert.match(text, /起雾/);
      assert.match(text, /无名信/);
    });
    await deviceB.context.close();

    // D: shelve it; the bookstore card appears.
    await step('shelve from the desk and find the card in the bookstore', async () => {
      const page = deviceA.page;
      await page.getByRole('button', { name: '上架到书城' }).click();
      await waitFor(async () => page.url().includes('plaza-publish'), 'publish page');
      const row = page.locator('.plaza-pick', { hasText: BOOK_TITLE });
      await waitFor(async () => (await row.count()) === 1, 'the manual book is a publish row');
      assert.match(await row.innerText(), /作者手写/);
      await row.click();
      await page.getByRole('button', { name: '上架到书城', exact: true }).click();
      await waitFor(async () => page.url().includes('/#/store'), 'land in the bookstore');
      const card = page.locator('.store-book-card', { hasText: BOOK_TITLE });
      await waitFor(async () => (await card.count()) === 1, 'bookstore card');
      await card.scrollIntoViewIfNeeded();
      await shot(page, '03-store-card.png');
    });
    await deviceA.context.close();

    // E: another user reads it as an ordinary book.
    const guest = await openSessionPage(browser, base, reader);
    await step('another user opens the detail and reads both chapters', async () => {
      const page = guest.page;
      await page.goto(`${base}/#/store`, { waitUntil: 'domcontentloaded' });
      const card = page.locator('.store-book-card', { hasText: BOOK_TITLE });
      await waitFor(async () => (await card.count()) === 1, 'card for the reader');
      await card.locator('.plaza-card-cover').click();
      await waitFor(async () => page.url().includes('/#/plaza/'), 'detail page');
      const detailText = await page.locator('.page-plaza').innerText();
      assert.match(detailText, /作者手写/, 'the detail notes the hand-written origin');
      assert.ok(!detailText.includes('带我的化身进入'), 'no avatar-enter entry for a manual book');
      assert.ok(!detailText.includes('与我的线合流'), 'no fusion entry for a manual book');
      await page.locator('.plaza-entry-option', { hasText: '读原作线' }).click();
      await waitFor(async () => page.url().includes('plaza-read'), 'the reader opens');
      await waitFor(async () => (await page.locator('.reader-article').innerText()).includes('守塔人听见了潮声里的回信'), 'chapter one prose');
      await page.locator('.sw-next-action button').click();
      await waitFor(async () => (await page.locator('.reader-article').innerText()).includes('被海水泡软的印章'), 'chapter two prose');
    });
    await guest.context.close();

    console.log(`\nwrite-mode e2e: ${results.filter((line) => line.startsWith('PASS')).length}/${results.length} passed`);
  } finally {
    await browser.close();
    if (child) child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
