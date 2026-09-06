-- IMH LVS — initial Postgres schema
--
-- Models the entities the frontend currently keeps in localStorage
-- (src/types/{product,artwork,comparison,masters}.ts and
-- src/data/usersStore.ts). It deliberately mirrors those shapes rather than
-- inventing a parallel model — per the developer brief, the AI module must
-- reuse the existing Product / Artwork / Version / Approval structures and
-- must not create duplicates.
--
-- DESIGN DECISIONS worth knowing before you extend this
-- ---------------------------------------------------------------------
-- 1. Human-readable codes stay the primary keys ('PRD-0001', 'ART-0001',
--    'CMP-0001'). The app already treats them as stable for the life of a
--    record and every service looks records up by them. Adding surrogate
--    UUIDs alongside would create exactly the second identity the brief
--    tells us not to introduce.
--
-- 2. Companies/brands/flavours are referenced BY NAME, not by id — the
--    pattern the existing code uses on purpose (see types/artwork.ts).
--    Rather than retrofit id-based relations, the master tables carry a
--    UNIQUE name and the referencing columns are real foreign keys onto
--    that name. Integrity without reshaping the app.
--
-- 3. Artwork versions are integers, not the 'V1'/'V2' strings the frontend
--    renders. parseVersionNumber() currently regex-extracts the first digit
--    run from a string, which quietly returns 0 for anything unexpected and
--    would sort 'V10' before 'V9' if it were ever compared as text. The
--    number is the truth; 'V' || version_number is presentation.
--
-- 4. Label attribute values are NULL when not captured — never '' and never
--    a placeholder like 'Not specified'. This is load-bearing: storing a
--    placeholder is what let the comparison engine report unknown-vs-unknown
--    as a MATCH. A CHECK constraint makes that class of bug unrepresentable.
--
-- 5. Artwork FILES are not stored here. Only a storage key pointing at
--    object storage (S3/R2/etc). Render's filesystem is ephemeral, and 5 MB
--    PDFs do not belong in table rows.

-- Transaction control belongs to the migration runner (src/db/migrate.ts),
-- which wraps every migration in a single transaction together with the
-- schema_migrations bookkeeping row. A BEGIN/COMMIT pair in here would
-- commit the runner's transaction early and let a half-applied migration
-- be recorded as complete.

-- Case-insensitive text, used for user emails so 'A@x.com' and 'a@x.com'
-- cannot both be registered.
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- Enumerated domains
-- ---------------------------------------------------------------------

CREATE TYPE master_status AS ENUM ('Active', 'Inactive');

CREATE TYPE product_status AS ENUM (
  'Active', 'On Hold', 'Pending QA', 'Pending Approval', 'Inactive'
);

CREATE TYPE product_origin AS ENUM ('Label Upload', 'Manual Entry');

CREATE TYPE artwork_type AS ENUM ('Full Label', 'Front Artwork', 'Back Artwork');

-- 'Approved' predates the Label Final -> Technical -> QA -> Manager
-- workflow and is retained so existing records stay valid comparison
-- baselines; 'Final Approved' is what the Manager stage produces today.
CREATE TYPE artwork_status AS ENUM (
  'Draft', 'Pending Comparison', 'Under Review', 'Approved',
  'Final Approved', 'Revision Required', 'Rejected', 'Archived'
);

CREATE TYPE comparison_stage AS ENUM ('same_company', 'cross_company');

CREATE TYPE comparison_status AS ENUM (
  'Draft', 'In Progress', 'Completed',
  'Pending Label Final', 'Label Final Approved',
  'Pending Technical', 'Technical Approved',
  'Pending QA', 'QA Approved',
  'Pending Manager Approval', 'Final Approved',
  'Revision Required', 'Rejected'
);

CREATE TYPE workflow_stage AS ENUM ('Label Final', 'Technical', 'QA', 'Manager');

CREATE TYPE workflow_action AS ENUM (
  'Sent to Technical', 'Sent to QA', 'Sent to Manager',
  'Final Approved', 'Rejected', 'Revision Requested'
);

-- MISSING is a first-class result, not a flavour of match or conflict.
-- See src/types/comparison.ts for why that distinction exists.
CREATE TYPE parameter_result AS ENUM ('MATCH', 'SIMILAR', 'CONFLICT', 'MISSING');

CREATE TYPE overall_result AS ENUM ('MATCH', 'REVIEW REQUIRED', 'CONFLICT');

-- ---------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------

CREATE TABLE marketing_companies (
  id            TEXT PRIMARY KEY,               -- MKT-0001
  company_name  TEXT NOT NULL UNIQUE,           -- referenced by name (see note 2)
  short_code    TEXT NOT NULL,
  status        master_status NOT NULL DEFAULT 'Active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT NOT NULL,
  updated_by    TEXT NOT NULL
);

CREATE TABLE manufacturing_companies (
  id            TEXT PRIMARY KEY,               -- MFG-0001
  company_name  TEXT NOT NULL UNIQUE,
  short_code    TEXT NOT NULL,
  status        master_status NOT NULL DEFAULT 'Active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT NOT NULL,
  updated_by    TEXT NOT NULL
);

CREATE TABLE brands (
  id                TEXT PRIMARY KEY,           -- BRD-0001
  brand_name        TEXT NOT NULL UNIQUE,
  marketing_company TEXT NOT NULL REFERENCES marketing_companies (company_name)
                      ON UPDATE CASCADE ON DELETE RESTRICT,
  status            master_status NOT NULL DEFAULT 'Active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT NOT NULL,
  updated_by        TEXT NOT NULL
);

CREATE TABLE flavours (
  id           TEXT PRIMARY KEY,                -- FLV-0001
  flavour_name TEXT NOT NULL UNIQUE,
  status       master_status NOT NULL DEFAULT 'Active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT NOT NULL,
  updated_by   TEXT NOT NULL
);

CREATE TABLE claims (
  id          TEXT PRIMARY KEY,                 -- CLM-0001
  claim_text  TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  status      master_status NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);

CREATE TABLE product_categories (
  id            TEXT PRIMARY KEY,               -- CAT-0001
  category_name TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL DEFAULT '',
  status        master_status NOT NULL DEFAULT 'Active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT NOT NULL,
  updated_by    TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------

CREATE TABLE users (
  id         TEXT PRIMARY KEY,                  -- USR-0001
  full_name  TEXT NOT NULL,
  email      CITEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL,
  status     master_status NOT NULL DEFAULT 'Active',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------

CREATE TABLE products (
  id                    TEXT PRIMARY KEY,       -- PRD-0001
  product_name          TEXT NOT NULL,
  brand_name            TEXT NOT NULL REFERENCES brands (brand_name)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  marketing_company     TEXT NOT NULL REFERENCES marketing_companies (company_name)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  manufacturing_company TEXT NOT NULL REFERENCES manufacturing_companies (company_name)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  flavour               TEXT NOT NULL DEFAULT '',
  fssai_number          TEXT NOT NULL DEFAULT '',
  package_size          TEXT,                   -- optional: predates label intake
  status                product_status NOT NULL DEFAULT 'Active',
  origin                product_origin,         -- NULL on legacy records
  source_artwork_id     TEXT,                   -- FK added after artwork exists
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            TEXT NOT NULL,
  updated_by            TEXT NOT NULL
);

-- Cross-company comparison finds "the same product sold by a different
-- marketing company" by product name. That lookup is case-insensitive in
-- the app, so index it that way rather than forcing the query to be
-- non-sargable.
CREATE INDEX products_name_lower_idx ON products (lower(product_name));
CREATE INDEX products_marketing_company_idx ON products (marketing_company);

-- ---------------------------------------------------------------------
-- Artwork — the versioned label files
-- ---------------------------------------------------------------------

CREATE TABLE artworks (
  id                    TEXT PRIMARY KEY,       -- ART-0001
  product_id            TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,

  -- Denormalised snapshots, captured at upload time. These intentionally do
  -- NOT track later edits to the product: an approved artwork is a record of
  -- what was on the label when it was approved. Same rationale as
  -- types/artwork.ts. They are plain TEXT (no FK) precisely because they
  -- must survive a master record being renamed or retired.
  product_name          TEXT NOT NULL,
  brand                 TEXT NOT NULL,
  marketing_company     TEXT NOT NULL,
  manufacturing_company TEXT NOT NULL,

  version_number        INTEGER NOT NULL CHECK (version_number > 0),
  artwork_type          artwork_type NOT NULL,
  status                artwork_status NOT NULL DEFAULT 'Draft',
  remarks               TEXT NOT NULL DEFAULT '',

  -- File lives in object storage. storage_key is the only handle; a NULL
  -- key means "record exists, file was never durably stored" — which is
  -- exactly the state every localStorage-era artwork is in today, and the
  -- comparison workflow must report it rather than fake a result.
  storage_key           TEXT UNIQUE,
  file_name             TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  byte_size             BIGINT NOT NULL CHECK (byte_size >= 0),
  checksum_sha256       TEXT,                   -- dedupe + integrity

  uploaded_by           TEXT NOT NULL,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            TEXT NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A product+company+type may not have two artworks claiming the same
  -- version. Version history must be append-only, and silently colliding
  -- versions would make "the latest approved one" ambiguous.
  UNIQUE (product_id, marketing_company, artwork_type, version_number)
);

ALTER TABLE products
  ADD CONSTRAINT products_source_artwork_fk
  FOREIGN KEY (source_artwork_id) REFERENCES artworks (id) ON DELETE SET NULL;

CREATE INDEX artworks_product_idx ON artworks (product_id);

-- The hot path for Stage 1 (auto-select the latest approved baseline).
-- Partial index: only approved rows are ever candidates.
CREATE INDEX artworks_approved_lookup_idx
  ON artworks (product_id, marketing_company, artwork_type, version_number DESC)
  WHERE status IN ('Approved', 'Final Approved');

-- ---------------------------------------------------------------------
-- Extracted label content — one row per artwork
-- ---------------------------------------------------------------------
--
-- The 13 parameters the comparison engine compares, plus the extras the OCR
-- pipeline produces. EVERY value is nullable, and NULL is the only way to
-- say "not captured". The CHECK constraints below make the old placeholder
-- bug impossible to reintroduce at the storage layer.

CREATE TABLE artwork_label_attributes (
  artwork_id             TEXT PRIMARY KEY REFERENCES artworks (id) ON DELETE CASCADE,

  brand_name             TEXT,
  product_name           TEXT,
  address                TEXT,
  customer_care_number   TEXT,
  customer_care_email    TEXT,
  colour_theme           TEXT,
  flavour                TEXT,
  claims                 TEXT,
  logo                   TEXT,
  label_design           TEXT,
  nutrition_table_format TEXT,
  fssai_number           TEXT,
  ingredients            TEXT,

  -- Produced by extraction but not part of the 13 compared parameters.
  package_size           TEXT,
  marketing_company      TEXT,
  manufacturing_company  TEXT,

  -- Provenance: how these values came to exist, so a reviewer can tell
  -- OCR output from a human correction.
  source                 TEXT NOT NULL DEFAULT 'ocr'
                           CHECK (source IN ('ocr', 'manual', 'seed')),
  extracted_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  extraction_engine      TEXT,                  -- e.g. 'tesseract@7.0.0'
  raw_text               TEXT,                  -- full OCR text, for auditing

  -- An empty string is not a value. Absence is NULL, always.
  CONSTRAINT label_attributes_no_blank_values CHECK (
    COALESCE(brand_name, 'x')             <> '' AND
    COALESCE(product_name, 'x')           <> '' AND
    COALESCE(address, 'x')                <> '' AND
    COALESCE(customer_care_number, 'x')   <> '' AND
    COALESCE(customer_care_email, 'x')    <> '' AND
    COALESCE(colour_theme, 'x')           <> '' AND
    COALESCE(flavour, 'x')                <> '' AND
    COALESCE(claims, 'x')                 <> '' AND
    COALESCE(logo, 'x')                   <> '' AND
    COALESCE(label_design, 'x')           <> '' AND
    COALESCE(nutrition_table_format, 'x') <> '' AND
    COALESCE(fssai_number, 'x')           <> '' AND
    COALESCE(ingredients, 'x')            <> ''
  ),

  -- Belt and braces: the specific placeholder that caused the false-MATCH
  -- defect must never be persisted as label content again.
  CONSTRAINT label_attributes_no_placeholder CHECK (
    'Not specified' NOT IN (
      COALESCE(address, ''), COALESCE(customer_care_number, ''),
      COALESCE(customer_care_email, ''), COALESCE(colour_theme, ''),
      COALESCE(flavour, ''), COALESCE(claims, ''), COALESCE(logo, ''),
      COALESCE(label_design, ''), COALESCE(nutrition_table_format, ''),
      COALESCE(fssai_number, ''), COALESCE(ingredients, '')
    )
  )
);

-- ---------------------------------------------------------------------
-- Comparisons
-- ---------------------------------------------------------------------

CREATE TABLE comparisons (
  id                          TEXT PRIMARY KEY,  -- CMP-0001
  product_id                  TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  stage                       comparison_stage NOT NULL,

  new_artwork_id              TEXT NOT NULL REFERENCES artworks (id) ON DELETE RESTRICT,
  reference_artwork_id        TEXT REFERENCES artworks (id) ON DELETE RESTRICT,

  -- Aggregates are CACHED, not authoritative. comparison_parameters below
  -- holds the per-parameter truth, so any change to the scoring rule can be
  -- recomputed from stored data instead of silently invalidating history.
  overall_similarity          SMALLINT CHECK (overall_similarity BETWEEN 0 AND 100),
  overall_result              overall_result,
  comparable_parameter_count  SMALLINT NOT NULL DEFAULT 0,
  total_parameter_count       SMALLINT NOT NULL DEFAULT 0,

  status                      comparison_status NOT NULL DEFAULT 'Draft',
  qa_remarks                  TEXT,

  compared_by                 TEXT NOT NULL,
  compared_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  TEXT NOT NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A same-company comparison always has a baseline; a cross-company one is
  -- run against candidates and may legitimately have none.
  CONSTRAINT comparisons_same_company_needs_reference CHECK (
    stage <> 'same_company' OR reference_artwork_id IS NOT NULL
  ),
  CONSTRAINT comparisons_no_self_comparison CHECK (
    reference_artwork_id IS NULL OR reference_artwork_id <> new_artwork_id
  ),
  CONSTRAINT comparisons_coverage_sane CHECK (
    comparable_parameter_count <= total_parameter_count
  )
);

CREATE INDEX comparisons_product_idx ON comparisons (product_id);
CREATE INDEX comparisons_status_idx ON comparisons (status);

CREATE TABLE comparison_parameters (
  comparison_id   TEXT NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
  parameter       TEXT NOT NULL,
  reference_value TEXT,                          -- NULL = not captured
  new_value       TEXT,                          -- NULL = not captured
  result          parameter_result NOT NULL,
  similarity      NUMERIC(4, 3) CHECK (similarity BETWEEN 0 AND 1),

  PRIMARY KEY (comparison_id, parameter),

  -- The invariant the false-MATCH bug violated, enforced by the database:
  -- if either side has no value, the only admissible result is MISSING.
  CONSTRAINT comparison_parameters_absent_is_missing CHECK (
    (reference_value IS NOT NULL AND new_value IS NOT NULL) OR result = 'MISSING'
  )
);

-- ---------------------------------------------------------------------
-- Approval workflow
-- ---------------------------------------------------------------------

CREATE TABLE comparison_approval_assignments (
  comparison_id TEXT NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
  stage         workflow_stage NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_by   TEXT NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comparison_id, stage)
);

-- Append-only. A revision or rejection ADDS an entry; it never edits or
-- removes one. Enforced by trigger below rather than left to convention,
-- because this is the audit trail a compliance reviewer relies on.
CREATE TABLE comparison_workflow_history (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comparison_id    TEXT NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
  stage            workflow_stage NOT NULL,
  action           workflow_action NOT NULL,
  resulting_status comparison_status NOT NULL,
  approval_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  actor_id         TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  actor_name       TEXT NOT NULL,
  actor_role       TEXT NOT NULL,
  remarks          TEXT NOT NULL DEFAULT '',
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comparison_workflow_history_comparison_idx
  ON comparison_workflow_history (comparison_id, occurred_at);

CREATE OR REPLACE FUNCTION reject_history_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'comparison_workflow_history is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comparison_workflow_history_append_only
  BEFORE UPDATE OR DELETE ON comparison_workflow_history
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- ---------------------------------------------------------------------
-- Stage 1 rule, defined once
-- ---------------------------------------------------------------------
--
-- "The latest APPROVED artwork must be automatically selected for
-- same-company version comparison" — the brief's core requirement, and the
-- behaviour artworkService.getLatestApprovedArtwork() implements today.
-- Defining it here means the rule cannot drift between callers.
--
-- Returns no row when the product has no approved artwork, which is the
-- signal to skip version comparison and go straight to cross-company.

CREATE VIEW latest_approved_artworks AS
SELECT DISTINCT ON (product_id, marketing_company, artwork_type)
       id, product_id, marketing_company, artwork_type,
       version_number, status, storage_key, updated_at
FROM   artworks
WHERE  status IN ('Approved', 'Final Approved')
ORDER  BY product_id, marketing_company, artwork_type, version_number DESC;
