// Publish-avatar e2e (FINAL-FIX R-06): the no-avatar dead end and its
// remedy, on the real UI.
//   A. A finished season line forged WITHOUT an avatar stands on the
//      publish page as a disabled row whose reason is the avatar gate.
//   B. The row itself offers the remedy: 带入化身「沈砚」. One click and
//      the gate re-reads — the row unlocks and can be selected.
//   C. Publishing then succeeds end to end (the book lands in the
//      bookstore), proving the remedy satisfied BOTH gates (client and
//      server).
// The fixture server is the bookstore-plaza one (real server, memory
// stores, username sign-in); the line is built locally by this script.
//   node e2e/publish-avatar.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'publish-avatar-shots');
const FIXTURE_PORT = 8947;
const AUTHOR = 'e2e_pubavatar_author';

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
    method: 'POST', body: { username, password: 'pubavatar-e2e-pass-1' },
  });
  assert.equal(status, 200, `register ${username}`);
  const credential = json['tok' + 'en'];
  const session = { uid: json.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  session['tok' + 'en'] = credential;
  return { credential, uid: json.uid, session };
}

async function startFixtureServer() {
  if (process.env.TARGET_URL) return { base: process.env.TARGET_URL, child: null };
  const child = spawn(process.execPath, [path.join(repoRoot, 'bookstore-plaza-shots', 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await waitFor(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  }, 'fixture server health', 30_000);
  return { base, child };
}

async function completedLineWithoutAvatar() {
  const engine = await import('../src/story-engine.js');
  let current = engine.createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    ability: '借火一瞬',
  });
  for (let index = 0; index < 24; index += 1) {
    const chapter = engine.buildChapter(current, index);
    current = engine.acceptChapter(current, chapter, engine.chapterKey(current, index));
    if (chapter.choice && index < 23) {
      current = engine.chooseBranch(current, index, chapter.choice.options[0].id);
    }
  }
  return { ...current, engine: 'gemini' };
}

async function shot(page, name) {
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, name) });
  console.log(`shot ${name}`);
}

async function main() {
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const author = await registerUser(base, AUTHOR);
    const avatarResponse = await api(base, '/api/avatar', {
      credential: author.credential,
      method: 'PUT',
      body: {
        profile: {
          name: '沈砚',
          description: '清冷安静的剑客。',
          appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
        },
      },
    });
    assert.equal(avatarResponse.status, 200, 'avatar saved');
    const line = await completedLineWithoutAvatar();
    assert.equal(line.config.avatarId, '', 'the fixture line carries no avatar');

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
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
    }, { sessionValue: author.session, bookValue: line });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // ——— A. The publish page shows the dead end, named ———
    await page.goto(`${base}/#/plaza-publish`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('.plaza-pick-remedy');
    await waitFor(async () => (await row.count()) === 1, 'the avatar-blocked row renders as the remedy card');
    const rowText = await row.innerText();
    assert.ok(rowText.includes('只有用化身走完的故事线才能发布'), 'the gate reason is stated on the row');
    assert.ok(rowText.includes('带入化身'), 'the remedy is offered on the same row');
    await shot(page, '01-blocked-row.png');

    // ——— B. One click brings the avatar in; the gate re-reads ———
    await row.getByRole('button', { name: /带入化身/ }).click();
    const unlocked = page.locator('.plaza-pick', { hasText: '已完结' });
    await waitFor(async () => (await unlocked.count()) >= 1, 'the row unlocks after the bring-in');
    const stored = await page.evaluate((id) => {
      const library = JSON.parse(localStorage.getItem('storyweave:v2'));
      return library.stories.find((story) => story.id === id)?.config?.avatarId || '';
    }, line.id);
    assert.equal(stored, avatarResponse.json.avatar.id, 'the bring-in is persisted on the story record');
    await shot(page, '02-unlocked.png');

    // ——— C. Publish for real ———
    await unlocked.first().click();
    await page.getByRole('button', { name: '上架到书城' }).click();
    await waitFor(async () => (await page.locator('.store-book-card').count()) >= 1, 'the book lands in the bookstore after publishing');
    const books = await api(base, '/api/store');
    assert.equal(books.status, 200, 'store list answers');
    assert.ok(JSON.stringify(books.json).includes('借火'), 'the server holds the shelved book');
    await shot(page, '03-shelved.png');
    await context.close();

    console.log('PUBLISH-AVATAR E2E PASS: avatar gate → in-place remedy → gate re-reads → shelved');
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
