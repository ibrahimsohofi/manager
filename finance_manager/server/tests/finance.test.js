// Pure helpers (utils/finance.js) and the Finance model on in-memory test doubles (FINANCE_PLAN.md §2, §4, §6, §10).
// Run: bun run test   (node --test tests/*.test.js)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createFinanceModel } from '../models/Finance.js';
import {
  createMemoryCategoryModel,
  createMemoryExpenseModel,
  createMemorySalesSource,
  createMemorySettingsModel,
  createMemoryStore,
  createTestModels,
  saleLine,
} from './helpers/memoryModels.js';
import {
  addMonths,
  buildAllocations,
  changePct,
  cleanExpenseFilters,
  cleanExpenseInput,
  cleanSettingsInput,
  computeSummary,
  daysInMonth,
  isValidDate,
  parsePeriod,
  round2,
} from '../utils/finance.js';
import { hashPin, isValidPin, verifyPin } from '../utils/pin.js';
import { createAttemptLimiter, createSessionStore } from '../utils/sessions.js';

const TODAY = '2026-11-21';

describe('allocations (§4 #6, Chunk 4 "done when")', () => {
  test('1 200 over 12 months gives 12 x 100.00', () => {
    const rows = buildAllocations(1200, '2026-01', 12);
    assert.equal(rows.length, 12);
    assert.ok(rows.every((row) => row.amount === 100));
    assert.equal(rows[0].period_month, '2026-01');
    assert.equal(rows[11].period_month, '2026-12');
  });
  test('1 000 over 3 months gives 333.33 / 333.33 / 333.34', () => {
    assert.deepEqual(
      buildAllocations(1000, '2026-11', 3).map((row) => row.amount),
      [333.33, 333.33, 333.34]
    );
  });
  test('spreading crosses the year and always sums to the amount', () => {
    const rows = buildAllocations(99.99, '2026-11', 7);
    assert.equal(rows.at(-1).period_month, '2027-05');
    assert.equal(round2(rows.reduce((acc, row) => acc + row.amount, 0)), 99.99);
  });
});

describe('profit ladder (§2, §6)', () => {
  test('the November example gives 14 400 / 7 230 / 5 230', () => {
    const s = computeSummary({ revenue: 48000, known_cogs: 33600, business_expenses: 7170, withdrawals: 2000 });
    assert.equal(s.gross_margin, 14400);
    assert.equal(s.gross_margin_pct, 30);
    assert.equal(s.net_profit, 7230);
    assert.equal(s.left_over, 5230);
    assert.equal(s.cost_coverage_pct, 100);
  });
  test('unknown-cost revenue is costed with the default margin', () => {
    const s = computeSummary({ revenue: 1000, known_cogs: 560, unknown_revenue: 200 }, 30);
    assert.equal(s.estimated_cogs, 140);
    assert.equal(s.cogs, 700);
    assert.equal(s.cost_coverage_pct, 80);
  });
  test('an empty period gives zeros and no percentage, never NaN', () => {
    const s = computeSummary({});
    assert.equal(s.revenue, 0);
    assert.equal(s.net_profit, 0);
    assert.equal(s.gross_margin_pct, null);
    assert.equal(s.cost_coverage_pct, null);
    assert.ok(Object.values(s).every((value) => value === null || Number.isFinite(value)));
  });
  test('changePct', () => {
    assert.equal(changePct(110, 100), 10);
    assert.equal(changePct(-50, -100), 50);
    assert.equal(changePct(5, 0), null);
  });
});

describe('periods and dates', () => {
  test('month and year periods are half-open', () => {
    const m = parsePeriod('2026-12');
    assert.deepEqual([m.from, m.to, m.previous, m.lastYear], ['2026-12-01', '2027-01-01', '2026-11', '2025-12']);
    const y = parsePeriod('2026');
    assert.equal(y.months.length, 12);
    assert.deepEqual([y.from, y.to, y.previous], ['2026-01-01', '2027-01-01', '2025']);
  });
  test('invalid periods are a 400', () => {
    assert.throws(() => parsePeriod('2026-13'), (error) => error.status === 400 && error.code === 'INVALID_PERIOD');
  });
  test('calendar helpers', () => {
    assert.equal(daysInMonth('2028-02'), 29);
    assert.equal(addMonths('2026-01', -1), '2025-12');
    assert.equal(isValidDate('2026-02-30'), false);
    assert.equal(isValidDate('2026-02-28'), true);
  });
});

describe('validation', () => {
  test('expense defaults: today, its month, paid, from the till, one month', () => {
    const out = cleanExpenseInput({ category_id: 3, amount: '12,5' }, { today: TODAY });
    assert.equal(out.amount, 12.5);
    assert.equal(out.expense_date, TODAY);
    assert.equal(out.period_month, '2026-11');
    assert.equal(out.status, 'paid');
    assert.equal(out.paid_from, 'till');
    assert.equal(out.spread_months, 1);
  });
  test('bad bodies give the right error code', () => {
    const code = (body) => {
      try {
        cleanExpenseInput(body, { today: TODAY });
      } catch (error) {
        return error.code;
      }
      return null;
    };
    assert.equal(code({ amount: 5 }), 'INVALID_CATEGORY');
    assert.equal(code({ category_id: 1, amount: -1 }), 'INVALID_AMOUNT');
    assert.equal(code({ category_id: 1, amount: 1, spread_months: 40 }), 'INVALID_SPREAD');
    assert.equal(code({ category_id: 1, amount: 1, status: 'maybe' }), 'INVALID_STATUS');
  });
  test('settings margin is bounded', () => {
    assert.deepEqual(cleanSettingsInput({ default_margin_pct: '32,5' }), { default_margin_pct: 32.5 });
    assert.throws(() => cleanSettingsInput({ default_margin_pct: 99 }), /default_margin_pct/);
    assert.throws(() => cleanSettingsInput({}), /Nothing to update/);
  });
  test('list filters', () => {
    const f = cleanExpenseFilters({ period: '2026', status: 'pending', limit: '999', q: '  loyer ' });
    assert.equal(f.period.from, '2026-01');
    assert.equal(f.period.to, '2026-12');
    assert.equal(f.limit, 200);
    assert.equal(f.q, 'loyer');
  });
});

describe('PIN, sessions and attempt limiter', () => {
  test('PIN hash round trip', () => {
    const hash = hashPin('2468');
    assert.ok(hash.startsWith('scrypt$'));
    assert.equal(verifyPin('2468', hash), true);
    assert.equal(verifyPin('2469', hash), false);
    assert.equal(isValidPin('123'), false);
    assert.equal(isValidPin('123456789'), false);
  });
  test('sessions expire after the idle time', () => {
    let now = 0;
    const store = createSessionStore({ idleMinutes: 1, now: () => now });
    const token = store.create();
    now = 59_000;
    assert.equal(store.touch(token), true);
    now = 59_000 + 60_000;
    assert.equal(store.peek(token), false);
  });
  test('5 wrong PINs lock the client, the lock doubles', () => {
    let now = 0;
    const limiter = createAttemptLimiter({ now: () => now });
    for (let i = 0; i < 4; i += 1) assert.equal(limiter.fail('a').retryAfterMs, 0);
    assert.equal(limiter.fail('a').retryAfterMs, 30_000);
    assert.equal(limiter.check('a').locked, true);
    now = 30_001;
    for (let i = 0; i < 4; i += 1) limiter.fail('a');
    assert.equal(limiter.fail('a').retryAfterMs, 60_000);
  });
});

/** A month of sales: `days` x one line of `perDay` DH costing `costRatio` of the price. */
const flatSales = (month, days, perDay, costRatio) =>
  Array.from({ length: days }, (_, i) => ({
    id: i + 1,
    sale_number: `S-${i + 1}`,
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    product_id: 1,
    productName: 'X',
    category: 'Peinture',
    quantity: 1,
    totalPrice: perDay,
    unit_cost: round2(perDay * costRatio),
    payment_method: 'cash',
    notes: '',
  }));

const exampleModel = async ({ salesUp = true } = {}) => {
  const store = createMemoryStore({ today: () => TODAY });
  const categories = createMemoryCategoryModel(store);
  const expenses = createMemoryExpenseModel(store, { categories });
  const settings = createMemorySettingsModel(store);
  const sales = createMemorySalesSource(flatSales('2026-11', 30, 1600, 0.7), { available: salesUp });
  const list = await categories.list();
  const id = (code) => list.find((c) => c.code === code).id;
  for (const [code, amount] of [
    ['rent', 3000],
    ['electricity', 450],
    ['water', 120],
    ['internet_phone', 300],
    ['transport', 600],
    ['salaries', 2500],
    ['other', 200],
    ['home', 2000],
  ]) {
    await expenses.create({ category_id: id(code), amount, expense_date: '2026-11-05' });
  }
  return createFinanceModel({ sales, expenses, categories, settings, today: () => TODAY });
};

describe('Finance model (Chunk 5 "done when")', () => {
  test('§2 example through the model: 48 000 revenue, 14 400 / 7 230 / 5 230, break-even 23 900', async () => {
    const finance = await exampleModel();
    const s = await finance.summary('2026-11');
    assert.equal(s.sales_available, true);
    assert.equal(s.current.revenue, 48000);
    assert.equal(s.current.cogs, 33600);
    assert.equal(s.current.gross_margin, 14400);
    assert.equal(s.current.business_expenses, 7170);
    assert.equal(s.current.net_profit, 7230);
    assert.equal(s.current.withdrawals, 2000);
    assert.equal(s.current.left_over, 5230);
    assert.equal(s.break_even.revenue, 23900);
    assert.equal(s.break_even.per_day, 796.67);
    // 1 600 DH a day: 15 x 1 600 = 24 000 >= 23 900.
    assert.equal(s.break_even.reached_on, '2026-11-15');
    assert.equal(s.projection.is_current, true);
    assert.equal(s.projection.days_elapsed, 21);
  });

  test('monthly report sums to the year totals', async () => {
    const finance = await exampleModel();
    const report = await finance.monthly('2026');
    assert.equal(report.rows.length, 12);
    assert.equal(report.rows[10].net_profit, 7230);
    assert.equal(report.totals.revenue, 48000);
    assert.equal(report.rows[0].revenue, 0);
  });

  test('sales database down: sales numbers are null, expenses still work', async () => {
    const finance = await exampleModel({ salesUp: false });
    const s = await finance.summary('2026-11');
    assert.equal(s.sales_available, false);
    assert.equal(s.current.revenue, null);
    assert.equal(s.current.net_profit, null);
    assert.equal(s.current.business_expenses, 7170);
    assert.equal(s.break_even.revenue, null);
    const byCat = await finance.expensesByCategory('2026-11');
    assert.equal(byCat.business_total, 7170);
    assert.equal(byCat.personal_total, 2000);
  });

  test('a fresh install: no expenses, no sales, no NaN anywhere', async () => {
    const { models } = createTestModels({ today: () => TODAY });
    const s = await models.finance.summary('2026-11');
    assert.equal(s.current.revenue, 0);
    assert.equal(s.current.business_expenses, 0);
    assert.equal(s.pending.count, 0);
    assert.deepEqual(s.alerts, []);
    const report = await models.finance.monthly('2026');
    assert.equal(report.totals.revenue, 0);
  });

  test('pending bills raise overdue / due-soon alerts', async () => {
    const { models } = createTestModels({
      today: () => TODAY,
      sales: [saleLine(1, '2026-11-02', 500, 350), saleLine(2, '2026-11-03', 100)],
    });
    const list = await models.categories.list();
    const id = (code) => list.find((c) => c.code === code).id;
    await models.expenses.create({ category_id: id('maintenance'), amount: 350, status: 'pending', due_date: '2026-11-19' });
    await models.expenses.create({ category_id: id('water'), amount: 95, status: 'pending', due_date: '2026-11-23' });
    const s = await models.finance.summary('2026-11');
    const types = new Set(s.alerts.map((a) => a.type));
    assert.ok(types.has('bill_overdue'));
    assert.ok(types.has('bill_due_soon'));
    assert.equal(s.pending.count, 2);
    // 1 line of 100 DH has no cost: 500 / 600 of the revenue is costed.
    assert.equal(s.current.unknown_lines, 1);
    assert.equal(s.current.cost_coverage_pct, 83.33);
  });
});
