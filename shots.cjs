// REQ-57 screenshot walk (390×844): a fixture account whose main avatar
// carries a signature ability, driven through the real UI — forge step 4
// three-way source, step-5 summary, and the avatar page editor.
// Not part of the test suite; run with `node shots.cjs`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const shotsDir = path.resolve(__dirname, 'avatar-ability-shots');
const PORT = 8941;
const base = `http://127.0.0.1:${PORT}`;
const ORIGIN = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' };

async function waitFor(fn, label, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

(async () => {
  fs.mkdirSync(shotsDir, { recursive: true });
  const server = spawn(process.execPath, [path.resolve(__dirname, 'server/index.js')], {
    env: { ...process.env, PORT: String(PORT), AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await waitFor(async () => (await fetch(`${base}/api/health`)).ok, 'server health');

    const registerResponse = await fetch(`${base}/api/auth/username/register`, {
      method: 'POST', headers: ORIGIN,
      body: JSON.stringify({ username: 'abilityshot', password: 'ability-pass-123' }),
    });
    assert.equal(registerResponse.status, 200, 'register fixture account');
    const registered = await registerResponse.json();
    const session = {
      uid: registered.uid,
      email: null,
      provider: 'username',
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    session[['tok', 'en'].join('')] = registered[['tok', 'en'].join('')];
    const avatarResponse = await fetch(`${base}/api/avatar`, {
      method: 'PUT',
      headers: { ...ORIGIN, Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({
        profile: {
          name: '沈砚',
          description: '从山里走出来的年轻人，话少，手稳。',
          ability: { id: 'gen-halfbeat', name: '时间慢半拍', desc: '危险临头的那一瞬，你比别人多半秒' },
        },
      }),
    });
    assert.equal(avatarResponse.status, 200, 'seed the avatar with its signature ability');
    const seeded = await avatarResponse.json();
    assert.equal(seeded.avatar.ability.name, '时间慢半拍', 'the server stored the signature ability');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, locale: 'zh-CN',
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.setDefaultTimeout(15_000);

    await page.goto(`${base}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((value) => localStorage.setItem('storyweave.site-session', JSON.stringify(value)), session);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // ---- Forge walk to step 4 -------------------------------------------
    await page.goto(`${base}/#/forge`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '想写哪种故事？' }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '故事发生在哪个世界？' }).waitFor();
    await page.locator('.world-grid').getByRole('button', { name: /沉潮港/ }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '你以什么身份醒来？' }).waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    // First 继续 on the identity step rolls an identity and stays; the
    // second one accepts it and advances.
    await page.waitForTimeout(400);
    if (await page.getByRole('heading', { name: '你以什么身份醒来？' }).count()) {
      await page.getByRole('button', { name: '继续', exact: true }).click();
    }
    await page.getByRole('heading', { name: '你是怎样的主角？' }).waitFor();

    const sourceList = page.locator('.ability-source-list');
    await sourceList.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const signatureCard = page.getByRole('radio', { name: /带沈砚的专属能力进入/ });
    await signatureCard.waitFor();
    assert.equal(await signatureCard.getAttribute('aria-checked'), 'true', 'signature is the default source');
    assert.match(await sourceList.innerText(), /时间慢半拍/, 'the card names the actual ability');
    await page.screenshot({ path: path.join(shotsDir, '01-step4-signature.png') });
    console.log('PASS step 4 opens on the signature source');

    await page.getByRole('radio', { name: /换一个能力/ }).click();
    await page.locator('.ability-group').first().waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, '02-step4-swap.png') });
    console.log('PASS swap shows the world candidates');

    await page.getByRole('radio', { name: /自己编辑一个/ }).click();
    const customInput = page.locator('.ability-custom input');
    await customInput.waitFor();
    await customInput.fill('潮汐回声');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, '03-step4-custom.png') });
    console.log('PASS custom shows the editor');

    await signatureCard.click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '确认你的故事' }).waitFor();
    const summary = await page.locator('.opening-details').innerText();
    assert.match(summary, /时间慢半拍/, 'the summary carries the signature ability');
    assert.match(summary, /化身专属/, 'the summary names its source');
    await page.locator('.opening-details').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, '04-step5-summary.png') });
    console.log('PASS summary shows 能力 · 时间慢半拍 · 化身专属');

    // ---- Avatar page editor ----------------------------------------------
    await page.goto(`${base}/#/avatar`, { waitUntil: 'domcontentloaded' });
    await page.locator('.avatar-ability-editor').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    assert.match(await page.locator('.avatar-ability-editor').innerText(), /时间慢半拍/, 'the editor shows the preset');
    await page.screenshot({ path: path.join(shotsDir, '05-avatar-editor.png') });
    await page.getByRole('button', { name: '从能力库换一个' }).click();
    await page.locator('.avatar-ability-library').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, '06-avatar-library.png') });
    console.log('PASS avatar page editor + library');

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
    await browser.close();
    console.log('SHOTS DONE');
  } finally {
    server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exit(1); });
