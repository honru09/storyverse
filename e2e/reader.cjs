// Isolated profiles only; all generation requests are blocked. No real accounts.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const target = process.env.TARGET_URL || 'http://127.0.0.1:18877';
const artifacts = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyweave-reader');
fs.mkdirSync(artifacts, { recursive: true });
const report = { target, browser: process.env.PW_BROWSER || 'chromium', checks: [], failures: [], captures: [] };
const key = 'storyweave:v2';
const prefKey = 'storyweave:reading-preferences:v1';
const widths = (process.env.PW_WIDTHS || '320,390,1440').split(',').map(Number).filter(Number.isFinite);

(async () => {
  const browser = await (process.env.PW_BROWSER === 'webkit' ? webkit : chromium).launch({ headless: process.env.PW_HEADLESS === 'true' });
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width > 700 ? 960 : 844 }, locale: 'zh-CN', reducedMotion: 'reduce', isMobile: width < 700, hasTouch: width < 700 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/generate', route => route.fulfill({ status: 503, json: { error: 'Test safety guard' } }));
      const check = async (name, work) => { await work(); report.checks.push({ width, name }); console.log(`PASS ${width} ${name}`); };
      const capture = async name => { if (process.env.SKIP_CAPTURE === 'true') return; const file = path.join(artifacts, `${width}-${name}.png`); await page.screenshot({ path: file, fullPage: false }); report.captures.push(file); };
      const noOverflow = async () => assert.ok(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= window.innerWidth + 1));
      // Fluid type oracle (DESIGN §32): base = clamp(15px, 2.56vw + 6px, 19px), times the reader's scale step.
      const fluidPx = (scale) => Math.min(19, Math.max(15, 2.56 * width / 100 + 6)) * scale;
      // The menu chrome is summoned by a tap in the middle of the
      // screen. Tests dispatch that same tap on the article so the
      // scroll position never decides whether it lands.
      const tapReaderCenter = async () => {
        await page.evaluate(() => {
          const el = document.querySelector('.reader-article');
          const rect = el.getBoundingClientRect();
          const options = { bubbles: true, clientX: Math.round(window.innerWidth / 2), clientY: Math.round(Math.min(window.innerHeight / 2, Math.max(80, rect.top + 140))) };
          el.dispatchEvent(new PointerEvent('pointerdown', options));
          el.dispatchEvent(new PointerEvent('pointerup', options));
          el.dispatchEvent(new MouseEvent('click', options));
        });
      };
      const openChrome = async () => {
        if (await page.locator('.reader-chrome-bottom').count() === 0) await tapReaderCenter();
        await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
      };
      const openSettings = async () => { await openChrome(); await page.getByRole('button', { name: '阅读设置', exact: true }).click(); return page.getByRole('dialog', { name: '阅读设置', exact: true }); };
      const close = async () => { await page.getByRole('button', { name: '关闭面板', exact: true }).click(); };
      try {
        await page.goto(target);
        // The plaza is the landing view now; the first-book entry lives on
        // the shelf, one tap away through the plaza's slim row.
        await page.locator('button').filter({ hasText: '你的书架、化身与草稿都在这里' }).click();
        await page.getByRole('button', { name: '开启第一本书', exact: true }).click();
        // Five steps now: 题材 → 世界 → 出身 (the first 继续 there rolls an
        // identity and stays so its spawn points expand; the second
        // accepts) → 主角与能力 → 开局.
        for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('button', { name: '预设体验', exact: true }).click();
        await page.getByRole('button', { name: '进入第一章', exact: true }).click();
        await page.locator('[data-reading-paragraph]').first().waitFor();
        // A long, valid imported-style chapter is a layout stress fixture, not generated prose.
        await page.evaluate(key => {
          const library = JSON.parse(localStorage.getItem(key));
          const book = library.stories.find(story => story.id === library.activeStoryId);
          book.chapters[0].paragraphs = Array.from({ length: 22 }, (_, i) => `第${i + 1}段，海风穿过长街。年轻的旅人放慢脚步，听见远处的钟声。` + '他记得那片海，也记得故乡的名字。'.repeat(9));
          book.chapters[0].paragraphs[10] += '银色罗盘是独一无二的线索。';
          localStorage.setItem(key, JSON.stringify(library));
        }, key);
        await page.reload();
        await page.locator('[data-reading-paragraph="21"]').waitFor();
        const storyBefore = await page.evaluate(key => localStorage.getItem(key), key);
        await check('immersive reader chrome is reachable, solid and unclipped', async () => {
          await noOverflow();
          assert.equal(await page.locator('.reader-topline').count(), 0, 'the topline card is retired');
          assert.equal(await page.locator('.reader-floating-dock').count(), 0, 'the floating dock is retired');
          await openChrome();
          const buttons = await page.locator('.reader-chrome-grid button, .reader-chrome-actions button, .reader-chrome-back').evaluateAll(nodes => nodes.map(node => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
          assert.ok(buttons.every(item => item.w >= 44 && item.h >= 44), 'every chrome control is at least 44px');
          const labels = await page.locator('.reader-chrome-grid button span').evaluateAll(nodes => nodes.map(node => ({ h: node.offsetHeight, sw: node.scrollWidth, cw: node.clientWidth })));
          assert.ok(labels.every(label => label.h <= 20 && label.sw <= label.cw + 1), 'chrome labels stay on one line at this width');
          const material = await page.locator('.reader-chrome-bottom').evaluate(node => { const style = getComputedStyle(node); return { backdropFilter: style.backdropFilter, backgroundColor: style.backgroundColor }; });
          // READER-FIX3 follow-up supersedes the §24 translucent
          // chrome: at 96% the bars ghosted the hairline text and the
          // prose line sitting at their edges (parent screenshot
          // review). The bars are solid paper now — computed alpha
          // exactly 1 and no backdrop filter at all.
          const alphaMatch = material.backgroundColor.match(/\/\s*([\d.]+)\)$/) || material.backgroundColor.match(/rgba\([^)]*,\s*([\d.]+)\)$/);
          const alpha = alphaMatch ? Number(alphaMatch[1]) : 1;
          assert.equal(alpha, 1, `the chrome is solid paper, never translucent (alpha ${alpha})`);
          assert.equal(material.backdropFilter, 'none', 'no backdrop blur rides under the chrome');
          assert.ok(material.backgroundColor !== 'transparent', 'reader chrome must be a real surface');
          await tapReaderCenter();
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await capture('reading-light');
        });
        await check('hairlines never cover the first line and chrome yields to scrolling', async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          const geometry = await page.evaluate(() => {
            const line = document.querySelector('.reader-status-top').getBoundingClientRect();
            const title = document.querySelector('.reader-article h1').getBoundingClientRect();
            const first = document.querySelector('[data-reading-paragraph="0"]').getBoundingClientRect();
            return { lineBottom: line.bottom, titleTop: title.top, firstTop: first.top };
          });
          assert.ok(geometry.titleTop >= geometry.lineBottom - 1, 'the chapter title starts below the top hairline');
          assert.ok(geometry.firstTop >= geometry.lineBottom, 'the first paragraph clears the top hairline');
          // Summon the menu, then scroll like a thumb: the chrome must
          // fold away instead of riding over the prose. The fold watcher
          // ignores scrolls for ~800ms after a summon (its slider-scrub
          // guard window, baseline behaviour verified identical on
          // cb30dc8): a real thumb keeps moving past the window, so this
          // check waits it out before scrolling instead of racing it.
          await openChrome();
          await page.waitForTimeout(900);
          await page.evaluate(async () => {
            for (let y = 150; y <= 900; y += 150) {
              window.scrollTo(0, y);
              await new Promise((resolve) => setTimeout(resolve, 40));
            }
          });
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await capture('hairline-immersive');
          await page.evaluate(() => window.scrollTo(0, 0));
        });
        await check('six themes preserve contrast and preview / page agreement', async () => {
          const dialog = await openSettings();
          await capture('settings-panel');
          for (const [label, theme] of [['浅色','light'],['暖色','warm'],['青绿','green'],['夜间','night'],['纯黑','oled'],['自动','system']]) {
            await dialog.getByRole('group', { name: '阅读背景', exact: true }).getByRole('radio', { name: label, exact: true }).click();
            assert.equal(await page.locator('.page-reader').getAttribute('data-reader-theme'), theme);
            const colors = await page.evaluate(() => {
              const root = getComputedStyle(document.querySelector('.page-reader'));
              const preview = getComputedStyle(document.querySelector('.reading-preferences-preview'));
              return { bg: root.backgroundColor, fg: root.getPropertyValue('--reader-text'), secondary: root.getPropertyValue('--reader-secondary'), preview: preview.backgroundColor, body: getComputedStyle(document.body).backgroundColor };
            });
            const rgb = str => str.startsWith('#') ? str.slice(1).match(/../g).map(v => parseInt(v,16)) : str.match(/[\d.]+/g).slice(0,3).map(Number);
            const luminance = str => rgb(str.trim()).map(v => { v/=255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
            const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
            assert.equal(colors.bg, colors.preview);
            assert.equal(colors.body, colors.bg, 'body background follows the reader theme (iOS overscroll paints the body, not the page)');
            assert.ok(contrast(colors.bg, colors.fg) >= 4.5);
            assert.ok(contrast(colors.bg, colors.secondary) >= 4.5);
            await noOverflow();
          }
          await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
          assert.equal(await page.locator('.page-reader').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(10, 17, 40)');
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(10, 17, 40)', 'body follows the system theme into dark');
          await capture('settings-auto-dark');
          await close();
          await capture('reading-auto-dark');
        });
        await check('font size presets respond to real taps and persist', async () => {
          const dialog = await openSettings();
          for (const [label, scale] of [['小', 0.875], ['大', 1.25], ['特大', 1.5], ['标准', 1]]) {
            await dialog.getByRole('group', { name: '选择字号', exact: true }).getByRole('radio', { name: label, exact: true }).click();
            const applied = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
            assert.ok(Math.abs(applied - fluidPx(scale)) < 0.75, `preset ${label} applies at once (${applied} ≈ ${fluidPx(scale)})`);
          }
          await close();
          await page.reload();
          await page.locator('[data-reading-paragraph]').first().waitFor();
          const survived = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
          assert.ok(Math.abs(survived - fluidPx(1)) < 0.75, 'the last tapped preset survives reload');
          assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), prefKey)).fontScale, 1);
        });
        await check('paragraph position survives type changes and reload', async () => {
          await page.locator('[data-reading-paragraph="9"]').evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 130, behavior:'instant' }));
          await page.waitForFunction(() => JSON.parse(localStorage.getItem('storyweave:reading-locations:v1'))?.locations.some(item => item.anchor.paragraph >= 8));
          const before = await page.evaluate(() => JSON.parse(localStorage.getItem('storyweave:reading-locations:v1')).locations.at(-1).anchor.paragraph);
          const dialog = await openSettings();
          await dialog.getByRole('group', { name: '字体', exact: true }).getByRole('radio', { name:'宋体', exact:true }).click();
          for (let i = 0; i < 4; i++) await dialog.getByRole('button', { name:'放大字号', exact:true }).click();
          assert.ok(await dialog.getByRole('button', { name:'放大字号', exact:true }).isDisabled());
          await noOverflow(); await capture('max-font-settings'); await close();
          await page.reload();
          await page.waitForFunction(() => window.scrollY > 400);
          const visible = await page.evaluate(() => [...document.querySelectorAll('[data-reading-paragraph]')].findIndex(node => node.getBoundingClientRect().bottom > 130));
          assert.ok(Math.abs(visible-before) <= 1, `anchor moved from ${before} to ${visible}`);
          const maxed = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
          assert.ok(Math.abs(maxed - fluidPx(1.5)) < 0.75, `stepper tops out at the 1.5x fluid size (${maxed} ≈ ${fluidPx(1.5)})`);
          assert.equal(await page.evaluate(key => localStorage.getItem(key), key), storyBefore);
          await capture('max-font-reading');
        });
        await check('advanced layout is live, persisted and resettable', async () => {
          const dialog = await openSettings();
          const lineHeightBefore = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).lineHeight));
          await dialog.getByRole('group', { name:'行间距', exact:true }).getByRole('radio', { name:'疏朗', exact:true }).click();
          const fontPx = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
          const lineHeightAfter = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).lineHeight));
          assert.ok(Math.abs(lineHeightAfter - fontPx * 2.3) < 1.5, `line height follows the tapped option (${lineHeightBefore} -> ${lineHeightAfter})`);
          assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), prefKey)).lineHeight, 2.3);
          await dialog.locator('summary').filter({ hasText:'更多排版' }).click();
          await dialog.getByRole('group', { name:'页边距', exact:true }).getByRole('radio', { name:'宽', exact:true }).click();
          assert.equal(await page.locator('.page-reader').evaluate(node => getComputedStyle(node).getPropertyValue('--reader-margin').trim()), '2rem', 'wide margin applies at once');
          await noOverflow(); await capture('advanced-layout');
          await dialog.getByRole('button', { name:'恢复默认', exact:true }).click();
          await close();
          const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefKey);
          assert.equal(saved.version, 4); assert.equal(saved.fontScale, 1); assert.equal(saved.fontWeight, 400);
        });
        await check('literal search and position bookmarks lead to exact paragraphs', async () => {
          await openChrome();
          await page.getByRole('button', { name:'查找', exact:true }).click();
          const dialog = page.getByRole('dialog', { name:'查找与书签', exact:true });
          const inputSize = await dialog.getByRole('searchbox').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
          assert.ok(inputSize >= 16, `search input computes at ${inputSize}px; below 16px iOS Safari auto-zooms on focus`);
          await dialog.getByRole('searchbox').fill('银色罗盘');
          const result = dialog.locator('.reading-search-results > button');
          assert.equal(await result.count(), 1);
          await result.click();
          await page.waitForFunction(() => { const node=document.querySelector('[data-reading-paragraph="10"]'); const r=node.getBoundingClientRect(); return r.top>=0 && r.top<250; });
          await openChrome();
          await page.getByRole('button', { name:'查找', exact:true }).click();
          await dialog.getByRole('button', { name:'位置书签', exact:true }).click();
          await dialog.getByRole('button', { name:'标记／取消当前位置', exact:true }).click();
          assert.equal(await dialog.locator('.reading-bookmark-row').count(), 1);
          await capture('bookmarks');
          await close();
          await page.reload();
          await openChrome();
          await page.getByRole('button', { name:'查找', exact:true }).click();
          await dialog.getByRole('button', { name:/位置书签/ }).click();
          assert.equal(await dialog.locator('.reading-bookmark-row').count(), 1);
          await dialog.getByRole('button', { name:/删除书签/ }).click();
          assert.equal(await dialog.locator('.reading-bookmark-row').count(), 0);
          await close();
        });
        await check('screen navigation and focus mode are real, reversible controls', async () => {
          const dialog = await openSettings();
          await dialog.getByRole('group', { name:'阅读方式', exact:true }).getByRole('radio', { name:'逐屏阅读', exact:true }).click();
          await close();
          // The dock's page buttons are gone: in page mode the side
          // thirds of the screen do the paging now.
          const tapZone = async (fraction) => {
            const size = page.viewportSize();
            const x = Math.round(size.width * fraction);
            const y = Math.round(size.height * 0.5);
            if (size.width < 700) await page.touchscreen.tap(x, y);
            else await page.mouse.click(x, y);
            await page.waitForTimeout(200);
          };
          const y = await page.evaluate(() => window.scrollY);
          await tapZone(0.92);
          assert.ok(await page.evaluate(() => window.scrollY) > y, 'right-third tap pages forward');
          await tapZone(0.08);
          assert.ok(await page.evaluate(() => window.scrollY) <= y + 40, 'left-third tap pages back');
          await openChrome();
          await page.getByRole('button', { name:'专注', exact:true }).click();
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          assert.equal(await page.locator('.reader-status-top').isVisible(), false, 'focus hides the top hairline');
          assert.equal(await page.locator('.reader-status-bottom').isVisible(), false, 'focus hides the bottom hairline');
          await capture('focus-screen-mode');
          // The centre tap still summons the chrome in focus mode; the
          // 专注 cell itself (now pressed) is the way back out.
          await openChrome();
          const focusCell = page.getByRole('button', { name:'专注', exact:true });
          assert.equal(await focusCell.getAttribute('aria-pressed'), 'true');
          await focusCell.click();
          // The chrome is still summoned: under the chrome-open rule
          // (READER-FIX3 follow-up) the hairlines stay absent until it
          // folds — leaving focus alone does not restore them.
          assert.equal(await page.locator('.reader-status-top').isVisible(), false, 'hairlines stay hidden while the chrome is up');
          await tapReaderCenter();
          await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.reader-status-top')).visibility === 'visible');
          assert.equal(await page.locator('.reader-status-top').isVisible(), true, 'folding the chrome restores the hairlines');
        });
        await check('large-font chapter end remains reachable and nothing gates the next chapter', async () => {
          await page.getByRole('button', { name:'下一章', exact:true }).click();
          const dialog = await openSettings();
          for (let i=0;i<4;i++) await dialog.getByRole('button',{name:'放大字号',exact:true}).click();
          await close();
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          // The bottom hairline is the progress readout now: at the very
          // end of the chapter it must settle on 100%.
          await page.waitForFunction(() => document.querySelector('.reader-status-bottom span')?.textContent.includes('本章 100%'));
          await noOverflow(); await capture('large-chapter-end');
          // No decision waits at the chapter end: the next chapter is
          // immediately available, and the intervene entry stays in reach.
          assert.equal(await page.getByRole('button',{name:'下一章',exact:true}).isEnabled(),true);
          await openChrome();
          await page.getByRole('button',{name:'介入',exact:true}).click();
          await page.getByRole('dialog',{name:'介入 · 扰动世界线'}).waitFor();
          await page.getByRole('button',{name:'关闭面板'}).click();
          assert.deepEqual(errors, []);
        });
        await check('directory opens on the current chapter, not the top of the list', async () => {
          const position = async () => Number((await page.locator('.reader-status-back span').textContent()).match(/\d+/)[0]);
          for (let guard = 0; guard < 40 && (await position()) < 10; guard++) {
            const next = page.getByRole('button', { name: '下一章', exact: true });
            if (await next.isEnabled()) await next.click();
            await page.waitForTimeout(150);
          }
          assert.ok((await position()) >= 10, 'advanced deep into the book');
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(300);
          await page.getByRole('button', { name: '目录', exact: true }).first().click();
          const dialog = page.getByRole('dialog', { name: '章节目录', exact: true });
          await dialog.waitFor();
          // Poll with evaluate: waitForFunction's rAF polling does not
          // observe late state reliably in headless WebKit.
          for (let i = 0; i < 10; i++) {
            if (await page.evaluate(() => document.querySelector('dialog[open]')?.scrollTop) > 0) break;
            await page.waitForTimeout(300);
          }
          const probe = await dialog.evaluate(node => {
            const box = node.getBoundingClientRect();
            const row = node.querySelector('[aria-current="page"]').getBoundingClientRect();
            return { scrollTop: node.scrollTop, rowTop: row.top, rowBottom: row.bottom, boxTop: box.top, boxBottom: box.bottom };
          });
          assert.ok(probe.scrollTop > 0, 'directory scrolled away from the top of the list');
          assert.ok(probe.rowTop >= probe.boxTop && probe.rowBottom <= probe.boxBottom, `current chapter row is inside the dialog (row ${probe.rowTop}-${probe.rowBottom}, dialog ${probe.boxTop}-${probe.boxBottom})`);
          await capture('directory-current');
          await close();
        });
        // READER-SETTINGS-FIX regression (2026-10-29): every other
        // settings check in this suite clicks the input element
        // itself, which is exactly what a finger never touches. On
        // WebKit the option input kept its intrinsic size under
        // inset:0 + auto sizing, so a real tap landed on the visible
        // span and died in label forwarding — the forwarded click
        // reached the input but WebKit fired no change, and on the
        // user's iPhone the whole panel was look-only. This check
        // therefore taps the VISIBLE spans at their real coordinates
        // and pins the hit layer: elementFromPoint on a chip must be
        // the input itself in every engine.
        await check('settings respond to real taps on the visible chips (WebKit forwarding regression)', async () => {
          const realTap = async (locator) => {
            await locator.scrollIntoViewIfNeeded();
            const box = await locator.boundingBox();
            assert.ok(box, 'tap target has a box');
            const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
            if (width < 700) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
            await page.waitForTimeout(300);
            return { x, y };
          };
          const articleFont = () => page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
          const dialog = await openSettings();
          // Font size by real tap, with the hit-layer invariant.
          const bigSpan = dialog.locator('.reading-font-options label', { hasText: '大' }).locator('span').first();
          const fontPoint = await realTap(bigSpan);
          assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, fontPoint), 'INPUT',
            'a tap on the visible chip lands on its input, never on the span (label forwarding is dead in WebKit)');
          assert.ok(Math.abs((await articleFont()) - fluidPx(1.25)) < 0.75, 'real tap on the 大 chip grows the prose at once');
          assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), prefKey)).fontScale, 1.25);
          // The panel stays changeable under three reader themes in a row.
          for (const [label, theme] of [['夜间', 'night'], ['暖色', 'warm'], ['浅色', 'light']]) {
            await realTap(dialog.locator('.reading-theme-options label', { hasText: label }).locator('span').first());
            assert.equal(await page.locator('.page-reader').getAttribute('data-reader-theme'), theme, `real tap switches the theme to ${theme}`);
          }
          // Reading mode by real tap, then another change while in page mode.
          await realTap(dialog.locator('label', { hasText: '逐屏阅读' }).locator('span').first());
          assert.equal(await page.locator('.page-reader').getAttribute('data-reader-mode'), 'page');
          await realTap(dialog.locator('.reading-font-options label', { hasText: '特大' }).locator('span').first());
          assert.ok(Math.abs((await articleFont()) - fluidPx(1.5)) < 0.75, 'font size still responds by real tap in page mode');
          // The keep-awake switch shares the same input-cover rule.
          const pref = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefKey);
          await realTap(dialog.locator('.reading-switch'));
          assert.equal((await pref()).keepAwake, true, 'real tap flips the keep-awake switch on');
          await realTap(dialog.locator('.reading-switch'));
          assert.equal((await pref()).keepAwake, false, 'real tap flips the keep-awake switch back off');
          await close();
          // Persistence across a chapter turn and a settings re-open.
          const chapterNow = Number((await page.locator('.reader-status-back span').textContent()).match(/\d+/)[0]);
          await openChrome();
          const next = page.locator('.reader-chrome-chapter-nav', { hasText: '下一章' });
          if (await next.isEnabled()) {
            await next.click();
            await page.waitForTimeout(400);
            assert.ok(Number((await page.locator('.reader-status-back span').textContent()).match(/\d+/)[0]) > chapterNow, 'moved to the next chapter');
            assert.ok(Math.abs((await articleFont()) - fluidPx(1.5)) < 0.75, 'the tapped font size survives the chapter turn');
          }
          const reopened = await openSettings();
          assert.ok(await reopened.getByRole('radio', { name: '特大', exact: true }).isChecked(), 'the tapped preset is still selected after re-opening settings');
          await reopened.getByRole('button', { name: '恢复默认', exact: true }).click();
          assert.ok(Math.abs((await articleFont()) - fluidPx(1)) < 0.75, 'reset returns the prose to the default size');
          await close();
        });
      } catch(error) { report.failures.push({ width, error:error.stack }); console.error(error); await capture('failure').catch(()=>{}); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(artifacts, 'reader-report.json'), JSON.stringify(report,null,2)); }
  process.exitCode = report.failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode=1; });
