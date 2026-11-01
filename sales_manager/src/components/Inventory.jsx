import {
  AlertTriangle,
  CheckSquare,
  Edit,
  Eye,
  Hash,
  HelpCircle,
  History,
  ImageIcon,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ProductForm from "./ProductForm";
import PriceHistory from "./PriceHistory";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

// Helper to detect if input is an ID search (starts with @)
const parseSearchInput = (input) => {
  const trimmed = (input || "").trim();

  // Check for @ID pattern (@ followed by numbers)
  if (trimmed.startsWith("@")) {
    const idPart = trimmed.slice(1).trim();
    // Extract only numeric part after @
    const numericId = idPart.replace(/[^0-9]/g, "");
    return { mode: "id", value: numericId };
  }

  return { mode: "text", value: trimmed };
};

const Inventory = () => {
  const { t } = useTranslation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [stats, setStats] = useState({});
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const debounceTimerRef = useRef(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [priceHistoryProduct, setPriceHistoryProduct] = useState(null);
  const API_BASE_URL = " http://localhost:5000";

  // Parse search input to detect @ID mode
  const searchParsed = useMemo(() => parseSearchInput(searchTerm), [searchTerm]);
  const isIdMode = searchParsed.mode === "id";

  // Debounce search term (500ms delay)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm]);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);

      // Parse the debounced search term
      const parsed = parseSearchInput(debouncedSearchTerm);

      // Handle ID search mode
      if (parsed.mode === "id" && parsed.value) {
        const productId = Number.parseInt(parsed.value, 10);
        if (!Number.isNaN(productId) && productId > 0) {
          // Fetch single product by ID
          const response = await fetch(`${API_BASE_URL}/api/products/${productId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.product) {
              setProducts([data.product]);
            } else {
              setProducts([]);
            }
          } else {
            setProducts([]);
          }
          return;
        }
      }

      // Regular text search
      const url = `${API_BASE_URL}/api/products?`;
      const params = new URLSearchParams();

      if (parsed.value) params.append("search", parsed.value);

      if (categoryFilter) params.append("category", categoryFilter);

      if (showLowStock) params.append("low_stock", "true");

      const response = await fetch(url + params.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setProducts(data.products);
    } catch (error) {
      console.error("Error fetching products:", error);
      setError("Failed to fetch products");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, categoryFilter, showLowStock]);

  // Initial load
  useEffect(() => {
    fetchStats();
    fetchCategories();
  }, []);

  // Refetch products when filters change
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm(t("common.confirmDeleteProduct"))) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchProducts();
        fetchStats();
        alert(t("common.productDeleted"));
      } else {
        throw new Error("Failed to delete product");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      alert(t("common.productDeleteError"));
    }
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return "N/A";

    return new Intl.NumberFormat("fr-MA", {
      style: "currency",
      currency: "MAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getStockStatusColor = (product) => {
    if (product.stock_quantity <= product.min_stock_level)
      return "text-red-600 bg-red-100";

    if (product.stock_quantity <= product.min_stock_level * 1.5)
      return "text-yellow-600 bg-yellow-100";

    return "text-green-600 bg-green-100";
  };

  const handleSaveProduct = async (formData) => {
    try {
      const url = editingProduct
        ? `${API_BASE_URL}/api/products/${editingProduct.id}`
        : `${API_BASE_URL}/api/products`;

      const method = editingProduct ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        fetchProducts();
        fetchStats();
        setShowAddForm(false);
        setEditingProduct(null);
        alert(
          editingProduct
            ? t("inventory.productUpdated")
            : t("inventory.productAdded"),
        );
      } else {
        throw new Error("Failed to save product");
      }
    } catch (error) {
      console.error("Error saving product:", error);
      alert("Error saving product");
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setShowAddForm(true);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingProduct(null);
  };

  if (loading && products.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t("inventory.title")}
          </h2>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
        >
          {t("inventory.addProduct")}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg
                className="w-6 h-6 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t("inventoryPage.totalProducts")}
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.totalProducts || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <svg
                className="w-6 h-6 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t("inventoryPage.stockValue")}
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(stats.totalStockValue || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <svg
                className="w-6 h-6 text-purple-600 dark:text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t("inventoryPage.costValue")}
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(stats.totalCost || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <svg
                className="w-6 h-6 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.966-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('inventoryPage.lowStockItems')}
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.lowStockCount || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("inventoryPage.searchProducts")}
            </label>
            <TooltipProvider>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  {/* Dynamic icon based on search mode */}
                  {isIdMode ? (
                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-amber-600 dark:text-amber-400 pointer-events-none" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  )}
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t("inventoryPage.searchPlaceholder", "Rechercher par nom ou @ID...")}
                    className={`w-full pl-10 pr-20 py-2 border rounded-md shadow-sm focus:outline-none transition-all duration-200 dark:text-white ${
                      isIdMode
                        ? "border-amber-300 focus:ring-amber-400 focus:border-amber-400 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700"
                        : "border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700"
                    }`}
                  />
                  {/* ID mode indicator badge */}
                  {isIdMode && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                      ID: {searchParsed.value || "..."}
                    </div>
                  )}
                </div>

                {/* Help Tooltip */}
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2 p-1">
                      <p className="font-semibold">{t('search.helpTitle', 'Astuce de recherche')}</p>
                      <div className="space-y-1 text-xs">
                        <p>
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">@123</span>
                          {' '}{t('search.helpIdSearch', '→ Rechercher par ID produit')}
                        </p>
                        <p>
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">texte</span>
                          {' '}{t('search.helpTextSearch', '→ Rechercher par nom')}
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category
            </label>
            <select
              key={stats.id}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t("inventoryPage.allCategories")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.category}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-start h-1/2">
              <input
                type="checkbox"
                checked={showLowStock}
                onChange={(e) => setShowLowStock(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                {t('inventoryPage.showLowStock')}
              </span>
            </label>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("");
                setShowLowStock(false);
              }}
              className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md transition-colors duration-200"
            >
               {t('inventoryPage.clearFilters')}
            </button>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
            <thead className="bg-gray-50 dark:bg-gray-700 ">
              <tr>
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                   {t('inventoryPage.image')}
                </th>
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Product
                </th>
                {/* <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    SKU/Barcode
                                </th> */}
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                   {t('inventoryPage.category')}
                </th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[120px]">
                 {t('inventoryPage.price')}
                </th>
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                {t('inventoryPage.stock')}
                </th>
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                 {t('inventoryPage.supplier')}
                </th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                 {t('inventoryPage.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white text-left dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      <img
                        className="rounded-md h-14 bg-white w-14"
                        src={
                          product.image_url
                            ? product.image_url
                            : "./placeholder.png"
                        }
                        alt={product.name}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {product.name}
                      </div>

                      {product.description && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {product.description}
                        </div>
                      )}
                    </div>
                  </td>
                  {/* <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900 dark:text-white">
                                            {
                                            product.sku && <div>SKU: {
                                                product.sku
                                            }</div>
                                        }
                                            {
                                            product.barcode && <div className="text-gray-500">BC: {
                                                product.barcode
                                            }</div>
                                        } </div>
                                    </td> */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {product.category_name}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right min-w-[120px]">
                    <div className="font-medium">
                      {formatCurrency(product.selling_price)}
                    </div>
                    {product.cost && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Cost: {formatCurrency(product.cost)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStockStatusColor(product)}`}
                    >
                      {product.remaining_stock}
                      {product.unit}
                    </span>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Min: {product.min_stock_level}
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {product.supplier_name || t("inventoryPage.noSupplier")}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                    <div className=" flex gap-2 justify-center items-center">
                      <Button
                        className="text-purple-700 hover:bg-purple-100 hover:text-purple-800 border border-gray-300 dark:border dark:border-gray-700"
                        variant="outline"
                        size="sm"
                        onClick={() => setPriceHistoryProduct(product)}
                        title={t("priceHistory.title", "Price History")}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        className="text-blue-700 hover:bg-blue-100  hover:text-blue-800  border border-gray-300 dark:border dark:border-gray-700"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditProduct(product)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        key={product.id}
                        className="text-[#D32F2F] hover:bg-red-50  hover:text-red-700  border border-gray-300 dark:border dark:border-gray-700"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        <Trash2 className="h-10 w-10" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {products.length === 0 && !loading && (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              No products found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm || categoryFilter || showLowStock
                ? "Try adjusting your filters"
                : "Get started by adding your first product"}
            </p>
          </div>
        )}{" "}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Product Form Modal */}
      {showAddForm && (
        <ProductForm
          product={editingProduct}
          onSave={handleSaveProduct}
          onCancel={handleCancelForm}
          suppliers={[]}
          categories={categories}
        />
      )}

      {/* Price History Modal */}
      {priceHistoryProduct && (
        <PriceHistory
          productId={priceHistoryProduct.id}
          productName={priceHistoryProduct.name}
          isVisible={!!priceHistoryProduct}
          onClose={() => setPriceHistoryProduct(null)}
        />
      )}
    </div>
  );
};

export default Inventory;
