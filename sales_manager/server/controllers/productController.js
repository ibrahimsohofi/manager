import Product from '../models/Product.js';

// Get all products with optional filters
export const getAllProducts = async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      search: req.query.search,
      low_stock: req.query.low_stock === 'true',
      supplier_id: req.query.supplier_id,
      limit: req.query.limit,
      offset: req.query.offset
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const products = await Product.getAll(filters);
    res.json(products);
  } catch (error) {
    console.error('Error getting products:', error);
    // Return empty array when database is not available
    res.json([]);
  }
};

// Get product by ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.getById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

// Get product by SKU
export const getProductBySku = async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await Product.getBySku(sku);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error getting product by SKU:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

// Get product by barcode
export const getProductByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    const product = await Product.getByBarcode(barcode);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error getting product by barcode:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

// Create new product
export const createProduct = async (req, res) => {
  try {
    const {
      name, description, sku, barcode, category, price, cost,
      stock_quantity, min_stock_level, max_stock_level, unit,
      supplier_id, image_url
    } = req.body;

    // Validation
    if (!name || !category || price === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: name, category, price'
      });
    }

    if (price < 0) {
      return res.status(400).json({
        error: 'Price must be non-negative'
      });
    }

    // Check for duplicate SKU if provided
    if (sku) {
      const existingProduct = await Product.getBySku(sku);
      if (existingProduct) {
        return res.status(400).json({
          error: 'Product with this SKU already exists'
        });
      }
    }

    // Check for duplicate barcode if provided
    if (barcode) {
      const existingProduct = await Product.getByBarcode(barcode);
      if (existingProduct) {
        return res.status(400).json({
          error: 'Product with this barcode already exists'
        });
      }
    }

    const productData = {
      name: name.trim(),
      description: description?.trim(),
      sku: sku?.trim(),
      barcode: barcode?.trim(),
      category: category.trim(),
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : 0,
      stock_quantity: stock_quantity ? parseInt(stock_quantity) : 0,
      min_stock_level: min_stock_level ? parseInt(min_stock_level) : 5,
      max_stock_level: max_stock_level ? parseInt(max_stock_level) : 100,
      unit: unit?.trim() || 'unit',
      supplier_id: supplier_id ? parseInt(supplier_id) : null,
      image_url: image_url?.trim()
    };

    const newProduct = await Product.create(productData);
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, sku, barcode, category, price, cost,
      stock_quantity, min_stock_level, max_stock_level, unit,
      supplier_id, image_url, is_active
    } = req.body;

    // Check if product exists
    const existingProduct = await Product.getById(id);
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Validation
    if (!name || !category || price === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: name, category, price'
      });
    }

    if (price < 0) {
      return res.status(400).json({
        error: 'Price must be non-negative'
      });
    }

    // Check for duplicate SKU if changed
    if (sku && sku !== existingProduct.sku) {
      const duplicateProduct = await Product.getBySku(sku);
      if (duplicateProduct) {
        return res.status(400).json({
          error: 'Product with this SKU already exists'
        });
      }
    }

    // Check for duplicate barcode if changed
    if (barcode && barcode !== existingProduct.barcode) {
      const duplicateProduct = await Product.getByBarcode(barcode);
      if (duplicateProduct) {
        return res.status(400).json({
          error: 'Product with this barcode already exists'
        });
      }
    }

    const productData = {
      name: name.trim(),
      description: description?.trim(),
      sku: sku?.trim(),
      barcode: barcode?.trim(),
      category: category.trim(),
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : 0,
      stock_quantity: stock_quantity !== undefined ? parseInt(stock_quantity) : existingProduct.stock_quantity,
      min_stock_level: min_stock_level !== undefined ? parseInt(min_stock_level) : existingProduct.min_stock_level,
      max_stock_level: max_stock_level !== undefined ? parseInt(max_stock_level) : existingProduct.max_stock_level,
      unit: unit?.trim() || existingProduct.unit,
      supplier_id: supplier_id !== undefined ? (supplier_id ? parseInt(supplier_id) : null) : existingProduct.supplier_id,
      image_url: image_url?.trim(),
      is_active: is_active !== undefined ? is_active : existingProduct.is_active
    };

    const updatedProduct = await Product.update(id, productData);
    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
};

// Update product stock
export const updateProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, movement_type, reference } = req.body;

    // Validation
    if (!quantity || !movement_type) {
      return res.status(400).json({
        error: 'Missing required fields: quantity, movement_type'
      });
    }

    if (!['in', 'out', 'adjustment'].includes(movement_type)) {
      return res.status(400).json({
        error: 'Invalid movement_type. Must be: in, out, or adjustment'
      });
    }

    if (quantity <= 0 && movement_type !== 'adjustment') {
      return res.status(400).json({
        error: 'Quantity must be positive for in/out movements'
      });
    }

    const result = await Product.updateStock(id, parseInt(quantity), movement_type, reference);
    res.json(result);
  } catch (error) {
    console.error('Error updating product stock:', error);
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error.message === 'Insufficient stock') {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    res.status(500).json({ error: 'Failed to update product stock' });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Product.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

// Get products with low stock
export const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.getLowStock();
    res.json(products);
  } catch (error) {
    console.error('Error getting low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
};

// Get product categories
export const getProductCategories = async (req, res) => {
  try {
    const categories = await Product.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error getting product categories:', error);
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
};

// Get inventory statistics
export const getInventoryStats = async (req, res) => {
  try {
    const stats = await Product.getInventoryStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting inventory stats:', error);
    res.status(500).json({ error: 'Failed to fetch inventory statistics' });
  }
};

// Search products
export const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Search term must be at least 2 characters long'
      });
    }

    const products = await Product.search(q.trim());
    res.json(products);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
};

// Get price history for a product
export const getProductPriceHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return res.status(400).json({ success: false, error: 'Invalid product ID' });
    }

    // Get product name
    const product = await Product.getById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Get price history
    const priceHistory = await Product.getPriceHistory(productId);

    // Calculate summary
    const sellingChanges = priceHistory.filter(h => h.price_type === 'selling');
    const purchaseChanges = priceHistory.filter(h => h.price_type === 'purchase');

    res.json({
      success: true,
      product_id: productId,
      product_name: product.name,
      price_history: priceHistory,
      summary: {
        total_changes: priceHistory.length,
        selling_price_changes: sellingChanges.length,
        purchase_price_changes: purchaseChanges.length,
        last_change: priceHistory.length > 0 ? priceHistory[0].changed_at : null
      }
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch price history' });
  }
};

// Get all price history (for reports)
export const getAllPriceHistory = async (req, res) => {
  try {
    const { limit = '50', price_type = 'all' } = req.query;
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const priceHistory = await Product.getAllPriceHistory(limitNum, price_type);

    res.json({
      success: true,
      price_history: priceHistory,
      count: priceHistory.length
    });
  } catch (error) {
    console.error('Error fetching all price history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch price history' });
  }
};
