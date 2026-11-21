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

export interface DashboardStats {
  totalProducts: number;
  totalStockValue: number;
  lowStockCount: number;
  /** SUM(purchase_price * remaining_stock): live, follows the stock */
  stockCostValue: number;
  /** Money spent on stock, frozen at purchase time (sales never reduce it) */
  spentThisMonth: number;
  spentThisYear: number;
  spentAllTime: number;
}

export interface SpendingMonth {
  month: number; // 1-12
  total: number;
  quantity: number;
  entries: number;
  /** Part of `total` that comes from the one-time opening stock snapshot */
  openingTotal: number;
}

export interface SpendingYear {
  year: number;
  total: number;
  quantity: number;
  entries: number;
}

export interface SpendingReportResponse {
  success: boolean;
  year: number;
  months: SpendingMonth[];
  yearTotal: number;
  allTimeTotal: number;
  years: SpendingYear[];
  error?: string;
}

/** restock = stock increase on edit, initial = stock of a new product, opening = tracking start snapshot */
export type SpendingSource = 'restock' | 'initial' | 'opening';
export type SpendingSourceFilter = SpendingSource | 'all';

export interface SpendingTotals {
  total: number;
  quantity: number;
  entries: number;
}

export interface SpendingEntry {
  id: number;
  product_id: number | null;
  /** Name frozen at purchase time */
  product_name: string | null;
  /** Current name in the catalogue (null when the product was deleted) */
  current_name: string | null;
  product_exists: boolean;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  source: SpendingSource;
  purchased_at: string;
}

export interface SpendingEntriesResponse {
  success: boolean;
  year: number;
  month: number;
  source: SpendingSourceFilter;
  /** Whole month, whatever the source filter */
  summary: SpendingTotals & { products: number };
  bySource: (SpendingTotals & { source: SpendingSource })[];
  /** Totals for the active source filter (all pages) */
  filtered: SpendingTotals;
  entries: SpendingEntry[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  error?: string;
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
