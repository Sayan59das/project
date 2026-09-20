// Step 7 of the accuracy2 plan, turned from a design diagnostic
// (eval/STEP7_CROP_DIAGNOSTIC.md) into a real feature.
//
// WHY THIS EXISTS: prepareImage() (ollamaVlm.service.ts) sends every VLM
// image at a fixed 1008px page width, regardless of content -- fine for
// reading a large wordmark, too small to read a nutrition panel's small
// print. Confirmed directly on a real client label (Dr. Chewitals Vision
// IRN13-1.pdf, whose nutrition panel has NO PDF text layer at all -- baked
// into the artwork as an image): asked to read the whole page at 1008px,
// the model produced a plausible-looking but almost entirely WRONG table
// (a fabricated "Calcium 10 mg" row that isn't on the label at all, every
// real value off). The SAME model, given a real-resolution crop of just
// the panel, read all 13 rows correctly -- at no extra latency cost, since
// a crop is a smaller image than the whole page despite its higher
// effective resolution. See STEP7_CROP_DIAGNOSTIC.md for the full writeup.
//
// This is a LAST-RESORT side channel, same philosophy as
// recoverNutritionTableViaOcr / recoverBodyTextViaPpOcr: only reached when
// the text layer, Tesseract, and PP-OCR body-text passes all left
// nutrition_table empty, and only when the VLM is enabled. A crop read is
// still a model guess, not an OCR fact, so every row is grounded the same
// way every other source in this pipeline already is (see
// isPlausibleNutritionRow) before it's trusted.
import sharp from 'sharp';
import type { TextSpan } from './pdf.service';
import { segmentPanels } from './textLayerGeometry.service';
import { projectSpanToPixels } from './outlinedText.service';
import type { OcrWord } from './tesseract.service';
import type { VlmClient, VlmImage } from './ollamaVlm.service';

export type CropBox = { left: number; top: number; width: number; height: number };

const NUTRITION_HEADER = /\bnutrition(al)?\s+(information|facts|values?|table)\b/i;

/**
 * Finds the nutrition panel's real pixel bounding box from the PDF's own
 * text layer, when it has one for this panel. Exact -- no OCR guessing.
 * Returns null when no panel's lines match the nutrition-header phrase
 * (the label's panel may be baked into the artwork as an image instead --
 * see findNutritionPanelFromWords for that case).
 */
export function findNutritionPanelFromSpans(
  spans: readonly TextSpan[],
  pageHeightPt: number,
  dpi: number
): CropBox | null {
  if (spans.length === 0) return null;
  const panels = segmentPanels(spans);
  const panel = panels.find((p) => p.lines.some((l) => NUTRITION_HEADER.test(l.text)));
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
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

// A small, generic nutrient-name vocabulary -- industry-standard terms any
// nutrition panel might declare, same "not built from one client's
// products" discipline as ALLERGEN_DIETARY_WORDS in
// labelSemanticExtractor.service.ts. Used only to ANCHOR a crop region,
// never to invent a value -- the actual read still comes from the VLM,
// grounded by isPlausibleNutritionRow below.
const NUTRIENT_ANCHOR_WORDS =
  /^(energy|protein|proteins|fat|fats|carbohydrates?|sugars?|sodium|calcium|iron|vitamin|zinc|dietary|fiber|fibre|omega|lutein|zeaxanthin|astaxanthin|kcal|magnesium|potassium|iodine|folate|biotin|niacin|choline|inositol|cholesterol)$/i;

/**
 * Finds the nutrition panel's pixel bounding box from real OCR word boxes
 * -- the fallback for the common real case (confirmed on an actual client
 * label) where the panel is baked into the artwork as an image, so the PDF
 * text layer has nothing for it at all. Requires >= 3 anchor hits before
 * trusting the region at all -- one or two nutrient-shaped words are too
 * easily ordinary label prose (a "Vitamin C" callout elsewhere on the
 * front panel, say), not a real table. Widens right of the anchors'
 * cluster for the value column the anchor words (the name column) don't
 * themselves cover.
 */
export function findNutritionPanelFromWords(
  words: readonly OcrWord[],
  pageWidth: number,
  pageHeight: number
): CropBox | null {
  const anchors = words.filter((w) => NUTRIENT_ANCHOR_WORDS.test(w.text.trim()));
  if (anchors.length < 3) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of anchors) {
    minX = Math.min(minX, w.bbox.x0);
    minY = Math.min(minY, w.bbox.y0);
    maxX = Math.max(maxX, w.bbox.x1);
    maxY = Math.max(maxY, w.bbox.y1);
  }
  const widenedMaxX = Math.min(pageWidth, maxX + (maxX - minX) * 1.2);
  const top = Math.max(0, minY - 40);
  const bottom = Math.min(pageHeight, maxY + 40);
  return { left: minX, top, width: widenedMaxX - minX, height: bottom - top };
}

/** Pads a crop box on every side, clamped to the page's own bounds. */
export function padCropBox(box: CropBox, pad: number, pageWidth: number, pageHeight: number): CropBox {
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const right = Math.min(pageWidth, box.left + box.width + pad);
  const bottom = Math.min(pageHeight, box.top + box.height + pad);
  return { left, top, width: right - left, height: bottom - top };
}

const CROP_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, value: { type: 'string' } },
        required: ['name', 'value']
      }
    }
  },
  required: ['rows']
};

const CROP_PROMPT =
  "This is a crop of a food-supplement label's Nutrition Information panel. Transcribe EVERY row exactly as printed: the nutrient name and its printed amount (with unit), one entry per row. Ignore %RDA/%DV columns. Use the rows array.";

// The same value-shape check extractNutritionTableFromPanels already
// applies to every OTHER source (text layer, Tesseract, PP-OCR) -- a
// genuine nutrition row's value starts with a number (an optional
// comparison operator first); a name is never empty and never
// sentence-length (a model padding a "row" with marketing prose or a
// footnote is a real failure mode a closed schema alone doesn't prevent).
const VALUE_STARTS_WITH_NUMBER = /^[<>≤≥~]?\s*\d/;
const MAX_NAME_LENGTH = 80;

function isPlausibleNutritionRow(name: unknown, value: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    name.trim().length <= MAX_NAME_LENGTH &&
    typeof value === 'string' &&
    VALUE_STARTS_WITH_NUMBER.test(value.trim())
  );
}

// A crop doesn't need prepareImage()'s fixed-1008px-width treatment --
// that transform exists for a WHOLE PAGE, and forcing a crop down to the
// same width would throw away exactly the resolution this feature exists
// to keep (the diagnostic's own crop was ~1974px wide and read perfectly).
// Only downscales if the crop is unusually large; a normal panel crop
// passes through untouched.
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
 * Reads a nutrition table from a crop of the page image via the VLM,
 * grounded before being trusted (see isPlausibleNutritionRow). Returns
 * null -- never an empty object, never a throw -- when the crop, the VLM
 * call, or every row in the answer doesn't hold up; the caller's own
 * "still missing" check decides what to do with that, same fail-soft
 * contract as every other recovery pass in this pipeline.
 */
export async function readNutritionTableFromCrop(
  pageImage: Buffer,
  cropBox: CropBox,
  client: VlmClient
): Promise<Record<string, string> | null> {
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
      '[nutritionCropReader] Failed to crop the page image: ' + (error instanceof Error ? error.message : String(error))
    );
    return null;
  }

  const raw = await client.askJson(image, CROP_PROMPT, CROP_SCHEMA);
  if (typeof raw !== 'object' || raw === null) return null;

  const rows = (raw as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) return null;

  const table: Record<string, string> = {};
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const { name, value } = row as Record<string, unknown>;
    if (!isPlausibleNutritionRow(name, value)) continue;
    const trimmedName = name.trim();
    // Repeated name keeps its first value -- same convention as
    // extractNutritionTableFromPanels.
    if (!(trimmedName in table)) table[trimmedName] = (value as string).trim();
  }
  return Object.keys(table).length > 0 ? table : null;
}
