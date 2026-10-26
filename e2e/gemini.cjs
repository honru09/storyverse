// The HTTP boundary is mocked. This suite never contacts Gemini or needs a key.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const targetUrl = process.env.TARGET_URL || 'http://localhost:5173';
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const storageKey = 'storyweave:v2';
const results = [];
const pendingGates = new Set();
fs.mkdirSync(artifactDir, { recursive: true });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const gate = { promise, resolve: () => { resolve(); pendingGates.delete(gate); } };
  pendingGates.add(gate);
  return gate;
}

async function library(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function position(page, chapter) {
  await page.waitForFunction(expected => document.querySelector('[role="progressbar"][aria-label="阅读进度"]')?.getAttribute('aria-valuenow') === String(expected), chapter);
}

async function savedChapters(page, count) {
  await page.waitForFunction(({ key, count }) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved?.stories.find(story => story.id === saved.activeStoryId)?.chapters.length === count;
  }, { key: storageKey, count });
}

async function prepareOpening(page, name, genre = '奇幻') {
  await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name: '造世', exact: true }).click();
  // The start flow leads with genre templates now; the mist stage chip is the
  // equivalent of the old mist world card this helper used to click.
  await page.locator('.stage-chips').getByRole('button', { name: '沉潮港', exact: true }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByLabel('主角昵称（选填）').fill(name);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  const mode = page.getByRole('group', { name: '故事方式' }).getByRole('button', { name: 'Gemini 创作' });
  await mode.waitFor();
  assert.equal(await mode.getAttribute('aria-pressed'), 'true');
}

async function openBook(page, name, genre) {
  await prepareOpening(page, name, genre);
  await page.getByRole('button', { name: '进入第一章', exact: true }).click();
  await position(page, 1);
  await savedChapters(page, 2);
}

async function finishBook(page, requests, { total = 24, ending = '这一季，读完了。' } = {}) {
  const id = (await library(page)).activeStoryId;
  for (let index = 0; index < total; index += 1) {
    await position(page, index + 1);
    assert.match(await page.locator('.reader-article').innerText(), new RegExp(`MOCK_GEMINI_CHAPTER_${index}`));
    const choice = page.getByRole('group', { name: '剧情选择' });
    await choice.first().waitFor({ timeout: 400 }).catch(() => {});
    if (await choice.count()) {
      assert.equal(requests.some(request => request.story.id === id && request.index === index + 1), false, 'a decision must block the next paid request');
      assert.equal(await page.getByRole('button', { name: '下一章', exact: true }).isEnabled(), false);
      await choice.getByRole('button').first().click();
    }
    if (index < total - 1) {
      await page.getByRole('button', { name: '下一章', exact: true }).click();
    }
  }
  await page.getByRole('heading', { name: ending }).waitFor();
  const bookRequests = requests.filter(request => request.story.id === id);
  assert.equal(bookRequests.length, total);
  assert.deepEqual(bookRequests.map(request => request.index), Array.from({ length: total }, (_, index) => index));
}

(async () => {
  const { buildChapter, chapterKey } = await import(pathToFileURL(path.resolve(__dirname, '../src/story-engine.js')).href);
  const resultFor = ({ story, index }) => ({
    key: chapterKey(story, index),
    chapter: {
      ...buildChapter(story, index),
      title: `MOCK_GEMINI_CHAPTER_${index} ${story.config.name}`,
      paragraphs: [
        `MOCK_GEMINI_CHAPTER_${index}：${story.config.name}看见一条纸鲸游过夜空。`,
        `BRANCH_${story.choices[1] || 'none'}_${story.choices[3] || 'none'}：这些句子来自模拟模型响应，必须原样保存在书里。`,
      ],
      summary: `模型第 ${index + 1} 章，${story.config.name}跟随纸鲸继续前进。`,
    },
    ...(index === 0 ? { worldBible: { ...story.worldBible, premise: `${story.config.name}与纸鲸同行的世界。` } } : {}),
  });
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const run = async (name, action, respond) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const requests = [];
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.setDefaultTimeout(12000);
    await context.route('**/api/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, provider: 'gemini' }) }));
    await context.route('**/api/generate', async route => {
      const request = route.request().postDataJSON();
      requests.push(request);
      const reply = await respond?.(request, requests);
      try {
        await route.fulfill({ status: reply?.status || 200, contentType: 'application/json', body: JSON.stringify(reply?.body || resultFor(request)) });
      } catch (error) {
        // Cancellation and navigation intentionally abort held responses.
        if (!route.request().failure() && !page.isClosed() && !/closed|handled|Invalid Interception/i.test(error.message)) throw error;
      }
    });
    let deadline;
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      await Promise.race([
        action(page, requests),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('scenario exceeded 45 seconds')), 45000); }),
      ]);
      assert.deepEqual(pageErrors, []);
      results.push({ name, status: 'passed', requests: requests.length });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, status: 'failed', error: error.message, requests: requests.length });
      console.error(`FAIL ${name}: ${error.message}`);
      await page.screenshot({ path: path.join(artifactDir, `gemini-failure-${results.length}.png`), fullPage: true }).catch(() => {});
    } finally {
      clearTimeout(deadline);
      for (const gate of pendingGates) gate.resolve();
      await context.close();
    }
  };
  try {
    await run('Gemini full book, reviewed actual-prose sharing and independent two-book merge', async (page, requests) => {
      await openBook(page, 'AIQA舟明');
      await finishBook(page, requests);
      const original = (await library(page)).stories[0];
      assert.equal(original.engine, 'gemini');
      await page.getByRole('button', { name: '分享', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '分享预览' });
      assert.equal(await dialog.locator('details').count(), 24);
      const publish = dialog.getByRole('button', { name: '保存到本机书城' });
      assert.equal(await publish.isEnabled(), false);
      await dialog.locator('summary').first().click();
      assert.match(await dialog.innerText(), /MOCK_GEMINI_CHAPTER_0：匿名旅者看见一条纸鲸/);
      assert.doesNotMatch(await dialog.innerText(), /AIQA舟明/);
      await dialog.getByRole('checkbox', { name: '我已检查正文，可保存此副本' }).check();
      await publish.click();
      const shared = (await library(page)).publications[0].snapshot;
      assert.equal(shared.chapters.length, 24);
      assert.match(shared.chapters[0].paragraphs[0], /MOCK_GEMINI_CHAPTER_0：匿名旅者/);
      assert.doesNotMatch(JSON.stringify(shared), /AIQA舟明/);
      await page.getByRole('button', { name: '我的世界', exact: true }).click();
      await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name: '书城', exact: true }).click();
      const requestCount = requests.length;
      await page.getByRole('button').filter({ hasText: '本机分享' }).click();
      await position(page, 1);
      await page.getByText('只读版本 · 不会改变原作', { exact: true }).waitFor();
      assert.match(await page.locator('.reader-article').innerText(), /MOCK_GEMINI_CHAPTER_0/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await position(page, 1);
      assert.equal(requests.length, requestCount);
      await page.getByRole('button', { name: '返回书城', exact: true }).click();
      await openBook(page, 'AIQA星遥', '修仙');
      const twoBooks = (await library(page)).stories;
      const partner = twoBooks.find(story => story.id !== original.id);
      await page.getByRole('button', { name: '我的世界', exact: true }).click();
      await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name: '合流', exact: true }).click();
      await page.getByRole('combobox', { name: '你的故事', exact: true }).selectOption(original.id);
      await page.getByRole('combobox', { name: '相遇的故事', exact: true }).selectOption(partner.id);
      await page.getByRole('button', { name: '开启合流故事', exact: true }).click();
      await page.getByRole('button', { name: '阅读新书', exact: true }).click();
      await position(page, 1);
      await savedChapters(page, 2);
      await finishBook(page, requests, { total: 6, ending: '这一卷，读完了。' });
      const saved = await library(page);
      assert.equal(saved.stories.length, 3);
      const merged = saved.stories.find(story => story.id === saved.activeStoryId);
      assert.equal(merged.engine, 'gemini');
      assert.deepEqual(merged.sourceIds, [original.id, partner.id]);
      assert.deepEqual(saved.stories.filter(story => story.id !== merged.id), twoBooks);
      const mergeRequest = requests.find(request => request.story.id === merged.id);
      assert.equal(mergeRequest.story.mergeContext.length, 2);
      // Merge context stays compact: the source's summaries are capped at
      // the most recent twelve even for a full 24-chapter season.
      assert.equal(mergeRequest.story.mergeContext[0].summaries.length, 12);
      assert.equal(mergeRequest.story.mergeContext[1].summaries.length, 2);
      await page.screenshot({ path: path.join(artifactDir, 'gemini-ending.png'), fullPage: true });
    });

    const openingGate = deferred();
    const openingSeen = deferred();
    const retryGate = deferred();
    const retrySeen = deferred();
    let openingRequests = 0;
    let continuationRequests = 0;
    await run('500 errors support explicit retry and duplicate clicks cannot duplicate chapters', async (page, requests) => {
      await prepareOpening(page, 'AIQA重试');
      await page.getByRole('button', { name: '进入第一章', exact: true }).dblclick();
      await openingSeen.promise;
      assert.equal(openingRequests, 1);
      assert.equal(await page.getByRole('button', { name: '正在翻开…', exact: true }).isEnabled(), false);
      openingGate.resolve();
      await page.getByRole('status').filter({ hasText: '这一章暂时没能接上' }).waitFor();
      assert.equal((await library(page)).stories.length, 0);
      await page.getByRole('button', { name: '进入第一章', exact: true }).click();
      await position(page, 1);
      await savedChapters(page, 2);
      assert.equal(openingRequests, 2);
      assert.equal(requests[0].story.id, requests[1].story.id, 'retry reuses the opening idempotency key');
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 2);
      await page.getByRole('group', { name: '剧情选择' }).getByRole('button').first().click();
      await page.getByRole('button', { name: '重试下一章', exact: true }).waitFor();
      assert.equal(continuationRequests, 1);
      await page.getByRole('button', { name: '重试下一章', exact: true }).dblclick();
      await retrySeen.promise;
      assert.equal(continuationRequests, 2);
      assert.equal(await page.getByRole('button', { name: '下一章准备中…', exact: true }).isEnabled(), false);
      retryGate.resolve();
      await savedChapters(page, 3);
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 3);
      const saved = await library(page);
      assert.equal(saved.stories.length, 1);
      assert.equal(saved.stories[0].chapters.filter(chapter => chapter.index === 2).length, 1);
    }, async request => {
      if (request.index === 0 && ++openingRequests === 1) {
        openingSeen.resolve(); await openingGate.promise;
        return { status: 500, body: { error: 'test opening failure' } };
      }
      if (request.index === 2) {
        continuationRequests += 1;
        if (continuationRequests === 1) return { status: 500, body: { error: 'test continuation failure' } };
        if (continuationRequests === 2) { retrySeen.resolve(); await retryGate.promise; }
      }
    });

    const cancelGate = deferred();
    const cancelSeen = deferred();
    let cancelRequests = 0;
    await run('cancel opening discards late content and a later retry creates exactly one book', async page => {
      await prepareOpening(page, 'AIQA取消');
      await page.getByRole('button', { name: '进入第一章', exact: true }).click();
      await cancelSeen.promise;
      await page.getByRole('button', { name: '取消等待', exact: true }).click();
      cancelGate.resolve();
      await page.getByRole('button', { name: '进入第一章', exact: true }).waitFor();
      assert.equal((await library(page)).stories.length, 0);
      assert.equal((await library(page)).draft.name, 'AIQA取消');
      await page.getByRole('button', { name: '进入第一章', exact: true }).click();
      await position(page, 1);
      await savedChapters(page, 2);
      assert.equal((await library(page)).stories.length, 1);
    }, async request => {
      if (request.index === 0 && ++cancelRequests === 1) { cancelSeen.resolve(); await cancelGate.promise; }
    });

    const oldBranchGate = deferred();
    const oldBranchSeen = deferred();
    const oldRefreshGate = deferred();
    const oldRefreshSeen = deferred();
    let fourthRequests = 0;
    await run('late branch responses stay discarded and reload resumes a missing prefetch', async page => {
      await openBook(page, 'AIQA改选');
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 2);
      await page.getByRole('group', { name: '剧情选择' }).getByRole('button').first().click();
      await oldBranchSeen.promise;
      await page.getByRole('button', { name: '改选', exact: true }).click();
      await page.getByRole('group', { name: '剧情选择' }).getByRole('button').nth(1).click();
      await savedChapters(page, 3);
      oldBranchGate.resolve();
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 3);
      await oldRefreshSeen.promise;
      assert.match(await page.locator('.reader-article').innerText(), /BRANCH_wait_none/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await position(page, 3);
      await savedChapters(page, 4);
      oldRefreshGate.resolve();
      const saved = (await library(page)).stories[0];
      assert.equal(saved.choices[1], 'wait');
      assert.equal(saved.chapters.length, 4);
      assert.match(saved.chapters[2].paragraphs[1], /BRANCH_wait_none/);
      assert.match(saved.chapters[3].paragraphs[1], /BRANCH_wait_none/);
      assert.equal(saved.readerIndex, 2);
      assert.equal(fourthRequests, 2);
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 4);
      await page.getByRole('group', { name: '剧情选择' }).waitFor();
    }, async request => {
      if (request.index === 2 && request.story.choices[1] === 'open') { oldBranchSeen.resolve(); await oldBranchGate.promise; }
      if (request.index === 3 && ++fourthRequests === 1) { oldRefreshSeen.resolve(); await oldRefreshGate.promise; }
    });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(artifactDir, 'gemini-results.json'), `${JSON.stringify({ targetUrl, generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  }
  const failed = results.filter(result => result.status === 'failed').length;
  console.log(`\n${results.length - failed}/${results.length} mocked Gemini scenarios passed. Artifacts: ${artifactDir}`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
