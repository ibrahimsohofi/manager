// Expenses (FINANCE_PLAN.md §4 #5-#9, §5.1). Every write that changes the amount, the month or the spread
// rewrites `expense_allocations` in the same transaction, so monthly reports are a plain SUM.
// Soft delete: `deleted_at` is set and the allocations are kept; every aggregate joins on
// `deleted_at IS NULL`, so a restore is a single UPDATE.
import { withTransaction } from '../config/database.js';
import { buildAllocations, cleanExpenseInput, cleanPayInput, httpError, round2 } from '../utils/finance.js';

const WRITABLE = [
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

const SELECT = `
  SELECT e.id, e.category_id, e.amount,
         DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expense_date,
         e.period_month, e.spread_months, e.\`status\`,
         DATE_FORMAT(e.due_date, '%Y-%m-%d') AS due_date,
         e.paid_from, e.payee, e.reference, e.description, e.notes, e.attachment_url, e.recurring_id,
         e.deleted_at, e.created_at, e.updated_at,
         c.name_fr AS c_name_fr, c.name_ar AS c_name_ar, c.icon AS c_icon, c.color AS c_color,
         c.is_personal AS c_is_personal, c.is_fixed AS c_is_fixed, c.archived AS c_archived`;

const FROM = `
  FROM expenses e
  LEFT JOIN expense_categories c ON c.id = e.category_id`;

const bool = (value) => Boolean(Number(value));
const str = (value) => (value === null || value === undefined ? null : String(value));

export const toExpense = (row) => ({
  id: Number(row.id),
  category_id: Number(row.category_id),
  category: {
    id: Number(row.category_id),
    name_fr: row.c_name_fr ?? '?',
    name_ar: row.c_name_ar ?? '?',
    icon: row.c_icon ?? null,
    color: row.c_color ?? null,
    is_personal: bool(row.c_is_personal),
    is_fixed: bool(row.c_is_fixed),
    archived: bool(row.c_archived),
  },
  amount: round2(row.amount),
  period_amount: row.period_amount === undefined ? undefined : round2(row.period_amount),
  expense_date: str(row.expense_date),
  period_month: str(row.period_month),
  spread_months: Number(row.spread_months) || 1,
  status: row.status,
  due_date: str(row.due_date),
  paid_from: row.paid_from,
  payee: row.payee ?? null,
  reference: row.reference ?? null,
  description: row.description ?? null,
  notes: row.notes ?? null,
  attachment_url: row.attachment_url ?? null,
  recurring_id: row.recurring_id === null || row.recurring_id === undefined ? null : Number(row.recurring_id),
  deleted_at: str(row.deleted_at),
  created_at: str(row.created_at),
  updated_at: str(row.updated_at),
});

const likeEscape = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

const writeAllocations = async (connection, expenseId, { amount, period_month, spread_months }) => {
  await connection.query('DELETE FROM expense_allocations WHERE expense_id = ?', [expenseId]);
  const rows = buildAllocations(amount, period_month, spread_months);
  await connection.query(
    `INSERT INTO expense_allocations (expense_id, period_month, amount) VALUES ${rows.map(() => '(?, ?, ?)').join(', ')}`,
    rows.flatMap((row) => [expenseId, row.period_month, row.amount])
  );
};

/**
 * @param {{getPool: () => Promise<import('mysql2/promise').Pool>, categories: {assertUsable: Function},
 *   today?: () => string}} deps
 */
export const createExpenseModel = ({ getPool, categories, today = undefined }) => {
  const day = () => (today ? today() : undefined);

  const find = async (executor, id, { lock = false } = {}) => {
    const [rows] = await executor.query(
      `${SELECT} ${FROM} WHERE e.id = ? ${lock ? 'FOR UPDATE' : ''}`,
      [id]
    );
    return rows[0] ? toExpense(rows[0]) : null;
  };

  const get = async (id, { includeDeleted = true } = {}) => {
    const pool = await getPool();
    const expense = await find(pool, id);
    if (!expense || (!includeDeleted && expense.deleted_at)) {
      throw httpError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
    }
    const [allocations] = await pool.query(
      'SELECT period_month, amount FROM expense_allocations WHERE expense_id = ? ORDER BY period_month',
      [id]
    );
    return { ...expense, allocations: allocations.map((a) => ({ period_month: a.period_month, amount: round2(a.amount) })) };
  };

  // Locks the row, refuses deleted ones. Runs inside a transaction.
  const lockLive = async (connection, id) => {
    const current = await find(connection, id, { lock: true });
    if (!current || current.deleted_at) throw httpError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
    return current;
  };

  return {
    get: (id) => get(id),

    async list(filters) {
      const pool = await getPool();
      const where = [filters.deleted ? 'e.deleted_at IS NOT NULL' : 'e.deleted_at IS NULL'];
      const params = [];
      let join = '';
      const joinParams = [];
      if (filters.period) {
        join = `
          JOIN (SELECT expense_id, SUM(amount) AS period_amount
                FROM expense_allocations
                WHERE period_month BETWEEN ? AND ?
                GROUP BY expense_id) pa ON pa.expense_id = e.id`;
        joinParams.push(filters.period.from, filters.period.to);
      }
      if (filters.from) {
        where.push('e.expense_date >= ?');
        params.push(filters.from);
      }
      if (filters.to) {
        where.push('e.expense_date <= ?');
        params.push(filters.to);
      }
      if (filters.category_id) {
        where.push('e.category_id = ?');
        params.push(filters.category_id);
      }
      if (filters.status) {
        where.push('e.`status` = ?');
        params.push(filters.status);
      }
      if (filters.q) {
        const like = `%${likeEscape(filters.q)}%`;
        where.push(
          '(e.description LIKE ? OR e.payee LIKE ? OR e.reference LIKE ? OR e.notes LIKE ? OR c.name_fr LIKE ? OR c.name_ar LIKE ?)'
        );
        params.push(like, like, like, like, like, like);
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;
      const counted = filters.period ? 'pa.period_amount' : 'e.amount';
      const offset = (filters.page - 1) * filters.limit;

      const [rows] = await pool.query(
        `${SELECT}${filters.period ? ', pa.period_amount' : ''} ${FROM} ${join} ${whereSql}
         ORDER BY e.expense_date DESC, e.id DESC
         LIMIT ${Number(filters.limit)} OFFSET ${Number(offset)}`,
        [...joinParams, ...params]
      );
      const [totalsRows] = await pool.query(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(${counted}), 0) AS counted,
                COALESCE(SUM(CASE WHEN COALESCE(c.is_personal, 0) = 1 THEN 0 ELSE ${counted} END), 0) AS business,
                COALESCE(SUM(CASE WHEN COALESCE(c.is_personal, 0) = 1 THEN ${counted} ELSE 0 END), 0) AS personal,
                COALESCE(SUM(CASE WHEN e.\`status\` = 'paid' THEN ${counted} ELSE 0 END), 0) AS paid,
                COALESCE(SUM(CASE WHEN e.\`status\` = 'pending' THEN ${counted} ELSE 0 END), 0) AS pending
         ${FROM} ${join} ${whereSql}`,
        [...joinParams, ...params]
      );
      const totals = totalsRows[0] ?? {};
      const count = Number(totals.count) || 0;
      return {
        rows: rows.map(toExpense),
        page: filters.page,
        limit: filters.limit,
        pages: Math.max(1, Math.ceil(count / filters.limit)),
        totals: {
          count,
          counted: round2(totals.counted),
          business: round2(totals.business),
          personal: round2(totals.personal),
          paid: round2(totals.paid),
          pending: round2(totals.pending),
        },
      };
    },

    async create(body) {
      const input = cleanExpenseInput(body, { today: day() });
      await categories.assertUsable(input.category_id);
      const pool = await getPool();
      const id = await withTransaction(pool, async (connection) => {
        const keys = WRITABLE.filter((key) => input[key] !== undefined);
        const [result] = await connection.query(
          `INSERT INTO expenses (${keys.map((key) => `\`${key}\``).join(', ')})
           VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((key) => input[key])
        );
        await writeAllocations(connection, result.insertId, input);
        return result.insertId;
      });
      return get(id);
    },

    async update(id, body) {
      const input = cleanExpenseInput(body, { partial: true, today: day() });
      const keys = WRITABLE.filter((key) => input[key] !== undefined);
      if (keys.length === 0) return get(id, { includeDeleted: false });
      const pool = await getPool();
      await withTransaction(pool, async (connection) => {
        const current = await lockLive(connection, id);
        if (input.category_id !== undefined) {
          await categories.assertUsable(input.category_id, { allowArchived: input.category_id === current.category_id });
        }
        await connection.query(
          `UPDATE expenses SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => input[key]), id]
        );
        const merged = { ...current, ...input };
        const moved = ALLOCATION_KEYS.some((key) => input[key] !== undefined && input[key] !== current[key]);
        if (moved) await writeAllocations(connection, id, merged);
      });
      return get(id);
    },

    /** A pending bill becomes paid: payment date (today by default) and optionally the real amount. */
    async pay(id, body) {
      const input = cleanPayInput(body, { today: day() });
      const pool = await getPool();
      await withTransaction(pool, async (connection) => {
        const current = await lockLive(connection, id);
        if (current.status === 'paid') throw httpError(409, 'Expense already paid', 'ALREADY_PAID');
        const amount = input.amount ?? current.amount;
        await connection.query("UPDATE expenses SET `status` = 'paid', expense_date = ?, amount = ? WHERE id = ?", [
          input.expense_date,
          amount,
          id,
        ]);
        if (amount !== current.amount) await writeAllocations(connection, id, { ...current, amount });
      });
      return get(id);
    },

    async remove(id) {
      const pool = await getPool();
      const [result] = await pool.query('UPDATE expenses SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [
        id,
      ]);
      if (Number(result.affectedRows) === 0) await get(id, { includeDeleted: false });
      return { id, deleted: true };
    },

    async restore(id) {
      const pool = await getPool();
      await pool.query('UPDATE expenses SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [id]);
      return get(id);
    },

    // ---------- Aggregates for the finance model (live expenses only) ----------

    /** Allocated amounts per month in [fromMonth, toMonth]: business, personal, fixed (business), pending. */
    async totalsByMonth(fromMonth, toMonth) {
      const pool = await getPool();
      const [rows] = await pool.query(
        `SELECT a.period_month AS bucket, ${ALLOCATION_SUMS}
         ${ALLOCATION_FROM}
         WHERE a.period_month BETWEEN ? AND ?
         GROUP BY a.period_month
         ORDER BY a.period_month`,
        [fromMonth, toMonth]
      );
      return rows.map(toBucket);
    },

    /** Same, one row per year 'YYYY' (all time). */
    async totalsByYear() {
      const pool = await getPool();
      const [rows] = await pool.query(
        `SELECT LEFT(a.period_month, 4) AS bucket, ${ALLOCATION_SUMS}
         ${ALLOCATION_FROM}
         GROUP BY LEFT(a.period_month, 4)
         ORDER BY bucket`
      );
      return rows.map(toBucket);
    },

    /** Allocated amounts per category in [fromMonth, toMonth]. */
    async byCategory(fromMonth, toMonth) {
      const pool = await getPool();
      const [rows] = await pool.query(
        `SELECT e.category_id,
                COALESCE(SUM(a.amount), 0) AS amount,
                COALESCE(SUM(CASE WHEN e.\`status\` = 'paid' THEN a.amount ELSE 0 END), 0) AS paid,
                COALESCE(SUM(CASE WHEN e.\`status\` = 'pending' THEN a.amount ELSE 0 END), 0) AS pending,
                COUNT(DISTINCT e.id) AS count
         FROM expense_allocations a
         JOIN expenses e ON e.id = a.expense_id AND e.deleted_at IS NULL
         WHERE a.period_month BETWEEN ? AND ?
         GROUP BY e.category_id`,
        [fromMonth, toMonth]
      );
      return rows.map((row) => ({
        category_id: Number(row.category_id),
        amount: round2(row.amount),
        paid: round2(row.paid),
        pending: round2(row.pending),
        count: Number(row.count) || 0,
      }));
    },

    /** Paid expenses per payment day in [fromDate, toDate): money out of the till (§4 #17). */
    async paidByDay(fromDate, toDate) {
      const pool = await getPool();
      const [rows] = await pool.query(
        `SELECT DATE_FORMAT(expense_date, '%Y-%m-%d') AS bucket, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
         FROM expenses
         WHERE deleted_at IS NULL AND \`status\` = 'paid' AND expense_date >= ? AND expense_date < ?
         GROUP BY bucket
         ORDER BY bucket`,
        [fromDate, toDate]
      );
      return rows.map((row) => ({ key: String(row.bucket), amount: round2(row.amount), count: Number(row.count) || 0 }));
    },

    /** Bills still to pay, the closest due date first (no due date last). */
    async pending({ limit = 20 } = {}) {
      const pool = await getPool();
      const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 20, 1), 100);
      const [rows] = await pool.query(
        `${SELECT} ${FROM}
         WHERE e.deleted_at IS NULL AND e.\`status\` = 'pending'
         ORDER BY (e.due_date IS NULL), e.due_date, e.expense_date, e.id
         LIMIT ${safeLimit}`
      );
      const [totals] = await pool.query(
        "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE deleted_at IS NULL AND `status` = 'pending'"
      );
      return { rows: rows.map(toExpense), count: Number(totals[0]?.count) || 0, amount: round2(totals[0]?.amount) };
    },
  };
};

const ALLOCATION_SUMS = `
  COALESCE(SUM(CASE WHEN COALESCE(c.is_personal, 0) = 1 THEN 0 ELSE a.amount END), 0) AS business,
  COALESCE(SUM(CASE WHEN COALESCE(c.is_personal, 0) = 1 THEN a.amount ELSE 0 END), 0) AS personal,
  COALESCE(SUM(CASE WHEN COALESCE(c.is_personal, 0) = 0 AND COALESCE(c.is_fixed, 0) = 1 THEN a.amount ELSE 0 END), 0) AS fixed,
  COALESCE(SUM(CASE WHEN e.\`status\` = 'pending' THEN a.amount ELSE 0 END), 0) AS pending`;

const ALLOCATION_FROM = `
  FROM expense_allocations a
  JOIN expenses e ON e.id = a.expense_id AND e.deleted_at IS NULL
  LEFT JOIN expense_categories c ON c.id = e.category_id`;

const toBucket = (row) => ({
  key: String(row.bucket),
  business: round2(row.business),
  personal: round2(row.personal),
  fixed: round2(row.fixed),
  pending: round2(row.pending),
});
