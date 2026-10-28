// Storage failures are injected only into isolated test browser contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const targetUrl = process.env.TARGET_URL || 'http://localhost:5173';
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const storageKey = 'storyweave:v2';
const results = [];
fs.mkdirSync(artifactDir, { recursive: true });

async function readLibrary(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function createBook(page, name) {
  // Backup is now reachable without leaving the reader. Navigate explicitly
  // rather than relying on the old toolbar visibility to do it for this test.
  if (!(await page.getByRole('navigation', { name: '移动端主导航' }).isVisible())) {
    await page.getByRole('button', { name: '我的世界', exact: true }).click();
  }
  await page.getByRole('navigation', { name: '移动端主导航' }).getByRole('button', { name: '造世', exact: true }).click();
  // PHONE-FIX J keeps the forge view alive: after a finished creation it
  // still shows that creation's confirmation screen instead of step one.
  // A returning user taps the 题材 step chip to start over — do the same
  // when the confirmation screen is what greets us.
  const confirmHeading = page.getByRole('heading', { name: '确认你的故事', exact: true });
  await confirmHeading.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
  if (await confirmHeading.isVisible()) {
    await page.getByRole('button', { name: '第 1 步：题材', exact: true }).click();
  }
  // Walk forward until the protagonist form shows instead of counting
  // taps: a wizard restarted from its kept-alive confirmation screen
  // needs one tap less (its identity is already landed, so the merged
  // identity/spawn screen advances in a single 继续）.
  for (let taps = 0; taps < 6; taps++) {
    if (await page.getByLabel('主角昵称（选填）').count()) break;
    await page.getByRole('button', { name: '继续', exact: true }).click();
  }
  await page.getByLabel('主角昵称（选填）').fill(name);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '进入第一章', exact: true }).click();
  await page.getByRole('progressbar', { name: '阅读进度' }).waitFor();
}

async function openBackup(page) {
  // '备份与恢复' has several legitimate homes (the storage alert carries
  // its own, 主页 → 设置 has one for signed-in readers, the shelf page
  // footer has one) and the kept-alive views hold more than one of them
  // in the DOM at once, so an unscoped role lookup resolves to multiple
  // buttons and strict mode refuses the click. Always take the shelf
  // page footer's entry — the path a signed-out reader uses — scoped
  // to the footer so the click is unambiguous in every storage state.
  await page.goto(`${targetUrl}#/home`, { waitUntil: 'domcontentloaded' });
  await page.locator('footer').getByRole('button', { name: '备份与恢复', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '书架与备份' });
  await dialog.waitFor();
  return dialog;
}

async function downloadText(page, button) {
  const downloadEvent = page.waitForEvent('download');
  await button.click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function run(browser, name, action, init) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  // beforeunload is expected when intentionally testing unsaved storage.
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await action(page, context);
    results.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: path.join(artifactDir, `recovery-failure-${results.length}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
  try {
    await run(browser, 'download and confirmed restore preserve reading progress and old backup', async page => {
      await createBook(page, '备份测试旅人');
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      const saved = await readLibrary(page);
      assert.equal(saved.stories[0].readerIndex, 2);
      let dialog = await openBackup(page);
      const exported = await downloadText(page, dialog.getByRole('button', { name: '导出书架备份', exact: true }));
      assert.deepEqual(JSON.parse(exported), saved);
      await dialog.getByLabel('选择备份文件', { exact: true }).setInputFiles({
        name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken'),
      });
      await dialog.getByRole('status').filter({ hasText: '不是有效的 JSON' }).waitFor();
      assert.deepEqual(await readLibrary(page), saved);
      assert.equal(await dialog.getByRole('button', { name: '确认恢复' }).count(), 0);
      await dialog.getByLabel('选择备份文件', { exact: true }).setInputFiles({
        name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(exported),
      });
      await dialog.getByRole('button', { name: '确认恢复' }).waitFor();
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      assert.deepEqual(await readLibrary(page), saved);
      await dialog.getByRole('button', { name: '关闭面板' }).click();
      await createBook(page, '恢复前的第二位旅人');
      const beforeRestore = await page.evaluate(key => localStorage.getItem(key), storageKey);
      assert.equal(JSON.parse(beforeRestore).stories.length, 2);
      dialog = await openBackup(page);
      await dialog.getByLabel('选择备份文件', { exact: true }).setInputFiles({
        name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(exported),
      });
      await dialog.getByRole('button', { name: '确认恢复' }).click();
      await page.getByRole('button', { name: '继续阅读', exact: true }).waitFor();
      assert.deepEqual(await readLibrary(page), saved);
      assert.equal(await page.evaluate(key => localStorage.getItem(`${key}:recovery`), storageKey), beforeRestore);
      await page.getByRole('button', { name: '继续阅读', exact: true }).click();
      assert.equal(await page.getByRole('progressbar', { name: '阅读进度' }).getAttribute('aria-valuenow'), '3');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('progressbar', { name: '阅读进度' }).waitFor();
      assert.equal(await page.getByRole('progressbar', { name: '阅读进度' }).getAttribute('aria-valuenow'), '3');
    });

    await run(browser, 'corrupt original survives creating a new story and can be downloaded', async page => {
      await page.getByRole('alert').filter({ hasText: '已损坏' }).waitFor();
      await createBook(page, '临时安全旅人');
      await page.getByText('进度暂存于此页，请先备份', { exact: true }).waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), '{corrupt-original');
      const dialog = await openBackup(page);
      const original = await downloadText(page, dialog.getByRole('button', { name: '导出原始存档', exact: true }));
      assert.equal(original, '{corrupt-original');
      const current = JSON.parse(await downloadText(page, dialog.getByRole('button', { name: '导出书架备份', exact: true })));
      assert.equal(current.stories.length, 1);
      assert.equal(current.stories[0].config.name, '临时安全旅人');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), '{corrupt-original');
    }, () => {
      localStorage.setItem('storyweave:v2', '{corrupt-original');
    });

    await run(browser, 'quota failure keeps the story usable and exportable with honest save status', async page => {
      // The save-failure alert is a short-lived toast raised by the
      // first failed write, which happens during load / the creation
      // steps — long before a post-creation wait would start. Arm the
      // wait before creating the book so the toast cannot slip past.
      const quotaAlert = page.getByRole('alert').filter({ hasText: '暂时无法保存' }).waitFor();
      quotaAlert.catch(() => {});
      await createBook(page, '额度测试旅人');
      await quotaAlert;
      await page.getByText('进度暂存于此页，请先备份', { exact: true }).waitFor();
      assert.equal(await page.getByText('进度已保存在本机', { exact: true }).count(), 0);
      await page.getByRole('button', { name: '下一章', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[role="progressbar"][aria-label="阅读进度"]')?.getAttribute('aria-valuenow') === '2');
      const dialog = await openBackup(page);
      const current = JSON.parse(await downloadText(page, dialog.getByRole('button', { name: '导出书架备份', exact: true })));
      assert.equal(current.stories[0].config.name, '额度测试旅人');
      assert.equal(current.stories[0].readerIndex, 1);
      await dialog.getByRole('button', { name: '重试保存', exact: true }).click();
      await dialog.getByRole('status').filter({ hasText: '暂未保存成功' }).waitFor();
    }, () => {
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'storyweave:v2') throw new DOMException('Test quota exhausted', 'QuotaExceededError');
        return nativeSet.call(this, key, value);
      };
    });

    await run(browser, 'denied localStorage still allows temporary reading and a backup', async page => {
      await page.getByRole('alert').filter({ hasText: /无法访问本地存储|存储权限被拒绝/ }).waitFor();
      await createBook(page, '私密模式旅人');
      await page.getByText('进度暂存于此页，请先备份', { exact: true }).waitFor();
      const dialog = await openBackup(page);
      const current = JSON.parse(await downloadText(page, dialog.getByRole('button', { name: '导出书架备份', exact: true })));
      assert.equal(current.stories[0].config.name, '私密模式旅人');
    }, () => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Test storage denied', 'SecurityError'); } });
    });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(artifactDir, 'recovery-results.json'), `${JSON.stringify({ targetUrl, generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  }
  const failed = results.filter(result => result.status === 'failed').length;
  console.log(`\n${results.length - failed}/${results.length} recovery scenarios passed. Artifacts: ${artifactDir}`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
