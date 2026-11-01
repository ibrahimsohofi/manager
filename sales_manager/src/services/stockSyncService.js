// Real-Time Stock Synchronization Service
// Provides continuous sync between products_manager inventory and sales_manager
// Implements polling-based real-time updates with efficient change detection

import {
  PRODUCTS_MANAGER_API,
  RETRY_CONFIG,
  SYNC_STATUS,
  INTEGRATION_EVENTS,
  buildUrl,
  fetchWithTimeout,
  integrationEvents,
  debugLog,
} from "../config/integration.js";

class StockSyncService {
  constructor() {
    this.syncStatus = SYNC_STATUS.IDLE;
    this.lastSyncTimestamp = null;
    this.lastKnownStockState = new Map(); // productId -> stock data
    this.pendingUpdates = []; // Queue of pending stock updates
    this.syncInterval = null;
    this.isPolling = false;
    this.syncErrors = [];
    this.subscribers = new Set();

    // Stats
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncDuration: 0,
      changesDetected: 0,
    };
  }

  // ==================== Subscription Management ====================

  subscribe(callback) {
    this.subscribers.add(callback);
    // Immediately notify with current state
    callback({
      status: this.syncStatus,
      lastSync: this.lastSyncTimestamp,
      stats: this.stats,
    });
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(data) {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error("Error in sync subscriber:", error);
      }
    });
  }

  updateStatus(status, additionalData = {}) {
    this.syncStatus = status;
    this.notifySubscribers({
      status: this.syncStatus,
      lastSync: this.lastSyncTimestamp,
      stats: this.stats,
      ...additionalData,
    });

    // Emit integration event
    integrationEvents.emit(INTEGRATION_EVENTS.CONNECTION_CHANGED, {
      syncStatus: status,
      timestamp: new Date(),
    });
  }

  // ==================== Real-Time Polling ====================

  startRealTimeSync(intervalMs = RETRY_CONFIG.REAL_TIME_POLL_INTERVAL) {
    if (this.syncInterval) {
      debugLog("Real-time sync already running");
      return;
    }

    debugLog("Starting real-time stock sync with interval:", intervalMs);

    // Initial sync
    this.performSync();

    // Set up polling interval
    this.syncInterval = setInterval(() => {
      if (!this.isPolling) {
        this.performSync();
      }
    }, intervalMs);

    this.updateStatus(SYNC_STATUS.SYNCING);
  }

  stopRealTimeSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      debugLog("Real-time stock sync stopped");
      this.updateStatus(SYNC_STATUS.IDLE);
    }
  }

  async performSync() {
    if (this.isPolling) {
      debugLog("Sync already in progress, skipping");
      return;
    }

    this.isPolling = true;
    const startTime = Date.now();
    this.stats.totalSyncs++;

    try {
      this.updateStatus(SYNC_STATUS.SYNCING);

      // Fetch current stock state from products_manager
      const stockChanges = await this.fetchStockChanges();

      if (stockChanges && stockChanges.length > 0) {
        await this.processStockChanges(stockChanges);
        this.stats.changesDetected += stockChanges.length;
      }

      this.lastSyncTimestamp = new Date();
      this.stats.successfulSyncs++;
      this.stats.lastSyncDuration = Date.now() - startTime;
      this.syncErrors = [];

      this.updateStatus(SYNC_STATUS.SYNCED, {
        changesProcessed: stockChanges?.length || 0,
        duration: this.stats.lastSyncDuration,
      });

      debugLog(`Sync completed in ${this.stats.lastSyncDuration}ms, ${stockChanges?.length || 0} changes`);

    } catch (error) {
      console.error("Stock sync failed:", error);
      this.stats.failedSyncs++;
      this.syncErrors.push({
        timestamp: new Date(),
        error: error.message,
      });

      this.updateStatus(SYNC_STATUS.ERROR, {
        error: error.message,
      });

      // Emit sync error event
      integrationEvents.emit(INTEGRATION_EVENTS.SYNC_ERROR, {
        error: error.message,
        timestamp: new Date(),
      });

    } finally {
      this.isPolling = false;
    }
  }

  // ==================== Stock Change Detection ====================

  async fetchStockChanges() {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.STOCK_CHANGES
      );

      // Add timestamp to only get changes since last sync
      const queryParams = this.lastSyncTimestamp
        ? `?since=${this.lastSyncTimestamp.toISOString()}`
        : '';

      const response = await fetchWithTimeout(url + queryParams, {}, 8000);

      if (!response.ok) {
        // If the endpoint doesn't exist yet, fall back to low-stock check
        if (response.status === 404) {
          return await this.fallbackStockCheck();
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.changes || data.stock_changes || [];

    } catch (error) {
      debugLog("Stock changes fetch failed, using fallback:", error.message);
      return await this.fallbackStockCheck();
    }
  }

  // Fallback: Compare current stock with cached state
  async fallbackStockCheck() {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.LOW_STOCK
      );

      const response = await fetchWithTimeout(url, {}, 8000);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const products = data.low_stock_products || data.products || [];

      const changes = [];

      for (const product of products) {
        const productId = product.id;
        const currentStock = product.current_stock ?? product.stock_quantity ?? product.remaining_stock ?? 0;
        const cachedStock = this.lastKnownStockState.get(productId);

        if (cachedStock !== undefined && cachedStock !== currentStock) {
          changes.push({
            product_id: productId,
            product_name: product.name || product.product_name,
            previous_stock: cachedStock,
            current_stock: currentStock,
            change: currentStock - cachedStock,
            is_low_stock: product.is_low_stock,
            is_out_of_stock: currentStock === 0,
            timestamp: new Date(),
          });
        }

        // Update cache
        this.lastKnownStockState.set(productId, currentStock);
      }

      return changes;

    } catch (error) {
      debugLog("Fallback stock check failed:", error.message);
      return [];
    }
  }

  // ==================== Stock Change Processing ====================

  async processStockChanges(changes) {
    for (const change of changes) {
      // Update local cache
      this.lastKnownStockState.set(change.product_id, change.current_stock);

      // Emit appropriate events
      if (change.is_out_of_stock || change.current_stock === 0) {
        integrationEvents.emit(INTEGRATION_EVENTS.OUT_OF_STOCK_ALERT, change);
        debugLog("Out of stock alert:", change.product_name);
      } else if (change.is_low_stock) {
        integrationEvents.emit(INTEGRATION_EVENTS.LOW_STOCK_ALERT, change);
        debugLog("Low stock alert:", change.product_name);
      }

      // General stock update event
      integrationEvents.emit(INTEGRATION_EVENTS.STOCK_UPDATED, change);
    }

    // Emit sync completed event
    integrationEvents.emit(INTEGRATION_EVENTS.SYNC_COMPLETED, {
      changes: changes.length,
      timestamp: new Date(),
    });
  }

  // ==================== Manual Stock Operations ====================

  // Queue a stock update to be synced
  queueStockUpdate(productId, quantity, operation = 'subtract') {
    this.pendingUpdates.push({
      productId,
      quantity,
      operation,
      timestamp: new Date(),
    });
    debugLog("Stock update queued:", { productId, quantity, operation });
  }

  // Process pending stock updates
  async processPendingUpdates() {
    if (this.pendingUpdates.length === 0) return;

    const updates = [...this.pendingUpdates];
    this.pendingUpdates = [];

    const results = [];

    for (const update of updates) {
      try {
        const url = buildUrl(
          PRODUCTS_MANAGER_API.BASE_URL,
          PRODUCTS_MANAGER_API.INTEGRATION.UPDATE_STOCK(update.productId)
        );

        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: update.quantity,
            operation: update.operation,
          }),
        });

        const data = await response.json();
        results.push({ ...update, success: data.success, result: data });

        if (data.success) {
          // Update local cache
          this.lastKnownStockState.set(update.productId, data.new_stock);
        }

      } catch (error) {
        console.error("Failed to process stock update:", error);
        results.push({ ...update, success: false, error: error.message });

        // Re-queue failed updates for retry
        this.pendingUpdates.push(update);
      }
    }

    return results;
  }

  // ==================== Batch Operations ====================

  // Check availability for multiple products at once
  async batchCheckAvailability(productIds) {
    try {
      const url = buildUrl(
        PRODUCTS_MANAGER_API.BASE_URL,
        PRODUCTS_MANAGER_API.INTEGRATION.BATCH_AVAILABILITY
      );

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: productIds }),
      });

      if (!response.ok) {
        // Fall back to individual checks
        return await this.fallbackBatchCheck(productIds);
      }

      const data = await response.json();
      return data.availability || {};

    } catch (error) {
      debugLog("Batch availability check failed, using fallback:", error.message);
      return await this.fallbackBatchCheck(productIds);
    }
  }

  async fallbackBatchCheck(productIds) {
    const results = {};

    for (const id of productIds) {
      const cached = this.lastKnownStockState.get(id);
      if (cached !== undefined) {
        results[id] = {
          is_available: cached > 0,
          current_stock: cached,
          is_cached: true,
        };
      }
    }

    return results;
  }

  // ==================== Stats & Status ====================

  getStats() {
    return {
      ...this.stats,
      syncStatus: this.syncStatus,
      lastSyncTimestamp: this.lastSyncTimestamp,
      pendingUpdates: this.pendingUpdates.length,
      cachedProducts: this.lastKnownStockState.size,
      recentErrors: this.syncErrors.slice(-5),
    };
  }

  getSyncStatus() {
    return {
      status: this.syncStatus,
      lastSync: this.lastSyncTimestamp,
      isRunning: !!this.syncInterval,
      pendingUpdates: this.pendingUpdates.length,
    };
  }

  // Clear cached data
  clearCache() {
    this.lastKnownStockState.clear();
    this.lastSyncTimestamp = null;
    debugLog("Stock sync cache cleared");
  }

  // Force a full resync
  async forceResync() {
    this.clearCache();
    await this.performSync();
  }

  // Cleanup
  destroy() {
    this.stopRealTimeSync();
    this.subscribers.clear();
    this.clearCache();
    debugLog("Stock sync service destroyed");
  }
}

// Export singleton instance
const stockSyncService = new StockSyncService();
export default stockSyncService;
