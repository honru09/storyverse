// BILLING e2e — one chain, HTTP level, against an in-process server
// (memory stores, fixture caps): register → generate a chapter → the
// cost record is in the ledger → the free ceiling blocks → the
// official mints a pack code → redeem → one more chapter rides the
// credit → mint + redeem a month card → the member state and the
// raised ceiling both hold. Run: node e2e/billing.cjs
const assert = require('node:assert/strict');
const { once } = require('node:events');

const results = [];
async function check(name, action) {
  try {
    await action();
    results.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function main() {
  const { createServer } = await import('../server/index.js');
  const { createAuthService } = await import('../server/auth.js');
  const { createUsernameAuthService } = await import('../server/username-auth.js');
  const { createEmailCodeService } = await import('../server/email-code.js');
  const { createMemoryIdentityStore } = await import('../server/identity-store.js');
  const { createBillingService, createMemoryBillingStore } = await import('../server/billing.js');

  const identityStore = createMemoryIdentityStore();
  const mailer = { configured: false, sendCode: async () => {}, sendRecoveryCode: async () => {} };
  const usernameAuth = createUsernameAuthService({ env: { AUTH_ENABLED: 'true' }, store: identityStore, mailer, log: () => {} });
  const emailCode = createEmailCodeService({ env: {}, store: identityStore, mailer, log: () => {} });
  const auth = createAuthService({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory', GENERATION_DAILY_TOKEN_CAP: '1000' },
    usernameAuth, emailCode,
  });
  const billingStore = createMemoryBillingStore();
  const billing = createBillingService({ env: { MEMBER_DAILY_TOKEN_CAP: '100000' }, store: billingStore, log: () => {} });
  const generator = {
    status: () => ({ configured: true, provider: 'gemini', model: 'gemini-3.8-flash' }),
    generate: async (body) => ({
      chapter: { id: `ch-${body.index}`, index: body.index, title: 't', paragraphs: ['x'] },
      key: 'fixture-key',
      usage: { promptTokenCount: 600, candidatesTokenCount: 300, thoughtsTokenCount: 100, totalTokenCount: 1000 },
    }),
  };
  const server = createServer({
    env: { AUTH_ENABLED: 'true', DATA_STORE: 'memory' },
    auth, generator, billing,
    fetchImpl: async () => { throw new Error('no external requests in the billing chain'); },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const ORIGIN = { Origin: 'http://localhost:5173' };
  const post = async (path, token, body) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, json: await response.json().catch(() => ({})) };
  };
  const get = async (path, token) => {
    const response = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, json: await response.json().catch(() => ({})) };
  };
  const register = async (username) => {
    const { status, json } = await post('/api/auth/username/register', null, { username, password: 'password-123' });
    assert.equal(status, 200, `register ${username}`);
    return json.token;
  };
  const story = { id: 'story-chain', kind: 'solo', readerIndex: 0, chapters: [] };

  try {
    const token = await register('chain_reader');
    const official = await register('storyweave');

    await check('generate a chapter', async () => {
      const { status } = await post('/api/generate', token, { story, index: 0 });
      assert.equal(status, 200);
    });
    await check('the cost record landed in the ledger', async () => {
      const records = await billingStore.listCostRecords();
      assert.equal(records.length, 1);
      assert.equal(records[0].kind, 'text');
      assert.equal(records[0].scene, 'chapter');
      assert.equal(records[0].totalTokens, 1000);
      assert.ok(records[0].costCny > 0);
    });
    await check('the free ceiling blocks the next chapter', async () => {
      const { status, json } = await post('/api/generate', token, { story, index: 1 });
      assert.equal(status, 429);
      assert.equal(json.code, 'quota-exceeded');
    });
    let packCode;
    await check('the official mints a pack code', async () => {
      const { status, json } = await post('/api/billing/codes', official, { productId: 'pack-6', count: 1 });
      assert.equal(status, 200);
      packCode = json.codes[0];
      assert.match(packCode, /^ZJ-/);
    });
    await check('redeeming the pack credits the account', async () => {
      const { status, json } = await post('/api/billing/redeem', token, { code: packCode });
      assert.equal(status, 200);
      assert.equal(json.entitlements.chapterCredits, 20);
    });
    await check('one more chapter rides the credit', async () => {
      const { status } = await post('/api/generate', token, { story, index: 1 });
      assert.equal(status, 200);
      const me = await get('/api/billing/me', token);
      assert.equal(me.json.chapterCredits, 19);
      const creditRecord = (await billingStore.listCostRecords()).find((record) => record.creditUsed);
      assert.ok(creditRecord, 'credit spend is marked in the ledger');
    });
    await check('a month card turns membership on and the ceiling rises', async () => {
      const minted = await post('/api/billing/codes', official, { productId: 'member-month', count: 1 });
      const { status } = await post('/api/billing/redeem', token, { code: minted.json.codes[0] });
      assert.equal(status, 200);
      const me = await get('/api/billing/me', token);
      assert.equal(me.json.member.active, true);
      assert.equal(me.json.stripeEnabled, false);
      const next = await post('/api/generate', token, { story, index: 2 });
      assert.equal(next.status, 200);
      const after = await get('/api/billing/me', token);
      assert.equal(after.json.chapterCredits, 19, 'member generations do not spend credits');
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((result) => result.status === 'failed');
  console.log(failed.length ? `BILLING E2E: ${failed.length} FAILED` : 'BILLING E2E: ALL PASS');
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
