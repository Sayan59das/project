// Unit tests for artworkService.getLatestApprovedArtworkForProduct — the
// function Quick Label Comparison relies on to automatically select the
// baseline artwork (see labelComparisonWorkflowService.ts). Covers exactly the
// business rules the corrected workflow depends on: Pending/Rejected/Draft
// versions must never be selected, and among multiple Approved/Final
// Approved versions the highest version number wins, never an older one.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// getLatestApprovedArtworkForProduct reads artworks via
// artworkService.getArtworksByProduct(), which calls the backend over
// apiClient rather than localStorage — so tests seed the mocked HTTP layer.
const { default: apiClient } = await import('../apiClient');
const { getLatestApprovedArtworkForProduct } = await import('../artworkService');

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

function seed(productId: string, artworks: ArtworkLike[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (apiClient.get as any) = async (url: string) => {
    assert.equal(url, `/products/${productId}/artworks`);
    return { data: artworks.filter((a) => a.productId === productId) };
  };
}

test('Selects the highest-versioned Approved artwork, ignoring a newer Pending version', async () => {
  // V1, V2, V3 Approved, V4 Pending — must select V3, never V4.
  seed('PRD-0001', [
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Approved' }),
    artwork({ id: 'ART-0003', version: 'V3', status: 'Approved' }),
    artwork({ id: 'ART-0004', version: 'V4', status: 'Pending Comparison' })
  ]);

  const result = await getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0003');
  assert.equal(result?.version, 'V3');
});

test('Ignores a Rejected version even when it is the highest version number', async () => {
  seed('PRD-0001', [
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Rejected' })
  ]);

  const result = await getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0001');
});

test('Ignores a Draft version even when it is the highest version number', async () => {
  seed('PRD-0001', [
    artwork({ id: 'ART-0001', version: 'V1', status: 'Final Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Draft' })
  ]);

  const result = await getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0001');
});

test('Never selects an older Approved version when a newer Approved version exists', async () => {
  seed('PRD-0001', [
    artwork({ id: 'ART-0002', version: 'V2', status: 'Approved' }),
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }) // deliberately listed out of order
  ]);

  const result = await getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0002');
  assert.equal(result?.version, 'V2');
});

test('Treats both "Approved" and "Final Approved" as valid, picking the higher version across either status', async () => {
  seed('PRD-0001', [
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Final Approved' })
  ]);

  const result = await getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result?.id, 'ART-0002');
});

test('Returns undefined when no artwork for the product has an Approved/Final Approved status', async () => {
  seed('PRD-0001', [
    artwork({ id: 'ART-0001', version: 'V1', status: 'Draft' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Pending Comparison' }),
    artwork({ id: 'ART-0003', version: 'V3', status: 'Rejected' })
  ]);

  const result = await getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result, undefined);
});

test('Never matches artwork belonging to a different product or a different marketing company', async () => {
  seed('PRD-0001', [
    artwork({ id: 'ART-0001', version: 'V5', status: 'Approved', productId: 'PRD-9999' }),
    artwork({ id: 'ART-0002', version: 'V5', status: 'Approved', marketingCompany: 'A Different Company' })
  ]);

  const result = await getLatestApprovedArtworkForProduct('PRD-0001', 'Test Marketing Co');
  assert.equal(result, undefined);
});
