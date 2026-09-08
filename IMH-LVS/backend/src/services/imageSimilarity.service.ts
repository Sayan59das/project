// Visual comparison for Logo and Design/Layout — see the AI module brief's
// §7 (both listed as comparison parameters) and §9 (Visual Comparison:
// "colour similarity, logo similarity, layout/design similarity").
//
// This is deliberately a SEPARATE module from labelComparison.service.ts,
// not another FIELD_CONFIG entry there: that engine compares two already
// EXTRACTED TEXT VALUES for a field. Logo and layout have no reliable text
// value to compare in the first place — a vision model's prose description
// of a logo ("green leaf emblem with UC lettering") compared as a STRING
// against another prose description of the same logo would report DIFFERENT
// almost every time, even when the logos are pixel-identical, because two
// independent generated descriptions of one image are very unlikely to be
// verbatim equal. That would be a worse, actively misleading answer than
// not comparing it at all — see aiExtraction.service.ts's own comment on
// why it discards the model's logo/layout text for exactly this reason.
//
// The only reliable way to compare a logo or a layout is on the actual
// pixels of the two artworks, which is what this module does: a perceptual
// difference hash (dHash) of each artwork image, compared by Hamming
// distance. This needs the real image bytes of both artworks, not their
// extracted field data — callers must have both files, e.g. the two-file
// POST /api/labels/compare endpoint, or the two files the frontend's Quick
// Label Comparison workflow already fetches for extraction.
//
// HONEST LIMITATION, stated here because it should not be hidden in a
// comment nobody reads at the call site: this compares the WHOLE artwork
// image, not a cropped logo-only or layout-only region — there is no logo
// detection/localization step in this codebase. One real similarity number
// currently backs both the "Logo" and "Design/Layout" rows the brief asks
// for, rather than two independently measured ones. It is still a genuine,
// deterministic, non-fabricated signal (unlike a hallucination-prone text
// description), just a coarser one than per-element comparison would give.
// Isolating the logo specifically would need an object-detection step this
// project does not have yet.
import sharp from 'sharp';
import { rasterizePdfPages } from './pdf.service';

export type VisualComparisonStatus = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING';

export type VisualComparisonResult = {
  status: VisualComparisonStatus;
  /** 0-100. Undefined when status is MISSING (nothing was computed). */
  similarityPercentage?: number;
};

// dHash: 9 columns x 8 rows of grayscale pixels, one bit per horizontal
// adjacent-pixel comparison (left brighter than right) — 8 columns of
// comparisons x 8 rows = 64 bits. Chosen over aHash/pHash because it is
// simple, needs no DCT, and is the standard baseline for this kind of
// "same or different image, allowing for recompression/resizing" check.
const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_BITS = (HASH_WIDTH - 1) * HASH_HEIGHT;

// Thresholds are an initial, documented calibration against the standard
// perceptual-hashing rule of thumb (a Hamming distance under ~10 out of 64
// bits is "the same image" even across recompression/resizing), NOT
// something tuned against this project's own labelled data — there isn't
// any yet. Revisit once the real label dataset lets these be measured
// against actual same-logo/different-logo pairs rather than assumed.
const MATCH_MAX_DISTANCE = 4; // similarity >= 93.75%
const SIMILAR_MAX_DISTANCE = 12; // similarity >= 81.25%

async function toRasterImage(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
  if (mimeType === 'application/pdf') {
    const pages = await rasterizePdfPages(buffer, { maxPages: 1 });
    return pages[0] ?? null;
  }
  return buffer;
}

// Returns null (never throws) for anything unreadable — a corrupt file, an
// unsupported format, or a PDF that failed to rasterize (e.g. poppler not
// installed) — so the caller reports MISSING rather than crashing the
// comparison, matching how every other extraction path in this app treats
// an unreadable file.
async function computeDifferenceHash(fileBuffer: Buffer, mimeType: string): Promise<bigint | null> {
  try {
    const rasterBuffer = await toRasterImage(fileBuffer, mimeType);
    if (!rasterBuffer) return null;

    const { data } = await sharp(rasterBuffer)
      .grayscale()
      .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = 0n;
    for (let row = 0; row < HASH_HEIGHT; row += 1) {
      for (let col = 0; col < HASH_WIDTH - 1; col += 1) {
        const left = data[row * HASH_WIDTH + col];
        const right = data[row * HASH_WIDTH + col + 1];
        hash = (hash << 1n) | (left > right ? 1n : 0n);
      }
    }
    return hash;
  } catch (error) {
    console.error('[imageSimilarity] Could not hash image for visual comparison:', error instanceof Error ? error.message : error);
    return null;
  }
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

function classify(distance: number): VisualComparisonStatus {
  if (distance <= MATCH_MAX_DISTANCE) return 'MATCH';
  if (distance <= SIMILAR_MAX_DISTANCE) return 'SIMILAR';
  return 'CONFLICT';
}

/**
 * Compares two artwork files' overall visual appearance (see the module
 * comment above for exactly what this does and does not measure). Never
 * throws: either file being unreadable is reported as MISSING, the same
 * honest "nothing to compare" treatment every other field in this system
 * gives an absent value — never a fabricated result.
 */
export async function compareArtworkImages(
  fileA: { buffer: Buffer; mimeType: string },
  fileB: { buffer: Buffer; mimeType: string }
): Promise<VisualComparisonResult> {
  const [hashA, hashB] = await Promise.all([
    computeDifferenceHash(fileA.buffer, fileA.mimeType),
    computeDifferenceHash(fileB.buffer, fileB.mimeType)
  ]);

  if (hashA === null || hashB === null) {
    return { status: 'MISSING' };
  }

  const distance = hammingDistance(hashA, hashB);
  const similarityPercentage = Math.round(((HASH_BITS - distance) / HASH_BITS) * 100);
  return { status: classify(distance), similarityPercentage };
}
