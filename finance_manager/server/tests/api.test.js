// HTTP API over the in-memory test models (same app.js as production). Covers the PIN flow, the session guard,
// expenses CRUD + allocations + soft delete, categories, settings and the finance routes.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../app.js';
import { buildConfig } from '../config/env.js';
import { createAttemptLimiter, createSessionStore } from '../utils/sessions.js';
import { createTestModels, saleLine } from './helpers/memoryModels.js';

const TODAY = '2026-11-21';
// Explicit sale lines (no generator): 2025 = 100, Oct 2026 = 185 (2 lines with unknown cost),
// Nov 2026 = 260 of which 60 today.
const SALES = [
  saleLine(1, '2025-12-15', 100, 60),
  saleLine(2, '2026-10-05', 100, 70),
  saleLine(3, '2026-10-12', 50),
  saleLine(4, '2026-10-20', 35),
  saleLine(5, '2026-11-02', 120, 80),
  saleLine(6, '2026-11-10', 80, 50),
  saleLine(7, '2026-11-21', 60, 40),
];
let server;
let base;
let token;

const call = async (method, path, { body, auth = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json, headers: res.headers };
};

before(async () => {
  const { models } = createTestModels({ today: () => TODAY, sales: SALES, salesAppUrl: 'http://localhost:5174' });
  const app = createApp({
    config: buildConfig({}),
    models,
    sessions: createSessionStore({ idleMinutes: 15 }),
    limiter: createAttemptLimiter(),
    logger: { error() {} },
  });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('PIN lock', () => {
  test('health needs no session', async () => {
    const res = await call('GET', '/api/health', { auth: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, 'mysql');
    assert.equal(res.body.sales_db, true);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
  test('finance routes are locked before the PIN', async () => {
    const res = await call('GET', '/api/finance/summary?period=2026-11', { auth: false });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'LOCKED');
  });
  test('first PIN setup, then a second setup is refused', async () => {
    assert.equal((await call('GET', '/api/session', { auth: false })).body.pin_set, false);
    assert.equal((await call('POST', '/api/session/setup', { body: { pin: '12' }, auth: false })).body.code, 'INVALID_PIN');
    const ok = await call('POST', '/api/session/setup', { body: { pin: '1234' }, auth: false });
    assert.equal(ok.status, 201);
    assert.match(ok.body.token, /^[a-f0-9]{64}$/);
    const again = await call('POST', '/api/session/setup', { body: { pin: '9999' }, auth: false });
    assert.equal(again.status, 409);
  });
  test('wrong PIN counts down, right PIN unlocks', async () => {
    const wrong = await call('POST', '/api/session/unlock', { body: { pin: '0000' }, auth: false });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.attempts_left, 4);
    const right = await call('POST', '/api/session/unlock', { body: { pin: '1234' }, auth: false });
    assert.equal(right.status, 200);
    token = right.body.token;
    assert.equal((await call('GET', '/api/session')).body.unlocked, true);
  });
});

describe('expenses', () => {
  let categoryId;
  let expenseId;
  test('categories are seeded (15, home is personal, rent is fixed)', async () => {
    const res = await call('GET', '/api/expenses/categories');
    assert.equal(res.status, 200);
    assert.equal(res.body.rows.length, 15);
    const home = res.body.rows.find((c) => c.code === 'home');
    assert.equal(home.is_personal, true);
    assert.equal(res.body.rows.find((c) => c.code === 'rent').is_fixed, true);
    categoryId = res.body.rows.find((c) => c.code === 'taxes').id;
  });
  test('create a spread expense: 1 200 over 12 months', async () => {
    const res = await call('POST', '/api/expenses', {
      body: { category_id: categoryId, amount: 1200, expense_date: '2026-11-20', period_month: '2027-01', spread_months: 12, description: 'Test taxe' },
    });
    assert.equal(res.status, 201);
    expenseId = res.body.id;
    assert.equal(res.body.allocations.length, 12);
    assert.ok(res.body.allocations.every((a) => a.amount === 100));
  });
  test('list by period counts only the period part', async () => {
    const res = await call('GET', '/api/expenses?period=2027-03&q=test%20taxe');
    assert.equal(res.body.rows.length, 1);
    assert.equal(res.body.rows[0].period_amount, 100);
    assert.equal(res.body.totals.counted, 100);
  });
  test('validation errors are 400 with a code', async () => {
    const res = await call('POST', '/api/expenses', { body: { category_id: categoryId, amount: 0 } });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_AMOUNT');
  });
  test('pending bill -> pay with the real amount', async () => {
    const created = await call('POST', '/api/expenses', {
      body: { category_id: categoryId, amount: 400, status: 'pending', due_date: '2026-11-30' },
    });
    const paid = await call('PUT', `/api/expenses/${created.body.id}/pay`, { body: { amount: '432,10' } });
    assert.equal(paid.body.status, 'paid');
    assert.equal(paid.body.amount, 432.1);
    assert.equal(paid.body.expense_date, TODAY);
    const twice = await call('PUT', `/api/expenses/${created.body.id}/pay`, { body: {} });
    assert.equal(twice.status, 409);
  });
  test('soft delete, bin, restore', async () => {
    assert.equal((await call('DELETE', `/api/expenses/${expenseId}`)).body.deleted, true);
    assert.equal((await call('GET', '/api/expenses?period=2027-03&q=test%20taxe')).body.rows.length, 0);
    assert.equal((await call('GET', '/api/expenses?deleted=1&q=test%20taxe')).body.rows.length, 1);
    const restored = await call('PUT', `/api/expenses/${expenseId}/restore`);
    assert.equal(restored.body.deleted_at, null);
  });
  test('a used category is archived, not deleted', async () => {
    const res = await call('DELETE', `/api/expenses/categories/${categoryId}`);
    assert.deepEqual([res.body.deleted, res.body.archived], [false, true]);
    const fresh = await call('POST', '/api/expenses/categories', { body: { name_fr: 'Publicité' } });
    assert.equal(fresh.body.name_ar, 'Publicité');
    const gone = await call('DELETE', `/api/expenses/categories/${fresh.body.id}`);
    assert.equal(gone.body.deleted, true);
  });
  test('pending list is sorted by due date', async () => {
    const res = await call('GET', '/api/expenses/pending');
    const dues = res.body.rows.map((row) => row.due_date).filter(Boolean);
    assert.deepEqual(dues, [...dues].sort());
  });
});

describe('finance routes', () => {
  test('summary of the current month', async () => {
    const res = await call('GET', '/api/finance/summary?period=2026-11');
    assert.equal(res.status, 200);
    assert.equal(res.body.today, TODAY);
    assert.equal(res.body.current.revenue, 260);
    assert.equal(res.body.today_sales.revenue, 60);
    assert.ok(Array.isArray(res.body.alerts));
  });
  test('monthly / yearly / daily / by category / unknown cost', async () => {
    const monthly = await call('GET', '/api/finance/monthly?year=2026');
    assert.equal(monthly.body.rows.length, 12);
    assert.equal(monthly.body.rows[9].revenue, 185);
    assert.deepEqual(
      (await call('GET', '/api/finance/yearly')).body.rows.map((row) => row.year),
      ['2025', '2026', '2027']
    );
    assert.equal((await call('GET', '/api/finance/daily?period=2026-02')).body.rows.length, 28);
    const byCat = await call('GET', '/api/finance/expenses-by-category?period=2026-11');
    assert.equal(byCat.body.rows.length, 1);
    const unknown = await call('GET', '/api/finance/unknown-cost-lines?period=2026-10&limit=5');
    assert.equal(unknown.body.rows.length, 2);
    assert.equal(unknown.body.total, 2);
    assert.equal(unknown.body.sales_app_url, 'http://localhost:5174');
  });
  test('bad period is a 400', async () => {
    assert.equal((await call('GET', '/api/finance/summary?period=nope')).status, 400);
    assert.equal((await call('GET', '/api/finance/daily?period=2026')).status, 400);
  });
  test('settings: margin update, never the PIN hash', async () => {
    const res = await call('PUT', '/api/settings', { body: { default_margin_pct: 35 } });
    assert.equal(res.body.default_margin_pct, 35);
    assert.equal(res.body.pin_set, true);
    assert.equal(JSON.stringify(res.body).includes('scrypt'), false);
  });
  test('PIN change locks the other sessions', async () => {
    const other = (await call('POST', '/api/session/unlock', { body: { pin: '1234' }, auth: false })).body.token;
    const res = await call('PUT', '/api/session/pin', { body: { current_pin: '1234', new_pin: '5678' } });
    assert.equal(res.body.changed, true);
    const mine = await call('GET', '/api/settings');
    assert.equal(mine.status, 200);
    const saved = token;
    token = other;
    assert.equal((await call('GET', '/api/settings')).status, 401);
    token = saved;
  });
  test('lock forgets the token', async () => {
    await call('POST', '/api/session/lock');
    assert.equal((await call('GET', '/api/settings')).status, 401);
  });
});
