-- =================================================================
-- DROGUERIE JAMAL - MYSQL DATABASE SETUP SCRIPT
-- =================================================================
-- Hardware & DIY Store Inventory Management System
-- Moroccan Hardware Store Categories and Schema

-- Create database
CREATE DATABASE IF NOT EXISTS droguerie_jamal_inventory
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;



-- Use the database
USE droguerie_jamal_inventory;

-- =================================================================
-- CATEGORIES TABLE - Hardware Store Categories
-- =================================================================
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  name_ar VARCHAR(255), -- Arabic name
  name_fr VARCHAR(255), -- French name
  description TEXT,
  description_ar TEXT,
  description_fr TEXT,
  icon VARCHAR(100), -- Icon identifier for UI
  color VARCHAR(7) DEFAULT '#0f766e', -- Hex color for category
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =================================================================
-- PRODUCTS TABLE - Enhanced for Hardware Store
-- =================================================================
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255), -- Arabic name
  name_fr VARCHAR(255), -- French name
  description TEXT,
  description_ar TEXT,
  description_fr TEXT,
  category_id INT,
  purchase_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  remaining_stock INT DEFAULT 0,
  min_stock_level INT DEFAULT 10,
  max_stock_level INT DEFAULT 1000,
  unit VARCHAR(50) DEFAULT 'piece', -- piece, kg, liter, meter, etc.
  barcode VARCHAR(100),
  sku VARCHAR(100), -- Stock Keeping Unit
  brand VARCHAR(100),
  supplier VARCHAR(255),
  location VARCHAR(100), -- Warehouse location
  weight DECIMAL(8,3), -- in kg
  dimensions VARCHAR(100), -- L x W x H
  image_url VARCHAR(500),
  warranty_months INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  tags TEXT, -- Comma-separated tags
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_name (name),
  INDEX idx_category (category_id),
  INDEX idx_stock (remaining_stock),
  INDEX idx_price (selling_price),
  INDEX idx_sku (sku),
  INDEX idx_barcode (barcode),
  INDEX idx_active (is_active),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =================================================================
-- STOCK MOVEMENTS TABLE - Track Inventory Changes
-- =================================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  movement_type ENUM('IN', 'OUT', 'ADJUSTMENT') NOT NULL,
  quantity INT NOT NULL,
  reason VARCHAR(255),
  reference_number VARCHAR(100), -- Invoice, order number, etc.
  notes TEXT,
  created_by VARCHAR(100) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product (product_id),
  INDEX idx_type (movement_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =================================================================
-- USERS TABLE - For Authentication and Authorization
-- =================================================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff', 'viewer') DEFAULT 'staff',
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =================================================================
-- INSERT DEFAULT MOROCCAN HARDWARE STORE CATEGORIES
-- =================================================================
INSERT INTO categories (name, name_ar, name_fr, description, description_ar, description_fr, icon, color) VALUES
('Droguerie', 'مواد كيميائية', 'Droguerie', 'Hardware chemicals, adhesives, sealants, and specialized compounds', 'المواد الكيميائية والمواد اللاصقة والمركبات المتخصصة', 'Produits chimiques, adhésifs, mastics et composés spécialisés', '🧪', '#0f766e'),

('Sanitaire', 'صحي', 'Sanitaire', 'Plumbing fixtures, pipes, faucets, water heaters, bathroom accessories', 'تجهيزات السباكة والأنابيب والحنفيات وسخانات المياه وإكسسوارات الحمام', 'Équipements de plomberie, tuyaux, robinets, chauffe-eau, accessoires de salle de bain', '🚿', '#3b82f6'),

('Peinture', 'دهان', 'Peinture', 'Paints, primers, brushes, rollers, painting accessories and tools', 'الدهانات والبرايمر والفرش والأسطوانات وأدوات الطلاء', 'Peintures, apprêts, pinceaux, rouleaux, accessoires et outils de peinture', '🎨', '#ea580c'),

('Quincaillerie', 'أدوات معدنية', 'Quincaillerie', 'Hardware fasteners, screws, bolts, nuts, hinges, locks, and metal components', 'مثبتات الأجهزة والمسامير والصواميل والمفصلات والأقفال والمكونات المعدنية', 'Fixations, vis, boulons, écrous, charnières, serrures et composants métalliques', '🔩', '#f59e0b'),

('Outillage', 'أدوات', 'Outillage', 'Hand tools, power tools, measuring equipment, safety gear, and workshop tools', 'الأدوات اليدوية والكهربائية ومعدات القياس ومعدات السلامة وأدوات الورشة', 'Outils à main, outils électriques, équipements de mesure, équipements de sécurité', '🔨', '#dc2626'),

('Électricité', 'كهرباء', 'Électricité', 'Electrical components, wiring, switches, outlets, lighting fixtures, and electrical tools', 'المكونات الكهربائية والأسلاك والمفاتيح والمقابس وتركيبات الإضاءة والأدوات الكهربائية', 'Composants électriques, câblage, interrupteurs, prises, luminaires et outils électriques', '⚡', '#eab308');

-- =================================================================
-- CREATE VIEWS FOR REPORTING
-- =================================================================

-- Low stock alert view
CREATE OR REPLACE VIEW low_stock_products AS
SELECT
  p.id,
  p.name,
  p.name_ar,
  p.name_fr,
  c.name as category,
  p.remaining_stock,
  p.min_stock_level,
  p.selling_price,
  (p.min_stock_level - p.remaining_stock) as shortage_quantity,
  (p.min_stock_level - p.remaining_stock) * p.selling_price as shortage_value
FROM products p
JOIN categories c ON p.category_id = c.id
WHERE p.remaining_stock <= p.min_stock_level
  AND p.is_active = TRUE
ORDER BY shortage_value DESC;

-- Inventory value by category
CREATE OR REPLACE VIEW inventory_value_by_category AS
SELECT
  c.id as category_id,
  c.name as category,
  c.name_ar as category_ar,
  c.name_fr as category_fr,
  COUNT(p.id) as product_count,
  SUM(p.remaining_stock) as total_units,
  SUM(p.remaining_stock * p.purchase_price) as total_purchase_value,
  SUM(p.remaining_stock * p.selling_price) as total_selling_value,
  SUM(p.remaining_stock * (p.selling_price - p.purchase_price)) as potential_profit
FROM categories c
LEFT JOIN products p ON c.id = p.category_id AND p.is_active = TRUE
GROUP BY c.id, c.name, c.name_ar, c.name_fr
ORDER BY total_selling_value DESC;

-- =================================================================
-- INDEXES FOR PERFORMANCE
-- =================================================================
CREATE INDEX idx_products_multilang ON products(name, name_ar, name_fr);
CREATE INDEX idx_categories_multilang ON categories(name, name_ar, name_fr);
CREATE INDEX idx_products_price_range ON products(selling_price, purchase_price);
CREATE INDEX idx_products_stock_status ON products(remaining_stock, min_stock_level, is_active);

-- =================================================================
-- COMPLETION MESSAGE
-- =================================================================
SELECT 'Droguerie Jamal MySQL database setup completed successfully!' as status;
