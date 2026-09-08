// Artwork repository — version history per label, plus the extracted label
// attributes that hang off each artwork.
//
// Two queries here are the ones the Label Comparison module is built on, and
// both are why this app is on a relational database:
//
//   getLatestApprovedArtwork  — the baseline a new label is compared against
//   getCrossCompanyCandidates — the same product name at a DIFFERENT marketing
//                               company, with its own latest approved label
//
// Both read `latest_approved_artworks` (migration 001), a DISTINCT ON view
// backed by a partial index over approved rows, rather than pulling every
// version into the process and picking a maximum in JavaScript.

import { Pool, PoolClient } from 'pg';
import { getPool, withTransaction } from '../db/pool';
import { env } from '../config/env';
import { emptyToNull, nullToEmpty, nullToUndefined, numberToVersion, toDateString, toIsoString } from './mappers';
import {
  Artwork,
  ArtworkInput,
  ArtworkStatus,
  ArtworkType,
  CrossCompanyCandidate,
  LabelAttributes,
  LabelAttributesSource
} from '../types/domain';
import { ConflictError, DomainError } from '../middleware/domainError';

// See masters.repository.ts for why this is declared locally in every
// repository file instead of imported from one shared place.
export type Queryable = Pick<Pool | PoolClient, 'query'>;

// Joins the caller's transaction when already inside one; opens a fresh one
// around `fn` for the default (bare pool) case — see masters.repository.ts's
// inTransaction for the full rationale (id and version issuance need this).
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

async function nextArtworkId(client: Queryable): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('artworks_id'))");
  const { rows } = await client.query<{ next_seq: number }>(
    'SELECT coalesce(max(substring(id from 5)::int), 0) + 1 AS next_seq FROM artworks'
  );
  return `ART-${String(rows[0].next_seq).padStart(4, '0')}`;
}

/**
 * The next version number for one product's label at one company, in one
 * artwork type.
 *
 * Under the same advisory lock as id issuance, and inside the caller's
 * transaction, because version history is append-only and two concurrent
 * uploads must not both be told they are V5 — the UNIQUE constraint would
 * reject the loser with a raw duplicate-key error after the user had already
 * waited for a file upload.
 */
async function nextVersionNumber(
  client: Queryable,
  productId: string,
  marketingCompany: string,
  artworkType: ArtworkType
): Promise<number> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('artworks_version'))");
  const { rows } = await client.query<{ next_version: number }>(
    `SELECT coalesce(max(version_number), 0) + 1 AS next_version
       FROM artworks
      WHERE product_id = $1 AND marketing_company = $2 AND artwork_type = $3`,
    [productId, marketingCompany, artworkType]
  );
  return rows[0].next_version;
}

type ArtworkRow = {
  id: string;
  product_id: string;
  product_name: string;
  brand: string;
  marketing_company: string;
  manufacturing_company: string;
  version_number: number;
  artwork_type: ArtworkType;
  status: ArtworkStatus;
  remarks: string;
  storage_key: string | null;
  file_name: string;
  mime_type: string;
  byte_size: number;
  uploaded_by: string;
  uploaded_at: Date;
  updated_by: string;
  updated_at: Date;
};

// An array, not one string, because getLatestApprovedArtwork needs the same
// columns table-qualified: it joins artworks to a view that shares six column
// names, and an unqualified `version_number` there is an ambiguous reference.
// Deriving both forms from one list keeps them in step.
const ARTWORK_COLUMN_NAMES = [
  'id',
  'product_id',
  'product_name',
  'brand',
  'marketing_company',
  'manufacturing_company',
  'version_number',
  'artwork_type',
  'status',
  'remarks',
  'storage_key',
  'file_name',
  'mime_type',
  'byte_size',
  'uploaded_by',
  'uploaded_at',
  'updated_by',
  'updated_at'
] as const;

const ARTWORK_COLUMNS = ARTWORK_COLUMN_NAMES.join(', ');

function qualifiedArtworkColumns(alias: string): string {
  return ARTWORK_COLUMN_NAMES.map((column) => `${alias}.${column}`).join(', ');
}

function mapArtwork(row: ArtworkRow): Artwork {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    brand: row.brand,
    marketingCompany: row.marketing_company,
    manufacturingCompany: row.manufacturing_company,
    version: numberToVersion(row.version_number),
    artworkType: row.artwork_type,
    status: row.status,
    remarks: row.remarks,
    // storage_key is an internal handle (see artworkFileStorage.service.ts),
    // not something a browser can fetch directly — this is the durable
    // download URL, computed rather than stored, so where the bytes actually
    // live can change without a migration. '' is the honest "no durably
    // stored file", which is the state of every record made before object
    // storage existed, and of a row created but not yet uploaded to.
    filePath: row.storage_key ? `${env.publicBaseUrl}/api/artworks/${row.id}/file` : '',
    fileName: row.file_name,
    fileType: row.mime_type,
    fileSize: row.byte_size,
    uploadedBy: row.uploaded_by,
    uploadDate: toDateString(row.uploaded_at),
    updatedBy: row.updated_by,
    updatedDate: toDateString(row.updated_at)
  };
}

function translateArtworkError(error: unknown, input: { productId?: string; storageKey?: string }): unknown {
  const code = pgErrorCode(error);
  const constraint = pgErrorConstraint(error);

  if (code === '23503' && constraint.includes('product_id')) {
    return new DomainError(`Product "${input.productId}" does not exist.`);
  }
  // The version UNIQUE constraint. Reachable only when a caller supplies its
  // own version number, since nextVersionNumber issues them under a lock.
  if (code === '23505' && constraint.startsWith('artworks_product_id')) {
    return new ConflictError('That version of this label already exists. Version history is append-only.');
  }
  if (code === '23505' && constraint.includes('storage_key')) {
    return new ConflictError(`Storage key "${input.storageKey}" is already used by another artwork.`);
  }
  return error;
}

async function listArtworks(db: Queryable, where: string, params: unknown[]): Promise<Artwork[]> {
  const { rows } = await db.query<ArtworkRow>(`SELECT ${ARTWORK_COLUMNS} FROM artworks ${where}`, params);
  return rows.map(mapArtwork);
}

export async function getArtworks(db: Queryable = getPool()): Promise<Artwork[]> {
  return listArtworks(db, 'ORDER BY id', []);
}

export async function getArtworkById(id: string, db: Queryable = getPool()): Promise<Artwork | undefined> {
  const { rows } = await db.query<ArtworkRow>(`SELECT ${ARTWORK_COLUMNS} FROM artworks WHERE id = $1`, [id]);
  return rows[0] ? mapArtwork(rows[0]) : undefined;
}

// Newest version first — the order the Artwork page's version history reads
// in, and the order a reviewer expects when the current label is the point.
export async function getArtworksByProduct(productId: string, db: Queryable = getPool()): Promise<Artwork[]> {
  return listArtworks(db, 'WHERE product_id = $1 ORDER BY artwork_type, version_number DESC', [productId]);
}

/**
 * The approved baseline a new label is compared against: the highest version
 * of this product's label, at this marketing company, in this artwork type,
 * whose status is Approved or Final Approved.
 *
 * Undefined when there is none — a first-ever label has nothing to be
 * compared against, and that is a legitimate state the workflow reports
 * rather than an error.
 */
export async function getLatestApprovedArtwork(
  productId: string,
  marketingCompany: string,
  artworkType: ArtworkType = 'Full Label',
  db: Queryable = getPool()
): Promise<Artwork | undefined> {
  const { rows } = await db.query<ArtworkRow>(
    `SELECT ${qualifiedArtworkColumns('a')}
       FROM latest_approved_artworks latest
       JOIN artworks a ON a.id = latest.id
      WHERE latest.product_id = $1 AND latest.marketing_company = $2 AND latest.artwork_type = $3`,
    [productId, marketingCompany, artworkType]
  );
  return rows[0] ? mapArtwork(rows[0]) : undefined;
}

/**
 * Cross-company candidates: the same product name marketed by a DIFFERENT
 * company, each with its own latest approved label.
 *
 * The exclusion is on the product's CURRENT marketing company rather than the
 * snapshot denormalised onto the artwork row. Those disagree when a company
 * has been renamed since a label was approved, and "another company's label"
 * means another company as the master data reads today — matching on the
 * stale snapshot would compare a product against itself under its old name.
 */
export async function getCrossCompanyCandidates(
  productName: string,
  excludeMarketingCompany: string,
  artworkType: ArtworkType = 'Full Label',
  db: Queryable = getPool()
): Promise<CrossCompanyCandidate[]> {
  const { rows } = await db.query<{
    product_id: string;
    product_name: string;
    marketing_company: string;
    artwork_id: string;
    version_number: number;
  }>(
    `SELECT p.id AS product_id, p.product_name, p.marketing_company,
            latest.id AS artwork_id, latest.version_number
       FROM products p
       JOIN latest_approved_artworks latest
         ON latest.product_id = p.id AND latest.artwork_type = $3
      WHERE lower(p.product_name) = lower($1)
        AND lower(p.marketing_company) <> lower($2)
      ORDER BY p.marketing_company`,
    [productName.trim(), excludeMarketingCompany.trim(), artworkType]
  );

  return rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    marketingCompany: row.marketing_company,
    artworkId: row.artwork_id,
    artworkVersion: numberToVersion(row.version_number)
  }));
}

// The version is issued here, not accepted from the caller — see
// nextVersionNumber. ArtworkInput's `version` is therefore ignored on create,
// and omitted from this type so a caller cannot believe otherwise.
export type ArtworkCreateInput = Omit<ArtworkInput, 'version'>;

export async function createArtwork(
  input: ArtworkCreateInput,
  actor: string,
  db: Queryable = getPool()
): Promise<Artwork> {
  return inTransaction(db, async (client) => {
    const id = await nextArtworkId(client);
    const versionNumber = await nextVersionNumber(
      client,
      input.productId,
      input.marketingCompany,
      input.artworkType
    );

    try {
      const { rows } = await client.query<ArtworkRow>(
        `INSERT INTO artworks (
           id, product_id, product_name, brand, marketing_company, manufacturing_company,
           version_number, artwork_type, status, remarks, storage_key, file_name, mime_type,
           byte_size, uploaded_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
         RETURNING ${ARTWORK_COLUMNS}`,
        [
          id,
          input.productId,
          input.productName,
          input.brand,
          input.marketingCompany,
          input.manufacturingCompany,
          versionNumber,
          input.artworkType,
          input.status,
          input.remarks,
          emptyToNull(input.filePath),
          input.fileName,
          input.fileType,
          input.fileSize,
          actor
        ]
      );
      return mapArtwork(rows[0]);
    } catch (error) {
      throw translateArtworkError(error, { productId: input.productId, storageKey: input.filePath });
    }
  });
}

/**
 * Moves an artwork through the approval workflow.
 *
 * Status is the only field this changes, plus remarks when supplied. Artwork
 * content is immutable once uploaded — a corrected label is a new version, not
 * an edit — so there is deliberately no general-purpose updateArtwork here.
 */
export async function updateArtworkStatus(
  id: string,
  status: ArtworkStatus,
  actor: string,
  remarks?: string,
  db: Queryable = getPool()
): Promise<Artwork | undefined> {
  const { rows } = await db.query<ArtworkRow>(
    `UPDATE artworks
        SET status = $2,
            remarks = coalesce($3, remarks),
            updated_by = $4,
            updated_at = now()
      WHERE id = $1
      RETURNING ${ARTWORK_COLUMNS}`,
    [id, status, remarks ?? null, actor]
  );
  return rows[0] ? mapArtwork(rows[0]) : undefined;
}

/**
 * Records where the artwork file actually landed in object storage.
 *
 * Separate from createArtwork because the upload and the row are two steps
 * that can fail independently: the row exists first so the file has an id to
 * be keyed by, and this closes the loop once the bytes are durably stored.
 * Provenance, not a user edit — so, like setProductSourceArtwork, it leaves
 * updated_by/updated_at alone rather than making a background upload look like
 * someone editing the record.
 */
export async function setArtworkStorage(
  id: string,
  storageKey: string,
  checksumSha256?: string,
  db: Queryable = getPool()
): Promise<Artwork | undefined> {
  try {
    const { rows } = await db.query<ArtworkRow>(
      `UPDATE artworks SET storage_key = $2, checksum_sha256 = coalesce($3, checksum_sha256)
        WHERE id = $1
        RETURNING ${ARTWORK_COLUMNS}`,
      [id, storageKey, checksumSha256 ?? null]
    );
    return rows[0] ? mapArtwork(rows[0]) : undefined;
  } catch (error) {
    throw translateArtworkError(error, { storageKey });
  }
}

// ---------------------------------------------------------------------
// Label attributes
// ---------------------------------------------------------------------

type LabelAttributesRow = {
  artwork_id: string;
  brand_name: string | null;
  product_name: string | null;
  address: string | null;
  customer_care_number: string | null;
  customer_care_email: string | null;
  colour_theme: string | null;
  flavour: string | null;
  claims: string | null;
  logo: string | null;
  label_design: string | null;
  nutrition_table_format: string | null;
  fssai_number: string | null;
  ingredients: string | null;
  package_size: string | null;
  marketing_company: string | null;
  manufacturing_company: string | null;
  source: LabelAttributesSource;
  extracted_at: Date;
  extraction_engine: string | null;
};

// The 13 compared parameters, in the order migration 001 declares them, plus
// the three extraction produces that are not compared.
const LABEL_ATTRIBUTE_COLUMNS = `artwork_id, brand_name, product_name, address, customer_care_number,
  customer_care_email, colour_theme, flavour, claims, logo, label_design, nutrition_table_format,
  fssai_number, ingredients, package_size, marketing_company, manufacturing_company,
  source, extracted_at, extraction_engine`;

// Written and read as one list so the INSERT column order, the value order and
// the ON CONFLICT assignment list cannot drift apart.
const VALUE_COLUMNS = [
  'brand_name',
  'product_name',
  'address',
  'customer_care_number',
  'customer_care_email',
  'colour_theme',
  'flavour',
  'claims',
  'logo',
  'label_design',
  'nutrition_table_format',
  'fssai_number',
  'ingredients',
  'package_size',
  'marketing_company',
  'manufacturing_company'
] as const;

/**
 * What an extractor produced for one artwork.
 *
 * Every field is optional and '' is equivalent to absent: the database stores
 * NULL for both, because a label the extractor could not read a value from has
 * no value — not an empty one. An extractor must never substitute a
 * placeholder like 'Not specified'; migration 001 has a CHECK that rejects it,
 * and reporting a comparison over one is the false-MATCH defect this schema
 * exists to prevent.
 */
export type LabelAttributesWrite = Partial<Omit<LabelAttributes, 'artworkId'>> & {
  packageSize?: string;
  marketingCompany?: string;
  manufacturingCompany?: string;
};

export type LabelAttributesProvenance = {
  source: LabelAttributesSource;
  // e.g. 'tesseract@7.0.0' — how a reviewer tells OCR output from a human
  // correction, and which engine version produced a suspect reading.
  extractionEngine?: string;
  rawText?: string;
};

export type StoredLabelAttributes = LabelAttributes & {
  packageSize?: string;
  marketingCompany?: string;
  manufacturingCompany?: string;
  source: LabelAttributesSource;
  extractedAt?: string;
  extractionEngine?: string;
};

function mapLabelAttributes(row: LabelAttributesRow): StoredLabelAttributes {
  return {
    artworkId: row.artwork_id,
    brandName: nullToEmpty(row.brand_name),
    productName: nullToEmpty(row.product_name),
    address: nullToEmpty(row.address),
    customerCareNumber: nullToEmpty(row.customer_care_number),
    customerCareEmail: nullToEmpty(row.customer_care_email),
    colourTheme: nullToEmpty(row.colour_theme),
    flavour: nullToEmpty(row.flavour),
    claims: nullToEmpty(row.claims),
    logo: nullToEmpty(row.logo),
    labelDesign: nullToEmpty(row.label_design),
    nutritionTableFormat: nullToEmpty(row.nutrition_table_format),
    fssaiNumber: nullToEmpty(row.fssai_number),
    ingredients: nullToEmpty(row.ingredients),
    packageSize: nullToUndefined(row.package_size),
    marketingCompany: nullToUndefined(row.marketing_company),
    manufacturingCompany: nullToUndefined(row.manufacturing_company),
    source: row.source,
    extractedAt: toIsoString(row.extracted_at),
    extractionEngine: nullToUndefined(row.extraction_engine)
  };
}

/**
 * The stored extraction for one artwork, or undefined if it has never been
 * extracted.
 *
 * That distinction is load-bearing and is why this returns undefined rather
 * than a record of empty strings: "never extracted" and "extracted, found
 * nothing" lead to different behaviour in the comparison engine, which must
 * refuse to produce a verdict for the first case rather than reporting 13
 * MISSING parameters as though a comparison had run.
 */
export async function getLabelAttributes(
  artworkId: string,
  db: Queryable = getPool()
): Promise<StoredLabelAttributes | undefined> {
  const { rows } = await db.query<LabelAttributesRow>(
    `SELECT ${LABEL_ATTRIBUTE_COLUMNS} FROM artwork_label_attributes WHERE artwork_id = $1`,
    [artworkId]
  );
  return rows[0] ? mapLabelAttributes(rows[0]) : undefined;
}

const VALUE_FIELD_OF: Record<(typeof VALUE_COLUMNS)[number], keyof LabelAttributesWrite> = {
  brand_name: 'brandName',
  product_name: 'productName',
  address: 'address',
  customer_care_number: 'customerCareNumber',
  customer_care_email: 'customerCareEmail',
  colour_theme: 'colourTheme',
  flavour: 'flavour',
  claims: 'claims',
  logo: 'logo',
  label_design: 'labelDesign',
  nutrition_table_format: 'nutritionTableFormat',
  fssai_number: 'fssaiNumber',
  ingredients: 'ingredients',
  package_size: 'packageSize',
  marketing_company: 'marketingCompany',
  manufacturing_company: 'manufacturingCompany'
};

function translateLabelAttributesError(error: unknown, artworkId: string): unknown {
  const code = pgErrorCode(error);
  const constraint = pgErrorConstraint(error);

  if (code === '23503') return new DomainError(`Artwork "${artworkId}" does not exist.`);
  if (code === '23514' && constraint === 'label_attributes_no_placeholder') {
    return new DomainError(
      'A label attribute was given the placeholder "Not specified". An extractor that ' +
        'cannot read a field must leave it absent — a placeholder stored as content is ' +
        'what makes two unknown values compare as a MATCH.'
    );
  }
  if (code === '23514' && constraint === 'label_attributes_no_blank_values') {
    return new DomainError('A label attribute was given an empty value. Absence is stored as NULL, not "".');
  }
  return error;
}

/**
 * Records an extraction for one artwork, replacing any previous one.
 *
 * A re-extraction (a better engine, a human correction) supersedes the old
 * values rather than accumulating versions: the artwork itself is immutable,
 * so there is exactly one current reading of it, and `source` says where that
 * reading came from. A field omitted from `values` is cleared, because a
 * re-extraction that no longer reads a field has not left the old value true.
 */
export async function upsertLabelAttributes(
  artworkId: string,
  values: LabelAttributesWrite,
  provenance: LabelAttributesProvenance,
  db: Queryable = getPool()
): Promise<StoredLabelAttributes> {
  const valueParams = VALUE_COLUMNS.map((column) => emptyToNull(values[VALUE_FIELD_OF[column]]));

  const columns = [...VALUE_COLUMNS, 'source', 'extraction_engine', 'raw_text'];
  const params = [
    artworkId,
    ...valueParams,
    provenance.source,
    emptyToNull(provenance.extractionEngine),
    emptyToNull(provenance.rawText)
  ];

  try {
    const { rows } = await db.query<LabelAttributesRow>(
      `INSERT INTO artwork_label_attributes (artwork_id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(', ')})
       ON CONFLICT (artwork_id) DO UPDATE SET
         ${columns.map((column) => `${column} = excluded.${column}`).join(', ')},
         extracted_at = now()
       RETURNING ${LABEL_ATTRIBUTE_COLUMNS}`,
      params
    );
    return mapLabelAttributes(rows[0]);
  } catch (error) {
    throw translateLabelAttributesError(error, artworkId);
  }
}
