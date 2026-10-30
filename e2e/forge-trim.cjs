// FORGE-TRIM e2e: the slimmed forge, walked both ways at 390×844.
//  - Avatar path (fixture account with the seeded legacy avatar): step 4
//    asks NO trait question — the profile's description is already the
//    book's persona — and the finished book's config proves it.
//  - Self-made path (same account, bring-in cancelled): the trait is a
//    free input with three library entries underneath and a refresh
//    that never repeats the batch on screen; a tapped entry fills the
//    input and lands in the book's config.
//  - God mode: no 写法 chips any more; the inspiration sparks are the
//    new 100-hook library's, not the retired atmospheric lines.
//  - Scroll geometry (REQ-32 supersedes the docked bar): the action
//    bar is a FIXED capsule floating over the bottom nav — its gap to
//    the viewport bottom is the capsule offset (82px at this size:
//    nav top edge 72px + 10px clearance) at EVERY scroll position,
//    the status line renders before it, and the root scroller
//    contains overscroll.
// Fixture: the multi-avatar dev server (avatars-shots/dev-server.mjs)
// for the forge walks, and a plain AUTH_ENABLED=false server for the
// scroll pass. Screenshots land in forge-trim-shots/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const shotsDir = path.resolve(__dirname, '../forge-trim-shots');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e-forge-trim');
const FIXTURE_PORT = 8932;
const PLAIN_PORT = 8933;
const USERNAME = 'avatarwalk';
const results = [];
const failures = [];
const RETIRED_FRAGMENTS = [
  '这里的雨只落在说谎的人头上。',
  '每个人出生时都带着一把钥匙，却没有人见过锁。',
  '时间是通货，穷人向富人借明天。',
  '这座城每晚都会换一个位置醒来。',
];

async function check(name, action) {
  try {
    await action();
    results.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.message });
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function waitFor(fn, label, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function startServer(args, env, label) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  return waitFor(async () => (await fetch(`${label}/api/health`)).ok, `${label} health`).then(() => child);
}

async function register(base) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: 'avatars-pass-123' }),
  });
  assert.equal(response.status, 200, 'register the fixture account');
  const json = await response.json();
  return {
    token: json.token,
    uid: json.uid,
    email: null,
    provider: 'username',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
}

async function library(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), 'storyweave:v2');
}

async function walkToStep4(page, base) {
  await page.goto(`${base}/#/forge`, { waitUntil: 'domcontentloaded' });
  // The forge keeps its in-memory step across in-app navigation; a
  // reload is what a fresh visit looks like (stored draft is null once
  // a book exists, so the walk starts at step one).
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await walkFromStep2(page);
}

async function walkFromStep2(page) {
  await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
  await page.locator('.world-grid').getByRole('button', { name: /沉潮港/ }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '你以什么身份醒来？' }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '从哪里醒来？' }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '你是怎样的主角？' }).waitFor();
}

async function finishForge(page) {
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '确认你的故事' }).waitFor();
  await page.getByRole('button', { name: '进入第一章', exact: true }).click();
  await page.waitForFunction(() => {
    const progress = document.querySelector('[role="progressbar"][aria-label="阅读进度"]');
    return progress?.getAttribute('aria-valuenow') === '1';
  });
}

(async () => {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  const fixtureBase = `http://127.0.0.1:${FIXTURE_PORT}`;
  const plainBase = `http://127.0.0.1:${PLAIN_PORT}`;
  const fixture = await startServer(
    [path.resolve(__dirname, '../avatars-shots/dev-server.mjs')],
    { PORT: String(FIXTURE_PORT) },
    fixtureBase,
  );
  const plain = spawn(process.execPath, [path.resolve(__dirname, '../server/index.js')], {
    env: { ...process.env, AUTH_ENABLED: 'false', PORT: String(PLAIN_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await waitFor(async () => (await fetch(`${plainBase}/api/health`)).ok, 'plain server health');

  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'no-preference',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(15_000);
  try {
    const session = await register(fixtureBase);
    await page.goto(`${fixtureBase}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((value) => localStorage.setItem('storyweave.site-session', JSON.stringify(value)), session);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // ---------- world step: god mode carries the new library ----------
    await page.goto(`${fixtureBase}/#/forge`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
    await page.locator('.world-card-god').scrollIntoViewIfNeeded();
    await page.locator('.world-card-god').click();
    await check('god mode: no 写法 chips, sparks come from the 100-hook library', async () => {
      await page.getByLabel(/世界的名字/).waitFor();
      assert.equal(await page.getByText('写法（选填）', { exact: true }).count(), 0, 'the 写法 group is gone');
      assert.equal(await page.getByText('这就是第一步选定的题材', { exact: false }).count(), 0);
      const chips = page.locator('.god-form .stage-chip');
      assert.equal(await chips.count(), 4, 'four sparks are offered');
      const texts = await chips.allInnerTexts();
      for (const text of texts) {
        assert.ok(!RETIRED_FRAGMENTS.includes(text.trim()), `retired line still offered: ${text}`);
        assert.ok(text.trim().length >= 10, 'a spark is a working hook, not a fragment of mood');
      }
      // A spark appends into the setting when tapped.
      await page.getByLabel(/背景设定/).fill('一座靠潮汐运转的港口。');
      await chips.first().click();
      const setting = await page.getByLabel(/背景设定/).inputValue();
      assert.ok(setting.includes(texts[0].trim()), 'the tapped spark lands in the setting');
      await page.locator('.god-form').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(shotsDir, '03-step2-godmode.png') });
    });
    await page.getByRole('button', { name: /改用预设世界/ }).click();

    // ---------- avatar path: step 4 asks nothing the profile knows ----
    // (Still standing on step 2 from the god-mode check above.)
    await walkFromStep2(page);
    await check('avatar in: the trait editor steps aside, the profile persona is on screen', async () => {
      const picker = page.locator('.avatar-picker');
      await picker.waitFor();
      assert.match(await picker.innerText(), /这一本由沈砚来走/, 'the main avatar is pre-selected');
      assert.equal(await page.locator('.trait-editor').count(), 0, 'no trait editor while an avatar is in');
      assert.equal(await page.getByLabel('性格', { exact: true }).count(), 0, 'no trait input either');
      const persona = page.getByLabel(/主角设定/);
      assert.equal(await persona.inputValue(), '从山里走出来的年轻人，话少，手稳。', 'the profile description is the persona');
      await persona.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(shotsDir, '01-step4-avatar.png') });
    });
    await finishForge(page);
    await check('avatar path: the book config carries the avatar persona', async () => {
      const saved = await library(page);
      const book = saved.stories[saved.stories.length - 1];
      assert.equal(book.config.avatarId, 'avatar-legacy0001');
      assert.equal(book.config.persona, '从山里走出来的年轻人，话少，手稳。');
    });

    // ---------- self-made path: input first, library underneath -------
    await walkToStep4(page, fixtureBase);
    await check('self-made: cancelling the bring-in restores the trait input with three library entries', async () => {
      const picker = page.locator('.avatar-picker');
      await picker.waitFor();
      assert.match(await picker.innerText(), /这一本由沈砚来走/, 'the main avatar is pre-selected again');
      await page.getByRole('button', { name: '取消带入' }).click();
      const editor = page.locator('.trait-editor');
      await editor.waitFor();
      const input = page.getByLabel('性格', { exact: true });
      await input.waitFor();
      const chips = editor.locator('.trait-chip');
      assert.equal(await chips.count(), 3, 'three entries are offered');
      const firstBatch = await chips.allInnerTexts();
      // Refresh: a new batch, never repeating the one on screen.
      await page.getByRole('button', { name: '换一批性格词条' }).click();
      const secondBatch = await editor.locator('.trait-chip').allInnerTexts();
      assert.equal(secondBatch.length, 3);
      for (const text of secondBatch) assert.ok(!firstBatch.includes(text), 'refresh repeated a shown entry');
      // Typing is the primary control.
      await input.fill('我自己写的性格');
      assert.equal(await input.inputValue(), '我自己写的性格');
      // Tapping an entry fills name + sketch, still editable afterwards.
      await editor.locator('.trait-chip').first().click();
      const filled = await input.inputValue();
      assert.ok(filled.includes('：'), `entry fill carries name and sketch: ${filled}`);
      assert.ok(secondBatch[0].replace(/\s+/g, ' ').includes(filled.split('：')[0]), 'the fill is the tapped entry');
      await editor.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(shotsDir, '02-step4-self.png') });
      // Keep the tapped entry as this book's trait for the config check.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    });
    await finishForge(page);
    await check('self-made path: the book config carries the filled trait text', async () => {
      const saved = await library(page);
      const book = saved.stories[saved.stories.length - 1];
      assert.ok(!book.config.avatarId, 'no avatar on the self-made book');
      assert.ok(book.config.trait.includes('：'), `trait is the entry text: ${book.config.trait}`);
      assert.ok(book.config.trait.length > 6);
    });

    // ---------- scroll geometry on the plain server -------------------
    const scrollPage = await context.newPage();
    await scrollPage.goto(`${plainBase}/#/forge`, { waitUntil: 'domcontentloaded' });
    await scrollPage.locator('.page-forge').waitFor();
    await scrollPage.waitForTimeout(500);
    await check('scroll: the fixed action capsule holds its nav offset at max scroll', async () => {
      await scrollPage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await scrollPage.waitForTimeout(400);
      const before = await scrollPage.evaluate(() => {
        const bar = document.querySelector('.forge-actions');
        const feedback = document.querySelector('.generation-feedback');
        const rect = bar.getBoundingClientRect();
        return {
          gap: Math.round(window.innerHeight - rect.bottom),
          order: feedback ? (bar.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 : false,
          overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
          scrollY: window.scrollY,
          maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        };
      });
      assert.ok(Math.abs(before.gap - 82) <= 1, `gap below the fixed capsule is ${before.gap}px (REQ-32 offset: nav top 72px + 10px clearance)`);
      assert.equal(before.order, true, 'the status line renders before the bar');
      assert.equal(before.overscroll, 'none', 'the root scroller contains overscroll');
      // Pulling further changes nothing: no ride-up, no blank band.
      await scrollPage.evaluate(() => window.scrollBy(0, 1500));
      await scrollPage.waitForTimeout(250);
      const after = await scrollPage.evaluate(() => ({
        scrollY: window.scrollY,
        gap: Math.round(window.innerHeight - document.querySelector('.forge-actions').getBoundingClientRect().bottom),
      }));
      assert.equal(after.scrollY, before.scrollY);
      assert.equal(after.gap, before.gap);
      await scrollPage.screenshot({ path: path.join(shotsDir, '04-scroll-bottom.png') });
    });

    assert.deepEqual(pageErrors, []);
  } catch (error) {
    failures.push(`suite: ${error.message}`);
    console.error(`FAIL suite: ${error.message}`);
    await page.screenshot({ path: path.join(artifactDir, 'forge-trim-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
    fixture.kill();
    plain.kill();
  }
  console.log(`\n${results.filter((r) => r.status === 'passed').length}/${results.length} forge-trim checks passed. Shots: ${shotsDir}`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
})().catch((error) => { console.error(error); process.exitCode = 1; });
