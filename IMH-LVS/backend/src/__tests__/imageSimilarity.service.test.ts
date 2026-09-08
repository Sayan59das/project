// Unit tests for the Logo/Design-Layout visual comparison (see
// imageSimilarity.service.ts's own module comment for what this measures
// and why it's separate from labelComparison.service.ts). Uses the same
// real-label fixtures already established for extraction/comparison tests —
// no synthetic images, so this exercises the real dHash+rasterization path
// exactly as a real upload would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compareArtworkImages } from '../services/imageSimilarity.service';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

test('The same real label image compared against itself reports MATCH at ~100% similarity', async () => {
  const buffer = fixture('jpg-label.jpg');
  const result = await compareArtworkImages(
    { buffer, mimeType: 'image/jpeg' },
    { buffer, mimeType: 'image/jpeg' }
  );
  assert.equal(result.status, 'MATCH');
  assert.ok(result.similarityPercentage! >= 95, `expected near-100% similarity for an identical image, got ${result.similarityPercentage}`);
});

test('The same real label PDF rasterized twice compares as MATCH — rasterization itself is deterministic', async () => {
  const buffer = fixture('apple-cider-vinegar-gummy.pdf');
  const result = await compareArtworkImages(
    { buffer, mimeType: 'application/pdf' },
    { buffer, mimeType: 'application/pdf' }
  );
  assert.equal(result.status, 'MATCH');
});

test('Two genuinely different real label PDFs report CONFLICT, not a false MATCH', async () => {
  const result = await compareArtworkImages(
    { buffer: fixture('apple-cider-vinegar-gummy.pdf'), mimeType: 'application/pdf' },
    { buffer: fixture('chyawanprash-gummies.pdf'), mimeType: 'application/pdf' }
  );
  assert.equal(result.status, 'CONFLICT');
  assert.ok(result.similarityPercentage! < 80);
});

test('A corrupt/unreadable file on either side reports MISSING, never a crash or a fabricated score', async () => {
  const good = fixture('jpg-label.jpg');
  const corrupt = fixture('corrupt.jpg');

  const oneSideCorrupt = await compareArtworkImages(
    { buffer: good, mimeType: 'image/jpeg' },
    { buffer: corrupt, mimeType: 'image/jpeg' }
  );
  assert.equal(oneSideCorrupt.status, 'MISSING');
  assert.equal(oneSideCorrupt.similarityPercentage, undefined);

  const bothCorrupt = await compareArtworkImages(
    { buffer: corrupt, mimeType: 'image/jpeg' },
    { buffer: fixture('corrupt.pdf'), mimeType: 'application/pdf' }
  );
  assert.equal(bothCorrupt.status, 'MISSING');
});

test('A cross-format comparison (PDF vs JPG of a real label) still produces a real score, not an error', async () => {
  // Different file formats of conceptually-comparable artwork must still
  // resolve to a plain raster image on both sides rather than the format
  // mismatch itself causing a failure.
  const result = await compareArtworkImages(
    { buffer: fixture('jpg-label.jpg'), mimeType: 'image/jpeg' },
    { buffer: fixture('text-label.pdf'), mimeType: 'application/pdf' }
  );
  assert.ok(result.status === 'MATCH' || result.status === 'SIMILAR' || result.status === 'CONFLICT');
  assert.equal(typeof result.similarityPercentage, 'number');
});
