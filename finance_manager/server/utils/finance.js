// Pure finance helpers (FINANCE_PLAN.md §4, §6). No database: unit-testable with plain node.

export const DEFAULT_MARGIN_PCT = 30;
export const MAX_SPREAD_MONTHS = 36;

/** Money is DECIMAL in SQL and rounded to cents in JS (§4 #12). */
export const round2 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

const toCents = (value) => Math.round(Number(value) * 100);

/** Errors carry their own HTTP status: errorHandler.js ignores err.status (§4 #11). */
export const httpError = (status, message, code = undefined) => {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
};

// ---------- Dates and periods ----------

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const isValidMonth = (value) => typeof value === 'string' && MONTH_RE.test(value);
export const isValidYear = (value) => typeof value === 'string' && YEAR_RE.test(value);
export const isValidDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return d <= daysInMonth(`${y}-${String(m).padStart(2, '0')}`);
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Local calendar date 'YYYY-MM-DD' (the shop's day, not UTC). */
export const todayISO = (now = new Date()) =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

export const monthOf = (isoDate) => String(isoDate).slice(0, 7);

export const daysInMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** 'YYYY-MM' + n months (n can be negative). */
export const addMonths = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
};

/**
 * A month 'YYYY-MM' or a year 'YYYY'. Dates are half-open: from <= date < to.
 * `previous` = the period before, `lastYear` = the same period one year earlier.
 */
export const parsePeriod = (value) => {
  const period = String(value ?? '').trim();
  if (isValidMonth(period)) {
    const next = addMonths(period, 1);
    return {
      kind: 'month',
      key: period,
      from: `${period}-01`,
      to: `${next}-01`,
      months: [period],
      previous: addMonths(period, -1),
      lastYear: addMonths(period, -12),
    };
  }
  if (isValidYear(period)) {
    const year = Number(period);
    return {
      kind: 'year',
      key: period,
      from: `${year}-01-01`,
      to: `${year + 1}-01-01`,
      months: Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`),
      previous: String(year - 1),
      lastYear: String(year - 1),
    };
  }
  throw httpError(400, 'period must be YYYY-MM or YYYY', 'INVALID_PERIOD');
};

// ---------- Allocations (§4 #6) ----------

/**
 * One row per month an expense counts in. Equal parts in cents; the last month gets the leftover cents.
 * 1 200 over 12 -> 12 x 100.00 ; 1 000 over 3 -> 333.33 / 333.33 / 333.34.
 */
export const buildAllocations = (amount, periodMonth, spreadMonths = 1) => {
  const months = Math.max(1, Math.trunc(Number(spreadMonths) || 1));
  const totalCents = toCents(amount);
  const partCents = Math.floor(totalCents / months);
  return Array.from({ length: months }, (_, i) => ({
    period_month: addMonths(periodMonth, i),
    amount: (i === months - 1 ? totalCents - partCents * (months - 1) : partCents) / 100,
  }));
};

// ---------- Summary formulas (§6) ----------

const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : null);

/**
 * The profit ladder: revenue - cogs = gross margin - business expenses = net profit - withdrawals = left over.
 * Unknown-cost revenue is costed with the default margin. An empty period gives zeros, never NaN,
 * and no percentage when revenue is 0 (§12).
 */
export const computeSummary = (
  { revenue = 0, known_cogs = 0, unknown_revenue = 0, business_expenses = 0, withdrawals = 0 } = {},
  defaultMarginPct = DEFAULT_MARGIN_PCT
) => {
  const margin = Number.isFinite(Number(defaultMarginPct)) ? Number(defaultMarginPct) : DEFAULT_MARGIN_PCT;
  const r = round2(revenue);
  const unknown = round2(unknown_revenue);
  const estimatedCogs = round2(unknown * (1 - margin / 100));
  const cogs = round2(Number(known_cogs) + estimatedCogs);
  const grossMargin = round2(r - cogs);
  const expenses = round2(business_expenses);
  const netProfit = round2(grossMargin - expenses);
  const personal = round2(withdrawals);
  return {
    revenue: r,
    known_cogs: round2(known_cogs),
    unknown_revenue: unknown,
    estimated_cogs: estimatedCogs,
    cogs,
    cost_coverage_pct: r > 0 ? pct(r - unknown, r) : null,
    gross_margin: grossMargin,
    gross_margin_pct: pct(grossMargin, r),
    business_expenses: expenses,
    net_profit: netProfit,
    net_margin_pct: pct(netProfit, r),
    withdrawals: personal,
    left_over: round2(netProfit - personal),
  };
};

/** Relative change in %, or null when there is nothing to compare with. */
export const changePct = (current, previous) => {
  const p = Number(previous);
  if (!Number.isFinite(p) || p === 0) return null;
  return round2(((Number(current) - p) / Math.abs(p)) * 100);
};

// ---------- Validation ----------

const cleanText = (value, max) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text.slice(0, max);
};

/**
 * Cleans an expense body. `partial` = PUT with only some fields (missing fields stay undefined).
 * Throws httpError(400) with the first problem found.
 */
export const cleanExpenseInput = (body = {}, { partial = false, today = todayISO() } = {}) => {
  const out = {};
  const has = (key) => body[key] !== undefined;

  if (!partial || has('category_id')) {
    const categoryId = Number(body.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw httpError(400, 'category_id is required', 'INVALID_CATEGORY');
    }
    out.category_id = categoryId;
  }

  if (!partial || has('amount')) {
    const amount = round2(String(body.amount ?? '').replace(',', '.'));
    if (!(amount > 0) || amount > 9_999_999_999) {
      throw httpError(400, 'amount must be a positive number', 'INVALID_AMOUNT');
    }
    out.amount = amount;
  }

  if (!partial || has('expense_date')) {
    const date = has('expense_date') && body.expense_date ? String(body.expense_date) : today;
    if (!isValidDate(date)) throw httpError(400, 'expense_date must be YYYY-MM-DD', 'INVALID_DATE');
    out.expense_date = date;
  }

  // Month the cost belongs to (§4 #5). Defaults to the month of the payment date.
  if (!partial || has('period_month')) {
    const month = body.period_month ? String(body.period_month) : monthOf(out.expense_date ?? today);
    if (!isValidMonth(month)) throw httpError(400, 'period_month must be YYYY-MM', 'INVALID_PERIOD');
    out.period_month = month;
  }

  if (!partial || has('spread_months')) {
    const spread = body.spread_months === undefined || body.spread_months === '' ? 1 : Number(body.spread_months);
    if (!Number.isInteger(spread) || spread < 1 || spread > MAX_SPREAD_MONTHS) {
      throw httpError(400, `spread_months must be 1..${MAX_SPREAD_MONTHS}`, 'INVALID_SPREAD');
    }
    out.spread_months = spread;
  }

  if (!partial || has('status')) {
    const status = body.status ?? 'paid';
    if (status !== 'paid' && status !== 'pending') {
      throw httpError(400, "status must be 'paid' or 'pending'", 'INVALID_STATUS');
    }
    out.status = status;
  }

  if (!partial || has('due_date')) {
    const due = body.due_date ? String(body.due_date) : null;
    if (due !== null && !isValidDate(due)) throw httpError(400, 'due_date must be YYYY-MM-DD', 'INVALID_DATE');
    out.due_date = due;
  }

  // Every expense is paid from the till (§4 #17); the column stays for later.
  if (!partial || has('paid_from')) {
    const from = body.paid_from ?? 'till';
    if (!['till', 'bank', 'pocket'].includes(from)) throw httpError(400, 'invalid paid_from', 'INVALID_PAID_FROM');
    out.paid_from = from;
  }

  for (const [key, max] of [
    ['payee', 150],
    ['reference', 100],
    ['description', 255],
    ['notes', 5000],
  ]) {
    const value = cleanText(body[key], max);
    if (value !== undefined) out[key] = value;
    else if (!partial) out[key] = null;
  }

  return out;
};

/**
 * Mark a pending bill as paid (PUT /api/expenses/:id/pay). The real amount is optional (estimated
 * bills: water, electricity); the payment date defaults to today. The month concerned never changes (§4 #5).
 */
export const cleanPayInput = (body = {}, { today = todayISO() } = {}) => {
  const out = { expense_date: body.expense_date ? String(body.expense_date) : today };
  if (!isValidDate(out.expense_date)) throw httpError(400, 'expense_date must be YYYY-MM-DD', 'INVALID_DATE');
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    const amount = round2(String(body.amount).replace(',', '.'));
    if (!(amount > 0) || amount > 9_999_999_999) {
      throw httpError(400, 'amount must be a positive number', 'INVALID_AMOUNT');
    }
    out.amount = amount;
  }
  return out;
};

export const cleanCategoryInput = (body = {}, { partial = false } = {}) => {
  const out = {};
  const has = (key) => body[key] !== undefined;
  if (partial) {
    for (const key of ['name_fr', 'name_ar']) {
      if (!has(key)) continue;
      const value = cleanText(body[key], 100);
      if (!value) throw httpError(400, `${key} cannot be empty`, 'INVALID_NAME');
      out[key] = value;
    }
  } else {
    // One name is enough: the other language gets the same text until it is translated.
    const nameFr = cleanText(body.name_fr, 100);
    const nameAr = cleanText(body.name_ar, 100);
    if (!nameFr && !nameAr) throw httpError(400, 'name is required', 'INVALID_NAME');
    out.name_fr = nameFr || nameAr;
    out.name_ar = nameAr || nameFr;
  }
  for (const [key, max] of [
    ['icon', 40],
    ['color', 20],
  ]) {
    const value = cleanText(body[key], max);
    if (value !== undefined) out[key] = value;
  }
  for (const key of ['is_personal', 'is_fixed', 'archived']) {
    if (has(key)) out[key] = body[key] === true || body[key] === 1 || body[key] === '1' ? 1 : 0;
  }
  if (has('monthly_budget')) {
    const budget = body.monthly_budget === null || body.monthly_budget === '' ? null : round2(body.monthly_budget);
    if (budget !== null && !(budget >= 0)) throw httpError(400, 'invalid monthly_budget', 'INVALID_BUDGET');
    out.monthly_budget = budget;
  }
  if (has('sort_order')) out.sort_order = Math.trunc(Number(body.sort_order)) || 0;
  return out;
};

// ---------- Settings (§5.5) ----------

export const MIN_MARGIN_PCT = 0;
export const MAX_MARGIN_PCT = 95;

/** PUT /api/settings body. Only the default margin can be changed here (the PIN has its own route). */
export const cleanSettingsInput = (body = {}) => {
  const out = {};
  if (body.default_margin_pct !== undefined) {
    const margin = Number(String(body.default_margin_pct).replace(',', '.'));
    if (!Number.isFinite(margin) || margin < MIN_MARGIN_PCT || margin > MAX_MARGIN_PCT) {
      throw httpError(400, `default_margin_pct must be ${MIN_MARGIN_PCT}..${MAX_MARGIN_PCT}`, 'INVALID_MARGIN');
    }
    out.default_margin_pct = round2(margin);
  }
  if (Object.keys(out).length === 0) throw httpError(400, 'Nothing to update', 'EMPTY_BODY');
  return out;
};

// ---------- Expense list filters (GET /api/expenses) ----------

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * Query string -> clean filters. `period` (YYYY-MM or YYYY) keeps the expenses that count in that period
 * (allocations); `from` / `to` filter the payment date (inclusive). `deleted=1` lists the bin only.
 */
export const cleanExpenseFilters = (query = {}) => {
  const out = { page: 1, limit: DEFAULT_PAGE_SIZE, deleted: false };
  if (query.period) {
    const period = parsePeriod(query.period);
    out.period = { key: period.key, months: period.months, from: period.months[0], to: period.months.at(-1) };
  }
  for (const key of ['from', 'to']) {
    if (!query[key]) continue;
    if (!isValidDate(String(query[key]))) throw httpError(400, `${key} must be YYYY-MM-DD`, 'INVALID_DATE');
    out[key] = String(query[key]);
  }
  if (query.category_id) {
    const id = Number(query.category_id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'invalid category_id', 'INVALID_CATEGORY');
    out.category_id = id;
  }
  if (query.status) {
    if (query.status !== 'paid' && query.status !== 'pending') {
      throw httpError(400, "status must be 'paid' or 'pending'", 'INVALID_STATUS');
    }
    out.status = query.status;
  }
  const q = String(query.q ?? '').trim();
  if (q) out.q = q.slice(0, 100);
  if (query.deleted === '1' || query.deleted === 'true' || query.deleted === true) out.deleted = true;
  const page = Number(query.page);
  if (Number.isInteger(page) && page > 0) out.page = page;
  const limit = Number(query.limit);
  if (Number.isInteger(limit) && limit > 0) out.limit = Math.min(limit, MAX_PAGE_SIZE);
  return out;
};

/** Positive integer id from a route param, or a 400. */
export const parseId = (value, label = 'id') => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `invalid ${label}`, 'INVALID_ID');
  return id;
};

/** Months 'YYYY-MM' from `from` to `to`, both included. */
export const monthRange = (from, to) => {
  const out = [];
  for (let month = from; month <= to && out.length < 1200; month = addMonths(month, 1)) out.push(month);
  return out;
};
