// Title-flow e2e: a book's title is its own fact.
//   A. In the forge, the confirmation step carries an explicit
//      「这本书的书名」 field: it opens on the derived suggestion, the
//      preview card shows that title (not the world name), and a typed
//      title is what the created book is actually called — while the
//      world stays 沉潮港.
//   B. In the book's 设定集， the owner renames the book: an empty name
//      is refused in human words, a valid one saves, syncs to the
//      account copy, and shows in the reader's chrome.
//
// Runs against the cloud-library fixture server (real server, memory
// stores, username sign-in), spawned automatically unless TARGET_URL
// points at an already-running instance of it.
//   node e2e/title-flow.cjs
//   TARGET_URL=http://127.0.0.1:8931 node e2e/title-flow.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'title-flow-shots');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const headless = /^(true|1)$/i.test(process.env.HEADLESS ?? process.env.PW_HEADLESS ?? 'false');
const FIXTURE_PORT = 8931;

const STORAGE_KEY = 'storyweave:v2';
const PROTAGONIST = '星澄';
const FORGE_TITLE = '雾港来信';
const RENAMED_TITLE = '潮声之外';

function chapter(index, title, paragraphs) {
  return {
    id: `title-fixture-ch-${index}`,
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
    id: 'fixture-title-book',
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
    method: 'POST', body: { username, password: 'title-flow-pass-1' },
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

async function forgeWalk(browser, base, results) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/#/forge`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /玄幻修真/ }).first().waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '故事发生在哪个世界？', exact: true }).waitFor();
  await page.locator('.world-grid').getByRole('button', { name: /沉潮港/ }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '你以什么身份醒来？', exact: true }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '从哪里醒来？', exact: true }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '你是怎样的主角？', exact: true }).waitFor();
  await page.getByLabel('主角昵称（选填）').fill(PROTAGONIST);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '确认你的故事', exact: true }).waitFor();

  const titleInput = page.getByLabel('这本书的书名', { exact: true });
  await titleInput.waitFor();
  assert.equal(await titleInput.getAttribute('placeholder'), `沉潮港纪事 · ${PROTAGONIST}`,
    'the field opens on the suggestion the book would otherwise be born with');
  assert.equal(await titleInput.inputValue(), '', 'nothing is typed yet — the suggestion is a suggestion');
  const previewTitle = async () => (await page.locator('.opening-preview h3').innerText()).trim();
  assert.equal(await previewTitle(), `沉潮港纪事 · ${PROTAGONIST}`, 'the preview card carries the book title, not the world name');
  results.push('A: the confirmation step names the book explicitly, on the derived suggestion');

  await titleInput.fill(FORGE_TITLE);
  assert.equal(await previewTitle(), FORGE_TITLE, 'typing a title retitles the preview at once');
  const detailsText = await page.locator('.opening-details').innerText();
  assert.match(detailsText, /沉潮港/, 'the world row still names the world — title and world are separate');
  results.push('A: a typed title replaces the suggestion; the world keeps its name');
  await page.screenshot({ path: path.join(shotsDir, '01-forge-title-390.png') });

  const localMode = page.getByRole('group', { name: '故事方式' }).getByRole('button', { name: '预设体验', exact: true });
  await localMode.click();
  await page.getByRole('button', { name: '进入第一章', exact: true }).click();
  await page.getByRole('progressbar', { name: '阅读进度' }).waitFor({ timeout: 15_000 });
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.stories.length, 1);
  assert.equal(saved.stories[0].title, FORGE_TITLE, 'the created book is called what its creator typed');
  assert.equal(saved.stories[0].config.bookTitle, FORGE_TITLE, 'the choice rides the config');
  results.push('A: the created book carries the typed title');
  assert.deepEqual(errors, [], 'no page errors during the forge walk');
  await context.close();
}

async function renameWalk(browser, base, results) {
  const book = fixtureStory();
  const { token, session } = await registerUser(base, `title_walk_${Date.now().toString(36)}`);
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

  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await page.locator('[data-reading-paragraph]').first().waitFor({ timeout: 15_000 });
  await summonChrome(page);
  await page.getByRole('button', { name: '设定集', exact: true }).click();
  const settings = page.locator('.reading-dialog');
  await settings.waitFor({ state: 'visible' });

  const titleBox = settings.getByLabel('书名', { exact: true });
  assert.equal(await titleBox.inputValue(), '可以改名的故事', 'the editor opens on the current title');
  await titleBox.fill('');
  await settings.getByRole('button', { name: '保存书名', exact: true }).click();
  await settings.getByText('书名不能为空。', { exact: true }).waitFor({ timeout: 10_000 });
  results.push('B: an empty book title is refused in human words');
  await titleBox.fill(RENAMED_TITLE);
  await settings.getByRole('button', { name: '保存书名', exact: true }).click();
  await settings.getByText('已保存。', { exact: true }).first().waitFor({ timeout: 10_000 });
  results.push('B: the rename saves from the settings book');
  await page.screenshot({ path: path.join(shotsDir, '02-settings-title-390.png') });
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await settings.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

  // The chrome hides itself while a sheet is open; summon it again.
  await summonChrome(page);
  const chromeTitle = (await page.locator('.reader-chrome-title b').innerText()).trim();
  assert.equal(chromeTitle, RENAMED_TITLE, 'the reader chrome shows the new title');
  const synced = await waitFor(async () => {
    const { json } = await api(base, `/api/library/stories/${book.id}`, { token });
    return json?.story?.title === RENAMED_TITLE ? json.story : null;
  }, 'the renamed book to sync to the account');
  assert.equal(synced.config.bookTitle, RENAMED_TITLE, 'the account copy carries the typed title');
  results.push('B: the rename syncs to the account copy and the reader');
  assert.deepEqual(errors, [], 'no page errors during the rename walk');
  await context.close();
}

async function main() {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch({ headless });
  const results = [];
  try {
    await forgeWalk(browser, base, results);
    await renameWalk(browser, base, results);
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
  for (const line of results) console.log(`PASS ${line}`);
  console.log(`title-flow e2e: ${results.length} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
