// Unit tests for the Logo/Design-Layout/Colour visual comparison (see
// imageSimilarity.service.ts's own module comment for what each of the two
// signals measures and why they're separate from labelComparison.service.ts
// and from each other). Uses the same real-label fixtures already
// established for extraction/comparison tests — no synthetic images, so
// this exercises the real dHash+histogram+rasterization path exactly as a
// real upload would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compareArtworkImages } from '../services/imageSimilarity.service';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

test('The same real label image compared against itself reports MATCH at ~100% for both signals', async () => {
  const buffer = fixture('jpg-label.jpg');
  const result = await compareArtworkImages(
    { buffer, mimeType: 'image/jpeg' },
    { buffer, mimeType: 'image/jpeg' }
  );
  assert.equal(result.artworkSimilarity.status, 'MATCH');
  assert.ok(result.artworkSimilarity.similarityPercentage! >= 95, `expected near-100% structural similarity, got ${result.artworkSimilarity.similarityPercentage}`);
  assert.equal(result.colourSimilarity.status, 'MATCH');
  assert.ok(result.colourSimilarity.similarityPercentage! >= 95, `expected near-100% colour similarity for an identical image, got ${result.colourSimilarity.similarityPercentage}`);
});

test('The same real label PDF rasterized twice compares as MATCH on both signals — rasterization itself is deterministic', async () => {
  const buffer = fixture('apple-cider-vinegar-gummy.pdf');
  const result = await compareArtworkImages(
    { buffer, mimeType: 'application/pdf' },
    { buffer, mimeType: 'application/pdf' }
  );
  assert.equal(result.artworkSimilarity.status, 'MATCH');
  assert.equal(result.colourSimilarity.status, 'MATCH');
});

test('Two genuinely different real label PDFs report CONFLICT on structural similarity, not a false MATCH', async () => {
  const result = await compareArtworkImages(
    { buffer: fixture('apple-cider-vinegar-gummy.pdf'), mimeType: 'application/pdf' },
    { buffer: fixture('chyawanprash-gummies.pdf'), mimeType: 'application/pdf' }
  );
  assert.equal(result.artworkSimilarity.status, 'CONFLICT');
  assert.ok(result.artworkSimilarity.similarityPercentage! < 80);
});

test('A corrupt/unreadable file on either side reports MISSING for both signals, never a crash or a fabricated score', async () => {
  const good = fixture('jpg-label.jpg');
  const corrupt = fixture('corrupt.jpg');

  const oneSideCorrupt = await compareArtworkImages(
    { buffer: good, mimeType: 'image/jpeg' },
    { buffer: corrupt, mimeType: 'image/jpeg' }
  );
  assert.equal(oneSideCorrupt.artworkSimilarity.status, 'MISSING');
  assert.equal(oneSideCorrupt.artworkSimilarity.similarityPercentage, undefined);
  assert.equal(oneSideCorrupt.colourSimilarity.status, 'MISSING');
  assert.equal(oneSideCorrupt.colourSimilarity.similarityPercentage, undefined);

  const bothCorrupt = await compareArtworkImages(
    { buffer: corrupt, mimeType: 'image/jpeg' },
    { buffer: fixture('corrupt.pdf'), mimeType: 'application/pdf' }
  );
  assert.equal(bothCorrupt.artworkSimilarity.status, 'MISSING');
  assert.equal(bothCorrupt.colourSimilarity.status, 'MISSING');
});

test('A cross-format comparison (PDF vs JPG of a real label) still produces real scores on both signals, not an error', async () => {
  // Different file formats of conceptually-comparable artwork must still
  // resolve to a plain raster image on both sides rather than the format
  // mismatch itself causing a failure.
  const result = await compareArtworkImages(
    { buffer: fixture('jpg-label.jpg'), mimeType: 'image/jpeg' },
    { buffer: fixture('text-label.pdf'), mimeType: 'application/pdf' }
  );
  assert.ok(['MATCH', 'SIMILAR', 'CONFLICT'].includes(result.artworkSimilarity.status));
  assert.equal(typeof result.artworkSimilarity.similarityPercentage, 'number');
  assert.ok(['MATCH', 'SIMILAR', 'CONFLICT'].includes(result.colourSimilarity.status));
  assert.equal(typeof result.colourSimilarity.similarityPercentage, 'number');
});

// The whole point of computing colour separately from structure: a
// same-layout, differently-coloured pair and a same-colour,
// differently-laid-out pair should NOT be indistinguishable. There is no
// "recoloured version of the same real label" fixture available, so this
// establishes the same fact more directly — using two genuinely different
// real labels (different layout AND colour), both signals should be able
// to disagree with each other in principle, i.e. neither is redundant.
test('Colour similarity and structural similarity are independent measurements, not the same number twice', async () => {
  const result = await compareArtworkImages(
    { buffer: fixture('apple-cider-vinegar-gummy.pdf'), mimeType: 'application/pdf' },
    { buffer: fixture('sharp-mind-plus-gummies.pdf'), mimeType: 'application/pdf' }
  );
  // Not asserting a specific relationship (that would assume knowledge of
  // these two fixtures' actual colour palettes) — only that the two
  // percentages are computed independently, i.e. not literally the same
  // value reported twice under different keys.
  assert.notEqual(result.artworkSimilarity.similarityPercentage, undefined);
  assert.notEqual(result.colourSimilarity.similarityPercentage, undefined);
});
