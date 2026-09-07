// Cached master lists, and the one rule this hook exists to enforce:
//
// AN ERROR IS NOT AN EMPTY LIST. Every consumer of master data renders a list
// or a dropdown, and the tempting shape — `data ?? []` with the error dropped —
// turns an outage, an expired session and a genuinely empty table into the same
// screen. On a label-compliance system that screen reads as "there are no
// brands", and somebody creates a second "VitaFit" because the first one looked
// like it did not exist. `isError` is returned from every hook here and callers
// are expected to show it; `items` is still `[]` so nothing has to null-check,
// but it is never the whole answer.
//
// One query key per master type, so a write to brands refetches brands and not
// the other five.

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brand,
  Claim,
  Flavour,
  ManufacturingCompany,
  MarketingCompany,
  MasterTypeKey,
  ProductCategory
} from '../types/masters';
import {
  getBrands,
  getClaims,
  getFlavours,
  getManufacturingCompanies,
  getMarketingCompanies,
  getProductCategories
} from '../services/masterService';

export const masterQueryKey = (type: MasterTypeKey) => ['masters', type] as const;

/** Master data changes rarely and is read on nearly every screen. */
const STALE_TIME = 60_000;

export type MasterQuery<T> = {
  items: T[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

function useMasterList<T>(type: MasterTypeKey, queryFn: () => Promise<T[]>): MasterQuery<T> {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: masterQueryKey(type),
    queryFn,
    staleTime: STALE_TIME
  });

  return useMemo(
    () => ({ items: data ?? [], isLoading, isError, error }),
    [data, isLoading, isError, error]
  );
}

export const useMarketingCompanies = (): MasterQuery<MarketingCompany> =>
  useMasterList('marketingCompanies', getMarketingCompanies);

export const useManufacturingCompanies = (): MasterQuery<ManufacturingCompany> =>
  useMasterList('manufacturingCompanies', getManufacturingCompanies);

export const useBrands = (): MasterQuery<Brand> => useMasterList('brands', getBrands);

export const useFlavours = (): MasterQuery<Flavour> => useMasterList('flavours', getFlavours);

export const useClaims = (): MasterQuery<Claim> => useMasterList('claims', getClaims);

export const useProductCategories = (): MasterQuery<ProductCategory> =>
  useMasterList('productCategories', getProductCategories);

/**
 * One master type chosen at runtime — for the Masters screen, whose active tab
 * decides which of the six it is showing.
 *
 * All six queries are declared (hooks cannot be called conditionally) but only
 * the active one is enabled, so switching tabs fetches that tab and no more.
 */
export function useMasterType(type: MasterTypeKey): MasterQuery<MasterRecordOfAnyType> {
  const queries: Record<MasterTypeKey, () => Promise<MasterRecordOfAnyType[]>> = {
    marketingCompanies: getMarketingCompanies,
    manufacturingCompanies: getManufacturingCompanies,
    brands: getBrands,
    flavours: getFlavours,
    claims: getClaims,
    productCategories: getProductCategories
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: masterQueryKey(type),
    queryFn: queries[type],
    staleTime: STALE_TIME
  });

  return useMemo(
    () => ({ items: data ?? [], isLoading, isError, error }),
    [data, isLoading, isError, error]
  );
}

/** The union the Masters screen works in — it renders all six through one table. */
export type MasterRecordOfAnyType = MarketingCompany | ManufacturingCompany | Brand | Flavour | Claim | ProductCategory;

/** Invalidates one master list after a write to it. */
export function useInvalidateMaster(): (type: MasterTypeKey) => void {
  const queryClient = useQueryClient();
  return (type: MasterTypeKey) => {
    void queryClient.invalidateQueries({ queryKey: masterQueryKey(type) });
  };
}
