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
import apiClient, { actorHeaders } from './apiClient';

type AuditedRecord = { id: string; status: MasterStatus; createdDate: string; updatedDate: string; createdBy: string; updatedBy: string };

// resourcePath is the kebab-case plural segment masters.routes.ts mounts each
// master under (e.g. 'marketing-companies') — id and every audit field are
// assigned by the backend, not generated here (see backend/src/types/domain.ts,
// where every *Input type deliberately excludes them).
function makeCollection<T extends AuditedRecord, TInput extends object>(resourcePath: string) {
  async function getAll(): Promise<T[]> {
    const { data } = await apiClient.get(`/masters/${resourcePath}`);
    return data;
  }

  async function getById(id: string): Promise<T | undefined> {
    try {
      const { data } = await apiClient.get(`/masters/${resourcePath}/${id}`);
      return data;
    } catch {
      return undefined;
    }
  }

  async function create(input: TInput, actor: string): Promise<T> {
    const { data } = await apiClient.post(`/masters/${resourcePath}`, input, { headers: actorHeaders(actor) });
    return data;
  }

  async function update(id: string, input: Partial<TInput>, actor: string): Promise<T | undefined> {
    try {
      const { data } = await apiClient.patch(`/masters/${resourcePath}/${id}`, input, { headers: actorHeaders(actor) });
      return data;
    } catch {
      return undefined;
    }
  }

  async function deactivate(id: string, actor: string): Promise<T | undefined> {
    return update(id, { status: 'Inactive' } as unknown as Partial<TInput>, actor);
  }

  return { getAll, getById, create, update, deactivate };
}

const norm = (value: string) => value.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Marketing Companies
// ---------------------------------------------------------------------------
const marketingCompanyCollection = makeCollection<MarketingCompany, MarketingCompanyInput>('marketing-companies');
export const getMarketingCompanies = marketingCompanyCollection.getAll;
export const createMarketingCompany = marketingCompanyCollection.create;
export const updateMarketingCompany = marketingCompanyCollection.update;
export const deactivateMarketingCompany = marketingCompanyCollection.deactivate;
export async function findDuplicateMarketingCompany(companyName: string, excludeId?: string): Promise<MarketingCompany | undefined> {
  const all = await marketingCompanyCollection.getAll();
  return all.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.companyName) === norm(companyName));
}

// ---------------------------------------------------------------------------
// Manufacturing Companies
// ---------------------------------------------------------------------------
const manufacturingCompanyCollection = makeCollection<ManufacturingCompany, ManufacturingCompanyInput>('manufacturing-companies');
export const getManufacturingCompanies = manufacturingCompanyCollection.getAll;
export const createManufacturingCompany = manufacturingCompanyCollection.create;
export const updateManufacturingCompany = manufacturingCompanyCollection.update;
export const deactivateManufacturingCompany = manufacturingCompanyCollection.deactivate;
export async function findDuplicateManufacturingCompany(companyName: string, excludeId?: string): Promise<ManufacturingCompany | undefined> {
  const all = await manufacturingCompanyCollection.getAll();
  return all.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.companyName) === norm(companyName));
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
const brandCollection = makeCollection<Brand, BrandInput>('brands');
export const getBrands = brandCollection.getAll;
export const createBrand = brandCollection.create;
export const updateBrand = brandCollection.update;
export const deactivateBrand = brandCollection.deactivate;

export async function findDuplicateBrand(brandName: string, marketingCompany: string, excludeId?: string): Promise<Brand | undefined> {
  const all = await brandCollection.getAll();
  return all.find(
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
const flavourCollection = makeCollection<Flavour, FlavourInput>('flavours');
export const getFlavours = flavourCollection.getAll;
export const createFlavour = flavourCollection.create;
export const updateFlavour = flavourCollection.update;
export const deactivateFlavour = flavourCollection.deactivate;
export async function findDuplicateFlavour(flavourName: string, excludeId?: string): Promise<Flavour | undefined> {
  const all = await flavourCollection.getAll();
  return all.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.flavourName) === norm(flavourName));
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------
const claimCollection = makeCollection<Claim, ClaimInput>('claims');
export const getClaims = claimCollection.getAll;
export const createClaim = claimCollection.create;
export const updateClaim = claimCollection.update;
export const deactivateClaim = claimCollection.deactivate;
export async function findDuplicateClaim(claimText: string, excludeId?: string): Promise<Claim | undefined> {
  const all = await claimCollection.getAll();
  return all.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.claimText) === norm(claimText));
}

// ---------------------------------------------------------------------------
// Product Categories
// ---------------------------------------------------------------------------
const productCategoryCollection = makeCollection<ProductCategory, ProductCategoryInput>('product-categories');
export const getProductCategories = productCategoryCollection.getAll;
export const createProductCategory = productCategoryCollection.create;
export const updateProductCategory = productCategoryCollection.update;
export const deactivateProductCategory = productCategoryCollection.deactivate;
export async function findDuplicateProductCategory(categoryName: string, excludeId?: string): Promise<ProductCategory | undefined> {
  const all = await productCategoryCollection.getAll();
  return all.find((item) => item.id !== excludeId && item.status === 'Active' && norm(item.categoryName) === norm(categoryName));
}

// ---------------------------------------------------------------------------
// Get-or-create helpers
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

export async function getOrCreateMarketingCompany(companyName: string, actor: string): Promise<MarketingCompany> {
  const name = companyName.trim();
  const all = await marketingCompanyCollection.getAll();
  const existing = all.find((company) => norm(company.companyName) === norm(name));
  if (existing) return existing;
  const codes = new Set(all.map((company) => company.shortCode));
  return createMarketingCompany({ companyName: name, shortCode: deriveShortCode(name, codes), status: 'Active' }, actor);
}

export async function getOrCreateManufacturingCompany(companyName: string, actor: string): Promise<ManufacturingCompany> {
  const name = companyName.trim();
  const all = await manufacturingCompanyCollection.getAll();
  const existing = all.find((company) => norm(company.companyName) === norm(name));
  if (existing) return existing;
  const codes = new Set(all.map((company) => company.shortCode));
  return createManufacturingCompany({ companyName: name, shortCode: deriveShortCode(name, codes), status: 'Active' }, actor);
}

export async function getOrCreateBrand(brandName: string, marketingCompany: string, actor: string): Promise<Brand> {
  const name = brandName.trim();
  const all = await brandCollection.getAll();
  const existing = all.find((brand) => norm(brand.brandName) === norm(name) && norm(brand.marketingCompany) === norm(marketingCompany));
  if (existing) return existing;
  return createBrand({ brandName: name, marketingCompany, status: 'Active' }, actor);
}

export async function getOrCreateFlavour(flavourName: string, actor: string): Promise<Flavour> {
  const name = flavourName.trim();
  const all = await flavourCollection.getAll();
  const existing = all.find((flavour) => norm(flavour.flavourName) === norm(name));
  if (existing) return existing;
  return createFlavour({ flavourName: name, status: 'Active' }, actor);
}
