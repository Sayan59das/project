import { useQuery } from '@tanstack/react-query';
import { getBrands, getFlavours, getMarketingCompanies, getManufacturingCompanies } from '../services/masterService';
import { getProducts } from '../services/productService';
import { getArtworks } from '../services/artworkService';
import { getComparisons } from '../services/comparisonService';

export function useMasterData() {
  const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: getBrands });
  const { data: flavours = [] } = useQuery({ queryKey: ['flavours'], queryFn: getFlavours });
  const { data: marketingCompanies = [] } = useQuery({ queryKey: ['marketingCompanies'], queryFn: getMarketingCompanies });
  const { data: manufacturingCompanies = [] } = useQuery({ queryKey: ['manufacturingCompanies'], queryFn: getManufacturingCompanies });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const { data: artworks = [], refetch: refetchArtworks } = useQuery({ queryKey: ['artworks'], queryFn: getArtworks });
  const { data: comparisons = [], refetch: refetchComparisons } = useQuery({ queryKey: ['comparisons'], queryFn: getComparisons });

  return { brands, flavours, marketingCompanies, manufacturingCompanies, products, artworks, refetchArtworks, comparisons, refetchComparisons };
}
