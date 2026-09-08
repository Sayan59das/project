// Master/reference data, against the real API.
//
// Was six localStorage collections seeded from src/data/masters.ts, which meant
// every browser had its own brand list: a Manager adding "VitaFit" saw it, and
// nobody else did — including the label intake pipeline running on another
// machine, which then created its own "VitaFit" row. The six tables have been
// in Postgres since the persistence layer landed; this file finally reads them.
//
// ONE generic collection again, for the same reason the backend builds one
// router six times (see backend/src/routes/masters.routes.ts): the six differ
// only in their fields, and duplicating list/read/create/update per resource is
// how five end up correct and the sixth quietly does not.
//
// NO `actor` PARAMETER. It used to be threaded through every call from the
// page. The server now takes the actor from the session cookie
// (controllers/http.ts's requireActor), so a client-supplied name is at best
// ignored and at worst a claim to be somebody else.

import { ApiError, apiRequest, findOne } from './apiClient';
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
  MasterTypeKey,
  ProductCategory,
  ProductCategoryInput
} from '../types/masters';

/** Frontend key -> the resource segment the API mounts it under. */
export const MASTER_PATHS: Record<MasterTypeKey, string> = {
  marketingCompanies: 'marketing-companies',
  manufacturingCompanies: 'manufacturing-companies',
  brands: 'brands',
  flavours: 'flavours',
  claims: 'claims',
  productCategories: 'product-categories'
};

type Collection<T, TInput> = {
  list: () => Promise<T[]>;
  getById: (id: string) => Promise<T | undefined>;
  create: (input: TInput) => Promise<T>;
  update: (id: string, patch: Partial<TInput>) => Promise<T | undefined>;
  deactivate: (id: string) => Promise<T | undefined>;
};

function makeCollection<T, TInput extends object>(key: MasterTypeKey): Collection<T, TInput> {
  const path = `/masters/${MASTER_PATHS[key]}`;
  const url = (id: string) => `${path}/${encodeURIComponent(id)}`;

  const update = (id: string, patch: Partial<TInput>) =>
    findOne(apiRequest<T>(url(id), { method: 'PATCH', body: patch }));

  return {
    list: () => apiRequest<T[]>(path),
    // findOne, not a blanket catch: only a 404 is "no such record". A 401 or an
    // unreachable server must not be reported as an absent master, or a
    // get-or-create would answer an outage by creating a duplicate.
    getById: (id) => findOne(apiRequest<T>(url(id))),
    create: (input) => apiRequest<T>(path, { method: 'POST', body: input }),
    update,
    // Masters are never deleted — a brand referenced by an approved label has
    // to stay readable — so "remove" is a status change, and it is written out
    // here rather than left to each caller to remember.
    deactivate: (id) => update(id, { status: 'Inactive' } as unknown as Partial<TInput>)
  };
}

const norm = (value: string) => value.trim().toLowerCase();

// ---------------------------------------------------------------------------
// The six collections
// ---------------------------------------------------------------------------

const marketingCompanyCollection = makeCollection<MarketingCompany, MarketingCompanyInput>('marketingCompanies');
export const getMarketingCompanies = marketingCompanyCollection.list;
export const getMarketingCompanyById = marketingCompanyCollection.getById;
export const createMarketingCompany = marketingCompanyCollection.create;
export const updateMarketingCompany = marketingCompanyCollection.update;
export const deactivateMarketingCompany = marketingCompanyCollection.deactivate;

const manufacturingCompanyCollection = makeCollection<ManufacturingCompany, ManufacturingCompanyInput>('manufacturingCompanies');
export const getManufacturingCompanies = manufacturingCompanyCollection.list;
export const getManufacturingCompanyById = manufacturingCompanyCollection.getById;
export const createManufacturingCompany = manufacturingCompanyCollection.create;
export const updateManufacturingCompany = manufacturingCompanyCollection.update;
export const deactivateManufacturingCompany = manufacturingCompanyCollection.deactivate;

const brandCollection = makeCollection<Brand, BrandInput>('brands');
export const getBrands = brandCollection.list;
export const getBrandById = brandCollection.getById;
export const createBrand = brandCollection.create;
export const updateBrand = brandCollection.update;
export const deactivateBrand = brandCollection.deactivate;

const flavourCollection = makeCollection<Flavour, FlavourInput>('flavours');
export const getFlavours = flavourCollection.list;
export const getFlavourById = flavourCollection.getById;
export const createFlavour = flavourCollection.create;
export const updateFlavour = flavourCollection.update;
export const deactivateFlavour = flavourCollection.deactivate;

const claimCollection = makeCollection<Claim, ClaimInput>('claims');
export const getClaims = claimCollection.list;
export const getClaimById = claimCollection.getById;
export const createClaim = claimCollection.create;
export const updateClaim = claimCollection.update;
export const deactivateClaim = claimCollection.deactivate;

const productCategoryCollection = makeCollection<ProductCategory, ProductCategoryInput>('productCategories');
export const getProductCategories = productCategoryCollection.list;
export const getProductCategoryById = productCategoryCollection.getById;
export const createProductCategory = productCategoryCollection.create;
export const updateProductCategory = productCategoryCollection.update;
export const deactivateProductCategory = productCategoryCollection.deactivate;

// ---------------------------------------------------------------------------
// Duplicate checks
//
// SELECTORS over a list the caller already holds, not requests of their own.
// The screen asking "is this a duplicate?" is showing that exact list, and a
// lookup endpoint would answer from the same rows one render later.
//
// These are the ADVISORY half of the check — they warn before saving, and the
// user can still be told by the database, which owns the actual UNIQUE
// constraints and reports them with the offending name in the message.
// ---------------------------------------------------------------------------

export function findDuplicateMarketingCompany(
  companies: MarketingCompany[],
  companyName: string,
  excludeId?: string
): MarketingCompany | undefined {
  return companies.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.companyName) === norm(companyName));
}

export function findDuplicateManufacturingCompany(
  companies: ManufacturingCompany[],
  companyName: string,
  excludeId?: string
): ManufacturingCompany | undefined {
  return companies.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.companyName) === norm(companyName));
}

// Brand names are case-sensitive data (never normalized on save), but the
// duplicate check still compares case-insensitively — "VitaFit" vs "vitafit"
// under the same marketing company is flagged for review rather than silently
// allowed or silently merged.
export function findDuplicateBrand(
  brands: Brand[],
  brandName: string,
  marketingCompany: string,
  excludeId?: string
): Brand | undefined {
  return brands.find(
    (item) =>
      item.id !== excludeId &&
      item.status === 'Active' &&
      norm(item.brandName) === norm(brandName) &&
      norm(item.marketingCompany) === norm(marketingCompany)
  );
}

export function findDuplicateFlavour(flavours: Flavour[], flavourName: string, excludeId?: string): Flavour | undefined {
  return flavours.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.flavourName) === norm(flavourName));
}

export function findDuplicateClaim(claims: Claim[], claimText: string, excludeId?: string): Claim | undefined {
  return claims.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.claimText) === norm(claimText));
}

export function findDuplicateProductCategory(
  categories: ProductCategory[],
  categoryName: string,
  excludeId?: string
): ProductCategory | undefined {
  return categories.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.categoryName) === norm(categoryName));
}

// ---------------------------------------------------------------------------
// Get-or-create — used by the label-driven intake pipeline
// (services/labelIntakeService.ts) so uploading a label reuses an existing
// master record instead of creating a duplicate. Matching ignores status (an
// inactive master still counts as "existing") since the point is purely to
// avoid duplicates; manual creation through Masters is unaffected.
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

/**
 * Create, unless somebody else got there first.
 *
 * Read-then-create is not atomic across a network, and two labels for the same
 * new brand arriving together is not hypothetical — it is a morning's uploads.
 * The database's UNIQUE constraint settles it and returns a 409; the loser
 * re-reads and uses the row the winner made, which is what "get or create"
 * promised. Anything other than a 409 is a real failure and is thrown.
 */
async function createOrAdopt<T>(create: () => Promise<T>, reread: () => Promise<T | undefined>, label: string): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const existing = await reread();
    if (existing) return existing;
    // A 409 with nothing to find afterwards means the conflict was with
    // something this search cannot see, and silently carrying on would attach
    // the label to a master that does not exist.
    throw new ApiError(409, `${label} conflicts with an existing record that could not be read back.`);
  }
}

export async function getOrCreateMarketingCompany(companyName: string): Promise<MarketingCompany> {
  const name = companyName.trim();
  const companies = await getMarketingCompanies();
  const existing = companies.find((company) => norm(company.companyName) === norm(name));
  if (existing) return existing;

  const codes = new Set(companies.map((company) => company.shortCode));
  return createOrAdopt(
    () => createMarketingCompany({ companyName: name, shortCode: deriveShortCode(name, codes), status: 'Active' }),
    async () => (await getMarketingCompanies()).find((company) => norm(company.companyName) === norm(name)),
    `Marketing company "${name}"`
  );
}

export async function getOrCreateManufacturingCompany(companyName: string): Promise<ManufacturingCompany> {
  const name = companyName.trim();
  const companies = await getManufacturingCompanies();
  const existing = companies.find((company) => norm(company.companyName) === norm(name));
  if (existing) return existing;

  const codes = new Set(companies.map((company) => company.shortCode));
  return createOrAdopt(
    () => createManufacturingCompany({ companyName: name, shortCode: deriveShortCode(name, codes), status: 'Active' }),
    async () => (await getManufacturingCompanies()).find((company) => norm(company.companyName) === norm(name)),
    `Manufacturing company "${name}"`
  );
}

export async function getOrCreateBrand(brandName: string, marketingCompany: string): Promise<Brand> {
  const name = brandName.trim();
  const matches = (brand: Brand) => norm(brand.brandName) === norm(name) && norm(brand.marketingCompany) === norm(marketingCompany);

  const existing = (await getBrands()).find(matches);
  if (existing) return existing;

  return createOrAdopt(
    () => createBrand({ brandName: name, marketingCompany, status: 'Active' }),
    async () => (await getBrands()).find(matches),
    `Brand "${name}"`
  );
}

export async function getOrCreateFlavour(flavourName: string): Promise<Flavour> {
  const name = flavourName.trim();
  const matches = (flavour: Flavour) => norm(flavour.flavourName) === norm(name);

  const existing = (await getFlavours()).find(matches);
  if (existing) return existing;

  return createOrAdopt(
    () => createFlavour({ flavourName: name, status: 'Active' }),
    async () => (await getFlavours()).find(matches),
    `Flavour "${name}"`
  );
}
