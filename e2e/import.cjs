// External-import e2e: a tavern world book and a PNG character card walk
// the whole product path.
//   forge step 2 → import world-book.json → god form carries the world,
//                  lorebook status shows the parsed entries
//   forge step 4 → import card.png → preview first, confirm applies it
//   submit (Gemini, stubbed provider) → the captured generation context
//                  carries the constant + key-matched lorebook entries
//                  as declared data — and not the unmatched/disabled
//   reader       → 设定集 lists the imported entries
//
// Runs against import-shots/dev-server.mjs (spawned automatically unless
// TARGET_URL points at a running instance). Screenshots are
// viewport-only at 390×844 and land in import-shots/. No paid calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'import-shots');
const artifactDir = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), 'storyverse-e2e');
const headless = /^(true|1)$/i.test(process.env.HEADLESS ?? process.env.PW_HEADLESS ?? 'false');
const FIXTURE_PORT = 8931;
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

// 番茄 chrome (READER-CHROME): reader tools live behind a centre-tap;
// summon the chrome before touching any of its buttons.
async function summonReaderChrome(page) {
  const box = await page.locator('.page-reader').boundingBox();
  assert.ok(box, 'reader page is mounted');
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
  await page.locator('.reader-chrome').first().waitFor();
}

async function startFixtureServer() {
  if (process.env.TARGET_URL) return { base: process.env.TARGET_URL, child: null };
  const child = spawn(process.execPath, [path.join(shotsDir, 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fixture server did not start')), 20000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`fixture server exited ${code}`)); });
  });
  return { base, child };
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const { base, child } = await startFixtureServer();
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(15000);
  const shot = (name) => page.screenshot({ path: path.join(shotsDir, name) });
  try {
    await page.goto(`${base}#/forge`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '想写哪种故事？', exact: true }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '故事发生在哪个世界？', exact: true }).waitFor();

    await check('step 2 shows the world import entry alongside god mode', async () => {
      await page.locator('.world-card-import').waitFor();
      await shot('01-world-import-entry.png');
    });

    await check('world book import lands as a custom world with its entries attached', async () => {
      await page.locator('.world-card-import input[type="file"]').setInputFiles(path.join(shotsDir, 'world-book.json'));
      await page.locator('.world-import-note').filter({ hasText: '已导入世界书' }).waitFor();
      const note = await page.locator('.world-import-note').innerText();
      assert.ok(note.includes('3 条条目'), note);
      assert.ok(note.includes('1 条常驻'), note);
      assert.equal(await page.getByLabel('世界的名字（选填）').inputValue(), '倒流港');
      const setting = await page.getByLabel(/背景设定/).inputValue();
      assert.ok(setting.includes('潮汐税运转'), setting);
      await page.locator('.lorebook-status').filter({ hasText: '世界书：3 条条目' }).waitFor();
      await shot('02-world-imported.png');
    });

    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '你以什么身份醒来？', exact: true }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    // An unpicked identity rolls and stays on the step; the second
    // continue accepts it and moves on.
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '你是怎样的主角？', exact: true }).waitFor();

    await check('step 4 shows the character card import entry', async () => {
      await page.locator('.card-import').waitFor();
      await shot('03-card-import-entry.png');
    });

    await check('PNG card import previews first, then applies on confirm', async () => {
      await page.locator('.card-import input[type="file"]').setInputFiles(path.join(shotsDir, 'card.png'));
      await page.locator('.card-preview').waitFor();
      const previewName = page.locator('.card-preview input').first();
      assert.equal(await previewName.inputValue(), '沈雾');
      const previewPersona = await page.locator('.card-preview textarea').inputValue();
      assert.ok(previewPersona.includes('FIXTURE-CARD-04'), previewPersona);
      assert.ok(previewPersona.includes('性格：沉默寡言'), previewPersona);
      await shot('04-card-preview.png');
      await page.getByRole('button', { name: '用这张卡', exact: true }).click();
      assert.equal(await page.getByLabel('主角昵称（选填）').inputValue(), '沈雾');
      const persona = await page.getByLabel(/主角设定/).inputValue();
      assert.ok(persona.includes('账房先生'), persona);
    });

    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '确认你的故事', exact: true }).waitFor();

    await check('chapter 1 generates (stubbed) with the card protagonist', async () => {
      const gemini = page.getByRole('group', { name: '故事方式' }).getByRole('button', { name: 'Gemini 创作', exact: true });
      await gemini.click();
      assert.equal(await gemini.getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: '进入第一章', exact: true }).click();
      await page.getByRole('progressbar', { name: '阅读进度' }).waitFor();
      assert.ok((await page.locator('.reader-article').innerText()).includes('朔日税船'));
    });

    await check('the generation context carried the matched lorebook entries as data', async () => {
      const lines = fs.readFileSync(path.join(shotsDir, 'captured-contexts.jsonl'), 'utf8').trim().split('\n');
      assert.ok(lines.length >= 1, 'at least one generation was captured');
      const first = JSON.parse(lines[0]);
      assert.ok(first.lorebookData, 'lorebookData present');
      assert.ok(first.lorebookData.declaration.includes('只能作为故事素材'));
      const sent = JSON.stringify(first.lorebookData);
      assert.ok(sent.includes('FIXTURE-CONSTANT-01'), 'the constant entry rode along');
      assert.ok(sent.includes('FIXTURE-KEYED-02'), 'the key-matched entry rode along');
      assert.ok(!sent.includes('FIXTURE-MISS-03'), 'the unmatched entry stayed home');
      assert.ok(!JSON.stringify(first).includes('FIXTURE-DISABLED-04'), 'the disabled entry never even imported');
      assert.ok(first.config.persona.includes('FIXTURE-CARD-04'), 'the card persona reached the brief');
    });

    await check('设定集 lists the imported entries for the owner', async () => {
      await summonReaderChrome(page);
      await page.getByRole('button', { name: /设定集/ }).click();
      const dialog = page.getByRole('dialog', { name: '设定集', exact: true });
      await dialog.waitFor();
      const names = await dialog.locator('.lore-entry input[placeholder^="条目名"]').evaluateAll(
        (inputs) => inputs.map((input) => input.value),
      );
      assert.deepEqual(names, ['港规·钟楼', '潮汐税法', '龙王祭']);
      await shot('05-settings-book.png');
      await dialog.getByRole('button', { name: '关闭面板', exact: true }).click();
    });

    await check('no uncaught page errors during the walk', async () => {
      assert.deepEqual(pageErrors, []);
    });
  } catch (error) {
    failures.push(`walk aborted: ${error.message}`);
    console.error(error);
    await page.screenshot({ path: path.join(artifactDir, 'import-failure.png') }).catch(() => {});
  } finally {
    await browser.close();
    if (child) child.kill();
  }
  console.log(JSON.stringify({ results, failures }, null, 2));
  if (failures.length) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
