import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import inventoryService from "../services/inventoryIntegration.js";
import stockSyncService from "../services/stockSyncService.js";
import {
  CONNECTION_STATUS,
  SYNC_STATUS,
  INTEGRATION_EVENTS,
  integrationEvents,
} from "../config/integration.js";

const IntegrationStatusWidget = ({ variant = "full", onNavigateToOutOfStock }) => {
  const { t } = useTranslation();
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.CHECKING);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.IDLE);
  const [syncStats, setSyncStats] = useState({
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    lastSyncDuration: 0,
    changesDetected: 0,
  });
  const [inventoryStats, setInventoryStats] = useState(null);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch inventory stats
  const fetchInventoryStats = useCallback(async () => {
    try {
      const stats = await inventoryService.getInventoryStats();
      setInventoryStats(stats);
    } catch (error) {
      console.error("Failed to fetch inventory stats:", error);
    }
  }, []);

  // Fetch low stock products
  const fetchLowStockProducts = useCallback(async () => {
    try {
      const data = await inventoryService.getLowStockProducts();
      setLowStockProducts(data.products?.slice(0, 5) || []);
    } catch (error) {
      console.error("Failed to fetch low stock products:", error);
    }
  }, []);

  useEffect(() => {
    // Subscribe to connection status changes
    const unsubConnection = inventoryService.onConnectionChange((status) => {
      setConnectionStatus(status);
      if (status === CONNECTION_STATUS.CONNECTED) {
        fetchInventoryStats();
        fetchLowStockProducts();
      }
    });

    // Subscribe to sync status changes
    const unsubSync = stockSyncService.subscribe((data) => {
      setSyncStatus(data.status);
      setSyncStats(data.stats || syncStats);
      setLastSync(data.lastSync);
    });

    // Subscribe to integration events
    const unsubStockAlert = integrationEvents.on(
      INTEGRATION_EVENTS.LOW_STOCK_ALERT,
      (alert) => {
        setRecentAlerts((prev) => [
          { ...alert, type: "low_stock", timestamp: new Date() },
          ...prev.slice(0, 4),
        ]);
      }
    );

    const unsubOutOfStock = integrationEvents.on(
      INTEGRATION_EVENTS.OUT_OF_STOCK_ALERT,
      (alert) => {
        setRecentAlerts((prev) => [
          { ...alert, type: "out_of_stock", timestamp: new Date() },
          ...prev.slice(0, 4),
        ]);
      }
    );

    const unsubSyncComplete = integrationEvents.on(
      INTEGRATION_EVENTS.SYNC_COMPLETED,
      () => {
        fetchLowStockProducts();
      }
    );

    // Start real-time sync
    stockSyncService.startRealTimeSync();

    return () => {
      unsubConnection();
      unsubSync();
      unsubStockAlert();
      unsubOutOfStock();
      unsubSyncComplete();
      // Stop real-time sync to prevent background polling when component unmounts
      stockSyncService.stopRealTimeSync();
    };
  }, [fetchInventoryStats, fetchLowStockProducts]);

  const getConnectionConfig = () => {
    switch (connectionStatus) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          color: "bg-emerald-500",
          pulseColor: "bg-emerald-400",
          textColor: "text-emerald-600 dark:text-emerald-400",
          bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
          borderColor: "border-emerald-200 dark:border-emerald-800",
          label: t("integration.connected", "Connecté"),
          icon: "check",
        };
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          color: "bg-red-500",
          pulseColor: "bg-red-400",
          textColor: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-50 dark:bg-red-900/20",
          borderColor: "border-red-200 dark:border-red-800",
          label: t("integration.disconnected", "Déconnecté"),
          icon: "x",
        };
      case CONNECTION_STATUS.RECONNECTING:
        return {
          color: "bg-yellow-500",
          pulseColor: "bg-yellow-400",
          textColor: "text-yellow-600 dark:text-yellow-400",
          bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
          borderColor: "border-yellow-200 dark:border-yellow-800",
          label: t("integration.reconnecting", "Reconnexion..."),
          icon: "refresh",
        };
      case CONNECTION_STATUS.ERROR:
        return {
          color: "bg-orange-500",
          pulseColor: "bg-orange-400",
          textColor: "text-orange-600 dark:text-orange-400",
          bgColor: "bg-orange-50 dark:bg-orange-900/20",
          borderColor: "border-orange-200 dark:border-orange-800",
          label: t("integration.error", "Erreur"),
          icon: "warning",
        };
      default:
        return {
          color: "bg-blue-500",
          pulseColor: "bg-blue-400",
          textColor: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50 dark:bg-blue-900/20",
          borderColor: "border-blue-200 dark:border-blue-800",
          label: t("integration.checking", "Vérification..."),
          icon: "loading",
        };
    }
  };

  const getSyncStatusConfig = () => {
    switch (syncStatus) {
      case SYNC_STATUS.SYNCED:
        return {
          color: "text-emerald-500",
          label: t("integration.synced", "Synchronisé"),
          icon: "check-circle",
        };
      case SYNC_STATUS.SYNCING:
        return {
          color: "text-blue-500",
          label: t("integration.syncing", "Synchronisation..."),
          icon: "refresh",
        };
      case SYNC_STATUS.ERROR:
        return {
          color: "text-red-500",
          label: t("integration.syncError", "Erreur de sync"),
          icon: "x-circle",
        };
      default:
        return {
          color: "text-gray-400",
          label: t("integration.idle", "En attente"),
          icon: "clock",
        };
    }
  };

  const handleForceSync = async () => {
    await stockSyncService.forceResync();
  };

  const handleRetryConnection = async () => {
    await inventoryService.healthCheck();
  };

  const config = getConnectionConfig();
  const syncConfig = getSyncStatusConfig();

  // Compact variant for navigation bar
  if (variant === "compact") {
    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 ${config.bgColor} ${config.borderColor} border hover:shadow-md`}
        title={t("integration.inventorySystem", "Système d'inventaire")}
      >
        {/* Pulse indicator */}
        <span className="relative flex h-2.5 w-2.5">
          {connectionStatus === CONNECTION_STATUS.CONNECTED && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulseColor} opacity-75`}
            />
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${config.color}`}
          />
        </span>

        <span className={`text-xs font-medium ${config.textColor}`}>
          {t("integration.inventory", "Inventaire")}
        </span>

        {/* Sync indicator */}
        {syncStatus === SYNC_STATUS.SYNCING && (
          <svg
            className="w-3 h-3 animate-spin text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}

        {/* Alert badge */}
        {lowStockProducts.length > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-orange-500 rounded-full">
            {lowStockProducts.length > 9 ? "9+" : lowStockProducts.length}
          </span>
        )}

        {/* Expanded popup */}
        {isExpanded && (
          <div
            className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-4 ${config.bgColor} border-b ${config.borderColor}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    {connectionStatus === CONNECTION_STATUS.CONNECTED && (
                      <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulseColor} opacity-75`}
                      />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-3 w-3 ${config.color}`}
                    />
                  </span>
                  <span className={`font-semibold ${config.textColor}`}>
                    {config.label}
                  </span>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("integration.inventorySystemDesc", "Products Manager API")}
              </p>
            </div>

            {/* Stats */}
            {connectionStatus === CONNECTION_STATUS.CONNECTED && inventoryStats && (
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {inventoryStats.totalProducts?.toLocaleString() || 0}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("integration.products", "Produits")}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {((inventoryStats.totalStockValue || 0) / 1000).toFixed(1)}k
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("integration.stockValue", "Valeur (DH)")}
                    </p>
                  </div>
                  <div className="text-center">
                    <p
                      className={`text-lg font-bold ${
                        (inventoryStats.lowStockCount || 0) > 0
                          ? "text-orange-500"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {inventoryStats.lowStockCount || 0}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t("integration.alerts", "Alertes")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sync Status */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t("integration.syncStatus", "État sync")}
                </span>
                <span className={`text-sm font-medium ${syncConfig.color}`}>
                  {syncConfig.label}
                </span>
              </div>
              {lastSync && (
                <p className="text-xs text-gray-400">
                  {t("integration.lastSync", "Dernière sync")}:{" "}
                  {new Date(lastSync).toLocaleTimeString()}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span>
                  {syncStats.successfulSyncs}/{syncStats.totalSyncs} {t("integration.successful", "réussis")}
                </span>
                {syncStats.changesDetected > 0 && (
                  <span className="text-blue-500">
                    {syncStats.changesDetected} {t("integration.changes", "changements")}
                  </span>
                )}
              </div>
            </div>

            {/* Low Stock Alerts */}
            {lowStockProducts.length > 0 && (
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                  {t("integration.lowStockAlerts", "Alertes stock bas")}
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {lowStockProducts.slice(0, 3).map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-600 dark:text-gray-400 truncate max-w-[180px]">
                        {product.displayName || product.name}
                      </span>
                      <span
                        className={`font-medium ${
                          (product.remaining_stock || product.stock_quantity || 0) === 0
                            ? "text-red-500"
                            : "text-orange-500"
                        }`}
                      >
                        {product.remaining_stock || product.stock_quantity || 0}{" "}
                        {product.unit || "unités"}
                      </span>
                    </div>
                  ))}
                </div>
                {lowStockProducts.length > 3 && (
                  <button
                    onClick={() => {
                      setIsExpanded(false);
                      onNavigateToOutOfStock?.();
                    }}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {t("integration.viewAll", "Voir tout")} ({lowStockProducts.length})
                  </button>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 flex gap-2">
              {connectionStatus !== CONNECTION_STATUS.CONNECTED ? (
                <button
                  onClick={handleRetryConnection}
                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {t("integration.retry", "Réessayer")}
                </button>
              ) : (
                <button
                  onClick={handleForceSync}
                  disabled={syncStatus === SYNC_STATUS.SYNCING}
                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  {syncStatus === SYNC_STATUS.SYNCING ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t("integration.syncing", "Sync...")}
                    </>
                  ) : (
                    t("integration.forceSync", "Synchroniser")
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </button>
    );
  }

  // Full variant for dashboard
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`p-4 ${config.bgColor} border-b ${config.borderColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="relative flex h-4 w-4">
                {connectionStatus === CONNECTION_STATUS.CONNECTED && (
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulseColor} opacity-75`}
                  />
                )}
                <span
                  className={`relative inline-flex rounded-full h-4 w-4 ${config.color}`}
                />
              </span>
            </div>
            <div>
              <h3 className={`font-semibold ${config.textColor}`}>
                {t("integration.inventoryIntegration", "Intégration Inventaire")}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {config.label} - Products Manager
              </p>
            </div>
          </div>

          {/* Sync status badge */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              syncStatus === SYNC_STATUS.SYNCED
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                : syncStatus === SYNC_STATUS.SYNCING
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
            }`}
          >
            {syncStatus === SYNC_STATUS.SYNCING && (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {syncConfig.label}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {connectionStatus === CONNECTION_STATUS.CONNECTED && inventoryStats && (
        <div className="grid grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700 border-b border-gray-100 dark:border-gray-700">
          <div className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {inventoryStats.totalProducts?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t("integration.totalProducts", "Produits")}
            </p>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {((inventoryStats.totalStockValue || 0) / 1000).toFixed(1)}k
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t("integration.stockValueDH", "Stock (DH)")}
            </p>
          </div>
          <div className="p-4 text-center">
            <p
              className={`text-2xl font-bold ${
                (inventoryStats.lowStockCount || 0) > 0
                  ? "text-orange-500"
                  : "text-gray-900 dark:text-white"
              }`}
            >
              {inventoryStats.lowStockCount || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t("integration.lowStockCount", "Stock bas")}
            </p>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {syncStats.changesDetected || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t("integration.changesDetected", "Changements")}
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Low Stock Products */}
        {lowStockProducts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t("integration.lowStockProducts", "Produits en stock bas")}
              </h4>
              <button
                onClick={() => onNavigateToOutOfStock?.()}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t("integration.viewAll", "Voir tout")}
              </button>
            </div>
            <div className="space-y-2">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {product.displayName || product.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        (product.remaining_stock || product.stock_quantity || 0) === 0
                          ? "text-red-500"
                          : "text-orange-500"
                      }`}
                    >
                      {product.remaining_stock || product.stock_quantity || 0}
                    </span>
                    <span className="text-xs text-gray-400">
                      {product.unit || "unités"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Alerts */}
        {recentAlerts.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t("integration.recentAlerts", "Alertes récentes")}
            </h4>
            <div className="space-y-2">
              {recentAlerts.slice(0, 3).map((alert, index) => (
                <div
                  key={`${alert.product_id}-${index}`}
                  className={`flex items-center gap-2 p-2 rounded-lg ${
                    alert.type === "out_of_stock"
                      ? "bg-red-50 dark:bg-red-900/20"
                      : "bg-orange-50 dark:bg-orange-900/20"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      alert.type === "out_of_stock" ? "bg-red-500" : "bg-orange-500"
                    }`}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
                    {alert.product_name || `Produit #${alert.product_id}`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {alert.timestamp && new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sync Info */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div>
            {lastSync && (
              <span>
                {t("integration.lastSync", "Dernière sync")}:{" "}
                {new Date(lastSync).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span>
              {syncStats.successfulSyncs}/{syncStats.totalSyncs}
            </span>
            <button
              onClick={handleForceSync}
              disabled={syncStatus === SYNC_STATUS.SYNCING}
              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              {syncStatus === SYNC_STATUS.SYNCING ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {t("integration.sync", "Sync")}
            </button>
          </div>
        </div>
      </div>

      {/* Disconnected State */}
      {connectionStatus !== CONNECTION_STATUS.CONNECTED && (
        <div className="p-6 text-center">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${config.bgColor} mb-3`}>
            <svg className={`w-6 h-6 ${config.textColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
            {t("integration.connectionIssue", "Problème de connexion")}
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("integration.cannotReach", "Impossible de joindre le système d'inventaire")}
          </p>
          <button
            onClick={handleRetryConnection}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t("integration.retryConnection", "Réessayer la connexion")}
          </button>
        </div>
      )}
    </div>
  );
};

export default IntegrationStatusWidget;
