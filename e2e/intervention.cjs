// Intervention batch e2e: on the local （预设体验） engine — no network, no
// paid generation. Read ch.1 → intervene with free text → the PREPARED
// ch.2 is revised in place: intervention woven into its scaffold prose,
// 介入印记 on the chapter, queue flipped to applied, ch.1 untouched.
// Screenshots are viewport-only at 390×844 and land in intervention-shots/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const targetUrl = process.env.TARGET_URL || 'http://localhost:5173';
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const shotsDir = path.resolve(__dirname, '../intervention-shots');
const storageKey = 'storyweave:v2';
const NUDGE = '让灯塔的灯今晚熄灭一次';
const results = [];
const failures = [];
fs.mkdirSync(artifactDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

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

async function library(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function currentChapter(page, number) {
  await page.waitForFunction(expected => {
    const progress = document.querySelector('[role="progressbar"][aria-label="阅读进度"]');
    return progress?.getAttribute('aria-valuenow') === String(expected);
  }, number);
}

// The reader menu chrome is summoned by a tap in the middle of the
// screen; tests dispatch that same tap on the article so the scroll
// position never decides whether it lands.
async function openChrome(page) {
  if (await page.locator('.reader-chrome-bottom').count() === 0) {
    await page.evaluate(() => {
      const el = document.querySelector('.reader-article');
      const rect = el.getBoundingClientRect();
      const options = { bubbles: true, clientX: Math.round(window.innerWidth / 2), clientY: Math.round(Math.min(window.innerHeight / 2, Math.max(80, rect.top + 140))) };
      el.dispatchEvent(new PointerEvent('pointerdown', options));
      el.dispatchEvent(new MouseEvent('click', options));
    });
  }
  await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
}

async function forgeLocalBook(page) {
  await page.goto(`${targetUrl}#/home`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '开启第一本书', exact: true }).click();
  await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
  await page.locator('.world-grid').getByRole('button', { name: /沉潮港/ }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '你以什么身份醒来？' }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '从哪里醒来？' }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByLabel('主角昵称（选填）').fill('介入测试旅人');
  await page.getByRole('heading', { name: '想拥有什么能力？' }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '确认你的故事' }).waitFor();
  await page.getByRole('button', { name: '进入第一章', exact: true }).click();
  await currentChapter(page, 1);
}

(async () => {
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
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(12000);
  try {
    await forgeLocalBook(page);

    let before;
    await check('chapter two is already prepared before the intervention', async () => {
      const saved = await library(page);
      assert.notEqual(saved.stories[0].engine, 'gemini');
      assert.equal(saved.stories[0].chapters.length, 2);
      assert.equal(saved.stories[0].chapters[1].interventions, undefined);
      before = structuredClone(saved.stories[0]);
    });

    await check('the intervene entry sits in the reader chrome grid', async () => {
      // Settle at the chapter end, summon the menu chrome, and the
      // intervene cell shares the frame with the star map card.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
      await openChrome(page);
      await page.getByRole('button', { name: '介入', exact: true }).waitFor();
      await page.screenshot({ path: path.join(shotsDir, '01-reader-button.png') });
    });

    await page.getByRole('button', { name: '介入', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: '介入 · 扰动世界线' });
    await sheet.waitFor();
    await check('the sheet names the target chapter, its prepared state and the preset chips', async () => {
      await sheet.getByText(/将落在/).waitFor();
      assert.match(await sheet.innerText(), /第 2 章/);
      assert.match(await sheet.innerText(), /重写/);
      for (const chip of ['机缘将至', '危机逼近', '故人将至', '天象异变', '听天命']) {
        assert.ok(await sheet.getByRole('button', { name: new RegExp(chip) }).count(), chip);
      }
      await page.screenshot({ path: path.join(shotsDir, '02-sheet.png') });
    });

    await sheet.getByLabel(/亲手写下/).fill(NUDGE);
    await sheet.getByRole('button', { name: '介入并重写下一章', exact: true }).click();

    await check('the intervention sequence shows its named stages mid-pass', async () => {
      await page.locator('.intervention-overlay').waitFor({ state: 'visible' });
      await page.waitForTimeout(1100);
      assert.match(await page.locator('.intervention-overlay').innerText(), /重写下一章/);
      await page.screenshot({ path: path.join(shotsDir, '03-animation.png') });
      await page.locator('.intervention-overlay').waitFor({ state: 'detached', timeout: 15000 });
    });

    await check('the prepared chapter was revised: nudge woven in, marker stamped, queue applied, chapter one untouched', async () => {
      const saved = (await library(page)).stories[0];
      assert.equal(saved.chapters.length, 2);
      assert.deepEqual(saved.chapters[0], before.chapters[0], 'chapter one is byte-identical');
      assert.ok(saved.chapters[1].paragraphs.join('').includes(NUDGE), 'the nudge is woven into the prose');
      assert.notDeepEqual(saved.chapters[1].paragraphs, before.chapters[1].paragraphs);
      assert.deepEqual(saved.chapters[1].interventions, [{ text: NUDGE, kind: 'text' }]);
      assert.ok(saved.chapters[1].events.some(event => event.includes('介入事件')));
      assert.equal(saved.interventions.length, 1);
      assert.equal(saved.interventions[0].status, 'applied');
      assert.equal(saved.interventions[0].targetIndex, 1);
    });

    await page.getByRole('button', { name: '下一章', exact: true }).click();
    await currentChapter(page, 2);
    await check('the revised chapter carries the visible 介入印记 with the reader\u2019s own words', async () => {
      const marker = page.locator('.intervention-marker');
      await marker.waitFor();
      assert.match(await marker.innerText(), new RegExp(NUDGE));
      await page.screenshot({ path: path.join(shotsDir, '04-marker.png') });
    });

    await check('the directory flags the intervened chapter', async () => {
      // From chapter one, so the row's status is the marker, not 正在阅读.
      await page.getByRole('button', { name: '上一章', exact: true }).click();
      await currentChapter(page, 1);
      await page.getByRole('button', { name: '目录', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: '章节目录' });
      const row = dialog.locator('.chapter-directory-list').getByRole('button').nth(1);
      assert.match(await row.innerText(), /介入/);
      await dialog.getByRole('button', { name: '关闭面板' }).click();
    });

    assert.deepEqual(pageErrors, []);
  } catch (error) {
    failures.push(`suite: ${error.message}`);
    console.error(`FAIL suite: ${error.message}`);
    await page.screenshot({ path: path.join(artifactDir, 'intervention-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }
  const failed = results.filter(result => result.status === 'failed').length + (failures.length > results.filter(r => r.status === 'failed').length ? 0 : 0);
  console.log(`\n${results.length - results.filter(r => r.status === 'failed').length}/${results.length} intervention checks passed. Shots: ${shotsDir}`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
