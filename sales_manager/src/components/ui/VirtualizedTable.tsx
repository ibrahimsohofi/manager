import { memo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Product, Category } from '@/types';

interface VirtualizedTableProps {
  products: Product[];
  categories: Category[];
  onEdit: (product: Product) => void;
  onDelete: (productId: number) => void;
  renderRow: (product: Product, index: number) => React.ReactNode;
  height?: number;
  itemHeight?: number;
}

export const VirtualizedTable = memo(function VirtualizedTable({
  products,
  categories,
  onEdit,
  onDelete,
  renderRow,
  height = 600,
  itemHeight = 70,
}: VirtualizedTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 10, // Render 10 items outside of the visible area for smooth scrolling
  });

  if (products.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No products found
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      {/* Table Header - Always visible */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead className="w-16">Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Purchase Price</TableHead>
            <TableHead>Selling Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
      </Table>

      {/* Virtualized Table Body */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: `${height}px` }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const product = products[virtualItem.index];

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <Table>
                  <TableBody>
                    {renderRow(product, virtualItem.index)}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// Helper hook for using virtualized table with performance optimizations
export const useVirtualizedProducts = (
  products: Product[],
  containerHeight = 600,
  itemHeight = 70
) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  });

  return {
    parentRef,
    virtualizer,
    containerHeight,
  };
};
