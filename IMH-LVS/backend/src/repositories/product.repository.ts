// Products repository — ports src/services/productService.ts's localStorage
// functions onto the `products` table, preserving their semantics.
//
// package_size, origin and source_artwork_id are the only nullable columns
// here and all three surface as optional API fields (Product.packageSize? /
// origin? / sourceArtworkId?), so they go through nullToUndefined /
// undefinedToNull rather than the ''-based emptyToNull/nullToEmpty pair
// used elsewhere in this codebase for label-attribute-style text.

import { Pool, PoolClient } from 'pg';
import { getPool, withTransaction } from '../db/pool';
import { nullToUndefined, toDateString, undefinedToNull } from './mappers';
import { Product, ProductInput, ProductOrigin, ProductStatus } from '../types/domain';
import { ConflictError, DomainError } from '../middleware/domainError';

// See masters.repository.ts for why this is declared locally in every
// repository file instead of imported from one shared place.
export type Queryable = Pick<Pool | PoolClient, 'query'>;

// Joins the caller's transaction when already inside one; opens a fresh one
// around `fn` for the default (bare pool) case — see masters.repository.ts's
// inTransaction for the full rationale (id issuance below needs this).
async function inTransaction<T>(db: Queryable, fn: (client: Queryable) => Promise<T>): Promise<T> {
  if (db instanceof Pool) return withTransaction(fn);
  return fn(db);
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function pgErrorConstraint(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('constraint' in error)) return '';
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : '';
}

// Same race-safe pattern as the other three repositories — see
// masters.repository.ts's nextSequentialId for the full rationale.
async function nextProductId(client: Queryable): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('products_id'))");
  const { rows } = await client.query<{ next_seq: number }>(
    'SELECT coalesce(max(substring(id from 5)::int), 0) + 1 AS next_seq FROM products'
  );
  return `PRD-${String(rows[0].next_seq).padStart(4, '0')}`;
}

type ProductRow = {
  id: string;
  product_name: string;
  brand_name: string;
  marketing_company: string;
  manufacturing_company: string;
  flavour: string;
  fssai_number: string;
  package_size: string | null;
  status: ProductStatus;
  origin: ProductOrigin | null;
  source_artwork_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
};

const PRODUCT_COLUMNS = `id, product_name, brand_name, marketing_company, manufacturing_company, flavour, fssai_number,
  package_size, status, origin, source_artwork_id, created_at, updated_at, created_by, updated_by`;

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    productName: row.product_name,
    brandName: row.brand_name,
    marketingCompany: row.marketing_company,
    manufacturingCompany: row.manufacturing_company,
    flavour: row.flavour,
    fssaiNumber: row.fssai_number,
    packageSize: nullToUndefined(row.package_size),
    status: row.status,
    createdDate: toDateString(row.created_at),
    updatedDate: toDateString(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    origin: nullToUndefined(row.origin),
    sourceArtworkId: nullToUndefined(row.source_artwork_id)
  };
}

// products.brand_name / marketing_company / manufacturing_company are FKs
// onto the corresponding master tables' name columns (migration 001, note
// 2). Products carry three such FKs (brands only carries one), so unlike
// masters.repository.ts's translateBrandError, the 23503 code alone does
// not say which one fired — Postgres's default constraint-naming
// convention (`<table>_<column>_fkey`) does, without needing a lookup.
function translateProductError(
  error: unknown,
  input: { brandName?: string; marketingCompany?: string; manufacturingCompany?: string }
): unknown {
  if (pgErrorCode(error) !== '23503') return error;
  const constraint = pgErrorConstraint(error);
  if (constraint.includes('brand_name')) return new DomainError(`Brand "${input.brandName}" does not exist.`);
  if (constraint.includes('marketing_company')) return new DomainError(`Marketing company "${input.marketingCompany}" does not exist.`);
  if (constraint.includes('manufacturing_company')) {
    return new DomainError(`Manufacturing company "${input.manufacturingCompany}" does not exist.`);
  }
  return error;
}

export async function getProducts(db: Queryable = getPool()): Promise<Product[]> {
  const { rows } = await db.query<ProductRow>(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY id`);
  return rows.map(mapProduct);
}

export async function getProductById(id: string, db: Queryable = getPool()): Promise<Product | undefined> {
  const { rows } = await db.query<ProductRow>(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`, [id]);
  return rows[0] ? mapProduct(rows[0]) : undefined;
}

// Possible-duplicate check ahead of creating a product: same name + brand +
// marketing company, case-insensitive and trimmed — same rule
// productService.ts used. lower(product_name) (no trim on the column) is
// deliberate: it is exactly the expression products_name_lower_idx (see
// migration 001) is built on, so this stays sargable. Only the incoming
// search values are trimmed; createProduct below stores input verbatim
// (like the frontend did), so stored names have no padding to strip.
export async function findPossibleDuplicate(
  input: Pick<ProductInput, 'productName' | 'brandName' | 'marketingCompany'>,
  db: Queryable = getPool()
): Promise<Product | undefined> {
  const { rows } = await db.query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} FROM products
     WHERE lower(product_name) = lower($1) AND lower(brand_name) = lower($2) AND lower(marketing_company) = lower($3)
     LIMIT 1`,
    [input.productName.trim(), input.brandName.trim(), input.marketingCompany.trim()]
  );
  return rows[0] ? mapProduct(rows[0]) : undefined;
}

// Products sharing the same Brand + Marketing Company but not necessarily
// the same Product Name — used by the label-upload flow when a label can't
// be auto-matched to one exact product. Case-insensitive, trimmed, same as
// findPossibleDuplicate above.
export async function getProductsByBrandAndCompany(
  brandName: string,
  marketingCompany: string,
  db: Queryable = getPool()
): Promise<Product[]> {
  const { rows } = await db.query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} FROM products WHERE lower(brand_name) = lower($1) AND lower(marketing_company) = lower($2)`,
    [brandName.trim(), marketingCompany.trim()]
  );
  return rows.map(mapProduct);
}

export type ProductOriginMeta = { origin: ProductOrigin; sourceArtworkId?: string };

export async function createProduct(
  input: ProductInput,
  actor: string,
  meta?: ProductOriginMeta,
  db: Queryable = getPool()
): Promise<Product> {
  return inTransaction(db, async (client) => {
    const id = await nextProductId(client);
    try {
      const { rows } = await client.query<ProductRow>(
        `INSERT INTO products (
           id, product_name, brand_name, marketing_company, manufacturing_company, flavour, fssai_number,
           package_size, status, origin, source_artwork_id, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
         RETURNING ${PRODUCT_COLUMNS}`,
        [
          id,
          input.productName,
          input.brandName,
          input.marketingCompany,
          input.manufacturingCompany,
          input.flavour,
          input.fssaiNumber,
          undefinedToNull(input.packageSize),
          input.status,
          undefinedToNull(meta?.origin),
          undefinedToNull(meta?.sourceArtworkId),
          actor
        ]
      );
      return mapProduct(rows[0]);
    } catch (error) {
      throw translateProductError(error, input);
    }
  });
}

// Backfills the originating artwork onto a product created moments earlier
// by the label-intake pipeline, once that artwork's own id is known.
// Provenance only, not a user edit — deliberately does NOT touch
// updated_by/updated_at, so this never masquerades as someone editing the
// product a moment after creating it.
export async function setProductSourceArtwork(id: string, artworkId: string, db: Queryable = getPool()): Promise<Product | undefined> {
  const { rows } = await db.query<ProductRow>(`UPDATE products SET source_artwork_id = $2 WHERE id = $1 RETURNING ${PRODUCT_COLUMNS}`, [
    id,
    artworkId
  ]);
  return rows[0] ? mapProduct(rows[0]) : undefined;
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductInput>,
  actor: string,
  db: Queryable = getPool()
): Promise<Product | undefined> {
  const assignments: Array<[string, unknown]> = [];
  if (patch.productName !== undefined) assignments.push(['product_name', patch.productName]);
  if (patch.brandName !== undefined) assignments.push(['brand_name', patch.brandName]);
  if (patch.marketingCompany !== undefined) assignments.push(['marketing_company', patch.marketingCompany]);
  if (patch.manufacturingCompany !== undefined) assignments.push(['manufacturing_company', patch.manufacturingCompany]);
  if (patch.flavour !== undefined) assignments.push(['flavour', patch.flavour]);
  if (patch.fssaiNumber !== undefined) assignments.push(['fssai_number', patch.fssaiNumber]);
  if (patch.status !== undefined) assignments.push(['status', patch.status]);
  // packageSize is the one nullable field in ProductInput, so — unlike the
  // required fields above — a key that is PRESENT but `undefined` is
  // meaningful: it is how a caller clears a previously-set package size
  // back to NULL, the distinction productService.ts got for free from
  // object-spread (`{...current, ...patch}` copies an explicit `undefined`
  // over; an absent key does not). `in` is what recovers that distinction
  // for a plain patch object.
  if ('packageSize' in patch) assignments.push(['package_size', undefinedToNull(patch.packageSize)]);

  if (assignments.length === 0) return getProductById(id, db);

  const setSql = assignments.map(([col], i) => `${col} = $${i + 2}`).join(', ');
  const actorIndex = assignments.length + 2;
  try {
    const { rows } = await db.query<ProductRow>(
      `UPDATE products SET ${setSql}, updated_by = $${actorIndex}, updated_at = now()
       WHERE id = $1
       RETURNING ${PRODUCT_COLUMNS}`,
      [id, ...assignments.map(([, v]) => v), actor]
    );
    return rows[0] ? mapProduct(rows[0]) : undefined;
  } catch (error) {
    throw translateProductError(error, patch);
  }
}

// Products are never physically removed (artworks/comparisons/approvals
// reference them) — deactivating just flips status to Inactive.
export function deactivateProduct(id: string, actor: string, db: Queryable = getPool()): Promise<Product | undefined> {
  return updateProduct(id, { status: 'Inactive' }, actor, db);
}
