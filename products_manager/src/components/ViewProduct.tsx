import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDebounce } from "@/hooks/useDebounce";
import { QRCodeSVG } from 'qrcode.react';
import {
  Package,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ArrowLeft,
  ShoppingCart,
  Barcode,
  Calendar,
  Tag,
  Eye,
  Star,
  Zap,
  Shield,
  Edit,
  Search,
  X,
  Bell,
  History,
  Plus,
  Minus,
  Copy,
  Download,
  BarChart3,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Product, Category } from "@/types";
import { Navbar } from "./Navbar";
import { Button } from "./ui/button";
import { useNavigate } from "react-router-dom";
import { SearchBar } from "./SearchBar";
import { api } from "@/services/api";
import { toast } from "sonner";
import { CategoryFilter } from "./CategoryFilter";
import { PriceHistory } from "./PriceHistory";
import { ProductQRCode } from "./QRCodeComponent";

interface ViewProductProps {
  product: Product;
  categories: Category[];
  onEdit?: () => void;
}

interface ProductCardProps {
  product: Product;
  categories: Category[];
  onView: () => void;
}

// Add new interfaces for enhanced features
interface StockMovement {
  id: number;
  product_id: number;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reason: string;
  date: string;
}

interface PriceHistory {
  date: string;
  selling_price: number;
  purchase_price: number;
}

// Add Stock Movement History component
function StockMovementHistory({ productId, isVisible, onClose }: {
  productId: number;
  isVisible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isVisible && productId) {
      fetchStockMovements();
    }
  }, [isVisible, productId]);

  const fetchStockMovements = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/movements`);
      if (!response.ok) {
        throw new Error('Failed to fetch stock movements');
      }
      const data = await response.json();
      setMovements(data);
    } catch (error) {
      console.error('Error fetching stock movements:', error);
      toast.error(t('product.failedToLoadMovements'));
      setMovements([]); // Set empty array if fetch fails
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'in': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'out': return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'adjustment': return <BarChart3 className="h-4 w-4 text-blue-600" />;
      default: return <History className="h-4 w-4 text-gray-600" />;
    }
  };

  const getMovementColor = (type: string, quantity: number) => {
    if (quantity > 0) return 'text-green-600';
    if (quantity < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('product.stockMovementHistory')}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="text-sm text-gray-500 mt-2">{t('product.loadingMovements')}</p>
            </div>
          ) : movements.length > 0 ? (
            movements.map((movement) => (
              <div key={movement.id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex-shrink-0">
                  {getMovementIcon(movement.movement_type)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium capitalize">{movement.movement_type.replace('_', ' ')}</p>
                    <span className={`font-bold ${getMovementColor(movement.movement_type, movement.quantity)}`}>
                      {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{movement.reason}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(movement.date).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">{t('product.noStockMovements')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add Quantity Selector component
function QuantitySelector({
  quantity,
  onQuantityChange,
  maxQuantity,
  label = "Quantity"
}: {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  maxQuantity: number;
  label?: string;
}) {
  const { t } = useTranslation();
  const handleDecrease = () => {
    if (quantity > 1) {
      onQuantityChange(quantity - 1);
    }
  };

  const handleIncrease = () => {
    if (quantity < maxQuantity) {
      onQuantityChange(quantity + 1);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDecrease}
          disabled={quantity <= 1}
          className="w-8 h-8 p-0"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <div className="flex-1 text-center">
          <input
            type="number"
            min="1"
            max={maxQuantity}
            value={quantity}
            onChange={(e) => {
              const newQuantity = Math.max(1, Math.min(maxQuantity, Number.parseInt(e.target.value) || 1));
              onQuantityChange(newQuantity);
            }}
            className="w-full text-center border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleIncrease}
          disabled={quantity >= maxQuantity}
          className="w-8 h-8 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-gray-500">{t('product.maxAvailable', { count: maxQuantity })}</p>
    </div>
  );
}

function ProductCard({ product, categories, onView }: ProductCardProps) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);

  const getCategoryName = (categoryId: number) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || t("categories.none");
  };

  const getStockStatus = (stock: number, minLevel: number) => {
    if (stock === 0) {
      return {
        label: t("status.outOfStock"),
        variant: "destructive" as const,
        color: "text-red-500",
      };
    }
    if (stock <= minLevel) {
      return {
        label: t("status.lowStock"),
        variant: "secondary" as const,
        color: "text-amber-500",
      };
    }
    return {
      label: t("status.inStock"),
      variant: "default" as const,
      color: "text-emerald-500",
    };
  };

  const stockStatus = getStockStatus(
    product.remaining_stock || 0,
    product.min_stock_level || 0
  );

  return (
    <Card
      className="group cursor-pointer border-0 shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
      onClick={onView}
    >
      <CardContent className="p-0">
        <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 overflow-hidden rounded-t-lg">
          {product.image_url && !imageError ? (
            <img
              src={product.image_url.startsWith('http') ? product.image_url : `../../${product.image_url}`}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
              <Package className="h-12 w-12 mb-2" />
              <span className="text-sm">{t('product.noImage')}</span>
            </div>
          )}

          <div className="absolute top-2 right-2">
            <Badge variant={stockStatus.variant} className="text-xs">
              {stockStatus.label}
            </Badge>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
              {product.name}
            </h3>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {getCategoryName(product.category_id)}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-emerald-600">
                {product.selling_price} {t("currency")}
              </p>
              <p className="text-sm text-gray-500">
                {t('ui.stock')} {product.remaining_stock || 0}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SearchDropdownProps {
  products: Product[];
  categories: Category[];
  isLoading: boolean;
  searchTerm: string;
  onProductSelect: (productId: number) => void;
  containerRef: HTMLDivElement | null;
}

function SearchDropdown({
  products,
  categories,
  isLoading,
  searchTerm,
  onProductSelect,
  containerRef
}: SearchDropdownProps) {
  const { t } = useTranslation();

  const getCategoryName = (categoryId: number) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || t("categories.none");
  };

  const getStockStatus = (stock: number, minLevel: number) => {
    if (stock === 0) return { color: "text-red-500", label: t("status.outOfStock") };
    if (stock <= minLevel) return { color: "text-amber-500", label: t("status.lowStock") };
    return { color: "text-emerald-500", label: t("status.inStock") };
  };

  const highlightText = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase() ?
        <mark key={`highlight-${i}-${part}`} className="bg-blue-200 dark:bg-blue-800">{part}</mark> : part
    );
  };

  const containerWidth = containerRef?.offsetWidth || 320;

  return (
    <div
      className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-[32rem] overflow-y-auto"
      style={{ width: Math.max(containerWidth, 400), minWidth: '400px' }}
    >
      {isLoading ? (
        <div className="p-4 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
          <p className="text-sm text-gray-500 mt-2">{t('messages.searching')}</p>
        </div>
      ) : products.length > 0 ? (
        <div className="py-2">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            {products.length} {t('products.found')}
          </div>
          {products.map((product, index) => {
            const stockStatus = getStockStatus(
              product.remaining_stock || 0,
              product.min_stock_level || 0
            );
            return (
              <div
                key={product.id}
                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-50 dark:border-gray-700 last:border-b-0"
                onClick={() => onProductSelect(product.id)}
              >
                {/* Product Image */}
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden flex-shrink-0">
                  {product.image_url ? (
                    <img
                      src={product.image_url.startsWith('http') ? product.image_url : `/backend/${product.image_url}`}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {highlightText(product.name, searchTerm)}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {getCategoryName(product.category_id)}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className={`text-xs font-medium ${stockStatus.color}`}>
                      {product.remaining_stock || 0} {t('product.inStock')}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {product.selling_price} {t("currency")}
                  </p>
                  {product.purchase_price && (
                    <p className="text-xs text-gray-500">
                      Cost: {product.purchase_price}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <div className="flex-shrink-0">
                  <ArrowLeft className="h-4 w-4 text-gray-400 rotate-180" />
                </div>
              </div>
            );
          })}

          {products.length === 10 && (
            <div className="px-3 py-2 text-center border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('messages.showingFirst10Results')}
              </p>
            </div>
          )}
        </div>
      ) : searchTerm ? (
        <div className="p-4 text-center">
          <Package className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('products.noResultsFor')} "{searchTerm}"
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {t('products.tryDifferentKeywords')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ViewProduct({ product, categories: initialCategories, onEdit }: ViewProductProps) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>(initialCategories || []);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchInputRef, setSearchInputRef] = useState<HTMLDivElement | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  // const [showQRCode, setShowQRCode] = useState(false); // QR code functionality commented out
  const [showStockHistory, setShowStockHistory] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showPriceAlert, setShowPriceAlert] = useState(false);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Debounce search term for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    } else {
      // Navigate to edit page using correct routing pattern
      navigate(`/edit/product/${product.id}`);
      toast.success(t('messages.navigatingToEdit', 'Navigating to edit product...'));
    }
  };

  const handleProductNavigation = (productId: number) => {
    // Navigate to the new product view using React Router
    navigate(`/view/product/${productId}`);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'k') {
        event.preventDefault();
        // Expand search and focus
        setIsSearchExpanded(true);
        setTimeout(() => {
          searchRef.current?.focus();
          setShowSearchDropdown(searchTerm.length > 0);
        }, 100);
      }
      if (event.key === 'Escape' && !isSearchExpanded) {
        setSearchTerm("");
        setSelectedCategory("all");
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm, isSearchExpanded]);

  useEffect(() => {
    setImageError(false);
    setIsImageLoading(true);
  }, [product?.image_url]);

  // Share and favorite handlers - COMMENTED OUT (icons removed)
  /*
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: `Check out ${product.name} - ${product.selling_price} ${t("currency")}`,
          url: window.location.href,
        });
      } catch (error) {
        // Fallback to copy to clipboard
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Product link copied to clipboard!');
      }
    } else {
      // Fallback for browsers that don't support Web Share API
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Product link copied to clipboard!');
    }
  };

  const handleFavorite = () => {
    setIsFavorite(!isFavorite);
    toast.success(isFavorite ? 'Removed from favorites' : 'Added to favorites');
  };
  */

  const handleAddToCart = () => {
    // Implementation would depend on your cart system
    toast.success(`Added ${quantity} ${product.name}(s) to cart`);
  };

  const handlePriceAlert = () => {
    setShowPriceAlert(true);
    // Implementation for price alert setup
    toast.success('Price alert setup would be implemented here');
  };

  if (!product) {
    return null;
  }

  const getCategoryName = (categoryId: number) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || t("categories.none");
  };

  const getStockStatus = (stock: number, minLevel: number) => {
    if (stock === 0) {
      return {
        label: t("status.outOfStock"),
        variant: "destructive" as const,
        color: "text-red-500",
        bgColor: "bg-red-50 dark:bg-red-900/20",
        borderColor: "border-red-200 dark:border-red-800",
      };
    }
    if (stock <= minLevel) {
      return {
        label: t("status.lowStock"),
        variant: "secondary" as const,
        color: "text-amber-500",
        bgColor: "bg-amber-50 dark:bg-amber-900/20",
        borderColor: "border-amber-200 dark:border-amber-800",
      };
    }
    return {
      label: t("status.inStock"),
      variant: "default" as const,
      color: "text-emerald-500",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
      borderColor: "border-emerald-200 dark:border-emerald-800",
    };
  };

  const stockStatus = getStockStatus(
    product.remaining_stock || 0,
    product.min_stock_level || 0
  );

  const stockValue = (product.selling_price || 0) * (product.remaining_stock || 0);
  const profitMargin = product.purchase_price > 0
    ? (((product.selling_price - product.purchase_price) / product.purchase_price) * 100).toFixed(1)
    : "0";

  const fetchProducts = useCallback(async () => {
    if (debouncedSearchTerm !== searchTerm) return; // Avoid race conditions

    setIsSearching(true);
    try {
      const response = await api.getProducts(debouncedSearchTerm);
      if (response.success) {
        setProducts(response.products);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error(t("messages.errorLoading"));
    } finally {
      setIsSearching(false);
    }
  }, [debouncedSearchTerm, searchTerm, t]);

  // Filter products based on search term and selected category with improved partial matching
  const filteredProducts = products.filter((p) => {
    let matchesSearch = searchTerm === "";

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase().trim();
      const searchTerms = searchLower.split(/\s+/);

      // Check if all search terms are found in any of the product fields
      matchesSearch = searchTerms.every(term =>
        String(p.id).includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term) ||
        p.sku?.toLowerCase().includes(term) ||
        p.barcode?.toLowerCase().includes(term) ||
        p.brand?.toLowerCase().includes(term)
      );
    }

    const matchesCategory = selectedCategory === "all" ||
      p.category_id.toString() === selectedCategory;

    // Exclude the current product from related products
    const isNotCurrentProduct = p.id !== product.id;

    return matchesSearch && matchesCategory && isNotCurrentProduct;
  });

  // Get related products from the same category
  const relatedProducts = products.filter((p) =>
    p.category_id === product.category_id && p.id !== product.id
  ).slice(0, 4);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await api.getCategories();
      if (response.success) {
        setCategories(response.categories);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error(t("messages.errorLoading"));
    }
  }, [t]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (debouncedSearchTerm || selectedCategory !== "all") {
      fetchProducts();
    }
  }, [debouncedSearchTerm, selectedCategory, fetchProducts]);

  // Initial load of products for related products
  useEffect(() => {
    const initialFetch = async () => {
      try {
        const response = await api.getProducts("");
        if (response.success) {
          setProducts(response.products);
        }
      } catch (error) {
        console.error("Error fetching initial products:", error);
      }
    };
    initialFetch();
  }, []);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20">
        {/* Header Section */}
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-blue-100 dark:border-blue-800/50 sticky top-0 z-10">
          <div className="container mx-auto px-6 py-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 shadow-sm"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("actions.goBack")}
                </Button>

                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                         {product.name}
                  </span>
               </div>
              </div>
              <div className="flex gap-3 w-full lg:w-auto">
                {/* Expandable Search */}
                <div className="relative" ref={setSearchInputRef}>
                  <div className={`flex items-center transition-all duration-300 ease-in-out ${
                    isSearchExpanded
                      ? 'w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg'
                      : 'w-10 h-10'
                  }`}>
                    {!isSearchExpanded ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsSearchExpanded(true);
                          setTimeout(() => searchRef.current?.focus(), 100);
                        }}
                        className="w-10 h-10 p-0 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 shadow-sm"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex items-center w-full px-3 py-2">
                        <Search className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                        <input
                          ref={searchRef}
                          type="text"
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setShowSearchDropdown(e.target.value.length > 0);
                          }}
                          onFocus={() => setShowSearchDropdown(searchTerm.length > 0)}
                          onBlur={() => {
                            // Delay hiding to allow clicks on dropdown items
                            setTimeout(() => {
                              setShowSearchDropdown(false);
                              if (!searchTerm) {
                                setIsSearchExpanded(false);
                              }
                            }, 200);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setSearchTerm("");
                              setShowSearchDropdown(false);
                              setIsSearchExpanded(false);
                              searchRef.current?.blur();
                            }
                          }}
                          placeholder={t('products.searchPlaceholder')}
                          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => {
                              setSearchTerm("");
                              setShowSearchDropdown(false);
                              searchRef.current?.focus();
                            }}
                            className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                          >
                            <X className="h-3 w-3 text-gray-400" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSearchTerm("");
                            setShowSearchDropdown(false);
                            setIsSearchExpanded(false);
                          }}
                          className="ml-1 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                        >
                          <ArrowLeft className="h-3 w-3 text-gray-400" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Search Dropdown */}
                  {showSearchDropdown && searchInputRef && isSearchExpanded && (
                    <SearchDropdown
                      products={filteredProducts.slice(0, 10)}
                      categories={categories}
                      isLoading={isSearching}
                      searchTerm={searchTerm}
                      onProductSelect={(productId) => {
                        setShowSearchDropdown(false);
                        setIsSearchExpanded(false);
                        setSearchTerm("");
                        handleProductNavigation(productId);
                      }}
                      containerRef={searchInputRef}
                    />
                  )}
                </div>
                <div className="w-48">
                  <CategoryFilter
                    categories={categories}
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                  />
                </div>
                {(searchTerm || selectedCategory !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedCategory("all");
                      setShowSearchDropdown(false);
                    }}
                    className="shrink-0"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-6 py-8">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Product Image Section */}
            <div className="space-y-6">
              <Card className="overflow-hidden border-0 shadow-2xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                    {product.image_url && !imageError ? (
                      <>
                        {isImageLoading && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
                          </div>
                        )}
                        <img
                          src={product.image_url.startsWith('http') ? product.image_url : `../../${product.image_url}`}
                          alt={product.name}
                          className="w-full h-full object-cover transition-opacity duration-300"
                          style={{ opacity: isImageLoading ? 0 : 1 }}
                          onLoad={() => setIsImageLoading(false)}
                          onError={() => {
                            setImageError(true);
                            setIsImageLoading(false);
                          }}
                        />
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                        <Package className="h-24 w-24 mb-4" />
                        <span className="text-lg font-medium">No Image Available</span>
                      </div>
                    )}

                    {/* Stock Status Badge */}
                    <div className="absolute bottom-4 left-4">
                      <Badge
                        variant={stockStatus.variant}
                        className={`${stockStatus.bgColor} ${stockStatus.borderColor} ${stockStatus.color} border shadow-lg text-sm px-3 py-1`}
                      >
                        {stockStatus.label}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Product Information Section */}
            <div className="space-y-3">
              {/* Product Header */}
              <Card className="border-0 shadow-xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        {product.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-blue-500" />
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          {getCategoryName(product.category_id)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center flex-col justify-self  gap-3 mt-5">
                      <Button
                        onClick={() => setShowPriceHistory(true)}
                        className=" bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                        size="sm"
                      >
                        <History className="h-4 w-4 mr-2" />
                        {t('product.priceHistory', 'Price History')}
                      </Button>
                      <Button
                        onClick={handleEdit}
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                        size="sm"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        {t('products.edit')}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Pricing Cards - Click to view price history */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card
                  className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white cursor-pointer hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 hover:scale-[1.02]"
                  onClick={() => setShowPriceHistory(true)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-emerald-100 text-sm font-medium flex items-center gap-1">
                          {t('product.sellingPrice', 'Selling Price')}
                          <History className="h-3 w-3" />
                        </p>
                        <p className="text-2xl font-bold">{product.selling_price} {t("currency")}</p>
                      </div>
                      <DollarSign className="h-8 w-8 text-emerald-200" />
                    </div>
                    <p className="text-xs text-emerald-200 mt-2">{t('product.clickToViewPriceHistory', 'Click to view price history')}</p>
                  </CardContent>
                </Card>

                <Card
                  className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-all duration-200 hover:scale-[1.02]"
                  onClick={() => setShowPriceHistory(true)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-blue-100 text-sm font-medium flex items-center gap-1">
                          {t('product.purchasePrice', 'Purchase Price')}
                          <History className="h-3 w-3" />
                        </p>
                        <p className="text-2xl font-bold">{product.purchase_price} {t("currency")}</p>
                      </div>
                      <ShoppingCart className="h-8 w-8 text-blue-200" />
                    </div>
                    <p className="text-xs text-blue-200 mt-2">{t('product.clickToViewPriceHistory', 'Click to view price history')}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="border-0 shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                        <TrendingUp className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('product.stockValue')} </p>
                        <p className="text-xl font-bold text-purple-600">{stockValue.toFixed(2)} {t("currency")}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30">
                        <Zap className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('product.profitMargin')}</p>
                        <p className="text-xl font-bold text-orange-600">{profitMargin}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full ${stockStatus.bgColor}`}>
                        <Package className={`h-6 w-6 ${stockStatus.color}`} />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('product.currentStock')}</p>
                        <div className="flex items-center gap-2">
                          <p className={`text-xl font-bold ${stockStatus.color}`}>
                            {product.remaining_stock || 0}
                          </p>
                          {(product.remaining_stock || 0) <= (product.min_stock_level || 0) && (
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0  shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
                        <Shield className="h-6 w-6 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('product.minStockLevel')}</p>
                        <p className="text-xl font-bold text-red-600">{product.min_stock_level || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              {/* Product Metadata */}
              <Card className="border-0 shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm relative">
                <CardHeader className="flex flex-row items-start justify-between ">
                  <CardTitle className="text-lg text-gray-700 dark:text-gray-300">{t('product.productInfo')}</CardTitle>
                  <QRCodeSVG
                    className={`ounded-sm  mt-0 absolute bg-white p-1 ${document.documentElement.lang==='ar'? 'top-0 left-0 ': 'top-0 right-0'}`}
                   value={`Id de Produit: ${product.id}\nNom de Produit: ${product.name}\nPrix de Vente: ${product.selling_price}\nStock Actuel: ${product.remaining_stock}
                           `}
                    size={140}
                    level="M"
/>
                </CardHeader>
                <CardContent className="space-y-4 flex justify-between items-start">
                  <div className="">

                      <div className="flex items-center gap-3">
                    <Barcode className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-500">{t('product.productId')}:</span>
                    <span className="font-medium">#{product.id}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-500">{t('product.created')}</span>
                    <span className="font-medium">
                      {product.created_at ? new Date(product.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-500">{t('product.lastUpdated')}</span>
                    <span className="font-medium">
                      {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  {product.description && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {product.description}
                      </p>
                    </div>
                  )}
                  </div>
                  <div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Related Products Section - Only show when not searching */}
          {relatedProducts.length > 0 && !searchTerm && selectedCategory === "all" && (
            <div className="mt-12 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                  {t('products.relatedProducts')}
                </h2>
                <Badge variant="outline" className="text-sm">
                  {getCategoryName(product.category_id)}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {relatedProducts.map((relatedProduct) => (
                  <ProductCard
                    key={relatedProduct.id}
                    product={relatedProduct}
                    categories={categories}
                    onView={() => handleProductNavigation(relatedProduct.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}



      <StockMovementHistory
        productId={product.id}
        isVisible={showStockHistory}
        onClose={() => setShowStockHistory(false)}
      />

      {/* Price History Modal */}
      <PriceHistory
        productId={product.id}
        isVisible={showPriceHistory}
        onClose={() => setShowPriceHistory(false)}
      />
    </>
  );
}
