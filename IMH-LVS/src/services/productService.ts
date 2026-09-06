import { Product, ProductInput, ProductOrigin } from '../types/product';
import apiClient from './apiClient';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getProducts(): Promise<Product[]> {
  const { data } = await apiClient.get('/data/Product');
  return data;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  try {
    const { data } = await apiClient.get(`/data/Product/${id}`);
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

export async function createProduct(input: ProductInput, actor: string, meta?: ProductOriginMeta): Promise<Product> {
  const all = await getProducts();
  const maxSeq = all.reduce((max, product) => {
    const match = /^PRD-(\d+)$/.exec(product.id);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  const newId = `PRD-${String(maxSeq + 1).padStart(4, '0')}`;
  
  const now = today();
  const newProduct = {
    id: newId,
    ...input,
    origin: meta?.origin,
    sourceArtworkId: meta?.sourceArtworkId,
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    createdBy: actor,
    updatedBy: actor
  };

  const { data } = await apiClient.post('/data/Product', newProduct);
  return data;
}

export async function setProductSourceArtwork(id: string, artworkId: string): Promise<Product | undefined> {
  try {
    const { data } = await apiClient.put(`/data/Product/${id}`, { sourceArtworkId: artworkId });
    return data;
  } catch {
    return undefined;
  }
}

export async function updateProduct(id: string, input: Partial<ProductInput>, actor: string): Promise<Product | undefined> {
  const updatedPayload = { ...input, updatedBy: actor, updatedDate: new Date().toISOString() };
  try {
    const { data } = await apiClient.put(`/data/Product/${id}`, updatedPayload);
    return data;
  } catch {
    return undefined;
  }
}

export async function deactivateProduct(id: string, actor: string): Promise<Product | undefined> {
  return updateProduct(id, { status: 'Inactive' }, actor);
}
