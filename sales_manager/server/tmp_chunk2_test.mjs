// TEMP (Chunk 2 check, FINANCE_PLAN.md §5.3). Run:
//   node --import ./tmp_chunk2_register.mjs tmp_chunk2_test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fakeState } from './tmp_chunk2_fakeDatabase.mjs';
import { checkoutSale, createSale, updateSale } from './controllers/salesController.js';
import Sale from './models/Sale.js';
import { costFromIntegration, parseUnitCost } from './utils/saleCost.js';

const require = createRequire(import.meta.url);
const { createSaleBatchHandler, unitCostOf: batchUnitCostOf } = require('../../products_manager/backend/integration/saleBatch.js');

let passed = 0;
const failures = [];
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${error.message.split('\n').join('\n       ')}`);
  }
};

const silence = async (fn) => {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = error;
  }
};

const mockRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

const reset = () => {
  fakeState.statements = [];
  fakeState.nextId = 1;
  fakeState.costColumnsMissing = false;
};
const saleInserts = () => fakeState.statements.filter((s) => /^INSERT INTO sales/i.test(s.sql));
const hasCostColumns = (stmt) => /unit_cost, cost_source/.test(stmt.sql);

// Products API mock. `costs` maps product_id -> value of `sale.unit_cost` in the reply;
// a product missing from `costs` gets a reply WITHOUT the field (older products API).
const fetchCalls = [];
const mockProductsApi = (costs) => {
  fetchCalls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (String(url).includes('/api/integration/availability/')) {
      return reply(200, { success: true, availability: { current_stock: 1000, product_name: 'X' } });
    }
    if (String(url).endsWith('/api/integration/sale')) {
      const { product_id, quantity, price } = JSON.parse(init.body);
      const sale = { sale_number: `SALE-${product_id}`, product_id, quantity, price, total_price: price * quantity };
      if (Object.hasOwn(costs, product_id)) sale.unit_cost = costs[product_id];
      return reply(200, { success: true, sale, inventory_update: { previous_stock: 10, new_stock: 10 - quantity } });
    }
    return reply(404, { success: false, error: 'not mocked' });
  };
};

console.log('\nsaleCost utils');
await test('parseUnitCost: positive -> cents, 0 / negative / junk -> null', () => {
  assert.equal(parseUnitCost(42.5), 42.5);
  assert.equal(parseUnitCost('12.345'), 12.35);
  assert.equal(parseUnitCost(0), null);
  assert.equal(parseUnitCost(-3), null);
  assert.equal(parseUnitCost(''), null);
  assert.equal(parseUnitCost(null), null);
  assert.equal(parseUnitCost(undefined), null);
  assert.equal(parseUnitCost(true), null);
  assert.equal(parseUnitCost('abc'), null);
  assert.equal(parseUnitCost(Number.POSITIVE_INFINITY), null);
});
await test('costFromIntegration: known / null / missing field / no body', () => {
  assert.deepEqual(costFromIntegration({ sale: { unit_cost: 7 } }), { unit_cost: 7, cost_source: 'sale' });
  assert.deepEqual(costFromIntegration({ sale: { unit_cost: null } }), { unit_cost: null, cost_source: null });
  assert.deepEqual(costFromIntegration({ sale: {} }), { unit_cost: null, cost_source: null });
  assert.deepEqual(costFromIntegration(undefined), { unit_cost: null, cost_source: null });
});

console.log('\nproducts side: same unitCostOf rule in the 3 servers');
const extractUnitCostOf = (file, roundName, roundSrc) => {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const match = src.match(/const unitCostOf = \(purchasePrice\) => \{[\s\S]*?\n\};/);
  assert.ok(match, `unitCostOf not found in ${file}`);
  return new Function(`${roundSrc}\n${match[0]}\nreturn unitCostOf;`)();
};
const roundMoneySrc = 'const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;';
const pmUnitCostOf = extractUnitCostOf('../../products_manager/backend/server.js', 'roundMoney', roundMoneySrc);
const mirrorUnitCostOf = extractUnitCostOf('../server.js', null, '');
await test('products_manager server.js, saleBatch.js and the sales_manager mirror agree', () => {
  const inputs = [42.5, '19.999', 0, '0.00', null, undefined, -1, 'abc', 0.004, 1e6];
  for (const value of inputs) {
    const expected = batchUnitCostOf(value);
    assert.equal(pmUnitCostOf(value), expected, `server.js(${value})`);
    assert.equal(mirrorUnitCostOf(value), expected, `mirror(${value})`);
  }
  assert.equal(batchUnitCostOf('19.999'), 20);
  assert.equal(batchUnitCostOf('0.00'), null);
});
await test('single-sale routes put unit_cost in the reply and SELECT purchase_price', () => {
  for (const file of ['../../products_manager/backend/server.js', '../server.js']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const route = src.slice(src.indexOf('app.post("/api/integration/sale"'));
    const body = route.slice(0, route.indexOf('\n});') + 4);
    assert.match(body, /SELECT[\s\S]*purchase_price[\s\S]*FROM products/, `${file}: purchase_price not selected`);
    assert.match(body, /unit_cost: unitCostOf\(product\.purchase_price\)/, `${file}: unit_cost not returned`);
  }
});

await test('saleBatch: items[].unit_cost per line (known, 0 -> null, NULL -> null), stock still decremented', async () => {
  const executed = [];
  const products = [
    { id: 1, name: 'Peinture', remaining_stock: 10, stock_quantity: 10, min_stock_level: 2, is_active: 1, purchase_price: '50.00', category_name: 'Peinture' },
    { id: 2, name: 'Vis', remaining_stock: 100, stock_quantity: 100, min_stock_level: 5, is_active: 1, purchase_price: '0.00', category_name: null },
    { id: 3, name: 'Colle', remaining_stock: 5, stock_quantity: 5, min_stock_level: 1, is_active: 1, purchase_price: null, category_name: 'Divers' },
  ];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, params) => {
      executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/FOR UPDATE/.test(sql)) return [products];
      if (/^\s*SELECT id, remaining_stock/.test(sql)) return [products.map((p) => ({ id: p.id, remaining_stock: p.remaining_stock - 1, min_stock_level: p.min_stock_level }))];
      return [{ insertId: 1, affectedRows: 1 }];
    },
  };
  const handler = createSaleBatchHandler({ getConnection: async () => connection, execute: connection.execute });
  const res = mockRes();
  await handler(
    {
      body: {
        ticket_number: 'TKT-TEST',
        items: [
          { product_id: 1, quantity: 2, price: 80 },
          { product_id: 2, quantity: 10, price: 1 },
          { product_id: 3, quantity: 1, price: 25 },
        ],
      },
    },
    res
  );
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.items.map((i) => i.unit_cost), [50, null, null]);
  assert.equal(executed.filter((s) => /^UPDATE products SET remaining_stock/.test(s.sql)).length, 3);
  assert.ok(executed.find((s) => /FOR UPDATE/.test(s.sql)).sql.includes('p.purchase_price'));
});

console.log('\nsales_manager: checkoutSale (QR till)');
await test('3 lines: known cost stored, products API null -> NULL, typed line (no product) -> NULL + no API call', async () => {
  reset();
  mockProductsApi({ 1: 42.5, 2: null });
  const res = mockRes();
  await silence(() =>
    checkoutSale(
      {
        body: {
          items: [
            { product_id: 1, productName: 'Peinture', category: 'Peinture', price: 80, quantity: 2 },
            { product_id: 2, productName: 'Vis', category: 'Quincaillerie', price: 1, quantity: 10 },
            { productName: 'Article tapé', category: 'Autre', price: 15, quantity: 1 },
          ],
        },
      },
      res
    )
  );
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const inserts = saleInserts();
  assert.equal(inserts.length, 3);
  assert.ok(hasCostColumns(inserts[0]), 'line 1 should write unit_cost');
  assert.deepEqual(inserts[0].params.slice(-2), [42.5, 'sale']);
  assert.ok(!hasCostColumns(inserts[1]), 'line 2 (cost null) should use the base INSERT');
  assert.ok(!hasCostColumns(inserts[2]), 'line 3 (no product) should use the base INSERT');
  const saleCalls = fetchCalls.filter((c) => c.url.endsWith('/api/integration/sale'));
  assert.deepEqual(saleCalls.map((c) => c.body.product_id), [1, 2]);
});
await test('till response and invoice lines never carry the cost', async () => {
  reset();
  mockProductsApi({ 1: 42.5 });
  const res = mockRes();
  await silence(() =>
    checkoutSale({ body: { items: [{ product_id: 1, productName: 'Peinture', category: 'Peinture', price: 80, quantity: 1 }] } }, res)
  );
  assert.equal(res.statusCode, 201);
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes('unit_cost') && !text.includes('cost_source'), text);
});
await test('older products API (no unit_cost in the reply): sale saved normally, NULL cost', async () => {
  reset();
  mockProductsApi({});
  const res = mockRes();
  await silence(() =>
    checkoutSale({ body: { items: [{ product_id: 7, productName: 'Marteau', category: 'Outils', price: 60, quantity: 1 }] } }, res)
  );
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.items.length, 1);
  const inserts = saleInserts();
  assert.equal(inserts.length, 1);
  assert.ok(!hasCostColumns(inserts[0]));
});

console.log('\nsales_manager: createSale (manual form)');
const manualBody = (extra = {}) => ({
  date: '2026-11-20',
  productName: 'Peinture',
  price: 80,
  quantity: 3,
  category: 'Peinture',
  ...extra,
});
await test('with inventory integration: cost from the products API is stored (12.345 -> 12.35)', async () => {
  reset();
  mockProductsApi({ 5: 12.345 });
  const res = mockRes();
  await silence(() => createSale({ body: manualBody({ product_id: 5, use_inventory_integration: true }) }, res));
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const inserts = saleInserts();
  assert.equal(inserts.length, 1);
  assert.ok(hasCostColumns(inserts[0]), 'createSale should write unit_cost');
  assert.deepEqual(inserts[0].params.slice(-2), [12.35, 'sale']);
  assert.ok(!('unit_cost' in res.body) && !('cost_source' in res.body), JSON.stringify(res.body));
});
await test('with inventory integration, older products API: saved, NULL cost', async () => {
  reset();
  mockProductsApi({});
  const res = mockRes();
  await silence(() => createSale({ body: manualBody({ product_id: 5, use_inventory_integration: true }) }, res));
  assert.equal(res.statusCode, 201);
  assert.ok(!hasCostColumns(saleInserts()[0]));
});
await test('without integration (or no product): NULL cost, products API not called', async () => {
  reset();
  mockProductsApi({ 5: 12 });
  const res = mockRes();
  await silence(() => createSale({ body: manualBody({ product_id: 5 }) }, res));
  await silence(() => createSale({ body: manualBody({ use_inventory_integration: true }) }, mockRes()));
  assert.equal(res.statusCode, 201);
  assert.equal(fetchCalls.length, 0);
  assert.ok(saleInserts().every((s) => !hasCostColumns(s)));
});

console.log('\nsales_manager: Sale model');
// Runs before the "columns missing" test: Sale.js remembers missing columns for the life of the process.
await test('cost_source is "sale" unless "backfill" is asked', async () => {
  reset();
  const base = { date: '2026-11-20', product_id: 1, productName: 'A', price: 10, quantity: 1, category: 'X', totalPrice: 10 };
  await Sale.create({ ...base, unit_cost: 5, cost_source: 'whatever' });
  await Sale.create({ ...base, unit_cost: 5, cost_source: 'backfill' });
  assert.deepEqual(saleInserts().map((s) => s.params.at(-1)), ['sale', 'backfill']);
});
await test('cost columns missing (ensureFinanceTables failed): sale still saved, then cost INSERT skipped', async () => {
  reset();
  fakeState.costColumnsMissing = true;
  const base = { date: '2026-11-20', product_id: 1, productName: 'A', price: 10, quantity: 1, category: 'X', totalPrice: 10 };
  const first = await silence(() => Sale.create({ ...base, unit_cost: 5, cost_source: 'sale' }));
  assert.ok(first.id > 0);
  const afterFirst = saleInserts();
  assert.equal(afterFirst.length, 2, 'cost INSERT tried once, then base INSERT');
  assert.ok(hasCostColumns(afterFirst[0]) && !hasCostColumns(afterFirst[1]));
  await Sale.create({ ...base, unit_cost: 5, cost_source: 'sale' });
  const afterSecond = saleInserts();
  assert.equal(afterSecond.length, 3, 'second sale goes straight to the base INSERT');
  assert.ok(!hasCostColumns(afterSecond[2]));
});
await test('updateSale keeps the stored cost (UPDATE never touches unit_cost / cost_source / product_id)', async () => {
  reset();
  const res = mockRes();
  // getById returns null with the fake pool -> 404; check the model's UPDATE directly as well
  await silence(() => updateSale({ params: { id: 1 }, body: manualBody() }, res));
  await Sale.update(1, { date: '2026-11-20', productName: 'A', price: 9, quantity: 2, category: 'X', totalPrice: 18 });
  const update = fakeState.statements.find((s) => /^UPDATE sales/i.test(s.sql));
  assert.ok(update);
  assert.ok(!/unit_cost|cost_source|product_id/.test(update.sql), update.sql);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
