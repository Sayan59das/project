// Loads the app's existing demo data into an empty database.
//
// Run with `npm run db:seed`, after `npm run db:migrate`. Safe to run
// repeatedly: every insert is ON CONFLICT DO NOTHING, so a second run over a
// seeded database changes nothing and a run over a partially seeded one fills
// in only what is missing.
//
// WHY THE DATA IS DUPLICATED HERE
// ---------------------------------------------------------------------
// These records currently live in the frontend's src/data/*.ts, which this
// file mirrors. It cannot import them: the backend builds and deploys on its
// own (backend/Dockerfile copies only backend/), and `node dist/db/seed.js`
// runs with nothing but the backend's compiled output on disk. The duplication
// is temporary in the direction that matters — once the frontend reads
// products, masters and users over the API instead of localStorage, its seed
// files become dead code and this becomes the only copy. Until then, a change
// to one has to be made in the other.
//
// WHAT IS DELIBERATELY NOT SEEDED
// ---------------------------------------------------------------------
// - artworks.storage_key stays NULL. There is no file behind a demo artwork,
//   and NULL is the schema's way of saying exactly that (migration 001) — the
//   comparison workflow is meant to report it rather than fake a preview.
// - user_module_access gets no rows. Nobody has customised these users, and
//   migration 003 reads absence as "no override, use the role's defaults".
//   Writing a full sheet per user would restate a policy this side does not
//   own (ROLE_MODULE_ACCESS lives in src/auth/permissions.ts).
// - comparison_workflow_history and comparison_approval_assignments get no
//   rows, matching the frontend seed, whose comparisons carry `history: []`
//   and `approvalAssignments: {}`.

import type { PoolClient } from 'pg';
import { closePool, withTransaction } from './pool';
import { env } from '../config/env';
import { hashPassword } from '../services/password.service';
import { versionToNumber } from '../repositories/mappers';
import {
  ArtworkStatus,
  ArtworkType,
  COMPARISON_PARAMETERS,
  ComparisonParameterName,
  ComparisonStage,
  ComparisonStatus,
  MasterStatus,
  OverallResult,
  ParameterResult,
  ProductStatus,
  UserStatus
} from '../types/domain';

const SEED_DATE = '2026-01-08';
const SYSTEM_ACTOR = 'Aman Kumar';

/**
 * A calendar date as the instant that reads back as the same calendar date.
 *
 * These columns are TIMESTAMPTZ and mappers.toDateString formats them in UTC
 * (deliberately — see its comment). Handing Postgres a bare '2026-01-10'
 * would have it applied in the server's timezone, so east of UTC the row
 * stores 2026-01-09T18:30:00Z and the app displays a seed date one day early —
 * on a developer's machine in IST but not on Render, which runs UTC. Pinning
 * the instant to UTC midnight makes the stored date independent of where the
 * seed happens to run.
 */
function atUtcMidnight(date: string): string {
  return `${date}T00:00:00Z`;
}

type Value = string | number | boolean | null;

/**
 * Inserts every row in one statement, skipping any that already exist.
 *
 * ON CONFLICT DO NOTHING with no conflict target covers the primary key and
 * every unique constraint on the table, which is what idempotency means here:
 * re-running must not fail on rows a previous run inserted, whichever
 * constraint would have caught them.
 */
async function insertRows(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly Value[])[]
): Promise<number> {
  if (rows.length === 0) return 0;

  rows.forEach((row, index) => {
    // Arity is not checked by the type system (the rows are tuples of a union,
    // not fixed-length tuples), and a row with one value too few silently
    // shifts every column after it. Postgres would usually reject the result,
    // but not always — two adjacent TEXT columns swap without complaint.
    if (row.length !== columns.length) {
      throw new Error(
        `[seed] ${table} row ${index} has ${row.length} values for ${columns.length} columns.`
      );
    }
  });

  const placeholders = rows
    .map((row, rowIndex) => `(${row.map((_, i) => `$${rowIndex * columns.length + i + 1}`).join(', ')})`)
    .join(', ');

  const { rowCount } = await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    rows.flat()
  );
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------
// Master data — src/data/masters.ts
// ---------------------------------------------------------------------

// Every master record was created on SEED_DATE by SYSTEM_ACTOR; only
// updatedDate ever differs, so it is the only audit field carried per row.
type MasterSeed = { id: string; status: MasterStatus; updatedDate?: string };

const MARKETING_COMPANIES: readonly (MasterSeed & { companyName: string; shortCode: string })[] = [
  { id: 'MKT-0001', companyName: 'ABC Healthcare', shortCode: 'ABC', status: 'Active' },
  { id: 'MKT-0002', companyName: 'XYZ Healthcare', shortCode: 'XYZ', status: 'Active' },
  { id: 'MKT-0003', companyName: 'NutriCare', shortCode: 'NTC', status: 'Active' },
  { id: 'MKT-0004', companyName: 'Wellness Co', shortCode: 'WEL', status: 'Active' },
  { id: 'MKT-0005', companyName: 'NutriLife Distributors', shortCode: 'NLD', status: 'Active' },
  { id: 'MKT-0006', companyName: 'PureHealth Retail', shortCode: 'PHR', status: 'Active' },
  { id: 'MKT-0007', companyName: 'OldLine Distributors', shortCode: 'OLD', status: 'Inactive', updatedDate: '2026-04-01' }
];

const MANUFACTURING_COMPANIES: readonly (MasterSeed & { companyName: string; shortCode: string })[] = [
  { id: 'MFG-0001', companyName: 'IM Healthcare Pvt. Ltd.', shortCode: 'IMH', status: 'Active' },
  { id: 'MFG-0002', companyName: 'IM Healthcare Pvt. Ltd. - Unit II', shortCode: 'IMH2', status: 'Active' }
];

// BRD-0006..BRD-0011 were added to the frontend seed alongside this file:
// products referenced those brand names without any brand record existing,
// which products.brand_name's foreign key rejects. See the comment in
// src/data/masters.ts.
const BRANDS: readonly (MasterSeed & { brandName: string; marketingCompany: string })[] = [
  { id: 'BRD-0001', brandName: 'VitaFit', marketingCompany: 'ABC Healthcare', status: 'Active' },
  { id: 'BRD-0002', brandName: 'NutriPlus', marketingCompany: 'XYZ Healthcare', status: 'Active' },
  { id: 'BRD-0003', brandName: 'HairCare Plus', marketingCompany: 'ABC Healthcare', status: 'Active' },
  { id: 'BRD-0004', brandName: 'Wellness Co', marketingCompany: 'Wellness Co', status: 'Active' },
  { id: 'BRD-0005', brandName: 'CalmLife', marketingCompany: 'PureHealth Retail', status: 'Active' },
  { id: 'BRD-0006', brandName: 'BoneStrong', marketingCompany: 'ABC Healthcare', status: 'Active' },
  { id: 'BRD-0007', brandName: 'GutHealth', marketingCompany: 'XYZ Healthcare', status: 'Active' },
  { id: 'BRD-0008', brandName: 'GlowUp', marketingCompany: 'Wellness Co', status: 'Active' },
  { id: 'BRD-0009', brandName: 'KidCare', marketingCompany: 'ABC Healthcare', status: 'Active' },
  { id: 'BRD-0010', brandName: 'CitraBoost', marketingCompany: 'XYZ Healthcare', status: 'Active' },
  { id: 'BRD-0011', brandName: 'ImmunoBoost', marketingCompany: 'NutriCare', status: 'Active' }
];

const FLAVOURS: readonly (MasterSeed & { flavourName: string })[] = [
  { id: 'FLV-0001', flavourName: 'Orange', status: 'Active' },
  { id: 'FLV-0002', flavourName: 'Strawberry', status: 'Active' },
  { id: 'FLV-0003', flavourName: 'Mixed Berry', status: 'Active' },
  { id: 'FLV-0004', flavourName: 'Mango', status: 'Active' },
  { id: 'FLV-0005', flavourName: 'Lemon', status: 'Active' },
  { id: 'FLV-0006', flavourName: 'Grape', status: 'Active' },
  { id: 'FLV-0007', flavourName: 'Chocolate', status: 'Active' },
  { id: 'FLV-0008', flavourName: 'Unflavoured', status: 'Active' }
];

const CLAIMS: readonly (MasterSeed & { claimText: string; description: string })[] = [
  {
    id: 'CLM-0001',
    claimText: 'Supports Immunity',
    description: 'Contains ingredients that support the immune system.',
    status: 'Active'
  },
  { id: 'CLM-0002', claimText: 'Sugar Free', description: 'Contains no added sugar.', status: 'Active' },
  {
    id: 'CLM-0003',
    claimText: 'High in Vitamin C',
    description: 'Provides a significant daily value of Vitamin C.',
    status: 'Active'
  },
  {
    id: 'CLM-0004',
    claimText: 'No Added Preservatives',
    description: 'Formulated without added preservatives.',
    status: 'Active'
  }
];

const PRODUCT_CATEGORIES: readonly (MasterSeed & { categoryName: string; description: string })[] = [
  { id: 'CAT-0001', categoryName: 'Gummies', description: 'Chewable gummy format supplements.', status: 'Active' },
  { id: 'CAT-0002', categoryName: 'Tablets', description: 'Compressed tablet format supplements.', status: 'Active' },
  { id: 'CAT-0003', categoryName: 'Capsules', description: 'Capsule format supplements.', status: 'Active' },
  { id: 'CAT-0004', categoryName: 'Powder', description: 'Powder format supplements.', status: 'Active' },
  { id: 'CAT-0005', categoryName: 'Liquid', description: 'Liquid/syrup format supplements.', status: 'Active' }
];

// ---------------------------------------------------------------------
// Users — the directory the frontend reads through src/services/userService.ts
// ---------------------------------------------------------------------

// Ids keep the app's 'U-001' shape rather than being renumbered to the
// 'USR-0001' this backend issues. They are what the frontend has stored and
// what any localStorage-era reference points at; renumbering them would
// break those references to gain nothing.
type UserSeed = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  department: string;
  status: UserStatus;
  createdDate: string;
};

const USERS: readonly UserSeed[] = [
  { id: 'U-001', fullName: 'Aman Kumar', email: 'manager@imhealthcare.com', role: 'manager', department: 'Management', status: 'Active', createdDate: '2026-01-05' },
  { id: 'U-002', fullName: 'Priya Sharma', email: 'account@imhealthcare.com', role: 'account_manager', department: 'Marketing', status: 'Active', createdDate: '2026-01-12' },
  { id: 'U-003', fullName: 'Neha Singh', email: 'labelfinal@imhealthcare.com', role: 'label_final', department: 'Label', status: 'Active', createdDate: '2026-01-18' },
  { id: 'U-004', fullName: 'Rohit Verma', email: 'technical@imhealthcare.com', role: 'technical', department: 'Technical', status: 'Active', createdDate: '2026-02-02' },
  { id: 'U-005', fullName: 'Rahul Kumar', email: 'qa@imhealthcare.com', role: 'qa', department: 'Quality', status: 'Active', createdDate: '2026-02-10' }
];

// ---------------------------------------------------------------------
// Products — src/data/products.ts
// ---------------------------------------------------------------------

type ProductSeed = {
  id: string;
  productName: string;
  brandName: string;
  marketingCompany: string;
  manufacturingCompany: string;
  flavour: string;
  fssaiNumber: string;
  status: ProductStatus;
  createdDate: string;
  updatedDate: string;
  createdBy: string;
  updatedBy: string;
};

const IMH = 'IM Healthcare Pvt. Ltd.';
const IMH_UNIT_II = 'IM Healthcare Pvt. Ltd. - Unit II';
const PRIYA = 'Priya Sharma';

const PRODUCTS: readonly ProductSeed[] = [
  { id: 'PRD-0001', productName: 'Vitamin C Gummies', brandName: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, flavour: 'Orange', fssaiNumber: '10023045001234', status: 'Active', createdDate: '2026-01-10', updatedDate: '2026-06-02', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0002', productName: 'Multivitamin Gummies', brandName: 'NutriPlus', marketingCompany: 'XYZ Healthcare', manufacturingCompany: IMH, flavour: 'Mixed Berry', fssaiNumber: '10023045001235', status: 'Active', createdDate: '2026-01-14', updatedDate: '2026-05-20', createdBy: PRIYA, updatedBy: SYSTEM_ACTOR },
  { id: 'PRD-0003', productName: 'Biotin Gummies', brandName: 'HairCare Plus', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, flavour: 'Strawberry', fssaiNumber: '10023045001236', status: 'Pending QA', createdDate: '2026-02-01', updatedDate: '2026-07-11', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0004', productName: 'Omega 3 Gummies', brandName: 'NutriPlus', marketingCompany: 'NutriLife Distributors', manufacturingCompany: IMH_UNIT_II, flavour: 'Lemon', fssaiNumber: '10023045001237', status: 'Pending Approval', createdDate: '2026-02-08', updatedDate: '2026-07-15', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0005', productName: 'Zinc Immunity Gummies', brandName: 'Wellness Co', marketingCompany: 'Wellness Co', manufacturingCompany: IMH, flavour: 'Mango', fssaiNumber: '10023045001238', status: 'Active', createdDate: '2026-02-12', updatedDate: '2026-06-28', createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'PRD-0006', productName: 'Calcium & Vitamin D3 Gummies', brandName: 'BoneStrong', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, flavour: 'Grape', fssaiNumber: '10023045001239', status: 'On Hold', createdDate: '2026-02-20', updatedDate: '2026-05-30', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0007', productName: 'Ashwagandha Gummies', brandName: 'CalmLife', marketingCompany: 'PureHealth Retail', manufacturingCompany: IMH, flavour: 'Chocolate', fssaiNumber: '10023045001240', status: 'Active', createdDate: '2026-03-01', updatedDate: '2026-07-02', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0008', productName: 'Probiotic Gummies', brandName: 'GutHealth', marketingCompany: 'XYZ Healthcare', manufacturingCompany: IMH, flavour: 'Mixed Berry', fssaiNumber: '10023045001241', status: 'Pending QA', createdDate: '2026-03-05', updatedDate: '2026-07-18', createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'PRD-0009', productName: 'Iron Folic Gummies', brandName: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, flavour: 'Strawberry', fssaiNumber: '10023045001242', status: 'Active', createdDate: '2026-03-10', updatedDate: '2026-06-14', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0010', productName: 'Collagen Beauty Gummies', brandName: 'GlowUp', marketingCompany: 'Wellness Co', manufacturingCompany: IMH_UNIT_II, flavour: 'Orange', fssaiNumber: '10023045001243', status: 'Inactive', createdDate: '2025-11-18', updatedDate: '2026-04-02', createdBy: PRIYA, updatedBy: SYSTEM_ACTOR },
  { id: 'PRD-0011', productName: 'Melatonin Sleep Gummies', brandName: 'CalmLife', marketingCompany: 'PureHealth Retail', manufacturingCompany: IMH, flavour: 'Grape', fssaiNumber: '10023045001244', status: 'Active', createdDate: '2026-03-22', updatedDate: '2026-07-08', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0012', productName: 'Vitamin B12 Gummies', brandName: 'NutriPlus', marketingCompany: 'NutriLife Distributors', manufacturingCompany: IMH, flavour: 'Mango', fssaiNumber: '10023045001245', status: 'Pending Approval', createdDate: '2026-04-02', updatedDate: '2026-07-20', createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR },
  { id: 'PRD-0013', productName: 'Multivitamin Kids Gummies', brandName: 'KidCare', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, flavour: 'Mixed Berry', fssaiNumber: '10023045001246', status: 'Active', createdDate: '2026-04-15', updatedDate: '2026-07-25', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0014', productName: 'Apple Cider Vinegar Gummies', brandName: 'Wellness Co', marketingCompany: 'Wellness Co', manufacturingCompany: IMH, flavour: 'Lemon', fssaiNumber: '10023045001247', status: 'On Hold', createdDate: '2026-04-20', updatedDate: '2026-06-30', createdBy: PRIYA, updatedBy: PRIYA },
  // The same "Vitamin C Gummies" marketed by other companies — what gives
  // Cross-Company Comparison real candidates to find by product name.
  { id: 'PRD-0015', productName: 'Vitamin C Gummies', brandName: 'CitraBoost', marketingCompany: 'XYZ Healthcare', manufacturingCompany: IMH, flavour: 'Orange', fssaiNumber: '10023045001248', status: 'Active', createdDate: '2026-03-15', updatedDate: '2026-07-05', createdBy: PRIYA, updatedBy: PRIYA },
  { id: 'PRD-0016', productName: 'Vitamin C Gummies', brandName: 'ImmunoBoost', marketingCompany: 'NutriCare', manufacturingCompany: IMH, flavour: 'Mango', fssaiNumber: '10023045001249', status: 'Active', createdDate: '2026-03-20', updatedDate: '2026-07-05', createdBy: PRIYA, updatedBy: PRIYA }
];

// ---------------------------------------------------------------------
// Artworks — src/data/artworks.ts
// ---------------------------------------------------------------------

type ArtworkSeed = {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  version: string;
  artworkType: ArtworkType;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: ArtworkStatus;
  remarks: string;
  uploadedBy: string;
  uploadDate: string;
  updatedBy: string;
  updatedDate: string;
};

const ARTWORKS: readonly ArtworkSeed[] = [
  { id: 'ART-0001', productId: 'PRD-0001', productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V1', artworkType: 'Full Label', fileName: 'VitaminC_Gummies_V1.pdf', fileType: 'application/pdf', fileSize: 1_240_000, status: 'Approved', remarks: 'Initial approved artwork.', uploadedBy: PRIYA, uploadDate: '2026-01-15', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-01-20' },
  { id: 'ART-0002', productId: 'PRD-0001', productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V2', artworkType: 'Full Label', fileName: 'VitaminC_Gummies_V2.pdf', fileType: 'application/pdf', fileSize: 1_310_000, status: 'Approved', remarks: 'Updated claims wording.', uploadedBy: PRIYA, uploadDate: '2026-03-02', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-03-06' },
  { id: 'ART-0003', productId: 'PRD-0001', productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V3', artworkType: 'Full Label', fileName: 'VitaminC_Gummies_V3.pdf', fileType: 'application/pdf', fileSize: 1_355_000, status: 'Approved', remarks: 'Nutrition table refresh.', uploadedBy: PRIYA, uploadDate: '2026-05-10', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-05-14' },
  { id: 'ART-0004', productId: 'PRD-0001', productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V4', artworkType: 'Full Label', fileName: 'VitaminC_Gummies_V4.pdf', fileType: 'application/pdf', fileSize: 1_402_000, status: 'Approved', remarks: 'FSSAI number correction.', uploadedBy: PRIYA, uploadDate: '2026-06-25', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-06-29' },
  { id: 'ART-0005', productId: 'PRD-0001', productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V5', artworkType: 'Full Label', fileName: 'VitaminC_Gummies_V5.pdf', fileType: 'application/pdf', fileSize: 1_460_000, status: 'Draft', remarks: 'Draft refresh for new packaging size.', uploadedBy: PRIYA, uploadDate: '2026-08-14', updatedBy: PRIYA, updatedDate: '2026-08-14' },
  { id: 'ART-0006', productId: 'PRD-0002', productName: 'Multivitamin Gummies', brand: 'NutriPlus', marketingCompany: 'XYZ Healthcare', manufacturingCompany: IMH, version: 'V1', artworkType: 'Full Label', fileName: 'Multivitamin_Gummies_V1.pdf', fileType: 'application/pdf', fileSize: 1_180_000, status: 'Approved', remarks: 'Launch artwork.', uploadedBy: PRIYA, uploadDate: '2026-02-05', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-02-09' },
  { id: 'ART-0007', productId: 'PRD-0002', productName: 'Multivitamin Gummies', brand: 'NutriPlus', marketingCompany: 'XYZ Healthcare', manufacturingCompany: IMH, version: 'V2', artworkType: 'Full Label', fileName: 'Multivitamin_Gummies_V2.pdf', fileType: 'application/pdf', fileSize: 1_205_000, status: 'Under Review', remarks: 'Revised flavour claim under legal review.', uploadedBy: PRIYA, uploadDate: '2026-07-30', updatedBy: PRIYA, updatedDate: '2026-07-30' },
  { id: 'ART-0008', productId: 'PRD-0003', productName: 'Biotin Gummies', brand: 'HairCare Plus', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V1', artworkType: 'Full Label', fileName: 'Biotin_Gummies_V1.pdf', fileType: 'application/pdf', fileSize: 1_098_000, status: 'Pending Comparison', remarks: 'Sent for comparison against similar existing labels.', uploadedBy: PRIYA, uploadDate: '2026-08-10', updatedBy: PRIYA, updatedDate: '2026-08-10' },
  { id: 'ART-0009', productId: 'PRD-0001', productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V4', artworkType: 'Front Artwork', fileName: 'VitaminC_Gummies_Front_V4.png', fileType: 'image/png', fileSize: 820_000, status: 'Approved', remarks: 'Front panel crop for packaging line.', uploadedBy: PRIYA, uploadDate: '2026-06-25', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-06-29' },
  { id: 'ART-0010', productId: 'PRD-0001', productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare', manufacturingCompany: IMH, version: 'V3', artworkType: 'Back Artwork', fileName: 'VitaminC_Gummies_Back_V3_old.png', fileType: 'image/png', fileSize: 790_000, status: 'Archived', remarks: 'Superseded back-panel crop, replaced after V4 refresh.', uploadedBy: PRIYA, uploadDate: '2026-05-10', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-06-29' },
  { id: 'ART-0011', productId: 'PRD-0015', productName: 'Vitamin C Gummies', brand: 'CitraBoost', marketingCompany: 'XYZ Healthcare', manufacturingCompany: IMH, version: 'V1', artworkType: 'Full Label', fileName: 'VitaminC_Gummies_XYZ_V1.pdf', fileType: 'application/pdf', fileSize: 1_220_000, status: 'Approved', remarks: 'XYZ Healthcare launch artwork.', uploadedBy: PRIYA, uploadDate: '2026-03-18', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-03-22' },
  { id: 'ART-0012', productId: 'PRD-0016', productName: 'Vitamin C Gummies', brand: 'ImmunoBoost', marketingCompany: 'NutriCare', manufacturingCompany: IMH, version: 'V1', artworkType: 'Full Label', fileName: 'VitaminC_Gummies_NutriCare_V1.pdf', fileType: 'application/pdf', fileSize: 1_190_000, status: 'Approved', remarks: 'NutriCare launch artwork.', uploadedBy: PRIYA, uploadDate: '2026-03-24', updatedBy: SYSTEM_ACTOR, updatedDate: '2026-03-28' }
];

// ---------------------------------------------------------------------
// Label attributes — src/data/comparisons.ts (SEED_LABEL_ATTRIBUTES)
// ---------------------------------------------------------------------

// The 13 compared parameters, keyed the way the API shapes them. Split out
// from the row type so PARAMETER_ATTRIBUTE below can be exhaustive over it.
type LabelAttributeValues = {
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

type LabelAttributeSeed = LabelAttributeValues & { artworkId: string };

const IMH_ADDRESS = 'IM Healthcare Pvt. Ltd., Plot 12, Industrial Area, Pune, Maharashtra 411019';

const LABEL_ATTRIBUTES: readonly LabelAttributeSeed[] = [
  // Vitamin C Gummies — ABC Healthcare — V4 (Approved, the comparison baseline)
  {
    artworkId: 'ART-0004',
    brandName: 'VitaFit',
    productName: 'Vitamin C Gummies',
    address: IMH_ADDRESS,
    customerCareNumber: '1800-123-4567',
    customerCareEmail: 'care@imhealthcare.com',
    colourTheme: 'Green & Orange gradient',
    flavour: 'Orange',
    claims: 'Supports Immunity | High in Vitamin C',
    logo: 'VitaFit Apple Logo v2',
    labelDesign: 'Standard Layout A',
    nutritionTableFormat: 'Standard (per 2 gummies)',
    fssaiNumber: '10023045001234',
    ingredients: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour'
  },
  // Vitamin C Gummies — ABC Healthcare — V5 (Draft, the new label)
  {
    artworkId: 'ART-0005',
    brandName: 'VitaFit',
    productName: 'Vitamin C Gummies',
    address: IMH_ADDRESS,
    customerCareNumber: '1800-123-4567',
    customerCareEmail: 'care@imhealthcare.com',
    colourTheme: 'Green & Orange gradient (refreshed shade)',
    flavour: 'Orange',
    claims: 'Supports Immunity | High in Vitamin C | Supports Energy',
    logo: 'VitaFit Apple Logo v2',
    labelDesign: 'Standard Layout A (refreshed)',
    nutritionTableFormat: 'Standard (per 2 gummies)',
    fssaiNumber: '10023045001234',
    ingredients: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour'
  },
  // Multivitamin Gummies — XYZ Healthcare — V1 (Approved, baseline)
  {
    artworkId: 'ART-0006',
    brandName: 'NutriPlus',
    productName: 'Multivitamin Gummies',
    address: IMH_ADDRESS,
    customerCareNumber: '1800-987-6543',
    customerCareEmail: 'support@xyzhealthcare.com',
    colourTheme: 'Purple & Yellow',
    flavour: 'Mixed Berry',
    claims: 'Supports Overall Wellness',
    logo: 'NutriPlus Star Logo',
    labelDesign: 'Standard Layout B',
    nutritionTableFormat: 'Standard (per 1 gummy)',
    fssaiNumber: '10023045001235',
    ingredients: 'Vitamin A, B-Complex, C, D3, E, Sugar, Pectin, Natural Berry Flavour'
  },
  // Multivitamin Gummies — XYZ Healthcare — V2 (Under Review, new label)
  {
    artworkId: 'ART-0007',
    brandName: 'NutriPlus',
    productName: 'Multivitamin Gummies',
    address: IMH_ADDRESS,
    customerCareNumber: '1800-987-6543',
    customerCareEmail: 'support@xyzhealthcare.com',
    colourTheme: 'Purple & Yellow',
    flavour: 'Mixed Berry',
    claims: 'Supports Overall Wellness Daily',
    logo: 'NutriPlus Star Logo',
    labelDesign: 'Standard Layout B',
    nutritionTableFormat: 'Standard (per 1 gummy)',
    fssaiNumber: '10023045001235',
    ingredients: 'Vitamin A, B-Complex, C, D3, E, Sugar, Pectin, Natural Berry Flavour'
  },
  // Vitamin C Gummies — XYZ Healthcare — V1 (cross-company candidate)
  {
    artworkId: 'ART-0011',
    brandName: 'CitraBoost',
    productName: 'Vitamin C Gummies',
    address: IMH_ADDRESS,
    customerCareNumber: '1800-555-2222',
    customerCareEmail: 'care@xyzhealthcare.com',
    colourTheme: 'Blue & Orange',
    flavour: 'Orange',
    claims: 'Supports Immunity',
    logo: 'CitraBoost Citrus Logo',
    labelDesign: 'Standard Layout A',
    nutritionTableFormat: 'Standard (per 2 gummies)',
    fssaiNumber: '10023045009911',
    ingredients: 'Vitamin C, Pectin, Sugar, Citric Acid, Natural Orange Flavour'
  },
  // Vitamin C Gummies — NutriCare — V1 (cross-company candidate)
  {
    artworkId: 'ART-0012',
    brandName: 'ImmunoBoost',
    productName: 'Vitamin C Gummies',
    address: IMH_ADDRESS,
    customerCareNumber: '1800-444-1111',
    customerCareEmail: 'care@nutricare.com',
    colourTheme: 'Red & Yellow',
    flavour: 'Mango',
    claims: 'Boosts Immunity Fast',
    logo: 'ImmunoBoost Shield Logo',
    labelDesign: 'Standard Layout C',
    nutritionTableFormat: 'Detailed (per 100g)',
    fssaiNumber: '10023045009922',
    ingredients: 'Vitamin C, Zinc, Pectin, Sugar, Citric Acid, Natural Mango Flavour'
  }
];

// ---------------------------------------------------------------------
// Comparisons — src/data/comparisons.ts (SEED_COMPARISONS)
// ---------------------------------------------------------------------

// Which label attribute each compared parameter reads. Typed as a total
// Record over ComparisonParameterName, so a parameter added to
// COMPARISON_PARAMETERS without a home here is a compile error rather than a
// row that quietly goes missing.
const PARAMETER_ATTRIBUTE: Record<ComparisonParameterName, keyof LabelAttributeValues> = {
  'Brand Name': 'brandName',
  'Product Name': 'productName',
  Address: 'address',
  'Customer Care Number': 'customerCareNumber',
  'Customer Care Email': 'customerCareEmail',
  'Colour Theme': 'colourTheme',
  Flavour: 'flavour',
  Claims: 'claims',
  Logo: 'logo',
  'Label Design / Layout': 'labelDesign',
  'Nutrition Table Format': 'nutritionTableFormat',
  'FSSAI Number': 'fssaiNumber',
  Ingredients: 'ingredients'
};

// Only the per-parameter verdicts are carried here. The values either side of
// each verdict are read from LABEL_ATTRIBUTES at insert time rather than
// transcribed a second time — the frontend seed spells all 13 out per
// comparison, which is three chances for a stored comparison to disagree with
// the label it claims to have compared.
type ComparisonSeed = {
  id: string;
  productId: string;
  stage: ComparisonStage;
  newArtworkId: string;
  referenceArtworkId: string | null;
  overallSimilarity: number;
  overallResult: OverallResult;
  status: ComparisonStatus;
  comparedBy: string;
  comparisonDate: string;
  updatedBy: string;
  updatedDate: string;
  results: Record<ComparisonParameterName, ParameterResult>;
};

const COMPARISONS: readonly ComparisonSeed[] = [
  {
    id: 'CMP-0001',
    productId: 'PRD-0001',
    stage: 'same_company',
    newArtworkId: 'ART-0005',
    referenceArtworkId: 'ART-0004',
    overallSimilarity: 92,
    overallResult: 'REVIEW REQUIRED',
    status: 'Pending Label Final',
    comparedBy: PRIYA,
    comparisonDate: '2026-08-15',
    updatedBy: PRIYA,
    updatedDate: '2026-08-15',
    results: {
      'Brand Name': 'MATCH',
      'Product Name': 'MATCH',
      Address: 'MATCH',
      'Customer Care Number': 'MATCH',
      'Customer Care Email': 'MATCH',
      'Colour Theme': 'SIMILAR',
      Flavour: 'MATCH',
      Claims: 'SIMILAR',
      Logo: 'MATCH',
      'Label Design / Layout': 'SIMILAR',
      'Nutrition Table Format': 'MATCH',
      'FSSAI Number': 'MATCH',
      Ingredients: 'MATCH'
    }
  },
  {
    id: 'CMP-0002',
    productId: 'PRD-0002',
    stage: 'same_company',
    newArtworkId: 'ART-0007',
    referenceArtworkId: 'ART-0006',
    overallSimilarity: 97,
    overallResult: 'MATCH',
    status: 'Completed',
    comparedBy: PRIYA,
    comparisonDate: '2026-07-31',
    updatedBy: SYSTEM_ACTOR,
    updatedDate: '2026-08-02',
    results: {
      'Brand Name': 'MATCH',
      'Product Name': 'MATCH',
      Address: 'MATCH',
      'Customer Care Number': 'MATCH',
      'Customer Care Email': 'MATCH',
      'Colour Theme': 'MATCH',
      Flavour: 'MATCH',
      Claims: 'SIMILAR',
      Logo: 'MATCH',
      'Label Design / Layout': 'MATCH',
      'Nutrition Table Format': 'MATCH',
      'FSSAI Number': 'MATCH',
      Ingredients: 'MATCH'
    }
  },
  {
    id: 'CMP-0003',
    productId: 'PRD-0001',
    stage: 'cross_company',
    newArtworkId: 'ART-0004',
    referenceArtworkId: 'ART-0012',
    overallSimilarity: 20,
    overallResult: 'CONFLICT',
    status: 'Completed',
    comparedBy: PRIYA,
    comparisonDate: '2026-08-16',
    updatedBy: PRIYA,
    updatedDate: '2026-08-16',
    results: {
      'Brand Name': 'CONFLICT',
      'Product Name': 'MATCH',
      Address: 'MATCH',
      'Customer Care Number': 'CONFLICT',
      'Customer Care Email': 'CONFLICT',
      'Colour Theme': 'CONFLICT',
      Flavour: 'CONFLICT',
      Claims: 'CONFLICT',
      Logo: 'CONFLICT',
      'Label Design / Layout': 'CONFLICT',
      'Nutrition Table Format': 'CONFLICT',
      'FSSAI Number': 'CONFLICT',
      Ingredients: 'SIMILAR'
    }
  }
];

// ---------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------

const AUDIT_COLUMNS = ['created_at', 'updated_at', 'created_by', 'updated_by'] as const;

function masterAudit(row: MasterSeed): readonly Value[] {
  return [atUtcMidnight(SEED_DATE), atUtcMidnight(row.updatedDate ?? SEED_DATE), SYSTEM_ACTOR, SYSTEM_ACTOR];
}

function attributesOf(artworkId: string): LabelAttributeValues | undefined {
  return LABEL_ATTRIBUTES.find((row) => row.artworkId === artworkId);
}

/**
 * The parameter rows for one comparison, read off the two labels it compares.
 *
 * A comparison whose artwork has no stored attributes yields no parameter
 * rows at all, rather than 13 rows of nothing. Inventing MISSING rows would
 * assert that a comparison was run and found nothing, when what actually
 * happened is that it was never run against extracted data — the distinction
 * migration 001's "absent is MISSING" CHECK exists to protect.
 */
function parameterRows(comparison: ComparisonSeed): readonly (readonly Value[])[] {
  const newAttributes = attributesOf(comparison.newArtworkId);
  const referenceAttributes =
    comparison.referenceArtworkId === null ? undefined : attributesOf(comparison.referenceArtworkId);

  if (!newAttributes || !referenceAttributes) return [];

  return COMPARISON_PARAMETERS.map((parameter) => {
    const attribute = PARAMETER_ATTRIBUTE[parameter];
    return [
      comparison.id,
      parameter,
      referenceAttributes[attribute],
      newAttributes[attribute],
      comparison.results[parameter]
    ];
  });
}

export async function seed(): Promise<Record<string, number>> {
  // One transaction for the whole seed. A run that fails part-way through —
  // a foreign key that does not resolve, a value outside an enum — must leave
  // the database as it found it, not half-populated with a subset that looks
  // like real data.
  return withTransaction(async (client: PoolClient) => {
    const counts: Record<string, number> = {};

    counts.marketing_companies = await insertRows(
      client,
      'marketing_companies',
      ['id', 'company_name', 'short_code', 'status', ...AUDIT_COLUMNS],
      MARKETING_COMPANIES.map((row) => [row.id, row.companyName, row.shortCode, row.status, ...masterAudit(row)])
    );

    counts.manufacturing_companies = await insertRows(
      client,
      'manufacturing_companies',
      ['id', 'company_name', 'short_code', 'status', ...AUDIT_COLUMNS],
      MANUFACTURING_COMPANIES.map((row) => [row.id, row.companyName, row.shortCode, row.status, ...masterAudit(row)])
    );

    // After marketing_companies: brands.marketing_company is a foreign key
    // onto marketing_companies.company_name.
    counts.brands = await insertRows(
      client,
      'brands',
      ['id', 'brand_name', 'marketing_company', 'status', ...AUDIT_COLUMNS],
      BRANDS.map((row) => [row.id, row.brandName, row.marketingCompany, row.status, ...masterAudit(row)])
    );

    counts.flavours = await insertRows(
      client,
      'flavours',
      ['id', 'flavour_name', 'status', ...AUDIT_COLUMNS],
      FLAVOURS.map((row) => [row.id, row.flavourName, row.status, ...masterAudit(row)])
    );

    counts.claims = await insertRows(
      client,
      'claims',
      ['id', 'claim_text', 'description', 'status', ...AUDIT_COLUMNS],
      CLAIMS.map((row) => [row.id, row.claimText, row.description, row.status, ...masterAudit(row)])
    );

    counts.product_categories = await insertRows(
      client,
      'product_categories',
      ['id', 'category_name', 'description', 'status', ...AUDIT_COLUMNS],
      PRODUCT_CATEGORIES.map((row) => [row.id, row.categoryName, row.description, row.status, ...masterAudit(row)])
    );

    counts.users = await insertRows(
      client,
      'users',
      ['id', 'full_name', 'email', 'role', 'department', 'status', 'created_at', 'updated_at'],
      USERS.map((row) => [
        row.id,
        row.fullName,
        row.email,
        row.role,
        row.department,
        row.status,
        atUtcMidnight(row.createdDate),
        // Nothing has edited a seed user, so updated_at is its creation
        // instant. Letting the column default to now() would date every
        // seeded record to whenever the seed happened to run.
        atUtcMidnight(row.createdDate)
      ])
    );

    // After brands and both company tables — products has a foreign key onto
    // each of the three by name.
    counts.products = await insertRows(
      client,
      'products',
      [
        'id',
        'product_name',
        'brand_name',
        'marketing_company',
        'manufacturing_company',
        'flavour',
        'fssai_number',
        'status',
        ...AUDIT_COLUMNS
      ],
      PRODUCTS.map((row) => [
        row.id,
        row.productName,
        row.brandName,
        row.marketingCompany,
        row.manufacturingCompany,
        row.flavour,
        row.fssaiNumber,
        row.status,
        atUtcMidnight(row.createdDate),
        atUtcMidnight(row.updatedDate),
        row.createdBy,
        row.updatedBy
      ])
    );

    // storage_key, checksum_sha256 and products.source_artwork_id are all
    // left unset: there is no file, no bytes to checksum, and none of these
    // products was created from a label upload.
    counts.artworks = await insertRows(
      client,
      'artworks',
      [
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
        'file_name',
        'mime_type',
        'byte_size',
        'uploaded_by',
        'uploaded_at',
        'updated_by',
        'updated_at'
      ],
      ARTWORKS.map((row) => [
        row.id,
        row.productId,
        row.productName,
        row.brand,
        row.marketingCompany,
        row.manufacturingCompany,
        versionToNumber(row.version),
        row.artworkType,
        row.status,
        row.remarks,
        row.fileName,
        row.fileType,
        row.fileSize,
        row.uploadedBy,
        atUtcMidnight(row.uploadDate),
        row.updatedBy,
        atUtcMidnight(row.updatedDate)
      ])
    );

    // source is 'seed', not 'ocr': these values were written by hand, and a
    // reviewer looking at a deviation needs to be able to tell that from OCR
    // output. extraction_engine and raw_text stay NULL for the same reason —
    // no engine produced them and there is no source text to audit.
    // extracted_at defaults to now(), which is when they came into existence.
    counts.artwork_label_attributes = await insertRows(
      client,
      'artwork_label_attributes',
      [
        'artwork_id',
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
        'source'
      ],
      LABEL_ATTRIBUTES.map((row) => [
        row.artworkId,
        row.brandName,
        row.productName,
        row.address,
        row.customerCareNumber,
        row.customerCareEmail,
        row.colourTheme,
        row.flavour,
        row.claims,
        row.logo,
        row.labelDesign,
        row.nutritionTableFormat,
        row.fssaiNumber,
        row.ingredients,
        'seed'
      ])
    );

    // The aggregates are computed, not transcribed. total is how many
    // parameters the engine compares; comparable is how many had a value on
    // both sides — the number the coverage CHECK constrains and the one a
    // reviewer reads a similarity score against.
    counts.comparisons = await insertRows(
      client,
      'comparisons',
      [
        'id',
        'product_id',
        'stage',
        'new_artwork_id',
        'reference_artwork_id',
        'overall_similarity',
        'overall_result',
        'comparable_parameter_count',
        'total_parameter_count',
        'status',
        'compared_by',
        'compared_at',
        'updated_by',
        'updated_at'
      ],
      COMPARISONS.map((row) => [
        row.id,
        row.productId,
        row.stage,
        row.newArtworkId,
        row.referenceArtworkId,
        row.overallSimilarity,
        row.overallResult,
        parameterRows(row).length,
        COMPARISON_PARAMETERS.length,
        row.status,
        row.comparedBy,
        atUtcMidnight(row.comparisonDate),
        row.updatedBy,
        atUtcMidnight(row.updatedDate)
      ])
    );

    counts.comparison_parameters = await insertRows(
      client,
      'comparison_parameters',
      ['comparison_id', 'parameter', 'reference_value', 'new_value', 'result'],
      COMPARISONS.flatMap(parameterRows)
    );

    await applySeedPasswords(client);

    return counts;
  });
}

/**
 * Gives every seeded user the password in SEED_USER_PASSWORD, if one is set.
 *
 * Runs on every seed rather than only on first insert, because the seed's job
 * is "put the demo environment in a known state" and a half-seeded database
 * whose users cannot log in is not that. It is safe to re-run: setting the same
 * password again is a no-op from the outside.
 *
 * DOES NOTHING when the variable is unset, which is the default and the whole
 * safety property — see env.seedUserPassword. A seed run against a real
 * deployment must not quietly install a password somebody could look up in
 * this repository, so the absence of the variable has to mean "no credential"
 * rather than "use the usual one".
 *
 * It overwrites an existing password rather than filling in only the NULLs, so
 * that re-running the seed after somebody has been experimenting restores a
 * known state. That is acceptable ONLY because it is gated on an environment
 * variable a production deploy does not set — the same reasoning, and the same
 * blast radius, as the rest of this file.
 */
async function applySeedPasswords(client: PoolClient): Promise<void> {
  if (!env.seedUserPassword) return;

  // Hashed once and shared, not per user. These are all the same password by
  // definition, and scrypt at these parameters costs ~50-100ms — paying that
  // five times to produce five different salts for one publicly-known demo
  // password buys nothing.
  //
  // This is the one place a shared salt is defensible, and it is defensible
  // only because the password is not secret. Never do this for real ones.
  const hash = await hashPassword(env.seedUserPassword);

  await client.query(
    `UPDATE users SET password_hash = $2, password_updated_at = now()
      WHERE id = ANY($1::text[])`,
    [USERS.map((row) => row.id), hash]
  );

  // eslint-disable-next-line no-console
  console.log(`[seed] users: password set from SEED_USER_PASSWORD for ${USERS.length} seeded accounts`);
}

// Executed directly (`npm run db:seed`) rather than imported.
if (require.main === module) {
  seed()
    .then((counts) => {
      const inserted = Object.entries(counts).filter(([, count]) => count > 0);
      if (inserted.length === 0) {
        // eslint-disable-next-line no-console
        console.log('[seed] nothing to do — every seed record is already present');
        return;
      }
      for (const [table, count] of inserted) {
        // eslint-disable-next-line no-console
        console.log(`[seed] ${table}: ${count} inserted`);
      }
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[seed] FAILED:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closePool);
}
