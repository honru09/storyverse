// Friends e2e: the whole handshake on the real UI.
//   A. Aya opens her own page, finds Ben by username search, sends a
//      friend request with a note; the row lands on 申请中.
//   B. Ben sees the request in his message centre （互动： 想加你为好友
//      + the note), answers it from his own 好友区， and Aya appears
//      in his friend list.
//   C. Back as Aya, Ben now stands in her friend list too — the
//      friendship is mutual, from both sides of the glass.
// Runs against the cloud-library fixture server (real server, memory
// stores, username sign-in), spawned automatically unless TARGET_URL
// points at an already-running instance of it.
//   node e2e/friends.cjs
//   TARGET_URL=http://127.0.0.1:8933 node e2e/friends.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const shotsDir = path.join(repoRoot, 'friends-shots');
const FIXTURE_PORT = 8933;
const AYA = 'e2e_friend_aya';
const BEN = 'e2e_friend_ben';
const NOTE = '在广场读到你的线，一起走下一条吧。';

async function waitFor(check, label, timeoutMs = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function api(base, route, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function registerUser(base, username) {
  const { status, json } = await api(base, '/api/auth/username/register', {
    method: 'POST', body: { username, password: 'friends-e2e-pass-1' },
  });
  assert.equal(status, 200, `register ${username}`);
  assert.ok(json.token && json.uid, 'register returns a session token and uid');
  return {
    token: json.token,
    uid: json.uid,
    session: {
      token: json.token,
      uid: json.uid,
      email: null,
      provider: 'username',
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
  };
}

async function startFixtureServer() {
  if (process.env.TARGET_URL) return { base: process.env.TARGET_URL, child: null };
  const child = spawn(process.execPath, [path.join(repoRoot, 'cloud-library-shots', 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(FIXTURE_PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${FIXTURE_PORT}`;
  await waitFor(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  }, 'fixture server health', 30_000);
  return { base, child };
}

async function openOwnProfile(browser, base, user) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/#/plaza`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((sessionValue) => {
    localStorage.setItem('storyweave.site-session', JSON.stringify(sessionValue));
  }, user.session);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '我的主页', exact: true }).click();
  await page.locator('.friends-sec').waitFor({ timeout: 15_000 });
  return { context, page, errors };
}

async function main() {
  fs.mkdirSync(shotsDir, { recursive: true });
  const results = [];
  const { base, child } = await startFixtureServer();
  let browser;
  try {
    const aya = await registerUser(base, AYA);
    const ben = await registerUser(base, BEN);
    browser = await chromium.launch();

    // ——— A: Aya finds Ben and asks ———
    const walkA = await openOwnProfile(browser, base, aya);
    const pageA = walkA.page;
    const friendsSecA = pageA.locator('.friends-sec');
    await friendsSecA.getByRole('tab', { name: '找朋友' }).click();
    await friendsSecA.getByLabel('按用户名找人').fill('friend_ben');
    await friendsSecA.getByRole('button', { name: /搜索/ }).click();
    const benRow = friendsSecA.locator('.profile-connection-row', { hasText: BEN });
    await benRow.waitFor({ timeout: 15_000 });
    await pageA.screenshot({ path: path.join(shotsDir, '01-search-390.png') });
    results.push('A: username search finds Ben with a public card and an 加好友 action');

    await benRow.getByRole('button', { name: '加好友' }).click();
    await friendsSecA.getByLabel('好友申请留言').fill(NOTE);
    await friendsSecA.getByRole('button', { name: '发送' }).click();
    await friendsSecA.getByText('好友申请已发出。').waitFor({ timeout: 10_000 });
    await benRow.getByText('申请中').waitFor({ timeout: 10_000 });
    results.push('A: the request is sent with its note; the row stands at 申请中');
    assert.deepEqual(walkA.errors, [], 'no page errors during Aya’s walk');

    // ——— B: Ben is reminded in 互动， answers from his 好友区 ———
    const walkB = await openOwnProfile(browser, base, ben);
    const pageB = walkB.page;
    await pageB.getByRole('button', { name: /消息/ }).first().click();
    const notifyPanel = pageB.locator('.notify-panel');
    await notifyPanel.getByText('想加你为好友').waitFor({ timeout: 15_000 });
    await notifyPanel.getByText(`「${NOTE}」`).waitFor({ timeout: 10_000 });
    results.push('B: the request reminds Ben in 互动 with the note attached');
    await pageB.keyboard.press('Escape');

    const friendsSecB = pageB.locator('.friends-sec');
    await friendsSecB.getByRole('tab', { name: /申请/ }).click();
    const ayaRequest = friendsSecB.locator('.friend-request-block', { hasText: AYA });
    await ayaRequest.waitFor({ timeout: 10_000 });
    await ayaRequest.getByText(`「${NOTE}」`).waitFor({ timeout: 10_000 });
    await pageB.screenshot({ path: path.join(shotsDir, '02-requests-390.png') });
    results.push('B: the request waits in Ben’s 申请 list with the note');

    await ayaRequest.getByRole('button', { name: '同意' }).click();
    await friendsSecB.getByText(`你和 ${AYA} 已经是好友了。`).waitFor({ timeout: 10_000 });
    await friendsSecB.getByRole('tab', { name: '好友' }).click();
    await friendsSecB.locator('.profile-connection-row', { hasText: AYA }).waitFor({ timeout: 10_000 });
    await pageB.screenshot({ path: path.join(shotsDir, '03-friends-390.png') });
    results.push('B: after 同意， Aya stands in Ben’s friend list');
    assert.deepEqual(walkB.errors, [], 'no page errors during Ben’s walk');
    await walkB.context.close();

    // ——— C: the friendship is mutual on Aya’s side too ———
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    const friendsSecA2 = pageA.locator('.friends-sec');
    await friendsSecA2.waitFor({ timeout: 15_000 });
    await friendsSecA2.locator('.profile-connection-row', { hasText: BEN }).waitFor({ timeout: 10_000 });
    results.push('C: Ben stands in Aya’s friend list — mutual from both sides');
    assert.deepEqual(walkA.errors, [], 'no page errors during Aya’s return');
    await walkA.context.close();

    for (const line of results) console.log(`  ✓ ${line}`);
    console.log(`friends e2e: ${results.length} checks passed`);
  } finally {
    await browser?.close().catch(() => {});
    if (child) child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
