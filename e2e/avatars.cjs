// Multi-avatar batch e2e (PERSONA-QA F-27/F-28): on the fixture stack
// (spawned automatically unless TARGET_URL points at an equivalent
// seeded server). The walk: a LEGACY single-avatar account signs in →
// the avatar is there as the main avatar, painting intact → a second
// avatar is created and painted → set as main → a book is forged
// bringing the FIRST (now non-main) avatar → that avatar is deleted →
// the book still opens and reads. Screenshots are viewport-only at
// 390×844 and land in avatars-shots/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const shotsDir = path.resolve(__dirname, '../avatars-shots');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e-avatars');
const FIXTURE_PORT = 8931;
const USERNAME = 'avatarwalk';
const LEGACY_ID = 'avatar-legacy0001';
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

async function startFixtureServer() {
  if (process.env.TARGET_URL) return { base: process.env.TARGET_URL, child: null };
  const child = spawn(process.execPath, [path.join(shotsDir, 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await waitFor(async () => (await fetch(`${base}/api/health`)).ok, 'fixture server health');
  return { base, child };
}

async function register(base) {
  const response = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: 'avatars-pass-123' }),
  });
  assert.equal(response.status, 200, 'register the legacy account');
  const json = await response.json();
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

async function library(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), 'storyweave:v2');
}

(async () => {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  const { base, child } = await startFixtureServer();
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
    const { session } = await register(base);
    await page.goto(`${base}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((value) => localStorage.setItem('storyweave.site-session', JSON.stringify(value)), session);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // --- the migrated avatar is simply there -------------------------
    await page.getByRole('button', { name: /我的化身/ }).first().click();
    await page.getByRole('heading', { name: '我的化身' }).waitFor();
    await check('the legacy avatar migrated in as the main avatar, listed once', async () => {
      const cards = page.locator('.avatar-card:not(.avatar-card-new)');
      await cards.first().waitFor();
      assert.equal(await cards.count(), 1);
      assert.match(await cards.first().innerText(), /沈砚/);
      assert.match(await cards.first().innerText(), /主化身/);
      const nameInput = page.getByLabel('名字', { exact: true });
      assert.equal(await nameInput.inputValue(), '沈砚', 'the editor is seeded with the migrated avatar');
    });
    await check('the whole-image repaint + cost line is stated up front (AVATAR-TRIM)', async () => {
      const note = page.locator('.avatar-repaint-note');
      await note.waitFor();
      assert.match(await note.innerText(), /整张/);
      assert.match(await note.innerText(), /按描述重画立绘/);
      assert.match(await note.innerText(), /1 次立绘额度/);
      // Per-part personalisation is offline: no part controls anywhere
      // in the editor, and the part labels are gone from its text.
      assert.equal(await page.locator('.avatar-fields').count(), 0);
      const editorText = await page.locator('.avatar-editor').innerText();
      assert.ok(!/发色|发型|脸部细节/.test(editorText), 'no part-adjustment labels remain');
      assert.equal(await page.getByRole('button', { name: '按描述重画立绘' }).count(), 1);
      await note.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(shotsDir, '03-repaint-note.png') });
    });

    // --- a second avatar joins the drawer -----------------------------
    await page.locator('.avatar-card-new').click();
    await page.getByLabel('名字', { exact: true }).fill('陆青禾');
    await page.getByRole('button', { name: '创建并生成立绘' }).click();
    await check('the second avatar is created and painted into the list', async () => {
      await waitFor(async () => (await page.locator('.avatar-card:not(.avatar-card-new)').count()) === 2, 'two avatar cards');
      const texts = await page.locator('.avatar-card:not(.avatar-card-new)').allInnerTexts();
      assert.ok(texts.some((text) => text.includes('陆青禾')));
      assert.ok(texts.some((text) => text.includes('沈砚')));
      await page.locator('.avatar-collection').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(shotsDir, '01-avatar-list.png') });
    });

    // --- set the second avatar as main --------------------------------
    await check('set-main moves the 主化身 badge to the second avatar', async () => {
      // The editor is already on 陆青禾 (creation lands there).
      await page.getByRole('button', { name: '设为主化身' }).click();
      await waitFor(async () => {
        const cards = await page.locator('.avatar-card:not(.avatar-card-new)').all();
        for (const card of cards) {
          const text = await card.innerText();
          if (text.includes('陆青禾') && text.includes('主化身')) return true;
        }
        return false;
      }, 'the badge on 陆青禾');
    });

    // --- forge a book bringing the FIRST avatar -----------------------
    await page.goto(`${base}/#/forge`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
    await page.locator('.world-grid').getByRole('button', { name: /沉潮港/ }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '你以什么身份醒来？' }).waitFor();
    // First 继续 rolls an identity and stays (its spawn points expand in
    // place); the second accepts and advances.
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '从哪里醒来？' }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '你是怎样的主角？' }).waitFor();
    await check('step 4 offers the whole drawer, main pre-selected', async () => {
      const picker = page.locator('.avatar-picker');
      await picker.waitFor();
      assert.match(await picker.innerText(), /这一本由陆青禾来走/, 'the main avatar is pre-selected');
      assert.match(await picker.innerText(), /沈砚/);
      await picker.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(shotsDir, '02-forge-picker.png') });
      // Bring the FIRST avatar (no longer the main one) instead.
      const legacyCard = picker.locator('.avatar-bring', { hasText: '沈砚' });
      await legacyCard.getByRole('button', { name: '用这个化身' }).click();
      assert.match(await picker.innerText(), /这一本由沈砚来走/);
      assert.equal(await page.getByLabel('主角昵称（选填）').inputValue(), '沈砚');
    });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '确认你的故事' }).waitFor();
    await page.getByRole('button', { name: '进入第一章', exact: true }).click();
    await page.waitForFunction(() => {
      const progress = document.querySelector('[role="progressbar"][aria-label="阅读进度"]');
      return progress?.getAttribute('aria-valuenow') === '1';
    });
    await check('the book config carries the first avatar id and its written look snapshot', async () => {
      const saved = await library(page);
      assert.equal(saved.stories.length, 1);
      assert.equal(saved.stories[0].config.avatarId, LEGACY_ID);
      // AVATAR-TRIM: the snapshot is the avatar's written description —
      // the legacy record's stored parts (长直发 etc.) contribute nothing.
      assert.equal(saved.stories[0].config.avatarAppearance, '从山里走出来的年轻人，话少，手稳。');
      assert.equal(saved.stories[0].config.name, '沈砚');
      // FORGE-TRIM: the avatar's written profile (its 性格与设定） rides
      // into the book's persona — the forge no longer re-asks for a
      // trait the profile already states.
      assert.equal(saved.stories[0].config.persona, '从山里走出来的年轻人，话少，手稳。');
    });

    // --- delete that avatar; the book must not care -------------------
    await page.goto(`${base}/#/avatar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '我的化身' }).waitFor();
    const legacyCard = page.locator('.avatar-card:not(.avatar-card-new)', { hasText: '沈砚' });
    await legacyCard.click();
    await page.getByRole('button', { name: '删除这位化身' }).click();
    await page.getByRole('button', { name: '确认删除' }).click();
    await check('the avatar is deleted and the drawer keeps the main avatar', async () => {
      await waitFor(async () => (await page.locator('.avatar-card:not(.avatar-card-new)').count()) === 1, 'one avatar card left');
      assert.match(await page.locator('.avatar-card:not(.avatar-card-new)').first().innerText(), /陆青禾/);
    });
    await page.goto(`${base}/#/home`, { waitUntil: 'domcontentloaded' });
    // The only book is the active story: the hero's continue button (or
    // its wooden-shelf book, when the shelf carries it) opens it.
    const continueButton = page.getByRole('button', { name: '继续阅读', exact: true });
    if (await continueButton.count()) {
      await continueButton.click();
    } else {
      const saved = await library(page);
      await page.locator('.wood-book', { hasText: saved.stories[0].title }).first().click();
    }
    await check('the book whose avatar was deleted still opens and reads', async () => {
      await page.waitForFunction(() => {
        const progress = document.querySelector('[role="progressbar"][aria-label="阅读进度"]');
        return progress?.getAttribute('aria-valuenow') === '1';
      });
      const prose = await page.locator('.reader-article').innerText();
      assert.ok(prose.length > 100, 'chapter prose renders');
      const after = await library(page);
      assert.equal(after.stories[0].config.avatarId, LEGACY_ID, 'the config snapshot is untouched by the deletion');
    });

    assert.deepEqual(pageErrors, []);
  } catch (error) {
    failures.push(`suite: ${error.message}`);
    console.error(`FAIL suite: ${error.message}`);
    await page.screenshot({ path: path.join(artifactDir, 'avatars-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
    if (child) child.kill();
  }
  console.log(`\n${results.filter((r) => r.status === 'passed').length}/${results.length} avatar checks passed. Shots: ${shotsDir}`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
})().catch((error) => { console.error(error); process.exitCode = 1; });
