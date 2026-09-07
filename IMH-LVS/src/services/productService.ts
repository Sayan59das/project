// Product data access, against the real API.
//
// Was localStorage seeded from src/data/products.ts, which meant a product
// created by one person's label upload did not exist for anybody else — and an
// artwork, a comparison and an approval trail all reference a product by id.
//
// Every function here is a request. The joins that used to read the whole list
// synchronously (reports, dashboards, the comparison workflow) now take the
// products they join against as an argument instead: those modules are pure
// functions of already-loaded data, and the page holding the cached list is the
// right place for the fetch.
//
// NO `actor` PARAMETER on writes. The server records who did it from the
// session (controllers/http.ts's requireActor); a name sent from the page was
// already being ignored.

import { apiRequest, findOne } from './apiClient';
import { Product, ProductInput, ProductOrigin } from '../types/product';

export function getProducts(): Promise<Product[]> {
  return apiRequest<Product[]>('/products');
}

export function getProductById(id: string): Promise<Product | undefined> {
  return findOne(apiRequest<Product>(`/products/${encodeURIComponent(id)}`));
}

/**
 * Whether a product with this name, brand and marketing company already exists.
 *
 * Asked before creating one so the operator sees the existing record rather
 * than adding a second product for the same label. Not a constraint — two
 * companies legitimately market products of the same name — so it answers with
 * the match rather than refusing, and the endpoint returns null for no match.
 */
export async function findPossibleDuplicate(
  input: Pick<ProductInput, 'productName' | 'brandName' | 'marketingCompany'>
): Promise<Product | undefined> {
  const match = await apiRequest<Product | null>('/products/possible-duplicate', {
    query: {
      productName: input.productName,
      brandName: input.brandName,
      marketingCompany: input.marketingCompany
    }
  });
  return match ?? undefined;
}

/**
 * Products sharing a brand and marketing company, whatever their product name.
 *
 * Surfaced by the label upload flow (labelIntakeService.findPossibleProductMatches)
 * when a label cannot be auto-matched to one exact product but could plausibly
 * belong to one of these. Callers must have the user resolve the ambiguity
 * rather than guessing which one to link.
 */
export function getProductsByBrandAndCompany(brandName: string, marketingCompany: string): Promise<Product[]> {
  return apiRequest<Product[]>('/products', { query: { brand: brandName, marketingCompany } });
}

export type ProductOriginMeta = { origin: ProductOrigin; sourceArtworkId?: string };

export function createProduct(input: ProductInput, meta?: ProductOriginMeta): Promise<Product> {
  // origin/sourceArtworkId travel alongside the product's own fields rather
  // than inside ProductInput: they are provenance the intake pipeline supplies
  // and a manual creation does not.
  return apiRequest<Product>('/products', {
    method: 'POST',
    body: { ...input, origin: meta?.origin, sourceArtworkId: meta?.sourceArtworkId }
  });
}

/**
 * Backfills the originating artwork onto a product created moments earlier by
 * the label intake pipeline, once that artwork's own id is known.
 *
 * Its own endpoint, not a PATCH of the product: this is provenance, not a user
 * edit, and it deliberately leaves updatedBy/updatedDate alone so recording it
 * never looks like somebody editing the record.
 */
export function setProductSourceArtwork(id: string, artworkId: string): Promise<Product | undefined> {
  return findOne(
    apiRequest<Product>(`/products/${encodeURIComponent(id)}/source-artwork`, {
      method: 'PATCH',
      body: { artworkId }
    })
  );
}

export function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product | undefined> {
  return findOne(apiRequest<Product>(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }));
}

/**
 * Products are never physically removed — artworks, comparisons and approval
 * history all reference one — so this flips status to Inactive. DELETE is the
 * verb the API uses for it.
 */
export function deactivateProduct(id: string): Promise<Product | undefined> {
  return findOne(apiRequest<Product>(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

// ---------------------------------------------------------------------------
// Selectors over an already-loaded list
//
// These were reads of the whole store; they are now pure functions, so a caller
// that already holds the products (a page with the cached list, a report
// joining against it) does not make a second request to answer a question about
// rows it is looking at.
// ---------------------------------------------------------------------------

const norm = (value: string) => value.trim().toLowerCase();

/** The exact Product Name + Brand + Marketing Company match, or undefined. */
export function selectExactMatch(
  products: Product[],
  input: Pick<ProductInput, 'productName' | 'brandName' | 'marketingCompany'>
): Product | undefined {
  return products.find(
    (product) =>
      norm(product.productName) === norm(input.productName) &&
      norm(product.brandName) === norm(input.brandName) &&
      norm(product.marketingCompany) === norm(input.marketingCompany)
  );
}

export function selectByBrandAndCompany(products: Product[], brandName: string, marketingCompany: string): Product[] {
  return products.filter(
    (product) => norm(product.brandName) === norm(brandName) && norm(product.marketingCompany) === norm(marketingCompany)
  );
}
