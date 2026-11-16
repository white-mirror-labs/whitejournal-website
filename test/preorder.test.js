// Unit tests for api/preorder.js with Supabase and Resend replaced by fakes.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

function load({ existing = null, insertError = null, sendError = null, db = true, key = 'k' } = {}) {
  const calls = { inserts: [], sends: [], issues: [] };
  const supa = path.resolve(__dirname, '../api/_supabase.js');
  const resendPath = require.resolve('resend', { paths: [path.resolve(__dirname, '..')] });
  const handlerPath = path.resolve(__dirname, '../api/preorder.js');
  delete require.cache[handlerPath];
  require.cache[supa] = { id: supa, filename: supa, loaded: true, exports: {
    supabaseAdmin: () => db ? {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
        insert: async (row) => { calls.inserts.push(row); return { error: insertError }; },
      }),
    } : null,
    reportIssue: async (kind) => { calls.issues.push(kind); },
  } };
  require.cache[resendPath] = { id: resendPath, filename: resendPath, loaded: true, exports: {
    Resend: class { constructor() { this.emails = { send: async (m) => { calls.sends.push(m); return { error: sendError }; } }; } },
  } };
  if (key) process.env.RESEND_API_KEY = key; else delete process.env.RESEND_API_KEY;
  return { handler: require(handlerPath), calls };
}

function call(handler, body, method = 'POST') {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b, headers: this.headers }); return this; } };
    handler({ method, body }, res);
  });
}

const good = { name: 'Sara Ali', email: 'Sara@Example.com', phone: '+20 101 234 5678',
  product: 'physical', address: '1 Street', city: 'Giza', governorate: 'Giza', lang: 'en',
  request_id: '3f0c6c1e-6b0e-4a59-9a43-2d1c0f6f1a11' };

test('rejects GET without CORS headers', async () => {
  const { handler } = load();
  const r = await call(handler, {}, 'GET');
  assert.equal(r.code, 405);
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
});

test('honeypot answers success and stores nothing', async () => {
  const { handler, calls } = load();
  const r = await call(handler, { ...good, company: 'x' });
  assert.equal(r.code, 200);
  assert.equal(calls.inserts.length + calls.sends.length, 0);
});

test('rejects a bad phone number', async () => {
  const { handler, calls } = load();
  const r = await call(handler, { ...good, phone: '123' });
  assert.equal(r.code, 400);
  assert.equal(calls.inserts.length, 0);
});

test('physical edition needs an address; digital does not', async () => {
  const { handler } = load();
  assert.equal((await call(handler, { ...good, address: '' })).code, 400);
  const d = load();
  const r = await call(d.handler, { ...good, product: 'digital', address: '' });
  assert.equal(r.code, 200);
  assert.equal(d.calls.inserts[0].amount_egp, 249);
  assert.equal(d.calls.inserts[0].shipping_address, null);
});

test('stores the order under the request id with a server-side price', async () => {
  const { handler, calls } = load();
  const r = await call(handler, { ...good, amount_egp: 1 });
  assert.equal(r.code, 200);
  assert.equal(calls.inserts[0].order_token, `preorder_${good.request_id}`);
  assert.equal(calls.inserts[0].amount_egp, 499);
  assert.equal(calls.inserts[0].customer_email, 'sara@example.com');
  assert.equal(calls.sends.length, 2);
});

test('a repeated request id does not create a second order', async () => {
  const { handler, calls } = load({ existing: { id: 1 } });
  const r = await call(handler, good);
  assert.equal(r.code, 200);
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.sends.length, 0);
});

test('saved order + failed team email still answers success', async () => {
  const { handler, calls } = load({ sendError: { message: 'down' } });
  const r = await call(handler, good);
  assert.equal(r.code, 200);
  assert.ok(calls.issues.includes('preorder_team_email_failed'));
});

test('neither stored nor emailed answers 500', async () => {
  const { handler, calls } = load({ insertError: { message: 'x' }, sendError: { message: 'y' } });
  const r = await call(handler, good);
  assert.equal(r.code, 500);
  assert.ok(calls.issues.includes('preorder_lost'));
});

test('user input is escaped in the team email', async () => {
  const { handler, calls } = load();
  await call(handler, { ...good, name: '<b>x</b>' });
  assert.ok(!calls.sends[0].html.includes('<b>x</b>'));
  assert.ok(calls.sends[0].html.includes('&lt;b&gt;'));
});

test('missing RESEND_API_KEY does not crash; stored order succeeds', async () => {
  const { handler, calls } = load({ key: null });
  const r = await call(handler, good);
  assert.equal(r.code, 200);
  assert.ok(calls.issues.includes('resend_not_configured'));
});
