// Expense categories (FINANCE_PLAN.md §5.1, §5.4). A category that was ever used is archived, never deleted:
// a soft-deleted expense can be restored and must still find its category.
// `getPool` is the async getter of config/database.js (finance database).
import { cleanCategoryInput, httpError, round2 } from '../utils/finance.js';

const bool = (value) => Boolean(Number(value));

export const toCategory = (row) => ({
  id: Number(row.id),
  code: row.code ?? null,
  name_fr: row.name_fr,
  name_ar: row.name_ar,
  icon: row.icon ?? null,
  color: row.color ?? null,
  is_personal: bool(row.is_personal),
  is_fixed: bool(row.is_fixed),
  monthly_budget: row.monthly_budget === null || row.monthly_budget === undefined ? null : round2(row.monthly_budget),
  sort_order: Number(row.sort_order) || 0,
  archived: bool(row.archived),
  expense_count: Number(row.expense_count) || 0,
});

const COLUMNS = ['name_fr', 'name_ar', 'icon', 'color', 'is_personal', 'is_fixed', 'monthly_budget', 'sort_order', 'archived'];

const SELECT = `
  SELECT c.*,
         (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id AND e.deleted_at IS NULL) AS expense_count
  FROM expense_categories c`;

export const createCategoryModel = ({ getPool }) => {
  const get = async (id) => {
    const pool = await getPool();
    const [rows] = await pool.query(`${SELECT} WHERE c.id = ?`, [id]);
    if (!rows[0]) throw httpError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
    return toCategory(rows[0]);
  };

  return {
    get,

    async list({ includeArchived = false } = {}) {
      const pool = await getPool();
      const [rows] = await pool.query(
        `${SELECT} ${includeArchived ? '' : 'WHERE c.archived = 0'} ORDER BY c.archived, c.sort_order, c.id`
      );
      return rows.map(toCategory);
    },

    /** Throws 400 when the category can't receive a new expense (missing or archived). */
    async assertUsable(id, { allowArchived = false } = {}) {
      const pool = await getPool();
      const [rows] = await pool.query('SELECT id, archived FROM expense_categories WHERE id = ?', [id]);
      if (!rows[0]) throw httpError(400, 'Unknown category', 'INVALID_CATEGORY');
      if (!allowArchived && bool(rows[0].archived)) {
        throw httpError(400, 'This category is archived', 'CATEGORY_ARCHIVED');
      }
    },

    async create(body) {
      const input = cleanCategoryInput(body);
      const pool = await getPool();
      if (input.sort_order === undefined) {
        const [rows] = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM expense_categories');
        input.sort_order = Number(rows[0]?.next) || 1;
      }
      const keys = COLUMNS.filter((key) => input[key] !== undefined);
      const [result] = await pool.query(
        `INSERT INTO expense_categories (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
        keys.map((key) => input[key])
      );
      return get(result.insertId);
    },

    async update(id, body) {
      const input = cleanCategoryInput(body, { partial: true });
      const keys = COLUMNS.filter((key) => input[key] !== undefined);
      await get(id);
      if (keys.length > 0) {
        const pool = await getPool();
        await pool.query(
          `UPDATE expense_categories SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => input[key]), id]
        );
      }
      return get(id);
    },

    /** Deletes an unused category, archives a used one. */
    async remove(id) {
      await get(id);
      const pool = await getPool();
      const [rows] = await pool.query('SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?', [id]);
      if (Number(rows[0]?.n) > 0) {
        await pool.query('UPDATE expense_categories SET archived = 1 WHERE id = ?', [id]);
        return { id, deleted: false, archived: true };
      }
      await pool.query('DELETE FROM expense_categories WHERE id = ?', [id]);
      return { id, deleted: true, archived: false };
    },
  };
};
