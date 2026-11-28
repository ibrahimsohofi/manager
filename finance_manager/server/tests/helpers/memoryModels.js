// Test doubles of the database models: in-memory versions of models/ExpenseCategory.js, models/Expense.js,
// models/Settings.js and models/SalesSource.js, with the same public methods and result shapes, so app.js,
// the routes and models/Finance.js run unchanged on top of them. Tests only: they start EMPTY (only the
// 15 default categories, like a fresh `finance_manager` database) and every test adds its own explicit rows.
import { FINANCE_SEED_CATEGORIES } from '../../config/financeSchema.js';
import { toExpense } from '../../models/Expense.js';
import { createFinanceModel } from '../../models/Finance.js';
import { SALES_UNAVAILABLE } from '../../models/SalesSource.js';
import { SETTING_KEYS, marginFrom } from '../../models/Settings.js';
import { createStockSource } from '../../models/StockSource.js';
import {
  buildAllocations,
  cleanCategoryInput,
  cleanExpenseInput,
  cleanPayInput,
  cleanSettingsInput,
  httpError,
  round2,
  todayISO,
} from '../../utils/finance.js';

const CATEGORY_COLUMNS = ['name_fr', 'name_ar', 'icon', 'color', 'is_personal', 'is_fixed', 'monthly_budget', 'sort_order', 'archived'];
const EXPENSE_COLUMNS = [
  'category_id',
  'amount',
  'expense_date',
  'period_month',
  'spread_months',
  'status',
  'due_date',
  'paid_from',
  'payee',
  'reference',
  'description',
  'notes',
];
const ALLOCATION_KEYS = ['amount', 'period_month', 'spread_months'];

const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const sortByKey = (rows) => rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

/**
 * Shared state of the three models (the SQL models share one database).
 * @param {{today?: () => string, seedCategories?: boolean}} options
 */
export const createMemoryStore = ({ today = todayISO, seedCategories = true } = {}) => {
  const store = {
    today,
    categories: [],
    expenses: [],
    allocations: new Map(), // expense id -> [{ period_month, amount }]
    settings: new Map(),
    nextCategoryId: 1,
    nextExpenseId: 1,
  };
  if (seedCategories) {
    FINANCE_SEED_CATEGORIES.forEach((seed, index) => {
      store.categories.push({
        id: store.nextCategoryId++,
        code: seed.code,
        name_fr: seed.name_fr,
        name_ar: seed.name_ar,
        icon: seed.icon ?? null,
        color: seed.color ?? null,
        is_personal: seed.is_personal ? 1 : 0,
        is_fixed: seed.is_fixed ? 1 : 0,
        monthly_budget: null,
        sort_order: index + 1,
        archived: 0,
      });
    });
  }
  return store;
};

// ---------- Categories (models/ExpenseCategory.js) ----------

export const createMemoryCategoryModel = (store) => {
  const view = (row) => ({
    id: row.id,
    code: row.code ?? null,
    name_fr: row.name_fr,
    name_ar: row.name_ar,
    icon: row.icon ?? null,
    color: row.color ?? null,
    is_personal: Boolean(row.is_personal),
    is_fixed: Boolean(row.is_fixed),
    monthly_budget: row.monthly_budget === null || row.monthly_budget === undefined ? null : round2(row.monthly_budget),
    sort_order: Number(row.sort_order) || 0,
    archived: Boolean(row.archived),
    expense_count: store.expenses.filter((e) => e.category_id === row.id && !e.deleted_at).length,
  });
  const find = (id) => store.categories.find((c) => c.id === id);
  const get = async (id) => {
    const row = find(id);
    if (!row) throw httpError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
    return view(row);
  };
  return {
    get,
    async list({ includeArchived = false } = {}) {
      return store.categories
        .filter((c) => includeArchived || !c.archived)
        .sort((a, b) => a.archived - b.archived || a.sort_order - b.sort_order || a.id - b.id)
        .map(view);
    },
    async assertUsable(id, { allowArchived = false } = {}) {
      const row = find(id);
      if (!row) throw httpError(400, 'Unknown category', 'INVALID_CATEGORY');
      if (!allowArchived && row.archived) throw httpError(400, 'This category is archived', 'CATEGORY_ARCHIVED');
    },
    async create(body) {
      const input = cleanCategoryInput(body);
      if (input.sort_order === undefined) {
        input.sort_order = store.categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;
      }
      const row = {
        id: store.nextCategoryId++,
        code: null,
        icon: null,
        color: null,
        is_personal: 0,
        is_fixed: 0,
        monthly_budget: null,
        archived: 0,
      };
      for (const key of CATEGORY_COLUMNS) if (input[key] !== undefined) row[key] = input[key];
      store.categories.push(row);
      return get(row.id);
    },
    async update(id, body) {
      const input = cleanCategoryInput(body, { partial: true });
      const row = find(id);
      if (!row) throw httpError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
      for (const key of CATEGORY_COLUMNS) if (input[key] !== undefined) row[key] = input[key];
      return get(id);
    },
    /** Deletes an unused category, archives a used one (deleted expenses count: they can be restored). */
    async remove(id) {
      const row = find(id);
      if (!row) throw httpError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
      if (store.expenses.some((e) => e.category_id === id)) {
        row.archived = 1;
        return { id, deleted: false, archived: true };
      }
      store.categories = store.categories.filter((c) => c.id !== id);
      return { id, deleted: true, archived: false };
    },
  };
};

// ---------- Expenses (models/Expense.js) ----------

export const createMemoryExpenseModel = (store, { categories }) => {
  const category = (id) => store.categories.find((c) => c.id === id);
  // Same row shape as the SQL SELECT, then the same toExpense() mapper.
  const view = (row, periodAmount = undefined) => {
    const c = category(row.category_id);
    return toExpense({
      ...row,
      period_amount: periodAmount,
      c_name_fr: c?.name_fr,
      c_name_ar: c?.name_ar,
      c_icon: c?.icon,
      c_color: c?.color,
      c_is_personal: c?.is_personal ?? 0,
      c_is_fixed: c?.is_fixed ?? 0,
      c_archived: c?.archived ?? 0,
    });
  };
  const find = (id) => store.expenses.find((e) => e.id === id);
  const writeAllocations = (id, { amount, period_month, spread_months }) => {
    store.allocations.set(id, buildAllocations(amount, period_month, spread_months));
  };
  const get = async (id, { includeDeleted = true } = {}) => {
    const row = find(id);
    if (!row || (!includeDeleted && row.deleted_at)) throw httpError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
    return { ...view(row), allocations: (store.allocations.get(id) ?? []).map((a) => ({ ...a })) };
  };
  const live = (id) => {
    const row = find(id);
    if (!row || row.deleted_at) throw httpError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
    return row;
  };
  // Live expenses with their allocations in [fromMonth, toMonth] (or all months).
  const liveAllocations = (fromMonth = null, toMonth = null) => {
    const out = [];
    for (const e of store.expenses) {
      if (e.deleted_at) continue;
      for (const a of store.allocations.get(e.id) ?? []) {
        if (fromMonth && (a.period_month < fromMonth || a.period_month > toMonth)) continue;
        out.push({ expense: e, category: category(e.category_id), allocation: a });
      }
    }
    return out;
  };
  const bucketTotals = (items, bucketOf) => {
    const buckets = new Map();
    for (const { expense, category: c, allocation } of items) {
      const key = bucketOf(allocation);
      const row = buckets.get(key) ?? { key, business: 0, personal: 0, fixed: 0, pending: 0 };
      const personal = Boolean(c?.is_personal);
      if (personal) row.personal += allocation.amount;
      else row.business += allocation.amount;
      if (!personal && c?.is_fixed) row.fixed += allocation.amount;
      if (expense.status === 'pending') row.pending += allocation.amount;
      buckets.set(key, row);
    }
    return sortByKey(
      [...buckets.values()].map((row) => ({
        key: row.key,
        business: round2(row.business),
        personal: round2(row.personal),
        fixed: round2(row.fixed),
        pending: round2(row.pending),
      }))
    );
  };

  return {
    get: (id) => get(id),
    async list(filters) {
      const q = filters.q ? filters.q.toLowerCase() : null;
      const matched = [];
      for (const e of store.expenses) {
        if (filters.deleted ? !e.deleted_at : e.deleted_at) continue;
        let periodAmount;
        if (filters.period) {
          const parts = (store.allocations.get(e.id) ?? []).filter(
            (a) => a.period_month >= filters.period.from && a.period_month <= filters.period.to
          );
          if (parts.length === 0) continue;
          periodAmount = round2(parts.reduce((acc, a) => acc + a.amount, 0));
        }
        if (filters.from && e.expense_date < filters.from) continue;
        if (filters.to && e.expense_date > filters.to) continue;
        if (filters.category_id && e.category_id !== filters.category_id) continue;
        if (filters.status && e.status !== filters.status) continue;
        if (q) {
          const c = category(e.category_id);
          const haystack = [e.description, e.payee, e.reference, e.notes, c?.name_fr, c?.name_ar]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) continue;
        }
        matched.push({ row: e, periodAmount });
      }
      matched.sort((a, b) =>
        a.row.expense_date === b.row.expense_date ? b.row.id - a.row.id : a.row.expense_date < b.row.expense_date ? 1 : -1
      );
      const totals = { count: matched.length, counted: 0, business: 0, personal: 0, paid: 0, pending: 0 };
      for (const { row, periodAmount } of matched) {
        const counted = filters.period ? periodAmount : row.amount;
        totals.counted += counted;
        if (category(row.category_id)?.is_personal) totals.personal += counted;
        else totals.business += counted;
        if (row.status === 'paid') totals.paid += counted;
        else totals.pending += counted;
      }
      const offset = (filters.page - 1) * filters.limit;
      return {
        rows: matched.slice(offset, offset + filters.limit).map(({ row, periodAmount }) => view(row, periodAmount)),
        page: filters.page,
        limit: filters.limit,
        pages: Math.max(1, Math.ceil(matched.length / filters.limit)),
        totals: {
          count: totals.count,
          counted: round2(totals.counted),
          business: round2(totals.business),
          personal: round2(totals.personal),
          paid: round2(totals.paid),
          pending: round2(totals.pending),
        },
      };
    },
    async create(body) {
      const input = cleanExpenseInput(body, { today: store.today() });
      await categories.assertUsable(input.category_id);
      const stamp = nowStamp();
      const row = {
        id: store.nextExpenseId++,
        attachment_url: null,
        recurring_id: body.recurring_id ?? null,
        deleted_at: null,
        created_at: stamp,
        updated_at: stamp,
      };
      for (const key of EXPENSE_COLUMNS) row[key] = input[key] ?? null;
      store.expenses.push(row);
      writeAllocations(row.id, row);
      return get(row.id);
    },
    async update(id, body) {
      const input = cleanExpenseInput(body, { partial: true, today: store.today() });
      const keys = EXPENSE_COLUMNS.filter((key) => input[key] !== undefined);
      if (keys.length === 0) return get(id, { includeDeleted: false });
      const row = live(id);
      if (input.category_id !== undefined) {
        await categories.assertUsable(input.category_id, { allowArchived: input.category_id === row.category_id });
      }
      const moved = ALLOCATION_KEYS.some((key) => input[key] !== undefined && input[key] !== row[key]);
      for (const key of keys) row[key] = input[key];
      row.updated_at = nowStamp();
      if (moved) writeAllocations(id, row);
      return get(id);
    },
    async pay(id, body) {
      const input = cleanPayInput(body, { today: store.today() });
      const row = live(id);
      if (row.status === 'paid') throw httpError(409, 'Expense already paid', 'ALREADY_PAID');
      const amount = input.amount ?? row.amount;
      const changed = amount !== row.amount;
      row.status = 'paid';
      row.expense_date = input.expense_date;
      row.amount = amount;
      row.updated_at = nowStamp();
      if (changed) writeAllocations(id, row);
      return get(id);
    },
    async remove(id) {
      const row = live(id);
      row.deleted_at = nowStamp();
      return { id, deleted: true };
    },
    async restore(id) {
      const row = find(id);
      if (row?.deleted_at) row.deleted_at = null;
      return get(id);
    },
    async totalsByMonth(fromMonth, toMonth) {
      return bucketTotals(liveAllocations(fromMonth, toMonth), (a) => a.period_month);
    },
    async totalsByYear() {
      return bucketTotals(liveAllocations(), (a) => a.period_month.slice(0, 4));
    },
    async byCategory(fromMonth, toMonth) {
      const map = new Map();
      for (const { expense, allocation } of liveAllocations(fromMonth, toMonth)) {
        const row = map.get(expense.category_id) ?? {
          category_id: expense.category_id,
          amount: 0,
          paid: 0,
          pending: 0,
          ids: new Set(),
        };
        row.amount += allocation.amount;
        if (expense.status === 'paid') row.paid += allocation.amount;
        else row.pending += allocation.amount;
        row.ids.add(expense.id);
        map.set(expense.category_id, row);
      }
      return [...map.values()].map((row) => ({
        category_id: row.category_id,
        amount: round2(row.amount),
        paid: round2(row.paid),
        pending: round2(row.pending),
        count: row.ids.size,
      }));
    },
    async paidByDay(fromDate, toDate) {
      const map = new Map();
      for (const e of store.expenses) {
        if (e.deleted_at || e.status !== 'paid' || e.expense_date < fromDate || e.expense_date >= toDate) continue;
        const row = map.get(e.expense_date) ?? { key: e.expense_date, amount: 0, count: 0 };
        row.amount += e.amount;
        row.count += 1;
        map.set(e.expense_date, row);
      }
      return sortByKey([...map.values()].map((row) => ({ ...row, amount: round2(row.amount) })));
    },
    async pending({ limit = 20 } = {}) {
      const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 20, 1), 100);
      const rows = store.expenses
        .filter((e) => !e.deleted_at && e.status === 'pending')
        .sort((a, b) => {
          if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
          if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
          if (a.expense_date !== b.expense_date) return a.expense_date < b.expense_date ? -1 : 1;
          return a.id - b.id;
        });
      return {
        rows: rows.slice(0, safeLimit).map((row) => view(row)),
        count: rows.length,
        amount: round2(rows.reduce((acc, row) => acc + row.amount, 0)),
      };
    },
  };
};

// ---------- Settings (models/Settings.js) ----------

export const createMemorySettingsModel = (store) => {
  const model = {
    async getMargin() {
      return marginFrom(store.settings.get(SETTING_KEYS.margin) ?? null);
    },
    async getPinHash() {
      const value = store.settings.get(SETTING_KEYS.pin);
      return value ? String(value) : null;
    },
    async setPinHashIfEmpty(hash) {
      if (store.settings.get(SETTING_KEYS.pin)) return false;
      store.settings.set(SETTING_KEYS.pin, hash);
      return true;
    },
    async setPinHash(hash) {
      store.settings.set(SETTING_KEYS.pin, hash);
    },
    async public() {
      const [margin, pin] = await Promise.all([model.getMargin(), model.getPinHash()]);
      return { default_margin_pct: margin, pin_set: Boolean(pin) };
    },
    async update(body) {
      const input = cleanSettingsInput(body);
      if (input.default_margin_pct !== undefined) store.settings.set(SETTING_KEYS.margin, String(input.default_margin_pct));
      return model.public();
    },
  };
  return model;
};

// ---------- Sales (models/SalesSource.js) ----------

const unavailable = () => {
  const error = new Error('Sales database unavailable');
  error.code = SALES_UNAVAILABLE;
  error.cause_code = 'TEST_SALES_DOWN';
  return error;
};

const emptyTotals = () => ({ revenue: 0, known_cogs: 0, unknown_revenue: 0, lines: 0, unknown_lines: 0 });
const addLine = (acc, line) => {
  const known = Number(line.unit_cost) > 0;
  acc.revenue += line.totalPrice;
  acc.lines += 1;
  if (known) acc.known_cogs += line.quantity * line.unit_cost;
  else {
    acc.unknown_revenue += line.totalPrice;
    acc.unknown_lines += 1;
  }
  return acc;
};
const finish = (acc) => ({
  revenue: round2(acc.revenue),
  known_cogs: round2(acc.known_cogs),
  unknown_revenue: round2(acc.unknown_revenue),
  lines: acc.lines,
  unknown_lines: acc.unknown_lines,
});

/**
 * Same interface as createSalesSource() (models/SalesSource.js), over the sale lines a test passes in
 * (rows shaped like `bricojamal.sales` + `unit_cost`). `available: false` = the sales database is down.
 */
export const createMemorySalesSource = (lines = [], { available = true, hasUnitCost = true } = {}) => {
  const checkedAt = new Date().toISOString();
  const days = new Map();
  for (const line of lines) days.set(line.date, addLine(days.get(line.date) ?? emptyTotals(), line));
  const dayKeys = [...days.keys()].sort();
  const guard = () => {
    if (!available) throw unavailable();
  };
  const grouped = (bucketOf, from = null, to = null) => {
    const buckets = new Map();
    for (const key of dayKeys) {
      if (from && (key < from || key >= to)) continue;
      const bucket = bucketOf(key);
      const acc = buckets.get(bucket) ?? emptyTotals();
      const day = days.get(key);
      for (const field of Object.keys(acc)) acc[field] += day[field];
      buckets.set(bucket, acc);
    }
    return [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, acc]) => ({ key, ...finish(acc) }));
  };
  return {
    async status() {
      if (!available) {
        return { available: false, has_unit_cost: hasUnitCost, checked_at: new Date().toISOString(), last_success_at: null, error_code: 'TEST_SALES_DOWN' };
      }
      return { available: true, has_unit_cost: hasUnitCost, checked_at: checkedAt, error_code: null };
    },
    async totals(from, to) {
      guard();
      const acc = emptyTotals();
      for (const key of dayKeys) {
        if (key < from || key >= to) continue;
        const day = days.get(key);
        for (const field of Object.keys(acc)) acc[field] += day[field];
      }
      return finish(acc);
    },
    async byMonth(from, to) {
      guard();
      return grouped((key) => key.slice(0, 7), from, to);
    },
    async byDay(from, to) {
      guard();
      return grouped((key) => key, from, to);
    },
    async byYear() {
      guard();
      return grouped((key) => key.slice(0, 4));
    },
    async unknownCostLines(from, to, { limit = 50, offset = 0 } = {}) {
      guard();
      const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);
      const safeOffset = Math.max(Math.trunc(Number(offset)) || 0, 0);
      const unknown = lines
        .filter((line) => line.date >= from && line.date < to && !(Number(line.unit_cost) > 0))
        .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
      return {
        total: unknown.length,
        revenue: round2(unknown.reduce((acc, line) => acc + line.totalPrice, 0)),
        limit: safeLimit,
        offset: safeOffset,
        rows: unknown.slice(safeOffset, safeOffset + safeLimit).map((line) => ({
          id: line.id,
          sale_number: line.sale_number,
          ticket: /\[(TKT-[^\]\s]+)\]/.exec(line.notes ?? '')?.[1] ?? null,
          date: line.date,
          product_id: line.product_id,
          product_name: line.productName,
          category: line.category,
          quantity: line.quantity,
          total_price: line.totalPrice,
        })),
      };
    },
  };
};

// ---------- Full model set ----------

/** Products API that never answers (stopped): the stock block shows "unavailable". */
const productsApiDown = async () => {
  throw new TypeError('fetch failed');
};

/**
 * The object server.js passes to createApp(), in memory: empty expenses, the 15 default categories,
 * no PIN, and only the sale lines given by the test. `productsFetch` stands in for the products_manager
 * API (GET /api/stats*) read by the stock block; by default that API is down.
 * @param {{today?: () => string, sales?: object[], salesAvailable?: boolean, salesAppUrl?: string|null,
 *   productsFetch?: typeof fetch}} options
 */
export const createTestModels = ({
  today = todayISO,
  sales = [],
  salesAvailable = true,
  salesAppUrl = null,
  productsFetch = productsApiDown,
} = {}) => {
  const store = createMemoryStore({ today });
  const categories = createMemoryCategoryModel(store);
  const expenses = createMemoryExpenseModel(store, { categories });
  const settings = createMemorySettingsModel(store);
  const salesSource = createMemorySalesSource(sales, { available: salesAvailable });
  const finance = createFinanceModel({ sales: salesSource, expenses, categories, settings, salesAppUrl, today });
  const stock = createStockSource({
    baseUrl: 'http://products.test',
    fetchImpl: productsFetch,
    today,
    failFastMs: 0,
    logger: { log() {}, warn() {} },
  });
  return { store, models: { expenses, categories, settings, sales: salesSource, finance, stock } };
};

/** One sale line shaped like a `bricojamal.sales` row. `cost` = unit cost (null = unknown cost). */
export const saleLine = (id, date, total, cost = null, { quantity = 1, productName = `Article ${id}` } = {}) => ({
  id,
  sale_number: `S-${id}`,
  date,
  product_id: cost === null ? null : id,
  productName,
  category: 'Divers',
  quantity,
  totalPrice: total,
  unit_cost: cost,
  payment_method: 'cash',
  notes: `[TKT-${date.replaceAll('-', '')}-${String(id).padStart(3, '0')}]`,
});
