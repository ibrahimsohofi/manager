import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  History,
  TrendingUp,
  TrendingDown,
  X,
  DollarSign,
  ShoppingCart,
  Calendar,
  ArrowRight,
  Minus,
} from "lucide-react";
import { Button } from "./ui/button";

const PriceHistory = ({ productId, productName, isVisible, onClose }) => {
  const { t } = useTranslation();
  const [priceHistory, setPriceHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const API_BASE_URL = "http://localhost:5000";

  useEffect(() => {
    if (isVisible && productId) {
      fetchPriceHistory();
    }
  }, [isVisible, productId]);

  const fetchPriceHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}/price-history`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setPriceHistory(data.price_history);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Error fetching price history:", error);
      setPriceHistory([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  const filteredHistory = priceHistory.filter((item) => {
    if (filter === "all") return true;
    return item.price_type === filter;
  });

  const getPriceChangeIcon = (difference) => {
    if (difference > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (difference < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getPriceChangeColor = (difference) => {
    if (difference > 0) return "text-green-600";
    if (difference < 0) return "text-red-600";
    return "text-gray-500";
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPercentage = (percentage) => {
    const sign = percentage > 0 ? "+" : "";
    return `${sign}${Number.parseFloat(percentage).toFixed(1)}%`;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("fr-MA", {
      style: "currency",
      currency: "MAD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {t("priceHistory.title", "Price History")}
                </h3>
                <p className="text-sm text-blue-100">{productName}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <p className="text-2xl font-bold text-blue-600">{summary.total_changes}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("priceHistory.totalChanges", "Total Changes")}
              </p>
            </div>
            <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <p className="text-2xl font-bold text-emerald-600">
                {summary.selling_price_changes}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("priceHistory.sellingChanges", "Selling Price")}
              </p>
            </div>
            <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <p className="text-2xl font-bold text-orange-600">
                {summary.purchase_price_changes}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("priceHistory.purchaseChanges", "Purchase Price")}
              </p>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
            className={filter === "all" ? "bg-blue-600 text-white" : ""}
          >
            {t("priceHistory.all", "All")} ({priceHistory.length})
          </Button>
          <Button
            variant={filter === "selling" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("selling")}
            className={filter === "selling" ? "bg-emerald-600 text-white" : ""}
          >
            <DollarSign className="h-4 w-4 mr-1" />
            {t("priceHistory.selling", "Selling")} (
            {priceHistory.filter((h) => h.price_type === "selling").length})
          </Button>
          <Button
            variant={filter === "purchase" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("purchase")}
            className={filter === "purchase" ? "bg-orange-600 text-white" : ""}
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            {t("priceHistory.purchase", "Purchase")} (
            {priceHistory.filter((h) => h.price_type === "purchase").length})
          </Button>
        </div>

        {/* Price History List */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
              <p className="text-sm text-gray-500 mt-3">
                {t("priceHistory.loading", "Loading price history...")}
              </p>
            </div>
          ) : filteredHistory.length > 0 ? (
            filteredHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600 hover:shadow-md transition-shadow"
              >
                {/* Price Type Icon */}
                <div
                  className={`p-3 rounded-xl ${
                    item.price_type === "selling"
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : "bg-orange-100 dark:bg-orange-900/30"
                  }`}
                >
                  {item.price_type === "selling" ? (
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ShoppingCart className="h-5 w-5 text-orange-600" />
                  )}
                </div>

                {/* Price Change Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        item.price_type === "selling"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      }`}
                    >
                      {item.price_type === "selling"
                        ? t("priceHistory.sellingPrice", "Selling Price")
                        : t("priceHistory.purchasePrice", "Purchase Price")}
                    </span>
                  </div>

                  {/* Price Change Visual */}
                  <div className="flex items-center gap-2 text-lg">
                    <span className="font-medium text-gray-500 line-through">
                      {formatCurrency(item.old_price)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(item.new_price)}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <Calendar className="h-3 w-3" />
                    {formatDate(item.changed_at)}
                  </div>
                </div>

                {/* Change Amount */}
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {getPriceChangeIcon(item.price_difference)}
                    <span className={`font-bold ${getPriceChangeColor(item.price_difference)}`}>
                      {item.price_difference > 0 ? "+" : ""}
                      {formatCurrency(item.price_difference)}
                    </span>
                  </div>
                  <p
                    className={`text-sm font-medium ${getPriceChangeColor(item.percentage_change)}`}
                  >
                    {formatPercentage(item.percentage_change)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <History className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {t("priceHistory.noChanges", "No price changes recorded")}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {t(
                  "priceHistory.changesWillAppear",
                  "Price changes will appear here when you update product prices"
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {summary?.last_change
                ? `${t("priceHistory.lastChange", "Last change")}: ${formatDate(summary.last_change)}`
                : t("priceHistory.noChangesYet", "No changes recorded yet")}
            </p>
            <Button variant="outline" onClick={onClose}>
              {t("common.close", "Close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceHistory;
