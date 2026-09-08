// Visual comparison for Logo, Design/Layout and Colour — see the AI module
// brief's §7 (all three listed as comparison parameters) and §9 (Visual
// Comparison: "colour similarity, logo similarity, layout/design
// similarity").
//
// This is deliberately a SEPARATE module from labelComparison.service.ts,
// not another FIELD_CONFIG entry there: that engine compares two already
// EXTRACTED TEXT VALUES for a field. Logo, layout and colour don't have a
// reliable text value to compare in the first place — a vision model's
// prose description of a logo ("green leaf emblem with UC lettering"), or
// of a colour scheme, compared as a STRING against another independent
// description would report DIFFERENT almost every time even when the
// underlying images are pixel-identical, because two independent generated
// descriptions of one image are very unlikely to be verbatim equal. That
// would be a worse, actively misleading answer than not comparing it at
// all — see aiExtraction.service.ts's own comment on why it discards the
// model's logo/layout text for exactly this reason.
//
// The only reliable way to compare these is on the actual pixels of the
// two artworks, which is what this module does, as two DELIBERATELY
// SEPARATE and non-redundant measurements from one rasterized image:
//
//  - Artwork Similarity (structural): a perceptual difference hash (dHash)
//    computed on a GRAYSCALE reduction — sensitive to layout/shape/text
//    placement, and (precisely because it's grayscale) blind to colour on
//    its own. Backs both the "Logo" and "Design/Layout" rows the brief
//    asks for (see the HONEST LIMITATION note below).
//  - Colour Similarity: a coarse colour histogram computed on a small
//    reduction WITHOUT grayscale conversion, compared by histogram
//    intersection — sensitive to the overall colour palette and blind to
//    layout/shape. A same-layout artwork recoloured into a different
//    palette hashes identically under Artwork Similarity but is exactly
//    what this catches; the reverse (same colours, different layout) is
//    exactly what Artwork Similarity catches and this doesn't. Neither
//    subsumes the other, which is why both are computed and reported.
//
// Both need the real image bytes of both artworks, not their extracted
// field data — callers must have both files, e.g. the two-file POST
// /api/labels/compare endpoint, or the two files the frontend's Quick
// Label Comparison workflow already fetches for extraction.
//
// HONEST LIMITATION, stated here because it should not be hidden in a
// comment nobody reads at the call site: both measurements are computed on
// the WHOLE artwork image, not a cropped logo-only region or a
// background-only region for colour — there is no logo/region detection
// step in this codebase. A production artwork file that bundles a
// press-approval panel (colour swatches, crop marks) alongside the actual
// label, as several real files in this project's own dataset do, will have
// that panel's colours and shapes counted too. This is still a genuine,
// deterministic, non-fabricated signal (unlike a hallucination-prone text
// description), just a coarser one than per-element comparison would give.
// Isolating the logo or the label region specifically would need an
// object-detection step this project does not have yet.
import sharp from 'sharp';
import { rasterizePdfPages } from './pdf.service';

export type VisualComparisonStatus = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING';

export type VisualComparisonResult = {
  status: VisualComparisonStatus;
  /** 0-100. Undefined when status is MISSING (nothing was computed). */
  similarityPercentage?: number;
};

// The two visual signals reported for one artwork pair — see the module
// comment above for what each measures and why neither substitutes for
// the other.
export type ArtworkVisualComparison = {
  artworkSimilarity: VisualComparisonResult;
  colourSimilarity: VisualComparisonResult;
};

// dHash: 9 columns x 8 rows of grayscale pixels, one bit per horizontal
// adjacent-pixel comparison (left brighter than right) — 8 columns of
// comparisons x 8 rows = 64 bits. Chosen over aHash/pHash because it is
// simple, needs no DCT, and is the standard baseline for this kind of
// "same or different image, allowing for recompression/resizing" check.
const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_BITS = (HASH_WIDTH - 1) * HASH_HEIGHT;

// Colour histogram: a small full-colour (not grayscale) reduction, each
// channel quantized to 6 levels (216 bins total) — enough resolution to
// separate major colour families (red vs. orange vs. pink) without being
// so fine-grained that ordinary JPEG compression noise or anti-aliasing
// along edges (which this whole-image approach inevitably includes)
// registers as a real colour difference.
const COLOUR_SAMPLE_SIZE = 50; // 50x50 = 2500 sampled pixels, plenty for a coarse palette
const COLOUR_LEVELS_PER_CHANNEL = 6;
const COLOUR_HISTOGRAM_BINS = COLOUR_LEVELS_PER_CHANNEL ** 3;

// Thresholds are an initial, documented calibration against the standard
// perceptual-hashing rule of thumb (a Hamming distance under ~10 out of 64
// bits is "the same image" even across recompression/resizing) and, for
// colour, against histogram-intersection values observed on this
// project's own real-label test pairs during development — NOT something
// tuned against a labelled dataset, because there isn't one yet. Revisit
// once the real label dataset lets these be measured against actual
// same-artwork/different-artwork pairs rather than assumed.
const MATCH_MAX_DISTANCE = 4; // similarity >= 93.75%
const SIMILAR_MAX_DISTANCE = 12; // similarity >= 81.25%
const COLOUR_MATCH_MIN_SIMILARITY = 0.85;
const COLOUR_SIMILAR_MIN_SIMILARITY = 0.6;

async function toRasterImage(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
  if (mimeType === 'application/pdf') {
    const pages = await rasterizePdfPages(buffer, { maxPages: 1 });
    return pages[0] ?? null;
  }
  return buffer;
}

function computeDifferenceHashFromRaster(data: Buffer): bigint {
  let hash = 0n;
  for (let row = 0; row < HASH_HEIGHT; row += 1) {
    for (let col = 0; col < HASH_WIDTH - 1; col += 1) {
      const left = data[row * HASH_WIDTH + col];
      const right = data[row * HASH_WIDTH + col + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

// Normalized (sums to 1) histogram over COLOUR_HISTOGRAM_BINS quantized
// RGB buckets. Whole-image, unweighted — see the module's HONEST
// LIMITATION note on what that does and doesn't handle well.
function computeColourHistogramFromRaster(data: Buffer): number[] {
  const histogram = new Array<number>(COLOUR_HISTOGRAM_BINS).fill(0);
  const channelDivisor = 256 / COLOUR_LEVELS_PER_CHANNEL;
  let pixelCount = 0;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const r = Math.min(COLOUR_LEVELS_PER_CHANNEL - 1, Math.floor(data[i] / channelDivisor));
    const g = Math.min(COLOUR_LEVELS_PER_CHANNEL - 1, Math.floor(data[i + 1] / channelDivisor));
    const b = Math.min(COLOUR_LEVELS_PER_CHANNEL - 1, Math.floor(data[i + 2] / channelDivisor));
    const bin = r * COLOUR_LEVELS_PER_CHANNEL * COLOUR_LEVELS_PER_CHANNEL + g * COLOUR_LEVELS_PER_CHANNEL + b;
    histogram[bin] += 1;
    pixelCount += 1;
  }
  return pixelCount > 0 ? histogram.map((count) => count / pixelCount) : histogram;
}

export type ImageFingerprint = {
  hash: bigint;
  colourHistogram: number[];
};

// Rasterizes and fingerprints one artwork file ONCE, producing both
// signals from the same decode — exported separately from
// compareArtworkImages (which wraps this for the common two-file case) so
// a caller comparing ONE subject against MANY candidates — the
// cross-company comparison loop — can fingerprint the subject exactly
// once and reuse it, rather than re-uploading and re-processing the same
// subject image once per candidate. Never throws: an unreadable file
// resolves to null, which compareFingerprints below treats as MISSING
// rather than a crash.
export async function fingerprintArtworkImage(file: { buffer: Buffer; mimeType: string }): Promise<ImageFingerprint | null> {
  try {
    const rasterBuffer = await toRasterImage(file.buffer, file.mimeType);
    if (!rasterBuffer) return null;

    const image = sharp(rasterBuffer);
    const [hashPixels, colourPixels] = await Promise.all([
      image.clone().grayscale().resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' }).raw().toBuffer(),
      image
        .clone()
        .removeAlpha()
        .resize(COLOUR_SAMPLE_SIZE, COLOUR_SAMPLE_SIZE, { fit: 'fill' })
        .raw()
        .toBuffer()
    ]);

    return {
      hash: computeDifferenceHashFromRaster(hashPixels),
      colourHistogram: computeColourHistogramFromRaster(colourPixels)
    };
  } catch (error) {
    console.error('[imageSimilarity] Could not fingerprint image for visual comparison:', error instanceof Error ? error.message : error);
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

function classifyStructural(distance: number): VisualComparisonStatus {
  if (distance <= MATCH_MAX_DISTANCE) return 'MATCH';
  if (distance <= SIMILAR_MAX_DISTANCE) return 'SIMILAR';
  return 'CONFLICT';
}

function classifyColour(similarity: number): VisualComparisonStatus {
  if (similarity >= COLOUR_MATCH_MIN_SIMILARITY) return 'MATCH';
  if (similarity >= COLOUR_SIMILAR_MIN_SIMILARITY) return 'SIMILAR';
  return 'CONFLICT';
}

/** Compares two already-computed hashes. */
function compareHashes(hashA: bigint, hashB: bigint): VisualComparisonResult {
  const distance = hammingDistance(hashA, hashB);
  const similarityPercentage = Math.round(((HASH_BITS - distance) / HASH_BITS) * 100);
  return { status: classifyStructural(distance), similarityPercentage };
}

// Histogram intersection: sum of the per-bin minimum, which is in [0, 1]
// when both histograms are normalized to sum to 1 — 1 means identical
// colour distributions, 0 means no overlap at all.
function compareColourHistograms(histogramA: number[], histogramB: number[]): VisualComparisonResult {
  let intersection = 0;
  for (let i = 0; i < COLOUR_HISTOGRAM_BINS; i += 1) {
    intersection += Math.min(histogramA[i] ?? 0, histogramB[i] ?? 0);
  }
  const similarityPercentage = Math.round(intersection * 100);
  return { status: classifyColour(intersection), similarityPercentage };
}

/**
 * Compares two already-computed fingerprints — the shared core both
 * compareArtworkImages and a batch (one subject, many candidates) caller
 * use. Either side being null (unreadable file) reports MISSING for both
 * signals, the same honest "nothing to compare" treatment every other
 * field in this system gives an absent value — never a fabricated result.
 */
export function compareFingerprints(a: ImageFingerprint | null, b: ImageFingerprint | null): ArtworkVisualComparison {
  if (!a || !b) {
    return { artworkSimilarity: { status: 'MISSING' }, colourSimilarity: { status: 'MISSING' } };
  }
  return {
    artworkSimilarity: compareHashes(a.hash, b.hash),
    colourSimilarity: compareColourHistograms(a.colourHistogram, b.colourHistogram)
  };
}

/**
 * Compares two artwork files' overall visual appearance (see the module
 * comment above for exactly what this does and does not measure). Never
 * throws: either file being unreadable is reported as MISSING for both
 * signals.
 */
export async function compareArtworkImages(
  fileA: { buffer: Buffer; mimeType: string },
  fileB: { buffer: Buffer; mimeType: string }
): Promise<ArtworkVisualComparison> {
  const [a, b] = await Promise.all([fingerprintArtworkImage(fileA), fingerprintArtworkImage(fileB)]);
  return compareFingerprints(a, b);
}
