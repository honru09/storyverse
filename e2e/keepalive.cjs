// PHONE-FIX §37, items J + K. Run against a running server
// (AUTH_ENABLED=false is fine — everything here is guest-reachable).
//   TARGET_URL=http://127.0.0.1:8899 node e2e/keepalive.cjs
//
// J: the main tab views (plaza / home / forge / store / profile page)
// stay mounted after their first visit — returning is instant, with
// component state and scroll position intact, and the first screen
// idle-prefetches the art the other surfaces will need.
// K: the reader is a TOP-LEVEL shell view — a sibling of the kept
// views, never nested inside the page it was opened from, with no
// shell chrome (topbar / sidebar / bottom nav) rendered above it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const targetUrl = process.env.TARGET_URL || 'http://localhost:5173';
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
fs.mkdirSync(artifactDir, { recursive: true });
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

async function navigation(page, name) {
  await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name, exact: true }).click();
}

async function assertReaderIsTopLevel(page, label) {
  const shape = await page.evaluate(() => {
    const reader = document.querySelector('.page-reader');
    return {
      mounted: Boolean(reader),
      insideKeepaliveSlot: Boolean(reader?.closest('[data-keepalive]')),
      insideAnyPage: Boolean(reader?.closest('.page-plaza, .page-home, .page-store, .page-profile, .page-forge')),
      topbar: Boolean(document.querySelector('.topbar')),
      sidebar: Boolean(document.querySelector('.sidebar')),
      bottomNav: Boolean(document.querySelector('.mobile-bottom-nav')),
      profileWindow: Boolean(document.querySelector('.profile-window')),
      shellView: document.querySelector('.app-shell')?.dataset.view,
    };
  });
  assert.equal(shape.mounted, true, `${label}: reader mounted`);
  assert.equal(shape.insideKeepaliveSlot, false, `${label}: reader is not inside a kept-alive page slot`);
  assert.equal(shape.insideAnyPage, false, `${label}: reader is not inside any page subtree`);
  assert.equal(shape.topbar, false, `${label}: no topbar above the reader`);
  assert.equal(shape.sidebar, false, `${label}: no sidebar above the reader`);
  assert.equal(shape.bottomNav, false, `${label}: no bottom nav above the reader`);
  assert.equal(shape.profileWindow, false, `${label}: no profile window stacked under the reader`);
  assert.equal(shape.shellView, 'reader', `${label}: shell view is reader`);
}

(async () => {
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS !== 'false' });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  try {
    await page.goto(`${targetUrl}/#/plaza`, { waitUntil: 'domcontentloaded' });
    await page.locator('.page-plaza').waitFor();

    await check('J3 idle prefetch warms the family + waiting art', async () => {
      await page.waitForTimeout(3000);
      const warmed = requests.filter((url) => url.includes('/art/'));
      assert.ok(warmed.some((url) => url.includes('family-') && url.includes('-640.webp')),
        `family art prefetched: ${warmed.join(', ')}`);
      assert.ok(warmed.some((url) => url.includes('waiting-weaving-1600.webp')), 'waiting art prefetched');
    });

    await check('J1 plaza survives a round trip with its scroll position', async () => {
      await page.evaluate(() => window.scrollTo(0, 420));
      await page.waitForTimeout(250);
      const leftAt = await page.evaluate(() => window.scrollY);
      await navigation(page, '书城');
      await page.locator('.page-store').waitFor();
      const plazaSlot = await page.evaluate(() => {
        const slot = document.querySelector('[data-keepalive="plaza"]');
        return { exists: Boolean(slot), hidden: slot?.hidden };
      });
      assert.equal(plazaSlot.exists, true, 'plaza slot stays mounted while in the store');
      assert.equal(plazaSlot.hidden, true, 'plaza slot is hidden, not unmounted');
      await navigation(page, '广场');
      await page.waitForTimeout(350);
      const back = await page.evaluate(() => ({
        scrollY: window.scrollY,
        plazaMounted: Boolean(document.querySelector('[data-keepalive="plaza"] .page-plaza')),
        loading: document.querySelectorAll('.plaza-loading').length,
      }));
      assert.equal(back.plazaMounted, true, 'plaza content is synchronously in place on return');
      assert.equal(back.loading, 0, 'no loading indicator on return');
      assert.ok(Math.abs(back.scrollY - leftAt) <= 2, `scroll restored: left=${leftAt} back=${back.scrollY}`);
    });

    await check('J1 forge keeps its mid-flow state across tab switches', async () => {
      await navigation(page, '造世');
      await page.getByRole('button', { name: /玄幻修真/ }).click();
      await page.locator('.template-wall').waitFor();
      await navigation(page, '广场');
      await navigation(page, '造世');
      const wall = await page.evaluate(() => {
        const el = document.querySelector('[data-keepalive="forge"] .template-wall');
        return Boolean(el) && el.getClientRects().length > 0;
      });
      assert.equal(wall, true, 'template wall (step state) is still there on return');
    });

    await check('K reader opens as a top-level page from the forge', async () => {
      await page.locator('.template-wall').getByRole('button', { name: /修仙/ }).click();
      for (let step = 0; step < 4; step += 1) {
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.waitForTimeout(250);
      }
      await page.getByLabel('主角昵称（选填）').fill('保活剑客');
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await page.getByRole('button', { name: '进入第一章', exact: true }).click();
      await page.locator('.page-reader').waitFor();
      await assertReaderIsTopLevel(page, 'forge path');
    });

    await check('K leaving the reader returns to the shelf, which kept its place', async () => {
      await page.locator('.reader-status-back').click();
      await page.locator('.page-home').waitFor();
      await page.evaluate(() => window.scrollTo(0, 160));
      await page.waitForTimeout(250);
      const leftAt = await page.evaluate(() => window.scrollY);
      await page.getByRole('button', { name: '继续阅读', exact: true }).click();
      await page.locator('.page-reader').waitFor();
      await assertReaderIsTopLevel(page, 'shelf path');
      await page.locator('.reader-status-back').click();
      await page.locator('.page-home').waitFor();
      await page.waitForTimeout(350);
      const backAt = await page.evaluate(() => window.scrollY);
      assert.ok(Math.abs(backAt - leftAt) <= 2, `shelf scroll restored after reader: left=${leftAt} back=${backAt}`);
    });

    await check('K reader opens as a top-level page from the store too', async () => {
      await page.getByRole('button', { name: '继续阅读', exact: true }).click();
      await page.locator('.page-reader').waitFor();
      // Summon the chrome (centre tap) and share the book into the
      // local store, exactly like journey.cjs does.
      const box = await page.locator('.page-reader').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
      await page.locator('.reader-chrome').first().waitFor();
      await page.getByRole('button', { name: '分享', exact: true }).click();
      await page.getByRole('dialog', { name: '分享预览' }).getByRole('button', { name: '保存到本机书城' }).click();
      await page.waitForTimeout(400);
      await page.locator('.reader-status-back').click();
      await page.locator('.page-home').waitFor();
      await navigation(page, '书城');
      await page.getByRole('button').filter({ hasText: '本机分享' }).click();
      await page.locator('.page-reader').waitFor();
      await assertReaderIsTopLevel(page, 'store path');
      await page.getByRole('button', { name: '返回书城', exact: true }).click();
      await page.locator('.page-store').waitFor();
    });
  } catch (error) {
    await check('keepalive suite completes without interruption', async () => { throw error; });
    await page.screenshot({ path: path.join(artifactDir, 'keepalive-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }
  console.log(`\n${results.length - failures.length}/${results.length} keepalive checks passed.`);
  if (failures.length > 0) process.exitCode = 1;
})();
