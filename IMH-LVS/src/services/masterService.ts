// Master/reference data access layer — mirrors productService.ts's
// localStorage-backed pattern so both can later be swapped for real API
// calls without touching the UI. One generic collection helper avoids
// repeating the same CRUD logic six times; the exported functions below
// give each master type its own named API as required.

import {
  Brand,
  BrandInput,
  Claim,
  ClaimInput,
  Flavour,
  FlavourInput,
  ManufacturingCompany,
  ManufacturingCompanyInput,
  MarketingCompany,
  MarketingCompanyInput,
  MasterStatus,
  ProductCategory,
  ProductCategoryInput
} from '../types/masters';
import {
  SEED_BRANDS,
  SEED_CLAIMS,
  SEED_FLAVOURS,
  SEED_MANUFACTURING_COMPANIES,
  SEED_MARKETING_COMPANIES,
  SEED_PRODUCT_CATEGORIES
} from '../data/masters';

type AuditedRecord = { id: string; status: MasterStatus; createdDate: string; updatedDate: string; createdBy: string; updatedBy: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeCollection<T extends AuditedRecord, TInput extends object>(storageKey: string, seed: T[], idPrefix: string) {
  function readAll(): T[] {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      localStorage.setItem(storageKey, JSON.stringify(seed));
      return seed;
    }
    try {
      return JSON.parse(raw) as T[];
    } catch {
      localStorage.setItem(storageKey, JSON.stringify(seed));
      return seed;
    }
  }

  function writeAll(items: T[]) {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }

  function nextId(existing: T[]): string {
    const pattern = new RegExp(`^${idPrefix}-(\\d+)$`);
    const maxSeq = existing.reduce((max, item) => {
      const match = pattern.exec(item.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${idPrefix}-${String(maxSeq + 1).padStart(4, '0')}`;
  }

  function getAll(): T[] {
    return readAll();
  }

  function getById(id: string): T | undefined {
    return readAll().find((item) => item.id === id);
  }

  function create(input: TInput, actor: string): T {
    const items = readAll();
    const now = today();
    const newItem = {
      ...input,
      id: nextId(items),
      createdDate: now,
      updatedDate: now,
      createdBy: actor,
      updatedBy: actor
    } as unknown as T;
    writeAll([...items, newItem]);
    return newItem;
  }

  function update(id: string, input: Partial<TInput>, actor: string): T | undefined {
    const items = readAll();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return undefined;
    const updated: T = { ...items[index], ...input, updatedDate: today(), updatedBy: actor };
    items[index] = updated;
    writeAll(items);
    return updated;
  }

  function deactivate(id: string, actor: string): T | undefined {
    return update(id, { status: 'Inactive' } as unknown as Partial<TInput>, actor);
  }

  return { getAll, getById, create, update, deactivate };
}

const norm = (value: string) => value.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Marketing Companies
// ---------------------------------------------------------------------------
const marketingCompanyCollection = makeCollection<MarketingCompany, MarketingCompanyInput>(
  'imh_lvs_marketing_companies',
  SEED_MARKETING_COMPANIES,
  'MKT'
);
export const getMarketingCompanies = marketingCompanyCollection.getAll;
export const createMarketingCompany = marketingCompanyCollection.create;
export const updateMarketingCompany = marketingCompanyCollection.update;
export const deactivateMarketingCompany = marketingCompanyCollection.deactivate;
export function findDuplicateMarketingCompany(companyName: string, excludeId?: string): MarketingCompany | undefined {
  return marketingCompanyCollection
    .getAll()
    .find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.companyName) === norm(companyName));
}

// ---------------------------------------------------------------------------
// Manufacturing Companies
// ---------------------------------------------------------------------------
const manufacturingCompanyCollection = makeCollection<ManufacturingCompany, ManufacturingCompanyInput>(
  'imh_lvs_manufacturing_companies',
  SEED_MANUFACTURING_COMPANIES,
  'MFG'
);
export const getManufacturingCompanies = manufacturingCompanyCollection.getAll;
export const createManufacturingCompany = manufacturingCompanyCollection.create;
export const updateManufacturingCompany = manufacturingCompanyCollection.update;
export const deactivateManufacturingCompany = manufacturingCompanyCollection.deactivate;
export function findDuplicateManufacturingCompany(companyName: string, excludeId?: string): ManufacturingCompany | undefined {
  return manufacturingCompanyCollection
    .getAll()
    .find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.companyName) === norm(companyName));
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
const brandCollection = makeCollection<Brand, BrandInput>('imh_lvs_brands', SEED_BRANDS, 'BRD');
export const getBrands = brandCollection.getAll;
export const createBrand = brandCollection.create;
export const updateBrand = brandCollection.update;
export const deactivateBrand = brandCollection.deactivate;

// Brand names are case-sensitive data (never normalized on save), but the
// duplicate check still compares case-insensitively — "VitaFit" vs
// "vitafit" under the same marketing company is flagged for review rather
// than silently allowed or silently merged.
export function findDuplicateBrand(brandName: string, marketingCompany: string, excludeId?: string): Brand | undefined {
  return brandCollection
    .getAll()
    .find(
      (item) =>
        item.id !== excludeId &&
        item.status === 'Active' &&
        norm(item.brandName) === norm(brandName) &&
        norm(item.marketingCompany) === norm(marketingCompany)
    );
}

// ---------------------------------------------------------------------------
// Flavours
// ---------------------------------------------------------------------------
const flavourCollection = makeCollection<Flavour, FlavourInput>('imh_lvs_flavours', SEED_FLAVOURS, 'FLV');
export const getFlavours = flavourCollection.getAll;
export const createFlavour = flavourCollection.create;
export const updateFlavour = flavourCollection.update;
export const deactivateFlavour = flavourCollection.deactivate;
export function findDuplicateFlavour(flavourName: string, excludeId?: string): Flavour | undefined {
  return flavourCollection
    .getAll()
    .find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.flavourName) === norm(flavourName));
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------
const claimCollection = makeCollection<Claim, ClaimInput>('imh_lvs_claims', SEED_CLAIMS, 'CLM');
export const getClaims = claimCollection.getAll;
export const createClaim = claimCollection.create;
export const updateClaim = claimCollection.update;
export const deactivateClaim = claimCollection.deactivate;
export function findDuplicateClaim(claimText: string, excludeId?: string): Claim | undefined {
  return claimCollection.getAll().find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.claimText) === norm(claimText));
}

// ---------------------------------------------------------------------------
// Product Categories
// ---------------------------------------------------------------------------
const productCategoryCollection = makeCollection<ProductCategory, ProductCategoryInput>(
  'imh_lvs_product_categories',
  SEED_PRODUCT_CATEGORIES,
  'CAT'
);
export const getProductCategories = productCategoryCollection.getAll;
export const createProductCategory = productCategoryCollection.create;
export const updateProductCategory = productCategoryCollection.update;
export const deactivateProductCategory = productCategoryCollection.deactivate;
export function findDuplicateProductCategory(categoryName: string, excludeId?: string): ProductCategory | undefined {
  return productCategoryCollection
    .getAll()
    .find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.categoryName) === norm(categoryName));
}

// ---------------------------------------------------------------------------
// Get-or-create helpers — used by the label-driven product intake pipeline
// (services/labelIntakeService.ts) so uploading a label reuses an existing
// Marketing Company / Brand / Flavour / Manufacturing Company master record
// instead of ever creating a duplicate. Matching ignores status (an
// inactive master still counts as "existing") since the point is purely to
// avoid duplicates; manual creation through Master Data Management above is
// unaffected.
// ---------------------------------------------------------------------------

function deriveShortCode(name: string, existingCodes: Set<string>): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words.map((word) => word[0]).join('') : name.slice(0, 3)).toUpperCase() || 'GEN';
  let code = base;
  let suffix = 1;
  while (existingCodes.has(code)) {
    suffix += 1;
    code = `${base}${suffix}`;
  }
  return code;
}

export function getOrCreateMarketingCompany(companyName: string, actor: string): MarketingCompany {
  const name = companyName.trim();
  const existing = marketingCompanyCollection.getAll().find((company) => norm(company.companyName) === norm(name));
  if (existing) return existing;
  const codes = new Set(marketingCompanyCollection.getAll().map((company) => company.shortCode));
  return createMarketingCompany({ companyName: name, shortCode: deriveShortCode(name, codes), status: 'Active' }, actor);
}

export function getOrCreateManufacturingCompany(companyName: string, actor: string): ManufacturingCompany {
  const name = companyName.trim();
  const existing = manufacturingCompanyCollection.getAll().find((company) => norm(company.companyName) === norm(name));
  if (existing) return existing;
  const codes = new Set(manufacturingCompanyCollection.getAll().map((company) => company.shortCode));
  return createManufacturingCompany({ companyName: name, shortCode: deriveShortCode(name, codes), status: 'Active' }, actor);
}

export function getOrCreateBrand(brandName: string, marketingCompany: string, actor: string): Brand {
  const name = brandName.trim();
  const existing = brandCollection
    .getAll()
    .find((brand) => norm(brand.brandName) === norm(name) && norm(brand.marketingCompany) === norm(marketingCompany));
  if (existing) return existing;
  return createBrand({ brandName: name, marketingCompany, status: 'Active' }, actor);
}

export function getOrCreateFlavour(flavourName: string, actor: string): Flavour {
  const name = flavourName.trim();
  const existing = flavourCollection.getAll().find((flavour) => norm(flavour.flavourName) === norm(name));
  if (existing) return existing;
  return createFlavour({ flavourName: name, status: 'Active' }, actor);
}
