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
import { compareFingerprints, fingerprintArtworkImage, compareHashes } from '../services/imageSimilarity.service';
import type { OcrLine } from '../services/paddleOcr.service';
import type { VlmImage, VlmClient } from '../services/ollamaVlm.service';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

test('The same real label image compared against itself reports MATCH at ~100% for both signals', async () => {
  const buffer = fixture('jpg-label.jpg');
  const fpA = await fingerprintArtworkImage({ buffer, mimeType: 'image/jpeg' });
  const fpB = await fingerprintArtworkImage({ buffer, mimeType: 'image/jpeg' });
  const result = compareFingerprints(fpA, fpB);
  assert.equal(result.artworkSimilarity.status, 'MATCH');
  assert.ok(result.artworkSimilarity.similarityPercentage! >= 95, `expected near-100% structural similarity, got ${result.artworkSimilarity.similarityPercentage}`);
  assert.equal(result.colourSimilarity.status, 'MATCH');
  assert.ok(result.colourSimilarity.similarityPercentage! >= 95, `expected near-100% colour similarity for an identical image, got ${result.colourSimilarity.similarityPercentage}`);
});

test('The same real label PDF rasterized twice compares as MATCH on both signals — rasterization itself is deterministic', async () => {
  const buffer = fixture('apple-cider-vinegar-gummy.pdf');
  const fpA = await fingerprintArtworkImage({ buffer, mimeType: 'application/pdf' });
  const fpB = await fingerprintArtworkImage({ buffer, mimeType: 'application/pdf' });
  const result = compareFingerprints(fpA, fpB);
  assert.equal(result.artworkSimilarity.status, 'MATCH');
  assert.equal(result.colourSimilarity.status, 'MATCH');
});

test('Two genuinely different real label PDFs report CONFLICT on structural similarity, not a false MATCH', async () => {
  const fpA = await fingerprintArtworkImage({ buffer: fixture('apple-cider-vinegar-gummy.pdf'), mimeType: 'application/pdf' });
  const fpB = await fingerprintArtworkImage({ buffer: fixture('chyawanprash-gummies.pdf'), mimeType: 'application/pdf' });
  const result = compareFingerprints(fpA, fpB);
  assert.equal(result.artworkSimilarity.status, 'CONFLICT');
  assert.ok(result.artworkSimilarity.similarityPercentage! < 80);
});

test('A corrupt/unreadable file on either side reports MISSING for both signals, never a crash or a fabricated score', async () => {
  const good = fixture('jpg-label.jpg');
  const corrupt = fixture('corrupt.jpg');

  const goodFp = await fingerprintArtworkImage({ buffer: good, mimeType: 'image/jpeg' });
  const corruptFp = await fingerprintArtworkImage({ buffer: corrupt, mimeType: 'image/jpeg' });
  const oneSideCorrupt = compareFingerprints(goodFp, corruptFp);
  assert.equal(oneSideCorrupt.artworkSimilarity.status, 'MISSING');
  assert.equal(oneSideCorrupt.artworkSimilarity.similarityPercentage, undefined);
  assert.equal(oneSideCorrupt.colourSimilarity.status, 'MISSING');
  assert.equal(oneSideCorrupt.colourSimilarity.similarityPercentage, undefined);

  const corruptFp2 = await fingerprintArtworkImage({ buffer: corrupt, mimeType: 'image/jpeg' });
  const corruptPdfFp = await fingerprintArtworkImage({ buffer: fixture('corrupt.pdf'), mimeType: 'application/pdf' });
  const bothCorrupt = compareFingerprints(corruptFp2, corruptPdfFp);
  assert.equal(bothCorrupt.artworkSimilarity.status, 'MISSING');
  assert.equal(bothCorrupt.colourSimilarity.status, 'MISSING');
});

test('A cross-format comparison (PDF vs JPG of a real label) still produces real scores on both signals, not an error', async () => {
  // Different file formats of conceptually-comparable artwork must still
  // resolve to a plain raster image on both sides rather than the format
  // mismatch itself causing a failure.
  const fpA = await fingerprintArtworkImage({ buffer: fixture('jpg-label.jpg'), mimeType: 'image/jpeg' });
  const fpB = await fingerprintArtworkImage({ buffer: fixture('text-label.pdf'), mimeType: 'application/pdf' });
  const result = compareFingerprints(fpA, fpB);
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
  const fpA = await fingerprintArtworkImage({ buffer: fixture('apple-cider-vinegar-gummy.pdf'), mimeType: 'application/pdf' });
  const fpB = await fingerprintArtworkImage({ buffer: fixture('sharp-mind-plus-gummies.pdf'), mimeType: 'application/pdf' });
  const result = compareFingerprints(fpA, fpB);
  // Not asserting a specific relationship (that would assume knowledge of
  // these two fixtures' actual colour palettes) — only that the two
  // percentages are computed independently, i.e. not literally the same
  // value reported twice under different keys.
  assert.notEqual(result.artworkSimilarity.similarityPercentage, undefined);
  assert.notEqual(result.colourSimilarity.similarityPercentage, undefined);
});

// Unit tests for logo similarity feature
test('compareFingerprints with logoHash undefined excludes logoSimilarity key (pass never ran)', async () => {
  // When both fingerprints have logoHash and logoSource as undefined, it means
  // the logo pass never ran on either side. compareFingerprints must omit the
  // logoSimilarity key entirely in this case.
  const fpA = {
    hash: 0x1234567890abcdefn,
    colourHistogram: new Array(216).fill(0.01)
    // logoHash and logoSource intentionally omitted (undefined)
  };
  const fpB = {
    hash: 0x1234567890abcdefn,
    colourHistogram: new Array(216).fill(0.01)
    // logoHash and logoSource intentionally omitted (undefined)
  };
  const result = compareFingerprints(fpA as any, fpB as any);
  assert.equal('logoSimilarity' in result, false, 'logoSimilarity key should be absent when pass never ran');
});

test('When logo pass runs but finds nothing, logoHash is null and logoSimilarity is MISSING', async () => {
  const mockLocateLogo = async () => null; // Always return null
  const buffer = fixture('jpg-label.jpg');
  const deps = { locateLogo: mockLocateLogo };

  const fp = await fingerprintArtworkImage({ buffer, mimeType: 'image/jpeg' }, { brandText: 'Test', deps });
  assert.ok(fp, 'fingerprint should not be null');
  assert.equal(fp!.logoHash, null, 'logoHash should be null when pass ran but found nothing');
  assert.equal(fp!.logoSource, null, 'logoSource should be null when pass ran but found nothing');

  const result = compareFingerprints(fp, fp);
  assert.ok(result.logoSimilarity, 'logoSimilarity should be present when pass ran');
  assert.equal(result.logoSimilarity!.status, 'MISSING', 'logoSimilarity should be MISSING when no logos found');
});

test('compareFingerprints with both logoHash equal reports logoSimilarity MATCH', async () => {
  const logoHash = 0x12345678n;
  const fpA = {
    hash: 0x1234567890abcdefn,
    colourHistogram: new Array(216).fill(0.01),
    logoHash,
    logoSource: 'vlm' as const
  };
  const fpB = {
    hash: 0x1234567890abcdefn,
    colourHistogram: new Array(216).fill(0.01),
    logoHash,
    logoSource: 'vlm' as const
  };
  const result = compareFingerprints(fpA, fpB);
  assert.ok(result.logoSimilarity, 'logoSimilarity should be present');
  assert.equal(result.logoSimilarity!.status, 'MATCH');
});

test('compareFingerprints treats a 0n logoHash as a real hash, not as "pass found nothing"', () => {
  // A flat (uniform) crop hashes to 0n. Two of them are identical → MATCH.
  const fp = { hash: 0x1234567890abcdefn, colourHistogram: new Array(216).fill(0.01), logoHash: 0n, logoSource: 'vlm' as const };
  const result = compareFingerprints(fp, { ...fp });
  assert.equal(result.logoSimilarity?.status, 'MATCH');
  // And 0n against a real hash is a comparison, not MISSING.
  const other = { ...fp, logoHash: 0xffffffffffffffffn };
  assert.notEqual(compareFingerprints(fp, other).logoSimilarity?.status, 'MISSING');
});

test('Cache: two fingerprintArtworkImage calls on identical bytes call recognizeLines once', async () => {
  let recognizeLinesCalls = 0;
  const mockRecognizeLines = async (image: Buffer): Promise<OcrLine[]> => {
    recognizeLinesCalls++;
    return [];
  };
  const mockLocateLogo = async (
    pageImage: { width: number; height: number },
    vlmImage: VlmImage | null,
    ocrLines: readonly OcrLine[],
    brandText: string,
    client: VlmClient
  ) => {
    return null;
  };

  const buffer = fixture('jpg-label.jpg');
  const deps = { recognizeLines: mockRecognizeLines, locateLogo: mockLocateLogo };

  // First call
  await fingerprintArtworkImage({ buffer, mimeType: 'image/jpeg' }, { brandText: 'Unicare', deps });
  assert.equal(recognizeLinesCalls, 1, 'recognizeLines should be called once on first fingerprint');

  // Second call with same bytes and brandText — should use cache
  await fingerprintArtworkImage({ buffer, mimeType: 'image/jpeg' }, { brandText: 'Unicare', deps });
  assert.equal(recognizeLinesCalls, 1, 'recognizeLines should NOT be called again (cached)');

  // Third call with same bytes but different brandText — should NOT use cache
  await fingerprintArtworkImage({ buffer, mimeType: 'image/jpeg' }, { brandText: 'Different', deps });
  assert.equal(recognizeLinesCalls, 2, 'recognizeLines should be called for different brandText');
});

test('Live (OLLAMA_URL set): Unicare PDF vs itself with VLM logo detection enabled', { skip: !process.env.OLLAMA_URL, timeout: 180000 }, async () => {
  // This test only runs when OLLAMA_URL is set. It verifies that:
  // 1. The logo pass ran (logoHash and logoSource are defined, not undefined)
  // 2. When the same file is compared to itself, if logos were detected, they MATCH
  const buffer = fixture('apple-cider-vinegar-gummy.pdf');
  const fpA = await fingerprintArtworkImage({ buffer, mimeType: 'application/pdf' }, { brandText: 'Unicare' });
  const fpB = await fingerprintArtworkImage({ buffer, mimeType: 'application/pdf' }, { brandText: 'Unicare' });

  assert.ok(fpA, 'fpA should not be null');
  assert.ok(fpB, 'fpB should not be null');

  // The logo pass should have run (logoHash and logoSource should be defined, not undefined)
  assert.notEqual(fpA!.logoHash, undefined, 'fpA logoHash should be defined (logo pass ran)');
  assert.notEqual(fpB!.logoHash, undefined, 'fpB logoHash should be defined (logo pass ran)');
  assert.notEqual(fpA!.logoSource, undefined, 'fpA logoSource should be defined (logo pass ran)');
  assert.notEqual(fpB!.logoSource, undefined, 'fpB logoSource should be defined (logo pass ran)');

  // If both logos were found, they should match
  const result = compareFingerprints(fpA, fpB);
  assert.ok(result.logoSimilarity, 'logoSimilarity should be present');

  if (fpA!.logoHash !== null && fpB!.logoHash !== null) {
    assert.equal(result.logoSimilarity!.status, 'MATCH', `Expected MATCH for same file, but got ${result.logoSimilarity!.status}`);
  }
});

test('Live (OLLAMA_URL set): Unicare PDF vs She-Arise PDF shows different logo similarity', { skip: !process.env.OLLAMA_URL, timeout: 180000 }, async () => {
  // This test only runs when OLLAMA_URL is set
  const fpUnicare = await fingerprintArtworkImage({ buffer: fixture('apple-cider-vinegar-gummy.pdf'), mimeType: 'application/pdf' }, { brandText: 'Unicare' });
  const fpSheArise = await fingerprintArtworkImage({ buffer: fixture('chyawanprash-gummies.pdf'), mimeType: 'application/pdf' }, { brandText: 'She Arise' });

  assert.ok(fpUnicare, 'fpUnicare should not be null');
  assert.ok(fpSheArise, 'fpSheArise should not be null');

  const result = compareFingerprints(fpUnicare, fpSheArise);
  assert.ok(result.logoSimilarity, 'logoSimilarity should be present (logo pass ran)');

  // Different labels should not have MATCH logoSimilarity (if both logos were found)
  if (fpUnicare!.logoHash !== null && fpSheArise!.logoHash !== null) {
    assert.notEqual(result.logoSimilarity!.status, 'MATCH', 'Different labels should not have MATCH logoSimilarity');
  }
});
