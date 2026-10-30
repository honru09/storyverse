// GENRE-FREEDOM e2e (REQ-51 + the 2026-10-30 23:43 layout revision):
// step 1 of the forge, walked at 390×844.
//  - First screen: the free-creation hero (black-hole region + the
//    free-genre input inside it) leads; the taxonomy is NOT on screen
//    until its door — the user's own words on the button — is opened.
//  - Opened: every shelf brick (18 families + the random brick) has
//    identical offsetWidth/offsetHeight; no brick carries a count.
//  - Typing a free genre selects it, the note names it and its borrowed
//    family, 继续 reaches step 2, and a reload restores the words with
//    the pick still lit (draft compatibility).
//  - Scrolled to the very bottom with the shelves open, the
//    自己写一本 entry is fully clear of both the fixed action capsule
//    and the bottom nav (the user's screenshot complaint).
// Plain AUTH_ENABLED=false server: the forge walk needs no account.
// Screenshots land in genre-freedom-shots/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const shotsDir = path.resolve(__dirname, '../genre-freedom-shots');
const PORT = 8941;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const failures = [];

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

(async () => {
  fs.mkdirSync(shotsDir, { recursive: true });
  const server = spawn(process.execPath, [path.resolve(__dirname, '../server/index.js')], {
    env: { ...process.env, AUTH_ENABLED: 'false', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await waitFor(async () => (await fetch(`${BASE}/api/health`)).ok, 'server health');

  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS !== 'false' });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(15_000);
  try {
    await page.goto(`${BASE}/#/forge`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();

    await check('first screen leads with the free-creation hero, shelves tucked away', async () => {
      const hero = page.locator('.genre-hero');
      await hero.waitFor();
      assert.ok(await hero.getByText('自由创世').isVisible());
      assert.ok(await page.locator('.custom-genre-input').isVisible());
      assert.equal(await page.locator('.shelf-grid').count(), 0, 'taxonomy starts behind its door');
      assert.ok(await page.getByRole('button', { name: /没灵感？试试从分类里找/ }).isVisible());
    });
    await page.screenshot({ path: path.join(shotsDir, 'step1-hero-390.png') });

    await check('opened shelves: every brick the same size, random included', async () => {
      await page.getByRole('button', { name: /没灵感？试试从分类里找/ }).click();
      await page.locator('.shelf-grid').waitFor();
      const sizes = await page.locator('.shelf-brick').evaluateAll((bricks) =>
        bricks.map((brick) => `${brick.offsetWidth}x${brick.offsetHeight}`));
      assert.equal(sizes.length, 19, `expected 18 families + random, got ${sizes.length}`);
      assert.equal(new Set(sizes).size, 1, `brick sizes diverge: ${[...new Set(sizes)].join(', ')}`);
      const texts = await page.locator('.shelf-brick').allInnerTexts();
      assert.ok(!texts.some((text) => /种写法/.test(text)), 'no brick carries the count copy');
      assert.ok(texts.some((text) => text.includes('随机题材')), 'the random brick is in the grid');
      assert.ok(texts.some((text) => text.includes('种田经营')), 'the expansion families are on the wall');
    });
    await page.locator('.shelf-grid').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(shotsDir, 'step1-shelves-390.png') });

    await check('the manual entry clears the capsule and the nav when scrolled into view', async () => {
      // The forge scroller is .page-forge itself; scrollIntoView walks
      // the real scroll containers exactly like a reader's thumb does.
      await page.locator('.forge-manual-entry').scrollIntoViewIfNeeded();
      await page.waitForTimeout(450);
      const geometry = await page.evaluate(() => {
        const entry = document.querySelector('.forge-manual-entry').getBoundingClientRect();
        const capsule = document.querySelector('.forge-actions').getBoundingClientRect();
        const nav = document.querySelector('.mobile-bottom-nav').getBoundingClientRect();
        const scroller = document.querySelector('.page-forge');
        return {
          entryBottom: entry.bottom, entryTop: entry.top, capsuleTop: capsule.top, navTop: nav.top,
          viewport: window.innerHeight, atBottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2,
        };
      });
      assert.ok(geometry.atBottom, 'the entry only fully shows at the very bottom of the step');
      assert.ok(geometry.entryBottom <= geometry.capsuleTop - 2,
        `entry bottom ${geometry.entryBottom} must clear capsule top ${geometry.capsuleTop}`);
      assert.ok(geometry.entryBottom <= geometry.navTop - 2,
        `entry bottom ${geometry.entryBottom} must clear nav top ${geometry.navTop}`);
      assert.ok(geometry.entryTop >= 0, 'entry fully inside the viewport');
    });
    await page.screenshot({ path: path.join(shotsDir, 'step1-bottom-390.png') });

    await check('typing a free genre selects it and 继续 reaches the world step', async () => {
      await page.evaluate(() => { (document.scrollingElement || document.documentElement).scrollTop = 0; });
      await page.getByRole('button', { name: /没灵感？试试从分类里找/ }).click(); // 收起分类
      await page.locator('.custom-genre-input').fill('民国谍战');
      await page.waitForFunction(() => document.querySelector('.genre-hero')?.classList.contains('selected'));
      const note = await page.locator('.world-selection-note').innerText();
      assert.ok(note.includes('民国谍战'), `note names the words: ${note}`);
      assert.ok(note.includes('历史'), `note names the borrowed family: ${note}`);
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
    });

    await check('a reload restores the free-genre draft with its pick lit', async () => {
      await page.goto(`${BASE}/#/forge`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      // The draft walk may resume on step 2 (where the walk left it);
      // step back to the genre step either way.
      const back = page.getByRole('button', { name: /上一步/ });
      if (await back.count()) await back.first().click();
      await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
      assert.equal(await page.locator('.custom-genre-input').inputValue(), '民国谍战');
      assert.ok(await page.locator('.genre-hero.selected').count(), 'hero still shows the pick');
      assert.equal(await page.locator('.shelf-grid').count(), 0, 'custom drafts land on the hero, shelves shut');
    });
    await page.screenshot({ path: path.join(shotsDir, 'step1-custom-restored-390.png') });

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(JSON.stringify({ results, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
