-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS jamalbrico;
USE jamalbrico;

-- Drop table if exists (for development)
DROP TABLE IF EXISTS sales;

-- Create sales table with ProductsManager integration support
CREATE TABLE sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    product_id INT NULL,  -- Reference to ProductsManager products table
    productName VARCHAR(255) NOT NULL,  -- Keep for backward compatibility and fallback
    price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL,
    category VARCHAR(100) NOT NULL,
    totalPrice DECIMAL(10, 2) NOT NULL,

    -- Additional fields for better sales tracking
    discount DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    payment_method ENUM('cash', 'credit', 'check', 'bank_transfer') DEFAULT 'cash',
    customer_id INT NULL,
    notes TEXT,
    sale_number VARCHAR(100) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Indexes for better performance
    INDEX idx_date (date),
    INDEX idx_category (category),
    INDEX idx_product_name (productName),
    INDEX idx_product_id (product_id),
    INDEX idx_sale_number (sale_number),
    INDEX idx_customer_id (customer_id)
);

-- Add some constraints
ALTER TABLE sales ADD CONSTRAINT chk_price CHECK (price > 0);
ALTER TABLE sales ADD CONSTRAINT chk_quantity CHECK (quantity > 0);
ALTER TABLE sales ADD CONSTRAINT chk_total_price CHECK (totalPrice > 0);
