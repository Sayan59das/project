// The API contract: the shapes this backend accepts and returns.
//
// These MIRROR the frontend's src/types/{product,artwork,comparison,masters}.ts
// and src/types/user.ts. They are duplicated rather than imported
// because the backend is built and deployed on its own (see Dockerfile —
// only backend/src is copied) and tsconfig's rootDir is src/, so reaching
// across into the frontend tree would break both the build and the image.
//
// KEEP IN SYNC. If a field changes on one side it must change on both. The
// repository tests assert the round-trip, so drift shows up as a failing
// test rather than as a field that quietly stops being saved.
//
// Naming: this layer is camelCase (what the frontend already consumes) and
// the database is snake_case. src/repositories/mappers.ts is the single
// place that translation happens.

// ---------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------

export type MasterStatus = 'Active' | 'Inactive';

export type AuditFields = {
  createdDate: string; // 'YYYY-MM-DD'
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

export type Brand = AuditFields & {
  id: string; // BRD-0001
  brandName: string;
  marketingCompany: string; // company NAME, not id — matches the frontend
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

export type MasterTypeKey =
  | 'marketingCompanies'
  | 'manufacturingCompanies'
  | 'brands'
  | 'flavours'
  | 'claims'
  | 'productCategories';

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

// The frontend's UserStatus has four values where the database's
// master_status enum has two. See migration 002, which gives users their own
// wider status type rather than silently collapsing 'Pending' and
// 'Restricted' into 'Inactive'.
export type UserStatus = 'Active' | 'Inactive' | 'Pending' | 'Restricted';

// The modules the app is divided into — the closed set MODULES in
// src/auth/permissions.ts defines. Mirrored here because the database
// enforces it as an enum (see 003_user_module_access.sql) and because a
// module id arriving over HTTP has to be validated against something. Only
// the list of names is duplicated: the role -> default-access POLICY stays
// solely in permissions.ts, so there is no second copy of it to drift.
export const APP_MODULES = [
  'dashboard',
  'products',
  'artwork',
  'comparison',
  'approvals',
  'qa-verification',
  'reports',
  'masters',
  'users',
  'settings'
] as const;

export type AppModuleId = (typeof APP_MODULES)[number];

// Per-user OVERRIDES, not a complete access sheet. A module missing from this
// map has no override, and the caller applies the role's default. An empty
// map and an absent map therefore mean the same thing, which is why
// AppUser.moduleAccess is optional rather than defaulted to {}.
export type ModuleAccess = Partial<Record<AppModuleId, boolean>>;

export type AppUser = {
  id: string; // 'U-001' in the frontend seed data
  fullName: string;
  email: string;
  role: string;
  department: string;
  status: UserStatus;
  createdDate: string;
  phone?: string;
  lastLogin?: string;

  // Absent when this user has no stored overrides — the common case, and
  // not the same as "no access". See ModuleAccess above.
  moduleAccess?: ModuleAccess;
};

// ---------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------

export type ProductStatus = 'Active' | 'On Hold' | 'Pending QA' | 'Pending Approval' | 'Inactive';
export type ProductOrigin = 'Label Upload' | 'Manual Entry';

export type Product = {
  id: string; // PRD-0001
  productName: string;
  brandName: string;
  marketingCompany: string;
  manufacturingCompany: string;
  flavour: string;
  fssaiNumber: string;
  packageSize?: string;
  status: ProductStatus;
  createdDate: string;
  updatedDate: string;
  createdBy: string;
  updatedBy: string;
  origin?: ProductOrigin;
  sourceArtworkId?: string;
};

export type ProductInput = Pick<
  Product,
  | 'productName'
  | 'brandName'
  | 'marketingCompany'
  | 'manufacturingCompany'
  | 'flavour'
  | 'fssaiNumber'
  | 'status'
> & { packageSize?: string };

// ---------------------------------------------------------------------
// Artwork
// ---------------------------------------------------------------------

export type ArtworkType = 'Full Label' | 'Front Artwork' | 'Back Artwork';

export type ArtworkStatus =
  | 'Draft'
  | 'Pending Comparison'
  | 'Under Review'
  | 'Approved'
  | 'Final Approved'
  | 'Revision Required'
  | 'Rejected'
  | 'Archived';

export type Artwork = {
  id: string; // ART-0001
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  version: string; // 'V1' — stored as the integer artworks.version_number
  artworkType: ArtworkType;
  fileName: string;
  fileType: string; // -> artworks.mime_type
  fileSize: number; // -> artworks.byte_size
  // -> artworks.storage_key. '' means no durably stored file, which is the
  // honest state of every record made before object storage existed: the
  // frontend put a browser object URL here and that dies with the tab.
  filePath: string;
  status: ArtworkStatus;
  remarks: string;
  uploadedBy: string;
  uploadDate: string;
  updatedBy: string;
  updatedDate: string;
};

export type ArtworkInput = Omit<
  Artwork,
  'id' | 'uploadedBy' | 'uploadDate' | 'updatedBy' | 'updatedDate'
>;

// ---------------------------------------------------------------------
// Label attributes — what OCR extracted from one artwork
// ---------------------------------------------------------------------

// Every field is '' when not captured, never a placeholder string. The
// database stores NULL for those and the mappers translate. Storing
// 'Not specified' as content is what let the comparison engine report
// unknown-vs-unknown as a MATCH; migration 001 has a CHECK constraint that
// makes it unrepresentable.
export type LabelAttributes = {
  artworkId: string;
  brandName: string;
  productName: string;
  address: string;
  customerCareNumber: string;
  customerCareEmail: string;
  colourTheme: string;
  flavour: string;
  claims: string;
  logo: string;
  labelDesign: string;
  nutritionTableFormat: string;
  fssaiNumber: string;
  ingredients: string;
};

export type LabelAttributesSource = 'ocr' | 'manual' | 'seed';

// ---------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------

export type ParameterResult = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING';
export type OverallResult = 'MATCH' | 'REVIEW REQUIRED' | 'CONFLICT';
export type ComparisonStage = 'same_company' | 'cross_company';

export const COMPARISON_PARAMETERS = [
  'Brand Name',
  'Product Name',
  'Address',
  'Customer Care Number',
  'Customer Care Email',
  'Colour Theme',
  'Flavour',
  'Claims',
  'Logo',
  'Label Design / Layout',
  'Nutrition Table Format',
  'FSSAI Number',
  'Ingredients'
] as const;

export type ComparisonParameterName = (typeof COMPARISON_PARAMETERS)[number];

export type ParameterComparison = {
  parameter: ComparisonParameterName;
  referenceValue: string; // '' = not captured (NULL in the database)
  newValue: string;
  result: ParameterResult;
};

export type ComparisonStatus =
  | 'Draft'
  | 'In Progress'
  | 'Completed'
  | 'Pending Label Final'
  | 'Label Final Approved'
  | 'Pending Technical'
  | 'Technical Approved'
  | 'Pending QA'
  | 'QA Approved'
  | 'Pending Manager Approval'
  | 'Final Approved'
  | 'Revision Required'
  | 'Rejected';

export type WorkflowStage = 'Label Final' | 'Technical' | 'QA' | 'Manager';

export type WorkflowAction =
  | 'Sent to Technical'
  | 'Sent to QA'
  | 'Sent to Manager'
  | 'Final Approved'
  | 'Rejected'
  | 'Revision Requested';

export type ApprovalAssignments = {
  labelFinal?: string;
  technical?: string;
  qa?: string;
  manager?: string;
};

export type WorkflowHistoryEntry = {
  stage: WorkflowStage;
  action: WorkflowAction;
  resultingStatus: ComparisonStatus;
  approvalUserId?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  date: string;
  remarks: string;
};

export type Comparison = {
  id: string; // CMP-0001
  productId: string;
  // Denormalised for display, and NOT stored on the comparisons row — the
  // repository reconstructs these by joining products/artworks, so they
  // cannot drift from the records they describe.
  productName: string;
  stage: ComparisonStage;

  newArtworkId: string;
  newArtworkVersion: string;
  newArtworkCompany: string;

  // '' when a cross-company comparison found no candidate. NULL in the
  // database; a same-company comparison has a CHECK forbidding absence.
  referenceArtworkId: string;
  referenceArtworkVersion: string;
  referenceArtworkCompany: string;

  parameters: ParameterComparison[];
  overallSimilarity: number; // 0-100
  overallResult: OverallResult;
  status: ComparisonStatus;
  qaRemarks?: string;
  history: WorkflowHistoryEntry[];
  approvalAssignments: ApprovalAssignments;

  comparedBy: string;
  comparisonDate: string;
  updatedBy: string;
  updatedDate: string;
};

export type CrossCompanyCandidate = {
  productId: string;
  productName: string;
  marketingCompany: string;
  artworkId: string;
  artworkVersion: string;
};
