import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  Edit2,
  Package,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import inventoryService from "../services/inventoryIntegration.js";

const API_BASE_URL = "http://localhost:3001/api";

// Allow searching by product ID: "@12" / "12" are valid even with a single digit,
// while free-text searches still require at least 2 characters.
const isSearchableQuery = (input) => {
  let value = (input || "").trim();
  if (value.startsWith("@")) {
    value = value.slice(1).trim();
  }
  if (!value) return false;
  return value.length >= 2 || /^\d+$/.test(value);
};

const CustomerWishlist = () => {
  const { t } = useTranslation();
  const { customerId } = useParams();
  const navigate = useNavigate();

  // State management
  const [customer, setCustomer] = useState(null);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Product search autocomplete state
  const [searchQuery, setSearchQuery] = useState("");
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Form state for adding/editing items
  const [formData, setFormData] = useState({
    product_name: "",
    quantity: 1,
    unit_price: "",
    status: "pending",
    priority: "medium",
    notes: "",
  });

  // Fetch customer details
  const fetchCustomer = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${customerId}`);
      if (!response.ok) throw new Error("Failed to fetch customer");
      const data = await response.json();
      setCustomer(data);
    } catch (error) {
      console.error("Error fetching customer:", error);
      toast.error(t("customers.error.fetch"));
      navigate("/customers");
    }
  }, [customerId, navigate, t]);

  // Fetch wishlist items
  const fetchWishlist = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/customers/${customerId}/wishlist`,
      );
      if (!response.ok) throw new Error("Failed to fetch wishlist");
      const data = await response.json();
      setWishlistItems(data);
    } catch (error) {
      console.error("Error fetching wishlist:", error);
      setWishlistItems([]);
      toast.error(t("wishlist.error.fetch"));
    }
  }, [customerId, t]);

  // Fetch wishlist statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/customers/${customerId}/wishlist/stats`,
      );
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
      setStats(null);
    }
  }, [customerId]);

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCustomer(), fetchWishlist(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchCustomer, fetchWishlist, fetchStats]);

  // Search products from inventory
  const searchProducts = async (query) => {
    if (!isSearchableQuery(query)) {
      setProductSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      const products = await inventoryService.searchProducts(query, 8);
      setProductSuggestions(products);
      setShowSuggestions(products.length > 0);
    } catch (error) {
      console.error("Error searching products:", error);
      setProductSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input change with debouncing
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setFormData({
      ...formData,
      product_name: query,
    });

    // Clear selected product if user types manually
    if (selectedProduct && query !== (selectedProduct.displayName || selectedProduct.name)) {
      setSelectedProduct(null);
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer for debounced search (300ms delay)
    debounceTimerRef.current = setTimeout(() => {
      searchProducts(query);
    }, 300);
  };

  // Clear search and reset form
  const handleClearSearch = () => {
    setSearchQuery("");
    setFormData({
      ...formData,
      product_name: "",
      unit_price: "",
    });
    setSelectedProduct(null);
    setProductSuggestions([]);
    setShowSuggestions(false);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Handle product selection from suggestions
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setSearchQuery(product.displayName || product.name);
    setFormData({
      ...formData,
      product_name: product.displayName || product.name,
      unit_price: product.selling_price || product.price || "",
    });
    setShowSuggestions(false);
    toast.success("Produit sélectionné depuis l'inventaire");
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Reset search when form is closed
  useEffect(() => {
    if (!showAddForm) {
      setSearchQuery("");
      setProductSuggestions([]);
      setShowSuggestions(false);
      setSelectedProduct(null);
    }
  }, [showAddForm]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Add item to wishlist
  const handleAddItem = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/customers/${customerId}/wishlist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        },
      );

      if (!response.ok) throw new Error("Failed to add item");

      toast.success(t("wishlist.success.add"));
      setShowAddForm(false);
      setSearchQuery("");
      setSelectedProduct(null);
      setFormData({
        product_name: "",
        quantity: 1,
        unit_price: "",
        status: "pending",
        priority: "medium",
        notes: "",
      });
      await Promise.all([fetchWishlist(), fetchStats()]);
    } catch (error) {
      console.error("Error adding item:", error);
      toast.error(t("wishlist.error.add"));
    } finally {
      setSubmitting(false);
    }
  };

  // Update wishlist item
  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    setSubmitting(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/wishlist/${editingItem.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        },
      );

      if (!response.ok) throw new Error("Failed to update item");

      toast.success(t("wishlist.success.update"));
      setEditingItem(null);
      setShowAddForm(false);
      setSearchQuery("");
      setSelectedProduct(null);
      await Promise.all([fetchWishlist(), fetchStats()]);
    } catch (error) {
      console.error("Error updating item:", error);
      toast.error(t("wishlist.error.update"));
    } finally {
      setSubmitting(false);
    }
  };

  // Delete wishlist item
  const handleDeleteItem = async (itemId) => {
    if (!window.confirm(t("wishlist.confirm.delete"))) return;

    try {
      const response = await fetch(`${API_BASE_URL}/wishlist/${itemId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete item");

      toast.success(t("wishlist.success.delete"));
      await Promise.all([fetchWishlist(), fetchStats()]);
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error(t("wishlist.error.delete"));
    }
  };

  // Convert wishlist to sale
  const handleConvertToSale = async () => {
    const confirmedItems = wishlistItems.filter(
      (item) => item.status === "confirmed",
    );
    if (confirmedItems.length === 0) {
      toast.error(t("wishlist.error.noConfirmedItems"));
      return;
    }

    if (!window.confirm(t("wishlist.confirm.convert"))) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/customers/${customerId}/wishlist/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wishlistIds: confirmedItems.map((item) => item.id),
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to convert wishlist");

      const result = await response.json();
      toast.success(
        t("wishlist.success.convert", { count: result.convertedItems }),
      );
      await Promise.all([fetchWishlist(), fetchStats()]);
    } catch (error) {
      console.error("Error converting wishlist:", error);
      toast.error(t("wishlist.error.convert"));
    }
  };

  // Edit item handler
  const handleEditItem = (item) => {
    setEditingItem(item);
    setSearchQuery(item.product_name);
    setFormData({
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      status: item.status,
      priority: item.priority,
      notes: item.notes || "",
    });
    setShowAddForm(true);
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingItem(null);
    setShowAddForm(false);
    setFormData({
      product_name: "",
      quantity: 1,
      unit_price: "",
      status: "pending",
      priority: "medium",
      notes: "",
    });
  };

  // Status badge component
  const StatusBadge = ({ status }) => {
    const statusConfig = {
      pending: {
        color:
          "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
        icon: Clock,
      },
      confirmed: {
        color:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
        icon: CheckCircle,
      },
      cancelled: {
        color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        icon: XCircle,
      },
      converted: {
        color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        icon: TrendingUp,
      },
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${config.color}`}
      >
        <Icon size={14} />
        {t(`wishlist.status.${status}`)}
      </span>
    );
  };

  // Priority badge component
  const PriorityBadge = ({ priority }) => {
    const priorityConfig = {
      urgent: {
        color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      },
      high: {
        color:
          "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      },
      medium: {
        color:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      },
      low: {
        color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      },
    };

    const config = priorityConfig[priority] || priorityConfig.medium;

    return (
      <span
        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${config.color}`}
      >
        {t(`wishlist.priority.${priority}`)}
      </span>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-cyan-200 dark:border-cyan-900" />
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-cyan-600 absolute top-0 left-0" />
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">
          {t("common.loading")}
        </p>
      </div>
    );
  }

  // No customer found
  if (!customer) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t("customers.notFound")}
        </h2>
        <button
          onClick={() => navigate("/customers")}
          className="mt-4 px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 dark:from-cyan-700 dark:to-cyan-800 p-6 rounded-lg shadow-sm">
        <button
          onClick={() => navigate(`/customers/${customerId}`)}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-4 transition-colors text-sm"
        >
          <ArrowLeft size={18} />
          {t("common.back")}
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center text-xl font-bold text-white">
              {customer.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <ShoppingCart size={24} />
                {t("wishlist.title")}
              </h1>
              <p className="text-white/80 text-sm mt-0.5">{customer.name}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditingItem(null);
                setShowAddForm(!showAddForm);
              }}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                showAddForm
                  ? 'bg-white/20 text-white hover:bg-white/30'
                  : 'bg-white text-cyan-600 hover:bg-cyan-50'
              }`}
            >
              {showAddForm ? <X size={18} /> : <Plus size={18} />}
              <span>{showAddForm ? t("common.cancel") : t("wishlist.addItem")}</span>
            </button>

            {wishlistItems.filter((i) => i.status === "confirmed").length > 0 && (
              <button
                onClick={handleConvertToSale}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <TrendingUp size={18} />
                <span>{t("wishlist.convertToSale")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("wishlist.stats.totalItems")}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {stats.total_items || 0}
                </p>
              </div>
              <Package className="text-cyan-600 dark:text-cyan-400" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("wishlist.stats.pendingItems")}
                </p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {stats.pending_items || 0}
                </p>
              </div>
              <Clock className="text-amber-600 dark:text-amber-400" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("wishlist.stats.confirmedItems")}
                </p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {stats.confirmed_items || 0}
                </p>
              </div>
              <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("wishlist.stats.totalValue")}
                </p>
                <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">
                  {Number(stats.total_value || 0).toLocaleString()} MAD
                </p>
              </div>
              <DollarSign className="text-cyan-600 dark:text-cyan-400" size={32} />
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center">
                  <Plus className="text-cyan-600 dark:text-cyan-400" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {editingItem ? t("wishlist.editItem") : t("wishlist.addItem")}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {editingItem ? "Modifier les détails du produit" : "Ajouter un nouveau produit à la liste"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <form
              onSubmit={editingItem ? handleUpdateItem : handleAddItem}
              className="space-y-4"
            >
              {/* Product Name - Full Width with Autocomplete */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                  <Package size={14} className="text-cyan-600 dark:text-cyan-400" />
                  {t("wishlist.form.productName")}
                  <span className="text-red-500">*</span>
                  {isSearching && (
                    <div className="w-3 h-3 border-2 border-cyan-600/30 border-t-cyan-600 rounded-full animate-spin" />
                  )}
                </label>
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    required
                    value={searchQuery || formData.product_name}
                    onChange={handleSearchChange}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    placeholder={t("inventory.searchProductPlaceholder")}
                  />
                  {searchQuery || formData.product_name ? (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  ) : (
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
                  )}
                </div>

                {/* Product Suggestions Dropdown */}
                {showSuggestions && productSuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto"
                  >
                    <div className="p-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1">
                        <Package size={12} />
                        {productSuggestions.length} produit{productSuggestions.length > 1 ? 's' : ''} trouvé{productSuggestions.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    {productSuggestions.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono text-gray-700 dark:text-gray-200">
                                #{product.id}
                              </span>
                              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {product.displayName || product.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                {product.category}
                              </span>
                              {product.stock_quantity !== undefined && (
                                <span className={`px-1.5 py-0.5 rounded ${
                                  product.stock_quantity > 10
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                    : product.stock_quantity > 0
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                }`}>
                                  Stock: {product.stock_quantity}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-cyan-600 dark:text-cyan-400 text-sm">
                              {product.selling_price || product.price} MAD
                            </p>
                            {product.image_url && (
                              <img
                                className="h-10 w-10 rounded object-cover border border-gray-200 dark:border-gray-600"
                                src={product.image_url}
                                alt={product.name}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Product Info */}
                {selectedProduct && (
                  <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">
                        Produit sélectionné de l'inventaire
                      </span>
                    </div>
                    {selectedProduct.stock_quantity !== undefined && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 ml-5">
                        Stock disponible: {selectedProduct.stock_quantity} unités
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Quantity and Price - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <TrendingUp size={14} className="text-cyan-600 dark:text-cyan-400" />
                    {t("wishlist.form.quantity")}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.quantity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantity: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-colors"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs">
                      unités
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <DollarSign size={14} className="text-cyan-600 dark:text-cyan-400" />
                    {t("wishlist.form.unitPrice")}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={formData.unit_price}
                      onChange={(e) =>
                        setFormData({ ...formData, unit_price: e.target.value })
                      }
                      className="w-full px-3 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-colors"
                      placeholder="0.00"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 text-xs font-medium">
                      MAD
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Price Preview */}
              {formData.quantity > 0 && formData.unit_price > 0 && (
                <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Total estimé:
                    </span>
                    <span className="text-xl font-bold text-cyan-600 dark:text-cyan-400">
                      {(formData.quantity * Number.parseFloat(formData.unit_price || 0)).toFixed(2)} MAD
                    </span>
                  </div>
                </div>
              )}

              {/* Status and Priority */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <CheckCircle size={14} className="text-cyan-600 dark:text-cyan-400" />
                    {t("wishlist.form.status")}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-colors cursor-pointer"
                  >
                    <option value="pending">
                      {t("wishlist.status.pending")}
                    </option>
                    <option value="confirmed">
                      {t("wishlist.status.confirmed")}
                    </option>
                    <option value="cancelled">
                      {t("wishlist.status.cancelled")}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <AlertCircle size={14} className="text-cyan-600 dark:text-cyan-400" />
                    {t("wishlist.form.priority")}
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-colors cursor-pointer"
                  >
                    <option value="low">{t("wishlist.priority.low")}</option>
                    <option value="medium">
                      {t("wishlist.priority.medium")}
                    </option>
                    <option value="high">{t("wishlist.priority.high")}</option>
                    <option value="urgent">
                      {t("wishlist.priority.urgent")}
                    </option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                  <Edit2 size={14} className="text-cyan-600 dark:text-cyan-400" />
                  {t("wishlist.form.notes")}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-colors resize-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  placeholder={t("wishlist.form.notesPlaceholder")}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t("common.saving")}
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {editingItem ? t("common.update") : t("common.add")}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wishlist Items */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {t("wishlist.items")} ({wishlistItems.length})
          </h3>
        </div>

        {wishlistItems.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t("wishlist.empty.title")}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
              {t("wishlist.empty.description")}
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
            >
              {t("wishlist.addFirstItem")}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("wishlist.table.product")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("wishlist.table.quantity")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("wishlist.table.unitPrice")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("wishlist.table.totalPrice")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("wishlist.table.priority")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("wishlist.table.status")}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("wishlist.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {wishlistItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.product_name}
                      </div>
                      {item.notes && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {item.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {Number(item.unit_price).toLocaleString()} MAD
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {Number(item.total_price).toLocaleString()} MAD
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title={t("common.edit")}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title={t("common.delete")}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerWishlist;
