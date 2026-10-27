// Generation-control batch e2e: the HTTP boundary is mocked exactly like
// gemini.cjs (no network, no paid generation). Flow: open a Gemini book →
// ch.2 prepared → stand on ch.2 while the ch.3 pre-generation is held at
// a gate → re-roll ch.2 (frontier) → edit ch.2's prose → release the gate:
// the stale ch.3 answer is discarded and the fresh ch.3 request carries
// the edited tail → switch the style preset in the 设定集 → the next
// request carries the preset in its story config. Ch.1 must stay
// byte-identical throughout. Screenshots land in control-shots/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const targetUrl = process.env.TARGET_URL || 'http://localhost:5173';
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const shotsDir = path.resolve(__dirname, '../control-shots');
const storageKey = 'storyweave:v2';
const EDITED = 'EDITED_TAIL：阿遥亲手改过的第二章结尾——守灯人把那封信推回她手里，说，烧了吧。';
fs.mkdirSync(artifactDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function library(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function activeStory(page) {
  const saved = await library(page);
  return saved.stories.find(story => story.id === saved.activeStoryId);
}

async function position(page, chapter) {
  await page.waitForFunction(
    expected => document.querySelector('[role="progressbar"][aria-label="阅读进度"]')?.getAttribute('aria-valuenow') === String(expected),
    chapter,
  );
}

async function savedChapters(page, count) {
  await page.waitForFunction(({ key, count }) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved?.stories.find(story => story.id === saved.activeStoryId)?.chapters.length === count;
  }, { key: storageKey, count });
}

(async () => {
  const { buildChapter, chapterKey } = await import(pathToFileURL(path.resolve(__dirname, '../src/story-engine.js')).href);
  const resultFor = request => {
    const { story, index, mode } = request;
    if (mode === 'reroll') {
      return {
        key: chapterKey(story, index),
        chapter: {
          ...buildChapter(story, index),
          title: `REROLLED_CHAPTER_${index}`,
          paragraphs: [
            `REROLLED_CHAPTER_${index}：换过一版的正文，${story.config.name}在雾里听见了另一种钟声。`,
            '这一版里，守灯人提前说出了那句警告，潮水的方向也跟着变了。',
          ],
          summary: `换版后的第 ${index + 1} 章，${story.config.name}听见另一种钟声。`,
        },
      };
    }
    return {
      key: chapterKey(story, index),
      chapter: {
        ...buildChapter(story, index),
        title: `MOCK_CHAPTER_${index}`,
        paragraphs: [
          `MOCK_CHAPTER_${index}：${story.config.name}看见一条纸鲸游过夜空。`,
          '这些句子来自模拟模型响应，必须原样保存在书里。',
        ],
        summary: `模型第 ${index + 1} 章，${story.config.name}跟随纸鲸继续前进。`,
      },
      ...(index === 0 ? { worldBible: { ...story.worldBible, premise: `${story.config.name}与纸鲸同行的世界。` } } : {}),
    };
  };

  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const requests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(12000);

  const thirdGate = deferred();
  const thirdSeen = deferred();
  await context.route('**/api/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ configured: true, provider: 'gemini' }),
  }));
  await context.route('**/api/generate', async route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    if (request.mode !== 'reroll' && request.index === 2) {
      // Every pre-generation attempt for chapter three is held in
      // flight: navigating away and back legitimately re-requests (the
      // earlier signal is aborted client-side), and chapter two must
      // stay the frontier while the owner directs it.
      thirdSeen.resolve();
      await thirdGate.promise;
    }
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resultFor(request)) });
    } catch {
      // Aborted interceptions (the reader cancels superseded passes)
      // need no answer.
    }
  });

  let firstChapterBefore;
  try {
    // Open a Gemini book and stand on chapter two.
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name: '造世', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.locator('.world-grid').getByRole('button', { name: /沉潮港/ }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByLabel('主角昵称（选填）').fill('控制测试旅人');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    const mode = page.getByRole('group', { name: '故事方式' }).getByRole('button', { name: 'Gemini 创作' });
    await mode.waitFor();
    assert.equal(await mode.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '进入第一章', exact: true }).click();
    await position(page, 1);
    await savedChapters(page, 2);
    firstChapterBefore = structuredClone((await activeStory(page)).chapters[0]);

    await page.getByRole('button', { name: '下一章', exact: true }).click();
    await position(page, 2);
    await thirdSeen.promise;

    await check('the frontier chapter offers 换一版 and 编辑正文； earlier chapters offered neither', async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: '换一版', exact: true }).waitFor();
      await page.getByRole('button', { name: '编辑正文', exact: true }).waitFor();
      await page.screenshot({ path: path.join(shotsDir, '01-frontier-actions.png') });
      await page.getByRole('button', { name: '上一章', exact: true }).click();
      await position(page, 1);
      assert.equal(await page.getByRole('button', { name: '换一版', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '编辑正文', exact: true }).count(), 0);
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 2);
    });

    await check('re-roll replaces the frontier chapter and leaves chapter one untouched', async () => {
      const secondBefore = structuredClone((await activeStory(page)).chapters[1]);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.getByRole('button', { name: '换一版', exact: true }).click();
      await page.getByRole('button', { name: '确认换掉这一版', exact: true }).click();
      await page.waitForFunction(key => {
        const saved = JSON.parse(localStorage.getItem(key));
        const story = saved?.stories.find(item => item.id === saved.activeStoryId);
        return story?.chapters[1]?.title === 'REROLLED_CHAPTER_1';
      }, storageKey);
      const story = await activeStory(page);
      assert.notDeepEqual(story.chapters[1].paragraphs, secondBefore.paragraphs);
      assert.deepEqual(story.chapters[0], firstChapterBefore, 'chapter one is byte-identical');
      const reroll = requests.find(request => request.mode === 'reroll');
      assert.ok(reroll, 'a mode=reroll request was posted');
      assert.equal(reroll.index, 1);
      await page.locator('.intervention-overlay').waitFor({ state: 'detached', timeout: 20000 });
    });

    await check('prose editing saves the owner\u2019s words into the chapter record', async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.getByRole('button', { name: '编辑正文', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '编辑正文 · 本章' });
      await dialog.waitFor();
      await page.screenshot({ path: path.join(shotsDir, '02-prose-editor.png') });
      await dialog.getByLabel('正文第 1 段').fill(EDITED);
      await dialog.getByRole('button', { name: '保存正文', exact: true }).click();
      await page.waitForFunction(({ key, marker }) => {
        const saved = JSON.parse(localStorage.getItem(key));
        const story = saved?.stories.find(item => item.id === saved.activeStoryId);
        return story?.chapters[1]?.paragraphs[0]?.includes(marker);
      }, { key: storageKey, marker: 'EDITED_TAIL' });
      assert.deepEqual((await activeStory(page)).chapters[0], firstChapterBefore);
    });

    await check('releasing the gate discards the stale answers; the fresh request carries the edited tail', async () => {
      thirdGate.resolve();
      await savedChapters(page, 3);
      const thirdRequests = requests.filter(request => request.mode !== 'reroll' && request.index === 2);
      assert.ok(thirdRequests.length >= 2, 'superseded attempts were made and discarded');
      assert.ok(
        !thirdRequests[0].story.chapters[1].paragraphs[0].includes('EDITED_TAIL'),
        'the first attempt predates the edit',
      );
      assert.ok(
        thirdRequests.at(-1).story.chapters[1].paragraphs[0].includes('EDITED_TAIL'),
        'the edited tail rides into the next chapter\u2019s brief',
      );
      assert.deepEqual((await activeStory(page)).chapters[0], firstChapterBefore);
    });

    await check('switching the preset in the 设定集 rides into the next generation request', async () => {
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 3);
      await savedChapters(page, 4);
      const fourth = requests.filter(request => request.mode !== 'reroll' && request.index === 3).at(-1);
      assert.equal(fourth.story.config.stylePreset ?? 'default', 'default');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: '设定集', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '设定集' });
      await dialog.waitFor();
      const presetRow = dialog.getByRole('radio', { name: /紧凑爽快/ });
      await presetRow.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(shotsDir, '03-preset-picker.png') });
      await presetRow.click();
      await dialog.getByRole('button', { name: '保存设定集', exact: true }).click();
      await page.waitForFunction(key => {
        const saved = JSON.parse(localStorage.getItem(key));
        const story = saved?.stories.find(item => item.id === saved.activeStoryId);
        return story?.config.stylePreset === 'compact';
      }, storageKey);
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await position(page, 4);
      await savedChapters(page, 5);
      const fifth = requests.filter(request => request.mode !== 'reroll' && request.index === 4).at(-1);
      assert.equal(fifth.story.config.stylePreset, 'compact', 'the next request carries the dialled preset');
      assert.deepEqual((await activeStory(page)).chapters[0], firstChapterBefore, 'chapter one survived every lever untouched');
    });

    assert.deepEqual(pageErrors, []);
  } catch (error) {
    failures.push(`suite: ${error.message}`);
    console.error(`FAIL suite: ${error.message}`);
    await page.screenshot({ path: path.join(artifactDir, 'control-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    thirdGate.resolve();
    await context.close();
    await browser.close();
  }
  console.log(`\n${results.length - results.filter(r => r.status === 'failed').length}/${results.length} control checks passed. Shots: ${shotsDir}`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
