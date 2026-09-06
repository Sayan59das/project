// Finds the big display type on a label, without needing to know what it says
// first.
//
// STATUS: NOT WIRED INTO THE EXTRACTION PIPELINE. Kept because the region
// finding works and the negative results below are worth not rediscovering.
// Two integration attempts were measured and both produced WRONG brands, so
// neither shipped — see "WHY IT IS NOT USED".
//
// THE PROBLEM
// ---------------------------------------------------------------------
// Tesseract does not segment large display type on a full page. On the
// NutriBears artwork it returns 493 words and 'NUTRI BEARS' is not among them:
// not misread, absent. Crop to that block and every page-segmentation mode
// reads it correctly, so the text is legible — the page layout analysis simply
// never offers it to the recogniser.
//
// titleRegionOcr.service.ts already exploits that, by cropping around the
// brand's bounding box. But it needs the brand to have been found first, and
// its own comment names the gap: "a label with no detected brand has no anchor
// to crop around, so this is skipped rather than guessing at a region". On
// artwork whose brand IS the display type, nothing ever finds the anchor.
//
// THE APPROACH
// ---------------------------------------------------------------------
// Look for ink that OCR did not account for. Score every cell of a coarse grid
// for visual detail, subtract the cells already covered by recognised words,
// and what remains is everything on the page that has marks but no text —
// which is display type, illustrations, logos and barcodes.
//
// That set deliberately includes non-text: a product photo scores as strongly
// as a wordmark, and no image statistic separates them reliably. Rather than
// try, the caller OCRs the top candidates and keeps the one that reads as a
// name. A photograph returns nothing legible and is dropped; the wordmark
// returns 'NUTRI BEARS'. Deciding by what a region says, rather than by what it
// looks like, is both simpler and harder to fool.
//
// WHY IT IS NOT USED
// ---------------------------------------------------------------------
// The region finding does work: it located the wordmark on both real artworks,
// and standalone it read 'Homeo-Vita' — a brand full-page OCR misses entirely.
// Two things defeated it in the pipeline, both measured rather than assumed.
//
// 1. Tesseract cannot transcribe stylised display type even from a tight crop.
//    'NUTRI' comes back as 'NUTR!', and the correct 'Homeo-Vita' reads at 48%
//    confidence while a wrong 'NUTR! BEARS JF' reads higher — so confidence
//    cannot choose between them either.
//
// 2. THE PREMISE WAS WRONG. The largest display type on a label is not
//    reliably the brand. On the Unicare artwork 'MULTIVITAMIN GUMMIES' is set
//    larger than the 'Homeo-Vita' wordmark, so this returned the brand
//    'GUMMIES'; on the NutriBears artwork it returned 'disease. Health'. A
//    "at least 2x the page's median word height" test was added to exclude body
//    text and did not help, because those blocks genuinely ARE display type —
//    just not the brand.
//
// What would be needed is a way to tell a brand wordmark from a product
// descriptor set in the same size, which is semantic rather than geometric.
// That is the specific job a local vision model would earn its place doing, and
// the one field the deterministic approach in this codebase does not reach.

import sharp from 'sharp';
import { recognizeRegionWithWords, type OcrWord, type Rectangle } from './tesseract.service';

// Grid resolution. Fine enough that one wordmark occupies several cells and
// coarse enough that body text — already excluded via OCR coverage — does not
// fragment the grid into noise.
const GRID_COLUMNS = 64;
const GRID_ROWS = 32;

// Mean edge magnitude, 0-255, above which a cell counts as containing marks.
// Low, because it only has to separate "something is printed here" from blank
// substrate; the OCR-coverage mask does the discriminating work.
const INK_THRESHOLD = 12;

// A candidate has to be at least this share of the page to be display type.
// Below it lies a stray icon, a registration mark, a speck of JPEG noise.
const MIN_AREA_FRACTION = 0.004;

// And no more than this, or it is the artwork's background rather than a block
// within it.
const MAX_AREA_FRACTION = 0.4;

// Padding around a returned region, as a fraction of the page's smaller side.
// Display glyphs have long ascenders and wide side bearings, and a crop that
// clips them costs more accuracy than the extra context does.
const REGION_PADDING_FRACTION = 0.01;

/**
 * A Laplacian edge map, averaged down to one value per grid cell.
 *
 * Edge magnitude rather than raw brightness, because a label's background is
 * rarely white — the NutriBears artwork is a solid yellow sheet, and a
 * brightness threshold would report the entire page as ink. Edges appear where
 * something is printed, whatever colour either side of it happens to be.
 */
async function inkGrid(pageImage: Buffer): Promise<{ cells: number[]; width: number; height: number }> {
  const image = sharp(pageImage, { failOn: 'none' });
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const { data } = await sharp(pageImage, { failOn: 'none' })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] })
    // Averaging down to the grid IS the per-cell mean: each output pixel is the
    // mean edge magnitude of the source region behind it.
    .resize(GRID_COLUMNS, GRID_ROWS, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { cells: Array.from(data), width, height };
}

/** Grid cells overlapped by a recognised word, which are therefore not display type. */
function ocrCoverage(words: readonly OcrWord[], pageWidth: number, pageHeight: number): boolean[] {
  const covered = new Array<boolean>(GRID_COLUMNS * GRID_ROWS).fill(false);
  if (pageWidth === 0 || pageHeight === 0) return covered;

  for (const word of words) {
    if (word.text.trim() === '') continue;
    const fromColumn = Math.max(0, Math.floor((word.bbox.x0 / pageWidth) * GRID_COLUMNS));
    const toColumn = Math.min(GRID_COLUMNS - 1, Math.floor((word.bbox.x1 / pageWidth) * GRID_COLUMNS));
    const fromRow = Math.max(0, Math.floor((word.bbox.y0 / pageHeight) * GRID_ROWS));
    const toRow = Math.min(GRID_ROWS - 1, Math.floor((word.bbox.y1 / pageHeight) * GRID_ROWS));

    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        covered[row * GRID_COLUMNS + column] = true;
      }
    }
  }
  return covered;
}

type Component = { minColumn: number; maxColumn: number; minRow: number; maxRow: number; mass: number };

/** Four-neighbour flood fill over the candidate cells. */
function connectedComponents(candidate: boolean[], cells: number[]): Component[] {
  const seen = new Array<boolean>(candidate.length).fill(false);
  const components: Component[] = [];

  for (let start = 0; start < candidate.length; start += 1) {
    if (!candidate[start] || seen[start]) continue;

    const stack = [start];
    seen[start] = true;
    const component: Component = {
      minColumn: GRID_COLUMNS,
      maxColumn: -1,
      minRow: GRID_ROWS,
      maxRow: -1,
      mass: 0
    };

    while (stack.length > 0) {
      const index = stack.pop() as number;
      const row = Math.floor(index / GRID_COLUMNS);
      const column = index % GRID_COLUMNS;

      component.minColumn = Math.min(component.minColumn, column);
      component.maxColumn = Math.max(component.maxColumn, column);
      component.minRow = Math.min(component.minRow, row);
      component.maxRow = Math.max(component.maxRow, row);
      component.mass += cells[index];

      const neighbours = [
        column > 0 ? index - 1 : -1,
        column < GRID_COLUMNS - 1 ? index + 1 : -1,
        row > 0 ? index - GRID_COLUMNS : -1,
        row < GRID_ROWS - 1 ? index + GRID_COLUMNS : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && candidate[neighbour] && !seen[neighbour]) {
          seen[neighbour] = true;
          stack.push(neighbour);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Regions of the page that carry marks but no recognised text, most
 * ink-dense first.
 *
 * These are CANDIDATES, not confirmed text. The caller is expected to OCR them
 * and discard whatever does not read as a name — see the note at the top of
 * this file on why that is the reliable discriminator.
 */
export async function findDisplayTextRegions(
  pageImage: Buffer,
  words: readonly OcrWord[],
  maxRegions = 3
): Promise<Rectangle[]> {
  const { cells, width, height } = await inkGrid(pageImage);
  if (width === 0 || height === 0 || cells.length !== GRID_COLUMNS * GRID_ROWS) return [];

  const covered = ocrCoverage(words, width, height);
  const candidate = cells.map((ink, index) => ink >= INK_THRESHOLD && !covered[index]);

  const cellWidth = width / GRID_COLUMNS;
  const cellHeight = height / GRID_ROWS;
  const padding = Math.round(Math.min(width, height) * REGION_PADDING_FRACTION);
  const pageArea = width * height;

  return connectedComponents(candidate, cells)
    .map((component) => {
      const left = Math.max(0, Math.round(component.minColumn * cellWidth) - padding);
      const top = Math.max(0, Math.round(component.minRow * cellHeight) - padding);
      const right = Math.min(width, Math.round((component.maxColumn + 1) * cellWidth) + padding);
      const bottom = Math.min(height, Math.round((component.maxRow + 1) * cellHeight) + padding);
      return {
        rect: { left, top, width: right - left, height: bottom - top },
        mass: component.mass
      };
    })
    .filter(({ rect }) => {
      const fraction = (rect.width * rect.height) / pageArea;
      return fraction >= MIN_AREA_FRACTION && fraction <= MAX_AREA_FRACTION;
    })
    .sort((first, second) => second.mass - first.mass)
    .slice(0, maxRegions)
    .map(({ rect }) => rect);
}

// ---------------------------------------------------------------------
// Reading a candidate region
// ---------------------------------------------------------------------

// Tesseract page-segmentation mode 6: "assume a single uniform block of text".
// The whole point of cropping is to hand the recogniser a region it does not
// have to segment, so the mode that skips layout analysis is the right one.
const PSM_SINGLE_BLOCK = 6;

// A word has to be at least this tall, relative to the tallest in the region,
// to count as part of the heading. A wordmark sits among smaller type — the
// pack count, a strapline, a flavour line — and mixing those into the brand is
// how 'NutriBears' becomes 'NUTRI BEARS GUMMIES ONE A DAY'.
const HEADING_HEIGHT_RATIO = 0.7;

// Below this Tesseract is guessing at shapes rather than reading glyphs.
const MIN_HEADING_CONFIDENCE = 45;

// Fewest letters a recovered heading may have. See cleanHeading.
const MIN_HEADING_LETTERS = 4;

// How much taller than the page's ordinary text a heading has to be.
//
// This is the test that separates a wordmark from body text the coverage mask
// happened to miss. Without it, any clean word in a high-ink region is
// accepted, and on these artworks that produced the brand 'GUMMIES' and
// 'disease. Health' — real text, read correctly, and not the brand. Display
// type is defined by being conspicuously larger than everything around it, so
// that is what gets measured.
const DISPLAY_HEIGHT_MULTIPLE = 2;

function hasLetters(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

function unionOf(words: readonly OcrWord[]): Rectangle {
  const left = Math.min(...words.map((word) => word.bbox.x0));
  const top = Math.min(...words.map((word) => word.bbox.y0));
  const right = Math.max(...words.map((word) => word.bbox.x1));
  const bottom = Math.max(...words.map((word) => word.bbox.y1));
  return { left, top, width: right - left, height: bottom - top };
}

// Characters that can appear in a printed brand or product name. Anything else
// in a token — '!', '(', '|' — is a misread glyph, not punctuation somebody set.
const NAME_CHARACTERS = /^[A-Za-z0-9&'’.\-]+$/;

// A token that is nothing but a connector between two parts of a name.
const CONNECTOR_TOKEN = /^[&\-–—]$/;

/**
 * Whether one recognised token could be part of a printed name.
 *
 * A short token with no vowel ('JF', 'Fm') is a glyph cluster the recogniser
 * could not resolve, not a word.
 */
function isCleanNameToken(token: string): boolean {
  if (!NAME_CHARACTERS.test(token)) return false;
  // A lone connector is part of the name, not a word in it. OCR routinely sets
  // the hyphen of 'Homeo-Vita' and the ampersand of 'Nature & Co' as their own
  // tokens, and judging those by the letter rules below rejects the entire
  // heading — which silently made the hyphen rejoining further down
  // unreachable.
  if (CONNECTOR_TOKEN.test(token)) return true;
  if (!/[A-Za-z]/.test(token)) return false;
  return token.length >= 3 || /[AEIOUaeiou]/.test(token);
}

/**
 * The heading, but only if EVERY token in it reads cleanly.
 *
 * All-or-nothing on purpose, and confidence is deliberately not the test. On
 * this dataset the correct reading — 'Homeo-'(48) 'Vita'(48) — scores LOWER
 * than a wrong one — 'NUTR!'(55) 'BEARS'(68) 'JF'(58) — so a confidence
 * threshold keeps the mistake and discards the answer.
 *
 * Salvaging the clean tokens from a partly-garbled heading is worse than
 * dropping it: 'NUTR! BEARS JF' would yield the brand 'BEARS', which is not
 * what the label says and which compares like a real value. One junk token
 * means the recogniser lost the typeface, so nothing it returned from that
 * block is trustworthy — and absent is a MISSING the reviewer investigates.
 */
// Exported for its own tests: these rules are the difference between recovering
// a brand and storing a wrong one, and they are worth pinning independently of
// the OCR passes that feed them.
export function cleanHeading(words: readonly OcrWord[]): string {
  const tokens = words.map((word) => word.text.trim()).filter((token) => token !== '');
  if (tokens.length === 0) return '';
  if (!tokens.every(isCleanNameToken)) return '';

  // A heading shorter than this is a fragment of a longer word the recogniser
  // clipped — 'Cel' out of 'Cell' on one of these artworks. This whole path is
  // a speculative recovery that only runs when the field is otherwise absent,
  // so the bar is set where a genuinely short brand is preferred lost over a
  // fragment being stored as one.
  const letters = tokens.join('').replace(/[^A-Za-z]/g, '');
  if (letters.length < MIN_HEADING_LETTERS) return '';

  return (
    inReadingOrder(words)
      // OCR puts a space either side of a hyphen it read as its own glyph;
      // 'Homeo- Vita' is one hyphenated name, not two words.
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function inReadingOrder(words: readonly OcrWord[]): string {
  const lineHeight = Math.max(...words.map((word) => word.bbox.y1 - word.bbox.y0), 1);
  return [...words]
    .sort((first, second) => {
      // Same visual row when their tops are within half a line of each other;
      // read left to right within a row, top to bottom across rows.
      const sameRow = Math.abs(first.bbox.y0 - second.bbox.y0) < lineHeight * 0.5;
      return sameRow ? first.bbox.x0 - second.bbox.x0 : first.bbox.y0 - second.bbox.y0;
    })
    .map((word) => word.text.trim())
    .filter((text) => text !== '')
    .join(' ');
}

/**
 * Reads the heading out of one candidate region, or '' if it holds none.
 *
 * Two passes, because the candidate rectangle is grid-aligned and therefore
 * loose. A loose crop drags in neighbouring type and measurably degrades the
 * read — on the NutriBears artwork it returns 'NUTR! | BEARS : GUMMIES JF',
 * where a tight crop of the same wordmark returns 'NUTRI BEARS'. So the first
 * pass is used only to LOCATE the tallest glyphs, and the second reads them
 * back from a rectangle drawn around exactly those.
 */
export async function readDisplayHeading(
  pageImage: Buffer,
  region: Rectangle,
  bodyTextHeight: number
): Promise<string> {
  const located = await recognizeRegionWithWords(pageImage, region, PSM_SINGLE_BLOCK as never);

  const usable = located.words.filter(
    (word) => hasLetters(word.text) && word.confidence >= MIN_HEADING_CONFIDENCE
  );
  if (usable.length === 0) return '';

  const tallest = Math.max(...usable.map((word) => word.bbox.y1 - word.bbox.y0));

  // Not display type — ordinary text in a region the coverage mask missed.
  if (bodyTextHeight > 0 && tallest < bodyTextHeight * DISPLAY_HEIGHT_MULTIPLE) return '';
  const heading = usable.filter((word) => word.bbox.y1 - word.bbox.y0 >= tallest * HEADING_HEIGHT_RATIO);
  if (heading.length === 0) return '';

  // tesseract.js's `rectangle` option restricts WHERE it recognises, but the
  // boxes it returns stay in the source image's coordinates — so this union is
  // already a page rectangle. Adding the region's origin back would double-count
  // it and push the crop off the page, which Leptonica reports as "box doesn't
  // overlap pix" and which silently costs the second pass entirely.
  const tight = unionOf(heading);

  // A tight box that is essentially the region again gains nothing, and a
  // second OCR pass is not free.
  const shrunk = tight.width * tight.height < region.width * region.height * 0.8;
  if (!shrunk) return cleanHeading(heading);

  const reread = await recognizeRegionWithWords(pageImage, tight, PSM_SINGLE_BLOCK as never);
  const rereadWords = reread.words.filter(
    (word) => hasLetters(word.text) && word.confidence >= MIN_HEADING_CONFIDENCE
  );
  // Keep the first pass's answer if the tighter crop read nothing — cropping
  // harder is an optimisation, never a reason to lose a heading already read.
  return rereadWords.length > 0 ? cleanHeading(rereadWords) : cleanHeading(heading);
}

/**
 * The label's display heading — its brand wordmark — or '' if none reads
 * cleanly.
 *
 * Tries each OCR source in turn (the pipeline produces one per preprocessing
 * pass) and takes the first heading that survives cleanHeading, working through
 * candidate regions in ink-mass order. First rather than best, because the
 * cleanliness gate is already strict: anything that reaches this point read
 * cleanly, and preferring a later region over an earlier one would mean
 * inventing a ranking between two equally clean answers.
 */
/** The page's ordinary text size, as the median recognised word height. */
function medianWordHeight(words: readonly OcrWord[]): number {
  const heights = words
    .filter((word) => word.text.trim() !== '')
    .map((word) => word.bbox.y1 - word.bbox.y0)
    .sort((first, second) => first - second);
  return heights.length === 0 ? 0 : heights[Math.floor(heights.length / 2)];
}

export async function recoverDisplayHeading(
  sources: readonly { image: Buffer; words: OcrWord[] }[]
): Promise<string> {
  for (const source of sources) {
    let regions: Rectangle[];
    try {
      regions = await findDisplayTextRegions(source.image, source.words);
    } catch {
      // An image sharp cannot analyse costs this one recovery attempt, not the
      // extraction — every other field is already in hand by this point.
      continue;
    }

    const bodyTextHeight = medianWordHeight(source.words);

    for (const region of regions) {
      const heading = await readDisplayHeading(source.image, region, bodyTextHeight);
      if (heading !== '') return heading;
    }
  }
  return '';
}
