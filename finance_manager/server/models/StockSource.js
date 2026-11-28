// Stock & purchase numbers (FINANCE_PLAN.md §8.1, decisions 21 / 30), moved from the products_manager home page.
// The data stays in products_manager: this file only reads its public endpoints over HTTP (PRODUCTS_API_URL):
//   GET /api/stats                   -> stock value at sale / purchase price, money spent this month / year
//   GET /api/stats/spending          -> 12 months + totals per year
//   GET /api/stats/spending/entries  -> purchase lines of one month
// So the finance API never needs the catalogue database credentials. Answers are normalised to snake_case
// numbers (MySQL DECIMAL sums can arrive as strings).
//
// - Products API down (stopped, timeout, 404 from the sales_manager products mirror, non-JSON answer,
//   `success: false`): summary() resolves `{ available: false }` (HTTP 200, the rest of Finances keeps working);
//   spending() / entries() throw a 503 STOCK_UNAVAILABLE that the report shows with a retry button.
// - For `failFastMs` after a failure the next calls fail at once (no timeout wait per request).
//   `refresh: true` retries now.
// - Purchases are never an expense (§2): nothing here enters the profit formulas.
import { httpError, isValidMonth, isValidYear, round2, todayISO } from '../utils/finance.js';

export const STOCK_UNAVAILABLE = 'STOCK_UNAVAILABLE';
/** restock = stock increase on edit, initial = stock of a new product, opening = tracking start snapshot */
export const SPENDING_SOURCES = Object.freeze(['restock', 'initial', 'opening']);

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_FAIL_FAST_MS = 10_000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const money = (value) => round2(value);
const int = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/** Year from the query: missing -> current year, anything else must be 2000..2100. */
const cleanYear = (value, currentYear) => {
  if (value === undefined || value === null || value === '') return currentYear;
  const text = String(value).trim();
  const year = Number(text);
  if (!isValidYear(text) || year < MIN_YEAR || year > MAX_YEAR) {
    throw httpError(400, `Invalid year "${text}"`, 'INVALID_PERIOD');
  }
  return year;
};

const cleanMonth = (value) => {
  const month = Number(String(value ?? '').trim());
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw httpError(400, `Invalid month "${value ?? ''}"`, 'INVALID_PERIOD');
  }
  return month;
};

const clampInt = (value, fallback, min, max) => {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const totals = (row = {}) => ({
  total: money(row.total),
  quantity: int(row.quantity),
  entries: int(row.entries),
});

/**
 * @param {{baseUrl: string, fetchImpl?: typeof fetch, timeoutMs?: number, failFastMs?: number,
 *   today?: () => string, now?: () => Date, logger?: Console}} deps
 */
export const createStockSource = ({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  failFastMs = DEFAULT_FAIL_FAST_MS,
  today = todayISO,
  now = () => new Date(),
  logger = console,
}) => {
  const root = String(baseUrl).replace(/\/+$/, '');
  let downUntil = 0;
  let lastFailure = null;

  const unavailable = () => httpError(503, 'Stock data unavailable (products_manager API)', STOCK_UNAVAILABLE);

  /** GET <PRODUCTS_API_URL>/api<path>. Throws STOCK_UNAVAILABLE on any failure. */
  const getJson = async (path, params = {}, { refresh = false } = {}) => {
    if (!refresh && Date.now() < downUntil) throw unavailable();
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const url = `${root}/api${path}${query.size > 0 ? `?${query}` : ''}`;
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!body || typeof body !== 'object' || body.success === false) {
        throw new Error(body?.error || 'unexpected answer');
      }
      if (lastFailure) logger.log?.(`✅ products_manager API reachable again (${root})`);
      downUntil = 0;
      lastFailure = null;
      return body;
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? `no answer after ${timeoutMs} ms` : error?.message || String(error);
      // Log the first failure only, not every request while it stays down.
      if (!lastFailure) logger.warn?.(`⚠️  products_manager API unavailable (${url}): ${reason}`);
      lastFailure = reason;
      downUntil = Date.now() + failFastMs;
      throw unavailable();
    }
  };

  return {
    /**
     * The 3 cards. Stock values are a live snapshot (the catalogue keeps no history). The purchases follow the
     * period: the selected month + its year (a year period: the year only).
     * @param {string} periodValue 'YYYY-MM' or 'YYYY' (anything else: the current month)
     */
    async summary(periodValue, { refresh = false } = {}) {
      const todayIso = today();
      const currentMonth = todayIso.slice(0, 7);
      const currentYear = Number(todayIso.slice(0, 4));
      const raw = String(periodValue ?? '').trim();
      const period = isValidMonth(raw) || isValidYear(raw) ? raw : currentMonth;
      const year = Number(period.slice(0, 4));
      const month = period.length === 7 ? period : null;
      try {
        const { stats = {} } = await getJson('/stats', {}, { refresh });
        const saleValue = money(stats.totalStockValue);
        const costValue = money(stats.stockCostValue);
        let monthTotal = null;
        let yearTotal;
        let allTime = money(stats.spentAllTime);
        if (year === currentYear && (month === null || month === currentMonth)) {
          // /api/stats already has this month / this year
          if (month) monthTotal = money(stats.spentThisMonth);
          yearTotal = money(stats.spentThisYear);
        } else if (year < MIN_YEAR || year > MAX_YEAR) {
          if (month) monthTotal = 0;
          yearTotal = 0;
        } else {
          const report = await getJson('/stats/spending', { year });
          if (month) {
            const row = (report.months ?? []).find((m) => int(m.month) === Number(month.slice(5)));
            monthTotal = money(row?.total);
          }
          yearTotal = money(report.yearTotal);
          allTime = money(report.allTimeTotal);
        }
        const potentialMargin = round2(saleValue - costValue);
        return {
          available: true,
          period,
          as_of: now().toISOString(),
          stock_sale_value: saleValue,
          stock_cost_value: costValue,
          potential_margin: potentialMargin,
          potential_margin_pct: saleValue > 0 ? round2((potentialMargin / saleValue) * 100) : null,
          spending: { month, year, month_total: monthTotal, year_total: yearTotal, all_time: allTime },
        };
      } catch (error) {
        if (error?.code === STOCK_UNAVAILABLE) return { available: false, period };
        throw error;
      }
    },

    /** Spending report: the 12 months of `year` + totals per year. */
    async spending(yearValue) {
      const currentYear = Number(today().slice(0, 4));
      const year = cleanYear(yearValue, currentYear);
      const body = await getJson('/stats/spending', { year });
      const byMonth = new Map((body.months ?? []).map((m) => [int(m.month), m]));
      return {
        year: int(body.year) || year,
        current_year: currentYear,
        months: Array.from({ length: 12 }, (_, index) => {
          const row = byMonth.get(index + 1) ?? {};
          return { month: index + 1, ...totals(row), opening_total: money(row.openingTotal) };
        }),
        year_total: money(body.yearTotal),
        all_time_total: money(body.allTimeTotal),
        years: (body.years ?? [])
          .map((row) => ({ year: int(row.year), ...totals(row) }))
          .filter((row) => row.year >= MIN_YEAR)
          .sort((a, b) => b.year - a.year),
      };
    },

    /** Purchase lines of one month. `summary` / `by_source` cover the whole month, the rest follows `source`. */
    async entries(query = {}) {
      const currentYear = Number(today().slice(0, 4));
      const year = cleanYear(query.year, currentYear);
      const month = cleanMonth(query.month);
      const source = SPENDING_SOURCES.includes(query.source) ? query.source : 'all';
      const page = clampInt(query.page, 1, 1, 100_000);
      const limit = clampInt(query.limit, 20, 1, 100);
      const body = await getJson('/stats/spending/entries', { year, month, source, page, limit });
      const summary = body.summary ?? {};
      const pagination = body.pagination ?? {};
      return {
        year: int(body.year) || year,
        month: int(body.month) || month,
        source: body.source ?? source,
        summary: { ...totals(summary), products: int(summary.products) },
        by_source: (body.bySource ?? [])
          .filter((row) => SPENDING_SOURCES.includes(row.source))
          .map((row) => ({ source: row.source, ...totals(row) })),
        filtered: totals(body.filtered),
        rows: (body.entries ?? []).map((row) => ({
          id: int(row.id),
          product_id: row.product_id === null || row.product_id === undefined ? null : int(row.product_id),
          product_name: row.product_name ?? null,
          current_name: row.current_name ?? null,
          product_exists: Boolean(row.product_exists),
          quantity: int(row.quantity),
          unit_cost: money(row.unit_cost),
          total_cost: money(row.total_cost),
          source: row.source,
          purchased_at: row.purchased_at ?? null,
        })),
        page: int(pagination.currentPage) || page,
        pages: Math.max(1, int(pagination.totalPages)),
        total: int(pagination.totalItems),
        limit: int(pagination.itemsPerPage) || limit,
      };
    },
  };
};
