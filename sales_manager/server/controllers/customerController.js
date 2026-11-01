import Customer from '../models/Customer.js';

// Get all customers with optional filters
export const getAllCustomers = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      customer_type: req.query.customer_type,
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

    const customers = await Customer.getAll(filters);
    res.json(customers);
  } catch (error) {
    console.error('Error getting customers:', error);
    // Return mock data when database is not available
    const mockCustomers = [
      {
        id: 1,
        name: "Ahmed Hassan",
        email: "ahmed@example.com",
        phone: "+212 6 12 34 56 78",
        customer_type: "retail",
        city: "Casablanca",
        postal_code: "20000",
        address: "123 Boulevard Mohammed V",
        total_paid: 12500.5,
        products_total: 15800.0,
        credit_limit: 5000,
        created_at: "2024-01-15",
        notes: "Client régulier depuis 2024",
      },
      {
        id: 2,
        name: "Fatima Zahra",
        email: "fatima@example.com",
        phone: "+212 6 98 76 54 32",
        customer_type: "wholesale",
        city: "Rabat",
        postal_code: "10000",
        address: "45 Avenue des FAR",
        total_paid: 45000.0,
        products_total: 52000.0,
        credit_limit: 15000,
        created_at: "2023-11-20",
        notes: "Client VIP - Grossiste",
      },
      {
        id: 3,
        name: "Mohamed Alami",
        email: "mohamed@example.com",
        phone: "+212 6 11 22 33 44",
        customer_type: "commercial",
        city: "Marrakech",
        postal_code: "40000",
        address: "78 Rue de la Liberté",
        total_paid: 28900.75,
        products_total: 31200.0,
        credit_limit: 10000,
        created_at: "2024-02-10",
        notes: "Entrepreneur en construction",
      },
      {
        id: 4,
        name: "Khadija Bennani",
        email: "khadija@example.com",
        phone: "+212 6 55 44 33 22",
        customer_type: "retail",
        city: "Fès",
        postal_code: "30000",
        address: "12 Rue Atlas",
        total_paid: 8750.0,
        products_total: 9500.0,
        credit_limit: 3000,
        created_at: "2024-03-05",
        notes: "Achats réguliers de peinture",
      },
      {
        id: 5,
        name: "Youssef Idrissi",
        email: "youssef@example.com",
        phone: "+212 6 77 88 99 00",
        customer_type: "wholesale",
        city: "Tanger",
        postal_code: "90000",
        address: "34 Boulevard Pasteur",
        total_paid: 62000.0,
        products_total: 68000.0,
        credit_limit: 20000,
        created_at: "2023-09-12",
        notes: "Revendeur agréé",
      },
    ];
    res.json(mockCustomers);
  }
};

// Get customer by ID
export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.getById(id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
};

// Create new customer
export const createCustomer = async (req, res) => {
  try {
    const {
      name, email, phone, address, city, postal_code,
      customer_type, credit_limit, notes
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        error: 'Missing required field: name'
      });
    }

    // Check for duplicate email if provided
    if (email) {
      const existingCustomer = await Customer.getByEmail(email);
      if (existingCustomer) {
        return res.status(400).json({
          error: 'Customer with this email already exists'
        });
      }
    }

    const customerData = {
      name: name.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      address: address?.trim(),
      city: city?.trim(),
      postal_code: postal_code?.trim(),
      customer_type: customer_type || 'retail',
      credit_limit: credit_limit ? parseFloat(credit_limit) : 0,
      notes: notes?.trim()
    };

    const newCustomer = await Customer.create(customerData);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

// Update customer
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, address, city, postal_code,
      customer_type, credit_limit, notes, is_active
    } = req.body;

    // Check if customer exists
    const existingCustomer = await Customer.getById(id);
    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Validation
    if (!name) {
      return res.status(400).json({
        error: 'Missing required field: name'
      });
    }

    // Check for duplicate email if changed
    if (email && email !== existingCustomer.email) {
      const duplicateCustomer = await Customer.getByEmail(email);
      if (duplicateCustomer) {
        return res.status(400).json({
          error: 'Customer with this email already exists'
        });
      }
    }

    const customerData = {
      name: name.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      address: address?.trim(),
      city: city?.trim(),
      postal_code: postal_code?.trim(),
      customer_type: customer_type || 'retail',
      credit_limit: credit_limit !== undefined ? parseFloat(credit_limit) : existingCustomer.credit_limit,
      notes: notes?.trim(),
      is_active: is_active !== undefined ? is_active : existingCustomer.is_active
    };

    const updatedCustomer = await Customer.update(id, customerData);
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Customer.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};

// Get customer statistics
export const getCustomerStats = async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await Customer.getCustomerStats(id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting customer stats:', error);
    res.status(500).json({ error: 'Failed to fetch customer statistics' });
  }
};

// Get customer purchase history
export const getCustomerPurchaseHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const history = await Customer.getPurchaseHistory(id, parseInt(limit));
    res.json(history);
  } catch (error) {
    console.error('Error getting customer purchase history:', error);
    res.status(500).json({ error: 'Failed to fetch customer purchase history' });
  }
};

// Search customers
export const searchCustomers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Search term must be at least 2 characters long'
      });
    }

    const customers = await Customer.search(q.trim());
    res.json(customers);
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
};

// Get customer types
export const getCustomerTypes = async (req, res) => {
  try {
    const types = await Customer.getCustomerTypes();
    res.json(types);
  } catch (error) {
    console.error('Error getting customer types:', error);
    res.status(500).json({ error: 'Failed to fetch customer types' });
  }
};

// Get top customers
export const getTopCustomers = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const customers = await Customer.getTopCustomers(parseInt(limit));
    res.json(customers);
  } catch (error) {
    console.error('Error getting top customers:', error);
    res.status(500).json({ error: 'Failed to fetch top customers' });
  }
};

// Get inactive customers
export const getInactiveCustomers = async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const customers = await Customer.getInactiveCustomers(parseInt(days));
    res.json(customers);
  } catch (error) {
    console.error('Error getting inactive customers:', error);
    res.status(500).json({ error: 'Failed to fetch inactive customers' });
  }
};

// ============================================
// CUSTOMER PAYMENT CONTROLLERS
// ============================================

// Add a payment for a customer
export const addCustomerPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_date, payment_method, reference_number, notes } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be greater than 0'
      });
    }

    // Check if customer exists
    const customer = await Customer.getById(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const paymentData = {
      amount: parseFloat(amount),
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      payment_method: payment_method || 'cash',
      reference_number: reference_number?.trim(),
      notes: notes?.trim()
    };

    const payment = await Customer.addPayment(id, paymentData);
    res.status(201).json(payment);
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ error: 'Failed to add payment' });
  }
};

// Get all payments for a customer
export const getCustomerPayments = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const customer = await Customer.getById(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const payments = await Customer.getPayments(id);
    res.json(payments);
  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

// Get total paid by a customer
export const getCustomerTotalPaid = async (req, res) => {
  try {
    const { id } = req.params;

    const total = await Customer.getTotalPaid(id);
    res.json({ total });
  } catch (error) {
    console.error('Error getting total paid:', error);
    res.status(500).json({ error: 'Failed to fetch total paid' });
  }
};

// Delete a payment
export const deleteCustomerPayment = async (req, res) => {
  try {
    const { id, paymentId } = req.params;

    const deleted = await Customer.deletePayment(paymentId, id);

    if (!deleted) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: error.message || 'Failed to delete payment' });
  }
};

// ============================================
// CUSTOMER PRODUCTS CONTROLLERS
// ============================================

// Add a product to customer's list
export const addCustomerProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { product_id, product_name, quantity, unit_price, status, notes } = req.body;

    // Validation
    if (!product_name) {
      return res.status(400).json({
        error: 'Product name is required'
      });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        error: 'Quantity must be greater than 0'
      });
    }

    if (!unit_price || unit_price < 0) {
      return res.status(400).json({
        error: 'Unit price must be 0 or greater'
      });
    }

    // Check if customer exists
    const customer = await Customer.getById(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const productData = {
      product_id: product_id || null,
      product_name: product_name.trim(),
      quantity: parseInt(quantity),
      unit_price: parseFloat(unit_price),
      status: status || 'pending',
      notes: notes?.trim()
    };

    const product = await Customer.addProduct(id, productData);
    res.status(201).json(product);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Failed to add product' });
  }
};

// Get all products for a customer
export const getCustomerProducts = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const customer = await Customer.getById(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const products = await Customer.getProducts(id);
    res.json(products);
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

// Get total price of products for a customer
export const getCustomerProductsTotal = async (req, res) => {
  try {
    const { id } = req.params;

    const total = await Customer.getProductsTotal(id);
    res.json({ total });
  } catch (error) {
    console.error('Error getting products total:', error);
    res.status(500).json({ error: 'Failed to fetch products total' });
  }
};

// Update a customer product
export const updateCustomerProduct = async (req, res) => {
  try {
    const { id, productId } = req.params;
    const { quantity, unit_price, status, notes } = req.body;

    // Validation
    if (quantity !== undefined && quantity <= 0) {
      return res.status(400).json({
        error: 'Quantity must be greater than 0'
      });
    }

    if (unit_price !== undefined && unit_price < 0) {
      return res.status(400).json({
        error: 'Unit price must be 0 or greater'
      });
    }

    const productData = {
      quantity: quantity !== undefined ? parseInt(quantity) : undefined,
      unit_price: unit_price !== undefined ? parseFloat(unit_price) : undefined,
      status: status,
      notes: notes?.trim()
    };

    // Remove undefined values
    Object.keys(productData).forEach(key => {
      if (productData[key] === undefined) {
        delete productData[key];
      }
    });

    const product = await Customer.updateProduct(productId, id, productData);
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
};

// Delete a customer product
export const deleteCustomerProduct = async (req, res) => {
  try {
    const { id, productId } = req.params;

    const deleted = await Customer.deleteProduct(productId, id);

    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};
