import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import inventoryService from "../services/inventoryIntegration.js";
import { CONNECTION_STATUS } from "../config/integration.js";

const ConnectionStatus = ({ showDetails = false, className = "" }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState(CONNECTION_STATUS.CHECKING);
  const [lastCheck, setLastCheck] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inventoryStats, setInventoryStats] = useState(null);

  useEffect(() => {
    // Subscribe to connection status changes
    const unsubscribe = inventoryService.onConnectionChange((newStatus) => {
      setStatus(newStatus);
      setLastCheck(inventoryService.getConnectionStatus().lastCheck);
    });

    // Fetch inventory stats if connected
    const fetchStats = async () => {
      if (status === CONNECTION_STATUS.CONNECTED) {
        const stats = await inventoryService.getInventoryStats();
        setInventoryStats(stats);
      }
    };

    fetchStats();

    return () => unsubscribe();
  }, [status]);

  const getStatusConfig = () => {
    switch (status) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          color: "bg-green-500",
          textColor: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50 dark:bg-green-900/20",
          borderColor: "border-green-200 dark:border-green-800",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ),
          label: t("connection.connected", "Connecté"),
          description: t("connection.inventoryOnline", "Système d'inventaire en ligne"),
        };
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          color: "bg-red-500",
          textColor: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-50 dark:bg-red-900/20",
          borderColor: "border-red-200 dark:border-red-800",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ),
          label: t("connection.disconnected", "Déconnecté"),
          description: t("connection.inventoryOffline", "Système d'inventaire hors ligne"),
        };
      case CONNECTION_STATUS.ERROR:
        return {
          color: "bg-orange-500",
          textColor: "text-orange-600 dark:text-orange-400",
          bgColor: "bg-orange-50 dark:bg-orange-900/20",
          borderColor: "border-orange-200 dark:border-orange-800",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ),
          label: t("connection.error", "Erreur"),
          description: t("connection.inventoryError", "Erreur de connexion à l'inventaire"),
        };
      case CONNECTION_STATUS.CHECKING:
      default:
        return {
          color: "bg-blue-500 animate-pulse",
          textColor: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50 dark:bg-blue-900/20",
          borderColor: "border-blue-200 dark:border-blue-800",
          icon: (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ),
          label: t("connection.checking", "Vérification..."),
          description: t("connection.checkingInventory", "Vérification de la connexion..."),
        };
    }
  };

  const config = getStatusConfig();

  const handleRetry = async () => {
    setStatus(CONNECTION_STATUS.CHECKING);
    await inventoryService.healthCheck();
  };

  // Compact mode - just the indicator
  if (!showDetails) {
    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 ${config.bgColor} ${config.borderColor} border ${className}`}
        title={config.description}
      >
        <span className={`w-2 h-2 rounded-full ${config.color}`}></span>
        <span className={`text-xs font-medium ${config.textColor}`}>
          {t("connection.inventory", "Inventaire")}
        </span>
        <span className={config.textColor}>{config.icon}</span>

        {/* Expanded details popup */}
        {isExpanded && (
          <div
            className="absolute top-full right-0 mt-2 w-72 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {t("connection.systemStatus", "État du système")}
              </h4>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={`flex items-center gap-2 p-2 rounded ${config.bgColor} mb-3`}>
              <span className={config.textColor}>{config.icon}</span>
              <div>
                <p className={`text-sm font-medium ${config.textColor}`}>{config.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{config.description}</p>
              </div>
            </div>

            {/* Inventory Stats */}
            {status === CONNECTION_STATUS.CONNECTED && inventoryStats && (
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t("connection.totalProducts", "Produits")}:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {inventoryStats.totalProducts?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t("connection.stockValue", "Valeur stock")}:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {inventoryStats.totalStockValue?.toLocaleString() || 0} DH
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t("connection.lowStock", "Stock bas")}:
                  </span>
                  <span className={`font-medium ${inventoryStats.lowStockCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>
                    {inventoryStats.lowStockCount || 0}
                  </span>
                </div>
              </div>
            )}

            {lastCheck && (
              <p className="text-xs text-gray-400 mb-3">
                {t("connection.lastCheck", "Dernière vérification")}: {new Date(lastCheck.timestamp).toLocaleTimeString()}
              </p>
            )}

            {status !== CONNECTION_STATUS.CONNECTED && (
              <button
                onClick={handleRetry}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t("connection.retry", "Réessayer la connexion")}
              </button>
            )}
          </div>
        )}
      </button>
    );
  }

  // Full details mode
  return (
    <div className={`p-4 rounded-lg border ${config.bgColor} ${config.borderColor} ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${config.color}`}></span>
          <div>
            <h3 className={`font-semibold ${config.textColor}`}>{config.label}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{config.description}</p>
          </div>
        </div>
        <span className={config.textColor}>{config.icon}</span>
      </div>

      {/* Inventory Stats */}
      {status === CONNECTION_STATUS.CONNECTED && inventoryStats && (
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {inventoryStats.totalProducts?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("connection.products", "Produits")}
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(inventoryStats.totalStockValue / 1000)?.toFixed(1) || 0}k
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("connection.stockValueShort", "Stock (DH)")}
            </p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${inventoryStats.lowStockCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>
              {inventoryStats.lowStockCount || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("connection.alerts", "Alertes")}
            </p>
          </div>
        </div>
      )}

      {lastCheck && (
        <p className="text-xs text-gray-400 mt-3">
          {t("connection.lastCheck", "Dernière vérification")}: {new Date(lastCheck.timestamp).toLocaleTimeString()}
          {lastCheck.error && ` - ${lastCheck.error}`}
        </p>
      )}

      {status !== CONNECTION_STATUS.CONNECTED && (
        <button
          onClick={handleRetry}
          className="mt-3 w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t("connection.retry", "Réessayer la connexion")}
        </button>
      )}
    </div>
  );
};

export default ConnectionStatus;
