import { getDatabase } from '../config/database.js';

class Supplier {
  // Get all suppliers with optional filters
  static async getAll(filters = {}) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    let query = `
      SELECT *
      FROM suppliers
      WHERE is_active = 1
    `;
    const params = [];

    // Apply filters
    if (filters.search) {
      query += ' AND (name LIKE ? OR contact_person LIKE ? OR email LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.city) {
      query += ' AND city = ?';
      params.push(filters.city);
    }

    // Order by name
    query += ' ORDER BY name ASC';

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

  // Get supplier by ID
  static async getById(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM suppliers WHERE id = ?';
    const row = await db.get(query, [id]);
    return row;
  }

  // Create new supplier
  static async create(supplierData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      name, contact_person, email, phone, address, city, postal_code,
      payment_terms, notes
    } = supplierData;

    const query = `
      INSERT INTO suppliers (
        name, contact_person, email, phone, address, city, postal_code,
        payment_terms, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.run(query, [
      name, contact_person, email, phone, address, city, postal_code,
      payment_terms || 'Net 30', notes
    ]);

    return { id: result.lastID, ...supplierData };
  }

  // Update supplier
  static async update(id, supplierData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      name, contact_person, email, phone, address, city, postal_code,
      payment_terms, notes, is_active
    } = supplierData;

    const query = `
      UPDATE suppliers
      SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?,
          city = ?, postal_code = ?, payment_terms = ?, notes = ?,
          is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.run(query, [
      name, contact_person, email, phone, address, city, postal_code,
      payment_terms, notes, is_active !== undefined ? is_active : 1, id
    ]);

    return { id, ...supplierData };
  }

  // Delete supplier (soft delete)
  static async delete(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    // Check if supplier has products
    const productCount = await db.get(
      'SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND is_active = 1',
      [id]
    );

    if (productCount.count > 0) {
      throw new Error('Cannot delete supplier with active products');
    }

    const query = 'UPDATE suppliers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const result = await db.run(query, [id]);
    return result.changes > 0;
  }

  // Get supplier products
  static async getProducts(supplierId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT *
      FROM products
      WHERE supplier_id = ? AND is_active = 1
      ORDER BY name ASC
    `;

    const rows = await db.all(query, [supplierId]);
    return rows;
  }

  // Get supplier statistics
  static async getSupplierStats(supplierId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const totalProducts = await db.get(
      'SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND is_active = 1',
      [supplierId]
    );

    const totalPurchaseOrders = await db.get(
      'SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?',
      [supplierId]
    );

    const totalValue = await db.get(
      'SELECT SUM(total_amount) as total FROM purchase_orders WHERE supplier_id = ?',
      [supplierId]
    );

    const lastOrder = await db.get(
      'SELECT order_date, total_amount FROM purchase_orders WHERE supplier_id = ? ORDER BY order_date DESC LIMIT 1',
      [supplierId]
    );

    return {
      totalProducts: totalProducts?.count || 0,
      totalPurchaseOrders: totalPurchaseOrders?.count || 0,
      totalValue: parseFloat(totalValue?.total || 0),
      lastOrderDate: lastOrder?.order_date,
      lastOrderAmount: parseFloat(lastOrder?.total_amount || 0)
    };
  }

  // Get purchase order history
  static async getPurchaseHistory(supplierId, limit = 10) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT *
      FROM purchase_orders
      WHERE supplier_id = ?
      ORDER BY order_date DESC, created_at DESC
      LIMIT ?
    `;

    const rows = await db.all(query, [supplierId, limit]);
    return rows;
  }

  // Search suppliers
  static async search(term) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT *
      FROM suppliers
      WHERE (name LIKE ? OR contact_person LIKE ? OR email LIKE ?)
      AND is_active = 1
      ORDER BY name ASC
      LIMIT 20
    `;

    const searchTerm = `%${term}%`;
    const rows = await db.all(query, [searchTerm, searchTerm, searchTerm]);
    return rows;
  }

  // Get top suppliers by order value
  static async getTopSuppliers(limit = 10) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT s.*,
             COUNT(po.id) as total_orders,
             SUM(po.total_amount) as total_value,
             AVG(po.total_amount) as avg_order_value,
             MAX(po.order_date) as last_order_date
      FROM suppliers s
      LEFT JOIN purchase_orders po ON s.id = po.supplier_id
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY total_value DESC
      LIMIT ?
    `;

    const rows = await db.all(query, [limit]);
    return rows.map(row => ({
      ...row,
      total_value: parseFloat(row.total_value || 0),
      avg_order_value: parseFloat(row.avg_order_value || 0)
    }));
  }

  // Get suppliers with pending orders
  static async getSuppliersWithPendingOrders() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT s.*, COUNT(po.id) as pending_orders
      FROM suppliers s
      INNER JOIN purchase_orders po ON s.id = po.supplier_id
      WHERE po.status = 'pending' AND s.is_active = 1
      GROUP BY s.id
      ORDER BY pending_orders DESC
    `;

    const rows = await db.all(query);
    return rows;
  }

  // Get product categories by supplier
  static async getProductCategories(supplierId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT category, COUNT(*) as product_count
      FROM products
      WHERE supplier_id = ? AND is_active = 1
      GROUP BY category
      ORDER BY category
    `;

    const rows = await db.all(query, [supplierId]);
    return rows;
  }
}

export default Supplier;
