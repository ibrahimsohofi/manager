import { getDatabase } from '../config/database.js';

class Product {
  // Get all products with optional filters
  static async getAll(filters = {}) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    let query = `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.is_active = 1
    `;
    const params = [];

    // Apply filters
    if (filters.category) {
      query += ' AND p.category = ?';
      params.push(filters.category);
    }

    if (filters.search) {
      query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.low_stock) {
      query += ' AND p.stock_quantity <= p.min_stock_level';
    }

    if (filters.supplier_id) {
      query += ' AND p.supplier_id = ?';
      params.push(filters.supplier_id);
    }

    // Order by name
    query += ' ORDER BY p.name ASC';

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

  // Get product by ID
  static async getById(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?
    `;
    const row = await db.get(query, [id]);
    return row;
  }

  // Get product by SKU
  static async getBySku(sku) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.sku = ?
    `;
    const row = await db.get(query, [sku]);
    return row;
  }

  // Get product by barcode
  static async getByBarcode(barcode) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.barcode = ?
    `;
    const row = await db.get(query, [barcode]);
    return row;
  }

  // Create new product
  static async create(productData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      name, description, sku, barcode, category, price, cost,
      stock_quantity, min_stock_level, max_stock_level, unit,
      supplier_id, image_url
    } = productData;

    const query = `
      INSERT INTO products (
        name, description, sku, barcode, category, price, cost,
        stock_quantity, min_stock_level, max_stock_level, unit,
        supplier_id, image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.run(query, [
      name, description, sku, barcode, category, price, cost || 0,
      stock_quantity || 0, min_stock_level || 5, max_stock_level || 100,
      unit || 'unit', supplier_id, image_url
    ]);

    return { id: result.lastID, ...productData };
  }

  // Update product
  static async update(id, productData) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const {
      name, description, sku, barcode, category, price, cost,
      stock_quantity, min_stock_level, max_stock_level, unit,
      supplier_id, image_url, is_active
    } = productData;

    // Get current product prices before updating
    const currentProduct = await this.getById(id);
    if (currentProduct) {
      const oldSellingPrice = parseFloat(currentProduct.price) || 0;
      const oldPurchasePrice = parseFloat(currentProduct.cost) || 0;
      const newSellingPrice = parseFloat(price) || 0;
      const newPurchasePrice = parseFloat(cost) || 0;

      // Log selling price change if different
      if (oldSellingPrice !== newSellingPrice) {
        await db.run(
          `INSERT INTO price_history (product_id, price_type, old_price, new_price, changed_by, notes)
           VALUES (?, 'selling', ?, ?, 'system', ?)`,
          [id, oldSellingPrice, newSellingPrice, `Selling price changed from ${oldSellingPrice} to ${newSellingPrice}`]
        );
      }

      // Log purchase price change if different
      if (oldPurchasePrice !== newPurchasePrice) {
        await db.run(
          `INSERT INTO price_history (product_id, price_type, old_price, new_price, changed_by, notes)
           VALUES (?, 'purchase', ?, ?, 'system', ?)`,
          [id, oldPurchasePrice, newPurchasePrice, `Purchase price changed from ${oldPurchasePrice} to ${newPurchasePrice}`]
        );
      }
    }

    const query = `
      UPDATE products
      SET name = ?, description = ?, sku = ?, barcode = ?, category = ?,
          price = ?, cost = ?, stock_quantity = ?, min_stock_level = ?,
          max_stock_level = ?, unit = ?, supplier_id = ?, image_url = ?,
          is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.run(query, [
      name, description, sku, barcode, category, price, cost,
      stock_quantity, min_stock_level, max_stock_level, unit,
      supplier_id, image_url, is_active !== undefined ? is_active : 1, id
    ]);

    return { id, ...productData };
  }

  // Update stock quantity
  static async updateStock(id, quantity, movementType, reference = null) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    try {
      await db.run('BEGIN TRANSACTION');

      // Get current stock
      const product = await this.getById(id);
      if (!product) {
        throw new Error('Product not found');
      }

      let newQuantity;
      if (movementType === 'in') {
        newQuantity = product.stock_quantity + quantity;
      } else if (movementType === 'out') {
        newQuantity = product.stock_quantity - quantity;
        if (newQuantity < 0) {
          throw new Error('Insufficient stock');
        }
      } else {
        newQuantity = quantity; // adjustment
      }

      // Update product stock
      await db.run(
        'UPDATE products SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newQuantity, id]
      );

      // Record stock movement
      await db.run(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, movementType, quantity, reference?.type, reference?.id]
      );

      await db.run('COMMIT');
      return { previous_quantity: product.stock_quantity, new_quantity: newQuantity };
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  // Delete product (soft delete)
  static async delete(id) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = 'UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const result = await db.run(query, [id]);
    return result.changes > 0;
  }

  // Get products with low stock
  static async getLowStock() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.stock_quantity <= p.min_stock_level AND p.is_active = 1
      ORDER BY p.stock_quantity ASC
    `;

    const rows = await db.all(query);
    return rows;
  }

  // Get product categories
  static async getCategories() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT category, COUNT(*) as product_count
      FROM products
      WHERE is_active = 1
      GROUP BY category
      ORDER BY category
    `;

    const rows = await db.all(query);
    return rows;
  }

  // Get inventory statistics
  static async getInventoryStats() {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const totalProducts = await db.get('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
    const totalValue = await db.get('SELECT SUM(price * stock_quantity) as total FROM products WHERE is_active = 1');
    const totalCost = await db.get('SELECT SUM(cost * stock_quantity) as total FROM products WHERE is_active = 1');
    const lowStock = await db.get('SELECT COUNT(*) as count FROM products WHERE stock_quantity <= min_stock_level AND is_active = 1');

    return {
      totalProducts: totalProducts?.count || 0,
      totalValue: parseFloat(totalValue?.total || 0),
      totalCost: parseFloat(totalCost?.total || 0),
      lowStockCount: lowStock?.count || 0
    };
  }

  // Search products by name, SKU, or barcode
  static async search(term) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)
      AND p.is_active = 1
      ORDER BY p.name ASC
      LIMIT 20
    `;

    const searchTerm = `%${term}%`;
    const rows = await db.all(query, [searchTerm, searchTerm, searchTerm]);
    return rows;
  }

  // Get price history for a product
  static async getPriceHistory(productId) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    const query = `
      SELECT
        id,
        price_type,
        old_price,
        new_price,
        price_difference,
        percentage_change,
        changed_by,
        notes,
        changed_at
      FROM price_history
      WHERE product_id = ?
      ORDER BY changed_at DESC
    `;

    const rows = await db.all(query, [productId]);
    return rows;
  }

  // Get all price history (for reports)
  static async getAllPriceHistory(limit = 50, priceType = 'all') {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');

    let query = `
      SELECT
        ph.id,
        ph.product_id,
        p.name as product_name,
        ph.price_type,
        ph.old_price,
        ph.new_price,
        ph.price_difference,
        ph.percentage_change,
        ph.changed_by,
        ph.notes,
        ph.changed_at
      FROM price_history ph
      JOIN products p ON ph.product_id = p.id
    `;

    const params = [];

    if (priceType !== 'all') {
      query += ' WHERE ph.price_type = ?';
      params.push(priceType);
    }

    query += ' ORDER BY ph.changed_at DESC LIMIT ?';
    params.push(limit);

    const rows = await db.all(query, params);
    return rows;
  }
}

export default Product;
