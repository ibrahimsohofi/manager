// Enhanced Inventory Integration Service
// Connects the sales system with the products_manager inventory system
// Provides real-time stock sync, validation, and connection management

import {
  PRODUCTS_MANAGER_API,
  CONNECTION_STATUS,
  RETRY_CONFIG,
  buildUrl,
  fetchWithTimeout
} from "../config/integration.js";

// Event emitter for connection status changes
const connectionListeners = new Set();

class InventoryIntegrationService {
  constructor() {
    this.connectionStatus = CONNECTION_STATUS.CHECKING;
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    this.cachedProducts = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache

    // Start health check monitoring
    this.startHealthCheckMonitoring();
  }

  // ==================== Connection Management ====================

  // Subscribe to connection status changes
  onConnectionChange(callback) {
    connectionListeners.add(callback);
    // Immediately notify with current status
    callback(this.connectionStatus);
    return () => connectionListeners.delete(callback);
  }

  // Notify all listeners of connection status change
  notifyConnectionChange(status) {
    this.connectionStatus = status;
    connectionListeners.forEach(callback => callback(status));
  }

  // Start periodic health check monitoring
  startHealthCheckMonitoring() {
    // Initial check
    this.healthCheck();

    // Periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.healthCheck();
    }, RETRY_CONFIG.HEALTH_CHECK_INTERVAL);
  }

  // Stop health check monitoring
  stopHealthCheckMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Health check for inventory system
  async healthCheck() {
    this.notifyConnectionChange(CONNECTION_STATUS.CHECKING);

    try {
      const url = buildUrl(PRODUCTS_MANAGER_API.BASE_URL, PRODUCTS_MANAGER_API.HEALTH);
      const response = await fetchWithTimeout(url, {}, 5000);
      const data = await response.json();

      const isHealthy = data.success ||
        (data.status && ['ok', 'healthy', 'success'].includes(data.status.toLowerCase())) ||
        response.ok;

      this.lastHealthCheck = {
        timestamp: new Date(),
        healthy: isHealthy,
        data,
      };

      this.notifyConnectionChange(
        isHealthy ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.ERROR
      );

      return isHealthy;
    } catch (error) {
      console.error("Inventory system health check failed:", error);
      this.lastHealthCheck = {
        timestamp: new Date(),
        healthy: false,
        error: error.message,
      };
      this.notifyConnectionChange(CONNECTION_STATUS.DISCONNECTED);
      return false;
    }
  }

  // Get connection status
  getConnectionStatus() {
    return {
      status: this.connectionStatus,
      lastCheck: this.lastHealthCheck,
      isConnected: this.connectionStatus === CONNECTION_STATUS.CONNECTED,
    };
  }

  // ==================== Language Support ====================

  getCurrentLanguage() {
    return localStorage.getItem("i18nextLng") || "fr";
  }

  getLocalizedField(product, fieldName) {
    const lang = this.getCurrentLanguage();
    if (lang === "ar" && product[`${fieldName}_ar`]) {
      return product[`${fieldName}_ar`];
    }
    if (lang === "fr" && product[`${fieldName}_fr`]) {
      return product[`${fieldName}_fr`];
    }
    return product[fieldName];
  }

  // ==================== Product Operations ====================

  // Normalize product data for consistent format
  normalizeProduct(product) {
    return {
      ...product,
      displayName: this.getLocalizedField(product, "name") || product.name,
      displayCategory: this.getLocalizedField(product, "category") || product.category,
      price: product.selling_price ?? product.price ?? 0,
      remaining_stock: product.stock_quantity ?? product.remaining_stock ?? 0,
      stock_quantity: product.stock_quantity ?? product.remaining_stock ?? 0,
      min_stock_level: product.min_stock_level ?? 10,
      unit: product.unit || "unité",
    };
  }

  // Get product by ID or identifier
  async getProduct(identifier, useCache = true) {
    // Check cache first
    const cacheKey = `product_${identifier}`;
    if (useCache && this.cachedProducts.has(cacheKey)) {
      const cached = this.cachedProducts.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.PRODUCT(identifier)
      );

      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Product not found`);
      }

      const data = await response.json();

      let product;
      if (data.success && data.product) {
        product = data.product;
      } else if (data.id) {
        product = data;
      } else {
        throw new Error("Product not found in response");
      }

      const normalized = this.normalizeProduct(product);

      // Cache the result
      this.cachedProducts.set(cacheKey, {
        data: normalized,
        timestamp: Date.now(),
      });

      return normalized;
    } catch (error) {
      console.error("Error fetching product from inventory:", error);
      throw error;
    }
  }

  // Search products in inventory
  async searchProducts(query, limit = 15) {
    // Normalize: trim and strip a leading "@" used for the ID search convention
    let normalized = (query || "").trim();
    if (normalized.startsWith("@")) {
      normalized = normalized.slice(1).trim();
    }

    const isNumericId = /^\d+$/.test(normalized);

    // Require 2+ chars for text search, but allow single-digit numeric ID queries
    if (!normalized || (normalized.length < 2 && !isNumericId)) {
      return [];
    }

    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        `${PRODUCTS_MANAGER_API.INTEGRATION.SEARCH}?q=${encodeURIComponent(normalized)}&limit=${limit}`
      );

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      let products = [];
      if (data.success && data.products) {
        products = data.products;
      } else if (Array.isArray(data)) {
        products = data;
      } else if (data.products && Array.isArray(data.products)) {
        products = data.products;
      }

      return products.map(product => this.normalizeProduct(product));
    } catch (error) {
      console.error("Error searching products in inventory:", error);
      return [];
    }
  }

  // Check product availability
  async checkAvailability(productId) {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.AVAILABILITY(productId)
      );

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      if (data.success && data.availability) {
        const avail = data.availability;
        return {
          is_available: avail.is_available,
          is_active: avail.is_active !== false,
          current_stock: avail.current_stock ?? avail.remaining_stock ?? 0,
          is_low_stock: avail.is_low_stock,
          product_name: avail.product_name || avail.name,
          unit: avail.unit || "unité",
          image_url: avail.image_url,
          selling_price: avail.selling_price ?? avail.price,
          stock_status: avail.stock_status ||
            (avail.current_stock === 0 ? 'out_of_stock' :
             avail.is_low_stock ? 'low' : 'good'),
        };
      }

      // Fallback to product endpoint
      const product = await this.getProduct(productId, false);
      const currentStock = product.stock_quantity || product.remaining_stock || 0;
      const minStock = product.min_stock_level || 10;

      return {
        is_available: currentStock > 0,
        is_active: true,
        current_stock: currentStock,
        is_low_stock: currentStock <= minStock,
        product_name: product.displayName || product.name,
        unit: product.unit || "unité",
        image_url: product.image_url,
        selling_price: product.price || product.selling_price,
        stock_status: currentStock === 0 ? 'out_of_stock' :
          currentStock <= minStock ? 'low' : 'good',
      };
    } catch (error) {
      console.error("Error checking product availability:", error);
      throw error;
    }
  }

  // ==================== Stock Operations ====================

  // Update stock after a sale
  async updateStock(productId, quantity, operation = 'subtract') {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.UPDATE_STOCK(productId)
      );

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, operation }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update stock');
      }

      // Invalidate cache for this product
      this.cachedProducts.delete(`product_${productId}`);

      return {
        success: true,
        previous_stock: data.previous_stock,
        new_stock: data.new_stock,
        quantity_changed: data.quantity_changed,
      };
    } catch (error) {
      console.error("Error updating stock:", error);
      return { success: false, error: error.message };
    }
  }

  // Record a sale and update inventory
  async recordSale(saleData) {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.RECORD_SALE
      );

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: saleData.product_id,
          quantity: saleData.quantity,
          price: saleData.price,
          date: saleData.date,
          customer_id: saleData.customer_id,
          payment_method: saleData.payment_method || 'cash',
          notes: saleData.notes || '',
          discount: saleData.discount || 0,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to record sale');
      }

      // Invalidate cache for this product
      this.cachedProducts.delete(`product_${saleData.product_id}`);

      return {
        success: true,
        sale: data.sale,
        inventory_update: data.inventory_update,
      };
    } catch (error) {
      console.error("Error recording sale in inventory:", error);
      // Return partial success - sale can proceed even if inventory update fails
      return {
        success: false,
        error: error.message,
        allowSale: true, // Allow sale to proceed in manual mode
      };
    }
  }

  // Get low stock products
  async getLowStockProducts() {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.LOW_STOCK
      );

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      let products = [];
      if (data.success && data.low_stock_products) {
        products = data.low_stock_products;
      } else if (data.success && data.products) {
        products = data.products;
      } else if (Array.isArray(data)) {
        products = data;
      }

      return {
        products: products.map(product => this.normalizeProduct(product)),
        summary: data.summary || {
          out_of_stock: products.filter(p => p.current_stock === 0 || p.remaining_stock === 0).length,
          critical: products.filter(p => (p.current_stock || p.remaining_stock) <= (p.min_stock_level / 2)).length,
          low: products.length,
        },
      };
    } catch (error) {
      console.error("Error fetching low stock products:", error);
      return { products: [], summary: { out_of_stock: 0, critical: 0, low: 0 } };
    }
  }

  // ==================== Validation ====================

  // Validate sale against inventory
  async validateSale(productId, quantity) {
    try {
      const availability = await this.checkAvailability(productId);

      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        availability,
      };

      // Check if product is active
      if (!availability.is_active) {
        validation.isValid = false;
        validation.errors.push("Ce produit n'est pas actif");
      }

      // Check if product is available
      if (!availability.is_available) {
        validation.isValid = false;
        validation.errors.push("Produit en rupture de stock");
      }

      // Check if enough quantity is available
      if (availability.current_stock < quantity) {
        validation.isValid = false;
        validation.errors.push(
          `Stock insuffisant. Disponible: ${availability.current_stock}, Demandé: ${quantity}`
        );
      }

      // Check for low stock warning
      if (availability.is_low_stock) {
        validation.warnings.push(
          `Attention: Stock bas - Seulement ${availability.current_stock} ${availability.unit} restant(s)`
        );
      }

      // Check if sale would deplete stock
      if (availability.current_stock - quantity <= 0) {
        validation.warnings.push(
          "Cette vente épuisera le stock de ce produit"
        );
      }

      return validation;
    } catch (error) {
      console.error("Error validating sale:", error);
      return {
        isValid: false,
        errors: [`Impossible de valider la vente: ${error.message}`],
        warnings: [],
      };
    }
  }

  // Get enriched product data for sales
  async getEnrichedProduct(productId) {
    try {
      const [product, availability] = await Promise.all([
        this.getProduct(productId, false),
        this.checkAvailability(productId),
      ]);

      return {
        ...product,
        availability,
        canSell: availability.is_available && availability.is_active,
      };
    } catch (error) {
      console.error("Error getting enriched product data:", error);
      throw error;
    }
  }

  // ==================== Stats ====================

  // Get inventory statistics
  async getInventoryStats() {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.STATS
      );

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      if (data.success && data.stats) {
        return {
          totalProducts: data.stats.totalProducts,
          totalStockValue: data.stats.totalStockValue,
          lowStockCount: data.stats.lowStockCount,
        };
      }

      return null;
    } catch (error) {
      console.error("Error fetching inventory stats:", error);
      return null;
    }
  }

  // Clear cache
  clearCache() {
    this.cachedProducts.clear();
  }

  // Cleanup on unmount
  destroy() {
    this.stopHealthCheckMonitoring();
    this.clearCache();
    connectionListeners.clear();
  }
}

// Export singleton instance
const inventoryService = new InventoryIntegrationService();
export default inventoryService;
