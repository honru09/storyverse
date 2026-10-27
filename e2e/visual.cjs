// Bounded visual capture for the porcelain-and-thread design. Fresh profiles only.
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const targetUrl = process.env.TARGET_URL || 'http://127.0.0.1:18877';
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-design');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const report = { targetUrl, capturedAt: new Date().toISOString(), pages: [], failures: [] };
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 1440, height: 960 }, { width: 445, height: 621 }]) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700, locale: 'zh-CN', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/status', route => route.fulfill({ json: { configured: false } }));
      async function capture(name) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
        });
        const measurement = await page.evaluate(() => {
          const hitTargets = [...document.querySelectorAll('.reader-actions .icon-button, .account-entry, .reader-floating-dock button')].filter(button => button.getClientRects().length).map(button => {
            const rect = button.getBoundingClientRect();
            return { label: button.getAttribute('aria-label'), width: rect.width, height: rect.height };
          });
          // The shipped topline stacks the back link above the actions by
          // design; the invariant that matters is the actions row itself
          // staying on one line.
          const toolbarRows = [...document.querySelectorAll('.reader-topline > .reader-actions > *')].map(element => {
            const rect = element.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom };
          });
          return {
            width: document.documentElement.clientWidth,
            scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.currentSrc),
            bodyFont: getComputedStyle(document.body).fontFamily,
            hitTargets,
            toolbarSingleRow: !toolbarRows.length || Math.max(...toolbarRows.map(row => row.top)) < Math.min(...toolbarRows.map(row => row.bottom)),
            creationActionVisible: (() => {
              const button = document.querySelector('.forge-actions .button');
              if (!button || window.innerWidth >= 1050) return true;
              const rect = button.getBoundingClientRect();
              return rect.top >= 0 && rect.bottom < window.innerHeight - 78 && button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
            })(),
          };
        });
        const screenshot = path.join(artifactDir, `${viewport.width}-${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        report.pages.push({ viewport, name, screenshot, ...measurement });
        assert.ok(measurement.scrollWidth <= measurement.width + 1, `${name} overflows at ${viewport.width}`);
        assert.equal(measurement.brokenImages.length, 0, `${name} has a missing image`);
        assert.ok(measurement.hitTargets.every(target => target.width >= 44 && target.height >= 44), `${name} has a reader icon hit target below 44px`);
        assert.ok(measurement.toolbarSingleRow, `${name} wraps the reading toolbar at ${viewport.width}`);
        assert.ok(measurement.creationActionVisible, `${name} creation action is obscured at ${viewport.width}`);
        console.log(`CAPTURE ${viewport.width} ${name}`);
      }
      async function nav(name) {
        await page.getByRole('navigation', { name: viewport.width < 1050 ? '移动端主导航' : '主导航', exact: true }).getByRole('button', { name, exact: true }).click();
      }
      try {
        await page.goto(targetUrl + '#/home', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: '开启第一本书', exact: true }).waitFor();
        await capture('home');
        await page.getByRole('button', { name: '登录与注册', exact: true }).click();
        await page.getByRole('button', { name: '先不登录，继续体验' }).waitFor();
        await capture('account');
        await page.getByRole('button', { name: '关闭面板' }).click();
        await page.getByRole('button', { name: '开启第一本书', exact: true }).click();
        await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
        await capture('templates');
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
        await capture('worlds');
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('heading', { name: '你以什么身份醒来？' }).waitFor();
        await capture('identity');
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('heading', { name: '从哪里醒来？' }).waitFor();
        await capture('spawn');
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByLabel('主角昵称（选填）').fill('阿遥');
        await capture('character');
        // Ability lives on the same protagonist screen in the five-step forge.
        await capture('ability');
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('heading', { name: '确认你的故事' }).waitFor();
        await capture('opening');
        await page.getByRole('button', { name: '进入第一章', exact: true }).click();
        await page.getByRole('progressbar', { name: '阅读进度' }).waitFor();
        await capture('reader');
        await page.getByRole('button', { name: '阅读设置', exact: true }).click();
        await capture('preferences');
        await page.getByRole('radio', { name: '夜间', exact: true }).check();
        await page.getByRole('button', { name: '关闭面板' }).click();
        await capture('night-reader');
        await page.getByRole('button', { name: '阅读设置', exact: true }).click();
        await page.getByRole('button', { name: '恢复默认', exact: true }).click();
        await page.getByRole('button', { name: '关闭面板' }).click();
        await page.getByRole('button', { name: '下一章', exact: true }).click();
        await page.getByRole('button', { name: '介入', exact: true }).click();
        await page.getByRole('dialog', { name: '介入 · 扰动世界线' }).waitFor();
        await capture('intervention');
        await page.getByRole('button', { name: '关闭面板' }).click();
        await page.getByRole('button', { name: '目录', exact: true }).first().click();
        await capture('directory');
        await page.getByRole('button', { name: '关闭面板' }).click();
        await page.getByRole('button', { name: '我的世界', exact: true }).last().click();
        await nav('书城');
        await capture('store');
        await nav(viewport.width < 1050 ? '合流' : '世界合流');
        await capture('merge');
        await page.getByRole('button', { name: '开启合流故事', exact: true }).click();
        await page.getByRole('button', { name: '阅读新书', exact: true }).waitFor();
        await capture('merged');
        // Mobile has no 我的世界 nav item; the plaza tab is its home landing.
        if (viewport.width < 1050) await nav('广场');
        else await nav('我的世界');
        await capture('returning');
        assert.deepEqual(errors, [], 'uncaught browser errors');
      } catch (error) {
        report.failures.push({ viewport, error: error.message });
        console.error(error);
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(artifactDir, 'visual-report.json'), JSON.stringify(report, null, 2));
  }
  process.exitCode = report.failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
