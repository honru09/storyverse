// Run only after building and starting the current application + API.
// This suite uses the REAL unconfigured /api/auth/config endpoint. It does not
// mock accounts, submit credentials, contact Firebase, or generate paid prose.
// Every viewport gets an isolated browser context, never the user's profile.
//
// PowerShell:
//   $env:TARGET_URL='http://localhost:8787'; node e2e/onboarding.cjs
//   $env:HEADLESS='true'; node e2e/onboarding.cjs
// Optional: VIEWPORT_WIDTHS=390,320; PW_ARTIFACT_DIR=<JSON report directory>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const targetUrl = process.env.TARGET_URL || 'http://localhost:5173';
const headless = /^(true|1)$/i.test(process.env.HEADLESS ?? process.env.PW_HEADLESS ?? 'false');
const widths = (process.env.VIEWPORT_WIDTHS || '390,320').split(',').map(Number);
assert.ok(widths.length > 0 && widths.every(width => Number.isInteger(width) && width >= 280 && width <= 1600),
  'VIEWPORT_WIDTHS must contain comma-separated integer widths between 280 and 1600.');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const storageKey = 'storyweave:v2';
const preferencesKey = 'storyweave:reading-preferences:v1';
const testName = '回归旅人星澄';
const results = [];

async function readRawLibrary(page) {
  return page.evaluate(key => localStorage.getItem(key), storageKey);
}

async function readLibrary(page) {
  const raw = await readRawLibrary(page);
  return raw === null ? null : JSON.parse(raw);
}

async function noOverflow(page, label) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(Math.max(sizes.document, sizes.body) <= sizes.viewport + 1,
    `${label}: horizontal overflow ${JSON.stringify(sizes)}`);
}

async function closeWithEscape(page, dialog, trigger) {
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true,
    'Escape must return focus to the button that opened the panel.');
}

async function readerReady(page) {
  await page.getByRole('progressbar', { name: '阅读进度' }).waitFor();
  await page.waitForFunction(key => {
    const library = JSON.parse(localStorage.getItem(key));
    const story = library?.stories.find(item => item.id === library.activeStoryId);
    return story?.readerIndex === 0 && story.chapters.length >= 2;
  }, storageKey);
}

async function assertAppearance(page, expected) {
  await page.waitForFunction(({ fontSize, lineHeight, theme }) => {
    const root = document.querySelector('.page-reader');
    const article = document.querySelector('.reader-article');
    const lede = document.querySelector('.article-lede');
    const body = document.querySelector('.article-body p');
    if (!root || !article || !lede || !body) return false;
    const metricsMatch = element => {
      const computed = getComputedStyle(element);
      return Math.abs(parseFloat(computed.fontSize) - fontSize) < 0.01
        && Math.abs(parseFloat(computed.lineHeight) - fontSize * lineHeight) < 0.1;
    };
    return root.dataset.readerTheme === theme && [article, lede, body].every(metricsMatch);
  }, expected);
}

async function runOnboarding(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const unexpectedGeneration = [];
  const externalIdentityRequests = [];
  let currentStep = 'setup';
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => pageErrors.push(error.message));
  // An unexpected regression must fail without spending model quota. This is
  // only a safety abort; no successful generation or authentication is mocked.
  await context.route('**/api/generate', async route => {
    unexpectedGeneration.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  await context.route(/https:\/\/(?:identitytoolkit|securetoken)\.googleapis\.com\//, async route => {
    externalIdentityRequests.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  const step = async (name, action) => {
    currentStep = name;
    await action();
    results.push({ width, name, status: 'passed' });
    console.log(`PASS ${width}px ${name}`);
  };

  try {
    await step('real API reports account service disabled', async () => {
      const response = await context.request.get(new URL('/api/auth/config', targetUrl).href);
      assert.equal(response.status(), 200,
        'Start the real API alongside the current build; a static preview without /api/auth/config is not sufficient.');
      assert.match(response.headers()['content-type'] || '', /application\/json/);
      const config = await response.json();
      assert.equal(config.enabled, false,
        'This regression expects an unconfigured account service. Use a local server with AUTH_ENABLED=false; no test account is created.');
      assert.equal(config.providers?.google, false);
      assert.equal(config.providers?.email, false);
      assert.equal(config.storage, 'local');
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '开启第一本书', exact: true }).waitFor();
    const accountTrigger = page.getByRole('button', { name: '登录 / 注册', exact: true });
    const initialRaw = await readRawLibrary(page);

    await step('Home account panel shows disabled real login and registration', async () => {
      await accountTrigger.click();
      const dialog = page.getByRole('dialog', { name: '登录与注册', exact: true });
      await dialog.getByRole('alert').filter({ hasText: '账号服务尚未配置' }).waitFor();
      assert.equal(await dialog.getByRole('button', { name: '使用 Google 继续', exact: true }).isDisabled(), true);
      assert.equal(await dialog.getByLabel('邮箱', { exact: true }).isDisabled(), true);
      assert.equal(await dialog.locator('input[name="password"]').isDisabled(), true);
      assert.equal(await dialog.getByRole('button', { name: '登录账号', exact: true }).isDisabled(), true);
      await dialog.getByRole('group', { name: '账号操作' }).getByRole('button', { name: '注册', exact: true }).click();
      assert.equal(await dialog.getByRole('group', { name: '账号操作' }).getByRole('button', { name: '注册', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await dialog.getByRole('button', { name: '创建账号', exact: true }).isDisabled(), true);
      assert.equal(await dialog.locator('input[name="password"]').getAttribute('autocomplete'), 'new-password');
      await dialog.getByRole('button', { name: '返回登录', exact: true }).click();
      await dialog.getByRole('button', { name: '忘记密码？', exact: true }).click();
      assert.equal(await dialog.getByRole('button', { name: '发送重设邮件', exact: true }).isDisabled(), true);
      await dialog.getByRole('button', { name: '返回登录', exact: true }).click();
      assert.equal(await readRawLibrary(page), initialRaw, 'Browsing account modes must not change local stories.');
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/config'),
        dialog.getByRole('button', { name: '重新连接', exact: true }).click(),
      ]);
      await dialog.getByRole('alert').filter({ hasText: '账号服务尚未配置' }).waitFor();
      await noOverflow(page, 'account sheet');
      await closeWithEscape(page, dialog, accountTrigger);
    });

    await step('Home login / registration entry continues as guest into creation', async () => {
      await accountTrigger.click();
      const dialog = page.getByRole('dialog', { name: '登录与注册', exact: true });
      await dialog.getByRole('button', { name: '先不登录，继续体验', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      await page.getByRole('heading', { name: '想写哪种故事？', exact: true }).waitFor();
      assert.equal(new URL(page.url()).hash, '#/forge');
      assert.equal(await page.getByRole('button', { name: '我的账号', exact: true }).count(), 0);
      await noOverflow(page, 'guest creation');
    });

    await step('creation draft survives leaving, returning and reloading', async () => {
      await page.locator('.stage-chips').getByRole('button', { name: '沉潮港', exact: true }).click();
      await page.getByRole('button', { name: '继续', exact: true }).click();
      // Step two: the spawn point belongs to the world picked in step one.
      await page.getByRole('heading', { name: '故事从哪里醒来？', exact: true }).waitFor();
      await page.locator('.spawn-grid').getByRole('button', { name: /灯塔守夜屋/ }).click();
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await page.getByLabel('主角昵称（选填）').fill(testName);
      await page.getByRole('switch', { name: '带入人生经历（选填）' }).click();
      await page.getByLabel('成长的地方（选填）').fill('回归海岸镇');
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await page.getByRole('heading', { name: '想拥有什么能力？', exact: true }).waitFor();
      await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name: '世界', exact: true }).click();
      const resume = page.getByRole('button', { name: /继续上次设定/ });
      await resume.waitFor();
      const saved = await readLibrary(page);
      assert.equal(saved.draft.name, testName);
      assert.equal(saved.draft.hometown, '回归海岸镇');
      assert.equal(saved.draft.step, 4);
      assert.equal(saved.draft.startPointName, '灯塔守夜屋');
      assert.equal(saved.stories.length, 0);
      await resume.click();
      await page.getByRole('heading', { name: '想拥有什么能力？', exact: true }).waitFor();
      await page.getByRole('navigation', { name: '创作步骤' }).getByRole('button', { name: '第 3 步：主角', exact: true }).click();
      assert.equal(await page.getByLabel('主角昵称（选填）').inputValue(), testName);
      assert.equal(await page.getByLabel('成长的地方（选填）').inputValue(), '回归海岸镇');
      assert.equal(await page.getByRole('switch', { name: '带入人生经历（选填）' }).getAttribute('aria-checked'), 'true');
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '想拥有什么能力？', exact: true }).waitFor();
      assert.deepEqual((await readLibrary(page)).draft, saved.draft);
      await noOverflow(page, 'restored draft');
    });

    await step('guest creates a local preset story without paid generation', async () => {
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await page.getByRole('heading', { name: '故事从这里开始。', exact: true }).waitFor();
      const localMode = page.getByRole('group', { name: '故事方式' }).getByRole('button', { name: '预设体验', exact: true });
      await localMode.click();
      assert.equal(await localMode.getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: '进入第一章', exact: true }).click();
      await readerReady(page);
      const saved = await readLibrary(page);
      assert.equal(saved.stories.length, 1);
      assert.equal(saved.stories[0].config.name, testName);
      assert.equal(saved.stories[0].config.startPointName, '灯塔守夜屋');
      assert.ok(saved.stories[0].worldBible.premise.includes('灯塔守夜屋'));
      assert.ok((await page.locator('.reader-article').innerText()).includes('守夜日志'), 'chapter one opens at the chosen spawn point');
      assert.notEqual(saved.stories[0].engine, 'gemini');
      assert.equal(saved.draft, null);
      assert.deepEqual(unexpectedGeneration, []);
    });

    const originalStoryRaw = await readRawLibrary(page);
    const originalChapter = await page.locator('.reader-article').innerText();
    const originalBackground = await page.locator('.page-reader').evaluate(element => getComputedStyle(element).backgroundColor);
    const preferencesTrigger = page.getByRole('button', { name: '阅读设置', exact: true });

    await step('reading size, spacing and full-page theme update immediately', async () => {
      await preferencesTrigger.click();
      const dialog = page.getByRole('dialog', { name: '阅读设置', exact: true });
      await dialog.waitFor();
      const sizes = dialog.getByRole('group', { name: '文字大小', exact: true });
      const spacing = dialog.getByRole('group', { name: '行间距', exact: true });
      const themes = dialog.getByRole('group', { name: '阅读背景', exact: true });
      assert.equal(await sizes.getByRole('radio', { name: '标准', exact: true }).isChecked(), true);
      await dialog.getByRole('button', { name: '放大字号', exact: true }).click();
      await dialog.getByRole('button', { name: '放大字号', exact: true }).click();
      assert.equal(await sizes.getByRole('radio', { name: '特大', exact: true }).isChecked(), true);
      assert.equal(await dialog.getByRole('button', { name: '放大字号', exact: true }).isDisabled(), false);
      for (let step = 0; step < 5; step += 1) {
        await dialog.getByRole('button', { name: '放大字号', exact: true }).click();
      }
      await assertAppearance(page, { fontSize: 32, lineHeight: 2.05, theme: 'light' });
      assert.equal(await dialog.getByRole('button', { name: '放大字号', exact: true }).isDisabled(), true);
      await noOverflow(page, 'maximum reading size');
      await sizes.getByText('特大', { exact: true }).click();
      // Click the visible label, matching touch usage; the native radios remain
      // keyboard-operable even though their custom visual lives in the label.
      await spacing.getByText('紧凑', { exact: true }).click();
      await themes.getByText('夜间', { exact: true }).click();
      assert.equal(await spacing.getByRole('radio', { name: '紧凑', exact: true }).isChecked(), true);
      assert.equal(await themes.getByRole('radio', { name: '夜间', exact: true }).isChecked(), true);
      await assertAppearance(page, { fontSize: 22, lineHeight: 1.8, theme: 'night' });
      const surfaces = await page.evaluate(() => {
        const root = document.querySelector('.page-reader');
        const preview = document.querySelector('.reading-preferences-preview');
        return {
          rootBackground: getComputedStyle(root).backgroundColor,
          previewBackground: getComputedStyle(preview).backgroundColor,
          rootWidth: root.getBoundingClientRect().width,
          parentWidth: root.parentElement.getBoundingClientRect().width,
        };
      });
      assert.notEqual(surfaces.rootBackground, originalBackground, 'Theme must affect the reader page, not only the preview.');
      assert.equal(surfaces.rootBackground, surfaces.previewBackground);
      assert.ok(Math.abs(surfaces.rootWidth - surfaces.parentWidth) < 2, 'Reader background must span its page container.');
      const savedPreferences = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferencesKey);
      assert.deepEqual({ version: savedPreferences.version, fontSize: savedPreferences.fontSize,
        lineHeight: savedPreferences.lineHeight, theme: savedPreferences.theme },
      { version: 2, fontSize: 22, lineHeight: 1.8, theme: 'night' });
      assert.equal(savedPreferences.fontFamily, 'system');
      assert.equal(savedPreferences.fontWeight, 400);
      assert.equal(savedPreferences.margin, 'standard');
      assert.equal(savedPreferences.paragraphIndent, true);
      assert.equal(savedPreferences.readingMode, 'scroll');
      assert.equal(savedPreferences.keepAwake, false);
      assert.equal(await readRawLibrary(page), originalStoryRaw, 'Preferences must not rewrite any story or reading progress.');
      await noOverflow(page, 'night settings');
      await closeWithEscape(page, dialog, preferencesTrigger);
    });

    await step('preferences survive reload while story bytes and chapter stay unchanged', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await readerReady(page);
      await assertAppearance(page, { fontSize: 22, lineHeight: 1.8, theme: 'night' });
      assert.equal(await readRawLibrary(page), originalStoryRaw);
      assert.equal(await page.locator('.reader-article').innerText(), originalChapter);
      await preferencesTrigger.click();
      const dialog = page.getByRole('dialog', { name: '阅读设置', exact: true });
      const sizes = dialog.getByRole('group', { name: '文字大小', exact: true });
      const spacing = dialog.getByRole('group', { name: '行间距', exact: true });
      const themes = dialog.getByRole('group', { name: '阅读背景', exact: true });
      assert.equal(await sizes.getByRole('radio', { name: '特大', exact: true }).isChecked(), true);
      assert.equal(await spacing.getByRole('radio', { name: '紧凑', exact: true }).isChecked(), true);
      assert.equal(await themes.getByRole('radio', { name: '夜间', exact: true }).isChecked(), true);
      // Exercise native keyboard activation and confirm that it suppresses
      // theme/typography motion synchronously rather than waiting for a timer.
      await themes.getByRole('radio', { name: '暖色', exact: true }).focus();
      await page.keyboard.press('Space');
      await assertAppearance(page, { fontSize: 22, lineHeight: 1.8, theme: 'warm' });
      assert.equal(await page.locator('.page-reader').getAttribute('data-reader-motion'), 'off');
      await dialog.getByRole('button', { name: '恢复默认', exact: true }).click();
      await assertAppearance(page, { fontSize: 18, lineHeight: 2.05, theme: 'light' });
      await closeWithEscape(page, dialog, preferencesTrigger);
      assert.equal(await readRawLibrary(page), originalStoryRaw);
      await noOverflow(page, 'restored reader');
    });

    await step('no runtime errors, account requests or paid generation', async () => {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(unexpectedGeneration, []);
      assert.deepEqual(externalIdentityRequests, []);
      assert.equal(await page.getByRole('progressbar', { name: '阅读进度' }).getAttribute('aria-valuenow'), '1');
    });
  } catch (error) {
    results.push({ width, name: currentStep, status: 'failed', error: error.message });
    console.error(`FAIL ${width}px ${currentStep}: ${error.message}`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless });
  try {
    for (const width of widths) await runOnboarding(browser, width);
  } finally {
    await browser.close();
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'onboarding-results.json'), `${JSON.stringify({
      targetUrl, headless, generatedAt: new Date().toISOString(), results,
    }, null, 2)}\n`);
  }
  const failed = results.filter(result => result.status === 'failed').length;
  console.log(`\n${results.length - failed}/${results.length} onboarding checks passed. Report: ${path.join(artifactDir, 'onboarding-results.json')}`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
