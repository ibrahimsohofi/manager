import express  from  "express";
import cors  from "cors";
import dotenv   from "dotenv";
import mysql  from  "mysql2/promise";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// MySQL setup
let pool;
let useDatabase = false;

// Initialize MySQL connection pool
try {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'products_manager',
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log('MySQL connection pool created');
    useDatabase = true;
} catch (error) {
    console.error("Failed to create MySQL connection pool, will use sample data:", error);
    useDatabase = false;
}

// Sample data for testing without database
const sampleCategories = [
    {
        id: 1,
        name: "Plomberie",
        name_ar: "السباكة",
        name_fr: "Plomberie"
    },
    {
        id: 2,
        name: "Électricité",
        name_ar: "الكهرباء",
        name_fr: "Électricité"
    },
    {
        id: 3,
        name: "Peinture",
        name_ar: "الطلاء",
        name_fr: "Peinture"
    },
    {
        id: 4,
        name: "Quincaillerie",
        name_ar: "الأدوات المعدنية",
        name_fr: "Quincaillerie"
    }, {
        id: 5,
        name: "Jardinage",
        name_ar: "البستنة",
        name_fr: "Jardinage"
    }
];

// Initialize database tables
const initializeDatabase = async () => {
    try {
        // Create suppliers table
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
      ) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Create customers table
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
      ) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Create categories table
        await pool.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        name_ar VARCHAR(255),
        name_fr VARCHAR(255),
        description TEXT,
        description_ar TEXT,
        description_fr TEXT,
        icon VARCHAR(50),
        color VARCHAR(7) DEFAULT '#0f766e',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category_name (name)
      ) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Create products table
        await pool.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255),
        name_fr VARCHAR(255),
        description TEXT,
        description_ar TEXT,
        description_fr TEXT,
        sku VARCHAR(100) UNIQUE,
        barcode VARCHAR(100) UNIQUE,
        category VARCHAR(100) NOT NULL,
        category_id INT,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        purchase_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        stock_quantity INT DEFAULT 0,
        remaining_stock INT DEFAULT 0,
        min_stock_level INT DEFAULT 10,
        max_stock_level INT DEFAULT 1000,
        unit VARCHAR(50) DEFAULT 'unité',
        brand VARCHAR(100),
        supplier_id INT,
        location VARCHAR(255),
        weight DECIMAL(8,2),
        dimensions VARCHAR(100),
        image_url VARCHAR(500),
        warranty_months INT DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        is_featured BOOLEAN DEFAULT 0,
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        INDEX idx_product_name (name),
        INDEX idx_product_category (category),
        INDEX idx_product_category_id (category_id),
        INDEX idx_product_sku (sku),
        INDEX idx_product_barcode (barcode),
        INDEX idx_stock_level (remaining_stock, min_stock_level),
        INDEX idx_stock_quantity (stock_quantity),
        FULLTEXT KEY idx_search_fulltext (name, description)
      ) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Create stock_movements table
        await pool.execute(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        movement_type ENUM('in', 'out', 'adjustment') NOT NULL,
        quantity INT NOT NULL,
        reason VARCHAR(255),
        reference_type VARCHAR(50),
        reference_id INT,
        reference_number VARCHAR(100),
        notes TEXT,
        created_by VARCHAR(100) DEFAULT 'system',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_product_movement (product_id),
        INDEX idx_movement_type (movement_type),
        INDEX idx_movement_date (created_at)
      ) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Create sales table
        await pool.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_number VARCHAR(100) UNIQUE NOT NULL,
        date DATE NOT NULL,
        customer_id INT,
        product_id INT NOT NULL,
        productName VARCHAR(255),
        price DECIMAL(10,2) NOT NULL,
        quantity INT NOT NULL,
        category VARCHAR(100),
        totalPrice DECIMAL(10,2) NOT NULL,
        discount DECIMAL(10,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        payment_method VARCHAR(50) DEFAULT 'cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_sale_number (sale_number),
        INDEX idx_sale_date (date),
        INDEX idx_sale_customer (customer_id)
      ) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

        // Insert default categories
        const defaultCategories = [
            { name: 'Droguerie', name_ar: 'مواد كيميائية', name_fr: 'Droguerie', icon: '🧪', color: '#0f766e' },
            { name: 'Sanitaire', name_ar: 'صحي', name_fr: 'Sanitaire', icon: '🚿', color: '#3b82f6' },
            { name: 'Peinture', name_ar: 'دهان', name_fr: 'Peinture', icon: '🎨', color: '#ea580c' },
            { name: 'Quincaillerie', name_ar: 'أدوات معدنية', name_fr: 'Quincaillerie', icon: '🔩', color: '#f59e0b' },
            { name: 'Outillage', name_ar: 'أدوات', name_fr: 'Outillage', icon: '🔨', color: '#dc2626' },
            { name: 'Électricité', name_ar: 'كهرباء', name_fr: 'Électricité', icon: '⚡', color: '#eab308' }
        ];

        for (const category of defaultCategories) {
            await pool.execute(`
        INSERT IGNORE INTO categories (name, name_ar, name_fr, icon, color)
        VALUES (?, ?, ?, ?, ?)
      `, [category.name, category.name_ar, category.name_fr, category.icon, category.color]);
        }

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
};

// Database operations helper
const dbQuery = {
    async execute(query, params = []) {
        try {
            const [rows] = await pool.execute(query, params);
            if (query.trim().toUpperCase().startsWith('INSERT')) {
                return {insertId: rows.insertId, changes: rows.affectedRows};
            }
            if (query.trim().toUpperCase().startsWith('UPDATE') || query.trim().toUpperCase().startsWith('DELETE')) {
                return {changes: rows.affectedRows};
            }
            return rows;
        } catch (error) {
            console.error("Database query error:", error);
            throw error;
        }
    }
};

// API Routes

// Get all categories
app.get("/api/categories", async (req, res) => {
    try {
        const rows = await dbQuery.execute("SELECT * FROM categories ORDER BY name");
        res.json({success: true, categories: rows});
    } catch (error) {
        res.status(500).json({success: false, error: error.message});
    }
});

// Get all products
app.get("/api/products", async (req, res) => {
    try {
        const { search = "", category = "all", page = "1", limit = "50" } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let baseQuery = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
        let countQuery = `SELECT COUNT(*) as total FROM products p WHERE 1=1`;
        const params = [];
        const countParams = [];

        if (search) {
            const searchCondition = " AND (LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.sku) LIKE ?)";
            baseQuery += searchCondition;
            countQuery += searchCondition;
            const searchParam = `%${search.toLowerCase()}%`;
            params.push(searchParam, searchParam, searchParam);
            countParams.push(searchParam, searchParam, searchParam);
        }

        if (category !== "all") {
            baseQuery += " AND p.category_id = ?";
            countQuery += " AND p.category_id = ?";
            params.push(category);
            countParams.push(category);
        }

        baseQuery += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limitNum, offset);

        const [products, countResult] = await Promise.all([
            dbQuery.execute(baseQuery, params),
            dbQuery.execute(countQuery, countParams)
        ]);

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limitNum);

        res.json({
            success: true,
            products,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalItems: total,
                itemsPerPage: limitNum
            }
        });
    } catch (error) {
        res.status(500).json({success: false, error: error.message});
    }
});

// =============================================================================
// INTEGRATION API ENDPOINTS FOR JAMALBRICO SALES SYSTEM
// =============================================================================

// Get product by ID or identifier
app.get("/api/integration/product/:identifier", async (req, res) => {
    try {
        const {identifier} = req.params;
        let query, params;

        if (!isNaN(identifier)) {
            query = `
        SELECT p.*, c.name as category_name, c.name_fr as category_name_fr, c.name_ar as category_name_ar
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
      `;
            params = [parseInt(identifier)];
        } else {
            query = `
        SELECT p.*, c.name as category_name, c.name_fr as category_name_fr, c.name_ar as category_name_ar
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.name LIKE ? OR p.sku = ? OR p.barcode = ?
        LIMIT 1
      `;
            params = [`%${identifier}%`, identifier, identifier];
        }

        const rows = await dbQuery.execute(query, params);

        if (rows.length === 0) {
            return res.status(404).json({success: false, error: "Product not found", identifier});
        }

        const product = rows[0];
        const formattedProduct = {
            id: product.id,
            name: product.name,
            name_fr: product.name_fr || product.name,
            name_ar: product.name_ar || product.name,
            description: product.description,
            category: product.category_name || product.category,
            category_id: product.category_id,
            price: product.selling_price,
            selling_price: product.selling_price,
            purchase_price: product.purchase_price || product.cost,
            stock_quantity: product.remaining_stock || product.stock_quantity,
            remaining_stock: product.remaining_stock || product.stock_quantity,
            min_stock_level: product.min_stock_level,
            unit: product.unit || 'piece',
            brand: product.brand,
            sku: product.sku,
            barcode: product.barcode,
            image_url: product.image_url,
            is_active: true
        };

        res.json({success: true, product: formattedProduct});
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({success: false, error: error.message});
    }
});

// Check product availability
app.get("/api/integration/availability/:productId", async (req, res) => {
    try {
        const {productId} = req.params;
        const id = parseInt(productId);

        if (isNaN(id)) {
            return res.status(400).json({success: false, error: "Invalid product ID"});
        }

        const rows = await dbQuery.execute(`
      SELECT id, name, remaining_stock, min_stock_level, selling_price,
      CASE WHEN remaining_stock > 0 THEN true ELSE false END as is_available,
      CASE WHEN remaining_stock <= min_stock_level THEN true ELSE false END as is_low_stock
      FROM products WHERE id = ?
    `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({success: false, error: "Product not found"});
        }

        const product = rows[0];
        res.json({
            success: true,
            availability: {
                product_id: product.id,
                product_name: product.name,
                current_stock: product.remaining_stock,
                min_stock_level: product.min_stock_level,
                selling_price: product.selling_price,
                is_available: product.is_available,
                is_low_stock: product.is_low_stock,
                is_active: true
            }
        });
    } catch (error) {
        res.status(500).json({success: false, error: error.message});
    }
});

// Search products
app.get("/api/integration/search", async (req, res) => {
    try {
        const { q: query = "", limit = "10" } = req.query;
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

        if (!query.trim()) {
            return res.json({success: true, products: []});
        }

        const searchQuery = `
      SELECT p.id, p.name, p.name_fr, p.name_ar, p.description,
             p.selling_price, p.remaining_stock, p.unit, p.sku, p.barcode, p.image_url,
             c.name as category, c.name_fr as category_fr, c.name_ar as category_ar,
             CASE WHEN p.remaining_stock > 0 THEN true ELSE false END as is_available
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.name LIKE ? OR p.name_fr LIKE ? OR p.name_ar LIKE ?
         OR p.description LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?
      ORDER BY CASE WHEN p.name LIKE ? THEN 1 ELSE 2 END, p.name
      LIMIT ?
    `;

        const searchTerm = `%${query}%`;
        const exactTerm = `${query}%`;
        const rows = await dbQuery.execute(searchQuery, [
            searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, exactTerm, limitNum
        ]);

        const products = rows.map(p => ({
            id: p.id,
            name: p.name,
            name_fr: p.name_fr || p.name,
            name_ar: p.name_ar || p.name,
            description: p.description,
            category: p.category || 'General',
            price: p.selling_price,
            selling_price: p.selling_price,
            stock_quantity: p.remaining_stock,
            remaining_stock: p.remaining_stock,
            unit: p.unit || 'piece',
            sku: p.sku,
            barcode: p.barcode,
            image_url: p.image_url,
            is_available: p.is_available
        }));

        res.json({success: true, products, query, count: products.length});
    } catch (error) {
        res.status(500).json({success: false, error: error.message});
    }
});

// Get low stock products
app.get("/api/integration/low-stock", async (req, res) => {
    try {
        const rows = await dbQuery.execute(`
      SELECT p.id, p.name, p.name_fr, p.name_ar, p.remaining_stock, p.min_stock_level,
             p.selling_price, p.unit, c.name as category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.remaining_stock <= p.min_stock_level
      ORDER BY p.remaining_stock ASC
    `);

        const lowStockProducts = rows.map(p => ({
            id: p.id,
            name: p.name,
            name_fr: p.name_fr || p.name,
            name_ar: p.name_ar || p.name,
            category: p.category || 'General',
            current_stock: p.remaining_stock,
            min_stock_level: p.min_stock_level,
            selling_price: p.selling_price,
            unit: p.unit || 'piece'
        }));

        res.json({success: true, low_stock_products: lowStockProducts, count: lowStockProducts.length});
    } catch (error) {
        res.status(500).json({success: false, error: error.message});
    }
});

// Record sale and update inventory
app.post("/api/integration/sale", async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            product_id, quantity, price, date, customer_id = null,
            payment_method = 'cash', notes = '', discount = 0, tax_amount = 0
        } = req.body;

        if (!product_id || !quantity || !price) {
            await connection.rollback();
            return res.status(400).json({success: false, error: "Missing required fields"});
        }

        // Get product
        const [productRows] = await connection.execute(
            "SELECT id, name, remaining_stock, selling_price, category_id FROM products WHERE id = ?",
            [product_id]
        );

        if (productRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({success: false, error: "Product not found"});
        }

        const product = productRows[0];
        if (product.remaining_stock < quantity) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                error: `Insufficient stock. Available: ${product.remaining_stock}`
            });
        }

        const saleNumber = `SALE-${Date.now()}-${product_id}`;
        const saleDate = date || new Date().toISOString().split('T')[0];
        const totalPrice = (price * quantity) - discount + tax_amount;

        // Insert sale
        await connection.execute(`
      INSERT INTO sales (sale_number, date, customer_id, product_id, productName, price, quantity, totalPrice, discount, tax_amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [saleNumber, saleDate, customer_id, product_id, product.name, price, quantity, totalPrice, discount, tax_amount, payment_method, notes]);

        // Update stock
        await connection.execute(
            "UPDATE products SET remaining_stock = remaining_stock - ? WHERE id = ?",
            [quantity, product_id]
        );

        // Record stock movement
        await connection.execute(`
      INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_number, notes)
      VALUES (?, 'out', ?, 'Sale', ?, ?)
    `, [product_id, quantity, saleNumber, `Sale of ${quantity} units`]);

        await connection.commit();

        const [updatedRows] = await connection.execute(
            "SELECT remaining_stock FROM products WHERE id = ?",
            [product_id]
        );

        res.json({
            success: true,
            sale: { sale_number: saleNumber, product_id, quantity, price, total_price: totalPrice },
            inventory_update: {
                previous_stock: product.remaining_stock,
                new_stock: updatedRows[0].remaining_stock
            }
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({success: false, error: error.message});
    } finally {
        connection.release();
    }
});

// Health check
app.get("/api/health", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        connection.release();
        res.json({
            success: true,
            message: "Products Manager API is healthy",
            database: "MySQL Connected"
        });
    } catch (error) {
        res.status(500).json({success: false, error: "Database connection failed"});
    }
});

// Test connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        console.log('✅ MySQL connection successful');
        return true;
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        return false;
    }
}

// Start server
async function startServer() {
    try {
        const isConnected = await testConnection();
        if (!isConnected) {
            console.log('⚠️  Running without database');
            useDatabase = false;
        }

        if (useDatabase) {
            await initializeDatabase();
        }

        app.listen(PORT, '0.0.0.0', () => {
            
            console.log(`🚀 Products Manager API running on port ${PORT}`);
            console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
            console.log(`📦 Integration API: http://localhost:${PORT}/api/integration/*`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
