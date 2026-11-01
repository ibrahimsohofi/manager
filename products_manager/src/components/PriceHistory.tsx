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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/services/api";
import type { PriceHistoryItem, PriceHistoryResponse } from "@/types";
import { toast } from "sonner";

interface PriceHistoryProps {
  productId: number;
  isVisible: boolean;
  onClose: () => void;
}

export function PriceHistory({ productId, isVisible, onClose }: PriceHistoryProps) {
  const { t } = useTranslation();
  const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([]);
  const [summary, setSummary] = useState<PriceHistoryResponse["summary"] | null>(null);
  const [productName, setProductName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "selling" | "purchase">("all");

  useEffect(() => {
    if (isVisible && productId) {
      fetchPriceHistory();
    }
  }, [isVisible, productId]);

  const fetchPriceHistory = async () => {
    setLoading(true);
    try {
      const response = await api.getProductPriceHistory(productId);
      if (response.success) {
        setPriceHistory(response.price_history);
        setSummary(response.summary);
        setProductName(response.product_name);
      }
    } catch (error) {
      console.error("Error fetching price history:", error);
      toast.error(t("product.failedToLoadPriceHistory", "Failed to load price history"));
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

  const getPriceChangeIcon = (difference: number) => {
    if (difference > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (difference < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getPriceChangeColor = (difference: number) => {
    if (difference > 0) return "text-green-600";
    if (difference < 0) return "text-red-600";
    return "text-gray-500";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPercentage = (percentage: number) => {
    const sign = percentage > 0 ? "+" : "";
    return `${sign}${percentage}%`;
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
                  {t("product.priceHistory", "Price History")}
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
                {t("product.totalChanges", "Total Changes")}
              </p>
            </div>
            <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <p className="text-2xl font-bold text-emerald-600">
                {summary.selling_price_changes}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("product.sellingChanges", "Selling Price")}
              </p>
            </div>
            <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <p className="text-2xl font-bold text-orange-600">
                {summary.purchase_price_changes}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("product.purchaseChanges", "Purchase Price")}
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
            {t("product.all", "All")} ({priceHistory.length})
          </Button>
          <Button
            variant={filter === "selling" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("selling")}
            className={filter === "selling" ? "bg-emerald-600 text-white" : ""}
          >
            <DollarSign className="h-4 w-4 mr-1" />
            {t("product.selling", "Selling")} (
            {priceHistory.filter((h) => h.price_type === "selling").length})
          </Button>
          <Button
            variant={filter === "purchase" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("purchase")}
            className={filter === "purchase" ? "bg-orange-600 text-white" : ""}
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            {t("product.purchase", "Purchase")} (
            {priceHistory.filter((h) => h.price_type === "purchase").length})
          </Button>
        </div>

        {/* Price History List */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
              <p className="text-sm text-gray-500 mt-3">
                {t("product.loadingPriceHistory", "Loading price history...")}
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
                    <DollarSign
                      className={`h-5 w-5 ${
                        item.price_type === "selling" ? "text-emerald-600" : "text-orange-600"
                      }`}
                    />
                  ) : (
                    <ShoppingCart className="h-5 w-5 text-orange-600" />
                  )}
                </div>

                {/* Price Change Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        item.price_type === "selling"
                          ? "border-emerald-300 text-emerald-700 dark:text-emerald-400"
                          : "border-orange-300 text-orange-700 dark:text-orange-400"
                      }`}
                    >
                      {item.price_type === "selling"
                        ? t("product.sellingPrice", "Selling Price")
                        : t("product.purchasePrice", "Purchase Price")}
                    </Badge>
                  </div>

                  {/* Price Change Visual */}
                  <div className="flex items-center gap-2 text-lg">
                    <span className="font-medium text-gray-500 line-through">
                      {item.old_price}
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {item.new_price}
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
                      {item.price_difference} {t("currency")}
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
                {t("product.noPriceChanges", "No price changes recorded")}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {t(
                  "product.priceChangesWillAppear",
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
                ? `${t("product.lastChange", "Last change")}: ${formatDate(summary.last_change)}`
                : t("product.noChangesYet", "No changes recorded yet")}
            </p>
            <Button variant="outline" onClick={onClose}>
              {t("actions.close", "Close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
