// Product data access layer. Everything the UI needs goes through these
// functions, backed by localStorage for now. Swapping this file's internals
// for REST API calls later should not require any change to ProductsPage.

import { Product, ProductInput, ProductOrigin } from '../types/product';
import { SEED_PRODUCTS } from '../data/products';

const STORAGE_KEY = 'imh_lvs_products';

function readAll(): Product[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_PRODUCTS));
    return SEED_PRODUCTS;
  }
  try {
    return JSON.parse(raw) as Product[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_PRODUCTS));
    return SEED_PRODUCTS;
  }
}

function writeAll(products: Product[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function nextProductId(existing: Product[]): string {
  const maxSeq = existing.reduce((max, product) => {
    const match = /^PRD-(\d+)$/.exec(product.id);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  return `PRD-${String(maxSeq + 1).padStart(4, '0')}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getProducts(): Product[] {
  return readAll();
}

export function getProductById(id: string): Product | undefined {
  return readAll().find((product) => product.id === id);
}

// Possible-duplicate check ahead of creating a product: same name + brand +
// marketing company (case-insensitive, trimmed). Callers decide whether to
// block or let the user proceed.
export function findPossibleDuplicate(input: Pick<ProductInput, 'productName' | 'brandName' | 'marketingCompany'>): Product | undefined {
  const norm = (value: string) => value.trim().toLowerCase();
  return readAll().find(
    (product) =>
      norm(product.productName) === norm(input.productName) &&
      norm(product.brandName) === norm(input.brandName) &&
      norm(product.marketingCompany) === norm(input.marketingCompany)
  );
}

// Products sharing the same Brand + Marketing Company but not necessarily
// the same Product Name — surfaced by the label upload flow
// (labelIntakeService.findPossibleProductMatches) when a label can't be
// auto-matched to one exact product but could plausibly belong to one of
// these. Callers must have the user explicitly resolve the ambiguity rather
// than guessing which one to link.
export function getProductsByBrandAndCompany(brandName: string, marketingCompany: string): Product[] {
  const norm = (value: string) => value.trim().toLowerCase();
  return readAll().filter(
    (product) => norm(product.brandName) === norm(brandName) && norm(product.marketingCompany) === norm(marketingCompany)
  );
}

export type ProductOriginMeta = { origin: ProductOrigin; sourceArtworkId?: string };

export function createProduct(input: ProductInput, actor: string, meta?: ProductOriginMeta): Product {
  const products = readAll();
  const now = today();
  const newProduct: Product = {
    id: nextProductId(products),
    ...input,
    origin: meta?.origin,
    sourceArtworkId: meta?.sourceArtworkId,
    createdDate: now,
    updatedDate: now,
    createdBy: actor,
    updatedBy: actor
  };
  writeAll([...products, newProduct]);
  return newProduct;
}

// Backfills the originating artwork onto a product created moments earlier
// by the label intake pipeline, once that artwork's own id is known (see
// labelIntakeService.submitLabelIntake) — a provenance-only patch, not a
// user edit, so it intentionally does not touch updatedBy/updatedDate.
export function setProductSourceArtwork(id: string, artworkId: string): Product | undefined {
  const products = readAll();
  const index = products.findIndex((product) => product.id === id);
  if (index === -1) return undefined;
  products[index] = { ...products[index], sourceArtworkId: artworkId };
  writeAll(products);
  return products[index];
}

export function updateProduct(id: string, input: Partial<ProductInput>, actor: string): Product | undefined {
  const products = readAll();
  const index = products.findIndex((product) => product.id === id);
  if (index === -1) return undefined;
  const updated: Product = {
    ...products[index],
    ...input,
    updatedDate: today(),
    updatedBy: actor
  };
  products[index] = updated;
  writeAll(products);
  return updated;
}

// Products are never physically removed (Artwork/Comparison/Approvals will
// reference them later) — deactivating just flips status to Inactive.
export function deactivateProduct(id: string, actor: string): Product | undefined {
  return updateProduct(id, { status: 'Inactive' }, actor);
}
