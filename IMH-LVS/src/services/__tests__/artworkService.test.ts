// Unit tests for the artwork rules that stayed on the frontend.
//
// The baseline lookup these tests used to cover — "highest Approved version
// wins, never a Draft or a Rejected one" — is a database query now, and it is
// tested where it lives, against a real Postgres, in
// backend/src/__tests__/db.repositories.test.ts. Re-testing it here against a
// hand-seeded localStorage would be testing a copy of the rule that no longer
// runs.
//
// What IS still frontend logic is what the upload form does while somebody
// types: the version it suggests, and whether that version already exists.
// Both are pure functions over a list the page has loaded, which is what makes
// them testable without a store at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryLocalStorage } from './testLocalStorage';
import type { Artwork } from '../../types/artwork';

// artworkService itself no longer touches localStorage, but it is imported
// alongside modules that still do; this keeps that import harmless under node.
installMemoryLocalStorage();

const { findDuplicateArtworkVersion, parseVersionNumber, selectFinalApprovedArtworks, suggestNextArtworkVersion } =
  await import('../artworkService');

function artwork(overrides: Partial<Artwork> & Pick<Artwork, 'id' | 'version' | 'status'>): Artwork {
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

test('Suggests V1 for a product+company+type line that has no artwork yet', () => {
  assert.equal(suggestNextArtworkVersion([], 'PRD-0001', 'Test Marketing Co', 'Full Label'), 'V1');
});

test('Suggests one past the highest existing version, whatever order the list is in', () => {
  const artworks = [
    artwork({ id: 'ART-0002', version: 'V2', status: 'Approved' }),
    artwork({ id: 'ART-0001', version: 'V1', status: 'Approved' }),
    artwork({ id: 'ART-0003', version: 'V3', status: 'Draft' })
  ];

  // A Draft counts: it occupies its version number whether or not anyone
  // approved it, and suggesting V3 again would collide with it.
  assert.equal(suggestNextArtworkVersion(artworks, 'PRD-0001', 'Test Marketing Co', 'Full Label'), 'V4');
});

test('Keeps each artwork type its own version line', () => {
  const artworks = [
    artwork({ id: 'ART-0001', version: 'V5', status: 'Approved' }),
    artwork({ id: 'ART-0002', version: 'V1', status: 'Approved', artworkType: 'Front Artwork' })
  ];

  assert.equal(suggestNextArtworkVersion(artworks, 'PRD-0001', 'Test Marketing Co', 'Front Artwork'), 'V2');
});

test('Never counts another product or another marketing company toward a version line', () => {
  const artworks = [
    artwork({ id: 'ART-0001', version: 'V9', status: 'Approved', productId: 'PRD-9999' }),
    artwork({ id: 'ART-0002', version: 'V9', status: 'Approved', marketingCompany: 'A Different Company' })
  ];

  assert.equal(suggestNextArtworkVersion(artworks, 'PRD-0001', 'Test Marketing Co', 'Full Label'), 'V1');
});

test('Flags an already-used version for the same product+company+type', () => {
  const artworks = [artwork({ id: 'ART-0001', version: 'V2', status: 'Approved' })];

  const duplicate = findDuplicateArtworkVersion(artworks, 'PRD-0001', 'Test Marketing Co', 'v2', 'Full Label');
  assert.equal(duplicate?.id, 'ART-0001');
});

test('Does not flag the same version under a different artwork type, or the record being edited', () => {
  const artworks = [artwork({ id: 'ART-0001', version: 'V2', status: 'Approved' })];

  assert.equal(findDuplicateArtworkVersion(artworks, 'PRD-0001', 'Test Marketing Co', 'V2', 'Front Artwork'), undefined);
  assert.equal(findDuplicateArtworkVersion(artworks, 'PRD-0001', 'Test Marketing Co', 'V2', 'Full Label', 'ART-0001'), undefined);
});

test('parseVersionNumber reads the number out of a version label, and 0 when there is none', () => {
  assert.equal(parseVersionNumber('V12'), 12);
  assert.equal(parseVersionNumber('draft'), 0);
});

test('The Final Approved repository holds only Final Approved artwork, newest change first', () => {
  const artworks = [
    artwork({ id: 'ART-0001', version: 'V1', status: 'Final Approved', updatedDate: '2026-01-05' }),
    artwork({ id: 'ART-0002', version: 'V2', status: 'Approved', updatedDate: '2026-06-01' }),
    artwork({ id: 'ART-0003', version: 'V3', status: 'Final Approved', updatedDate: '2026-03-20' })
  ];

  // 'Approved' is the legacy terminal status and is NOT the same thing: this
  // list is what the Manager-approval stage produced, and nothing else.
  assert.deepEqual(
    selectFinalApprovedArtworks(artworks).map((entry) => entry.id),
    ['ART-0003', 'ART-0001']
  );
});
