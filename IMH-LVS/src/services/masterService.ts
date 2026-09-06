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
import apiClient from './apiClient';

type AuditedRecord = { id: string; status: MasterStatus; createdDate: string; updatedDate: string; createdBy: string; updatedBy: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeCollection<T extends AuditedRecord, TInput extends object>(modelName: string) {
  async function getAll(): Promise<T[]> {
    const { data } = await apiClient.get(`/data/${modelName}`);
    return data;
  }

  async function getById(id: string): Promise<T | undefined> {
    try {
      const { data } = await apiClient.get(`/data/${modelName}/${id}`);
      return data;
    } catch {
      return undefined;
    }
  }

  // Helper logic for ID generation might need to move to backend, but we'll do it on frontend for now by reading all
  async function create(input: TInput, actor: string): Promise<T> {
    // Generate an ID based on existing records
    const all = await getAll();
    const idPrefix = modelName.substring(0, 3).toUpperCase();
    const pattern = new RegExp(`^${idPrefix}-(\\d+)$`);
    const maxSeq = all.reduce((max, item) => {
      const match = pattern.exec(item.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const newId = `${idPrefix}-${String(maxSeq + 1).padStart(4, '0')}`;

    const now = today();
    const newItem = {
      ...input,
      id: newId,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      createdBy: actor,
      updatedBy: actor
    };

    const { data } = await apiClient.post(`/data/${modelName}`, newItem);
    return data;
  }

  async function update(id: string, input: Partial<TInput>, actor: string): Promise<T | undefined> {
    const updatedPayload = { ...input, updatedBy: actor, updatedDate: new Date().toISOString() };
    try {
      const { data } = await apiClient.put(`/data/${modelName}/${id}`, updatedPayload);
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
const marketingCompanyCollection = makeCollection<MarketingCompany, MarketingCompanyInput>('MarketingCompany');
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
const manufacturingCompanyCollection = makeCollection<ManufacturingCompany, ManufacturingCompanyInput>('ManufacturingCompany');
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
const brandCollection = makeCollection<Brand, BrandInput>('Brand');
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
const flavourCollection = makeCollection<Flavour, FlavourInput>('Flavour');
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
const claimCollection = makeCollection<Claim, ClaimInput>('Claim');
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
const productCategoryCollection = makeCollection<ProductCategory, ProductCategoryInput>('ProductCategory');
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
