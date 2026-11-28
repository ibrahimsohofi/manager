// The only file that knows the sales schema (FINANCE_PLAN.md §1.1). All SQL against `bricojamal` lives here,
// on the read-only pool. No cross-database JOIN: the finance model combines these totals with the expense
// totals in JS.
//
// - `unit_cost` check: done once, cached. While the column is missing (sales_manager has not added it yet),
//   it is checked again every `recheckMs` (5 min) and every line counts as unknown cost (estimated with the
//   default margin) instead of failing with an SQL error.
// - Unavailable state: when the sales database can't be reached, methods throw a SALES_UNAVAILABLE error.
//   The finance model turns it into `{ sales_available: false }` (HTTP 200). For `failFastMs` after a failure
//   the next calls fail at once (no 3 s connect timeout per request); `status({ refresh: true })` retries now.
// - A `unit_cost` of 0 or less counts as unknown: a purchase price of 0 means "never entered", and counting it
//   as a real cost would show a 100 % margin on those lines.
import { round2 } from '../utils/finance.js';

export const SALES_UNAVAILABLE = 'SALES_UNAVAILABLE';
const RECHECK_MS = 5 * 60 * 1000;
const FAIL_FAST_MS = 15 * 1000;

// Errors that mean "the sales database is not usable right now", not "the SQL is wrong".
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ER_ACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR',
  'ER_TABLEACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_NO_SUCH_TABLE',
  'ER_CON_COUNT_ERROR',
  'ER_SERVER_SHUTDOWN',
]);

export const isSalesUnavailable = (error) => error?.code === SALES_UNAVAILABLE;

const unavailableError = (cause) => {
  const error = new Error('Sales database unavailable');
  error.code = SALES_UNAVAILABLE;
  error.cause_code = cause?.code || cause?.cause_code || 'UNKNOWN';
  return error;
};

const num = (value) => round2(value ?? 0);
const int = (value) => Math.trunc(Number(value) || 0);
const TICKET_RE = /\[(TKT-[^\]\s]+)\]/;

const totalsRow = (row) => ({
  revenue: num(row.revenue),
  known_cogs: num(row.known_cogs),
  unknown_revenue: num(row.unknown_revenue),
  lines: int(row.lines),
  unknown_lines: int(row.unknown_lines),
});

/**
 * @param {{getPool: () => {query: Function}, logger?: Console, recheckMs?: number, failFastMs?: number,
 *   now?: () => number}} options
 */
export const createSalesSource = ({
  getPool,
  logger = console,
  recheckMs = RECHECK_MS,
  failFastMs = FAIL_FAST_MS,
  now = () => Date.now(),
}) => {
  let schema = null; // { hasUnitCost, checkedAt }
  let failure = null; // { at, code }
  let lastSuccessAt = null;

  const run = async (sql, params = []) => {
    try {
      const [rows] = await getPool().query(sql, params);
      failure = null;
      lastSuccessAt = now();
      return rows;
    } catch (error) {
      if (UNAVAILABLE_CODES.has(error.code) || error.fatal) {
        if (!failure) logger.error(`❌ Sales database unavailable (${error.code || 'fatal'}): ${error.message}`);
        failure = { at: now(), code: error.code || 'FATAL' };
        throw unavailableError(error);
      }
      throw error;
    }
  };

  const ensureSchema = async ({ refresh = false } = {}) => {
    if (!refresh && failure && now() - failure.at < failFastMs) throw unavailableError(failure);
    const stale = !schema || refresh || (!schema.hasUnitCost && now() - schema.checkedAt >= recheckMs);
    if (!stale) return schema;
    const rows = await run(
      `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'unit_cost'`
    );
    const hasUnitCost = Number(rows[0]?.n) > 0;
    if (schema && schema.hasUnitCost !== hasUnitCost) {
      logger.log(`ℹ️ sales.unit_cost is now ${hasUnitCost ? 'present' : 'missing'}`);
    } else if (!schema && !hasUnitCost) {
      logger.warn('⚠️ sales.unit_cost is missing: every sale line is costed with the default margin');
    }
    schema = { hasUnitCost, checkedAt: now() };
    return schema;
  };

  // The cost expressions depend on the column being there.
  const costColumns = (hasUnitCost) =>
    hasUnitCost
      ? `COALESCE(SUM(CASE WHEN unit_cost > 0 THEN quantity * unit_cost ELSE 0 END), 0) AS known_cogs,
         COALESCE(SUM(CASE WHEN unit_cost > 0 THEN 0 ELSE totalPrice END), 0) AS unknown_revenue,
         COALESCE(SUM(CASE WHEN unit_cost > 0 THEN 0 ELSE 1 END), 0) AS unknown_lines`
      : `0 AS known_cogs,
         COALESCE(SUM(totalPrice), 0) AS unknown_revenue,
         COUNT(*) AS unknown_lines`;

  // A column renamed under us (ER_BAD_FIELD_ERROR) resets the cached schema and retries once.
  const withSchema = async (work) => {
    const current = await ensureSchema();
    try {
      return await work(current);
    } catch (error) {
      if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;
      logger.warn(`⚠️ Sales schema changed (${error.message}), checking again`);
      return work(await ensureSchema({ refresh: true }));
    }
  };

  const grouped = (bucketSql) => async (from, to) =>
    withSchema(async ({ hasUnitCost }) => {
      const rows = await run(
        `SELECT ${bucketSql} AS bucket,
                COALESCE(SUM(totalPrice), 0) AS revenue,
                ${costColumns(hasUnitCost)},
                COUNT(*) AS \`lines\`
         FROM sales
         WHERE \`date\` >= ? AND \`date\` < ?
         GROUP BY bucket
         ORDER BY bucket`,
        [from, to]
      );
      return rows.map((row) => ({ key: String(row.bucket), ...totalsRow(row) }));
    });

  return {
    /** `{ available, has_unit_cost, checked_at, error_code }`. `refresh` re-checks the database now. */
    async status({ refresh = false } = {}) {
      try {
        const current = await ensureSchema({ refresh });
        return {
          available: true,
          has_unit_cost: current.hasUnitCost,
          checked_at: new Date(current.checkedAt).toISOString(),
          error_code: null,
        };
      } catch (error) {
        if (!isSalesUnavailable(error)) throw error;
        return {
          available: false,
          has_unit_cost: schema?.hasUnitCost ?? null,
          checked_at: failure ? new Date(failure.at).toISOString() : null,
          last_success_at: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
          error_code: error.cause_code,
        };
      }
    },

    /** Totals between two dates, half-open [from, to). */
    async totals(from, to) {
      return withSchema(async ({ hasUnitCost }) => {
        const rows = await run(
          `SELECT COALESCE(SUM(totalPrice), 0) AS revenue,
                  ${costColumns(hasUnitCost)},
                  COUNT(*) AS \`lines\`
           FROM sales
           WHERE \`date\` >= ? AND \`date\` < ?`,
          [from, to]
        );
        return totalsRow(rows[0] ?? {});
      });
    },

    /** One row per month 'YYYY-MM' that has sales, in [from, to). */
    byMonth: grouped("DATE_FORMAT(`date`, '%Y-%m')"),

    /** One row per day 'YYYY-MM-DD' that has sales, in [from, to). */
    byDay: grouped("DATE_FORMAT(`date`, '%Y-%m-%d')"),

    /** One row per year 'YYYY' (all time). */
    async byYear() {
      return withSchema(async ({ hasUnitCost }) => {
        const rows = await run(
          `SELECT CAST(YEAR(\`date\`) AS CHAR) AS bucket,
                  COALESCE(SUM(totalPrice), 0) AS revenue,
                  ${costColumns(hasUnitCost)},
                  COUNT(*) AS \`lines\`
           FROM sales
           GROUP BY bucket
           ORDER BY bucket`
        );
        return rows.map((row) => ({ key: String(row.bucket), ...totalsRow(row) }));
      });
    },

    /** Sale lines costed with the default margin, newest first (decision 33: fixed in sales_manager). */
    async unknownCostLines(from, to, { limit = 50, offset = 0 } = {}) {
      const safeLimit = Math.min(Math.max(int(limit), 1), 200);
      const safeOffset = Math.max(int(offset), 0);
      return withSchema(async ({ hasUnitCost }) => {
        const unknown = hasUnitCost ? 'AND (unit_cost IS NULL OR unit_cost <= 0)' : '';
        const [count] = await run(
          `SELECT COUNT(*) AS total, COALESCE(SUM(totalPrice), 0) AS revenue
           FROM sales WHERE \`date\` >= ? AND \`date\` < ? ${unknown}`,
          [from, to]
        );
        const rows = await run(
          `SELECT id, sale_number, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS date, product_id, productName, category,
                  quantity, totalPrice, notes
           FROM sales
           WHERE \`date\` >= ? AND \`date\` < ? ${unknown}
           ORDER BY \`date\` DESC, id DESC
           LIMIT ${safeLimit} OFFSET ${safeOffset}`,
          [from, to]
        );
        return {
          total: int(count?.total),
          revenue: num(count?.revenue),
          limit: safeLimit,
          offset: safeOffset,
          rows: rows.map((row) => ({
            id: int(row.id),
            sale_number: row.sale_number ?? null,
            ticket: TICKET_RE.exec(row.notes ?? '')?.[1] ?? null,
            date: row.date,
            product_id: row.product_id === null ? null : int(row.product_id),
            product_name: row.productName,
            category: row.category,
            quantity: int(row.quantity),
            total_price: num(row.totalPrice),
          })),
        };
      });
    },
  };
};
