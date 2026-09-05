// Targeted, region-based OCR to enrich Product Name.
//
// A front label's brand and product title are frequently rendered as a
// stylized display-text graphic — large, bold, centered — rather than
// ordinary body copy. A full-page OCR pass can read part of that graphic
// (e.g. the brand name, and a later short line) while dropping a middle
// title line entirely: the pass that reads the surrounding compliance text
// cleanly enough to find every other field still isn't tuned for a large,
// sparse, all-caps banner sitting over artwork. Rather than accept "the
// title is incomplete", this locates the brand's own position (from a
// full-page pass's word boxes), looks for the next comparably large piece
// of text below it, and re-OCRs the vertical gap between them in isolation
// with a page-segmentation mode suited to sparse, scattered display text.
//
// Fully generic: nothing here is anchored to any specific brand, product,
// or wording, or to any particular text case — a title rendered in ALL
// CAPS, Title Case, or ordinary mixed case is read identically, since this
// operates on word geometry (size, position) and OCR confidence, not on
// how the text is capitalized. A result is only used when Tesseract's own
// confidence in it is high and it adds new words beyond what's already
// known (see collectReliableTitleWords and the superset check in
// recoverProductTitleFromRegion); when the crop's own reading is low
// confidence throughout (e.g. a decorative/stylized title font Tesseract's
// Latin-text model can't read at all), a fuzzy cross-validation step (see
// findCrossValidatedWord) checks whether that garbled reading closely
// matches a separately, confidently-read word elsewhere on the same page —
// still grounded in real OCR output, never a guess. Otherwise this returns
// "" and the caller keeps whatever productName it already had.
import sharp from 'sharp';
import { PSM } from 'tesseract.js';
import { recognizeRegionWithWords, type OcrWord, type Rectangle } from './tesseract.service';

type Bbox = { x0: number; y0: number; x1: number; y1: number };

function normalizeToken(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function unionBbox(words: OcrWord[]): Bbox {
  return {
    x0: Math.min(...words.map((word) => word.bbox.x0)),
    y0: Math.min(...words.map((word) => word.bbox.y0)),
    x1: Math.max(...words.map((word) => word.bbox.x1)),
    y1: Math.max(...words.map((word) => word.bbox.y1))
  };
}

// Locates the brand string among a full-page pass's word positions by
// matching its own words, in order, against consecutive OCR words — the
// same "slide a window over the words" approach used to locate anchor
// phrases in regionOcr.service.ts, specialized to an exact multi-word
// match rather than a regex.
function findBrandBbox(words: OcrWord[], brand: string): Bbox | null {
  const brandTokens = brand
    .trim()
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
  if (brandTokens.length === 0) return null;

  for (let start = 0; start + brandTokens.length <= words.length; start++) {
    let matches = true;
    for (let i = 0; i < brandTokens.length; i++) {
      if (normalizeToken(words[start + i].text) !== brandTokens[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return unionBbox(words.slice(start, start + brandTokens.length));
  }
  return null;
}

// A "large title row" candidate must be within a bounded horizontal
// distance of the brand's own column — what lets this pick out the correct
// occurrence when a print sheet repeats the whole artwork panel (and
// therefore the same title text) several times across the page, since the
// repetition nearest the located brand is the one that belongs to the same
// panel and the others sit a full panel-width away — and within a bounded
// VERTICAL distance too, so that filtering out a too-large/too-small
// candidate never lets the search reach past the real title and latch onto
// something unrelated much further down the page (seen in practice: a
// brand watermark much smaller than the actual title text directly below
// it caused a same-word "product-form" mention over a thousand pixels
// further down — past the real title — to be picked instead, producing a
// crop far too broad and noisy to yield anything reliable). The size ratio
// itself is deliberately generous rather than tight: a corporate watermark
// and the label's actual product-title graphic are frequently NOT close in
// size (a small watermark under a much larger headline is common), so
// requiring near-equal height would reject the real title text outright.
const SIZE_RATIO_MIN = 0.5;
const SIZE_RATIO_MAX = 4.0;
const HORIZONTAL_PROXIMITY_LINE_HEIGHTS = 10;
const VERTICAL_PROXIMITY_LINE_HEIGHTS = 15;
const ROW_Y_TOLERANCE_LINE_HEIGHTS = 0.6;

function findNextLargeTextRowBelow(words: OcrWord[], brand: Bbox): Bbox | null {
  const brandHeight = Math.max(10, brand.y1 - brand.y0);
  const brandCenterX = (brand.x0 + brand.x1) / 2;
  const minHeight = brandHeight * SIZE_RATIO_MIN;
  const maxHeight = brandHeight * SIZE_RATIO_MAX;
  const maxHorizontalDistance = brandHeight * HORIZONTAL_PROXIMITY_LINE_HEIGHTS;
  const maxVerticalDistance = brandHeight * VERTICAL_PROXIMITY_LINE_HEIGHTS;

  const candidates = words.filter((word) => {
    const height = word.bbox.y1 - word.bbox.y0;
    if (height < minHeight || height > maxHeight) return false;
    if (word.bbox.y0 <= brand.y1) return false;
    if (word.bbox.y0 - brand.y1 > maxVerticalDistance) return false;
    const wordCenterX = (word.bbox.x0 + word.bbox.x1) / 2;
    if (Math.abs(wordCenterX - brandCenterX) > maxHorizontalDistance) return false;
    return word.text.replace(/[^a-zA-Z0-9]/g, '').length >= 3;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const nearestY0 = candidates[0].bbox.y0;
  const rowTolerance = brandHeight * ROW_Y_TOLERANCE_LINE_HEIGHTS;
  const row = candidates.filter((word) => Math.abs(word.bbox.y0 - nearestY0) <= rowTolerance);
  return unionBbox(row);
}

// Sized from the brand's own text height, exactly as regionOcr.service.ts's
// buildRegionRectangle is — generalizes across page sizes/DPI far better
// than a page-relative fraction would. The horizontal margin is generous
// (title graphics are often wider than either single row found) so a title
// word that starts further left/right than both known rows isn't clipped.
const HORIZONTAL_MARGIN_LINE_HEIGHTS = 3;
const VERTICAL_MARGIN_LINE_HEIGHTS = 1;

function buildTitleRectangle(brand: Bbox, nextRow: Bbox, pageWidth: number, pageHeight: number): Rectangle | null {
  const lineHeight = Math.max(10, brand.y1 - brand.y0);
  const left = Math.max(0, Math.round(Math.min(brand.x0, nextRow.x0) - lineHeight * HORIZONTAL_MARGIN_LINE_HEIGHTS));
  const top = Math.max(0, Math.round(brand.y0 - lineHeight * VERTICAL_MARGIN_LINE_HEIGHTS));
  const right = Math.min(pageWidth, Math.round(Math.max(brand.x1, nextRow.x1) + lineHeight * HORIZONTAL_MARGIN_LINE_HEIGHTS));
  const bottom = Math.min(pageHeight, Math.round(nextRow.y1 + lineHeight * VERTICAL_MARGIN_LINE_HEIGHTS));
  const width = right - left;
  const height = bottom - top;
  if (width < lineHeight * 3 || height < lineHeight * 2) return null;
  return { left, top, width, height };
}

// Tesseract's own confidence (0-100) is the reliability signal used here —
// leaning on the OCR engine's own judgment of a word rather than trying to
// heuristically guess whether it "looks like a real word" (which a
// dictionary-free approach can't do reliably, and a scrambled-but-plausible
// misread like "Cider" -> "Cidei" would fool anyway). A conservative cutoff
// keeps this consistent with "uncertain = blank, never guess" applied at
// the word level rather than the whole-field level.
const MIN_WORD_CONFIDENCE = 60;

// A bare run of 4+ digits with no letters ("11419") is never real product
// title text — seen in practice when a crop also catches a decorative
// flourish/underline graphic beneath the title, which Tesseract can misread
// as plausible-looking, even reasonably-confident numbers. A short number
// attached to a unit or word (e.g. a "3" in "Omega 3") is unaffected, since
// this only screens out tokens that are ENTIRELY digits.
const BARE_LONG_NUMBER = /^\d{4,}$/;

function collectReliableTitleWords(words: OcrWord[], brandTokens: Set<string>): OcrWord[] {
  return words.filter((word) => {
    if (word.confidence < MIN_WORD_CONFIDENCE) return false;
    const cleaned = word.text.replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length < 2) return false;
    if (BARE_LONG_NUMBER.test(cleaned)) return false;
    return !brandTokens.has(cleaned.toUpperCase());
  });
}

// Reconstructs reading order (top-to-bottom rows, left-to-right within a
// row) from a set of words with no guaranteed ordering — the region OCR
// pass can return words in an arbitrary order for a sparse/scattered layout
// (that's the whole reason PSM.SPARSE_TEXT is used here over SINGLE_BLOCK).
function joinWordsInReadingOrder(words: OcrWord[]): string {
  if (words.length === 0) return '';
  const sorted = words.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    const currentRow = rows[rows.length - 1];
    const rowHeight = Math.max(10, word.bbox.y1 - word.bbox.y0);
    if (currentRow && Math.abs(word.bbox.y0 - currentRow[0].bbox.y0) <= rowHeight * ROW_Y_TOLERANCE_LINE_HEIGHTS) {
      currentRow.push(word);
    } else {
      rows.push([word]);
    }
  }
  return rows
    .map((row) =>
      row
        .slice()
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)
        .map((word) => word.text)
        // A word ending in a hyphen ("She-") is a broken-off half of one
        // hyphenated word, not two separate words — joined directly, so it
        // reads "She-Arise" rather than "She- Arise".
        .reduce((joined, word, i) => (i === 0 ? word : joined.endsWith('-') ? joined + word : `${joined} ${word}`), '')
    )
    .join(' ');
}

// A decorative/stylized title font (script-style branding is common on
// Ayurvedic/herbal packaging, for instance) can render as pure garbage even
// after a targeted crop and multiple page-segmentation modes — no amount of
// re-cropping fixes that; the font itself is outside what Tesseract's
// Latin-text model can read. But the SAME word often also appears elsewhere
// on the label in an ordinary, non-stylized font (e.g. as part of an
// ingredient/blend name in the compliance text) and gets read there with
// high confidence. When a low-confidence crop reading is a close match
// (one contains the other) to a separately, confidently-read word
// elsewhere on the page, that confident reading is trusted instead — this
// is still never a guess: the word is one Tesseract actually read
// correctly somewhere on this exact label, just not in the crop where its
// position said it belongs.
const CROSS_VALIDATION_MIN_CONFIDENCE = 70;
const CROSS_VALIDATION_MIN_LENGTH = 4;

function normalizeForFuzzyMatch(text: string): string {
  return text.replace(/[^a-zA-Z]/g, '').toUpperCase();
}

function isCloseMatch(a: string, b: string): boolean {
  if (a.length < CROSS_VALIDATION_MIN_LENGTH || b.length < CROSS_VALIDATION_MIN_LENGTH) return false;
  return a.includes(b) || b.includes(a);
}

// Looks for a word elsewhere on the full page (excluding the brand itself)
// that Tesseract read with high confidence and whose letters closely match
// a low-confidence word found in the title-region crop. Returns that
// confident word's own original text (case/spelling as Tesseract read it
// there), never the garbled crop text.
function findCrossValidatedWord(garbledText: string, pageWords: OcrWord[], brandTokens: Set<string>): string | null {
  const normalizedGarbled = normalizeForFuzzyMatch(garbledText);
  if (normalizedGarbled.length < CROSS_VALIDATION_MIN_LENGTH) return null;

  for (const word of pageWords) {
    if (word.confidence < CROSS_VALIDATION_MIN_CONFIDENCE) continue;
    const normalizedWord = normalizeForFuzzyMatch(word.text);
    if (brandTokens.has(normalizedWord)) continue;
    if (isCloseMatch(normalizedGarbled, normalizedWord)) return word.text;
  }
  return null;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function wordSet(value: string): Set<string> {
  return new Set(
    value
      .toUpperCase()
      .split(/\s+/)
      .map((word) => word.replace(/[^A-Z0-9]/g, ''))
      .filter(Boolean)
  );
}

// A recovered candidate is only trusted if it contains every word the
// caller's existing productName already has (so this only ever extends a
// title, never contradicts or replaces one with something unrelated) and
// contributes at least one new word (otherwise there's nothing to enrich).
function isTrustworthyEnrichment(candidateWords: Set<string>, currentProductName: string): boolean {
  const currentWords = wordSet(currentProductName);
  for (const word of currentWords) {
    if (!candidateWords.has(word)) return false;
  }
  return candidateWords.size > currentWords.size;
}

// Attempts to recover a more complete product title by cropping the region
// between the already-detected brand and the next comparably large piece of
// title text below it, then re-OCRing just that region with page
// segmentation modes suited to sparse/scattered display text. Returns the
// enriched title (title-cased) only when it's a confident, strict
// enrichment of currentProductName; otherwise returns "" — this never
// fabricates a title and never downgrades one that's already trustworthy.
async function recoverProductTitleFromRegionSource(
  pageImageBuffer: Buffer,
  words: OcrWord[],
  brand: string,
  currentProductName: string
): Promise<string> {
  if (!brand.trim()) return '';

  const brandBbox = findBrandBbox(words, brand);
  if (!brandBbox) return '';

  const nextRow = findNextLargeTextRowBelow(words, brandBbox);
  if (!nextRow) return '';

  const metadata = await sharp(pageImageBuffer).metadata();
  const pageWidth = metadata.width ?? Math.max(brandBbox.x1, nextRow.x1) + 1;
  const pageHeight = metadata.height ?? nextRow.y1 + 1;

  const rectangle = buildTitleRectangle(brandBbox, nextRow, pageWidth, pageHeight);
  if (!rectangle) return '';

  const brandTokens = new Set(
    brand
      .trim()
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean)
  );

  for (const psm of [PSM.SPARSE_TEXT, PSM.SINGLE_COLUMN] as const) {
    const { words: regionWords } = await recognizeRegionWithWords(pageImageBuffer, rectangle, psm);
    const reliableWords = collectReliableTitleWords(regionWords, brandTokens);

    // A real product title is a handful of words at most — a crop anchored
    // at the wrong place on the page (e.g. a bad brand match landing in a
    // nutrition table or disclaimer paragraph) can otherwise return dozens
    // of "reliable" words that individually pass every other check but
    // never belong together as a title. Capping the word count is a last
    // line of defense independent of what went wrong upstream.
    const MAX_CANDIDATE_WORDS = 8;

    const tryCandidate = (candidateWordList: OcrWord[]): string | null => {
      const candidateText = titleCase(joinWordsInReadingOrder(candidateWordList));
      const candidateWords = wordSet(candidateText);
      if (candidateWords.size === 0 || candidateWords.size > MAX_CANDIDATE_WORDS) return null;
      if (!isTrustworthyEnrichment(candidateWords, currentProductName)) return null;
      return candidateText;
    };

    const direct = tryCandidate(reliableWords);
    if (direct) return direct;

    // Nothing directly reliable — before giving up on this PSM, see if any
    // of the crop's low-confidence words are a close match to a
    // confidently-read word elsewhere on the page (see
    // findCrossValidatedWord) and, if so, substitute that confident
    // reading in and retry. Bounded to a handful of substitutions: a crop
    // that needs more than that to make sense is a sign the crop itself is
    // wrong, not that more cross-validation will help.
    const MAX_CROSS_VALIDATED_WORDS = 4;
    const crossValidatedWords: OcrWord[] = [...reliableWords];
    let recoveredCount = 0;
    for (const word of regionWords) {
      if (recoveredCount >= MAX_CROSS_VALIDATED_WORDS) break;
      if (word.confidence >= MIN_WORD_CONFIDENCE) continue;
      const cleaned = word.text.replace(/[^a-zA-Z0-9]/g, '');
      if (cleaned.length < CROSS_VALIDATION_MIN_LENGTH) continue;
      if (brandTokens.has(cleaned.toUpperCase())) continue;
      const crossValidated = findCrossValidatedWord(word.text, words, brandTokens);
      if (crossValidated) {
        crossValidatedWords.push({ ...word, text: crossValidated });
        recoveredCount++;
      }
    }
    if (recoveredCount > 0) {
      const withCrossValidation = tryCandidate(crossValidatedWords);
      if (withCrossValidation) return withCrossValidation;
    }
  }

  return '';
}

export type OcrSource = { image: Buffer; words: OcrWord[] };

// The brand may have been located in one OCR pass's word positions (e.g.
// the primary pass) while the SAME brand string never appears at all in
// another pass's output (e.g. the alt pass, tuned differently and simply
// not reading that particular watermark this time) — a real case, not
// hypothetical: a caller that always hands this the most-recently-run
// pass's words can lose the only word list that actually contains the
// brand, causing findBrandBbox to silently fail even though the brand was
// confidently found moments earlier. Trying every available pass's words
// (each paired with the image buffer that produced them, since bounding
// boxes are only valid in their own image's pixel space) avoids that.
export async function recoverProductTitleFromRegion(sources: OcrSource[], brand: string, currentProductName: string): Promise<string> {
  for (const source of sources) {
    const result = await recoverProductTitleFromRegionSource(source.image, source.words, brand, currentProductName);
    if (result) return result;
  }
  return '';
}
