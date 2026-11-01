import type { Product, Category, PriceHistoryResponse, PriceHistoryItem } from '@/types';

const API_BASE_URL = '/api';

// Detect if running in mobile app (Capacitor)
const isCapacitor = () => {
  return !!(window as typeof window & { Capacitor?: unknown }).Capacitor;
};

export const api = {
  // Stats
  getStats: async (): Promise<{
    success: boolean;
    stats: {
      totalProducts: number;
      totalStockValue: number;
      lowStockCount: number;
    }
  }> => {
    const response = await fetch(`${API_BASE_URL}/stats`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  // Categories
  getCategories: async (): Promise<{ success: boolean; categories: Category[] }> => {
    const response = await fetch(`${API_BASE_URL}/categories`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  // Products
  getProducts: async (
    search = '',
    category = 'all',
    page = 1,
    limit = 50,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  ): Promise<{
    success: boolean;
    products: Product[];
    pagination?: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      limit: number;
    };
  }> => {
    const params = new URLSearchParams({
      search,
      category,
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    });

    const response = await fetch(`${API_BASE_URL}/products?${params}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  getProductById: async (id: number): Promise<{ success: boolean; product?: Product; error?: string }> => {
    const response = await fetch(`${API_BASE_URL}/products/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  createProduct: async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'category_name'>): Promise<{ success: boolean; id?: number; error?: string }> => {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productData),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  updateProduct: async (productData: Omit<Product, 'created_at' | 'updated_at' | 'category_name'>): Promise<{ success: boolean; error?: string }> => {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productData),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  deleteProduct: async (id: number): Promise<{ success: boolean; error?: string }> => {
    const response = await fetch(`${API_BASE_URL}/products?id=${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  uploadImage: async (file: File): Promise<{ success: boolean; imageUrl?: string; error?: string }> => {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  deleteImage: async (imageUrl: string): Promise<{ success: boolean; error?: string }> => {
    const response = await fetch(`${API_BASE_URL}/delete-image`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // Price History
  getProductPriceHistory: async (productId: number): Promise<PriceHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/products/${productId}/price-history`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  getAllPriceHistory: async (
    limit = 50,
    priceType: 'all' | 'selling' | 'purchase' = 'all'
  ): Promise<{ success: boolean; price_history: PriceHistoryItem[]; count: number }> => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      price_type: priceType,
    });
    const response = await fetch(`${API_BASE_URL}/price-history?${params}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },
};
