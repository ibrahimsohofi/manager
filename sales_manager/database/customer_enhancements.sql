-- =============================================
-- Customer Enhancement Tables
-- Track customer payments and product lists
-- =============================================

USE jamalbrico;

-- =============================================
-- TABLE: customer_payments
-- Track all payments made by customers
-- =============================================
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
) ENGINE=InnoDB;

-- =============================================
-- TABLE: customer_products
-- Track products that customers want/ordered
-- =============================================
CREATE TABLE IF NOT EXISTS customer_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    product_id INT NOT NULL,
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
) ENGINE=InnoDB;

-- Add total_paid field to customers table to cache the total amount
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_paid DECIMAL(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS balance DECIMAL(12,2) DEFAULT 0;
