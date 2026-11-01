import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bricojamal',
  multipleStatements: true,
  charset: 'utf8mb4'
};

// Database connection pool
let pool = null;

const initializeDatabase = async () => {
  try {
    console.log("sales manager")
    console.log('🔄 Connecting to MySQL database...');
    console.log(`📍 Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`🗄️ Database: ${dbConfig.database}`);

    // First, try to create database if it doesn't exist
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      multipleStatements: true
    });

    console.log('✅ Connected to MySQL server');

    // Create database if it doesn't exist
    await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database '${dbConfig.database}' ensured to exist`);
    await tempConnection.end();

    // Create connection pool to the specific database
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    const connection = await pool.getConnection();
    console.log('✅ MySQL database connected successfully');
    console.log(`📁 Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
    connection.release();

    // Create tables if they don't exist
    await createTables();

    // Run database migrations
    await runMigrations();

  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    console.error('💡 Please ensure MySQL is running and credentials are correct in .env file');
    console.error('🚫 Mock data is NOT supported - MySQL is required');

    // Throw error instead of falling back to mock data
    throw new Error(`MySQL connection failed: ${error.message}. Please set up MySQL database.`);
  }
};

const createTables = async () => {
  try {
    // Check if tables exist
    const [rows] = await pool.execute("SHOW TABLES LIKE 'sales'");
    if (rows.length > 0) {
      console.log('✅ Database tables already exist');
      return;
    }

    console.log('🔄 Creating database tables...');

    // Suppliers table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        postal_code VARCHAR(20),
        payment_terms VARCHAR(100) DEFAULT 'Net 30',
        notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_suppliers_name (name)
      ) ENGINE=InnoDB
    `);

    // Customers table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        postal_code VARCHAR(20),
        customer_type ENUM('retail', 'wholesale', 'commercial') DEFAULT 'retail',
        credit_limit DECIMAL(12,2) DEFAULT 0,
        notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_customers_name (name),
        INDEX idx_customers_email (email)
      ) ENGINE=InnoDB
    `);

    // Products table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sku VARCHAR(100) UNIQUE,
        barcode VARCHAR(100) UNIQUE,
        category VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
        cost DECIMAL(10,2) DEFAULT 0 CHECK (cost >= 0),
        stock_quantity INT DEFAULT 0 CHECK (stock_quantity >= 0),
        min_stock_level INT DEFAULT 5,
        max_stock_level INT DEFAULT 100,
        unit VARCHAR(50) DEFAULT 'unité',
        supplier_id INT,
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        INDEX idx_products_category (category),
        INDEX idx_products_sku (sku),
        INDEX idx_products_barcode (barcode),
        INDEX idx_products_stock (stock_quantity)
      ) ENGINE=InnoDB
    `);

    // Sales table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_number VARCHAR(100) UNIQUE,
        date DATE NOT NULL,
        customer_id INT,
        product_id INT,
        productName VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL CHECK (price > 0),
        quantity INT NOT NULL CHECK (quantity > 0),
        category VARCHAR(100) NOT NULL,
        totalPrice DECIMAL(12,2) NOT NULL CHECK (totalPrice > 0),
        discount DECIMAL(10,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        payment_method ENUM('cash', 'credit', 'check', 'bank_transfer') DEFAULT 'cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (customer_id) REFERENCES customers(id),
        -- FOREIGN KEY (product_id) REFERENCES products(id), -- Removed to allow integration with external product systems
        INDEX idx_sales_date (date),
        INDEX idx_sales_category (category),
        INDEX idx_sales_product_name (productName),
        INDEX idx_sales_customer (customer_id)
      ) ENGINE=InnoDB
    `);

    // Purchase orders table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_number VARCHAR(100) UNIQUE NOT NULL,
        supplier_id INT NOT NULL,
        order_date DATE NOT NULL,
        expected_date DATE,
        received_date DATE,
        status ENUM('pending', 'ordered', 'partial', 'received', 'cancelled') DEFAULT 'pending',
        total_amount DECIMAL(12,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      ) ENGINE=InnoDB
    `);

    // Purchase order items table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_cost DECIMAL(10,2) NOT NULL CHECK (unit_cost >= 0),
        total_cost DECIMAL(12,2) NOT NULL CHECK (total_cost >= 0),
        received_quantity INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      ) ENGINE=InnoDB
    `);

    // Stock movements table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        movement_type ENUM('in', 'out', 'adjustment') NOT NULL,
        quantity INT NOT NULL,
        reference_type VARCHAR(50),
        reference_id INT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (product_id) REFERENCES products(id),
        INDEX idx_stock_movements_product (product_id),
        INDEX idx_stock_movements_type (movement_type)
      ) ENGINE=InnoDB
    `);

    // Users table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role ENUM('admin', 'manager', 'employee') DEFAULT 'employee',
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_users_username (username),
        INDEX idx_users_email (email)
      ) ENGINE=InnoDB
    `);

    console.log('✅ Database tables created successfully');

    // Insert some sample data for testing
    await insertSampleData();

  } catch (error) {
    console.error('❌ Table creation failed:', error.message);
    throw error;
  }
};

const insertSampleData = async () => {
  try {
    // Check if sample data already exists
    const [existingProducts] = await pool.execute('SELECT COUNT(*) as count FROM products');
    if (existingProducts[0].count > 0) {
      console.log('✅ Sample data already exists');
      return;
    }

    console.log('🔄 Inserting sample data...');

    // Insert sample suppliers
    await pool.execute(`
      INSERT INTO suppliers (name, contact_person, email, phone, address, city) VALUES
      ('Quincaillerie Centrale', 'Ahmed Benali', 'ahmed@quincaillerie.ma', '0522-123456', '123 Rue Mohamed V', 'Casablanca'),
      ('Matériaux du Sud', 'Fatima Alaoui', 'fatima@materiaux.ma', '0524-789012', '456 Avenue Hassan II', 'Marrakech')
    `);

    // Insert sample customers
    await pool.execute(`
      INSERT INTO customers (name, email, phone, address, city, customer_type) VALUES
      ('Mohammed Tazi', 'mohammed@email.com', '0661-234567', '789 Rue Allal Ben Abdellah', 'Rabat', 'retail'),
      ('Entreprise ABC', 'contact@abc.ma', '0522-345678', '321 Zone Industrielle', 'Casablanca', 'wholesale'),
      ('Client Particulier', NULL, '0661-987654', '654 Quartier Résidentiel', 'Fès', 'retail')
    `);

    // Insert sample products
    await pool.execute(`
      INSERT INTO products (name, description, sku, category, price, cost, stock_quantity, supplier_id) VALUES
      ('Marteau 500g', 'Marteau à panne fendue 500g', 'MAR-500', 'Outils', 45.00, 30.00, 25, 1),
      ('Tournevis Phillips', 'Tournevis cruciforme Phillips PH2', 'TOUR-PH2', 'Outils', 18.50, 12.00, 40, 1),
      ('Clous 50mm', 'Clous en acier galvanisé 50mm - paquet de 100', 'CLOU-50', 'Fixations', 15.00, 8.00, 100, 1),
      ('Vis à bois 4x40mm', 'Vis à bois tête fraisée 4x40mm - boîte de 50', 'VIS-4X40', 'Fixations', 12.00, 7.50, 80, 2),
      ('Perceuse électrique', 'Perceuse à percussion 650W avec accessoires', 'PERC-650', 'Outillage électrique', 450.00, 320.00, 8, 2),
      ('Peinture blanche 2.5L', 'Peinture acrylique mate blanche 2.5L', 'PEIN-BL-25', 'Peinture', 85.00, 55.00, 15, 1)
    `);

    console.log('✅ Sample data inserted successfully');

  } catch (error) {
    console.error('❌ Sample data insertion failed:', error.message);
    // Don't throw error for sample data - not critical
  }
};

// Database migrations - remove foreign key constraints for integration
const runMigrations = async () => {
  try {
    console.log('🔄 Running database migrations...');

    // Check if the foreign key constraint exists and remove it
    const [constraints] = await pool.execute(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 'sales'
      AND COLUMN_NAME = 'product_id'
      AND REFERENCED_TABLE_NAME = 'products'
    `, [dbConfig.database]);

    if (constraints.length > 0) {
      const constraintName = constraints[0].CONSTRAINT_NAME;
      console.log(`🔧 Removing foreign key constraint: ${constraintName}`);

      await pool.execute(`ALTER TABLE sales DROP FOREIGN KEY ${constraintName}`);
      console.log('✅ Foreign key constraint removed for product integration');
    } else {
      console.log('✅ No foreign key constraint to remove');
    }

    // Migration: Add customer payment and product tracking tables
    console.log('🔄 Creating customer payment tracking tables...');

    // Create customer_payments table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        payment_date DATE NOT NULL,
        payment_method ENUM('cash', 'credit', 'check', 'bank_transfer') DEFAULT 'cash',
        reference_number VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        INDEX idx_customer_payments_customer (customer_id),
        INDEX idx_customer_payments_date (payment_date)
      ) ENGINE=InnoDB
    `);
    console.log('✅ customer_payments table created/verified');

    // Create customer_products table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customer_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        product_id INT,
        product_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
        total_price DECIMAL(12,2) NOT NULL CHECK (total_price >= 0),
        status ENUM('pending', 'confirmed', 'delivered', 'cancelled') DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        INDEX idx_customer_products_customer (customer_id),
        INDEX idx_customer_products_product (product_id),
        INDEX idx_customer_products_status (status)
      ) ENGINE=InnoDB
    `);
    console.log('✅ customer_products table created/verified');

    // Create customer_wishlist table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customer_wishlist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        product_id INT,
        product_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
        total_price DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
        status ENUM('pending', 'confirmed', 'cancelled', 'converted') DEFAULT 'pending',
        priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
        notes TEXT,
        requested_date DATE,
        estimated_delivery_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        INDEX idx_customer_wishlist_customer (customer_id),
        INDEX idx_customer_wishlist_product (product_id),
        INDEX idx_customer_wishlist_status (status),
        INDEX idx_customer_wishlist_priority (priority)
      ) ENGINE=InnoDB
    `);
    console.log('✅ customer_wishlist table created/verified');

    // Add total_paid and balance columns to customers table if they don't exist
    await pool.execute(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS total_paid DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS balance DECIMAL(12,2) DEFAULT 0
    `).catch(() => {
      // Columns might already exist, that's okay
      console.log('✅ Customers table columns already exist or added');
    });

    console.log('✅ Customer enhancement migrations completed');

    // Create price_history table for tracking price changes
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        price_type ENUM('selling', 'purchase') NOT NULL,
        old_price DECIMAL(10,2) NOT NULL,
        new_price DECIMAL(10,2) NOT NULL,
        price_difference DECIMAL(10,2) AS (new_price - old_price) STORED,
        percentage_change DECIMAL(10,2) AS (
          CASE WHEN old_price > 0 THEN ROUND((new_price - old_price) / old_price * 100, 2) ELSE 0 END
        ) STORED,
        changed_by VARCHAR(100) DEFAULT 'system',
        notes TEXT,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_price_history_product (product_id),
        INDEX idx_price_history_type (price_type),
        INDEX idx_price_history_date (changed_at)
      ) ENGINE=InnoDB
    `);
    console.log('✅ price_history table created/verified');

  } catch (error) {
    console.error('⚠️ Migration warning:', error.message);
    // Don't throw error - migrations are not critical for functionality
  }
};

// Database query helper functions for MySQL
const dbHelpers = {
  // Execute a query with parameters
  async execute(query, params = []) {
    if (!pool) {
      throw new Error('MySQL database not connected. Please check your database configuration.');
    }

    const [rows] = await pool.execute(query, params);
    return rows;
  },

  // Execute a query and return first row
  async get(query, params = []) {
    if (!pool) {
      throw new Error('MySQL database not connected. Please check your database configuration.');
    }

    const [rows] = await pool.execute(query, params);
    return rows[0] || null;
  },

  // Execute a query and return all rows
  async all(query, params = []) {
    if (!pool) {
      throw new Error('MySQL database not connected. Please check your database configuration.');
    }

    const [rows] = await pool.execute(query, params);
    return rows;
  },

  // Execute an insert/update/delete query
  async run(query, params = []) {
    if (!pool) {
      throw new Error('MySQL database not connected. Please check your database configuration.');
    }

    const [result] = await pool.execute(query, params);
    return {
      lastID: result.insertId,
      changes: result.affectedRows,
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
  }
};

// Initialize database on module load
initializeDatabase().catch(error => {
  console.error('💀 Fatal: Database initialization failed:', error.message);
  console.error('🛑 Application cannot start without MySQL database');
  process.exit(1);
});

// Export database helpers for MySQL operations
export default dbHelpers;

// Helper function to get database pool
export const getDatabase = () => dbHelpers;
export { pool };
