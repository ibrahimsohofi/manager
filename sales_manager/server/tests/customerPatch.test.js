// Partial client update (ROADMAP_V2.md B-04 / F-09): validation + "only what changed" of PATCH /api/customers/:id.
// Run: bun run test   (node --test tests/*.test.js). Pure helpers only: no database.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildCustomerPatch, CUSTOMER_TYPES, PATCHABLE_FIELDS, parseVipFlag } from '../utils/customerPatch.js';

// Stored row as mysql2 returns it (DECIMAL as string, TINYINT as 0 / 1, empty columns as NULL)
const stored = {
  id: 7,
  name: 'Ahmed Benali',
  code: '009',
  phone: '0612345678',
  email: null,
  address: null,
  city: 'Agadir',
  postal_code: null,
  customer_type: 'retail',
  credit_limit: '500.00',
  notes: null,
  is_vip: 0,
  is_active: 1,
};

describe('parseVipFlag', () => {
  test('truthy spellings -> 1, anything else -> 0, not sent -> undefined', () => {
    for (const value of [true, 1, '1', 'true', 'TRUE', 'on']) assert.equal(parseVipFlag(value), 1, String(value));
    for (const value of [false, 0, '0', 'false', 'off', '', null]) assert.equal(parseVipFlag(value), 0, String(value));
    assert.equal(parseVipFlag(undefined), undefined);
  });
});

describe('buildCustomerPatch', () => {
  test('a single field: only that column, normalized', () => {
    const result = buildCustomerPatch({ phone: '  0699 11 22 33 ' }, stored);
    assert.deepEqual(result.changes, { phone: '0699 11 22 33' });
    assert.deepEqual(result.errors, {});
    assert.equal(result.received, 1);
  });

  test('the full edit form with nothing changed writes nothing (F-09: no blind overwrite)', () => {
    const form = {
      name: 'Ahmed Benali',
      code: '009',
      phone: '0612345678',
      email: '',
      address: '',
      city: 'Agadir',
      postal_code: '',
      customer_type: 'retail',
      credit_limit: 500,
      notes: '',
      is_vip: false,
    };
    const result = buildCustomerPatch(form, stored);
    assert.deepEqual(result.changes, {});
    assert.deepEqual(result.errors, {});
    assert.equal(result.received, Object.keys(form).length);
  });

  test('empty text clears the column (null), spaces in the name are collapsed', () => {
    const result = buildCustomerPatch({ city: '   ', name: '  Ahmed   Ben  Ali ' }, stored);
    assert.deepEqual(result.changes, { city: null, name: 'Ahmed Ben Ali' });
  });

  test('client number: null or empty clears it, same number is not rewritten', () => {
    assert.deepEqual(buildCustomerPatch({ code: null }, stored).changes, { code: null });
    assert.deepEqual(buildCustomerPatch({ code: '' }, stored).changes, { code: null });
    assert.deepEqual(buildCustomerPatch({ code: ' 009 ' }, stored).changes, {});
    assert.deepEqual(buildCustomerPatch({ code: '010' }, stored).changes, { code: '010' });
  });

  test('credit limit: French comma and spaces, rounding, compared as a number', () => {
    assert.deepEqual(buildCustomerPatch({ credit_limit: '1 500,456' }, stored).changes, { credit_limit: 1500.46 });
    assert.deepEqual(buildCustomerPatch({ credit_limit: '500' }, stored).changes, {});
    assert.deepEqual(buildCustomerPatch({ credit_limit: '' }, stored).changes, { credit_limit: 0 });
  });

  test('VIP / active flags are compared with the stored 0 / 1', () => {
    assert.deepEqual(buildCustomerPatch({ is_vip: true }, stored).changes, { is_vip: 1 });
    assert.deepEqual(buildCustomerPatch({ is_vip: false, is_active: true }, stored).changes, {});
  });

  test('field errors use the codes the UI translates', () => {
    const { changes, errors } = buildCustomerPatch(
      {
        name: '   ',
        email: 'not-an-email',
        customer_type: 'vip',
        credit_limit: '-5',
        phone: 'x'.repeat(51),
        city: 'Tiznit',
      },
      stored
    );
    assert.deepEqual(errors, {
      name: 'required',
      email: 'invalidEmail',
      customer_type: 'invalid',
      credit_limit: 'negative',
      phone: 'tooLong',
    });
    assert.deepEqual(changes, { city: 'Tiznit' });
    assert.equal(buildCustomerPatch({ credit_limit: '12abc' }, stored).errors.credit_limit, 'invalid');
    assert.equal(buildCustomerPatch({ credit_limit: 1e12 }, stored).errors.credit_limit, 'tooLong');
  });

  test('customer types are the three the schema allows, case-insensitive', () => {
    assert.deepEqual(CUSTOMER_TYPES, ['retail', 'wholesale', 'commercial']);
    assert.deepEqual(buildCustomerPatch({ customer_type: ' Wholesale ' }, stored).changes, { customer_type: 'wholesale' });
  });

  test('unknown and read-only fields are reported, never written', () => {
    const result = buildCustomerPatch({ id: 99, total_paid: 1000, balance: 3, created_at: 'x', notes: 'av 500dh' }, stored);
    assert.deepEqual(result.changes, { notes: 'av 500dh' });
    assert.deepEqual(result.unknown, ['id', 'total_paid', 'balance', 'created_at']);
    assert.equal(result.received, 1);
    assert.ok(!PATCHABLE_FIELDS.includes('id'));
    assert.ok(!PATCHABLE_FIELDS.includes('balance'));
  });

  test('undefined values are "not sent"; a body that is not an object counts as empty', () => {
    assert.equal(buildCustomerPatch({ name: undefined }, stored).received, 0);
    for (const body of [null, undefined, 'name=x', ['name'], 42]) {
      const result = buildCustomerPatch(body, stored);
      assert.equal(result.received, 0);
      assert.deepEqual(result.changes, {});
    }
  });

  test('without a stored row every valid field counts as a change (missing flags count as 0)', () => {
    assert.deepEqual(buildCustomerPatch({ name: 'Nouveau', is_vip: '1' }).changes, { name: 'Nouveau', is_vip: 1 });
    assert.deepEqual(buildCustomerPatch({ is_vip: '0' }).changes, {});
  });
});
