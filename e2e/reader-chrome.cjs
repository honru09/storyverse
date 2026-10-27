// Reader chrome (番茄 model) acceptance: immersive hairlines, tap zones,
// tap-summoned menu, single-line labels at 360/390/430, settings-sheet
// geometry. Isolated profiles only; all generation requests are blocked.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = process.env.TARGET_URL || 'http://127.0.0.1:8899';
const artifacts = process.env.PW_ARTIFACT_DIR || path.join(__dirname, '..', 'reader-chrome-shots');
fs.mkdirSync(artifacts, { recursive: true });
const report = { target, checks: [], failures: [], captures: [] };
const key = 'storyweave:v2';
const widths = (process.env.PW_WIDTHS || '360,390,430').split(',').map(Number).filter(Number.isFinite);

(async () => {
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'zh-CN', reducedMotion: 'reduce', isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/generate', route => route.fulfill({ status: 503, json: { error: 'Test safety guard' } }));
      const check = async (name, work) => { await work(); report.checks.push({ width, name }); console.log(`PASS ${width} ${name}`); };
      const capture = async name => { const file = path.join(artifacts, `${width}-${name}.png`); await page.screenshot({ path: file, fullPage: false }); report.captures.push(file); };
      const tap = async (fx, fy = 0.5) => { await page.touchscreen.tap(Math.round(width * fx), Math.round(844 * fy)); await page.waitForTimeout(120); };
      const settleScroll = async () => {
        let last = -1;
        for (let i = 0; i < 40; i++) {
          const y = await page.evaluate(() => window.scrollY);
          if (y === last) return y;
          last = y;
          await page.waitForTimeout(120);
        }
        return last;
      };
      const chromeCount = () => page.locator('.reader-chrome').count();
      const openChrome = async () => { if (await chromeCount() === 0) await tap(0.5); await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' }); };
      const closeChrome = async () => { if (await chromeCount() > 0) await tap(0.5); await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' }); };
      try {
        await page.goto(target);
        await page.locator('button').filter({ hasText: '你的书架、化身与草稿都在这里' }).click();
        await page.getByRole('button', { name: '开启第一本书', exact: true }).click();
        for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('button', { name: '预设体验', exact: true }).click();
        await page.getByRole('button', { name: '进入第一章', exact: true }).click();
        await page.locator('[data-reading-paragraph]').first().waitFor();
        await page.evaluate(key => {
          const library = JSON.parse(localStorage.getItem(key));
          const book = library.stories.find(story => story.id === library.activeStoryId);
          book.chapters[0].paragraphs = Array.from({ length: 22 }, (_, i) => `第${i + 1}段，海风穿过长街。年轻的旅人放慢脚步，听见远处的钟声。` + '他记得那片海，也记得故乡的名字。'.repeat(9));
          localStorage.setItem(key, JSON.stringify(library));
        }, key);
        await page.reload();
        await page.locator('[data-reading-paragraph="21"]').waitFor();
        await page.evaluate(() => window.scrollTo(0, 0));

        await check('collapsed state is pure immersion: no cards, first line uncovered', async () => {
          assert.equal(await page.locator('.reader-topline').count(), 0, 'topline card retired');
          assert.equal(await page.locator('.reader-floating-dock').count(), 0, 'floating dock retired');
          assert.equal(await chromeCount(), 0, 'menu chrome starts closed');
          const geo = await page.evaluate(() => {
            const top = document.querySelector('.reader-status-top').getBoundingClientRect();
            const bottom = document.querySelector('.reader-status-bottom').getBoundingClientRect();
            const h1 = document.querySelector('.reader-article h1').getBoundingClientRect();
            const first = document.querySelector('[data-reading-paragraph="0"]').getBoundingClientRect();
            const cx = first.left + first.width / 2;
            const hit = document.elementFromPoint(cx, first.top + 4);
            return { lineTop: top.top, lineBottom: top.bottom, bottomBottom: bottom.bottom, viewportH: window.innerHeight, h1Top: h1.top, firstTop: first.top, hitTag: hit?.tagName, hitInside: Boolean(hit?.closest('[data-reading-paragraph]')) };
          });
          // The hairlines hug the viewport edges themselves: a page box
          // shifted by a collapsed margin (the regression this guards)
          // leaves every number below plausible while the lines float
          // mid-screen or off the bottom edge entirely.
          assert.ok(geo.lineTop <= 2, `top hairline is pinned to the viewport top (top ${geo.lineTop})`);
          assert.ok(geo.bottomBottom >= geo.viewportH - 2, `bottom hairline is pinned to the viewport bottom (${geo.bottomBottom} of ${geo.viewportH})`);
          assert.ok(geo.h1Top >= geo.lineBottom - 1, `chapter title starts below the hairline (${geo.h1Top} >= ${geo.lineBottom})`);
          assert.ok(geo.firstTop >= geo.lineBottom, 'first paragraph clears the hairline');
          assert.ok(geo.hitInside, `first line is the topmost element at its own position (hit ${geo.hitTag})`);
          const bottomLine = await page.locator('.reader-status-bottom').innerText();
          assert.match(bottomLine, /本章 \d+%/, 'bottom hairline carries the in-chapter progress');
          assert.match(bottomLine, /\d{1,2}:\d{2}/, 'bottom hairline carries the clock');
          if (width === 390) await capture('immersive');
        });

        await check('centre tap summons the chrome and the next one folds it away', async () => {
          await tap(0.5);
          await page.locator('.reader-chrome-top').waitFor({ state: 'visible' });
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          if (width === 390) await capture('chrome-open');
          if (width === 430) await capture('chrome-open');
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          assert.equal(await chromeCount(), 0);
        });

        await check('chrome labels are single-line and cells are even at this width', async () => {
          await openChrome();
          const cells = await page.locator('.reader-chrome-grid button').evaluateAll(nodes => nodes.map(node => {
            const rect = node.getBoundingClientRect();
            const span = node.querySelector('span');
            return { w: rect.width, h: rect.height, spanH: span.offsetHeight, spanSW: span.scrollWidth, spanCW: span.clientWidth };
          }));
          assert.equal(cells.length, 5, 'five chrome cells for an own book');
          for (const cell of cells) {
            assert.ok(cell.h >= 44, `cell hit area ${cell.h}px tall`);
            assert.ok(cell.spanH <= 20, `label stays on one line (offsetHeight ${cell.spanH})`);
            assert.ok(cell.spanSW <= cell.spanCW + 1, 'label never overflows its cell');
          }
          const widthsOnly = cells.map(cell => cell.w);
          assert.ok(Math.max(...widthsOnly) - Math.min(...widthsOnly) <= 1, 'cells are equal width');
          const icons = await page.locator('.reader-chrome-actions button').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
          assert.equal(icons.length, 3, '设定集 / 封面 / 分享 icon buttons');
          assert.ok(icons.every(icon => icon.w >= 44 && icon.h >= 44), 'top icon hit areas are at least 44px');
          const title = await page.locator('.reader-chrome-title b').evaluate(node => ({ h: node.offsetHeight, sw: node.scrollWidth, cw: node.clientWidth }));
          assert.ok(title.h <= 24 && title.sw >= title.cw - 1, 'chrome title is one truncated line');
        });

        await check('scrolling folds the chrome away', async () => {
          await page.mouse.wheel(0, 320);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await page.evaluate(() => window.scrollTo(0, 0));
        });

        await check('side taps turn one screen in scroll mode', async () => {
          await page.evaluate(() => window.scrollTo(0, 700));
          const before = await settleScroll();
          assert.ok(before > 300, 'started mid-chapter');
          await tap(0.92);
          const afterForward = await settleScroll();
          assert.ok(afterForward > before + 300, `right tap turned a screen (${before} -> ${afterForward})`);
          await tap(0.08);
          const afterBack = await settleScroll();
          assert.ok(afterBack < afterForward - 300, `left tap turned a screen back (${afterForward} -> ${afterBack})`);
        });

        await check('chrome slider seeks inside the chapter', async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(150);
          await openChrome();
          const slider = page.getByRole('slider', { name: '本章进度', exact: true });
          await slider.fill('75');
          await page.waitForFunction(() => window.scrollY > 500, null, { timeout: 4000 });
          await slider.fill('0');
          // Seek home can take a moment to settle when the earlier
          // smooth scroll is still draining; assert the settled value.
          const settled = await settleScroll();
          assert.ok(settled < 120, `slider seek home settles near the chapter top (scrollY ${settled})`);
          await closeChrome();
        });

        await check('page mode: side taps page, and reading mode still lives in settings', async () => {
          await openChrome();
          await page.getByRole('button', { name: '阅读设置', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: '阅读设置', exact: true });
          await dialog.getByRole('group', { name: '阅读方式', exact: true }).getByRole('radio', { name: '逐屏阅读', exact: true }).click();
          await page.getByRole('button', { name: '关闭面板', exact: true }).click();
          const y0 = await page.evaluate(() => window.scrollY);
          await tap(0.92);
          await page.waitForFunction(start => window.scrollY > start + 200, y0, { timeout: 4000 });
          const y1 = await page.evaluate(() => window.scrollY);
          await tap(0.08);
          await page.waitForFunction(start => window.scrollY < start - 200, y1, { timeout: 4000 });
          // Restore scroll mode for the remaining checks.
          await openChrome();
          await page.getByRole('button', { name: '阅读设置', exact: true }).click();
          await dialog.getByRole('group', { name: '阅读方式', exact: true }).getByRole('radio', { name: '上下滚动', exact: true }).click();
          await page.getByRole('button', { name: '关闭面板', exact: true }).click();
        });

        await check('settings sheet: close button inside the grid, preview matches the prose', async () => {
          await openChrome();
          await page.getByRole('button', { name: '阅读设置', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: '阅读设置', exact: true });
          await dialog.waitFor();
          const probe = await dialog.evaluate(node => {
            const sheet = node.getBoundingClientRect();
            const btn = node.querySelector('.reading-dialog-heading .icon-button').getBoundingClientRect();
            const previewP = node.querySelector('.reading-preferences-preview p');
            const article = document.querySelector('.reader-article');
            const lede = document.querySelector('.article-lede');
            const cs = el => getComputedStyle(el);
            return {
              btn: { top: btn.top - sheet.top, right: sheet.right - btn.right, w: btn.width, h: btn.height },
              previewFont: cs(previewP).fontSize, articleFont: cs(article).fontSize,
              previewIndent: parseFloat(cs(previewP).textIndent), ledeIndent: parseFloat(cs(lede).textIndent),
              previewLeading: cs(previewP).lineHeight, articleLeading: cs(article).lineHeight,
            };
          });
          assert.ok(probe.btn.w >= 40 && probe.btn.w <= 48 && probe.btn.h >= 40 && probe.btn.h <= 48, `close button is a standard circle (${probe.btn.w}x${probe.btn.h})`);
          assert.ok(probe.btn.top >= 8 && probe.btn.right >= 8, 'close button sits inside the sheet padding, never over the corner');
          assert.equal(probe.previewFont, probe.articleFont, 'preview uses the prose font size');
          assert.equal(probe.previewIndent, probe.ledeIndent, 'preview first-line indent matches the prose');
          assert.equal(probe.previewLeading, probe.articleLeading, 'preview line height matches the prose');
          if (width === 390) await capture('settings');
          await page.getByRole('button', { name: '关闭面板', exact: true }).click();
        });

        await check('focus mode hides even the hairlines; centre tap still summons chrome', async () => {
          await page.evaluate(() => window.scrollTo(0, 300));
          await openChrome();
          await page.getByRole('button', { name: '专注', exact: true }).click();
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          assert.equal(await chromeCount(), 0, 'entering focus folds the chrome');
          assert.equal(await page.locator('.reader-status-top').isVisible(), false, 'top hairline hides in focus');
          assert.equal(await page.locator('.reader-status-bottom').isVisible(), false, 'bottom hairline hides in focus');
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          const focusCell = page.getByRole('button', { name: '专注', exact: true });
          assert.equal(await focusCell.getAttribute('aria-pressed'), 'true');
          await focusCell.click();
          await page.waitForFunction(() => {
            const line = document.querySelector('.reader-status-top');
            return line && getComputedStyle(line).visibility === 'visible';
          });
          assert.equal(await page.locator('.reader-status-top').isVisible(), true, 'hairlines return after focus');
          assert.deepEqual(errors, []);
        });
      } catch (error) { report.failures.push({ width, error: error.stack }); console.error(error); await capture('failure').catch(() => {}); }
      finally { await context.close(); }
    }

    // Real devices run with motion ON, and the shell's page-in
    // animation makes .page the containing block for fixed elements
    // while it applies — the anchoring must land identically. One
    // no-preference pass at 390 locks the geometry the reduced-motion
    // runs cannot see.
    {
      const width = 390;
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'zh-CN', reducedMotion: 'no-preference', isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await page.route('**/api/generate', route => route.fulfill({ status: 503, json: { error: 'Test safety guard' } }));
      try {
        await page.goto(target);
        await page.locator('button').filter({ hasText: '你的书架、化身与草稿都在这里' }).click();
        await page.getByRole('button', { name: '开启第一本书', exact: true }).click();
        for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('button', { name: '预设体验', exact: true }).click();
        await page.getByRole('button', { name: '进入第一章', exact: true }).click();
        await page.locator('[data-reading-paragraph]').first().waitFor();
        // Let the page-in animation finish, like a settled real device.
        await page.waitForTimeout(900);
        const name = 'motion on: hairlines and chrome stay pinned to the viewport edges';
        const geo = await page.evaluate(() => {
          const top = document.querySelector('.reader-status-top').getBoundingClientRect();
          const bottom = document.querySelector('.reader-status-bottom').getBoundingClientRect();
          return { lineTop: top.top, bottomBottom: bottom.bottom, viewportH: window.innerHeight };
        });
        assert.ok(geo.lineTop <= 2, `top hairline pinned with motion on (top ${geo.lineTop})`);
        assert.ok(geo.bottomBottom >= geo.viewportH - 2, `bottom hairline pinned with motion on (${geo.bottomBottom} of ${geo.viewportH})`);
        await page.touchscreen.tap(195, 422);
        await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
        const chromeGeo = await page.evaluate(() => {
          const bar = document.querySelector('.reader-chrome-bottom').getBoundingClientRect();
          const topBar = document.querySelector('.reader-chrome-top').getBoundingClientRect();
          return { barBottom: bar.bottom, topBarTop: topBar.top, viewportH: window.innerHeight };
        });
        assert.ok(chromeGeo.barBottom >= chromeGeo.viewportH - 2, `chrome bottom bar reaches the viewport bottom with motion on (${chromeGeo.barBottom} of ${chromeGeo.viewportH})`);
        assert.ok(chromeGeo.topBarTop <= 2, `chrome top bar reaches the viewport top with motion on (top ${chromeGeo.topBarTop})`);
        report.checks.push({ width, name });
        console.log(`PASS ${width} ${name}`);
      } catch (error) { report.failures.push({ width, error: error.stack }); console.error(error); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(artifacts, 'reader-chrome-report.json'), JSON.stringify(report, null, 2)); }
  process.exitCode = report.failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
