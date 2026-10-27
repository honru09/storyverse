// Run against a running Vite preview/dev server. Every viewport gets a fresh
// browser context; no existing browser profile or user's local data is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const targetUrl = process.env.TARGET_URL || 'http://localhost:5173';
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const storageKey = 'storyweave:v2';
const results = [];
const failures = [];
const privateNames = ['测试旅人青禾', '测试海岸镇', '测试航海学校', '测试档案馆', '测试友人阿澄'];
fs.mkdirSync(artifactDir, { recursive: true });

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

// The reader menu chrome is summoned by a tap in the middle of the
// screen; tests dispatch that same tap on the article so the scroll
// position never decides whether it lands. The hairline back button
// stays put at all times, so leaving the reader needs no summoning.
async function toggleChrome(page) {
  await page.evaluate(() => {
    const el = document.querySelector('.reader-article');
    const rect = el.getBoundingClientRect();
    const options = { bubbles: true, clientX: Math.round(window.innerWidth / 2), clientY: Math.round(Math.min(window.innerHeight / 2, Math.max(80, rect.top + 140))) };
    el.dispatchEvent(new PointerEvent('pointerdown', options));
    el.dispatchEvent(new MouseEvent('click', options));
  });
}
async function openChrome(page) {
  if (await page.locator('.reader-chrome-bottom').count() === 0) await toggleChrome(page);
  await page.locator('.reader-chrome-bottom').waitFor({ state: 'visible' });
}
async function closeChrome(page) {
  if (await page.locator('.reader-chrome-bottom').count() > 0) await toggleChrome(page);
  await page.locator('.reader-chrome-bottom').waitFor({ state: 'detached' });
}

async function currentChapter(page, number) {  // The chapter identity rides the screen-reader progress node inside
  // the top hairline; what this helper asserts is identity, and it
  // holds whether or not the menu chrome is summoned.
  await page.getByRole('progressbar', { name: '阅读进度' }).waitFor({ state: 'attached' });
  await page.waitForFunction(expected => {
    const progress = document.querySelector('[role="progressbar"][aria-label="阅读进度"]');
    return progress?.getAttribute('aria-valuenow') === String(expected);
  }, number);
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

async function openDirectory(page) {
  await page.getByRole('button', { name: '目录', exact: true }).first().click();
  return page.getByRole('dialog', { name: '章节目录' });
}

async function selectChapter(page, index) {
  const dialog = await openDirectory(page);
  await dialog.locator('.chapter-directory-list').getByRole('button').nth(index).click();
  await currentChapter(page, index + 1);
}

async function navigation(page, name) {
  await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name, exact: true }).click();
}

async function completeBook(page, start = 1, { total = 24, ending = '这一季，读完了。' } = {}) {
  for (let chapter = start; chapter <= total; chapter += 1) {
    await currentChapter(page, chapter);
    // No chapter waits for a choice any more: the story flows straight on.
    assert.equal(await page.getByRole('group', { name: '剧情选择' }).count(), 0,
      `chapter ${chapter} must not render a choice group`);
    if (chapter < total) await page.getByRole('button', { name: '下一章', exact: true }).click();
  }
  await page.getByRole('heading', { name: ending }).waitFor();
}

async function runJourney(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(10000);
  const label = `${width}px`;
  let originalId;
  try {
    // The plaza is the front door; this journey starts from the home page.
    await page.goto(`${targetUrl}#/home`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '开启第一本书', exact: true }).waitFor();
    await noOverflow(page, 'first visit');
    await page.getByRole('button', { name: '开启第一本书', exact: true }).click();
    await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
    await page.locator('.world-grid').getByRole('button', { name: /沉潮港/ }).click();
    await noOverflow(page, 'world selection');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '你以什么身份醒来？' }).waitFor();
    // The merged 出身 step: the first 继续 rolls an identity and stays, so
    // its spawn points expand in place; the second accepts the default.
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '从哪里醒来？' }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByLabel('主角昵称（选填）').fill(privateNames[0]);
    await page.getByRole('switch', { name: '带入人生经历（选填）' }).click();
    await page.getByLabel('成长的地方（选填）').fill(privateNames[1]);
    await page.getByLabel('学习的地方（选填）').fill(privateNames[2]);
    await page.getByLabel('工作过的地方（选填）').fill(privateNames[3]);
    await page.getByLabel('重要的人（昵称，选填）').fill(privateNames[4]);
    await noOverflow(page, 'character form');
    // Abilities share this screen now: the groups are already here.
    await page.getByRole('heading', { name: '想拥有什么能力？' }).waitFor();
    await noOverflow(page, 'ability selection');

    await check(`${label} creation draft survives reload`, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '想拥有什么能力？' }).waitFor({ timeout: 4000 });
      const saved = await library(page);
      assert.equal(saved.draft.name, privateNames[0]);
      assert.equal(saved.draft.step, 4);
    });
    // Keep testing independent features if an older build restores the home page.
    if (!(await page.getByRole('heading', { name: '想拥有什么能力？' }).count())) {
      await navigation(page, '造世');
      await page.getByRole('heading', { name: '想拥有什么能力？' }).waitFor();
    }
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '确认你的故事' }).waitFor();
    await noOverflow(page, 'confirmation');
    await page.getByRole('button', { name: '进入第一章', exact: true }).click();
    await currentChapter(page, 1);
    originalId = (await library(page)).activeStoryId;
    await check(`${label} first story reaches its first chapter`, async () => {
      const saved = await library(page);
      assert.equal(saved.stories.length, 1);
      assert.equal(saved.stories[0].config.name, privateNames[0]);
      await noOverflow(page, 'reader');
    });

    await page.getByRole('button', { name: '下一章', exact: true }).click();
    await currentChapter(page, 2);
    await check(`${label} no choice gates the reader: next chapter and directory stay open`, async () => {
      assert.equal(await page.getByRole('group', { name: '剧情选择' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '下一章', exact: true }).isEnabled(), true);
      const dialog = await openDirectory(page);
      assert.equal(await dialog.locator('.chapter-directory-list').getByRole('button').nth(2).isEnabled(), true);
      await dialog.getByRole('button', { name: '关闭面板' }).click();
    });
    await page.getByRole('button', { name: '下一章', exact: true }).click();
    await currentChapter(page, 3);
    await check(`${label} reader reload restores the same chapter`, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('progressbar', { name: '阅读进度' }).waitFor({ state: 'attached', timeout: 4000 });
      await currentChapter(page, 3);
    });
    if (!(await page.getByRole('progressbar', { name: '阅读进度' }).count())) {
      await page.getByRole('button', { name: '继续阅读', exact: true }).click();
      await currentChapter(page, 3);
    }
    await check(`${label} browser back and forward preserve reading context`, async () => {
      await page.getByRole('button', { name: '我的世界', exact: true }).click();
      await page.getByRole('button', { name: '继续阅读', exact: true }).waitFor();
      await page.goBack();
      await currentChapter(page, 3);
      await page.goForward();
      await page.getByRole('button', { name: '继续阅读', exact: true }).click();
      await currentChapter(page, 3);
    });
    await completeBook(page, 3);
    await check(`${label} a full season of 24 chapters reaches a real ending`, async () => {
      const saved = (await library(page)).stories.find(story => story.id === originalId);
      assert.equal(saved.chapters.length, 24);
      assert.equal(saved.readerIndex, 23);
      assert.equal(saved.config.storyLengthMode, 'season');
      await page.getByRole('heading', { name: '这一季，读完了。' }).waitFor();
      // The season finale offers the next season.
      await page.getByRole('button', { name: '开启下一季', exact: true }).waitFor();
    });

    await selectChapter(page, 1);
    await openChrome(page);
    await page.getByRole('button', { name: '介入', exact: true }).click();
    const endSheet = page.getByRole('dialog', { name: '介入 · 扰动世界线' });
    await endSheet.waitFor();
    await check(`${label} a completed line refuses interventions and stays untouched`, async () => {
      await endSheet.getByText(/已经走完/).waitFor();
      const saved = (await library(page)).stories.find(story => story.id === originalId);
      assert.equal(saved.chapters.length, 24);
      assert.deepEqual(saved.interventions || [], []);
    });
    await endSheet.getByRole('button', { name: '关闭面板' }).click();

    await openChrome(page);
    await page.getByRole('button', { name: '分享', exact: true }).click();
    await page.getByRole('dialog', { name: '分享预览' }).getByRole('button', { name: '保存到本机书城' }).click();
    const publishedLibrary = await library(page);
    await check(`${label} public snapshot removes personal details`, async () => {
      assert.equal(publishedLibrary.publications.length, 1);
      const serialized = JSON.stringify(publishedLibrary.publications[0].snapshot);
      for (const privateName of privateNames) assert.ok(!serialized.includes(privateName), `privacy leak: ${privateName}`);
    });
    await page.getByRole('button', { name: '我的世界', exact: true }).click();
    await navigation(page, '书城');
    await page.getByRole('heading', { name: '书城', exact: true }).waitFor();
    await noOverflow(page, 'store');
    await page.getByRole('button').filter({ hasText: '本机分享' }).click();
    await currentChapter(page, 1);
    await check(`${label} published book is read-only and leaves originals intact`, async () => {
      await page.getByText('只读版本 · 不会改变原作', { exact: true }).waitFor();
      await openChrome(page);
      assert.equal(await page.getByRole('button', { name: '分享', exact: true }).count(), 0);
      // A read-only copy offers no way to reach into the worldline either.
      assert.equal(await page.getByRole('button', { name: '介入', exact: true }).count(), 0);
      await closeChrome(page);
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await currentChapter(page, 2);
      assert.equal(await page.getByRole('group', { name: '剧情选择' }).count(), 0);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('只读版本 · 不会改变原作', { exact: true }).waitFor();
      await selectChapter(page, 23);
      await page.getByRole('button', { name: '回到书城', exact: true }).waitFor();
      assert.deepEqual((await library(page)).stories, publishedLibrary.stories);
    });
    await page.getByRole('button', { name: '返回书城', exact: true }).click();
    await navigation(page, '造世');
    await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
    // Two-level taxonomy: 修仙 lives on the 玄幻修真 family's L2 wall.
    await page.getByRole('button', { name: /玄幻修真/ }).click();
    await page.locator('.template-wall').getByRole('button', { name: /修仙/ }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByLabel('主角昵称（选填）').fill('测试剑客星河');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '进入第一章', exact: true }).click();
    await currentChapter(page, 1);
    const twoBookLibrary = await library(page);
    const partnerId = twoBookLibrary.activeStoryId;
    await page.getByRole('button', { name: '我的世界', exact: true }).click();
    await navigation(page, '合流');
    await page.getByRole('heading', { name: '世界合流', exact: true }).waitFor();
    const originalTitle = publishedLibrary.stories.find(story => story.id === originalId).title;
    const partnerTitle = twoBookLibrary.stories.find(story => story.id === partnerId).title;
    await page.getByRole('radiogroup', { name: '你的故事' }).getByRole('radio').filter({ hasText: originalTitle }).click();
    await page.getByRole('radiogroup', { name: '相遇的故事' }).getByRole('radio').filter({ hasText: partnerTitle }).click();
    // Both lines are finite shorts: the product-mode note must say so.
    await page.getByText(/融合出的新线是一本 6 章的短篇/).waitFor();
    await noOverflow(page, 'merge choices');
    await page.getByRole('group', { name: '世界规则' }).getByRole('button', { name: '各自独立' }).click();
    await page.getByRole('group', { name: '初次关系' }).getByRole('button', { name: '彼此试探' }).click();
    await page.getByRole('button', { name: '开启合流故事', exact: true }).click();
    await page.getByRole('button', { name: '阅读新书', exact: true }).click();
    await currentChapter(page, 1);
    await check(`${label} merge creates an independent two-protagonist book`, async () => {
      const saved = await library(page);
      assert.equal(saved.stories.length, 3);
      const original = saved.stories.find(story => story.id === originalId);
      assert.deepEqual(original, publishedLibrary.stories.find(story => story.id === originalId));
      assert.deepEqual(saved.stories.find(story => story.id === partnerId), twoBookLibrary.stories.find(story => story.id === partnerId));
      const merged = saved.stories.find(story => story.id === saved.activeStoryId);
      assert.notEqual(merged.id, originalId);
      assert.equal(merged.kind, 'merged');
      assert.deepEqual(merged.sourceIds, [originalId, partnerId]);
      assert.deepEqual(merged.derivedFrom, [originalId, partnerId]);
      assert.deepEqual(merged.sourceTitles, [originalTitle, partnerTitle]);
      assert.deepEqual(merged.config.protagonists.map(person => person.name), [privateNames[0], '测试剑客星河']);
      assert.equal(merged.config.merge.rules, 'separate');
      assert.equal(merged.config.merge.bond, 'rivals');
    });
    await completeBook(page, 1, { total: 6, ending: '这一卷，读完了。' });
    await check(`${label} merged book also reaches its ending`, async () => {
      await noOverflow(page, 'merged ending');
      const saved = await library(page);
      const merged = saved.stories.find(story => story.id === saved.activeStoryId);
      assert.equal(merged.chapters.length, 6);
      assert.equal(merged.readerIndex, 5);
      assert.deepEqual(saved.stories.find(story => story.id === originalId), publishedLibrary.stories.find(story => story.id === originalId));
      assert.deepEqual(saved.stories.find(story => story.id === partnerId), twoBookLibrary.stories.find(story => story.id === partnerId));
    });
    await page.getByRole('button', { name: '我的世界', exact: true }).click();
    await page.screenshot({ path: path.join(artifactDir, `journey-${width}.png`), fullPage: true });
    await check(`${label} mobile home has no overflow or uncaught errors`, async () => {
      await noOverflow(page, 'three-book home');
      assert.deepEqual(pageErrors, []);
    });
  } catch (error) {
    await check(`${label} journey completes without interruption`, async () => { throw error; });
    await page.screenshot({ path: path.join(artifactDir, `failure-${width}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  try {
    for (const width of [390, 320]) await runJourney(browser, width);
  } finally {
    await browser.close();
    const report = { targetUrl, generatedAt: new Date().toISOString(), results, failures };
    fs.writeFileSync(path.join(artifactDir, 'journey-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`\n${results.length - failures.length}/${results.length} checks passed. Artifacts: ${artifactDir}`);
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
