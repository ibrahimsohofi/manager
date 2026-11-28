// Finance numbers (FINANCE_PLAN.md §2, §6, §8). Combines the sales totals (read-only `bricojamal`, SalesSource)
// with the expense allocations (finance database) in JS: no cross-database JOIN (§1.1).
// Only calls the public methods of the models: runs on the SQL models and on the in-memory test doubles.
//
// Sales database down: every method still answers (HTTP 200) with `sales_available: false` and the
// sales-based numbers set to null. Expenses keep working (§1.1).
//
// Break-even: the revenue needed to cover the business expenses of the period at the period's gross margin
// rate (business_expenses / gross_margin_pct). The §2 example gives 7 170 / 0.30 = 23 900 DH, about 797 DH/day.
import {
  addMonths,
  changePct,
  computeSummary,
  daysInMonth,
  httpError,
  isValidYear,
  monthOf,
  parsePeriod,
  round2,
  todayISO,
} from '../utils/finance.js';
import { isSalesUnavailable } from './SalesSource.js';

const EMPTY_SALES = Object.freeze({ revenue: 0, known_cogs: 0, unknown_revenue: 0, lines: 0, unknown_lines: 0 });
const EMPTY_EXPENSES = Object.freeze({ business: 0, personal: 0, fixed: 0, pending: 0 });

// Numbers that need the sales: null when the sales database can't be read.
const SALES_FIELDS = [
  'revenue',
  'known_cogs',
  'unknown_revenue',
  'estimated_cogs',
  'cogs',
  'cost_coverage_pct',
  'gross_margin',
  'gross_margin_pct',
  'net_profit',
  'net_margin_pct',
  'left_over',
  'lines',
  'unknown_lines',
];

// Alert thresholds (§8 "Smart alerts").
export const ALERTS = Object.freeze({
  categorySpikePct: 30,
  categorySpikeMinAmount: 50,
  dueSoonDays: 3,
  minCoveragePct: 90,
});

const sumRows = (rows, empty) =>
  rows.reduce((acc, row) => {
    const out = { ...acc };
    for (const key of Object.keys(empty)) out[key] = round2(acc[key] + (Number(row[key]) || 0));
    return out;
  }, { ...empty });

const byKey = (rows) => new Map(rows.map((row) => [row.key, row]));

const nextDay = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
};

const daysBetween = (fromIso, toIso) => {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
};

/**
 * @param {{sales: object, expenses: object, categories: object, settings: object,
 *   salesAppUrl?: string, today?: () => string}} deps
 */
export const createFinanceModel = ({ sales, expenses, categories, settings, salesAppUrl = null, today = todayISO }) => {
  /** Runs sales queries; `{ ok: false }` instead of throwing when the sales database is unavailable. */
  const trySales = async (work) => {
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      if (isSalesUnavailable(error)) return { ok: false };
      throw error;
    }
  };

  /** One line of the profit ladder (§6) + the expense extras. */
  const build = (salesRow, expenseRow, margin, salesAvailable = true) => {
    const s = salesRow ?? EMPTY_SALES;
    const e = expenseRow ?? EMPTY_EXPENSES;
    const summary = {
      ...computeSummary(
        {
          revenue: s.revenue,
          known_cogs: s.known_cogs,
          unknown_revenue: s.unknown_revenue,
          business_expenses: e.business,
          withdrawals: e.personal,
        },
        margin
      ),
      lines: Number(s.lines) || 0,
      unknown_lines: Number(s.unknown_lines) || 0,
      fixed_expenses: round2(e.fixed),
      pending_expenses: round2(e.pending),
    };
    if (!salesAvailable) for (const key of SALES_FIELDS) summary[key] = null;
    return summary;
  };

  const expenseTotals = async (period) =>
    sumRows(await expenses.totalsByMonth(period.months[0], period.months.at(-1)), EMPTY_EXPENSES);

  const changes = (current, other) => ({
    revenue: changePct(current.revenue, other.revenue),
    gross_margin: changePct(current.gross_margin, other.gross_margin),
    business_expenses: changePct(current.business_expenses, other.business_expenses),
    net_profit: changePct(current.net_profit, other.net_profit),
  });

  const breakEven = (summary, period, dailyRows, day) => {
    const ratio = summary.gross_margin_pct === null ? null : summary.gross_margin_pct / 100;
    const days = period.kind === 'month' ? daysInMonth(period.key) : daysBetween(period.from, period.to);
    if (summary.revenue === null || !(ratio > 0)) {
      return { revenue: null, per_day: null, progress_pct: null, remaining: null, reached_on: null, days };
    }
    const target = round2(summary.business_expenses / ratio);
    let reachedOn = null;
    if (target === 0) {
      reachedOn = period.from;
    } else if (dailyRows) {
      let running = 0;
      for (const row of dailyRows) {
        running += row.revenue;
        if (running >= target) {
          reachedOn = row.key;
          break;
        }
      }
    }
    return {
      revenue: target,
      per_day: round2(target / days),
      progress_pct: target > 0 ? round2((summary.revenue / target) * 100) : 100,
      remaining: round2(Math.max(0, target - summary.revenue)),
      reached_on: reachedOn,
      days,
      as_of: day,
    };
  };

  const projection = (summary, period, day) => {
    if (period.kind !== 'month' || summary.gross_margin === null) return null;
    const days = daysInMonth(period.key);
    const current = monthOf(day);
    if (period.key > current) return { is_current: false, is_future: true, projected_net_profit: null, days_in_month: days };
    if (period.key < current) {
      return { is_current: false, is_future: false, projected_net_profit: summary.net_profit, days_elapsed: days, days_in_month: days };
    }
    const elapsed = Number(day.slice(8, 10));
    return {
      is_current: true,
      is_future: false,
      days_elapsed: elapsed,
      days_in_month: days,
      projected_revenue: round2((summary.revenue / elapsed) * days),
      projected_net_profit: round2((summary.gross_margin / elapsed) * days - summary.business_expenses),
    };
  };

  const categoryRows = async (period) => {
    const first = period.months[0];
    const last = period.months.at(-1);
    const [list, amounts, previous] = await Promise.all([
      categories.list({ includeArchived: true }),
      expenses.byCategory(first, last),
      period.kind === 'month' ? expenses.byCategory(addMonths(first, -3), addMonths(first, -1)) : Promise.resolve([]),
    ]);
    const amountMap = new Map(amounts.map((row) => [row.category_id, row]));
    const prevMap = new Map(previous.map((row) => [row.category_id, row]));
    const total = round2(amounts.reduce((acc, row) => acc + row.amount, 0));
    const rows = [];
    for (const category of list) {
      const row = amountMap.get(category.id);
      if (!row || row.amount <= 0) continue;
      const budget = category.monthly_budget === null ? null : round2(category.monthly_budget * period.months.length);
      const avg = period.kind === 'month' && prevMap.has(category.id) ? round2(prevMap.get(category.id).amount / 3) : null;
      rows.push({
        category,
        amount: row.amount,
        paid: row.paid,
        pending: row.pending,
        count: row.count,
        share_pct: total > 0 ? round2((row.amount / total) * 100) : null,
        budget,
        budget_pct: budget ? round2((row.amount / budget) * 100) : null,
        avg_3m: avg,
        change_vs_avg_pct: avg ? changePct(row.amount, avg) : null,
      });
    }
    rows.sort((a, b) => b.amount - a.amount);
    return { total, rows };
  };

  const buildAlerts = ({ summary, projected, pending, byCategory, day }) => {
    const alerts = [];
    if (projected?.is_current && projected.projected_net_profit !== null && projected.projected_net_profit < 0) {
      alerts.push({ type: 'loss_projection', severity: 'danger', amount: projected.projected_net_profit });
    }
    for (const bill of pending.rows) {
      if (!bill.due_date) continue;
      const days = daysBetween(day, bill.due_date);
      if (days < 0) {
        alerts.push({ type: 'bill_overdue', severity: 'danger', expense: bill, days: -days });
      } else if (days <= ALERTS.dueSoonDays) {
        alerts.push({ type: 'bill_due_soon', severity: 'warning', expense: bill, days });
      }
    }
    if (summary.cost_coverage_pct !== null && summary.cost_coverage_pct < ALERTS.minCoveragePct) {
      alerts.push({ type: 'low_coverage', severity: 'info', coverage_pct: summary.cost_coverage_pct });
    }
    for (const row of byCategory.rows) {
      if (row.budget && row.amount > row.budget) {
        alerts.push({ type: 'over_budget', severity: 'warning', category: row.category, amount: row.amount, budget: row.budget });
      } else if (
        row.change_vs_avg_pct !== null &&
        row.change_vs_avg_pct > ALERTS.categorySpikePct &&
        row.amount - row.avg_3m >= ALERTS.categorySpikeMinAmount
      ) {
        alerts.push({
          type: 'category_spike',
          severity: 'warning',
          category: row.category,
          amount: row.amount,
          avg_3m: row.avg_3m,
          change_pct: row.change_vs_avg_pct,
        });
      }
    }
    return alerts;
  };

  return {
    async salesStatus({ refresh = false } = {}) {
      return sales.status({ refresh });
    },

    /** §6 numbers for a month or a year, the previous period, the same period last year, and the extras. */
    async summary(periodValue) {
      const period = parsePeriod(periodValue);
      const previous = parsePeriod(period.previous);
      const lastYear = parsePeriod(period.lastYear);
      const day = today();
      const margin = await settings.getMargin();

      const salesResult = await trySales(async () => {
        const [current, prev, last, daily, todayRow] = await Promise.all([
          sales.totals(period.from, period.to),
          sales.totals(previous.from, previous.to),
          sales.totals(lastYear.from, lastYear.to),
          period.kind === 'month' ? sales.byDay(period.from, period.to) : Promise.resolve(null),
          sales.totals(day, nextDay(day)),
        ]);
        return { current, prev, last, daily, todayRow };
      });
      const available = salesResult.ok;
      const s = salesResult.value ?? {};

      const [expCurrent, expPrevious, expLastYear, pending, byCategory] = await Promise.all([
        expenseTotals(period),
        expenseTotals(previous),
        expenseTotals(lastYear),
        expenses.pending({ limit: 8 }),
        categoryRows(period),
      ]);

      const current = build(s.current, expCurrent, margin, available);
      const prev = build(s.prev, expPrevious, margin, available);
      const last = build(s.last, expLastYear, margin, available);
      const projected = projection(current, period, day);

      return {
        period: { kind: period.kind, key: period.key, from: period.from, to: period.to, previous: previous.key, last_year: lastYear.key },
        today: day,
        default_margin_pct: margin,
        sales_available: available,
        current,
        previous: prev,
        last_year: last,
        changes: { vs_previous: changes(current, prev), vs_last_year: changes(current, last) },
        break_even: breakEven(current, period, s.daily ?? null, day),
        projection: projected,
        today_sales: available && s.todayRow ? { date: day, revenue: s.todayRow.revenue, lines: s.todayRow.lines } : null,
        pending: { count: pending.count, amount: pending.amount, rows: pending.rows },
        alerts: buildAlerts({ summary: current, projected, pending, byCategory, day }),
      };
    },

    /** 12 rows for a year + the year totals. */
    async monthly(yearValue) {
      const year = String(yearValue ?? '').trim();
      if (!isValidYear(year)) throw httpError(400, 'year must be YYYY', 'INVALID_YEAR');
      const period = parsePeriod(year);
      const margin = await settings.getMargin();
      const salesResult = await trySales(() => sales.byMonth(period.from, period.to));
      const available = salesResult.ok;
      const salesMap = byKey(salesResult.value ?? []);
      const expenseMap = byKey(await expenses.totalsByMonth(period.months[0], period.months[11]));
      const rows = period.months.map((month) => ({
        month,
        ...build(salesMap.get(month), expenseMap.get(month), margin, available),
      }));
      const totals = build(
        sumRows(salesResult.value ?? [], EMPTY_SALES),
        sumRows([...expenseMap.values()], EMPTY_EXPENSES),
        margin,
        available
      );
      return { year, default_margin_pct: margin, sales_available: available, rows, totals };
    },

    /** One row per year that has sales or expenses. */
    async yearly() {
      const margin = await settings.getMargin();
      const salesResult = await trySales(() => sales.byYear());
      const available = salesResult.ok;
      const salesMap = byKey(salesResult.value ?? []);
      const expenseMap = byKey(await expenses.totalsByYear());
      const years = [...new Set([...salesMap.keys(), ...expenseMap.keys()])].sort();
      const rows = years.map((year) => ({ year, ...build(salesMap.get(year), expenseMap.get(year), margin, available) }));
      return { default_margin_pct: margin, sales_available: available, rows };
    },

    /** One row per day of a month: sales, cost, gross margin and the expenses paid that day. */
    async daily(periodValue) {
      const period = parsePeriod(periodValue);
      if (period.kind !== 'month') throw httpError(400, 'period must be YYYY-MM', 'INVALID_PERIOD');
      const margin = await settings.getMargin();
      const salesResult = await trySales(() => sales.byDay(period.from, period.to));
      const available = salesResult.ok;
      const salesMap = byKey(salesResult.value ?? []);
      const paidMap = byKey(await expenses.paidByDay(period.from, period.to));
      const rows = [];
      for (let d = 1; d <= daysInMonth(period.key); d += 1) {
        const date = `${period.key}-${String(d).padStart(2, '0')}`;
        const summary = build(salesMap.get(date), null, margin, available);
        rows.push({
          date,
          revenue: summary.revenue,
          cogs: summary.cogs,
          gross_margin: summary.gross_margin,
          lines: summary.lines,
          paid_expenses: paidMap.get(date)?.amount ?? 0,
        });
      }
      return { period: period.key, default_margin_pct: margin, sales_available: available, rows };
    },

    /** Donut data + budget use + the 3-month average (month periods). */
    async expensesByCategory(periodValue) {
      const period = parsePeriod(periodValue);
      const { total, rows } = await categoryRows(period);
      const business = round2(rows.filter((row) => !row.category.is_personal).reduce((acc, row) => acc + row.amount, 0));
      return {
        period: period.key,
        total,
        business_total: business,
        personal_total: round2(total - business),
        rows,
      };
    },

    /** Sale lines costed with the default margin (decision 33: they are fixed in sales_manager). */
    async unknownCostLines(periodValue, { page = 1, limit = 50 } = {}) {
      const period = parsePeriod(periodValue);
      const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);
      const safePage = Math.max(Math.trunc(Number(page)) || 1, 1);
      const margin = await settings.getMargin();
      const result = await trySales(() =>
        sales.unknownCostLines(period.from, period.to, { limit: safeLimit, offset: (safePage - 1) * safeLimit })
      );
      if (!result.ok) {
        return { period: period.key, sales_available: false, default_margin_pct: margin, sales_app_url: salesAppUrl, rows: [] };
      }
      return {
        period: period.key,
        sales_available: true,
        default_margin_pct: margin,
        sales_app_url: salesAppUrl,
        page: safePage,
        pages: Math.max(1, Math.ceil(result.value.total / safeLimit)),
        ...result.value,
      };
    },
  };
};
