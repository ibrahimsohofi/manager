import { getDatabase } from '../config/database.js';

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
      sale_number = null
    } = saleData;

    const query = `
      INSERT INTO sales (
        date, product_id, productName, price, quantity, category, totalPrice,
        discount, tax_amount, payment_method, customer_id, notes, sale_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.run(query, [
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
    ]);

    return { id: result.lastID, ...saleData };
  }

  // Update sale
  static async update(id, saleData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const { date, productName, price, quantity, category, totalPrice } = saleData;

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
