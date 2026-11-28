// Sale cost backfill (FINANCE_PLAN.md §5.3 "Old sales", Chunk 3).
// Run: bun run test   (node --test tests/*.test.js). No MySQL, no products API:
// - the rules (utils/backfillCost.js) are pure functions;
// - `runBackfill` runs on `createTestConnection`, a test double of a mysql2 connection over explicit sale rows;
// - `createProductsClient` runs on a fake `fetch`.
// Chunk 3 "done when": with 3 purchase-price changes, sales before, between and after them get the right price.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createProductsClient, ProductsApiError, runBackfill } from '../scripts/backfillSaleCosts.js';
import {
  coverage,
  formatMoney,
  groupUpdates,
  parseArgs,
  planBackfill,
  purchaseChanges,
  purchasePriceOnDate,
  toLocalDay,
} from '../utils/backfillCost.js';

const silent = { log() {}, warn() {}, error() {} };

// Product #7, purchase price today 40.00. Three purchase-price changes + one selling-price change (ignored).
// Newest first, like GET /api/products/:id/price-history. DECIMAL values come as strings from mysql2.
const HISTORY_7 = [
  { id: 14, price_type: 'purchase', old_price: '35.00', new_price: '40.00', changed_at: '2026-09-01 08:15:00' },
  { id: 11, price_type: 'purchase', old_price: '32.00', new_price: '35.00', changed_at: '2026-05-20 17:40:00' },
  { id: 9, price_type: 'selling', old_price: '45.00', new_price: '49.00', changed_at: '2026-03-01 10:00:00' },
  { id: 5, price_type: 'purchase', old_price: '30.00', new_price: '32.00', changed_at: '2026-02-10 09:30:00' },
];

describe('purchasePriceOnDate (3 purchase-price changes)', () => {
  const cases = [
    ['2026-01-15', 30, 'before the 1st change: old price of the 1st change'],
    ['2026-02-10', 30, '1st change made on the sale day counts as after the sale'],
    ['2026-02-11', 32, 'between the 1st and the 2nd change'],
    ['2026-03-15', 32, 'a selling-price change in between is ignored'],
    ['2026-05-20', 32, '2nd change made on the sale day'],
    ['2026-06-01', 35, 'between the 2nd and the 3rd change'],
    ['2026-09-01', 35, '3rd change made on the sale day'],
    ['2026-10-05', 40, 'after the last change: current purchase price'],
  ];
  for (const [saleDate, expected, why] of cases) {
    test(`${saleDate} -> ${expected} (${why})`, () => {
      assert.equal(purchasePriceOnDate(HISTORY_7, '40.00', saleDate), expected);
    });
  }

  test('history order does not matter', () => {
    const shuffled = [HISTORY_7[2], HISTORY_7[0], HISTORY_7[3], HISTORY_7[1]];
    for (const [saleDate, expected] of cases) {
      assert.equal(purchasePriceOnDate(shuffled, '40.00', saleDate), expected, saleDate);
    }
  });

  test('two changes on the same day: the first one of the day gives the price', () => {
    const history = [
      { id: 21, price_type: 'purchase', old_price: '12.00', new_price: '13.00', changed_at: '2026-04-02 16:00:00' },
      { id: 20, price_type: 'purchase', old_price: '10.00', new_price: '12.00', changed_at: '2026-04-02 09:00:00' },
    ];
    assert.equal(purchasePriceOnDate(history, '13.00', '2026-04-02'), 10);
    assert.equal(purchasePriceOnDate(history, '13.00', '2026-04-03'), 13);
  });

  test('no history: current purchase price; unknown price (0, empty, bad): null', () => {
    assert.equal(purchasePriceOnDate([], '18.5', '2026-01-01'), 18.5);
    assert.equal(purchasePriceOnDate(undefined, 18.499, '2026-01-01'), 18.5);
    assert.equal(purchasePriceOnDate([], '0.00', '2026-01-01'), null);
    assert.equal(purchasePriceOnDate([], null, '2026-01-01'), null);
    assert.equal(purchasePriceOnDate([], 'abc', '2026-01-01'), null);
    assert.equal(purchasePriceOnDate([], '18', 'not a date'), null);
  });

  test('an old price of 0 in the history is an unknown cost, not a free item', () => {
    const history = [{ id: 1, price_type: 'purchase', old_price: '0.00', new_price: '25.00', changed_at: '2026-03-01 10:00:00' }];
    assert.equal(purchasePriceOnDate(history, '25.00', '2026-02-01'), null);
    assert.equal(purchasePriceOnDate(history, '25.00', '2026-03-02'), 25);
  });
});

describe('dates', () => {
  test('toLocalDay accepts DATE strings, zone-less DATETIME, ISO with a zone and Date objects', () => {
    assert.equal(toLocalDay('2026-03-04'), '2026-03-04');
    assert.equal(toLocalDay('2026-03-04 23:59:59'), '2026-03-04');
    assert.equal(toLocalDay('2026-03-04T23:59:59'), '2026-03-04');
    // Midday UTC is the same calendar day in every time zone from UTC-11 to UTC+11
    assert.equal(toLocalDay('2026-03-04T12:00:00.000Z'), '2026-03-04');
    assert.equal(toLocalDay(new Date(2026, 2, 4, 18, 30)), '2026-03-04');
    assert.equal(toLocalDay(''), null);
    assert.equal(toLocalDay(null), null);
    assert.equal(toLocalDay(new Date('nope')), null);
  });

  test('purchaseChanges keeps purchase rows only, oldest first, drops unreadable dates', () => {
    const rows = purchaseChanges([...HISTORY_7, { id: 99, price_type: 'purchase', old_price: '1', changed_at: 'garbage' }]);
    assert.deepEqual(
      rows.map((row) => row.id),
      [5, 11, 14]
    );
    assert.deepEqual(
      rows.map((row) => row.day),
      ['2026-02-10', '2026-05-20', '2026-09-01']
    );
  });
});

describe('planBackfill', () => {
  const products = new Map([
    [7, { found: true, name: 'Vis 4x40', purchase_price: '40.00', history: HISTORY_7 }],
    [8, { found: false }],
    [9, { found: true, name: 'Sans prix', purchase_price: '0.00', history: [] }],
  ]);
  const lines = [
    { id: 1, date: '2026-01-15', product_id: 7, totalPrice: '45.00' },
    { id: 2, date: '2026-06-01', product_id: '7', totalPrice: '98.00' },
    { id: 3, date: '2026-10-05', product_id: 7, totalPrice: '49.00' },
    { id: 4, date: '2026-10-05', product_id: null, totalPrice: '12.50' },
    { id: 5, date: '2026-10-06', product_id: 0, totalPrice: '7.50' },
    { id: 6, date: '2026-10-06', product_id: 8, totalPrice: '20.00' },
    { id: 7, date: '2026-10-07', product_id: 8, totalPrice: '10.00' },
    { id: 8, date: '2026-10-07', product_id: 9, totalPrice: '30.00' },
  ];

  test('fills lines with a product and a price, counts the others', () => {
    const { updates, stats } = planBackfill({ lines, products });
    assert.deepEqual(updates, [
      { id: 1, unit_cost: 30 },
      { id: 2, unit_cost: 35 },
      { id: 3, unit_cost: 40 },
    ]);
    assert.equal(stats.scanned, 8);
    assert.equal(stats.scannedRevenue, 272);
    assert.deepEqual([stats.filled, stats.filledRevenue], [3, 192]);
    assert.deepEqual([stats.noProduct, stats.noProductRevenue], [2, 20]);
    assert.deepEqual([stats.notFound, stats.notFoundRevenue, stats.notFoundIds], [2, 30, [8]]);
    assert.deepEqual([stats.noPrice, stats.noPriceRevenue, stats.noPriceIds], [1, 30, [9]]);
    assert.equal(stats.products, 3);
  });

  test('nothing to do on an empty list', () => {
    const { updates, stats } = planBackfill({ lines: [], products: new Map() });
    assert.deepEqual(updates, []);
    assert.equal(stats.scanned, 0);
  });
});

describe('groupUpdates / coverage / report helpers', () => {
  test('one group per cost, batches of at most batchSize ids', () => {
    const updates = [
      { id: 1, unit_cost: 30 },
      { id: 2, unit_cost: 35 },
      { id: 3, unit_cost: 30 },
      { id: 4, unit_cost: 30 },
    ];
    assert.deepEqual(groupUpdates(updates, 2), [
      { unit_cost: 30, ids: [1, 3] },
      { unit_cost: 30, ids: [4] },
      { unit_cost: 35, ids: [2] },
    ]);
  });

  test('coverage before / after in %, null without revenue', () => {
    assert.deepEqual(coverage({ totalRevenue: '200', knownRevenue: '50', filledRevenue: 100 }), { before: 25, after: 75 });
    assert.deepEqual(coverage({ totalRevenue: 3, knownRevenue: 1, filledRevenue: 0 }), { before: 33.3, after: 33.3 });
    assert.deepEqual(coverage({ totalRevenue: 0, knownRevenue: 0, filledRevenue: 0 }), { before: null, after: null });
  });

  test('money format: French grouping, comma decimals, DH', () => {
    assert.equal(formatMoney(131297.38), '131 297,38 DH');
    assert.equal(formatMoney('-5'), '-5,00 DH');
  });
});

describe('parseArgs', () => {
  test('defaults to a dry run', () => {
    assert.deepEqual(parseArgs([]), { apply: false, verbose: false, help: false, from: null, to: null });
  });
  test('--apply, --verbose, --from=, --to with a separate value', () => {
    assert.deepEqual(parseArgs(['--apply', '-v', '--from=2025-10-01', '--to', '2026-03-31']), {
      apply: true,
      verbose: true,
      help: false,
      from: '2025-10-01',
      to: '2026-03-31',
    });
  });
  test('refuses unknown options, bad dates and a reversed period', () => {
    assert.throws(() => parseArgs(['--force']), /Option inconnue/);
    assert.throws(() => parseArgs(['--from=2026-02-30']), /AAAA-MM-JJ/);
    assert.throws(() => parseArgs(['--to']), /AAAA-MM-JJ/);
    assert.throws(() => parseArgs(['--from=2026-05-01', '--to=2026-04-01']), /avant/);
  });
});

// ---------- runBackfill on a test double connection ----------

/**
 * Test double of a mysql2/promise connection over `sales` rows kept in memory. It understands exactly the
 * statements of scripts/backfillSaleCosts.js (columns check, revenue, lines without cost, UPDATE in a
 * transaction) and records every statement, so a test can check that nothing was written.
 */
const createTestConnection = (rows, { columns = ['unit_cost', 'cost_source', 'updated_at'], failOnUpdate = false } = {}) => {
  let sales = rows.map((row) => ({ unit_cost: null, cost_source: null, updated_at: 'kept', ...row }));
  let snapshot = null;
  const statements = [];

  const period = (sql, params) => {
    let index = 0;
    const from = /date >= \?/.test(sql) ? params[index++] : null;
    const to = /date <= \?/.test(sql) ? params[index++] : null;
    return (row) => (!from || row.date >= from) && (!to || row.date <= to);
  };

  const db = {
    statements,
    get sales() {
      return sales;
    },
    async query(sql, params = []) {
      statements.push(sql.replace(/\s+/g, ' ').trim());
      if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return [columns.map((name) => ({ name }))];
      if (/^\s*SELECT COALESCE\(SUM\(totalPrice\)/.test(sql)) {
        const inPeriod = period(sql, params);
        const picked = sales.filter(inPeriod);
        const sum = (list) => list.reduce((acc, row) => acc + Number(row.totalPrice), 0);
        return [[{ total: sum(picked), known: sum(picked.filter((row) => row.unit_cost !== null)) }]];
      }
      if (/^\s*SELECT id, date, product_id, totalPrice FROM sales/.test(sql)) {
        const inPeriod = period(sql, params);
        const withoutCost = /unit_cost IS NULL/.test(sql);
        return [
          sales
            .filter((row) => inPeriod(row) && (!withoutCost || row.unit_cost === null))
            .sort((a, b) => a.id - b.id)
            .map(({ id, date, product_id, totalPrice }) => ({ id, date, product_id, totalPrice })),
        ];
      }
      if (/^\s*UPDATE sales SET unit_cost = \?/.test(sql)) {
        if (failOnUpdate) throw Object.assign(new Error('Lock wait timeout exceeded'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
        assert.ok(snapshot, 'UPDATE outside a transaction');
        const [cost, ...ids] = params;
        let affectedRows = 0;
        for (const row of sales) {
          if (row.unit_cost === null && ids.includes(row.id)) {
            row.unit_cost = cost;
            row.cost_source = 'backfill';
            affectedRows += 1;
          }
        }
        return [{ affectedRows }];
      }
      throw new Error(`Unexpected statement: ${sql}`);
    },
    async execute() {
      throw new Error('execute() is only used by ensureSaleCostColumns (not expected here)');
    },
    async beginTransaction() {
      snapshot = sales.map((row) => ({ ...row }));
    },
    async commit() {
      snapshot = null;
    },
    async rollback() {
      sales = snapshot;
      snapshot = null;
    },
  };
  return db;
};

/** Products API double: Map id -> product (or `{ found: false }`). Counts the calls per id. */
const createProductsDouble = (products, { failOn = null } = {}) => {
  const calls = new Map();
  return {
    calls,
    async getProduct(id) {
      calls.set(id, (calls.get(id) ?? 0) + 1);
      if (id === failOn) throw new ProductsApiError('API produits injoignable (test)');
      return products.get(id) ?? { found: false };
    },
  };
};

const SALE_ROWS = [
  { id: 1, date: '2026-01-15', product_id: 7, totalPrice: '45.00' },
  { id: 2, date: '2026-03-15', product_id: 7, totalPrice: '49.00' },
  { id: 3, date: '2026-06-01', product_id: 7, totalPrice: '98.00' },
  { id: 4, date: '2026-10-05', product_id: 7, totalPrice: '49.00' },
  { id: 5, date: '2026-10-05', product_id: null, totalPrice: '12.50' },
  { id: 6, date: '2026-10-06', product_id: 8, totalPrice: '20.00' },
  // Cost stored at checkout (Chunk 2): never overwritten
  { id: 7, date: '2026-10-07', product_id: 7, totalPrice: '49.00', unit_cost: 41, cost_source: 'sale' },
];
const PRODUCTS = new Map([[7, { found: true, name: 'Vis 4x40', purchase_price: '40.00', history: HISTORY_7 }]]);

describe('runBackfill', () => {
  test('dry run: report only, nothing written, each product asked once', async () => {
    const db = createTestConnection(SALE_ROWS);
    const products = createProductsDouble(PRODUCTS);
    const result = await runBackfill({ db, products, options: parseArgs([]), logger: silent });
    assert.equal(result.updated, 0);
    assert.equal(result.columnsMissing, false);
    assert.deepEqual([result.stats.scanned, result.stats.filled, result.stats.noProduct, result.stats.notFound], [6, 4, 1, 1]);
    assert.deepEqual([...products.calls.entries()], [
      [7, 1],
      [8, 1],
    ]);
    assert.equal(db.statements.filter((sql) => sql.startsWith('UPDATE')).length, 0);
    assert.ok(db.sales.filter((row) => row.id !== 7).every((row) => row.unit_cost === null));
    assert.match(result.report, /SIMULATION/);
    // Revenue 322.50: 49 known before (line 7), + 241 filled
    assert.deepEqual(result.coverage, { before: 15.2, after: 89.9 });
  });

  test('--apply: right cost per period, cost_source backfill, checkout cost and updated_at kept', async () => {
    const db = createTestConnection(SALE_ROWS);
    const result = await runBackfill({ db, products: createProductsDouble(PRODUCTS), options: parseArgs(['--apply']), logger: silent });
    assert.equal(result.updated, 4);
    const byId = new Map(db.sales.map((row) => [row.id, row]));
    assert.deepEqual(
      [1, 2, 3, 4].map((id) => byId.get(id).unit_cost),
      [30, 32, 35, 40]
    );
    assert.ok([1, 2, 3, 4].every((id) => byId.get(id).cost_source === 'backfill'));
    assert.deepEqual([byId.get(5).unit_cost, byId.get(6).unit_cost], [null, null]);
    assert.deepEqual([byId.get(7).unit_cost, byId.get(7).cost_source], [41, 'sale']);
    const updates = db.statements.filter((sql) => sql.startsWith('UPDATE'));
    assert.equal(updates.length, 4); // 4 different costs -> 4 grouped statements
    assert.ok(updates.every((sql) => sql.includes('updated_at = updated_at') && sql.includes('WHERE unit_cost IS NULL')));
    assert.match(result.report, /4 ligne\(s\) mise\(s\) à jour/);
  });

  test('running --apply twice changes nothing the second time', async () => {
    const db = createTestConnection(SALE_ROWS);
    await runBackfill({ db, products: createProductsDouble(PRODUCTS), options: parseArgs(['--apply']), logger: silent });
    const before = JSON.stringify(db.sales);
    const second = await runBackfill({ db, products: createProductsDouble(PRODUCTS), options: parseArgs(['--apply']), logger: silent });
    assert.equal(second.updated, 0);
    assert.equal(second.stats.filled, 0);
    assert.equal(JSON.stringify(db.sales), before);
  });

  test('--from / --to limit the lines read', async () => {
    const db = createTestConnection(SALE_ROWS);
    const result = await runBackfill({
      db,
      products: createProductsDouble(PRODUCTS),
      options: parseArgs(['--apply', '--from=2026-03-01', '--to=2026-06-30']),
      logger: silent,
    });
    assert.equal(result.updated, 2);
    assert.deepEqual(
      db.sales.filter((row) => row.cost_source === 'backfill').map((row) => row.id),
      [2, 3]
    );
  });

  test('products API failure: stops before any write', async () => {
    const db = createTestConnection(SALE_ROWS);
    await assert.rejects(
      runBackfill({ db, products: createProductsDouble(PRODUCTS, { failOn: 8 }), options: parseArgs(['--apply']), logger: silent }),
      ProductsApiError
    );
    assert.equal(db.statements.filter((sql) => sql.startsWith('UPDATE')).length, 0);
    assert.ok(db.sales.filter((row) => row.id !== 7).every((row) => row.unit_cost === null));
  });

  test('a failing UPDATE is rolled back: nothing half-written', async () => {
    const db = createTestConnection(SALE_ROWS, { failOnUpdate: true });
    await assert.rejects(
      runBackfill({ db, products: createProductsDouble(PRODUCTS), options: parseArgs(['--apply']), logger: silent }),
      /Lock wait timeout/
    );
    assert.ok(db.sales.filter((row) => row.id !== 7).every((row) => row.unit_cost === null));
  });

  test('dry run before the cost columns exist: every line counts as without a cost, schema untouched', async () => {
    const rows = SALE_ROWS.map(({ unit_cost, cost_source, ...row }) => row);
    const db = createTestConnection(rows, { columns: ['updated_at'] });
    const result = await runBackfill({ db, products: createProductsDouble(PRODUCTS), options: parseArgs([]), logger: silent });
    assert.equal(result.columnsMissing, true);
    assert.equal(result.stats.scanned, 7);
    assert.equal(result.coverage.before, 0);
    assert.match(result.report, /n'existent pas encore/);
  });
});

// ---------- Products API client on a fake fetch ----------

const jsonReply = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
const htmlReply = (status) => ({
  status,
  ok: false,
  json: async () => {
    throw new SyntaxError('Unexpected token <');
  },
});

describe('createProductsClient', () => {
  test('product + price history', async () => {
    const seen = [];
    const client = createProductsClient({
      baseUrl: 'http://products.test/',
      fetchImpl: async (url) => {
        seen.push(url);
        if (url.endsWith('/price-history')) return jsonReply(200, { success: true, price_history: HISTORY_7 });
        return jsonReply(200, { id: 7, name: 'Vis 4x40', purchase_price: '40.00' });
      },
    });
    const product = await client.getProduct(7);
    assert.deepEqual(seen, ['http://products.test/api/products/7', 'http://products.test/api/products/7/price-history']);
    assert.equal(product.found, true);
    assert.equal(product.name, 'Vis 4x40');
    assert.equal(product.history.length, 4);
  });

  test('a JSON 404 is a deleted product', async () => {
    const client = createProductsClient({
      baseUrl: 'http://products.test',
      fetchImpl: async () => jsonReply(404, { success: false, error: 'Product not found' }),
    });
    assert.deepEqual(await client.getProduct(8), { found: false });
  });

  test('an HTML 404 is a wrong URL: the run stops', async () => {
    const client = createProductsClient({ baseUrl: 'http://products.test', fetchImpl: async () => htmlReply(404) });
    await assert.rejects(client.getProduct(8), (error) => error instanceof ProductsApiError && /PRODUCTS_API_URL/.test(error.message));
  });

  test('no price history (dev:products mirror): the run stops with a hint', async () => {
    const client = createProductsClient({
      baseUrl: 'http://products.test',
      fetchImpl: async (url) =>
        url.endsWith('/price-history') ? htmlReply(404) : jsonReply(200, { id: 7, name: 'Vis', purchase_price: '40.00' }),
    });
    await assert.rejects(client.getProduct(7), /historique des prix/);
  });

  test('unreachable API', async () => {
    const client = createProductsClient({
      baseUrl: 'http://products.test',
      fetchImpl: async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      },
    });
    await assert.rejects(client.getProduct(7), /injoignable.*ECONNREFUSED/);
  });
});
