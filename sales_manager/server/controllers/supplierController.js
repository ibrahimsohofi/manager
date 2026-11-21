import Supplier from '../models/Supplier.js';

// Get all suppliers with optional filters
export const getAllSuppliers = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      city: req.query.city,
      limit: req.query.limit,
      offset: req.query.offset
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const suppliers = await Supplier.getAll(filters);
    res.json(suppliers);
  } catch (error) {
    console.error('Error getting suppliers:', error);
    // Return empty array when database is not available
    res.json([]);
  }
};

// Get supplier by ID
export const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await Supplier.getById(id);

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (error) {
    console.error('Error getting supplier:', error);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
};

// Create new supplier
export const createSupplier = async (req, res) => {
  try {
    const {
      name, contact_person, email, phone, address, city, postal_code,
      payment_terms, notes
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        error: 'Missing required field: name'
      });
    }

    const supplierData = {
      name: name.trim(),
      contact_person: contact_person?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      address: address?.trim(),
      city: city?.trim(),
      postal_code: postal_code?.trim(),
      payment_terms: payment_terms?.trim() || 'Net 30',
      notes: notes?.trim()
    };

    const newSupplier = await Supplier.create(supplierData);
    res.status(201).json(newSupplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
};

// Update supplier
export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, contact_person, email, phone, address, city, postal_code,
      payment_terms, notes, is_active
    } = req.body;

    // Check if supplier exists
    const existingSupplier = await Supplier.getById(id);
    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Validation
    if (!name) {
      return res.status(400).json({
        error: 'Missing required field: name'
      });
    }

    const supplierData = {
      name: name.trim(),
      contact_person: contact_person?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      address: address?.trim(),
      city: city?.trim(),
      postal_code: postal_code?.trim(),
      payment_terms: payment_terms?.trim() || existingSupplier.payment_terms,
      notes: notes?.trim(),
      is_active: is_active !== undefined ? is_active : existingSupplier.is_active
    };

    const updatedSupplier = await Supplier.update(id, supplierData);
    res.json(updatedSupplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
};

// Delete supplier
export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Supplier.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    if (error.message === 'Cannot delete supplier with active products') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
};

// Get supplier products
export const getSupplierProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const products = await Supplier.getProducts(id);
    res.json(products);
  } catch (error) {
    console.error('Error getting supplier products:', error);
    res.status(500).json({ error: 'Failed to fetch supplier products' });
  }
};

// Get supplier statistics
export const getSupplierStats = async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await Supplier.getSupplierStats(id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting supplier stats:', error);
    res.status(500).json({ error: 'Failed to fetch supplier statistics' });
  }
};

// Get supplier purchase history
export const getSupplierPurchaseHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const history = await Supplier.getPurchaseHistory(id, parseInt(limit));
    res.json(history);
  } catch (error) {
    console.error('Error getting supplier purchase history:', error);
    res.status(500).json({ error: 'Failed to fetch supplier purchase history' });
  }
};

// Search suppliers
export const searchSuppliers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Search term must be at least 2 characters long'
      });
    }

    const suppliers = await Supplier.search(q.trim());
    res.json(suppliers);
  } catch (error) {
    console.error('Error searching suppliers:', error);
    res.status(500).json({ error: 'Failed to search suppliers' });
  }
};

// Get top suppliers
export const getTopSuppliers = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const suppliers = await Supplier.getTopSuppliers(parseInt(limit));
    res.json(suppliers);
  } catch (error) {
    console.error('Error getting top suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch top suppliers' });
  }
};

// Get suppliers with pending orders
export const getSuppliersWithPendingOrders = async (req, res) => {
  try {
    const suppliers = await Supplier.getSuppliersWithPendingOrders();
    res.json(suppliers);
  } catch (error) {
    console.error('Error getting suppliers with pending orders:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers with pending orders' });
  }
};

// Get product categories by supplier
export const getSupplierProductCategories = async (req, res) => {
  try {
    const { id } = req.params;
    const categories = await Supplier.getProductCategories(id);
    res.json(categories);
  } catch (error) {
    console.error('Error getting supplier product categories:', error);
    res.status(500).json({ error: 'Failed to fetch supplier product categories' });
  }
};
