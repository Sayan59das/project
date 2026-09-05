// Master/reference data shared across the LVS app. Products, and later
// Artwork/Comparison, consume these via masterService rather than
// hardcoding dropdown values.

export type MasterStatus = 'Active' | 'Inactive';

type AuditFields = {
  createdDate: string;
  updatedDate: string;
  createdBy: string;
  updatedBy: string;
};

export type MarketingCompany = AuditFields & {
  id: string; // MKT-0001
  companyName: string;
  shortCode: string;
  status: MasterStatus;
};

export type ManufacturingCompany = AuditFields & {
  id: string; // MFG-0001
  companyName: string;
  shortCode: string;
  status: MasterStatus;
};

// marketingCompany stores the company NAME (not id) — same reference
// pattern Product Management already uses for its company fields.
export type Brand = AuditFields & {
  id: string; // BRD-0001
  brandName: string;
  marketingCompany: string;
  status: MasterStatus;
};

export type Flavour = AuditFields & {
  id: string; // FLV-0001
  flavourName: string;
  status: MasterStatus;
};

export type Claim = AuditFields & {
  id: string; // CLM-0001
  claimText: string;
  description: string;
  status: MasterStatus;
};

export type ProductCategory = AuditFields & {
  id: string; // CAT-0001
  categoryName: string;
  description: string;
  status: MasterStatus;
};

export type MarketingCompanyInput = Pick<MarketingCompany, 'companyName' | 'shortCode' | 'status'>;
export type ManufacturingCompanyInput = Pick<ManufacturingCompany, 'companyName' | 'shortCode' | 'status'>;
export type BrandInput = Pick<Brand, 'brandName' | 'marketingCompany' | 'status'>;
export type FlavourInput = Pick<Flavour, 'flavourName' | 'status'>;
export type ClaimInput = Pick<Claim, 'claimText' | 'description' | 'status'>;
export type ProductCategoryInput = Pick<ProductCategory, 'categoryName' | 'description' | 'status'>;

export type MasterTypeKey = 'marketingCompanies' | 'manufacturingCompanies' | 'brands' | 'flavours' | 'claims' | 'productCategories';

export const MASTER_TYPES: { key: MasterTypeKey; label: string; addLabel: string }[] = [
  { key: 'marketingCompanies', label: 'Parties', addLabel: 'Party' },
  { key: 'manufacturingCompanies', label: 'Manufacturing Companies', addLabel: 'Manufacturing Company' },
  { key: 'brands', label: 'Brands', addLabel: 'Brand' },
  { key: 'flavours', label: 'Flavours', addLabel: 'Flavour' },
  { key: 'claims', label: 'Claims', addLabel: 'Claim' },
  { key: 'productCategories', label: 'Product Categories', addLabel: 'Product Category' }
];
