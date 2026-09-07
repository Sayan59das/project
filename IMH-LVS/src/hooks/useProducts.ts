// The product list, fetched once and shared.
//
// Same rule as useMasterData: AN ERROR IS NOT AN EMPTY LIST. Products anchor
// artworks, comparisons and approvals, so a screen that renders "no products"
// during an outage is telling a reviewer the catalogue is empty. `items` is
// still `[]` so callers need no null checks, but `isError` is returned and the
// screens show it.

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Product } from '../types/product';
import { getProducts } from '../services/productService';

export const PRODUCTS_QUERY_KEY = ['products'] as const;

export type ProductsQuery = {
  products: Product[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Undefined for an id that is not in the list — render it as unknown, not as an error. */
  byId: (id: string | undefined) => Product | undefined;
};

export function useProducts(): ProductsQuery {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: getProducts,
    staleTime: 30_000
  });

  const products = useMemo(() => data ?? [], [data]);
  const index = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  return useMemo(
    () => ({
      products,
      isLoading,
      isError,
      error,
      byId: (id) => (id ? index.get(id) : undefined)
    }),
    [products, index, isLoading, isError, error]
  );
}

/** Invalidates the cached product list — call after any write that changes one. */
export function useInvalidateProducts(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}
