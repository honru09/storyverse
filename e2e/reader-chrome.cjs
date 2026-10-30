// Reader chrome (番茄 model) acceptance: immersive hairlines, tap zones,
// tap-summoned menu, single-line labels at 360/390/430, settings-sheet
// geometry. Isolated profiles only; all generation requests are blocked.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = process.env.TARGET_URL || 'http://127.0.0.1:8899';
const artifacts = process.env.PW_ARTIFACT_DIR || path.join(__dirname, '..', 'reader-chrome-shots');
fs.mkdirSync(artifacts, { recursive: true });
const report = { target, browser: process.env.PW_BROWSER || 'chromium', checks: [], failures: [], captures: [] };
const key = 'storyweave:v2';
const widths = (process.env.PW_WIDTHS || '360,390,430').split(',').map(Number).filter(Number.isFinite);

(async () => {
  const browser = await (process.env.PW_BROWSER === 'webkit' ? webkit : chromium).launch({ headless: process.env.PW_HEADLESS === 'true' });
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
          const linePaint = await page.evaluate(() => {
            const paint = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
            return { top: paint('.reader-status-top'), bottom: paint('.reader-status-bottom') };
          });
          assert.notEqual(linePaint.top, 'rgba(0, 0, 0, 0)', 'top hairline is painted with the paper colour, never transparent');
          assert.notEqual(linePaint.bottom, 'rgba(0, 0, 0, 0)', 'bottom hairline is painted with the paper colour, never transparent');
          assert.equal(await page.locator('.mobile-bottom-nav').count(), 0, 'no shell bottom bar exists inside the reader');
          if (width === 390) await capture('immersive');
        });

        await check('prose margins are symmetric: line boxes fill the measure', async () => {
          // READER-FIX3 follow-up (user screenshot + parent pixel
          // measurement): full lines once stopped ~27px short of the
          // right margin in WebKit — text-wrap:pretty stole a character
          // from every line. Measured with line boxes (Range rects),
          // never pixels: the article's own margins must match the
          // token on both sides (<= 1pt), and the fullest line's ink
          // must reach to within one character advance of the box's
          // right edge (what remains is character quantization under
          // left alignment, present in every engine).
          const geo = await page.evaluate(() => {
            const article = document.querySelector('.reader-article');
            const box = article.getBoundingClientRect();
            const lines = [];
            document.querySelectorAll('.article-body p').forEach(p => {
              const range = document.createRange();
              range.selectNodeContents(p);
              for (const r of range.getClientRects()) if (r.width > 0) lines.push({ left: r.left, right: r.right });
            });
            const probe = document.createElement('span');
            probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
            probe.textContent = '海';
            article.appendChild(probe);
            const advance = probe.getBoundingClientRect().width;
            probe.remove();
            return { vw: window.innerWidth, boxLeft: box.left, boxRight: box.right, advance,
              minLeft: Math.min(...lines.map(l => l.left)), maxRight: Math.max(...lines.map(l => l.right)) };
          });
          assert.ok(Math.abs(geo.minLeft - geo.boxLeft) <= 1.34, `line boxes start at the box's left edge (${geo.minLeft} vs ${geo.boxLeft})`);
          assert.ok(Math.abs(geo.boxLeft - (geo.vw - geo.boxRight)) <= 1.34, `box margins symmetric within 1pt (left ${geo.boxLeft}, right ${geo.vw - geo.boxRight})`);
          assert.ok(geo.maxRight >= geo.boxRight - geo.advance - 0.5, `fullest line fills the measure to within one char (ink right ${geo.maxRight}, box right ${geo.boxRight}, advance ${geo.advance})`);
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
          const title = await page.locator('.reader-chrome-title').evaluate(node => ({ h: node.clientHeight, sh: node.scrollHeight }));
          assert.ok(title.h <= 24 && title.sh <= title.h + 1, 'chrome title is one truncated line');
        });

        await check('scrolling folds the chrome away', async () => {
          // Mobile WebKit has no mouse.wheel in Playwright: fall back
          // to a programmatic scroll, which moves the same scroll
          // position the fold listens to.
          try { await page.mouse.wheel(0, 320); }
          catch { await page.evaluate(() => window.scrollTo(0, window.scrollY + 320)); }
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

        await check('deep in the chapter, taps still work: centre summons, sides turn', async () => {
          await page.evaluate(() => window.scrollTo(0, 3000));
          const deep = await settleScroll();
          assert.ok(deep >= 3 * 844, `scrolled at least three screens deep (${deep})`);
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          const before = await settleScroll();
          await tap(0.92);
          const afterForward = await settleScroll();
          assert.ok(afterForward > before + 300, `right tap turns a screen at depth (${before} -> ${afterForward})`);
          await tap(0.08);
          const afterBack = await settleScroll();
          assert.ok(afterBack < afterForward - 300, `left tap turns a screen back at depth (${afterForward} -> ${afterBack})`);
          await page.evaluate(() => window.scrollTo(0, 0));
          await settleScroll();
        });

        await check('a tap survives scroll drift under a still finger; a drag never summons', async () => {
          await page.evaluate(() => window.scrollTo(0, 1200));
          await settleScroll();
          const pair = (dy, drift) => page.evaluate(({ dy, drift }) => {
            const el = document.querySelector('.reader-article');
            const options = { bubbles: true, clientX: Math.round(innerWidth / 2), clientY: 422, pointerId: 7 };
            el.dispatchEvent(new PointerEvent('pointerdown', options));
            if (drift) window.scrollBy(0, drift);
            el.dispatchEvent(new PointerEvent('pointerup', { ...options, clientY: 422 + dy }));
          }, { dy, drift });
          // Momentum settle moves scrollY under a stationary finger:
          // that is a tap, however far the page glides (the iOS failure
          // this guards — the old click guard ate it beyond the top).
          await pair(0, 12);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          await pair(0, 0);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await pair(-122, 0);
          await page.waitForTimeout(200);
          assert.equal(await chromeCount(), 0, 'a vertical drag is not a tap');
          await page.evaluate(() => window.scrollTo(0, 0));
          await settleScroll();
        });

        await check('chrome slider seeks inside the chapter', async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(150);
          await openChrome();
          const slider = page.getByRole('slider', { name: '本章进度', exact: true });
          await slider.fill('75');
          await page.waitForFunction(() => window.scrollY > 500, null, { timeout: 4000 });
          await slider.fill('0');
          // Wait until the home seek has visibly left the 75% landing
          // before judging the settled value: under heavy parallel
          // load the second fill's scroll can start late, and
          // settleScroll alone would happily certify the pre-seek
          // position. A genuinely broken seek still fails here.
          await page.waitForFunction(() => window.scrollY < 300, null, { timeout: 6000 });
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
          // Leaving focus does not by itself bring the hairlines back:
          // the chrome is still summoned, and under the chrome-open
          // rule (READER-FIX3 follow-up) the hairlines stay absent
          // until the chrome folds.
          assert.equal(await page.locator('.reader-status-top').isVisible(), false, 'hairlines stay hidden while the chrome is up');
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await page.waitForFunction(() => {
            const line = document.querySelector('.reader-status-top');
            return line && getComputedStyle(line).visibility === 'visible';
          });
          assert.equal(await page.locator('.reader-status-top').isVisible(), true, 'hairlines return after focus');
          assert.deepEqual(errors, []);
        });

        await check('summoned chrome never covers the title line or the end matter (N-07)', async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await settleScroll();
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          await page.waitForTimeout(400);
          const topGeo = await page.evaluate(() => {
            const bar = document.querySelector('.reader-chrome-top').getBoundingClientRect();
            const h1 = document.querySelector('.reader-article h1').getBoundingClientRect();
            const first = document.querySelector('[data-reading-paragraph="0"]').getBoundingClientRect();
            return { barBottom: bar.bottom, h1Top: h1.top, firstTop: first.top };
          });
          assert.ok(topGeo.barBottom <= topGeo.h1Top + 1, `top bar clears the chapter title (${topGeo.barBottom} <= ${topGeo.h1Top})`);
          assert.ok(topGeo.barBottom <= topGeo.firstTop + 1, 'top bar clears the first prose line');
          if (width === 390) await capture('chrome-open-lifted');
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await settleScroll();
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          await page.waitForTimeout(400);
          const bottomGeo = await page.evaluate(() => {
            const bar = document.querySelector('.reader-chrome-bottom').getBoundingClientRect();
            const nav = document.querySelector('.chapter-navigation').getBoundingClientRect();
            const footer = document.querySelector('.article-footer')?.getBoundingClientRect();
            return { barTop: bar.top, endBottom: Math.max(nav.bottom, footer ? footer.bottom : 0) };
          });
          assert.ok(bottomGeo.barTop >= bottomGeo.endBottom - 1, `bottom bar clears the end matter (${bottomGeo.barTop} >= ${bottomGeo.endBottom})`);
          await tap(0.5);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await page.evaluate(() => window.scrollTo(0, 0));
          await settleScroll();
        });
      } catch (error) { report.failures.push({ width, error: error.stack }); console.error(error); await capture('failure').catch(() => {}); }
      finally { await context.close(); }
    }

    // Read-only form (a shared snapshot of the same fixture book): the
    // plaza reader once leaked the shell bottom bar because the nav
    // highlight mapping fed the bar "plaza" while reading. Lock the
    // whole form down: no bar, painted hairlines, tap zones at depth.
    {
      const width = 390;
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'zh-CN', reducedMotion: 'reduce', isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/generate', route => route.fulfill({ status: 503, json: { error: 'Test safety guard' } }));
      const check = async (name, work) => { await work(); report.checks.push({ width, name }); console.log(`PASS ${width} ${name}`); };
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
          const snapshot = { ...book, id: 'public-fixture-reader', readOnly: true, readerIndex: 0 };
          library.publications = [{ id: 'publication-fixture-reader', storyId: book.id, snapshot, createdAt: new Date().toISOString() }];
          localStorage.setItem(key, JSON.stringify(library));
        }, key);
        await page.goto(`${target}/#/shared/publication-fixture-reader`);
        await page.reload();
        await page.locator('[data-reading-paragraph="21"]').waitFor();

        await check('read-only reader: no shell bottom bar, no in-reader note, hairlines painted', async () => {
          assert.equal(await page.locator('.mobile-bottom-nav').count(), 0, 'no shell bottom bar inside the read-only reader');
          // REQ-54: the read-only note was evicted from the reader —
          // it is stated once on the book's detail page instead.
          assert.equal(await page.locator('.reader-readonly-note').count(), 0, 'no read-only note element inside the reader');
          assert.equal(await page.getByText('只读版本 · 不会改变原作', { exact: true }).count(), 0, 'no read-only note copy inside the reader');
          const geo = await page.evaluate(() => {
            const top = document.querySelector('.reader-status-top').getBoundingClientRect();
            const bottom = document.querySelector('.reader-status-bottom').getBoundingClientRect();
            return { lineTop: top.top, bottomBottom: bottom.bottom, viewportH: window.innerHeight };
          });
          assert.ok(geo.lineTop <= 2 && geo.bottomBottom >= geo.viewportH - 2, 'hairlines pinned in the read-only reader');
        });

        await check('read-only reader: tap zones work three screens deep', async () => {
          await page.evaluate(() => window.scrollTo(0, 3000));
          await page.waitForTimeout(250);
          const deep = await page.evaluate(() => window.scrollY);
          assert.ok(deep >= 3 * 844, `scrolled three screens deep (${deep})`);
          await page.touchscreen.tap(195, 422);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          const cells = await page.locator('.reader-chrome-grid button').count();
          assert.equal(cells, 4, 'read-only chrome has four cells (no intervene)');
          const ghost = await page.evaluate(() => {
            const line = sel => { const cs = getComputedStyle(document.querySelector(sel)); return { opacity: cs.opacity, visibility: cs.visibility }; };
            return { top: line('.reader-status-top'), bottom: line('.reader-status-bottom') };
          });
          for (const [label, line] of [['top', ghost.top], ['bottom', ghost.bottom]]) {
            assert.ok(line.opacity === '0' || line.visibility === 'hidden', `read-only chrome open: ${label} hairline fully absent, not covered (opacity ${line.opacity}, visibility ${line.visibility})`);
          }
          const shot = path.join(artifacts, '390-readonly-chrome-open.png');
          await page.screenshot({ path: shot, fullPage: false });
          report.captures.push(shot);
          await page.touchscreen.tap(195, 422);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          assert.deepEqual(errors, []);
        });
      } catch (error) { report.failures.push({ width, error: error.stack }); console.error(error); }
      finally { await context.close(); }
    }

    // Real devices run with motion ON. READER-FIX3 root cause: page-in's
    // fill mode `both` kept the finished animation's transform applied
    // to .page forever (an identity matrix still counts), making .page
    // the containing block for every fixed descendant — hairlines and
    // chrome anchored to the document box, not the viewport. The FIX2
    // version of this pass asserted one-sided bounds only
    // (bottom >= viewportH - 2 passes even when the bar sits a whole
    // document below the fold) and never scrolled, so it stayed green
    // on the broken build. Every bound below is two-sided and the
    // geometry is re-measured three screens deep and at the very end.
    {
      const width = 390;
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'zh-CN', reducedMotion: 'no-preference', isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await page.route('**/api/generate', route => route.fulfill({ status: 503, json: { error: 'Test safety guard' } }));
      const check = async (name, work) => { await work(); report.checks.push({ width, name }); console.log(`PASS ${width} ${name}`); };
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
        // Let the page-in animation finish, like a settled real device.
        await page.waitForTimeout(900);

        const hairlines = () => page.evaluate(() => {
          const top = document.querySelector('.reader-status-top').getBoundingClientRect();
          const bottom = document.querySelector('.reader-status-bottom').getBoundingClientRect();
          return { topTop: top.top, topBottom: top.bottom, bottomTop: bottom.top, bottomBottom: bottom.bottom, viewportH: window.innerHeight,
            topPaint: getComputedStyle(document.querySelector('.reader-status-top')).backgroundColor,
            transform: getComputedStyle(document.querySelector('.page-reader')).transform };
        });
        const assertPinned = async (label) => {
          const geo = await hairlines();
          assert.equal(geo.transform, 'none', `${label}: no transform may linger on .page after page-in (got ${geo.transform})`);
          assert.ok(geo.topTop >= -1 && geo.topTop <= 2, `${label}: top hairline hugs the viewport top (top ${geo.topTop})`);
          assert.ok(geo.topBottom >= 20 && geo.topBottom <= 42, `${label}: top hairline has its strip height (${geo.topBottom})`);
          assert.ok(geo.bottomBottom >= geo.viewportH - 2 && geo.bottomBottom <= geo.viewportH + 1, `${label}: bottom hairline hugs the viewport bottom (${geo.bottomBottom} of ${geo.viewportH})`);
          assert.ok(geo.bottomTop >= geo.viewportH - 42, `${label}: bottom hairline strip sits at the edge (top ${geo.bottomTop})`);
          assert.notEqual(geo.topPaint, 'rgba(0, 0, 0, 0)', `${label}: top hairline is painted, never transparent`);
          return geo;
        };

        await check('motion on: hairlines pinned to both viewport edges at the chapter top', async () => {
          await assertPinned('top');
        });

        // html runs scroll-behavior:smooth and this context keeps
        // motion on, so a programmatic scrollTo is an animation, not
        // a jump: wait until scrollY settles before measuring, or the
        // depth assertions race the glide (observed: 1289 of 3000 at
        // the old fixed 250ms wait).
        const settledScrollY = async () => {
          let last = -1;
          for (let i = 0; i < 50; i++) {
            const y = await page.evaluate(() => window.scrollY);
            if (y === last) return y;
            last = y;
            await page.waitForTimeout(120);
          }
          return last;
        };

        await check('motion on: hairlines stay pinned three screens deep and at the chapter end', async () => {
          await page.evaluate(() => window.scrollTo(0, 3000));
          const deepY = await settledScrollY();
          assert.ok(deepY >= 3 * 844, `scrolled three screens deep (${deepY})`);
          await assertPinned('deep');
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await settledScrollY();
          await assertPinned('end');
        });

        await check('motion on: deep centre tap summons a fully in-viewport dock with single-line labels', async () => {
          await page.evaluate(() => window.scrollTo(0, 3000));
          await settledScrollY();
          await page.touchscreen.tap(195, 422);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
          await page.waitForTimeout(350);
          const box = await page.locator('.reader-chrome-bottom').boundingBox();
          assert.ok(box, 'bottom dock has a bounding box');
          assert.ok(box.y >= 844 - box.height - 2 && box.y + box.height <= 845, `dock fully inside the viewport (y ${box.y}, height ${box.height})`);
          const topBox = await page.locator('.reader-chrome-top').boundingBox();
          assert.ok(topBox && topBox.y >= -1 && topBox.y <= 2, `top bar hugs the viewport top (y ${topBox && topBox.y})`);
          // READER-FIX3 follow-up (parent screenshot review): with the
          // chrome summoned, the immersive hairlines must be entirely
          // absent — hidden by state, not merely covered — and the
          // chrome bars must paint fully opaque, so neither the
          // hairline text nor the prose behind the bars can ghost
          // through at the bars' edges.
          const ghost = await page.evaluate(() => {
            const line = sel => { const cs = getComputedStyle(document.querySelector(sel)); return { opacity: cs.opacity, visibility: cs.visibility }; };
            const paint = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
            return { top: line('.reader-status-top'), bottom: line('.reader-status-bottom'), barTop: paint('.reader-chrome-top'), barBottom: paint('.reader-chrome-bottom') };
          });
          for (const [label, line] of [['top', ghost.top], ['bottom', ghost.bottom]]) {
            assert.ok(line.opacity === '0' || line.visibility === 'hidden', `chrome open: ${label} hairline fully absent, not covered (opacity ${line.opacity}, visibility ${line.visibility})`);
          }
          for (const [label, paint] of [['top', ghost.barTop], ['bottom', ghost.barBottom]]) {
            const alpha = paint.startsWith('rgba') ? parseFloat(paint.split(',').pop()) : 1;
            assert.equal(alpha, 1, `chrome open: ${label} bar paints fully opaque (${paint})`);
          }
          const titleLine = await page.locator('.reader-chrome-title').evaluate(node => ({ sh: node.scrollHeight, ch: node.clientHeight }));
          assert.ok(titleLine.sh <= titleLine.ch + 1 && titleLine.ch <= 24, `chrome title is a single line (${titleLine.sh}/${titleLine.ch})`);
          const cells = await page.locator('.reader-chrome-grid button').evaluateAll(nodes => nodes.map(node => {
            const span = node.querySelector('span');
            return { spanH: span.offsetHeight, spanSW: span.scrollWidth, spanCW: span.clientWidth };
          }));
          assert.equal(cells.length, 5, 'five dock cells at depth');
          for (const cell of cells) {
            assert.ok(cell.spanH <= 20, `dock label single-line at depth (offsetHeight ${cell.spanH})`);
            assert.ok(cell.spanSW <= cell.spanCW + 1, 'dock label never overflows at depth');
          }
          const shot = path.join(artifacts, '390-motion-chrome-deep.png');
          await page.screenshot({ path: shot, fullPage: false });
          report.captures.push(shot);
          await page.touchscreen.tap(195, 422);
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
        });

        await check('motion on: default prose computes at the fluid size / weight 400, lede included', async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          const prose = await page.evaluate(() => {
            const body = getComputedStyle(document.querySelector('.article-body p'));
            const lede = getComputedStyle(document.querySelector('.article-lede'));
            return { size: parseFloat(body.fontSize), weight: body.fontWeight, ledeWeight: lede.fontWeight, lineHeight: parseFloat(body.lineHeight) };
          });
          // Fluid base at 390 wide (DESIGN §32): clamp(15, 2.56vw + 6, 19) = 15.98px at 1x.
          assert.ok(Math.abs(prose.size - 15.98) < 0.75, `default prose size is the fluid base at this width (got ${prose.size})`);
          assert.equal(prose.weight, '400', `default prose weight (got ${prose.weight})`);
          assert.equal(prose.ledeWeight, '400', `first paragraph follows the article weight, no legacy 550 (got ${prose.ledeWeight})`);
          assert.ok(Math.abs(prose.lineHeight - prose.size * 1.9) < 0.8, `default line height is size x 1.9 (got ${prose.lineHeight} at ${prose.size})`);
        });
      } catch (error) { report.failures.push({ width, error: error.stack }); console.error(error); }
      finally { await context.close(); }
    }

    // Stored-settings rationalization, end to end (READER-FIX3 §3): a
    // complete version-2 record frozen on the pre-FIX3 defaults
    // (18px / lh 2.05 / spacing 1 / weight 600) must reach the reader
    // as the current defaults — fluid 1x / 1.9 / 0.6em / weight 400 —
    // without the user opening settings.
    {
      const width = 390;
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'zh-CN', reducedMotion: 'reduce', isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        localStorage.setItem('storyweave:reading-preferences:v1', JSON.stringify({
          version: 2, fontSize: 18, lineHeight: 2.05, theme: 'light', fontFamily: 'system',
          fontWeight: 600, margin: 'standard', paragraphSpacing: 1, paragraphIndent: true,
          textAlign: 'left', letterSpacing: 0, readingMode: 'scroll', keepAwake: false,
        }));
      });
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
        const name = 'frozen v2 defaults migrate on load: fluid 1x / 1.9 / 0.6em / weight 400';
        const prose = await page.evaluate(() => {
          const body = document.querySelector('.article-body p');
          const cs = getComputedStyle(body);
          return { size: parseFloat(cs.fontSize), weight: cs.fontWeight, lineHeight: parseFloat(cs.lineHeight), marginBottom: parseFloat(cs.marginBottom) };
        });
        assert.ok(Math.abs(prose.size - 15.98) < 0.75, `frozen 18px follows the fluid 1x default (got ${prose.size})`);
        assert.equal(prose.weight, '400', `stored 600 is retired (got ${prose.weight})`);
        assert.ok(Math.abs(prose.lineHeight - prose.size * 1.9) < 0.8, `frozen lh 2.05 follows 1.9 (got ${prose.lineHeight})`);
        assert.ok(Math.abs(prose.marginBottom - prose.size * 0.6) < 0.8, `frozen spacing 1em follows 0.6em (got ${prose.marginBottom})`);
        report.checks.push({ width, name });
        console.log(`PASS ${width} ${name}`);
      } catch (error) { report.failures.push({ width, error: error.stack }); console.error(error); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(artifacts, 'reader-chrome-report.json'), JSON.stringify(report, null, 2)); }
  process.exitCode = report.failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
