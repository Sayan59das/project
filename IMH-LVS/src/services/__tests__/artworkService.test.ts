// Unit tests for artworkService.getLatestApprovedArtworkForProduct — the
// function Quick Label Comparison relies on to automatically select the
// baseline artwork (see labelComparisonWorkflowService.ts). Covers exactly the
// business rules the corrected workflow depends on: Pending/Rejected/Draft
// versions must never be selected, and among multiple Approved/Final
// Approved versions the highest version number wins, never an older one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryLocalStorage } from './testLocalStorage';

installMemoryLocalStorage();

const { getLatestApprovedArtworkForProduct } = await import('../artworkService');
const ARTWORKS_KEY = 'imh_lvs_artworks';

type ArtworkLike = {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  version: string;
  artworkType: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  status: string;
  remarks: string;
  uploadedBy: string;
  uploadDate: string;
  updatedBy: string;
  updatedDate: string;
};

function artwork(overrides: Partial<ArtworkLike> & Pick<ArtworkLike, 'id' | 'version' | 'status'>): ArtworkLike {
  return {
    productId: 'PRD-0001',
    productName: 'Test Product',
    brand: 'TestBrand',
    marketingCompany: 'Test Marketing Co',
    manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
    artworkType: 'Full Label',
    fileName: 'label.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    filePath: '',
    remarks: '',
    uploadedBy: 'Tester',
    uploadDate: '2026-01-01',
    updatedBy: 'Tester',
    updatedDate: '2026-01-01',
    ...overrides
  };
}

function seed(artworks: ArtworkLike[]) {
  (globalThis.localStorage as any).setItem(ARTWORKS_KEY, JSON.stringify(artworks));
}

test('Selects the highest-versioned Approved artwork, ignoring a newer Pending version', () => {
  // V1, V2, V3 Approved, V4 Pending — must select V3, never V4.
  seed([
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Approved' }),
    artwork({ id: 'ART-0003', version: 'V3', status: 'Approved' }),
    artwork({ id: 'ART-0004', version: 'V4', status: 'Pending Comparison' })
  ]);

  const result = getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0003');
  assert.equal(result?.version, 'V3');
});

test('Ignores a Rejected version even when it is the highest version number', () => {
  seed([
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Rejected' })
  ]);

  const result = getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0001');
});

test('Ignores a Draft version even when it is the highest version number', () => {
  seed([
    artwork({ id: 'ART-0001', version: 'V1', status: 'Final Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Draft' })
  ]);

  const result = getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0001');
});

test('Never selects an older Approved version when a newer Approved version exists', () => {
  seed([
    artwork({ id: 'ART-0002', version: 'V2', status: 'Approved' }),
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }) // deliberately listed out of order
  ]);

  const result = getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0002');
  assert.equal(result?.version, 'V2');
});

test('Treats both "Approved" and "Final Approved" as valid, picking the higher version across either status', () => {
  seed([
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Final Approved' })
  ]);

  const result = getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0002');
});

test('Returns undefined when no artwork for the product has an Approved/Final Approved status', () => {
  seed([
    artwork({ id: 'ART-0001', version: 'V1', status: 'Draft' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Pending Comparison' }),
    artwork({ id: 'ART-0003', version: 'V3', status: 'Rejected' })
  ]);

  const result = getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result, undefined);
});

test('Never matches artwork belonging to a different product or a different marketing company', () => {
  seed([
    artwork({ id: 'ART-0001', version: 'V5', status: 'Approved', productId: 'PRD-9999' }),
    artwork({ id: 'ART-0002', version: 'V5', status: 'Approved', marketingCompany: 'A Different Company' })
  ]);

  const result = getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result, undefined);
});
