// Enhanced Integration Configuration
// Centralized configuration for connecting products_manager and sales_manager
// Supports real-time sync, WebSocket connections, and robust error handling

// Environment detection
const isDevelopment = import.meta.env?.MODE === 'development' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

// Get the base URL dynamically based on environment
const getBaseUrl = (port) => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // If we're running on a network IP (not localhost), use that for API calls too
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return `${protocol}//${hostname}:${port}`;
  }

  // Fallback to localhost for local development
  return `http://localhost:${port}`;
};

// Products Manager API (Inventory System) - Port 5000
export const PRODUCTS_MANAGER_API = {
  BASE_URL: import.meta.env?.VITE_PRODUCTS_MANAGER_URL || getBaseUrl(5000),
  WS_URL: import.meta.env?.VITE_PRODUCTS_MANAGER_WS_URL ||
    `ws://${window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname}:5000`,

  // Product endpoints
  PRODUCTS: '/api/products',
  PRODUCT_BY_ID: (id) => `/api/products/${id}`,
  CATEGORIES: '/api/categories',
  STATS: '/api/stats',

  // Integration endpoints (for sales system)
  INTEGRATION: {
    SEARCH: '/api/integration/search',
    PRODUCT: (identifier) => `/api/integration/product/${identifier}`,
    AVAILABILITY: (id) => `/api/integration/availability/${id}`,
    LOW_STOCK: '/api/integration/low-stock',
    UPDATE_STOCK: (id) => `/api/integration/products/${id}/update-stock`,
    RECORD_SALE: '/api/integration/sale',
    SYNC_STATUS: '/api/integration/sync-status',
    BATCH_AVAILABILITY: '/api/integration/batch-availability',
    STOCK_CHANGES: '/api/integration/stock-changes',
    SUBSCRIBE_UPDATES: '/api/integration/subscribe',
  },

  // Health check
  HEALTH: '/api/health',
};

// Sales Manager API - Port 3001
export const SALES_MANAGER_API = {
  BASE_URL: import.meta.env?.VITE_SALES_MANAGER_URL || getBaseUrl(3001),

  // Sales endpoints
  SALES: '/api/sales',
  SALE_BY_ID: (id) => `/api/sales/${id}`,

  // Customer endpoints
  CUSTOMERS: '/api/customers',
  CUSTOMER_BY_ID: (id) => `/api/customers/${id}`,

  // Supplier endpoints
  SUPPLIERS: '/api/suppliers',

  // Reports
  REPORTS: '/api/reports',

  // Health check
  HEALTH: '/api/health',
};

// Connection status constants
export const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CHECKING: 'checking',
  ERROR: 'error',
  RECONNECTING: 'reconnecting',
  SYNCING: 'syncing',
};

// Sync status constants
export const SYNC_STATUS = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  ERROR: 'error',
  PARTIAL: 'partial',
};

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // ms
  RETRY_MULTIPLIER: 1.5, // exponential backoff
  MAX_RETRY_DELAY: 10000, // 10 seconds max
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  REAL_TIME_POLL_INTERVAL: 5000, // 5 seconds for real-time updates
  RECONNECT_INTERVAL: 5000, // 5 seconds
};

// Cache configuration
export const CACHE_CONFIG = {
  PRODUCT_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  CATEGORY_CACHE_TTL: 15 * 60 * 1000, // 15 minutes
  STATS_CACHE_TTL: 1 * 60 * 1000, // 1 minute
  MAX_CACHE_SIZE: 500, // maximum number of cached items
};

// Event types for real-time updates
export const INTEGRATION_EVENTS = {
  STOCK_UPDATED: 'stock:updated',
  PRODUCT_CREATED: 'product:created',
  PRODUCT_UPDATED: 'product:updated',
  PRODUCT_DELETED: 'product:deleted',
  PRICE_CHANGED: 'price:changed',
  LOW_STOCK_ALERT: 'stock:low',
  OUT_OF_STOCK_ALERT: 'stock:out',
  CONNECTION_CHANGED: 'connection:changed',
  SYNC_COMPLETED: 'sync:completed',
  SYNC_ERROR: 'sync:error',
};

// Helper function to build full URL
export const buildUrl = (baseUrl, endpoint) => `${baseUrl}${endpoint}`;

// Default fetch options with timeout
export const defaultFetchOptions = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000, // 10 seconds
  credentials: 'omit',
};

// Fetch with timeout wrapper and retry logic
export const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...defaultFetchOptions,
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
};

// Fetch with retry logic and exponential backoff
export const fetchWithRetry = async (url, options = {}, maxRetries = RETRY_CONFIG.MAX_RETRIES) => {
  let lastError;
  let delay = RETRY_CONFIG.RETRY_DELAY;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);

      // If response is ok, return it
      if (response.ok) {
        return response;
      }

      // If it's a client error (4xx), don't retry
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Server error, will retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    // If this was the last attempt, throw
    if (attempt === maxRetries) {
      throw lastError;
    }

    // Wait before retrying (exponential backoff)
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * RETRY_CONFIG.RETRY_MULTIPLIER, RETRY_CONFIG.MAX_RETRY_DELAY);
  }

  throw lastError;
};

// Simple event emitter for integration events
class IntegrationEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }

    // Also emit to wildcard listeners
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(callback => {
        try {
          callback({ event, data });
        } catch (error) {
          console.error(`Error in wildcard event listener:`, error);
        }
      });
    }
  }

  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// Export singleton event emitter
export const integrationEvents = new IntegrationEventEmitter();

// Utility to format errors for display
export const formatIntegrationError = (error) => {
  if (error.message === 'Request timeout') {
    return 'La connexion a expiré. Veuillez réessayer.';
  }
  if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
    return 'Erreur réseau. Vérifiez votre connexion.';
  }
  if (error.message.includes('HTTP 5')) {
    return 'Erreur serveur. Veuillez réessayer plus tard.';
  }
  return error.message || 'Une erreur inattendue s\'est produite.';
};

// Debug logging (only in development)
export const debugLog = (...args) => {
  if (isDevelopment) {
    console.log('[Integration]', ...args);
  }
};

export default {
  PRODUCTS_MANAGER_API,
  SALES_MANAGER_API,
  CONNECTION_STATUS,
  SYNC_STATUS,
  RETRY_CONFIG,
  CACHE_CONFIG,
  INTEGRATION_EVENTS,
  buildUrl,
  fetchWithTimeout,
  fetchWithRetry,
  integrationEvents,
  formatIntegrationError,
  debugLog,
};
