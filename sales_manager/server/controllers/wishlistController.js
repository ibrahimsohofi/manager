import { pool } from '../config/database.js';

// Get all wishlist items for a customer
export const getCustomerWishlist = async (req, res) => {
  const { customerId } = req.params;

  try {
    const [rows] = await pool.execute(
      `SELECT
        w.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
       FROM customer_wishlist w
       JOIN customers c ON w.customer_id = c.id
       WHERE w.customer_id = ?
       ORDER BY
         FIELD(w.status, 'pending', 'confirmed', 'cancelled', 'converted'),
         FIELD(w.priority, 'urgent', 'high', 'medium', 'low'),
         w.created_at DESC`,
      [customerId]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({
      error: 'Failed to fetch wishlist',
      message: error.message
    });
  }
};

// Get a single wishlist item
export const getWishlistItem = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM customer_wishlist WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching wishlist item:', error);
    res.status(500).json({
      error: 'Failed to fetch wishlist item',
      message: error.message
    });
  }
};

// Add item to wishlist
export const addWishlistItem = async (req, res) => {
  const { customerId } = req.params;
  const {
    product_id,
    product_name,
    quantity,
    unit_price,
    status,
    priority,
    notes,
    requested_date,
    estimated_delivery_date
  } = req.body;

  try {
    // Validate required fields
    if (!product_name || !quantity || !unit_price) {
      return res.status(400).json({
        error: 'Missing required fields: product_name, quantity, unit_price'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO customer_wishlist
       (customer_id, product_id, product_name, quantity, unit_price, status, priority, notes, requested_date, estimated_delivery_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        product_id || null,
        product_name,
        quantity,
        unit_price,
        status || 'pending',
        priority || 'medium',
        notes || null,
        requested_date || null,
        estimated_delivery_date || null
      ]
    );

    // Fetch the newly created item
    const [newItem] = await pool.execute(
      'SELECT * FROM customer_wishlist WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(newItem[0]);
  } catch (error) {
    console.error('Error adding wishlist item:', error);
    res.status(500).json({
      error: 'Failed to add wishlist item',
      message: error.message
    });
  }
};

// Update wishlist item
export const updateWishlistItem = async (req, res) => {
  const { id } = req.params;
  const {
    product_name,
    quantity,
    unit_price,
    status,
    priority,
    notes,
    requested_date,
    estimated_delivery_date
  } = req.body;

  try {
    // Check if item exists
    const [existing] = await pool.execute(
      'SELECT * FROM customer_wishlist WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (product_name !== undefined) {
      updates.push('product_name = ?');
      values.push(product_name);
    }
    if (quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(quantity);
    }
    if (unit_price !== undefined) {
      updates.push('unit_price = ?');
      values.push(unit_price);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }
    if (requested_date !== undefined) {
      updates.push('requested_date = ?');
      values.push(requested_date);
    }
    if (estimated_delivery_date !== undefined) {
      updates.push('estimated_delivery_date = ?');
      values.push(estimated_delivery_date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    await pool.execute(
      `UPDATE customer_wishlist SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch updated item
    const [updated] = await pool.execute(
      'SELECT * FROM customer_wishlist WHERE id = ?',
      [id]
    );

    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating wishlist item:', error);
    res.status(500).json({
      error: 'Failed to update wishlist item',
      message: error.message
    });
  }
};

// Delete wishlist item
export const deleteWishlistItem = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.execute(
      'DELETE FROM customer_wishlist WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }

    res.json({ message: 'Wishlist item deleted successfully' });
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    res.status(500).json({
      error: 'Failed to delete wishlist item',
      message: error.message
    });
  }
};

// Get wishlist statistics for a customer
export const getWishlistStats = async (req, res) => {
  const { customerId } = req.params;

  try {
    const [stats] = await pool.execute(
      `SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_items,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_items,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_items,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted_items,
        SUM(CASE WHEN status != 'cancelled' THEN total_price ELSE 0 END) as total_value,
        SUM(quantity) as total_quantity
       FROM customer_wishlist
       WHERE customer_id = ?`,
      [customerId]
    );

    res.json(stats[0]);
  } catch (error) {
    console.error('Error fetching wishlist stats:', error);
    res.status(500).json({
      error: 'Failed to fetch wishlist statistics',
      message: error.message
    });
  }
};

// Convert wishlist to sale
export const convertWishlistToSale = async (req, res) => {
  const { customerId } = req.params;
  const { wishlistIds } = req.body;

  if (!Array.isArray(wishlistIds) || wishlistIds.length === 0) {
    return res.status(400).json({ error: 'wishlistIds must be a non-empty array' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get wishlist items
    const placeholders = wishlistIds.map(() => '?').join(',');
    const [items] = await connection.execute(
      `SELECT * FROM customer_wishlist
       WHERE id IN (${placeholders}) AND customer_id = ? AND status != 'cancelled'`,
      [...wishlistIds, customerId]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'No valid wishlist items found' });
    }

    // Create sales entries
    const saleDate = new Date().toISOString().split('T')[0];
    const salesIds = [];

    for (const item of items) {
      const [result] = await connection.execute(
        `INSERT INTO sales
         (date, product_id, productName, price, quantity, category, totalPrice, customer_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleDate,
          item.product_id,
          item.product_name,
          item.unit_price,
          item.quantity,
          'Wishlist Conversion',
          item.total_price,
          customerId,
          `Converted from wishlist item #${item.id}`
        ]
      );
      salesIds.push(result.insertId);

      // Update wishlist item status
      await connection.execute(
        'UPDATE customer_wishlist SET status = ? WHERE id = ?',
        ['converted', item.id]
      );
    }

    await connection.commit();

    res.json({
      message: 'Wishlist items converted to sales successfully',
      salesIds,
      convertedItems: items.length
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error converting wishlist to sale:', error);
    res.status(500).json({
      error: 'Failed to convert wishlist to sale',
      message: error.message
    });
  } finally {
    connection.release();
  }
};
