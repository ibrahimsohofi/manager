-- Customer Wishlist Table Schema
-- This table stores customer wishlist items for SOHOFIBRICO

USE bricojamal;

-- Create customer_wishlist table
CREATE TABLE IF NOT EXISTS customer_wishlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    product_id INT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    status ENUM('pending', 'confirmed', 'cancelled', 'converted') DEFAULT 'pending',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    notes TEXT NULL,
    requested_date DATE NULL,
    estimated_delivery_date DATE NULL,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NULL,

    -- Indexes for better performance
    INDEX idx_customer_id (customer_id),
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_created_at (created_at),

    -- Foreign key constraint
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT chk_quantity CHECK (quantity > 0),
    CONSTRAINT chk_unit_price CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create wishlist_notes table for historical notes
CREATE TABLE IF NOT EXISTS wishlist_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wishlist_id INT NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NULL,

    INDEX idx_wishlist_id (wishlist_id),
    FOREIGN KEY (wishlist_id) REFERENCES customer_wishlist(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data for testing (optional - remove in production)
INSERT INTO customer_wishlist (customer_id, product_name, quantity, unit_price, status, priority, notes)
VALUES
(1, 'Peinture Premium Intérieure', 5, 480.00, 'pending', 'high', 'Teinte spéciale demandée'),
(1, 'Primaire d''accrochage', 10, 220.00, 'confirmed', 'medium', 'Livraison urgente'),
(2, 'Enduit de lissage', 8, 150.00, 'pending', 'low', NULL),
(2, 'Rouleau professionnel', 15, 45.00, 'confirmed', 'medium', 'Lot de 15 unités')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
