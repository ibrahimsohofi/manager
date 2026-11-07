import { useState, memo } from "react";
import { Edit, Trash2, AlertTriangle, ImageIcon, Eye, Square, CheckSquare, History, TrendingUp, TrendingDown } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Product, Category } from "@/types";
import { ProductHoverModal } from "./ProductHoverModal";
import { LazyImage } from "@/components/ui/LazyImage";
import { PriceHistory } from "./PriceHistory";

interface ProductTableProps {
  products: Product[];
  categories: Category[];
  onEdit: (product: Product) => void;
  onDelete: (productId: number) => void;
  // Export functionality props
  isExportMode?: boolean;
  selectedProducts?: Set<number>;
  onSelectProduct?: (productId: number) => void;
  onSelectAllVisible?: () => void;
  allVisibleSelected?: boolean;
}

export const ProductTable = memo(function ProductTable({
  products,
  categories,
  onEdit,
  onDelete,
  isExportMode = false,
  selectedProducts = new Set(),
  onSelectProduct,
  onSelectAllVisible,
  allVisibleSelected = false,
}: ProductTableProps) {
  const { t } = useTranslation();
  const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
  const [hoveredProduct, setHoveredProduct] = useState<Product | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [priceHistoryProductId, setPriceHistoryProductId] = useState<number | null>(null);

  const navigate = useNavigate();
  const { id } = useParams();

  const getCategoryName = (categoryId: number) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || t("categories.none");
  };

  const getStockStatus = (stock: number, minLevel: number) => {
    if (stock === 0) {
      return { label: t("status.outOfStock"), variant: "destructive" as const };
    }
    if (stock <= minLevel) {
      return { label: t("status.lowStock"), variant: "secondary" as const };
    }
    return { label: t("status.inStock"), variant: "default" as const };
  };

  const handleDelete = () => {
    if (deleteProductId) {
      onDelete(deleteProductId);
      setDeleteProductId(null);
    }
  };

  const handleMouseEnter = (product: Product, e: React.MouseEvent) => {
    setHoveredProduct(product);
    setMousePosition({ x: e.clientX, y: e.clientY });
  };
  const handleShowProduct = (id: number) => {
    navigate(`/view/product/${id}`);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredProduct(null);
  };

  if (products.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {t("products.noProducts")}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isExportMode && (
                <TableHead className="w-12 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSelectAllVisible}
                    className="p-1 h-auto mx-auto"
                  >
                    {allVisibleSelected ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </Button>
                </TableHead>
              )}
              <TableHead>{t("products.id")}</TableHead>
              <TableHead className="w-16">{t("products.image")}</TableHead>
              <TableHead>{t("products.name")}</TableHead>
              <TableHead>{t("products.category")}</TableHead>
              <TableHead>{t("products.purchasePrice")}</TableHead>
              <TableHead>{t("products.sellingPrice")}</TableHead>
              <TableHead>{t("products.stock")}</TableHead>
              <TableHead>{t("products.status")}</TableHead>
              {!isExportMode && (
                <TableHead className="text-center">
                  {t("products.actions")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const stockStatus = getStockStatus(
                product.remaining_stock || 0,
                product.min_stock_level || 0
              );

              return (
                <TableRow
                  key={product.id}
                  onMouseEnter={(e) => handleMouseEnter(product, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => handleMouseLeave()}
                >
                  {isExportMode && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectProduct?.(product.id)}
                        className="p-1 h-auto"
                      >
                        {selectedProducts.has(product.id) ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  )}
                  <TableCell>{product.id} </TableCell>
                  <TableCell>
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                      {product.image_url ? (
                        <LazyImage
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover "
                          placeholderClassName="w-full h-full bg-gray-200 dark:bg-gray-700"
                          errorFallback="/placeholder.png"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-gray-400" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-left ">{product.name}</div>
                      {product.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {product.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getCategoryName(product.category_id)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{product.purchase_price} {t("currency")}</span>
                      {product.last_purchase_price && product.last_purchase_price !== product.purchase_price && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 line-through pl-1">{product.last_purchase_price}</span>
                          {product.purchase_price > product.last_purchase_price ? (
                            <TrendingUp className="h-3 w-3 text-red-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-green-500" />
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span>{product.selling_price} {t("currency")}</span>
                      </div>
                      {product.last_selling_price && product.last_selling_price !== product.selling_price && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 line-through">{product.last_selling_price}</span>
                          {product.selling_price > product.last_selling_price ? (
                            <TrendingUp className="h-3 w-3 text-green-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <span>{product.remaining_stock || 0}</span>
                      {(product.remaining_stock || 0) <=
                        (product.min_stock_level || 0) && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={stockStatus.variant}>
                      {stockStatus.label}
                    </Badge>
                  </TableCell>
                  {!isExportMode && (
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        
                        <Button
                          className="text-blue-700 hover:bg-blue-100  hover:text-blue-800  border border-gray-300 dark:border dark:border-gray-700"
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(product)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          className="text-orange-500 hover:bg-orange-100 hover:text-orange-800 border border-gray-300 dark:border dark:border-gray-700"
                          variant="outline"
                          size="sm"
                          onClick={() => setPriceHistoryProductId(product.id)}
                          title={t("product.priceHistory", "Price History")}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              className="text-[#D32F2F] hover:bg-red-50  hover:text-red-700  border border-gray-300 dark:border dark:border-gray-700"
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteProductId(product.id)}
                            >
                              <Trash2 className="h-10 w-10" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("dialog.deleteTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("dialog.deleteMessage", {
                                  name: product.name,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel
                                onClick={() => setDeleteProductId(null)}
                              >
                                {t("dialog.cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction onClick={handleDelete}>
                                {t("dialog.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button
                          className="text-green-700 hover:text-green-700 hover:bg-green-100 border border-gray-300 dark:border dark:border-gray-700  "
                          variant="outline"
                          size="sm"
                          onClick={() => handleShowProduct(product.id)}
                        >
                          <Eye className="h-5 w-5 hover:scale-110 transfor" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ProductHoverModal
        product={hoveredProduct}
        categories={categories}
        position={mousePosition}
        isVisible={!!hoveredProduct}
      />
      {priceHistoryProductId && (
        <PriceHistory
          productId={priceHistoryProductId}
          isVisible={!!priceHistoryProductId}
          onClose={() => setPriceHistoryProductId(null)}
        />
      )}
    </>
  );
});
