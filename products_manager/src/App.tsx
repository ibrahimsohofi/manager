import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Package, TrendingUp, AlertTriangle, ArrowLeft, Edit, Download, CheckSquare, Square, FileSpreadsheet, BarChart3, BarChart3Icon } from "lucide-react";
import * as XLSX from 'xlsx';
import { Navbar } from "./components/Navbar";
import { ProductTable } from "./components/ProductTable";
import { ProductForm } from "./components/ProductForm";
import { SearchBar, type SearchMode } from "./components/SearchBar";
import { CategoryFilter } from "./components/CategoryFilter";
import { ProductTableSkeleton } from "./components/ProductTableSkeleton";
import { StatsCardsSkeleton } from "./components/StatsCardsSkeleton";
import { PageLoading } from "./components/ui/Spinner";
import { Pagination } from "./components/ui/Pagination";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Toaster, toast } from "sonner";
import type { Product, Category } from "./types";
import { Route, Routes, useParams, useNavigate } from "react-router-dom";
import { ViewProduct } from "./components/ViewProduct";
import { ProductNotFound } from "./components/ProductNotFound";
import { useDebounce } from "./hooks/useDebounce";
import { api } from "./services/api";

function ViewProductPage({
  categories,
}: {
  products: Product[];
  categories: Category[];
}) {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const productId = Number(id);

        if (isNaN(productId)) {
          setError("Invalid product ID");
          return;
        }

        const response = await api.getProductById(productId);

        if (response.success && response.product) {
          setProduct(response.product);
        } else {
          setError(response.error || "Product not found");
        }
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <PageLoading />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return <ProductNotFound productId={id} />;
  }

  return <ViewProduct product={product} categories={categories} />;
}

function Dashboard() {
  const { i18n, t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("text");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showStats,setShowStats]=useState(true);

  // Export functionality states
  const [isExportMode, setIsExportMode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Real data state for MySQL
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStockValue: 0,
    lowStockCount: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 50,
    hasNextPage: false,
    hasPrevPage: false
  });

  // Add page statistics calculation after all state declarations
  const pageStats = useMemo(() => {
    const pageProducts = products || [];
    const totalPageProducts = pageProducts.length;
    const totalPageStockValue = pageProducts.reduce((sum, product) => {
      return sum + (Number(product.selling_price) || 0) * (Number(product.remaining_stock) || 0);
    }, 0);
    const lowPageStockCount = pageProducts.filter(product =>
      (product.remaining_stock || 0) <= (product.min_stock_level || 0)
    ).length;

    return {
      totalPageProducts,
      totalPageStockValue,
      lowPageStockCount
    };
  }, [products]);

  // Initialize data from MySQL API
  useEffect(() => {
    const initializeData = async () => {
      try {
        setError(null);
        const [productsResult, categoriesResult, statsResult] = await Promise.all([
          api.getProducts("", "all", 1, 50),
          api.getCategories(),
          api.getStats()
        ]);

        if (productsResult.success) {
          setProducts(productsResult.products);
          if (productsResult.pagination) {
            setPagination(productsResult.pagination);
          }
        } else {
          throw new Error('Failed to fetch products');
        }

        if (categoriesResult.success) {
          setCategories(categoriesResult.categories);
        } else {
          throw new Error('Failed to fetch categories');
        }

        if (statsResult.success) {
          setStats({
            totalProducts: statsResult.stats.totalProducts,
            totalStockValue: statsResult.stats.totalStockValue,
            lowStockCount: statsResult.stats.lowStockCount
          });
        } else {
          throw new Error('Failed to fetch stats');
        }

        setIsInitialLoad(false);
      } catch (error) {
        console.error('Error initializing data:', error);
        setError(error instanceof Error ? error.message : t('toast.failedToConnectDatabase'));
        setIsInitialLoad(false);
      }
    };

    initializeData();
  }, []);

  // Debounce search term to avoid excessive API calls
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Fetch data when search, category, or page changes
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad) return;

      setIsLoading(true);
      try {
        // Handle ID search mode
        if (searchMode === 'id' && debouncedSearch) {
          const productId = parseInt(debouncedSearch);
          if (!isNaN(productId) && productId > 0) {
            const result = await api.getProductById(productId);
            if (result.success && result.product) {
              setProducts([result.product]);
              setPagination({
                currentPage: 1,
                totalPages: 1,
                totalItems: 1,
                itemsPerPage: 1,
                hasNextPage: false,
                hasPrevPage: false
              });
            } else {
              setProducts([]);
              setPagination({
                currentPage: 1,
                totalPages: 0,
                totalItems: 0,
                itemsPerPage: 50,
                hasNextPage: false,
                hasPrevPage: false
              });
              toast.error(t('products.notFoundById', 'Produit non trouvé avec cet ID'));
            }
          } else {
            // Empty search in ID mode - show all products
            const result = await api.getProducts('', selectedCategory, currentPage, 50);
            if (result.success) {
              setProducts(result.products);
              if (result.pagination) {
                setPagination(result.pagination);
              }
            }
          }
        } else {
          // Regular text search
          const result = await api.getProducts(debouncedSearch, selectedCategory, currentPage, 50);
          if (result.success) {
            setProducts(result.products);
            if (result.pagination) {
              setPagination(result.pagination);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to fetch products');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [debouncedSearch, selectedCategory, currentPage, isInitialLoad, searchMode, t]);

  // Reset to first page when search, category, or search mode changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedCategory, searchMode]);

  // Initialize RTL support based on current language
  useEffect(() => {
    const currentLang = i18n.language;
    document.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = currentLang;
    if (currentLang === "ar") {
      document.body.classList.add("rtl");
    } else {
      document.body.classList.remove("rtl");
    }
  }, [i18n.language]);

  // Refresh stats after product changes
  const refreshStats = async () => {
    try {
      const statsResult = await api.getStats();
      if (statsResult.success) {
        setStats({
          totalProducts: statsResult.stats.totalProducts,
          totalStockValue: statsResult.stats.totalStockValue,
          lowStockCount: statsResult.stats.lowStockCount
        });
      }
    } catch (error) {
      console.error('Error refreshing stats:', error);
    }
  };

  // Product management handlers
  const handleProductSave = async (
    productData: Omit<Product, "id" | "created_at" | "updated_at" | "category_name">
  ) => {
    try {
      let result;
      if (editingProduct) {
        const updatedProduct = { ...productData, id: editingProduct.id };
        result = await api.updateProduct(updatedProduct);
      } else {
        result = await api.createProduct(productData);
      }

      if (result.success) {
        // Refresh data after successful save
        const productsResult = await api.getProducts(debouncedSearch, selectedCategory, currentPage, 50);
        if (productsResult.success) {
          setProducts(productsResult.products);
          if (productsResult.pagination) {
            setPagination(productsResult.pagination);
          }
        }

        await refreshStats();
        setIsFormOpen(false);
        setEditingProduct(null);
        toast.success(editingProduct ? 'Product updated!' : 'Product added!');
      } else {
        toast.error(result.error || 'Failed to save product');
      }
    } catch (error) {
      console.error("Error saving product:", error);
      toast.error('Failed to save product');
    }
  };

  const handleProductDelete = async (productId: number) => {
    try {
      const result = await api.deleteProduct(productId);
      if (result.success) {
        // Refresh data after successful delete
        const productsResult = await api.getProducts(debouncedSearch, selectedCategory, currentPage, 50);
        if (productsResult.success) {
          setProducts(productsResult.products);
          if (productsResult.pagination) {
            setPagination(productsResult.pagination);
          }
        }

        await refreshStats();
        toast.success('Product deleted!');
      } else {
        toast.error(result.error || 'Failed to delete product');
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error('Failed to delete product');
    }
  };

  const handleEditProduct = (product: Product) => {
    try {
      console.log("Editing product:", product);

      if (!product || !product.id) {
        console.error("Invalid product data:", product);
        toast.error(t("messages.errorLoading"));
        return;
      }

      setEditingProduct(product);
      setIsFormOpen(true);
    } catch (error) {
      console.error("Error in handleEditProduct:", error);
      toast.error(t("messages.errorLoading"));
    }
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsFormOpen(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Enhanced export functionality handlers
  const handleToggleExportMode = () => {
    setIsExportMode(!isExportMode);
    setSelectedProducts(new Set()); // Clear selections when toggling
  };

  const handleSelectProduct = (productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  // Enhanced Select All with two modes
  const handleSelectAllVisible = () => {
    if (selectedProducts.size > 0 && products.every(p => selectedProducts.has(p.id))) {
      // If all visible are selected, deselect all visible
      const newSelected = new Set(selectedProducts);
      products.forEach(p => newSelected.delete(p.id));
      setSelectedProducts(newSelected);
    } else {
      // Select all visible products
      const newSelected = new Set(selectedProducts);
      products.forEach(p => newSelected.add(p.id));
      setSelectedProducts(newSelected);
    }
  };

  const handleSelectAllProducts = async () => {
    try {
      // Fetch all products to get complete list
      const allProductsResult = await api.getProducts("", "all", 1, 10000); // Large limit to get all products
      if (allProductsResult.success) {
        if (selectedProducts.size === allProductsResult.products.length) {
          // If all products are selected, deselect all
          setSelectedProducts(new Set());
        } else {
          // Select ALL products from database
          setSelectedProducts(new Set(allProductsResult.products.map(p => p.id)));
        }
      }
    } catch (error) {
      console.error('Error fetching all products:', error);
      toast.error('Failed to fetch all products');
    }
  };

  // Enhanced export function that works with all products
  const handleExportToExcel = async () => {
    if (selectedProducts.size === 0) {
      toast.error(t('toast.selectAtLeastOneProduct'));
      return;
    }

    setIsExporting(true);
    try {
      // Get all products from database to find selected ones
      const allProductsResult = await api.getProducts("", "all", 1, 10000);
      if (!allProductsResult.success) {
        throw new Error('Failed to fetch products for export');
      }

      // Filter selected products from complete database
      const selectedProductsData = allProductsResult.products.filter(p => selectedProducts.has(p.id));

      // Prepare data for Excel export
      const exportData = selectedProductsData.map(product => ({
        [t('export.fields.name')]: product.name,
        [t('export.fields.description')]: product.description || '',
        [t('export.fields.category')]: product.category_name || '',
        [t('export.fields.sellingPrice')]: product.selling_price,
        [t('export.fields.purchasePrice')]: product.purchase_price,
        [t('export.fields.stock')]: product.remaining_stock,
        [t('export.fields.minStockLevel')]: product.min_stock_level,
        [t('export.fields.supplier')]: product.supplier || '',
        [t('export.fields.location')]: product.location || '',
        [t('export.fields.stockValue')]: (Number(product.selling_price) || 0) * (Number(product.remaining_stock) || 0),
        [t('export.fields.createdAt')]: new Date(product.created_at).toLocaleDateString(),
        [t('export.fields.updatedAt')]: new Date(product.updated_at).toLocaleDateString()
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Auto-size columns
      const colWidths = Object.keys(exportData[0] || {}).map(() => ({ wch: 20 }));
      ws['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Products');

      // Generate filename with current date
      const now = new Date();
      const filename = `products_export_${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.xlsx`;

      // Download the file
      XLSX.writeFile(wb, filename);

      toast.success(t('toast.exportSuccess', { count: selectedProducts.size }));

      // Exit export mode
      setIsExportMode(false);
      setSelectedProducts(new Set());
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('toast.exportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  // New inventory export function with specific format
  const handleExportInventoryToExcel = async () => {
    if (selectedProducts.size === 0) {
      toast.error(t('toast.selectAtLeastOneProduct'));
      return;
    }

    setIsExporting(true);
    try {
      // Get all products from database to find selected ones
      const allProductsResult = await api.getProducts("", "all", 1, 10000);
      if (!allProductsResult.success) {
        throw new Error('Failed to fetch products for export');
      }

      // Filter selected products from complete database
      const selectedProductsData = allProductsResult.products.filter(p => selectedProducts.has(p.id));

      // Prepare data for Excel export with specific format (manual entry columns left empty)
      const exportData = selectedProductsData.map(product => ({
        [t('export.inventoryFields.id')]: product.id,
        [t('export.inventoryFields.name')]: product.name,
        [t('export.inventoryFields.quantity')]: '', // Empty for manual entry
        [t('export.inventoryFields.unitPrice')]: Number(product.selling_price) || 0,
        [t('export.inventoryFields.totalPrice')]: '' // Empty for manual entry
      }));

      // Add total row at the bottom (empty for manual entry)
      const totalRow = {
        [t('export.inventoryFields.id')]: '',
        [t('export.inventoryFields.name')]: t('export.inventoryFields.total'),
        [t('export.inventoryFields.quantity')]: '',
        [t('export.inventoryFields.unitPrice')]: '',
        [t('export.inventoryFields.totalPrice')]: '' // Empty for manual entry
      };

      // Combine data with total row
      const finalData = [...exportData, totalRow];

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(finalData);

      // Auto-size columns
      const colWidths = [
        { wch: 10 }, // ID column
        { wch: 30 }, // Name column
        { wch: 12 }, // Quantity column
        { wch: 15 }, // Unit Price column
        { wch: 15 }  // Total Price column
      ];
      ws['!cols'] = colWidths;

      // Style the total row (make it bold)
      const totalRowIndex = finalData.length;
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:E1');

      // Add bold formatting to the total row
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: totalRowIndex - 1, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "FFFFCC" } }
          };
        }
      }

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');

      // Generate filename with current date
      const now = new Date();
      const filename = `inventaire_export_${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.xlsx`;

      // Download the file
      XLSX.writeFile(wb, filename);

      toast.success(t('export.inventoryExportSuccess'));

      // Exit export mode
      setIsExportMode(false);
      setSelectedProducts(new Set());
    } catch (error) {
      console.error('Inventory export error:', error);
      toast.error(t('toast.exportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  // Helper functions for UI indicators
  const getSelectedFromVisible = () => {
    return products.filter(p => selectedProducts.has(p.id)).length;
  };

  const getAllVisibleSelected = () => {
    return products.length > 0 && products.every(p => selectedProducts.has(p.id));
  };

  // Show error state if database connection failed
  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Card className="border-2 border-red-200 bg-red-50 dark:bg-red-900/20">
            <CardHeader>
              <CardTitle className="text-red-800 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {t('error.databaseConnection')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-700 dark:text-red-300 mb-4">
                {error}
              </p>
              <div className="text-sm text-red-600 dark:text-red-400">
                <p className="font-semibold mb-2">{t('error.ensureFollowing')}</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{t('error.mysqlServerNotRunning')}</li>
                  <li>{t('error.databaseCredentials')}</li>
                  <li>{t('error.databaseExists')}</li>
                  <li>{t('error.backendServerRunning')}</li>
                </ul>
              </div>
              <Button
                onClick={() => window.location.reload()}
                className="mt-4"
                variant="outline"
              >
                Retry Connection
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Show loading state only on initial load, not during search
  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          {/* Page Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-blue-800 dark:text-blue-400">
                {t("dashboard.title")}
              </h1>
            </div>
            <Button
              disabled
              className="text-white shadow-lg bg-blue-800 dark:bg-blue-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("products.add")}
            </Button>
          </div>

          {/* Stats Cards Skeleton */}
          <StatsCardsSkeleton />

          {/* Filters Skeleton */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
            <div className="md:w-64">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
          </div>

          {/* Products Table Skeleton */}
          <ProductTableSkeleton />
        </main>
      </div>
    );
  }
function handleShowStats(){
  setShowStats(showStats?false:true)
}
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-800 dark:text-blue-400">
              {t("dashboard.title")}
            </h1>
          </div>
          <div className="flex gap-2">
            {/* Export Mode Controls */}
            {isExportMode && (
              <div className="flex gap-2 mr-2">
                <Button
                  onClick={handleSelectAllVisible}
                  variant="outline"
                  size="sm"
                  className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  {getAllVisibleSelected() ? (
                    <Square className="mr-2 h-4 w-4" />
                  ) : (
                    <CheckSquare className="mr-2 h-4 w-4" />
                  )}
                  {getAllVisibleSelected() ? t('export.unselectVisible') : `${t('export.selectVisible')} (${products.length})`}
                </Button>

                {/* Select All Products Button */}
                <Button
                  onClick={handleSelectAllProducts}
                  variant="outline"
                  size="sm"
                  className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  {selectedProducts.size === stats.totalProducts ? (
                    <Square className="mr-2 h-4 w-4" />
                  ) : (
                    <CheckSquare className="mr-2 h-4 w-4" />
                  )}
                  {selectedProducts.size === stats.totalProducts ? t('export.unselectAll') : `${t('export.selectAll')} (${stats.totalProducts})`}
                </Button>

                {/* Export Button with enhanced info */}
                <Button
                  onClick={handleExportToExcel}
                  disabled={selectedProducts.size === 0 || isExporting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? t('export.exporting') : `${t('export.exportSelected')} (${getSelectedFromVisible()})`}
                </Button>

                {/* Inventory Export Button */}
                <Button
                  onClick={handleExportInventoryToExcel}
                  disabled={selectedProducts.size === 0 || isExporting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {isExporting ? t('export.exporting') : t('export.exportInventory')}
                </Button>
              </div>
            )}
            <Button
                onClick={handleShowStats}
                variant= "outline"
                className={showStats ? "border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:border-blue-400 dark:text-blue-400" : "border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20"}>
                 <BarChart3Icon className="mr-2 h-4 w-4" />

                {showStats ? t('stats.show') : t('stats.hide')}
            </Button>
            {/* Export Toggle Button */}
            <Button
              onClick={handleToggleExportMode}
              variant={isExportMode ? "destructive" : "outline"}
              className={isExportMode ? "" : "border-orange-600 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExportMode ? t('export.cancelExport') : t('export.exportToExcel')}
            </Button>

            {/* Add Product Button */}
            <Button
              onClick={handleAddProduct}
              disabled={isExportMode}
              className="text-white shadow-lg transition-all duration-300 hover:shadow-xl transform hover:scale-105"
              style={{
                backgroundColor: "#1e40af",
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("products.add")}
            </Button>
          </div>
        </div>

        <div className={showStats?"hidden":"visible"}>
          {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
          <Card className="border-2 shadow-lg border-blue-800 dark:border-blue-400 dark:bg-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-400">
                {t("stats.totalProducts")}
              </CardTitle>
              <Package className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-800 dark:text-blue-400">
                {stats.totalProducts}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("stats.totalProductsDesc")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 shadow-lg border-blue-800 dark:border-blue-400 dark:bg-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-400">
                {t("stats.stockValue")}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-800 dark:text-blue-400">
                {Number.isNaN(stats.totalStockValue)
                  ? "0"
                  : stats.totalStockValue.toLocaleString()}{" "}
                {t("currency")}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("stats.stockValueDesc")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 shadow-lg border-orange-600 dark:border-orange-400 dark:bg-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-600 dark:text-orange-400">
                {t("stats.lowStock")}
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {stats.lowStockCount}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("stats.lowStockDesc")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Per-Page Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
          <Card className="border-2 shadow-lg border-green-600 dark:border-green-400 dark:bg-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-600 dark:text-green-400">
                {t("stats.totalProducts")} - {t("stats.page")} {currentPage}
              </CardTitle>
              <Package className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {pageStats.totalPageProducts}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('ui.productsOnCurrentPage')}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 shadow-lg border-green-600 dark:border-green-400 dark:bg-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-600 dark:text-green-400">
                {t("stats.stockValue")} - {t("stats.page")} {currentPage}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {Number.isNaN(pageStats.totalPageStockValue)
                  ? "0"
                  : pageStats.totalPageStockValue.toLocaleString()}{" "}
                {t("currency")}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("stats.stockValueCurrentPageDesc")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 shadow-lg border-yellow-600 dark:border-yellow-400 dark:bg-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                {t("stats.lowStock")} - {t("stats.page")} {currentPage}
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {pageStats.lowPageStockCount}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('ui.lowStockItemsOnCurrentPage')}
              </p>
            </CardContent>
          </Card>
        </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              searchMode={searchMode}
              onSearchModeChange={setSearchMode}
            />
          </div>
          <div className="md:w-64">
            <CategoryFilter
              categories={categories}
              value={selectedCategory}
              onChange={setSelectedCategory}
            />
          </div>
        </div>

        {/* Products Table */}
        <Card className="border-2 shadow-lg border-blue-800 dark:border-blue-400 dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-blue-800 dark:text-blue-400 flex items-center justify-between">
              <span>{t("products.list")}</span>
              {isExportMode && selectedProducts.size > 0 && (
                <span className="text-sm font-normal text-gray-600 dark:text-gray-400">
                  {getSelectedFromVisible()} of {products.length} visible selected | {selectedProducts.size} total selected
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProductTable
              products={products}
              categories={categories}
              onEdit={handleEditProduct}
              onDelete={handleProductDelete}
              isExportMode={isExportMode}
              selectedProducts={selectedProducts}
              onSelectProduct={handleSelectProduct}
              onSelectAllVisible={handleSelectAllVisible}
              allVisibleSelected={getAllVisibleSelected()}
            />

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-6">
                <Pagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  itemsPerPage={pagination.itemsPerPage}
                  onPageChange={handlePageChange}
                  showInfo={true}
                  showFirstLast={true}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Form Dialog */}
        <ProductForm
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingProduct(null);
          }}
          onSave={handleProductSave}
          categories={categories}
          editingProduct={editingProduct}
        />
      </main>
      <Toaster />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/view/product/:id" element={<ViewProductPageWrapper />} />
      <Route path="/edit/product/:id" element={<EditProductPageWrapper />} />
    </Routes>
  );
}

function ViewProductPageWrapper() {
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id } = useParams();

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const productId = Number(id);

        if (isNaN(productId)) {
          setError("Invalid product ID");
          return;
        }

        // Fetch product by ID directly (not from paginated list)
        const [productResult, categoriesResult] = await Promise.all([
          api.getProductById(productId),
          api.getCategories()
        ]);

        if (productResult.success && productResult.product) {
          setProduct(productResult.product);
        } else {
          setError(productResult.error || "Product not found");
        }

        if (categoriesResult.success) {
          setCategories(categoriesResult.categories);
        }
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <PageLoading />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return <ProductNotFound productId={id} />;
  }

  return <ViewProduct product={product} categories={categories} />;
}

function EditProductPageWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const productId = Number(id);

        if (isNaN(productId)) {
          setError("Invalid product ID");
          return;
        }

        // Fetch product by ID directly (not from paginated list)
        const [productResult, categoriesResult] = await Promise.all([
          api.getProductById(productId),
          api.getCategories()
        ]);

        if (productResult.success && productResult.product) {
          setProduct(productResult.product);
        } else {
          setError(productResult.error || "Product not found");
        }

        if (categoriesResult.success) {
          setCategories(categoriesResult.categories);
        }
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20">
        <Navbar />
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="text-sm text-gray-500 mt-2">{t('ui.loadingProduct')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return <ProductNotFound productId={id} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20">
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("actions.goBack")}
          </Button>
          <div className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-600" />
            <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
              {t('product.editPrefix')} {product.name}
            </span>
          </div>
        </div>

        <ProductForm
          isOpen={true}
          categories={categories}
          editingProduct={product}
          onClose={() => navigate(-1)}
          onSave={async (formData) => {
            // Handle product update here
            console.log('Product update:', formData);
            navigate(-1);
          }}
        />
      </div>
    </div>
  );
}

export default App;
