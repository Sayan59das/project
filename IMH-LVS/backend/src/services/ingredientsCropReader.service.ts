// accuracy3 Step 4.1 (original directive spec): the ingredients crop
// reader, following the pattern nutritionCropReader.service.ts already
// proved in production (accuracy2 Step 7) -- a whole-page VLM read is too
// low-resolution to read small print reliably; a real-resolution crop of
// just the panel reads it correctly, at no extra latency cost.
//
// This is a LAST-RESORT side channel, same philosophy as every other
// recovery pass in this pipeline: only reached when extractIngredients
// and mergeIngredientsResults (the text-layer and OCR-text paths) both
// left ingredients empty, and only when the VLM is enabled. A crop read
// is still a model guess, not an OCR fact, so every item is grounded
// (isPlausibleIngredientItem + isCorroboratedWholePhrase) before it's
// trusted -- the same discipline isPlausibleNutritionRow already applies
// to nutrition rows, strengthened here per the directive's own spec: an
// item is accepted only when a PP-OCR or text-layer line in the SAME
// PANEL also states it, whole-phrase.
//
// Two ways to locate the panel:
//   - findIngredientsPanelFromSpans: exact, from the PDF's own text-layer
//     geometry, when an anchor line ("Ingredients:", "Composition:", ...)
//     is present.
//   - findIngredientsPanelFromLines: a no-anchor fallback for labels with
//     no PDF text layer at all (most of this client's real scanned
//     intake, confirmed by validating the anchor-only v1 against 69 real
//     labels and finding zero activations for exactly this reason) --
//     locates the panel holding the longest continuous run of small-print
//     OCR lines, the same shape an ingredients declaration has on every
//     real label (dense small print), as opposed to a wordmark (large) or
//     a short caption (too few lines to trust).
import sharp from 'sharp';
import type { TextSpan } from './pdf.service';
import { segmentPanels } from './textLayerGeometry.service';
import { projectSpanToPixels } from './outlinedText.service';
import type { OcrLineLike } from './outlinedText.service';
import type { VlmClient, VlmImage } from './ollamaVlm.service';
import { INGREDIENTS_ANCHOR } from './labelSemanticExtractor.service';
import type { CropBox } from './nutritionCropReader.service';

export type IngredientsPanelMatch = {
  box: CropBox;
  // The panel's own text (from spans or OCR lines, whichever located it),
  // flattened to one string -- used to whole-phrase-corroborate every VLM
  // item before it's trusted. This is real, independently-read text, not
  // anything the VLM itself produced.
  corroborationText: string;
};

/**
 * Finds the ingredients panel's real pixel bounding box from the PDF's own
 * text layer, when it has one for this panel. Exact -- no OCR guessing.
 * Returns null when no panel's lines match the ingredients anchor phrase
 * (the same anchor extractIngredients itself uses on flattened text).
 */
export function findIngredientsPanelFromSpans(
  spans: readonly TextSpan[],
  pageHeightPt: number,
  dpi: number
): IngredientsPanelMatch | null {
  if (spans.length === 0) return null;
  const panels = segmentPanels(spans);
  const panel = panels.find((p) => p.lines.some((l) => INGREDIENTS_ANCHOR.test(l.text)));
  if (!panel) return null;

  const panelSpans = panel.lines.flatMap((l) => l.spans);
  if (panelSpans.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const span of panelSpans) {
    const rect = projectSpanToPixels(span, pageHeightPt, dpi);
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.left + rect.width);
    maxY = Math.max(maxY, rect.top + rect.height);
  }
  return {
    box: { left: minX, top: minY, width: maxX - minX, height: maxY - minY },
    corroborationText: panel.lines.map((l) => l.text).join(' ')
  };
}

// A real ingredients declaration's print is small (the same 32px
// median-line-height cutoff Step 1.3 already established for the PP-OCR
// upscale rule) -- a wordmark or a front-panel headline is much taller,
// and a short caption (net weight, pack count) never runs more than a
// couple of lines. MIN_RUN_LINES is the floor for something worth calling
// a declaration; below that the run is far too likely to be an ordinary
// short caption rather than a real ingredients paragraph.
const SMALL_TEXT_MAX_HEIGHT_PX = 32;
const MIN_RUN_LINES = 3;
// Same "two ingredients is the floor" convention MIN_ITEMS and
// extractIngredients' own comma-count check already apply -- a real
// ingredients declaration is comma-separated; a benefits/properties
// section (real bug found on LXIR Shilajit STICK VF IRN19-1.pdf: "Vrishya
// (Aphrodisiac)", "Vajikar (Enhances Vigor and Vitality)" -- real,
// correctly-read text, just the wrong panel) is a run of short standalone
// phrases with no comma-list shape at all. Generic (a structural count,
// not a specific word or brand), so it doesn't reintroduce the hardcoding
// this project's own ground rules ban.
const MIN_RUN_COMMAS = 2;

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function hasCommaListShape(run: readonly OcrLineLike[]): boolean {
  const commaCount = run.reduce((count, ln) => count + (ln.text.match(/,/g)?.length ?? 0), 0);
  return commaCount >= MIN_RUN_COMMAS;
}

/**
 * Finds the ingredients panel from OCR line geometry alone -- the
 * no-anchor fallback for a label with no PDF text layer at all (a scanned
 * or production-proof image, most of this client's real intake). Groups
 * lines into columns by X-overlap, then within each column finds the
 * longest continuous run of small-print lines (a large vertical gap or a
 * large-print line breaks the run) that also has comma-list shape -- the
 * two properties together are what a real ingredients declaration has
 * that nothing else on a label does; length alone isn't enough (see
 * MIN_RUN_COMMAS's own comment). Returns null when no run reaches
 * MIN_RUN_LINES with that shape; a short or non-list-shaped run is too
 * easily an unrelated caption or benefits section to trust.
 */
export function findIngredientsPanelFromLines(lines: readonly OcrLineLike[]): IngredientsPanelMatch | null {
  if (lines.length === 0) return null;

  const sorted = [...lines].sort((a, b) => a.box.x0 - b.box.x0);
  const columns: OcrLineLike[][] = [];
  for (const ln of sorted) {
    const column = columns.find((c) => c.some((l) => rangesOverlap(l.box.x0, l.box.x1, ln.box.x0, ln.box.x1)));
    if (column) column.push(ln);
    else columns.push([ln]);
  }

  const considerAsBest = (candidate: OcrLineLike[], current: OcrLineLike[]): OcrLineLike[] =>
    candidate.length > current.length && hasCommaListShape(candidate) ? candidate : current;

  let bestRun: OcrLineLike[] = [];
  for (const column of columns) {
    const byY = [...column].sort((a, b) => a.box.y0 - b.box.y0);
    let current: OcrLineLike[] = [];
    for (const ln of byY) {
      const height = ln.box.y1 - ln.box.y0;
      const isSmall = height > 0 && height <= SMALL_TEXT_MAX_HEIGHT_PX;
      const prev = current[current.length - 1];
      const gapOk = !prev || ln.box.y0 - prev.box.y1 <= height * 3;
      if (isSmall && gapOk) {
        current.push(ln);
      } else {
        bestRun = considerAsBest(current, bestRun);
        current = isSmall ? [ln] : [];
      }
    }
    bestRun = considerAsBest(current, bestRun);
  }

  if (bestRun.length < MIN_RUN_LINES) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ln of bestRun) {
    minX = Math.min(minX, ln.box.x0);
    minY = Math.min(minY, ln.box.y0);
    maxX = Math.max(maxX, ln.box.x1);
    maxY = Math.max(maxY, ln.box.y1);
  }
  return {
    box: { left: minX, top: minY, width: maxX - minX, height: maxY - minY },
    corroborationText: bestRun.map((l) => l.text).join(' ')
  };
}

function normalizeForCorroboration(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Whether an item the VLM returned is backed up, whole-phrase, by
 * something a real, independent reader (PP-OCR or the PDF's own text
 * layer) actually saw in the same panel -- the grounding gate the
 * original directive's Step 4.1 spec requires. Normalizes case,
 * whitespace and punctuation before comparing (a real OCR read of the
 * same crop can differ from the VLM's own transcription in trivial
 * formatting -- "[INS 440]" vs "(INS 440)" -- without that difference
 * meaning the item is fabricated), but still requires the FULL phrase to
 * appear with word boundaries on both ends, so a longer, unprinted item
 * is never waved through merely because a shorter real ingredient's name
 * happens to be a substring of it.
 */
export function isCorroboratedWholePhrase(item: string, corroborationText: string): boolean {
  const normalizedItem = normalizeForCorroboration(item);
  if (!normalizedItem) return false;
  const normalizedCorroboration = normalizeForCorroboration(corroborationText);
  const pattern = new RegExp(`\\b${normalizedItem}\\b`);
  return pattern.test(normalizedCorroboration);
}

const CROP_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'string' } }
  },
  required: ['items']
};

const CROP_PROMPT =
  "This is a crop of a food-supplement label's Ingredients declaration. Transcribe EVERY ingredient exactly as printed, as separate entries -- split on commas the same way the label itself lists them. Do not include percentages, footnote markers, or introductory words like \"Ingredients:\". Use the items array.";

// A real ingredient name is never empty, never sentence-length (a model
// padding an "item" with marketing prose or a whole sentence is a real
// failure mode a closed schema alone doesn't prevent), and always has at
// least one letter (a pure number or punctuation fragment is never a real
// ingredient on any label).
const MAX_ITEM_LENGTH = 100;
const HAS_LETTER = /[a-zA-Z]/;
const MAX_ITEMS = 60;
// Two ingredients is the floor for something worth calling a declaration
// -- the same floor extractIngredients (labelSemanticExtractor.service.ts)
// itself applies to the text-layer path.
const MIN_ITEMS = 2;

function isPlausibleIngredientItem(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ITEM_LENGTH && HAS_LETTER.test(trimmed);
}

// A crop doesn't need prepareImage()'s fixed-1008px-width treatment --
// that transform exists for a WHOLE PAGE, and forcing a crop down to the
// same width would throw away exactly the resolution this feature exists
// to keep. Only downscales if the crop is unusually large; a normal panel
// crop passes through untouched. Same convention as nutritionCropReader's
// own prepareCropImage.
const MAX_CROP_DIMENSION = 2000;

async function prepareCropImage(crop: Buffer): Promise<VlmImage> {
  const meta = await sharp(crop).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const scale = Math.min(1, MAX_CROP_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const resized =
    scale < 1
      ? await sharp(crop).resize({ width: targetWidth, height: targetHeight, fit: 'fill' }).png().toBuffer()
      : await sharp(crop).png().toBuffer();
  return {
    base64: resized.toString('base64'),
    sentWidth: targetWidth,
    sentHeight: targetHeight,
    originalWidth: width,
    originalHeight: height
  };
}

/**
 * Reads an ingredients declaration from a crop of the page image via the
 * VLM, grounded before being trusted: every item must be plausibly
 * shaped (isPlausibleIngredientItem) AND corroborated whole-phrase by the
 * panel's own independently-read text (isCorroboratedWholePhrase,
 * corroborationText). Returns null -- never an empty string, never a
 * throw -- when the crop, the VLM call, or too few items in the answer
 * don't hold up; the caller's own "still missing" check decides what to
 * do with that, same fail-soft contract as readNutritionTableFromCrop.
 */
export async function readIngredientsFromCrop(
  pageImage: Buffer,
  cropBox: CropBox,
  client: VlmClient,
  corroborationText: string
): Promise<string | null> {
  let image: VlmImage;
  try {
    const crop = await sharp(pageImage)
      .extract({
        left: Math.round(cropBox.left),
        top: Math.round(cropBox.top),
        width: Math.max(1, Math.round(cropBox.width)),
        height: Math.max(1, Math.round(cropBox.height))
      })
      .png()
      .toBuffer();
    image = await prepareCropImage(crop);
  } catch (error) {
    console.warn(
      '[ingredientsCropReader] Failed to crop the page image: ' + (error instanceof Error ? error.message : String(error))
    );
    return null;
  }

  const raw = await client.askJson(image, CROP_PROMPT, CROP_SCHEMA);
  if (typeof raw !== 'object' || raw === null) return null;

  const items = (raw as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;

  const plausible: string[] = [];
  let rejectedCount = 0;
  for (const item of items) {
    if (plausible.length >= MAX_ITEMS) break;
    if (!isPlausibleIngredientItem(item)) continue;
    if (!isCorroboratedWholePhrase(item, corroborationText)) {
      rejectedCount++;
      continue;
    }
    plausible.push(item.trim());
  }
  if (rejectedCount > 0) {
    console.warn(`[ingredientsCropReader] ${rejectedCount} item(s) rejected: not corroborated by the panel's own read`);
  }

  return plausible.length >= MIN_ITEMS ? plausible.join(', ') : null;
}
