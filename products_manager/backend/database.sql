-- MySQL Database Setup for JAMALBRICO Inventory Manager
-- Create database
CREATE DATABASE IF NOT EXISTS bricojamal
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE bricojamal;

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category_name (name)
) ENGINE=InnoDB;

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id INT,
  purchase_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  remaining_stock INT DEFAULT 0,
  min_stock_level INT DEFAULT 10,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_product_name (name),
  INDEX idx_product_category (category_id),
  INDEX idx_stock_level (remaining_stock, min_stock_level),
  FULLTEXT KEY idx_search_fulltext (name, description)
) ENGINE=InnoDB;

-- Database schema ready for production use
-- Add your own categories and products through the application interface
