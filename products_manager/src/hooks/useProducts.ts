import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Product } from '@/types';

export const useProducts = (
  search = '',
  category = 'all',
  page = 1,
  limit = 50,
  sortBy = 'created_at',
  sortOrder = 'DESC'
) => {
  return useQuery({
    queryKey: ['products', search, category, page, limit, sortBy, sortOrder],
    queryFn: () => api.getProducts(search, category, page, limit, sortBy, sortOrder),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    staleTime: 15 * 60 * 1000, // Categories don't change often, cache for 15 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 2,
  });
};

export const useStats = () => {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    staleTime: 2 * 60 * 1000, // Stats can change frequently, cache for 2 minutes
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (productData: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'category_name'>) =>
      api.createProduct(productData),
    onSuccess: () => {
      // Invalidate and refetch products list and stats
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success(t('messages.productAdded'));
    },
    onError: (error) => {
      console.error('Error creating product:', error);
      toast.error(t('messages.errorSaving'));
    },
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (productData: Omit<Product, 'created_at' | 'updated_at' | 'category_name'>) =>
      api.updateProduct(productData),
    onSuccess: () => {
      // Invalidate and refetch products list and stats
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success(t('messages.productUpdated'));
    },
    onError: (error) => {
      console.error('Error updating product:', error);
      toast.error(t('messages.errorSaving'));
    },
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (productId: number) => api.deleteProduct(productId),
    onSuccess: () => {
      // Invalidate and refetch products list and stats
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success(t('messages.productDeleted'));
    },
    onError: (error) => {
      console.error('Error deleting product:', error);
      toast.error(t('messages.errorDeleting'));
    },
  });
};
