import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, DollarSign, TrendingUp, AlertTriangle, ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Product, Category } from '@/types';

interface ProductHoverModalProps {
  product: Product | null;
  categories: Category[];
  position: { x: number; y: number };
  isVisible: boolean;
}

export function ProductHoverModal({ product, categories, position, isVisible }: ProductHoverModalProps) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [product?.image_url]);

  if (!product || !isVisible) {
    return null;
  }

  const getCategoryName = (categoryId: number) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || t('categories.none');
  };

  const getStockStatus = (stock: number, minLevel: number) => {
    if (stock === 0) {
      return { label: t('status.outOfStock'), variant: 'destructive' as const, color: 'text-red-600' };
    }
    if (stock <= minLevel) {
      return { label: t('status.lowStock'), variant: 'secondary' as const, color: 'text-amber-600' };
    }
    return { label: t('status.inStock'), variant: 'default' as const, color: 'text-green-600' };
  };

  const stockStatus = getStockStatus(product.remaining_stock || 0, product.min_stock_level || 0);
  const stockValue = (product.selling_price || 0) * (product.remaining_stock || 0);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: position.x + 20,
        top: Math.max(10, position.y - 200),
      }}
    >
      <Card className="w-80 shadow-2xl border-2 border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 animate-in fade-in-0 zoom-in-95 duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-blue-800 dark:text-blue-400 line-clamp-2">
            {product.name}
          </CardTitle>
          <Badge variant={stockStatus.variant} className="w-fit">
            {stockStatus.label}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Product Image */}
          <div className="relative w-full h-fit justify-center items-center rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border">
            {product.image_url && !imageError ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-72  transition-transform hover:scale-105 "
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-48 flex items-center justify-center">
               <img src="placeholder.png" alt={product.name} />
              </div>
            )}
          </div>

          {/* Product Description */}
          {product.description && (
            <div className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
              {product.description}
            </div>
          )}

          {/* Product Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{t('products.category')}:</span>
              </div>
              <div className="text-gray-600 dark:text-gray-300 pl-6">
                {getCategoryName(product.category_id)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-medium">{t('products.sellingPrice')}:</span>
              </div>
              <div className="text-green-600 font-bold pl-6">
                {product.selling_price } {t('currency')}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{t('products.stock')}:</span>
              </div>
              <div className={`font-semibold pl-6 flex items-center space-x-1 ${stockStatus.color}`}>
                <span>{product.remaining_stock || 0}</span>
                {(product.remaining_stock || 0) <= (product.min_stock_level || 0) && (
                  <AlertTriangle className="h-4 w-4" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-purple-600" />
                <span className="font-medium">{t('stats.stockValue')}:</span>
              </div>
              <div className="text-purple-600 font-bold pl-6">
                {stockValue.toFixed(2)} {t('currency')}
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex justify-between">
              <span>{t('products.purchasePrice')}: {product.purchase_price } {t('currency')}</span>
              <span>{t('products.minStock')}: {product.min_stock_level || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
