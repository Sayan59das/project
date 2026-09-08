// Comparisons, and the approval queues built out of them.
//
// AN ERROR IS NOT AN EMPTY QUEUE — the rule matters most here of all. An
// approvals screen that renders empty because a request failed tells a
// reviewer there is nothing waiting for them, and the work then sits in a
// queue nobody is looking at. Every hook returns isError and the screens show
// it.
//
// Two shapes, deliberately:
//   useComparisons()          — the whole table, for screens that genuinely
//                               need it (dashboard counts, reports).
//   useComparisonsByStatus()  — the queue a reviewer is entitled to see, asked
//                               for by status so the approvals screen does not
//                               pull every comparison in the system to show a
//                               handful of rows.

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Comparison, ComparisonStatus } from '../types/comparison';
import { getComparisons, getComparisonsByProduct, getComparisonsByStatus } from '../services/comparisonService';

export const COMPARISONS_QUERY_KEY = ['comparisons'] as const;
export const comparisonsByStatusKey = (statuses: ComparisonStatus[]) => ['comparisons', 'status', [...statuses].sort()] as const;
export const comparisonsByProductKey = (productId: string) => ['comparisons', 'product', productId] as const;

// Short: a comparison's status moves as reviewers act on it, and two people
// working the same queue should not spend long looking at each other's stale
// rows.
const STALE_TIME = 10_000;

export type ComparisonsQuery = {
  comparisons: Comparison[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  byId: (id: string | undefined) => Comparison | undefined;
};

function toQuery(
  data: Comparison[] | undefined,
  isLoading: boolean,
  isError: boolean,
  error: unknown
): ComparisonsQuery {
  const comparisons = data ?? [];
  const index = new Map(comparisons.map((comparison) => [comparison.id, comparison]));
  return {
    comparisons,
    isLoading,
    isError,
    error,
    byId: (id) => (id ? index.get(id) : undefined)
  };
}

export function useComparisons(): ComparisonsQuery {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: COMPARISONS_QUERY_KEY,
    queryFn: getComparisons,
    staleTime: STALE_TIME
  });

  return useMemo(() => toQuery(data, isLoading, isError, error), [data, isLoading, isError, error]);
}

export function useComparisonsByStatus(statuses: ComparisonStatus[]): ComparisonsQuery {
  // Sorted in the key so ['Pending QA', 'Pending Technical'] and the same two
  // the other way round share one cache entry rather than fetching twice.
  const key = comparisonsByStatusKey(statuses);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => getComparisonsByStatus(statuses),
    enabled: statuses.length > 0,
    staleTime: STALE_TIME
  });

  return useMemo(() => toQuery(data, isLoading, isError, error), [data, isLoading, isError, error]);
}

export function useProductComparisons(productId: string | undefined): ComparisonsQuery {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: comparisonsByProductKey(productId ?? ''),
    queryFn: () => getComparisonsByProduct(productId as string),
    enabled: Boolean(productId),
    staleTime: STALE_TIME
  });

  return useMemo(() => toQuery(data, isLoading, isError, error), [data, isLoading, isError, error]);
}

/**
 * Invalidates every comparison query after a decision.
 *
 * The prefix covers all three key shapes above: a decision moves a row out of
 * one queue and into another, so refreshing only the queue that was acted on
 * would leave the receiving reviewer's screen without it.
 */
export function useInvalidateComparisons(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: COMPARISONS_QUERY_KEY });
  };
}
