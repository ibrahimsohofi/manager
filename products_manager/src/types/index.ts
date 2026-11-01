export interface Category {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  category_id: number;
  category_name?: string;
  sku?: string;
  barcode?: string;
  brand?: string;
  purchase_price: number;
  selling_price: number;
  remaining_stock: number;
  min_stock_level: number;
  image_url?: string;
  supplier?: string;
  location?: string;
  created_at: string;
  updated_at: string;
  // Price change tracking
  last_selling_price?: number;
  last_purchase_price?: number;
  price_changed_recently?: boolean;
  last_price_change_date?: string;
}

export interface PriceHistoryItem {
  id: number;
  product_id?: number;
  product_name?: string;
  price_type: 'selling' | 'purchase';
  old_price: number;
  new_price: number;
  price_difference: number;
  percentage_change: number;
  changed_by: string;
  notes?: string;
  changed_at: string;
}

export interface PriceHistoryResponse {
  success: boolean;
  product_id: number;
  product_name: string;
  price_history: PriceHistoryItem[];
  summary: {
    total_changes: number;
    selling_price_changes: number;
    purchase_price_changes: number;
    last_change: string | null;
  };
}
