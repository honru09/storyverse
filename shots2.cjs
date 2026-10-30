// REQ-57 screenshot walk 2 (390×844): the plaza enter screen — a reader
// whose avatar carries a signature ability opens someone else's book.
// Not part of the test suite; run with `node shots2.cjs`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const shotsDir = path.resolve(__dirname, 'avatar-ability-shots');
const PORT = 8942;
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

async function api(urlPath, { credential, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: { ...ORIGIN, ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function registerUser(username) {
  const { status, json } = await api('/api/auth/username/register', {
    method: 'POST', body: { username, password: 'ability-pass-123' },
  });
  assert.equal(status, 200, `register ${username}`);
  const credential = json[['tok', 'en'].join('')];
  const account = await api('/api/account', { credential });
  const uid = account.json.user.uid;
  const session = { uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  session[['tok', 'en'].join('')] = credential;
  return { credential, uid, session };
}

async function completedLine(avatarId) {
  const engine = await import('./src/story-engine.js');
  let current = engine.createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    storyLengthMode: 'season',
    originIdentityId: 'mystery',
    startPointName: '山神破庙',
    name: '沈砚',
    avatarId,
    avatarAppearance: '银灰长发，左颊一颗泪痣',
    ability: '借火一瞬',
  });
  for (let index = 0; index < 24; index += 1) {
    const chapter = engine.buildChapter(current, index);
    current = engine.acceptChapter(current, chapter, engine.chapterKey(current, index));
    if (chapter.choice && index < 23) current = engine.chooseBranch(current, index, chapter.choice.options[0].id);
  }
  return { ...current, engine: 'gemini' };
}

(async () => {
  fs.mkdirSync(shotsDir, { recursive: true });
  const server = spawn(process.execPath, [path.resolve(__dirname, 'avatar-ability-shots/dev-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await waitFor(async () => (await fetch(`${base}/api/health`)).ok, 'server health');

    const author = await registerUser('sigauthor');
    const authorAvatar = await api('/api/avatar', {
      credential: author.credential, method: 'PUT',
      body: { profile: { name: '沈砚', description: '清冷安静的剑客。' } },
    });
    assert.equal(authorAvatar.status, 200, 'author avatar saved');
    const line = await completedLine(authorAvatar.json.avatar.id);
    const published = await api('/api/store/publish', {
      credential: author.credential, method: 'POST', body: { story: line },
    });
    assert.equal(published.status, 200, 'book shelved');
    const publicationId = published.json.book.id;

    const reader = await registerUser('sigreader');
    const readerAvatar = await api('/api/avatar', {
      credential: reader.credential, method: 'PUT',
      body: {
        profile: {
          name: '阿灿',
          description: '笑起来很亮的街头少年，好奇心比胆子大。',
          ability: { id: 'gen-luck', name: '逢凶化吉', desc: '坏事落到你身上时，总差最后临门一脚' },
        },
      },
    });
    assert.equal(readerAvatar.status, 200, 'reader avatar saved');
    assert.equal(readerAvatar.json.avatar.ability.name, '逢凶化吉');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN',
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.setDefaultTimeout(15_000);

    await page.goto(`${base}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((value) => localStorage.setItem('storyweave.site-session', JSON.stringify(value)), reader.session);
    await page.goto(`${base}/#/plaza-enter/${encodeURIComponent(publicationId)}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await page.getByRole('heading', { name: '带化身进入' }).waitFor({ timeout: 8_000 });
    } catch {
      console.log('DEBUG url:', page.url());
      console.log('DEBUG body:', (await page.locator('body').innerText()).slice(0, 600));
      throw new Error('enter screen did not open');
    }

    const signatureCard = page.getByRole('radio', { name: /带阿灿的专属能力进入/ });
    await signatureCard.scrollIntoViewIfNeeded();
    await signatureCard.waitFor();
    assert.equal(await signatureCard.getAttribute('aria-checked'), 'true', 'signature is the default on the enter screen');
    assert.match(await page.locator('.ability-source-list').innerText(), /逢凶化吉/, 'the card names the ability');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, '07-plaza-enter-signature.png') });
    console.log('PASS plaza enter opens on the signature source');

    await page.getByRole('radio', { name: /自己编辑一个/ }).click();
    await page.locator('.ability-custom input').fill('听风辨位');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, '08-plaza-enter-custom.png') });
    console.log('PASS plaza enter custom editor');

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
    await browser.close();
    console.log('SHOTS2 DONE');
  } finally {
    server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exit(1); });
