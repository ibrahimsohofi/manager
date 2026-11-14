import { getDatabase, pool } from '../config/database.js';
import {
  autoCustomerName,
  formatAutoCode,
  numericCodeValue,
  parseCustomerLabel,
} from '../utils/customerLabel.js';

// Escape LIKE wildcards so "50%" or "a_b" are searched literally.
const likeEscape = (value) => String(value).replace(/[\\%_]/g, '\\$&');

// "9" and "009" are the same client number (short all-digit codes only)
const NUMERIC_CODE_SQL = (column) => `(${column} REGEXP '^[0-9]{1,6}$' AND CAST(${column} AS UNSIGNED) = ?)`;

// Counter for automatic client numbers ("Client N° 001", "Client N° 002"...)
const AUTO_CODE_COUNTER = 'customer_code';
let autoCounterReady = false;
const ensureAutoCodeCounter = async (connection) => {
  if (autoCounterReady) return;
  await connection.query(`
    CREATE TABLE IF NOT EXISTS app_counters (
      name VARCHAR(50) PRIMARY KEY,
      value INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  // First run: continue after the auto-numbered clients that already exist
  await connection.query(
    `INSERT IGNORE INTO app_counters (name, value)
     SELECT ?, COALESCE(MAX(CAST(code AS UNSIGNED)), 0) FROM customers
     WHERE code REGEXP '^[0-9]{1,6}$'
       AND name IN (CONCAT('Client N° ', code), CONCAT('Client ', code))`,
    [AUTO_CODE_COUNTER]
  );
  autoCounterReady = true;
};

// Next free automatic client number. Call inside a transaction: the counter row stays
// locked until commit, so two tills never get the same number.
const takeNextAutoCode = async (connection) => {
  const [counterRows] = await connection.query(
    'SELECT value FROM app_counters WHERE name = ? FOR UPDATE',
    [AUTO_CODE_COUNTER]
  );
  let next = (Number(counterRows[0]?.value) || 0) + 1;

  // Skip numbers already used by any client (typed by hand as "9" or "009", or deleted)
  for (let attempt = 0; attempt < 1000; attempt++) {
    const [taken] = await connection.query(
      `SELECT id FROM customers WHERE code = ? OR ${NUMERIC_CODE_SQL('code')} LIMIT 1`,
      [formatAutoCode(next), next]
    );
    if (taken.length === 0) break;
    next += 1;
  }

  await connection.query('UPDATE app_counters SET value = ? WHERE name = ?', [next, AUTO_CODE_COUNTER]);
  return formatAutoCode(next);
};

// Run `work(connection)` in a transaction with the auto-number counter ready.
const withAutoCodeTransaction = async (work) => {
  if (!pool) throw new Error('Database not initialized');
  const connection = await pool.getConnection();
  try {
    await ensureAutoCodeCounter(connection);
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

// One QR ticket = several sales lines sharing "TKT-YYYYMMDD-HHMMSS-XXX" (+ "-01", "-02"...).
// Other sales count as one purchase each.
const TICKET_KEY_SQL = `CASE WHEN sale_number LIKE 'TKT-%'
  THEN SUBSTRING_INDEX(sale_number, '-', 4)
  ELSE CONCAT('S', id) END`;

// Per-customer totals from the sales table (till purchases)
const SALES_TOTALS_JOIN = `
  LEFT JOIN (
    SELECT customer_id,
                      COALESCE(SUM(totalPrice), 0) AS total_spent,
           COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN totalPrice ELSE 0 END), 0) AS credit_total,
           COUNT(DISTINCT ${TICKET_KEY_SQL}) AS purchases_count,
           MAX(date) AS last_purchase
    FROM sales
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  ) st ON st.customer_id = c.id
`;
// Payments received on credit + legacy order list (customer_products), per customer
const ACCOUNT_TOTALS_JOIN = `
  LEFT JOIN (
    SELECT customer_id, COALESCE(SUM(amount), 0) AS payments_total
    FROM customer_payments
    GROUP BY customer_id
  ) pt ON pt.customer_id = c.id
  LEFT JOIN (
    SELECT customer_id, COALESCE(SUM(total_price), 0) AS products_total
    FROM customer_products
    WHERE status <> 'cancelled'
    GROUP BY customer_id
  ) cpt ON cpt.customer_id = c.id
`;
const withSalesTotals = (row) => ({
  ...row,
  total_spent: parseFloat(row.total_spent || 0),
  purchases_count: Number(row.purchases_count || 0),
});
// Card totals: Total purchases = till sales + order list; Paid = non-credit sales + payments
// received; Balance = Total - Paid (= credit sales + order list - payments received).
const withAccountTotals = (row) => {
  const totalSpent = parseFloat(row.total_spent || 0);
  const creditTotal = parseFloat(row.credit_total || 0);
  const paymentsTotal = parseFloat(row.payments_total || 0);
  const productsTotal = parseFloat(row.products_total || 0);
  const totalPurchases = totalSpent + productsTotal;
  const totalPaid = totalSpent - creditTotal + paymentsTotal;
  return {
    ...withSalesTotals(row),
    credit_total: creditTotal,
    payments_total: paymentsTotal,
    products_total: productsTotal,
    total_purchases: totalPurchases,
    total_paid: totalPaid,
    balance: totalPurchases - totalPaid,
  };
};

class Customer {
  // Get all customers with optional filters
  static async getAll(filters = {}) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    let query = `
      SELECT c.*,
             COALESCE(st.total_spent, 0) AS total_spent,
             COALESCE(st.purchases_count, 0) AS purchases_count,
             st.last_purchase,
             COALESCE(st.credit_total, 0) AS credit_total,
             COALESCE(pt.payments_total, 0) AS payments_total,
             COALESCE(cpt.products_total, 0) AS products_total
      FROM customers c
      ${SALES_TOTALS_JOIN}
      ${ACCOUNT_TOTALS_JOIN}
      WHERE c.is_active = 1
    `;
    const params = [];

    // Apply filters: name, email, phone, client number (code) or exact ID ("12" / "#12").
    // The client number follows the till rules: "9", "009", "N° 9", "Client N° 009" -> N° 009.
    const term = filters.search ? String(filters.search).trim() : '';
    const parsedTerm = term ? parseCustomerLabel(term) : null;
    const bareTerm = parsedTerm?.kind === 'code' ? parsedTerm.code : term;
    const numericTerm = numericCodeValue(bareTerm) ?? -1;
    const idTerm = /^\d+$/.test(bareTerm) ? Number(bareTerm) : -1;
    if (term) {
      const like = `%${likeEscape(term)}%`;
      const bareLike = `%${likeEscape(bareTerm)}%`;
      query += ` AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.code LIKE ? OR c.id = ?
                      OR ${NUMERIC_CODE_SQL('c.code')})`;
      params.push(like, like, like, bareLike, idTerm, numericTerm);
    }

    if (filters.customer_type) {
      query += ' AND c.customer_type = ?';
      params.push(filters.customer_type);
    }

    if (filters.city) {
      query += ' AND c.city = ?';
      params.push(filters.city);
    }

    // Searching: the exact client number first ("N° 9" / "9" / "009" -> N° 009), then the
    // exact ID, the exact name and names starting with the text; everything else by name.
    if (term) {
      query += `
        ORDER BY
          CASE
            WHEN c.code = ? OR ${NUMERIC_CODE_SQL('c.code')} THEN 0
            WHEN c.id = ? THEN 1
            WHEN c.name = ? THEN 2
            WHEN c.name LIKE ? THEN 3
            ELSE 4
          END,
          c.name ASC`;
      params.push(bareTerm, numericTerm, idTerm, term, `${likeEscape(term)}%`);
    } else {
      query += ' ORDER BY c.name ASC';
    }

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
    // Account totals (Total / Paid / Balance) are computed here: the `customers.total_paid`
    // and `customers.balance` columns are stale caches and must not reach the cards.
    return rows.map(withAccountTotals);
  }

  // Active customer already using a client number (optionally ignoring one ID)
  static async getByCode(code, excludeId = null) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    return db.get(
      'SELECT id, name, code FROM customers WHERE is_active = 1 AND code = ? AND id <> ? LIMIT 1',
      [code, excludeId ? Number(excludeId) : -1]
    );
  }

  // Get customer by ID
  static async getById(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM customers WHERE id = ?';
    const row = await db.get(query, [id]);
    return row;
  }

  // Get customer by email
  static async getByEmail(email) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM customers WHERE email = ? AND is_active = 1';
    const row = await db.get(query, [email]);
    return row;
  }

  // Create new customer
  static async create(customerData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      name, email, phone, address, city, postal_code,
      customer_type, credit_limit, notes, code
    } = customerData;

    const query = `
      INSERT INTO customers (
        name, email, phone, address, city, postal_code,
        customer_type, credit_limit, notes, code
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.run(query, [
      name, email || null, phone || null, address || null, city || null, postal_code || null,
      customer_type || 'retail', credit_limit || 0, notes || null, code || null
    ]);

    return { id: result.lastID, ...customerData };
  }

  // Update customer
  static async update(id, customerData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const current = (await db.get('SELECT * FROM customers WHERE id = ?', [id])) || {};
    const pick = (key, fallback = null) =>
      customerData[key] !== undefined ? customerData[key] : (current[key] ?? fallback);

    const query = `
      UPDATE customers
      SET name = ?, email = ?, phone = ?, address = ?, city = ?,
          postal_code = ?, customer_type = ?, credit_limit = ?,
          notes = ?, code = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.run(query, [
      pick('name', ''), pick('email') || null, pick('phone') || null, pick('address') || null,
      pick('city') || null, pick('postal_code') || null, pick('customer_type', 'retail'),
      pick('credit_limit', 0) || 0, pick('notes') || null, pick('code') || null,
      pick('is_active', 1) ? 1 : 0, id
    ]);

    return { id, ...customerData };
  }

  // Delete customer (soft delete)
  static async delete(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = 'UPDATE customers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const result = await db.run(query, [id]);
    return result.changes > 0;
  }

  // Get customer statistics
  static async getCustomerStats(customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const totalSales = await db.get(
      'SELECT COUNT(*) as count FROM sales WHERE customer_id = ?',
      [customerId]
    );

    const totalRevenue = await db.get(
      'SELECT SUM(totalPrice) as total FROM sales WHERE customer_id = ?',
      [customerId]
    );

    const lastSale = await db.get(
      'SELECT date, totalPrice FROM sales WHERE customer_id = ? ORDER BY date DESC LIMIT 1',
      [customerId]
    );

    const avgSale = await db.get(
      'SELECT AVG(totalPrice) as average FROM sales WHERE customer_id = ?',
      [customerId]
    );

    return {
      totalSales: totalSales?.count || 0,
      totalRevenue: parseFloat(totalRevenue?.total || 0),
      averageSale: parseFloat(avgSale?.average || 0),
      lastSaleDate: lastSale?.date,
      lastSaleAmount: parseFloat(lastSale?.totalPrice || 0)
    };
  }

  // Get customer purchase history (F-07).
  // The product name comes from the sale line itself: QR-sale product IDs belong to the
  // products_manager catalogue, so joining bricojamal.products gave wrong or missing names.
  static async getPurchaseHistory(customerId, limit = 10) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    // Validated integer written into the SQL: mysql2 prepared statements send JS numbers
    // as DOUBLE, which MySQL 8.0.22+ rejects for LIMIT ("Incorrect arguments to mysqld_stmt_execute").
    const requested = Number.parseInt(limit, 10);
    const safeLimit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 1000) : 10;

    const query = `
      SELECT s.*, s.productName AS product_name
      FROM sales s
      WHERE s.customer_id = ?
      ORDER BY s.date DESC, s.created_at DESC, s.id DESC
      LIMIT ${safeLimit}
    `;

    return db.all(query, [customerId]);
  }

  // Live search for the till: name, phone, email, client number (code) or ID.
  // Best matches first: exact client number / ID / name, then "starts with", then the rest.
  static async search(term) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const text = String(term || '').trim();
    if (!text) return [];
    // "N° 12", "#12", "رقم 12" -> also try "12" for the ID / client number
    const bare = text.replace(/^(?:#|n\s*[°º]|no\.?|num(?:[ée]ro)?\.?|رقم)\s*[:#-]?\s*/iu, '').trim() || text;
    const numericId = /^\d+$/.test(bare) ? Number(bare) : -1;
    // "9" also finds client number "009" (and "009" finds "9")
    const numericCode = numericCodeValue(bare) ?? -1;
    const contains = `%${likeEscape(text)}%`;
    const bareContains = `%${likeEscape(bare)}%`;
    const starts = `${likeEscape(text)}%`;
    const bareStarts = `${likeEscape(bare)}%`;
    // "0661234567" also finds "0661-234567" / "06 61 23 45 67" (3+ digits typed)
    const digits = /^[\d\s.\-+]+$/.test(bare) ? bare.replace(/\D/g, '') : '';
    const phoneDigits = digits.length >= 3 ? `%${digits}%` : contains;

    const query = `
      SELECT c.id, c.name, c.code, c.phone, c.email, c.city, c.customer_type,
             COALESCE(st.total_spent, 0) AS total_spent,
             COALESCE(st.purchases_count, 0) AS purchases_count,
             st.last_purchase
      FROM customers c
      ${SALES_TOTALS_JOIN}
      WHERE c.is_active = 1
        AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.code LIKE ? OR c.id = ?
             OR ${NUMERIC_CODE_SQL('c.code')}
             OR REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '.', ''), '+', '') LIKE ?)
      ORDER BY
        CASE
          WHEN c.code = ? OR ${NUMERIC_CODE_SQL('c.code')} THEN 0
          WHEN c.id = ? THEN 1
          WHEN c.name = ? THEN 2
          WHEN c.name LIKE ? THEN 3
          WHEN c.code LIKE ? OR c.phone LIKE ? THEN 4
          ELSE 5
        END,
        COALESCE(st.last_purchase, '1970-01-01') DESC,
        c.name ASC
      LIMIT 8
    `;

    const rows = await db.all(query, [
      // WHERE
      contains, contains, contains, bareContains, numericId, numericCode, phoneDigits,
      // ORDER BY
      bare, numericCode, numericId, text, starts, bareStarts, bareStarts,
    ]);
    return rows.map(withSalesTotals);
  }

  // Find an existing customer for the text typed at the till (no creation).
  // `parsed` comes from parseCustomerLabel(): { kind: 'code' | 'name', code, name }
  static async findByLabel(parsed, rawText = '') {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');
    if (!parsed) return null;

    if (parsed.kind === 'code') {
      // Client number first ("9", "009" and "N° 9" are the same number),
      // then a phone number written with or without spaces / dashes
      const numeric = numericCodeValue(parsed.code);
      const byCode = await db.get(
        `SELECT * FROM customers
         WHERE is_active = 1 AND (code = ? OR ${NUMERIC_CODE_SQL('code')})
         ORDER BY (code = ?) DESC, id ASC LIMIT 1`,
        [parsed.code, numeric ?? -1, parsed.code]
      );
      if (byCode) return byCode;
      if (/^\d{6,}$/.test(parsed.code)) {
        const byPhone = await db.get(
          `SELECT * FROM customers
           WHERE is_active = 1
             AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', ''), '+212', '0') = ?
           ORDER BY id ASC LIMIT 1`,
          [parsed.code]
        );
        if (byPhone) return byPhone;
      }
    }

    // Exact name (case-insensitive collation). Also covers "Client 1234" typed literally.
    const name = String(rawText || parsed.name || '').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    return db.get(
      'SELECT * FROM customers WHERE is_active = 1 AND name = ? ORDER BY id ASC LIMIT 1',
      [name]
    );
  }

  // Create the customer typed at the till (client number -> "Client 1234" + code)
  static async createFromLabel(parsed) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');
    if (!parsed) return null;

    // A Moroccan phone typed as the client number ("0612345678") is also saved as the phone
    const phone = parsed.code && /^0[5-8]\d{8}$/.test(parsed.code) ? parsed.code : null;
    const result = await db.run(
      `INSERT INTO customers (name, code, phone, customer_type, credit_limit, notes)
       VALUES (?, ?, ?, 'retail', 0, ?)`,
      [parsed.name, parsed.code || null, phone, 'Créé automatiquement depuis Vente QR']
    );
    return db.get('SELECT * FROM customers WHERE id = ?', [result.lastID]);
  }

  // Nothing typed at the till: new client with the next free number -> "Client N° 009".
  // The counter row is locked for the whole transaction, so two tills never get the same number.
  static async createAutoNumbered() {
    return withAutoCodeTransaction(async (connection) => {
      const code = await takeNextAutoCode(connection);
      const [result] = await connection.query(
        `INSERT INTO customers (name, code, customer_type, credit_limit, notes)
         VALUES (?, ?, 'retail', 0, ?)`,
        [autoCustomerName(code), code, 'Numéro client créé automatiquement depuis Vente QR']
      );
      const [rows] = await connection.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
      return rows[0] || null;
    });
  }

  // Give the next free client number to a client that has none (e.g. "Ahmed" sold at the till).
  // The name is kept: "Ahmed" -> "Ahmed (N° 011)". Returns the client row (unchanged if it
  // already had a number), or null if the client does not exist.
  static async assignAutoCode(customerId) {
    const id = Number(customerId);
    if (!Number.isInteger(id) || id <= 0) return null;
    return withAutoCodeTransaction(async (connection) => {
      // Counter first (same lock order as createAutoNumbered), then the client row
      await connection.query('SELECT value FROM app_counters WHERE name = ? FOR UPDATE', [AUTO_CODE_COUNTER]);
      const [rows] = await connection.query('SELECT * FROM customers WHERE id = ? FOR UPDATE', [id]);
      const row = rows[0];
      if (!row) return null;
      if (String(row.code ?? '').trim()) return row;

      const code = await takeNextAutoCode(connection);
      await connection.query(
        'UPDATE customers SET code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [code, id]
      );
      return { ...row, code };
    });
  }

  // Full profile: customer + totals + every purchase line + most bought products
  static async getOverview(customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) return null;

    const totals = await db.get(
      `SELECT COUNT(*) AS lines_count,
              COUNT(DISTINCT ${TICKET_KEY_SQL}) AS purchases_count,
              COALESCE(SUM(quantity), 0) AS units,
              COALESCE(SUM(totalPrice), 0) AS total_spent,
              COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN totalPrice ELSE 0 END), 0) AS credit_total,
              MIN(date) AS first_purchase,
              MAX(date) AS last_purchase
       FROM sales WHERE customer_id = ?`,
      [customerId]
    );

    const sales = await db.all(
      `SELECT id, sale_number, ${TICKET_KEY_SQL} AS ticket, date, product_id, productName,
              category, price, quantity, totalPrice, payment_method, notes, created_at
       FROM sales WHERE customer_id = ?
       ORDER BY date DESC, created_at DESC, id DESC
       LIMIT 1000`,
      [customerId]
    );

    const topProducts = await db.all(
      `SELECT productName, product_id,
              SUM(quantity) AS units, SUM(totalPrice) AS amount, COUNT(*) AS times
       FROM sales WHERE customer_id = ?
       GROUP BY productName, product_id
       ORDER BY amount DESC
       LIMIT 8`,
      [customerId]
    );

    // Customer account: payments received + goods taken without paying (credit items)
    const payments = await db.all(
      `SELECT id, amount, payment_date, payment_method, reference_number, notes, created_at
       FROM customer_payments WHERE customer_id = ?
       ORDER BY payment_date DESC, created_at DESC, id DESC`,
      [customerId]
    ).catch(() => []);

    const credits = await db.all(
      `SELECT id, product_id, product_name, quantity, unit_price, total_price, status, notes, created_at
       FROM customer_products WHERE customer_id = ? AND status <> 'cancelled'
       ORDER BY created_at DESC, id DESC`,
      [customerId]
    ).catch(() => []);

    const paymentsTotal = payments.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
    const productsTotal = credits.reduce((sum, row) => sum + parseFloat(row.total_price || 0), 0);
    // Same math as the customer cards: Total = till sales + credit items;
    // Paid = non-credit till sales + payments received; Balance = Total - Paid
    // (> 0: the client owes the shop, < 0: the shop owes the client / advance).
    const account = withAccountTotals({
      total_spent: totals?.total_spent,
      purchases_count: totals?.purchases_count,
      credit_total: totals?.credit_total,
      payments_total: paymentsTotal,
      products_total: productsTotal,
    });

    return {
      customer,
      totals: {
        lines_count: Number(totals?.lines_count || 0),
        purchases_count: account.purchases_count,
        units: Number(totals?.units || 0),
        total_spent: account.total_spent,
        credit_total: account.credit_total,
        payments_total: account.payments_total,
        products_total: account.products_total,
        total_purchases: account.total_purchases,
        total_paid: account.total_paid,
        balance: account.balance,
        first_purchase: totals?.first_purchase || null,
        last_purchase: totals?.last_purchase || null,
      },
      payments: payments.map((row) => ({ ...row, amount: parseFloat(row.amount || 0) })),
      credits: credits.map((row) => ({
        ...row,
        quantity: Number(row.quantity || 0),
        unit_price: parseFloat(row.unit_price || 0),
        total_price: parseFloat(row.total_price || 0),
      })),
      sales: sales.map((row) => ({
        ...row,
        price: parseFloat(row.price || 0),
        totalPrice: parseFloat(row.totalPrice || 0),
      })),
      topProducts: topProducts.map((row) => ({
        ...row,
        units: Number(row.units || 0),
        amount: parseFloat(row.amount || 0),
        times: Number(row.times || 0),
      })),
    };
  }

  // Get customer types
  static async getCustomerTypes() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT customer_type, COUNT(*) as count
      FROM customers
      WHERE is_active = 1
      GROUP BY customer_type
      ORDER BY customer_type
    `;

    const rows = await db.all(query);
    return rows;
  }

  // Get top customers by revenue
  static async getTopCustomers(limit = 10) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT c.*,
             COUNT(s.id) as total_orders,
             SUM(s.totalPrice) as total_revenue,
             AVG(s.totalPrice) as avg_order_value,
             MAX(s.date) as last_order_date
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      WHERE c.is_active = 1
      GROUP BY c.id
      HAVING total_revenue > 0
      ORDER BY total_revenue DESC
      LIMIT ?
    `;

    const rows = await db.all(query, [limit]);
    return rows.map(row => ({
      ...row,
      total_revenue: parseFloat(row.total_revenue || 0),
      avg_order_value: parseFloat(row.avg_order_value || 0)
    }));
  }

  // Active customers with no purchase in the last `daysInactive` days, or none at all (F-08).
  // MySQL date syntax (the old query used SQLite's DATE('now', ...) and always failed).
  static async getInactiveCustomers(daysInactive = 90) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    // Validated integer written into the SQL (same mysql2 number-binding issue as LIMIT)
    const requested = Number.parseInt(daysInactive, 10);
    const days = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 3650) : 90;

    // Last purchase per customer in a derived table: no GROUP BY on c.*, so it also works
    // with ONLY_FULL_GROUP_BY on MariaDB.
    const query = `
      SELECT c.*, ls.last_purchase_date
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, MAX(date) AS last_purchase_date
        FROM sales
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      ) ls ON ls.customer_id = c.id
      WHERE c.is_active = 1
        AND (ls.last_purchase_date IS NULL
             OR ls.last_purchase_date < DATE_SUB(CURDATE(), INTERVAL ${days} DAY))
      ORDER BY ls.last_purchase_date ASC, c.name ASC
    `;

    return db.all(query);
  }

  // ============================================
  // CUSTOMER PAYMENTS METHODS
  // ============================================

  // Add a payment for a customer
  static async addPayment(customerId, paymentData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      amount, payment_date, payment_method, reference_number, notes
    } = paymentData;

    const query = `
      INSERT INTO customer_payments (
        customer_id, amount, payment_date, payment_method, reference_number, notes
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = await db.run(query, [
      customerId, amount, payment_date || new Date().toISOString().split('T')[0],
      payment_method || 'cash', reference_number || null, notes || null
    ]);

    // Totals are computed from customer_payments (no `customers.total_paid` cache: that
    // column does not exist in a freshly created database and made this call fail).
    return { id: result.lastID, customer_id: customerId, ...paymentData };
  }

  // Get all payments for a customer
  static async getPayments(customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT *
      FROM customer_payments
      WHERE customer_id = ?
      ORDER BY payment_date DESC, created_at DESC
    `;

    const rows = await db.all(query, [customerId]);
    return rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount || 0)
    }));
  }

  // Get total paid by a customer
  static async getTotalPaid(customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const result = await db.get(
      'SELECT SUM(amount) as total FROM customer_payments WHERE customer_id = ?',
      [customerId]
    );

    return parseFloat(result?.total || 0);
  }

  // Delete a payment
  static async deletePayment(paymentId, customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    // Get the payment amount first
    const payment = await db.get(
      'SELECT amount FROM customer_payments WHERE id = ? AND customer_id = ?',
      [paymentId, customerId]
    );

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Delete the payment (totals are computed from customer_payments)
    await db.run('DELETE FROM customer_payments WHERE id = ? AND customer_id = ?', [paymentId, customerId]);

    return true;
  }

  // ============================================
  // CUSTOMER PRODUCTS METHODS
  // ============================================

  // Add a product to customer's list
  static async addProduct(customerId, productData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      product_id, product_name, quantity, unit_price, status, notes
    } = productData;

    const total_price = quantity * unit_price;

    const query = `
      INSERT INTO customer_products (
        customer_id, product_id, product_name, quantity, unit_price, total_price, status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // mysql2 rejects `undefined` bind values -> optional fields become NULL
    const result = await db.run(query, [
      customerId, product_id || null, product_name, quantity, unit_price, total_price,
      status || 'pending', notes || null
    ]);

    return { id: result.lastID, customer_id: customerId, ...productData, total_price };
  }

  // Get all products for a customer
  static async getProducts(customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT cp.*, p.name as current_product_name, p.price as current_price
      FROM customer_products cp
      LEFT JOIN products p ON cp.product_id = p.id
      WHERE cp.customer_id = ?
      ORDER BY cp.created_at DESC
    `;

    const rows = await db.all(query, [customerId]);
    return rows.map(row => ({
      ...row,
      unit_price: parseFloat(row.unit_price || 0),
      total_price: parseFloat(row.total_price || 0)
    }));
  }

  // Get total price of all products for a customer
  static async getProductsTotal(customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const result = await db.get(
      "SELECT SUM(total_price) as total FROM customer_products WHERE customer_id = ? AND status <> 'cancelled'",
      [customerId]
    );

    return parseFloat(result?.total || 0);
  }

  // Update a customer product
  static async updateProduct(productId, customerId, productData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      quantity, unit_price, status, notes
    } = productData;

    const total_price = quantity * unit_price;

    const query = `
      UPDATE customer_products
      SET quantity = ?, unit_price = ?, total_price = ?, status = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND customer_id = ?
    `;

    await db.run(query, [
      quantity, unit_price, total_price, status, notes, productId, customerId
    ]);

    return { id: productId, customer_id: customerId, ...productData, total_price };
  }

  // Delete a customer product
  static async deleteProduct(productId, customerId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const result = await db.run(
      'DELETE FROM customer_products WHERE id = ? AND customer_id = ?',
      [productId, customerId]
    );

    return result.changes > 0;
  }
}

export default Customer;
