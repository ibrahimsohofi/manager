import { getDatabase } from '../config/database.js';
import { parseUnitCost } from '../utils/saleCost.js';

// sales.unit_cost / cost_source are added on start by ensureSaleCostColumns() (config/saleCostSchema.js), which logs and never
// throws. If that step failed, the columns are missing: a sale must still be saved, without its cost.
let costColumnsMissing = false;

// Paged sales list (GET /api/sales/page, used by SalesList): one month / one day at a time, N rows per page.
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const SALES_PAGE_SIZE = { default: 50, max: 200 };
export const SALES_SEARCH_MAX_LENGTH = 100;
export const isValidSalesMonth = (value) => MONTH_PATTERN.test(value);
export const isValidSalesDay = (value) => DAY_PATTERN.test(value);

const SALE_LIST_COLUMNS = `id, date, product_id, productName, price, quantity, category, totalPrice,
             discount, tax_amount, payment_method, customer_id, notes, sale_number,
             created_at, updated_at`;

// "2026-11" -> ["2026-11-01", "2026-12-01"] (end excluded). A range (not MONTH(date)) keeps the `date` index usable.
const monthRange = (month) => {
  const match = MONTH_PATTERN.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
};

// "50%" or "a_b" typed in the search box must match literally, not as LIKE wildcards
const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const toPositiveInt = (value, fallback) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

class Sale {
  // Get all sales with optional filters
  static async getAll(filters = {}) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    let query = `
      SELECT id, date, product_id, productName, price, quantity, category, totalPrice,
             discount, tax_amount, payment_method, customer_id, notes, sale_number,
             created_at, updated_at
      FROM sales
      WHERE 1=1
    `;
    const params = [];

    // Apply filters
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.date) {
      query += ' AND date = ?';
      params.push(filters.date);
    }

    if (filters.startDate && filters.endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(filters.startDate, filters.endDate);
    }

    if (filters.search) {
      query += ' AND productName LIKE ?';
      params.push(`%${filters.search}%`);
    }

    // Order by most recent first
    query += ' ORDER BY date DESC, created_at DESC';

    // Apply pagination
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(parseInt(filters.offset));
    }

    const rows = await db.all(query, params);
    return rows;
  }

  // Get sale by ID
  static async getById(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT id, date, product_id, productName, price, quantity, category, totalPrice,
             discount, tax_amount, payment_method, customer_id, notes, sale_number,
             created_at, updated_at
      FROM sales
      WHERE id = ?
    `;
    const row = await db.get(query, [id]);
    return row;
  }

  // Create new sale with integration support
  static async create(saleData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      date,
      product_id,
      productName,
      price,
      quantity,
      category,
      totalPrice,
      discount = 0,
      tax_amount = 0,
      payment_method = 'cash',
      customer_id = null,
      notes = '',
      sale_number = null,
      unit_cost = null,
      cost_source = null
    } = saleData;

    const baseParams = [
      date,
      product_id === undefined ? null : product_id,
      productName,
      price,
      quantity,
      category,
      totalPrice,
      discount === undefined ? 0 : discount,
      tax_amount === undefined ? 0 : tax_amount,
      payment_method === undefined ? 'cash' : payment_method,
      customer_id === undefined ? null : customer_id,
      notes === undefined ? '' : notes,
      sale_number === undefined ? null : sale_number
    ];
    const baseColumns = `date, product_id, productName, price, quantity, category, totalPrice,
        discount, tax_amount, payment_method, customer_id, notes, sale_number`;
    const baseQuery = `
      INSERT INTO sales (
        ${baseColumns}
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Cost of the line at checkout (FINANCE_PLAN.md §5.3). Only written when known:
    // NULL is the column default, so an unknown cost needs no extra column.
    const unitCost = parseUnitCost(unit_cost);
    let result;
    if (unitCost !== null && !costColumnsMissing) {
      try {
        result = await db.run(
          `
      INSERT INTO sales (
        ${baseColumns}, unit_cost, cost_source
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
          [...baseParams, unitCost, cost_source === 'backfill' ? 'backfill' : 'sale']
        );
      } catch (error) {
        if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
        costColumnsMissing = true;
        console.error('⚠️ sales.unit_cost / cost_source missing: sales are saved without their cost.', error.message);
      }
    }
    if (!result) {
      result = await db.run(baseQuery, baseParams);
    }

    return { id: result.lastID, ...saleData };
  }

  // Update sale
  static async update(id, saleData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const { date, productName, price, quantity, category, totalPrice } = saleData;

    // unit_cost / cost_source are left untouched on purpose: the product of a line can't be changed
    // here, and editing its price or quantity doesn't change what one unit cost the shop.
    const query = `
      UPDATE sales
      SET date = ?, productName = ?, price = ?, quantity = ?, category = ?, totalPrice = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.run(query, [
      date, productName, price, quantity, category, totalPrice, id
    ]);

    return { id, ...saleData };
  }

  // Delete sale
  static async delete(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = 'DELETE FROM sales WHERE id = ?';
    const result = await db.run(query, [id]);
    return result.changes > 0;
  }

  // Get sales statistics
  static async getStats() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const totalSales = await db.get('SELECT COUNT(*) as count FROM sales');
    const totalRevenue = await db.get('SELECT SUM(totalPrice) as total FROM sales');
    const totalProducts = await db.get('SELECT SUM(quantity) as total FROM sales');
    const averageSale = await db.get('SELECT AVG(totalPrice) as average FROM sales');

    return {
      totalSales: totalSales?.count || 0,
      totalRevenue: totalRevenue?.total ? parseFloat(totalRevenue.total) || 0 : 0,
      totalProducts: totalProducts?.total || 0,
      averageSale: averageSale?.average ? parseFloat(averageSale.average) || 0 : 0
    };
  }

  // Get top categories
  static async getTopCategories(limit = 5) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT category, COUNT(*) as sales, SUM(totalPrice) as revenue
      FROM sales
      GROUP BY category
      ORDER BY revenue DESC
      LIMIT ?
    `;

    const rows = await db.all(query, [limit]);
    return rows.map(row => ({
      name: row.category,
      sales: row.sales || 0,
      revenue: row.revenue ? parseFloat(row.revenue) || 0 : 0
    }));
  }

  // Get recent sales
  static async getRecentSales(limit = 5) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT id, productName, totalPrice, date
      FROM sales
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const rows = await db.all(query, [limit]);
    return rows.map(row => ({
      id: row.id,
      productName: row.productName,
      totalPrice: row.totalPrice ? parseFloat(row.totalPrice) || 0 : 0,
      date: row.date
    }));
  }

  // Get daily revenue for last N days
  static async getDailyRevenue(days = 7) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT DATE(date) as date, SUM(totalPrice) as revenue
      FROM sales
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
      GROUP BY DATE(date)
      ORDER BY date ASC
    `;

    const rows = await db.all(query);
    return rows.map(row => ({
      date: row.date,
      revenue: row.revenue ? parseFloat(row.revenue) || 0 : 0
    }));
  }

  // Get all categories
  static async getCategories() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = 'SELECT DISTINCT category FROM sales ORDER BY category';
    const rows = await db.all(query);
    return rows.map(row => row.category);
  }

  /**
   * One page of sales + the totals of every sale matching the filters (not only the page).
   * Filters: month "YYYY-MM", date "YYYY-MM-DD", category, search (product name), page (1-based), pageSize.
   * Invalid month / date values are ignored here; the controller rejects them with a 400 first.
   */
  static async getPage(filters = {}) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const where = [];
    const params = [];

    const range = filters.month ? monthRange(filters.month) : null;
    if (range) {
      where.push('date >= ? AND date < ?');
      params.push(range[0], range[1]);
    }

    if (filters.date && isValidSalesDay(filters.date)) {
      where.push('date = ?');
      params.push(filters.date);
    }

    if (filters.category) {
      where.push('category = ?');
      params.push(filters.category);
    }

    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, SALES_SEARCH_MAX_LENGTH) : '';
    if (search) {
      where.push('productName LIKE ?');
      params.push(`%${escapeLike(search)}%`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totals = await db.get(
      `SELECT COUNT(*) AS count, COALESCE(SUM(totalPrice), 0) AS revenue, COALESCE(SUM(quantity), 0) AS quantity
       FROM sales ${whereSql}`,
      params
    );

    const total = Number(totals?.count) || 0;
    const pageSize = Math.min(toPositiveInt(filters.pageSize, SALES_PAGE_SIZE.default), SALES_PAGE_SIZE.max);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // A page past the end (e.g. the last line of the last page was just deleted) falls back to the last page
    const page = Math.min(toPositiveInt(filters.page, 1), totalPages);
    const offset = (page - 1) * pageSize;

    // LIMIT / OFFSET are inlined on purpose (integers validated above): mysql2 prepared statements
    // reject them as `?` placeholders on MySQL 8.0.22+. `id` makes the order stable across pages.
    const items = await db.all(
      `SELECT ${SALE_LIST_COLUMNS}
       FROM sales ${whereSql}
       ORDER BY date DESC, created_at DESC, id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    return {
      items,
      page,
      pageSize,
      total,
      totalPages,
      summary: {
        count: total,
        revenue: Number.parseFloat(totals?.revenue) || 0,
        quantity: Number(totals?.quantity) || 0
      }
    };
  }

  // Months that have sales, newest first: [{ month: "2026-11", count, revenue }]
  static async getMonths() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const rows = await db.all(`
      SELECT DATE_FORMAT(date, '%Y-%m') AS month, COUNT(*) AS count, COALESCE(SUM(totalPrice), 0) AS revenue
      FROM sales
      GROUP BY DATE_FORMAT(date, '%Y-%m')
      ORDER BY month DESC
    `);

    return rows.map(row => ({
      month: row.month,
      count: Number(row.count) || 0,
      revenue: Number.parseFloat(row.revenue) || 0
    }));
  }

  // Get aggregated sales grouped by product name
  static async getAggregated(filters = {}) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    let query = `
      SELECT
        MIN(product_id) as product_id,
        productName as product_name,
        category,
        SUM(quantity) as total_product_sold,
        AVG(price) as price,
        SUM(totalPrice) as total_prices
      FROM sales
      WHERE 1=1
    `;

    const params = [];

    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.startDate) {
      query += ' AND date >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ' AND date <= ?';
      params.push(filters.endDate);
    }

    query += `
      GROUP BY productName, category
      ORDER BY total_prices DESC
    `;

    const rows = await db.all(query, params);

    return rows.map(row => ({
      product_id: row.product_id || '',
      product_name: row.product_name,
      category: row.category,
      total_product_sold: parseInt(row.total_product_sold) || 0,
      price: parseFloat(row.price) || 0,
      total_prices: parseFloat(row.total_prices) || 0
    }));
  }
}

export default Sale;
