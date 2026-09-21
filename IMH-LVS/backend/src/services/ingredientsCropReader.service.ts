// accuracy3 Step 4: a second crop-reader extension, following the exact
// pattern nutritionCropReader.service.ts already proved in production
// (accuracy2 Step 7) -- a whole-page VLM read is too low-resolution to
// read small print reliably; a real-resolution crop of just the panel
// reads it correctly, at no extra latency cost since a crop is a smaller
// image than the whole page despite its higher effective resolution.
//
// This is a LAST-RESORT side channel, same philosophy as every other
// recovery pass in this pipeline: only reached when extractIngredients
// and mergeIngredientsResults (the text-layer and OCR-text paths) both
// left ingredients empty, and only when the VLM is enabled. A crop read
// is still a model guess, not an OCR fact, so every item is grounded
// (isPlausibleIngredientItem) before it's trusted -- the same discipline
// isPlausibleNutritionRow already applies to nutrition rows.
//
// Deliberately span-based only, with no OCR-word/line fallback (unlike
// nutritionCropReader's two-path design): a nutrition panel has a
// distinctive multi-word vocabulary (Energy, Protein, Sodium, ...) that
// makes a >=3-anchor-word OCR fallback trustworthy on its own. An
// ingredients declaration has no such vocabulary -- just one heading word
// followed by a paragraph -- so a word-level OCR fallback would have to
// guess how many lines below the heading belong to the declaration, on a
// page where accuracy3 Step 2 already found a real case of two unrelated
// panels (an ingredients paragraph and an adjacent MRP/pricing column)
// sharing overlapping Y-coordinate ranges. Restricting this to the
// text-layer path avoids re-introducing that exact risk into crop
// geometry; a scanned-image label with no text layer at all simply keeps
// its existing (unchanged) behaviour.
import sharp from 'sharp';
import type { TextSpan } from './pdf.service';
import { segmentPanels } from './textLayerGeometry.service';
import { projectSpanToPixels } from './outlinedText.service';
import type { VlmClient, VlmImage } from './ollamaVlm.service';
import { INGREDIENTS_ANCHOR } from './labelSemanticExtractor.service';
import type { CropBox } from './nutritionCropReader.service';

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
): CropBox | null {
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
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
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
 * VLM, grounded before being trusted (see isPlausibleIngredientItem).
 * Returns null -- never an empty string, never a throw -- when the crop,
 * the VLM call, or too few items in the answer don't hold up; the
 * caller's own "still missing" check decides what to do with that, same
 * fail-soft contract as readNutritionTableFromCrop.
 */
export async function readIngredientsFromCrop(
  pageImage: Buffer,
  cropBox: CropBox,
  client: VlmClient
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
  for (const item of items) {
    if (plausible.length >= MAX_ITEMS) break;
    if (!isPlausibleIngredientItem(item)) continue;
    plausible.push(item.trim());
  }

  return plausible.length >= MIN_ITEMS ? plausible.join(', ') : null;
}
