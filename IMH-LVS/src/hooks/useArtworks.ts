// The artwork list, fetched once and shared.
//
// Same rule as the other two: AN ERROR IS NOT AN EMPTY LIST. An empty artwork
// table during an outage reads as "this product has no labels", which is how a
// reviewer concludes there is nothing waiting for them.
//
// Note what this cache does NOT hold: file bytes. An artwork read back from the
// API has an empty filePath unless it was uploaded in this tab (see
// artworkService's sessionFiles), and the preview components render that as
// "preview not available" rather than a broken image.

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Artwork } from '../types/artwork';
import { getArtworks, getArtworksByProduct } from '../services/artworkService';

export const ARTWORKS_QUERY_KEY = ['artworks'] as const;
export const artworksByProductKey = (productId: string) => ['artworks', 'product', productId] as const;

export type ArtworksQuery = {
  artworks: Artwork[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  byId: (id: string | undefined) => Artwork | undefined;
};

export function useArtworks(): ArtworksQuery {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ARTWORKS_QUERY_KEY,
    queryFn: getArtworks,
    // Shorter than masters: statuses move through the approval workflow while
    // somebody is looking at the screen.
    staleTime: 15_000
  });

  const artworks = useMemo(() => data ?? [], [data]);
  const index = useMemo(() => new Map(artworks.map((artwork) => [artwork.id, artwork])), [artworks]);

  return useMemo(
    () => ({
      artworks,
      isLoading,
      isError,
      error,
      byId: (id) => (id ? index.get(id) : undefined)
    }),
    [artworks, index, isLoading, isError, error]
  );
}

/**
 * One product's versions, from the product's own route.
 *
 * Its own query rather than a filter over the full list, because the detail
 * drawer that uses it is often the only artwork a screen needs, and the table
 * that owns these rows can answer it directly.
 */
export function useProductArtworks(productId: string | undefined): ArtworksQuery {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: artworksByProductKey(productId ?? ''),
    queryFn: () => getArtworksByProduct(productId as string),
    enabled: Boolean(productId),
    staleTime: 15_000
  });

  const artworks = useMemo(() => data ?? [], [data]);
  const index = useMemo(() => new Map(artworks.map((artwork) => [artwork.id, artwork])), [artworks]);

  return useMemo(
    () => ({
      artworks,
      isLoading,
      isError,
      error,
      byId: (id) => (id ? index.get(id) : undefined)
    }),
    [artworks, index, isLoading, isError, error]
  );
}

/** Invalidates every artwork query — the full list and any per-product one. */
export function useInvalidateArtworks(): () => void {
  const queryClient = useQueryClient();
  return () => {
    // One prefix covers both key shapes above, so a status change does not
    // leave a product drawer showing the previous status.
    void queryClient.invalidateQueries({ queryKey: ARTWORKS_QUERY_KEY });
  };
}
