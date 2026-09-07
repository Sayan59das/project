import { Product, ProductInput, ProductOrigin } from '../types/product';
import apiClient, { actorHeaders } from './apiClient';

export async function getProducts(): Promise<Product[]> {
  const { data } = await apiClient.get('/products');
  return data;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  try {
    const { data } = await apiClient.get(`/products/${id}`);
    return data;
  } catch {
    return undefined;
  }
}

export async function findPossibleDuplicate(input: Pick<ProductInput, 'productName' | 'brandName' | 'marketingCompany'>): Promise<Product | undefined> {
  const norm = (value: string) => value.trim().toLowerCase();
  const all = await getProducts();
  return all.find(
    (product) =>
      norm(product.productName) === norm(input.productName) &&
      norm(product.brandName) === norm(input.brandName) &&
      norm(product.marketingCompany) === norm(input.marketingCompany)
  );
}

export async function getProductsByBrandAndCompany(brandName: string, marketingCompany: string): Promise<Product[]> {
  const norm = (value: string) => value.trim().toLowerCase();
  const all = await getProducts();
  return all.filter(
    (product) => norm(product.brandName) === norm(brandName) && norm(product.marketingCompany) === norm(marketingCompany)
  );
}

export type ProductOriginMeta = { origin: ProductOrigin; sourceArtworkId?: string };

// id and every audit field (createdDate/updatedDate/createdBy/updatedBy) are
// assigned by the backend, not the client — see backend/src/types/domain.ts
// ProductInput, which deliberately excludes them.
export async function createProduct(input: ProductInput, actor: string, meta?: ProductOriginMeta): Promise<Product> {
  const payload = { ...input, origin: meta?.origin, sourceArtworkId: meta?.sourceArtworkId };
  const { data } = await apiClient.post('/products', payload, { headers: actorHeaders(actor) });
  return data;
}

// Provenance only, not a user edit — see product.repository.ts's
// setProductSourceArtwork, which this route wraps.
export async function setProductSourceArtwork(id: string, artworkId: string): Promise<Product | undefined> {
  try {
    const { data } = await apiClient.patch(`/products/${id}/source-artwork`, { artworkId });
    return data;
  } catch {
    return undefined;
  }
}

export async function updateProduct(id: string, input: Partial<ProductInput>, actor: string): Promise<Product | undefined> {
  try {
    const { data } = await apiClient.patch(`/products/${id}`, input, { headers: actorHeaders(actor) });
    return data;
  } catch {
    return undefined;
  }
}

export async function deactivateProduct(id: string, actor: string): Promise<Product | undefined> {
  try {
    const { data } = await apiClient.delete(`/products/${id}`, { headers: actorHeaders(actor) });
    return data;
  } catch {
    return undefined;
  }
}
