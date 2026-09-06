// Master/reference data repository — marketing companies, manufacturing
// companies, brands, flavours, claims and product categories.
//
// Mirrors the frontend's src/services/masterService.ts one-for-one: same
// six types, same list/getById/create/update shape, same "referenced by
// name, not id" pattern for brands -> marketing company (see migration 001,
// note 2). The frontend's generic makeCollection() factory is not
// reproduced here — building the query text generically would trade the
// "explicit column list" requirement for a runtime-assembled one, and each
// table's error-translation needs (brands has an FK, the rest don't) differ
// enough that six explicit blocks stay easier to verify than one clever
// factory would be. The genuinely mechanical bits — id issuance, joining a
// caller's transaction, plain list/getById — ARE factored below, since
// those really are identical per table.

import { Pool, PoolClient, QueryResultRow } from 'pg';
import { getPool, withTransaction } from '../db/pool';
import { toDateString } from './mappers';
import { Brand, Claim, Flavour, ManufacturingCompany, MarketingCompany, MasterStatus, ProductCategory } from '../types/domain';
import { ConflictError, DomainError } from '../middleware/domainError';

// Declared locally (not imported from a sibling repository) so the four
// repository modules stay decoupled from each other — see
// product.repository.ts / artwork.repository.ts / users.repository.ts for
// the identical copy. A plain (not `import type`) import of Pool because
// inTransaction below needs it as a runtime value for `instanceof`.
export type Queryable = Pick<Pool | PoolClient, 'query'>;

// Joins the caller's transaction when they are already inside one (they
// passed their PoolClient through); opens a fresh one around `fn` when
// called with the bare pool (the default). This matters because id
// issuance below is only race-safe if its advisory lock, its max()+1 read
// and the following INSERT all run on the SAME connection inside the SAME
// transaction — three separate pool.query() calls would each borrow a
// (possibly different) connection and the lock would protect nothing.
async function inTransaction<T>(db: Queryable, fn: (client: Queryable) => Promise<T>): Promise<T> {
  if (db instanceof Pool) return withTransaction(fn);
  return fn(db);
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

// The frontend computed max(seq)+1 over an in-memory array, which
// double-issues under concurrent writers. Taking a transaction-scoped
// advisory lock keyed by table name before reading max() closes that
// window: a second concurrent create for the same table blocks until the
// first one's transaction commits (pg_advisory_xact_lock auto-releases
// then), instead of both computing the same "next" id. `table` is always
// one of this file's own hardcoded literals below, never external input,
// so inlining it into the SQL text is not the "concatenated value" the
// parameterization rule otherwise forbids — table/column names can't be
// bind parameters in Postgres anyway.
async function nextSequentialId(client: Queryable, table: string, prefix: string): Promise<string> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${table}_id`]);
  const { rows } = await client.query<{ next_seq: number }>(
    `SELECT coalesce(max(substring(id from 5)::int), 0) + 1 AS next_seq FROM ${table}`
  );
  return `${prefix}-${String(rows[0].next_seq).padStart(4, '0')}`;
}

async function listRows<Row extends QueryResultRow, Api>(db: Queryable, table: string, columns: string, mapRow: (row: Row) => Api): Promise<Api[]> {
  const { rows } = await db.query<Row>(`SELECT ${columns} FROM ${table} ORDER BY id`);
  return rows.map(mapRow);
}

async function getRowById<Row extends QueryResultRow, Api>(
  db: Queryable,
  table: string,
  columns: string,
  id: string,
  mapRow: (row: Row) => Api
): Promise<Api | undefined> {
  const { rows } = await db.query<Row>(`SELECT ${columns} FROM ${table} WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Builds "column = $2, column = $3, ..." from only the keys actually
// present in `patch` (skipping ones whose value is undefined). This is what
// lets a caller omit a field to leave it unchanged. A COALESCE($n, column)
// style update would do the same for "omitted" but can never distinguish
// "omitted" from "explicitly clear this field" — building the SET list from
// only the supplied keys sidesteps that ambiguity entirely.
function buildAssignments<TInput extends object>(patch: Partial<TInput>, columnOf: Record<keyof TInput, string>): Array<[string, unknown]> {
  const assignments: Array<[string, unknown]> = [];
  for (const key of Object.keys(patch) as (keyof TInput)[]) {
    const value = patch[key];
    if (value !== undefined) assignments.push([columnOf[key], value]);
  }
  return assignments;
}

function toSetSql(assignments: Array<[string, unknown]>): string {
  return assignments.map(([col], i) => `${col} = $${i + 2}`).join(', ');
}

// ---------------------------------------------------------------------
// Marketing Companies
// ---------------------------------------------------------------------

type MarketingCompanyRow = {
  id: string;
  company_name: string;
  short_code: string;
  status: MasterStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
};

const MARKETING_COMPANY_COLUMNS = 'id, company_name, short_code, status, created_at, updated_at, created_by, updated_by';

function mapMarketingCompany(row: MarketingCompanyRow): MarketingCompany {
  return {
    id: row.id,
    companyName: row.company_name,
    shortCode: row.short_code,
    status: row.status,
    createdDate: toDateString(row.created_at),
    updatedDate: toDateString(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export type MarketingCompanyInput = Pick<MarketingCompany, 'companyName' | 'shortCode' | 'status'>;

const MARKETING_COMPANY_COLUMN_OF: Record<keyof MarketingCompanyInput, string> = {
  companyName: 'company_name',
  shortCode: 'short_code',
  status: 'status'
};

function listMarketingCompanies(db: Queryable = getPool()): Promise<MarketingCompany[]> {
  return listRows(db, 'marketing_companies', MARKETING_COMPANY_COLUMNS, mapMarketingCompany);
}

function getMarketingCompanyById(id: string, db: Queryable = getPool()): Promise<MarketingCompany | undefined> {
  return getRowById(db, 'marketing_companies', MARKETING_COMPANY_COLUMNS, id, mapMarketingCompany);
}

async function createMarketingCompany(input: MarketingCompanyInput, actor: string, db: Queryable = getPool()): Promise<MarketingCompany> {
  return inTransaction(db, async (client) => {
    const id = await nextSequentialId(client, 'marketing_companies', 'MKT');
    try {
      const { rows } = await client.query<MarketingCompanyRow>(
        `INSERT INTO marketing_companies (id, company_name, short_code, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING ${MARKETING_COMPANY_COLUMNS}`,
        [id, input.companyName, input.shortCode, input.status, actor]
      );
      return mapMarketingCompany(rows[0]);
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw new ConflictError(`A marketing company named "${input.companyName}" already exists.`);
      }
      throw error;
    }
  });
}

async function updateMarketingCompany(
  id: string,
  patch: Partial<MarketingCompanyInput>,
  actor: string,
  db: Queryable = getPool()
): Promise<MarketingCompany | undefined> {
  const assignments = buildAssignments<MarketingCompanyInput>(patch, MARKETING_COMPANY_COLUMN_OF);
  if (assignments.length === 0) return getMarketingCompanyById(id, db);

  try {
    const { rows } = await db.query<MarketingCompanyRow>(
      `UPDATE marketing_companies SET ${toSetSql(assignments)}, updated_by = $${assignments.length + 2}, updated_at = now()
       WHERE id = $1
       RETURNING ${MARKETING_COMPANY_COLUMNS}`,
      [id, ...assignments.map(([, v]) => v), actor]
    );
    return rows[0] ? mapMarketingCompany(rows[0]) : undefined;
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw new ConflictError(`A marketing company named "${patch.companyName}" already exists.`);
    }
    throw error;
  }
}

export const marketingCompanies = {
  list: listMarketingCompanies,
  getById: getMarketingCompanyById,
  create: createMarketingCompany,
  update: updateMarketingCompany
};

// ---------------------------------------------------------------------
// Manufacturing Companies
// ---------------------------------------------------------------------

type ManufacturingCompanyRow = MarketingCompanyRow;

const MANUFACTURING_COMPANY_COLUMNS = 'id, company_name, short_code, status, created_at, updated_at, created_by, updated_by';

function mapManufacturingCompany(row: ManufacturingCompanyRow): ManufacturingCompany {
  return {
    id: row.id,
    companyName: row.company_name,
    shortCode: row.short_code,
    status: row.status,
    createdDate: toDateString(row.created_at),
    updatedDate: toDateString(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export type ManufacturingCompanyInput = Pick<ManufacturingCompany, 'companyName' | 'shortCode' | 'status'>;

const MANUFACTURING_COMPANY_COLUMN_OF: Record<keyof ManufacturingCompanyInput, string> = {
  companyName: 'company_name',
  shortCode: 'short_code',
  status: 'status'
};

function listManufacturingCompanies(db: Queryable = getPool()): Promise<ManufacturingCompany[]> {
  return listRows(db, 'manufacturing_companies', MANUFACTURING_COMPANY_COLUMNS, mapManufacturingCompany);
}

function getManufacturingCompanyById(id: string, db: Queryable = getPool()): Promise<ManufacturingCompany | undefined> {
  return getRowById(db, 'manufacturing_companies', MANUFACTURING_COMPANY_COLUMNS, id, mapManufacturingCompany);
}

async function createManufacturingCompany(
  input: ManufacturingCompanyInput,
  actor: string,
  db: Queryable = getPool()
): Promise<ManufacturingCompany> {
  return inTransaction(db, async (client) => {
    const id = await nextSequentialId(client, 'manufacturing_companies', 'MFG');
    try {
      const { rows } = await client.query<ManufacturingCompanyRow>(
        `INSERT INTO manufacturing_companies (id, company_name, short_code, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING ${MANUFACTURING_COMPANY_COLUMNS}`,
        [id, input.companyName, input.shortCode, input.status, actor]
      );
      return mapManufacturingCompany(rows[0]);
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw new ConflictError(`A manufacturing company named "${input.companyName}" already exists.`);
      }
      throw error;
    }
  });
}

async function updateManufacturingCompany(
  id: string,
  patch: Partial<ManufacturingCompanyInput>,
  actor: string,
  db: Queryable = getPool()
): Promise<ManufacturingCompany | undefined> {
  const assignments = buildAssignments<ManufacturingCompanyInput>(patch, MANUFACTURING_COMPANY_COLUMN_OF);
  if (assignments.length === 0) return getManufacturingCompanyById(id, db);

  try {
    const { rows } = await db.query<ManufacturingCompanyRow>(
      `UPDATE manufacturing_companies SET ${toSetSql(assignments)}, updated_by = $${assignments.length + 2}, updated_at = now()
       WHERE id = $1
       RETURNING ${MANUFACTURING_COMPANY_COLUMNS}`,
      [id, ...assignments.map(([, v]) => v), actor]
    );
    return rows[0] ? mapManufacturingCompany(rows[0]) : undefined;
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw new ConflictError(`A manufacturing company named "${patch.companyName}" already exists.`);
    }
    throw error;
  }
}

export const manufacturingCompanies = {
  list: listManufacturingCompanies,
  getById: getManufacturingCompanyById,
  create: createManufacturingCompany,
  update: updateManufacturingCompany
};

// ---------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------

type BrandRow = {
  id: string;
  brand_name: string;
  marketing_company: string;
  status: MasterStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
};

const BRAND_COLUMNS = 'id, brand_name, marketing_company, status, created_at, updated_at, created_by, updated_by';

function mapBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    brandName: row.brand_name,
    marketingCompany: row.marketing_company,
    status: row.status,
    createdDate: toDateString(row.created_at),
    updatedDate: toDateString(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export type BrandInput = Pick<Brand, 'brandName' | 'marketingCompany' | 'status'>;

const BRAND_COLUMN_OF: Record<keyof BrandInput, string> = {
  brandName: 'brand_name',
  marketingCompany: 'marketing_company',
  status: 'status'
};

function listBrands(db: Queryable = getPool()): Promise<Brand[]> {
  return listRows(db, 'brands', BRAND_COLUMNS, mapBrand);
}

function getBrandById(id: string, db: Queryable = getPool()): Promise<Brand | undefined> {
  return getRowById(db, 'brands', BRAND_COLUMNS, id, mapBrand);
}

// brands.marketing_company is a FK onto marketing_companies.company_name
// (see migration 001, note 2 — companies/brands/flavours are related by
// name, not id, on purpose). A raw 23503 here reads as "insert or update on
// table \"brands\" violates foreign key constraint \"brands_marketing_company_fkey\""
// with no hint of which name was the problem, so it is translated into a
// message that actually names the company. Every brand column has exactly
// one UNIQUE (brand_name) and one FK (marketing_company), so the error CODE
// alone — without inspecting error.constraint — is enough to tell the two
// apart.
function translateBrandError(error: unknown, marketingCompany: string | undefined, brandName: string | undefined): unknown {
  const code = pgErrorCode(error);
  if (code === '23503') return new DomainError(`Marketing company "${marketingCompany}" does not exist.`);
  if (code === '23505') return new ConflictError(`A brand named "${brandName}" already exists.`);
  return error;
}

async function createBrand(input: BrandInput, actor: string, db: Queryable = getPool()): Promise<Brand> {
  return inTransaction(db, async (client) => {
    const id = await nextSequentialId(client, 'brands', 'BRD');
    try {
      const { rows } = await client.query<BrandRow>(
        `INSERT INTO brands (id, brand_name, marketing_company, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING ${BRAND_COLUMNS}`,
        [id, input.brandName, input.marketingCompany, input.status, actor]
      );
      return mapBrand(rows[0]);
    } catch (error) {
      throw translateBrandError(error, input.marketingCompany, input.brandName);
    }
  });
}

async function updateBrand(id: string, patch: Partial<BrandInput>, actor: string, db: Queryable = getPool()): Promise<Brand | undefined> {
  const assignments = buildAssignments<BrandInput>(patch, BRAND_COLUMN_OF);
  if (assignments.length === 0) return getBrandById(id, db);

  try {
    const { rows } = await db.query<BrandRow>(
      `UPDATE brands SET ${toSetSql(assignments)}, updated_by = $${assignments.length + 2}, updated_at = now()
       WHERE id = $1
       RETURNING ${BRAND_COLUMNS}`,
      [id, ...assignments.map(([, v]) => v), actor]
    );
    return rows[0] ? mapBrand(rows[0]) : undefined;
  } catch (error) {
    throw translateBrandError(error, patch.marketingCompany, patch.brandName);
  }
}

export const brands = {
  list: listBrands,
  getById: getBrandById,
  create: createBrand,
  update: updateBrand
};

// ---------------------------------------------------------------------
// Flavours
// ---------------------------------------------------------------------

type FlavourRow = {
  id: string;
  flavour_name: string;
  status: MasterStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
};

const FLAVOUR_COLUMNS = 'id, flavour_name, status, created_at, updated_at, created_by, updated_by';

function mapFlavour(row: FlavourRow): Flavour {
  return {
    id: row.id,
    flavourName: row.flavour_name,
    status: row.status,
    createdDate: toDateString(row.created_at),
    updatedDate: toDateString(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export type FlavourInput = Pick<Flavour, 'flavourName' | 'status'>;

const FLAVOUR_COLUMN_OF: Record<keyof FlavourInput, string> = {
  flavourName: 'flavour_name',
  status: 'status'
};

function listFlavours(db: Queryable = getPool()): Promise<Flavour[]> {
  return listRows(db, 'flavours', FLAVOUR_COLUMNS, mapFlavour);
}

function getFlavourById(id: string, db: Queryable = getPool()): Promise<Flavour | undefined> {
  return getRowById(db, 'flavours', FLAVOUR_COLUMNS, id, mapFlavour);
}

async function createFlavour(input: FlavourInput, actor: string, db: Queryable = getPool()): Promise<Flavour> {
  return inTransaction(db, async (client) => {
    const id = await nextSequentialId(client, 'flavours', 'FLV');
    try {
      const { rows } = await client.query<FlavourRow>(
        `INSERT INTO flavours (id, flavour_name, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4)
         RETURNING ${FLAVOUR_COLUMNS}`,
        [id, input.flavourName, input.status, actor]
      );
      return mapFlavour(rows[0]);
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw new ConflictError(`A flavour named "${input.flavourName}" already exists.`);
      }
      throw error;
    }
  });
}

async function updateFlavour(id: string, patch: Partial<FlavourInput>, actor: string, db: Queryable = getPool()): Promise<Flavour | undefined> {
  const assignments = buildAssignments<FlavourInput>(patch, FLAVOUR_COLUMN_OF);
  if (assignments.length === 0) return getFlavourById(id, db);

  try {
    const { rows } = await db.query<FlavourRow>(
      `UPDATE flavours SET ${toSetSql(assignments)}, updated_by = $${assignments.length + 2}, updated_at = now()
       WHERE id = $1
       RETURNING ${FLAVOUR_COLUMNS}`,
      [id, ...assignments.map(([, v]) => v), actor]
    );
    return rows[0] ? mapFlavour(rows[0]) : undefined;
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw new ConflictError(`A flavour named "${patch.flavourName}" already exists.`);
    }
    throw error;
  }
}

export const flavours = {
  list: listFlavours,
  getById: getFlavourById,
  create: createFlavour,
  update: updateFlavour
};

// ---------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------

type ClaimRow = {
  id: string;
  claim_text: string;
  description: string;
  status: MasterStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
};

const CLAIM_COLUMNS = 'id, claim_text, description, status, created_at, updated_at, created_by, updated_by';

function mapClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    claimText: row.claim_text,
    description: row.description,
    status: row.status,
    createdDate: toDateString(row.created_at),
    updatedDate: toDateString(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export type ClaimInput = Pick<Claim, 'claimText' | 'description' | 'status'>;

const CLAIM_COLUMN_OF: Record<keyof ClaimInput, string> = {
  claimText: 'claim_text',
  description: 'description',
  status: 'status'
};

function listClaims(db: Queryable = getPool()): Promise<Claim[]> {
  return listRows(db, 'claims', CLAIM_COLUMNS, mapClaim);
}

function getClaimById(id: string, db: Queryable = getPool()): Promise<Claim | undefined> {
  return getRowById(db, 'claims', CLAIM_COLUMNS, id, mapClaim);
}

async function createClaim(input: ClaimInput, actor: string, db: Queryable = getPool()): Promise<Claim> {
  return inTransaction(db, async (client) => {
    const id = await nextSequentialId(client, 'claims', 'CLM');
    try {
      const { rows } = await client.query<ClaimRow>(
        `INSERT INTO claims (id, claim_text, description, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING ${CLAIM_COLUMNS}`,
        [id, input.claimText, input.description, input.status, actor]
      );
      return mapClaim(rows[0]);
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw new ConflictError(`A claim with the text "${input.claimText}" already exists.`);
      }
      throw error;
    }
  });
}

async function updateClaim(id: string, patch: Partial<ClaimInput>, actor: string, db: Queryable = getPool()): Promise<Claim | undefined> {
  const assignments = buildAssignments<ClaimInput>(patch, CLAIM_COLUMN_OF);
  if (assignments.length === 0) return getClaimById(id, db);

  try {
    const { rows } = await db.query<ClaimRow>(
      `UPDATE claims SET ${toSetSql(assignments)}, updated_by = $${assignments.length + 2}, updated_at = now()
       WHERE id = $1
       RETURNING ${CLAIM_COLUMNS}`,
      [id, ...assignments.map(([, v]) => v), actor]
    );
    return rows[0] ? mapClaim(rows[0]) : undefined;
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw new ConflictError(`A claim with the text "${patch.claimText}" already exists.`);
    }
    throw error;
  }
}

export const claims = {
  list: listClaims,
  getById: getClaimById,
  create: createClaim,
  update: updateClaim
};

// ---------------------------------------------------------------------
// Product Categories
// ---------------------------------------------------------------------

type ProductCategoryRow = {
  id: string;
  category_name: string;
  description: string;
  status: MasterStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
};

const PRODUCT_CATEGORY_COLUMNS = 'id, category_name, description, status, created_at, updated_at, created_by, updated_by';

function mapProductCategory(row: ProductCategoryRow): ProductCategory {
  return {
    id: row.id,
    categoryName: row.category_name,
    description: row.description,
    status: row.status,
    createdDate: toDateString(row.created_at),
    updatedDate: toDateString(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export type ProductCategoryInput = Pick<ProductCategory, 'categoryName' | 'description' | 'status'>;

const PRODUCT_CATEGORY_COLUMN_OF: Record<keyof ProductCategoryInput, string> = {
  categoryName: 'category_name',
  description: 'description',
  status: 'status'
};

function listProductCategories(db: Queryable = getPool()): Promise<ProductCategory[]> {
  return listRows(db, 'product_categories', PRODUCT_CATEGORY_COLUMNS, mapProductCategory);
}

function getProductCategoryById(id: string, db: Queryable = getPool()): Promise<ProductCategory | undefined> {
  return getRowById(db, 'product_categories', PRODUCT_CATEGORY_COLUMNS, id, mapProductCategory);
}

async function createProductCategory(input: ProductCategoryInput, actor: string, db: Queryable = getPool()): Promise<ProductCategory> {
  return inTransaction(db, async (client) => {
    const id = await nextSequentialId(client, 'product_categories', 'CAT');
    try {
      const { rows } = await client.query<ProductCategoryRow>(
        `INSERT INTO product_categories (id, category_name, description, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING ${PRODUCT_CATEGORY_COLUMNS}`,
        [id, input.categoryName, input.description, input.status, actor]
      );
      return mapProductCategory(rows[0]);
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw new ConflictError(`A product category named "${input.categoryName}" already exists.`);
      }
      throw error;
    }
  });
}

async function updateProductCategory(
  id: string,
  patch: Partial<ProductCategoryInput>,
  actor: string,
  db: Queryable = getPool()
): Promise<ProductCategory | undefined> {
  const assignments = buildAssignments<ProductCategoryInput>(patch, PRODUCT_CATEGORY_COLUMN_OF);
  if (assignments.length === 0) return getProductCategoryById(id, db);

  try {
    const { rows } = await db.query<ProductCategoryRow>(
      `UPDATE product_categories SET ${toSetSql(assignments)}, updated_by = $${assignments.length + 2}, updated_at = now()
       WHERE id = $1
       RETURNING ${PRODUCT_CATEGORY_COLUMNS}`,
      [id, ...assignments.map(([, v]) => v), actor]
    );
    return rows[0] ? mapProductCategory(rows[0]) : undefined;
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw new ConflictError(`A product category named "${patch.categoryName}" already exists.`);
    }
    throw error;
  }
}

export const productCategories = {
  list: listProductCategories,
  getById: getProductCategoryById,
  create: createProductCategory,
  update: updateProductCategory
};
