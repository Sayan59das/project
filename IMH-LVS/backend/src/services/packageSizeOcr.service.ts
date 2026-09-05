// Targeted, spatial recovery for Package Size — the same idea as
// regionOcr.service.ts (marketing company/address) and
// titleRegionOcr.service.ts (product title), applied to the front-of-pack
// count badge (e.g. a "30 GUMMIES" circular graphic).
//
// The text-based extractor (labelFieldExtractor.service.ts's
// extractPackageSize) only finds a package size when the number and its
// product-form word ("Gummies", "Tablets", ...) end up on the same
// reconstructed text line — true for body copy like "Net Wt. 90gm (30
// Gummies)", but frequently false for a stylized badge graphic, where the
// number is often larger/bolder/differently styled than its form-word and
// a general-purpose OCR pass drops or misreads it while reading the
// form-word itself just fine (seen in practice: a "30 GUMMIES" badge on a
// saturated gradient background where "Gummies" reads at high confidence
// and "30" is dropped entirely, in both the default and alternate
// preprocessing passes).
//
// This module never requires the two to share a text line: it locates a
// confidently-read, PROMINENTLY-SIZED product-form word among a full-page
// OCR pass's word positions (prominence — relative to the page's own
// median word height — is what distinguishes a front badge from an
// incidental "1 gummy" inside "Serving Size: 1 gummy" or a nutrition-table
// row, without hardcoding any specific font size), then either uses a
// number Tesseract already read nearby, or — if none was read at all — re-
// OCRs just the region around the form-word with a digit-only character
// whitelist, which is far more reliable for a single number than
// general-purpose text OCR.
//
// Fully generic: the product-form word list (PRODUCT_FORM_WORDS) is
// shared with the text-based extractor; nothing here is anchored to any
// specific number, brand, product, or label design.
import sharp from 'sharp';
import { PSM } from 'tesseract.js';
import { recognizeDigits, type OcrWord, type Rectangle } from './tesseract.service';
import { PRODUCT_FORM_WORDS } from './labelFieldExtractor.service';
import type { OcrSource } from './titleRegionOcr.service';

const PRODUCT_FORM_WORD_PATTERN = new RegExp(`^(${PRODUCT_FORM_WORDS})$`, 'i');

function wordHeight(word: OcrWord): number {
  return word.bbox.y1 - word.bbox.y0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const MIN_FORM_WORD_CONFIDENCE = 60;
// A front-of-pack count badge's product-form word is set noticeably larger
// than ordinary body copy (ingredient lists, a serving-size caption, a
// nutrition-table row) — this ratio, relative to the page's own median
// word height, is what tells the two apart generically, without
// hardcoding any specific font size (which varies by page resolution/DPI).
const PROMINENCE_RATIO = 1.6;

// Finds a confidently-read, prominently-sized product-form word (e.g. the
// "GUMMIES" of a front count badge) among a full-page OCR pass's words —
// never a small/body-text occurrence. The largest candidate wins when more
// than one qualifies (a page can print the word more than once, at
// different sizes).
export function findProminentProductFormWord(words: OcrWord[]): OcrWord | null {
  const bodyHeights = words
    .filter((word) => word.confidence >= 40 && word.text.replace(/[^a-zA-Z0-9]/g, '').length >= 2)
    .map(wordHeight);
  const medianHeight = median(bodyHeights);
  if (medianHeight <= 0) return null;

  const candidates = words.filter((word) => {
    if (word.confidence < MIN_FORM_WORD_CONFIDENCE) return false;
    const cleaned = word.text.replace(/[^a-zA-Z]/g, '');
    if (!PRODUCT_FORM_WORD_PATTERN.test(cleaned)) return false;
    return wordHeight(word) >= medianHeight * PROMINENCE_RATIO;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => wordHeight(b) - wordHeight(a));
  return candidates[0];
}

// A number Tesseract already read elsewhere in the SAME OCR pass, close
// enough to the prominent form-word to plausibly be its badge count — no
// extra OCR pass needed when this succeeds. Distance is scaled to the
// form-word's own text height so this generalizes across page
// resolutions/DPI, and checked in every direction (a badge's number can
// sit above, below, or beside its form-word depending on the design).
const SPATIAL_PROXIMITY_HEIGHTS = 3;

// Tesseract sometimes reads a single large, bold, stylized number (exactly
// the styling a badge's own count typically uses) as multiple separate
// per-digit/per-group word tokens rather than one word — seen in practice
// on a real badge where "30" came back as two distinct tokens, "3" and
// "0", sitting immediately next to each other. Two digit tokens are
// clustered together (and eventually concatenated) only when they sit on
// the same visual row (near-identical y-position) AND the gap between
// them is small relative to their own height — normal digit-to-digit
// spacing within one number, as opposed to a much wider gap that would
// indicate two unrelated numbers that merely happen to be nearby.
const ROW_Y_TOLERANCE_RATIO = 0.4;
const DIGIT_GAP_RATIO = 0.8;

function isDigitToken(word: OcrWord): boolean {
  const cleaned = word.text.replace(/[^0-9]/g, '');
  return cleaned.length > 0 && cleaned.length === word.text.trim().length;
}

// Two-phase clustering — group into visual ROWS first (by y-proximity),
// THEN merge horizontally-adjacent tokens within each row. Sorting by x0
// alone and only ever comparing a new token to the previous CLUSTER's last
// member (a single-phase approach, tried first) breaks when an unrelated
// token from a completely different row happens to sort between two
// tokens that belong together by x0 — seen in practice: a stray duplicate
// digit token from elsewhere on the page landed, by x-coordinate alone,
// between a badge's real "3" and "0", splitting them into separate
// clusters instead of merging into "30". Grouping by row first means a
// token from a different row can never interrupt a same-row sequence,
// regardless of where its x0 happens to fall.
function clusterAdjacentDigitTokens(digitWords: OcrWord[]): OcrWord[][] {
  const sortedByY = digitWords.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const rows: OcrWord[][] = [];
  for (const word of sortedByY) {
    const currentRow = rows[rows.length - 1];
    const rowAnchor = currentRow?.[0];
    if (rowAnchor && Math.abs(word.bbox.y0 - rowAnchor.bbox.y0) <= Math.max(wordHeight(word), wordHeight(rowAnchor)) * ROW_Y_TOLERANCE_RATIO) {
      currentRow.push(word);
    } else {
      rows.push([word]);
    }
  }

  const clusters: OcrWord[][] = [];
  for (const row of rows) {
    const sortedByX = row.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let current: OcrWord[] = [sortedByX[0]];
    for (let i = 1; i < sortedByX.length; i++) {
      const word = sortedByX[i];
      const prev = current[current.length - 1];
      const gap = word.bbox.x0 - prev.bbox.x1;
      if (gap <= Math.max(wordHeight(word), wordHeight(prev)) * DIGIT_GAP_RATIO) {
        current.push(word);
      } else {
        clusters.push(current);
        current = [word];
      }
    }
    clusters.push(current);
  }
  return clusters;
}

function clusterBbox(cluster: OcrWord[]): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(...cluster.map((w) => w.bbox.x0)),
    y0: Math.min(...cluster.map((w) => w.bbox.y0)),
    x1: Math.max(...cluster.map((w) => w.bbox.x1)),
    y1: Math.max(...cluster.map((w) => w.bbox.y1))
  };
}

export function findNearbyNumber(words: OcrWord[], formWord: OcrWord): string | null {
  const height = wordHeight(formWord);
  const maxDistance = height * SPATIAL_PROXIMITY_HEIGHTS;
  const formCenterX = (formWord.bbox.x0 + formWord.bbox.x1) / 2;
  const formCenterY = (formWord.bbox.y0 + formWord.bbox.y1) / 2;

  const distanceTo = (bbox: { x0: number; y0: number; x1: number; y1: number }) => {
    const centerX = (bbox.x0 + bbox.x1) / 2;
    const centerY = (bbox.y0 + bbox.y1) / 2;
    return Math.hypot(centerX - formCenterX, centerY - formCenterY);
  };

  const digitWords = words.filter((word) => word !== formWord && word.confidence >= 50 && isDigitToken(word));
  const clusters = clusterAdjacentDigitTokens(digitWords)
    .map((cluster) => ({ cluster, bbox: clusterBbox(cluster) }))
    .filter(({ bbox }) => distanceTo(bbox) <= maxDistance)
    .map(({ cluster, bbox }) => ({
      digits: cluster
        .slice()
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)
        .map((w) => w.text.replace(/[^0-9]/g, ''))
        .join(''),
      bbox
    }))
    .filter(({ digits }) => /^\d{1,4}$/.test(digits));
  if (clusters.length === 0) return null;

  clusters.sort((a, b) => distanceTo(a.bbox) - distanceTo(b.bbox));
  return clusters[0].digits;
}

// Builds a crop rectangle around the form-word (in the SAME image's pixel
// space its bounding box was reported in) to re-OCR for a digit — sized
// from the form-word's own text height, exactly as regionOcr.service.ts
// and titleRegionOcr.service.ts do, so this generalizes across page
// sizes/DPI far better than a fixed pixel margin would. A badge's number
// conventionally sits ABOVE its form-word (e.g. "30" over "GUMMIES"), so
// the crop is centered above it, generous enough in every direction to
// tolerate different badge proportions and designs.
function buildBadgeRectangle(formWord: OcrWord, imageWidth: number, imageHeight: number): Rectangle | null {
  const height = wordHeight(formWord);
  const formWidth = formWord.bbox.x1 - formWord.bbox.x0;
  const centerX = (formWord.bbox.x0 + formWord.bbox.x1) / 2;
  const width = Math.max(height * 5, formWidth + height * 2);
  const cropHeight = height * 2.5;

  const left = Math.max(0, Math.round(centerX - width / 2));
  const top = Math.max(0, Math.round(formWord.bbox.y0 - cropHeight));
  const clampedWidth = Math.min(imageWidth - left, Math.round(width));
  const clampedHeight = Math.min(imageHeight - top, Math.round(formWord.bbox.y0 - top));

  if (clampedWidth < height * 2 || clampedHeight < height) return null;
  return { left, top, width: clampedWidth, height: clampedHeight };
}

// Crops the region and applies a fresh, LOCAL upscale/contrast/threshold
// treatment tailored to just this small crop — a whole-page preprocessing
// pass's single global threshold can lose a bold number on a saturated or
// gradient badge background, but the same crop, considered on its own,
// often has a much starker/cleaner value distribution once normalized in
// isolation. `threshold` is optional: tried both with and without a hard
// binary cutoff (see recoverPackageSizeFromBadge), the same "a single
// fixed threshold doesn't always win" reasoning imagePreprocessing.service
// already documents for the whole-page passes.
async function preprocessBadgeCrop(imageBuffer: Buffer, rectangle: Rectangle, threshold?: number): Promise<Buffer> {
  let pipeline = sharp(imageBuffer, { failOn: 'none' })
    .extract(rectangle)
    .resize({ height: Math.max(200, rectangle.height * 4) })
    .grayscale()
    .normalize();
  if (threshold !== undefined) pipeline = pipeline.threshold(threshold);
  return pipeline.png().toBuffer();
}

const BADGE_THRESHOLDS: (number | undefined)[] = [undefined, 160, 120];
const BADGE_PSM_MODES = [PSM.SINGLE_LINE, PSM.SINGLE_BLOCK] as const;

// Attempts to recover the front-badge package count for one OCR pass's
// image/words. Returns "" (never throws) when no prominent product-form
// word is found, no plausible count can be read near it even after a
// targeted digit-only re-OCR, or the crop can't be computed — this never
// fabricates a count.
//
// The targeted digit-only crop (below) is tried BEFORE the cheaper
// "reuse a number already read nearby" check, not after — a loose
// spatial match among words the full-page pass already produced is more
// exposed to noise than it first appears: Tesseract can emit a spurious
// extra token that overlaps or sits immediately beside a real one (seen in
// practice: a "0" duplicate-detection artifact landed immediately next to
// an unrelated "100", and the two merged into a plausible-looking but
// wrong 4-digit cluster) — and whether that happens at all can vary
// between otherwise-identical OCR runs. A fresh, tightly-cropped,
// digit-only re-OCR of just the badge region is structurally far less
// exposed to that kind of unrelated interference, so it's preferred
// whenever it succeeds; the spatial check remains as a fallback for when
// the crop itself can't be computed or genuinely yields nothing.
async function recoverPackageSizeFromBadgeSource(imageBuffer: Buffer, words: OcrWord[]): Promise<string> {
  const formWord = findProminentProductFormWord(words);
  if (!formWord) return '';

  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width ?? formWord.bbox.x1 + 1;
  const imageHeight = metadata.height ?? formWord.bbox.y1 + 1;
  const rectangle = buildBadgeRectangle(formWord, imageWidth, imageHeight);

  if (rectangle) {
    for (const threshold of BADGE_THRESHOLDS) {
      const crop = await preprocessBadgeCrop(imageBuffer, rectangle, threshold);
      for (const psm of BADGE_PSM_MODES) {
        const digits = await recognizeDigits(crop, psm);
        if (/^\d{1,4}$/.test(digits)) return digits;
      }
    }
  }

  return findNearbyNumber(words, formWord) ?? '';
}

// Tries every available OCR pass's image/words in turn (the prominent
// form-word — or a number near it — may have been found in one pass's
// output but not another's, the same reasoning
// titleRegionOcr.service.ts's recoverProductTitleFromRegion already
// documents for product-title recovery) and returns the first non-empty
// result. Reuses OcrSource (image + its own words, kept paired since a
// bounding box is only valid in the image's own pixel space) rather than
// defining an equivalent type again.
export async function recoverPackageSizeFromBadge(sources: OcrSource[]): Promise<string> {
  for (const source of sources) {
    const result = await recoverPackageSizeFromBadgeSource(source.image, source.words);
    if (result) return result;
  }
  return '';
}
