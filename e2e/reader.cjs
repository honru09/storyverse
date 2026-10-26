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
      const openSettings = async () => { await page.getByRole('button', { name: '阅读设置', exact: true }).click(); return page.getByRole('dialog', { name: '阅读设置', exact: true }); };
      const close = async () => { await page.getByRole('button', { name: '关闭面板', exact: true }).click(); };
      try {
        await page.goto(target);
        await page.getByRole('button', { name: '开启第一本书', exact: true }).click();
        for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '继续', exact: true }).click();
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
        await check('solid reader chrome is reachable and unclipped', async () => {
          await noOverflow();
          const buttons = await page.locator('.reader-floating-dock button').evaluateAll(nodes => nodes.map(node => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
          assert.ok(buttons.every(item => item.w >= 44 && item.h >= 44));
          const dockMaterial = await page.locator('.reader-floating-dock').evaluate(node => { const style = getComputedStyle(node); return { backdropFilter: style.backdropFilter, backgroundColor: style.backgroundColor }; });
          assert.equal(dockMaterial.backdropFilter, 'none');
          assert.ok(!/rgba\([^)]*,\s*0\)$/.test(dockMaterial.backgroundColor) && dockMaterial.backgroundColor !== 'transparent', 'reader dock must be a solid surface');
          await capture('reading-light');
        });
        await check('floating topline never half-covers prose while scrolling', async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          assert.equal(await page.locator('.reader-topline').isVisible(), true, 'topline shows at the top');
          // A reading gesture is many small steps, not one teleport: scroll
          // down in increments like a thumb would.
          await page.evaluate(async () => {
            for (let y = 150; y <= 900; y += 150) {
              window.scrollTo(0, y);
              await new Promise((resolve) => setTimeout(resolve, 40));
            }
          });
          await page.waitForFunction(() => document.querySelector('.page-reader').dataset.toplineHidden === 'true');
          assert.equal(await page.locator('.reader-topline').isVisible(), false, 'topline slides away on scroll down');
          const overlap = await page.evaluate(() => {
            const barNode = document.querySelector('.reader-topline');
            if (getComputedStyle(barNode).visibility === 'hidden') return 0;
            const bar = barNode.getBoundingClientRect();
            return [...document.querySelectorAll('[data-reading-paragraph]')]
              .filter(node => { const r = node.getBoundingClientRect(); return r.top < bar.bottom && r.bottom > bar.top; }).length;
          });
          assert.equal(overlap, 0, 'no paragraph may sit half under the topline');
          await capture('topline-mid-scroll');
          await page.evaluate(() => window.scrollTo(0, 500));
          await page.waitForFunction(() => document.querySelector('.page-reader').dataset.toplineHidden === 'false');
          assert.equal(await page.locator('.reader-topline').isVisible(), true, 'topline returns on scroll up');
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
              return { bg: root.backgroundColor, fg: root.getPropertyValue('--reader-text'), secondary: root.getPropertyValue('--reader-secondary'), preview: preview.backgroundColor };
            });
            const rgb = str => str.startsWith('#') ? str.slice(1).match(/../g).map(v => parseInt(v,16)) : str.match(/[\d.]+/g).slice(0,3).map(Number);
            const luminance = str => rgb(str.trim()).map(v => { v/=255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
            const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
            assert.equal(colors.bg, colors.preview);
            assert.ok(contrast(colors.bg, colors.fg) >= 4.5);
            assert.ok(contrast(colors.bg, colors.secondary) >= 4.5);
            await noOverflow();
          }
          await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
          assert.equal(await page.locator('.page-reader').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(10, 17, 40)');
          await capture('settings-auto-dark');
          await close();
          await capture('reading-auto-dark');
        });
        await check('font size presets respond to real taps and persist', async () => {
          const dialog = await openSettings();
          for (const [label, px] of [['小', 16], ['大', 20], ['特大', 22], ['标准', 18]]) {
            await dialog.getByRole('group', { name: '选择字号', exact: true }).getByRole('radio', { name: label, exact: true }).click();
            assert.equal(await page.locator('.reader-article').evaluate(node => getComputedStyle(node).fontSize), `${px}px`, `preset ${label} applies at once`);
          }
          await close();
          await page.reload();
          await page.locator('[data-reading-paragraph]').first().waitFor();
          assert.equal(await page.locator('.reader-article').evaluate(node => getComputedStyle(node).fontSize), '18px', 'the last tapped preset survives reload');
          assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), prefKey)).fontSize, 18);
        });
        await check('paragraph position survives type changes and reload', async () => {
          await page.locator('[data-reading-paragraph="9"]').evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 130, behavior:'instant' }));
          await page.waitForFunction(() => JSON.parse(localStorage.getItem('storyweave:reading-locations:v1'))?.locations.some(item => item.anchor.paragraph >= 8));
          const before = await page.evaluate(() => JSON.parse(localStorage.getItem('storyweave:reading-locations:v1')).locations.at(-1).anchor.paragraph);
          const dialog = await openSettings();
          await dialog.getByRole('group', { name: '字体', exact: true }).getByRole('radio', { name:'宋体', exact:true }).click();
          for (let i = 0; i < 7; i++) await dialog.getByRole('button', { name:'放大字号', exact:true }).click();
          assert.ok(await dialog.getByRole('button', { name:'放大字号', exact:true }).isDisabled());
          await noOverflow(); await capture('max-font-settings'); await close();
          await page.reload();
          await page.waitForFunction(() => window.scrollY > 400);
          const visible = await page.evaluate(() => [...document.querySelectorAll('[data-reading-paragraph]')].findIndex(node => node.getBoundingClientRect().bottom > 130));
          assert.ok(Math.abs(visible-before) <= 1, `anchor moved from ${before} to ${visible}`);
          assert.equal(await page.locator('.reader-article').evaluate(node => getComputedStyle(node).fontSize), '32px');
          assert.equal(await page.evaluate(key => localStorage.getItem(key), key), storyBefore);
          await capture('max-font-reading');
        });
        await check('advanced layout is live, persisted and resettable', async () => {
          const dialog = await openSettings();
          const lineHeightBefore = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).lineHeight));
          await dialog.getByRole('group', { name:'行间距', exact:true }).getByRole('radio', { name:'宽松', exact:true }).click();
          const fontPx = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
          const lineHeightAfter = await page.locator('.reader-article').evaluate(node => parseFloat(getComputedStyle(node).lineHeight));
          assert.ok(Math.abs(lineHeightAfter - fontPx * 2.3) < 1.5, `line height follows the tapped option (${lineHeightBefore} -> ${lineHeightAfter})`);
          assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), prefKey)).lineHeight, 2.3);
          await dialog.locator('summary').filter({ hasText:'更多排版' }).click();
          await dialog.getByRole('group', { name:'页边距', exact:true }).getByRole('radio', { name:'宽', exact:true }).click();
          assert.equal(await page.locator('.page-reader').evaluate(node => getComputedStyle(node).getPropertyValue('--reader-margin').trim()), '2rem', 'wide margin applies at once');
          await dialog.getByRole('group', { name:'字重', exact:true }).getByRole('radio', { name:'加重', exact:true }).click();
          await noOverflow(); await capture('advanced-layout');
          await dialog.getByRole('button', { name:'恢复默认', exact:true }).click();
          await close();
          const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefKey);
          assert.equal(saved.version, 2); assert.equal(saved.fontSize, 18); assert.equal(saved.fontWeight, 400);
        });
        await check('literal search and position bookmarks lead to exact paragraphs', async () => {
          await page.getByRole('button', { name:'查找', exact:true }).click();
          const dialog = page.getByRole('dialog', { name:'查找与书签', exact:true });
          await dialog.getByRole('searchbox').fill('银色罗盘');
          const result = dialog.locator('.reading-search-results > button');
          assert.equal(await result.count(), 1);
          await result.click();
          await page.waitForFunction(() => { const node=document.querySelector('[data-reading-paragraph="10"]'); const r=node.getBoundingClientRect(); return r.top>=0 && r.top<250; });
          await page.getByRole('button', { name:'查找', exact:true }).click();
          await dialog.getByRole('button', { name:'位置书签', exact:true }).click();
          await dialog.getByRole('button', { name:'标记／取消当前位置', exact:true }).click();
          assert.equal(await dialog.locator('.reading-bookmark-row').count(), 1);
          await capture('bookmarks');
          await close();
          await page.reload();
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
          const y = await page.evaluate(() => window.scrollY);
          await page.getByRole('button', { name:'下一屏', exact:true }).click();
          assert.ok(await page.evaluate(() => window.scrollY) > y);
          await page.getByRole('button', { name:'上一屏', exact:true }).click();
          await page.getByRole('button', { name:'专注', exact:true }).click();
          assert.equal(await page.locator('.reader-topline').isVisible(), false);
          await capture('focus-screen-mode');
          await page.getByRole('button', { name:'退出专注阅读', exact:true }).click();
          assert.equal(await page.locator('.reader-topline').isVisible(), true);
        });
        await check('large-font decision options remain reachable and gated', async () => {
          await page.getByRole('button', { name:'下一章', exact:true }).click();
          const dialog = await openSettings();
          for (let i=0;i<7;i++) await dialog.getByRole('button',{name:'放大字号',exact:true}).click();
          await close();
          const group = page.getByRole('group',{name:'剧情选择',exact:true});
          await group.scrollIntoViewIfNeeded();
          const progressProbe = await page.evaluate(async () => {
            const snapshot = () => ({
              y: window.scrollY,
              progress: document.querySelector('.reader-live-progress span:last-child')?.textContent,
              prose: document.querySelector('.reader-prose')?.getBoundingClientRect().toJSON(),
              group: document.querySelector('[role="group"][aria-label="剧情选择"]')?.getBoundingClientRect().toJSON(),
              dock: document.querySelector('.reader-floating-dock')?.getBoundingClientRect().toJSON(),
              innerHeight: window.innerHeight,
            });
            const before = snapshot();
            await new Promise(requestAnimationFrame);
            const frame1 = snapshot();
            await new Promise(requestAnimationFrame);
            const frame2 = snapshot();
            return { before, frame1, frame2 };
          });
          console.log('[DEBUG-progress]', JSON.stringify(progressProbe));
          assert.equal(await page.locator('.reader-live-progress span').last().textContent(), '本章 100%');
          await noOverflow(); await capture('large-decision');
          assert.equal(await page.getByRole('button',{name:'下一章',exact:true}).isDisabled(),true);
          await group.getByRole('button').first().click();
          assert.equal(await page.getByRole('button',{name:'下一章',exact:true}).isEnabled(),true);
          assert.deepEqual(errors, []);
        });
      } catch(error) { report.failures.push({ width, error:error.stack }); console.error(error); await capture('failure').catch(()=>{}); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(artifacts, 'reader-report.json'), JSON.stringify(report,null,2)); }
  process.exitCode = report.failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode=1; });
