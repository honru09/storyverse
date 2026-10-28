// Ratings e2e: the whole chain on the real UI.
//   A. The author shelves a finished line (API).
//   B. A reader opens the book in the bookstore, rates it 5 stars
//      with a written review; the detail page shows the average, the
//      count and the review in the list.
//   C. The bookstore card now carries the average.
//   D. The reader edits the rating down to 4 stars; the average
//      follows (still ONE rating — an edit, not a second vote).
//   E. The author's message centre （互动） carries the rating event.
// Runs against the ratings fixture server (real server, memory
// stores, username sign-in), spawned automatically unless TARGET_URL
// points at an already-running instance of it.
//   node e2e/ratings.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'ratings-shots');
const FIXTURE_PORT = 8943;
const AUTHOR = 'e2e_rate_author';
const READER = 'e2e_rate_reader';
const BOOK_TITLE = '借火登天';
const REVIEW = '最后一章的反转完全没想到，二刷确认是今年读过最好的一季。';

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
    method: 'POST', body: { username, password: 'ratings-e2e-pass-1' },
  });
  assert.equal(status, 200, `register ${username}`);
  assert.ok(json.token && json.uid, 'register returns a session token and uid');
  const credential = json['tok' + 'en'];
  const session = { uid: json.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  session['tok' + 'en'] = credential;
  return { credential, uid: json.uid, session };
}

async function startFixtureServer() {
  if (process.env.TARGET_URL) return { base: process.env.TARGET_URL, child: null };
  const child = spawn(process.execPath, [path.join(repoRoot, 'ratings-shots', 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await waitFor(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  }, 'fixture server health', 30_000);
  return { base, child };
}

async function completedLine(avatarId) {
  const engine = await import('../src/story-engine.js');
  const walkLocal = (story, count) => {
    let current = story;
    for (let index = 0; index < count; index += 1) {
      const chapter = engine.buildChapter(current, index);
      current = engine.acceptChapter(current, chapter, engine.chapterKey(current, index));
      if (chapter.choice && index < count - 1) {
        current = engine.chooseBranch(current, index, chapter.choice.options[0].id);
      }
    }
    return current;
  };
  return {
    ...walkLocal(engine.createStory({
      genreId: 'cultivation',
      genreTemplateId: 'xianxia',
      storyLengthMode: 'season',
      originIdentityId: 'mystery',
      startPointName: '山神破庙',
      name: '沈砚',
      avatarId,
      avatarAppearance: '银灰长发，左颊一颗泪痣',
      ability: '借火一瞬',
    }), 24),
    engine: 'gemini',
  };
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

async function openBookDetail(page, base) {
  await page.getByRole('button', { name: '书城', exact: true }).click();
  const card = page.locator('.store-book-card', { hasText: BOOK_TITLE });
  await waitFor(async () => (await card.count()) === 1, 'the book stands on the shelf');
  await card.locator('.plaza-card-cover').click();
  await waitFor(async () => (await page.locator('.plaza-detail-cover').count()) === 1, 'the detail page opens');
  return card;
}

async function main() {
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    // ——— Seed: author + avatar + shelved book ———
    const author = await registerUser(base, AUTHOR);
    const reader = await registerUser(base, READER);
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
    const line = await completedLine(avatarResponse.json.avatar.id);
    const published = await api(base, '/api/store/publish', {
      credential: author.credential,
      method: 'POST', body: { story: line },
    });
    assert.equal(published.status, 200, 'book shelved');
    const bookId = published.json.book.id;

    // ——— B. The reader rates 5 stars with a review ———
    const readerSide = await openSessionPage(browser, base, reader);
    const page = readerSide.page;
    await openBookDetail(page, base);
    const section = page.locator('.book-ratings');
    await section.scrollIntoViewIfNeeded();
    await waitFor(async () => (await section.locator('.book-ratings-empty').count()) === 1, 'the empty state invites the first rating');
    await section.getByRole('button', { name: '打 5 星' }).click();
    await section.locator('textarea').fill(REVIEW);
    await section.getByRole('button', { name: '发表评价' }).click();
    await waitFor(async () => {
      const text = await section.innerText();
      return text.includes('5.0') && text.includes('1 条评价') && text.includes(REVIEW);
    }, 'the average, count and review stand on the detail page');
    await section.scrollIntoViewIfNeeded();
    await shot(page, '01-detail-ratings.png');

    // ——— C. The bookstore card carries the average ———
    await page.getByRole('button', { name: /返回书城/ }).click();
    const card = page.locator('.store-book-card', { hasText: BOOK_TITLE });
    await waitFor(async () => (await card.count()) === 1, 'back on the shelf');
    await waitFor(async () => {
      const text = await card.locator('.plaza-meta').innerText().catch(() => '');
      return text.includes('★ 5.0');
    }, 'the card shows the average');
    await shot(page, '02-store-card.png');

    // ——— D. Edit down to 4 stars: still one rating ———
    await card.locator('.plaza-card-cover').click();
    await waitFor(async () => (await page.locator('.plaza-detail-cover').count()) === 1, 'the detail page reopens');
    const section2 = page.locator('.book-ratings');
    await section2.scrollIntoViewIfNeeded();
    await waitFor(async () => (await section2.getByRole('button', { name: '保存修改' }).count()) === 1, 'the form is prefilled as an edit');
    await section2.getByRole('button', { name: '打 4 星' }).click();
    await section2.getByRole('button', { name: '保存修改' }).click();
    await waitFor(async () => {
      const text = await section2.innerText();
      return text.includes('4.0') && text.includes('1 条评价') && !text.includes('2 条评价');
    }, 'the average follows the edit and the count stays one');
    const viaApi = await api(base, `/api/store/${bookId}/ratings`, { credential: reader.credential });
    assert.equal(viaApi.json.ratingCount, 1, 'the server still holds exactly one rating');
    assert.equal(viaApi.json.ratingAverage, 4);
    await section2.scrollIntoViewIfNeeded();
    await shot(page, '03-detail-edited.png');
    await readerSide.context.close();

    // ——— E. The author's message centre carries the rating event ———
    const authorSide = await openSessionPage(browser, base, author);
    const authorPage = authorSide.page;
    await authorPage.locator('button[aria-label^="消息"]').click();
    const panel = authorPage.locator('.notify-panel');
    await waitFor(async () => (await panel.count()) === 1, 'the message centre opens');
    const panelText = await panel.innerText();
    assert.ok(panelText.includes('评价了你的书'), 'the rating notification is in 互动');
    assert.ok(panelText.includes(BOOK_TITLE), 'the notification names the book');
    assert.ok(panelText.includes('4 星'), 'the notification shows the rating as it now stands');
    await shot(authorPage, '04-notifications.png');
    await authorSide.context.close();

    console.log('RATINGS E2E PASS: shelve → rate 5★ → card average → edit 4★ → author notified');
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
