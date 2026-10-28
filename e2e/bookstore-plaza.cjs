// Bookstore × Plaza e2e: the whole chain on the real UI.
//   A. The author shelves a finished line (API) and writes a free post.
//   B. Bookstore: the cleaned title stands on the shelf; the detail
//      page opens from the card.
//   C. 分享到广场 from the detail page: the composer opens with the
//      book preselected; posting lands on the stream, book card in tow.
//   D. A second user likes and comments on the share post.
//   E. The author's message centre （互动） carries both events.
// Runs against the bookstore-plaza fixture server (real server, memory
// stores, username sign-in), spawned automatically unless TARGET_URL
// points at an already-running instance of it.
//   node e2e/bookstore-plaza.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'bookstore-plaza-shots');
const FIXTURE_PORT = 8941;
const AUTHOR = 'e2e_store_author';
const READER = 'e2e_store_reader';
const BOOK_TITLE = '借火登天';
const FREE_POST = '第一季刚刚走完，写到最后一段的时候手都是抖的。';
const SHARE_NOTE = '安利一下刚上架的这本，青岚宗的火，烧了整整一季。';
const COMMENT = '封面好好看，追了！';

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
    method: 'POST', body: { username, password: 'bookstore-e2e-pass-1' },
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

async function main() {
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    // ——— Seed: author + avatar + shelved book + one free post ———
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
    assert.equal(published.json.book.title, BOOK_TITLE, 'the shelved title is cleaned of the avatar suffix');
    const freePost = await api(base, '/api/plaza/posts', {
      credential: author.credential,
      method: 'POST', body: { type: 'free_text', content: FREE_POST },
    });
    assert.equal(freePost.status, 200, 'free post created');

    // ——— B. Bookstore shelf + detail ———
    const authorSide = await openSessionPage(browser, base, author);
    const page = authorSide.page;
    await page.getByRole('button', { name: '书城', exact: true }).click();
    const card = page.locator('.store-book-card', { hasText: BOOK_TITLE });
    await waitFor(async () => (await card.count()) === 1, 'the book stands on the shelf');
    assert.equal(await page.locator('.store-book-card').count(), 1, 'exactly one book on the shelf');
    assert.equal(await card.locator('.store-book-body').innerText().then((text) => text.includes(BOOK_TITLE)), false, 'the card body never repeats the title');
    await shot(page, '01-store.png');

    await card.locator('.plaza-card-cover').click();
    await waitFor(async () => (await page.locator('.plaza-detail-cover').count()) === 1, 'the detail page opens');
    const detailText = await page.locator('.plaza-detail-cover').evaluate((el) => el.closest('.page-plaza').innerText);
    assert.ok(detailText.includes('作者'), 'the byline speaks of the author');
    await shot(page, '02-store-detail.png');

    // ——— C. Share to the plaza from the detail page ———
    await page.getByRole('button', { name: '分享到广场' }).click();
    const dialog = page.locator('.reading-dialog');
    await waitFor(async () => (await dialog.count()) === 1, 'the share composer opens');
    await dialog.locator('textarea').fill(SHARE_NOTE);
    await shot(page, '04-composer.png');
    await dialog.getByRole('button', { name: '发布到广场' }).click();
    await waitFor(async () => (await page.locator('.plaza-post').count()) >= 2, 'the stream carries both posts');
    const streamText = await page.locator('.page-plaza').innerText();
    assert.ok(streamText.includes(SHARE_NOTE), 'the share note is on the stream');
    assert.ok(streamText.includes(FREE_POST), 'the free post is on the stream');
    assert.ok(streamText.includes(BOOK_TITLE), 'the book card rides the share post');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '03-plaza.png');
    await authorSide.context.close();

    // ——— D. Reader likes + comments ———
    const readerSide = await openSessionPage(browser, base, reader);
    const readerPage = readerSide.page;
    await readerPage.goto(`${base}/#/plaza`, { waitUntil: 'domcontentloaded' });
    const shareCard = readerPage.locator('.plaza-post', { hasText: SHARE_NOTE });
    await waitFor(async () => (await shareCard.count()) === 1, 'the reader finds the share post');
    await shareCard.getByRole('button', { name: '点赞' }).click();
    await waitFor(async () => (await shareCard.locator('.plaza-post-action.is-liked').innerText().catch(() => '')) === '1', 'the like lands');
    await shareCard.getByRole('button', { name: /评论/ }).click();
    const composer = shareCard.locator('.plaza-thread-composer input');
    await composer.fill(COMMENT);
    await composer.press('Enter');
    await waitFor(async () => (await shareCard.locator('.plaza-thread-list').innerText()).includes(COMMENT), 'the comment stands under the post');
    await readerSide.context.close();

    // ——— E. Author's message centre carries both events ———
    const backSide = await openSessionPage(browser, base, author);
    const backPage = backSide.page;
    await backPage.locator('button[aria-label^="消息"]').click();
    const panel = backPage.locator('.notify-panel');
    await waitFor(async () => (await panel.count()) === 1, 'the message centre opens');
    const panelText = await panel.innerText();
    assert.ok(panelText.includes('赞了你的帖子'), 'the like notification is in 互动');
    assert.ok(panelText.includes('评论了你的帖子'), 'the comment notification is in 互动');
    assert.ok(panelText.includes(COMMENT), 'the comment text rides its notification');
    await shot(backPage, '05-notifications.png');
    await backSide.context.close();

    console.log('BOOKSTORE-PLAZA E2E PASS: shelf → detail → share → stream → like/comment → 互动');
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
