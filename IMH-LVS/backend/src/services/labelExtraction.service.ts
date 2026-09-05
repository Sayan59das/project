// Label extraction — real OCR-based extraction using open-source Tesseract
// (via tesseract.js), with a safe blank-field fallback whenever the file
// can't be read or nothing can be confidently extracted. Nothing is ever
// invented here: every field is either read from the label or left "".
//
// Flow for a PDF:
//   1. Read the PDF's existing text layer (pdf.service).
//   2. Parse fields from it.
//   3. If the text layer is unusable OR any required field is still
//      missing, ALSO rasterize the page(s) and run OCR — a PDF frequently
//      combines a real (but partial) text layer with a raster image or a
//      broken-font display-text block covering the brand/marketing-company
//      header, so "the text layer has enough characters" is not the same
//      as "the text layer has everything we need". The text layer and OCR
//      text are combined and re-parsed, so either source can supply an
//      anchor the other missed.
//   4. Per rasterized page, if brand/product name are still missing after
//      the primary OCR pass, a second pass with different preprocessing is
//      tried (see enhanceFieldsForImage); if marketing company/address are
//      still missing, a targeted region around a located anchor phrase is
//      re-OCR'd in isolation (see regionOcr.service.ts) — both are
//      escalations, only attempted when the simpler pass left something
//      out, so a label that already extracts cleanly never pays for them.
//   5. If OCR can't run (e.g. pdftoppm isn't installed) the text-layer
//      fields are kept rather than discarded — partial, honest data beats
//      none.
// Flow for an image: the same per-image enhancement pipeline (step 4)
// runs directly on the uploaded image.
//
// manufacturingCompany is never derived from OCR or the text layer — it is
// always the fixed constant.
//
// This module is the ONLY place that knows OCR is implemented with
// Tesseract; callers (labels.controller.ts) only see
// extractLabelFromFile() and the LabelExtractionResult shape, so swapping
// the underlying OCR engine later never touches the controller or the API
// response contract.
import fs from 'fs';
import { env } from '../config/env';
import { FIXED_MANUFACTURING_COMPANY } from '../config/constants';
import { extractPdfText, hasUsablePdfText, rasterizePdfPages } from './pdf.service';
import { preprocessForOcr, preprocessForOcrAlt } from './imagePreprocessing.service';
import { recognizePageWithWords } from './tesseract.service';
import { extractMarketingCompanyAndAddressFromRegion } from './regionOcr.service';
import { recoverProductTitleFromRegion, type OcrSource } from './titleRegionOcr.service';
import { recoverPackageSizeFromBadge } from './packageSizeOcr.service';
import { ExtractedLabelFields, extractLabelFields, isGenericProductFormWord, setLabelFieldExtractorDebug } from './labelFieldExtractor.service';

setLabelFieldExtractorDebug(env.labelExtractionDebug);

export type LabelExtractionResult = {
  marketingCompany: string;
  address: string;
  fssaiNumber: string;
  email: string;
  customerCareNumber: string;
  brand: string;
  flavour: string;
  productName: string;
  packageSize: string;
  manufacturingCompany: string;
};

export function buildPlaceholderExtraction(): LabelExtractionResult {
  return {
    marketingCompany: '',
    address: '',
    fssaiNumber: '',
    email: '',
    customerCareNumber: '',
    brand: '',
    flavour: '',
    productName: '',
    packageSize: '',
    manufacturingCompany: FIXED_MANUFACTURING_COMPANY
  };
}

function debugLog(message: string): void {
  if (env.labelExtractionDebug) console.log(`[labelExtraction] ${message}`);
}

function toResult(fields: ExtractedLabelFields): LabelExtractionResult {
  return { ...fields, manufacturingCompany: FIXED_MANUFACTURING_COMPANY };
}

// True once every field this module is responsible for extracting has a
// value — used only to decide whether OCR augmentation is worth the extra
// time, not as a measure of correctness (a label may legitimately not
// print one of these fields at all). packageSize is deliberately excluded:
// many otherwise-fully-extractable labels simply won't state a "<N>
// Gummies"-style count in whatever text is already available, and that
// alone shouldn't be a reason to keep escalating to more expensive OCR
// passes on an already-complete label.
const CORE_FIELDS_FOR_COMPLETENESS: (keyof ExtractedLabelFields)[] = [
  'marketingCompany',
  'address',
  'fssaiNumber',
  'email',
  'customerCareNumber',
  'brand',
  'flavour',
  'productName'
];

function isComplete(fields: ExtractedLabelFields): boolean {
  return CORE_FIELDS_FOR_COMPLETENESS.every((key) => fields[key].trim().length > 0);
}

// A productName that's nothing but a generic product-form word ("Gummies",
// "Capsules", ...) doesn't actually identify the product — it's treated
// like an unset value here so a later, more complete pass (e.g. a
// rasterized page's OCR, run after an earlier pass already set this from a
// weaker source like the PDF's own text layer) can still improve it,
// rather than being permanently blocked by the ordinary "never overwrite a
// non-empty field" rule every other field follows.
function fillBlanks(fields: ExtractedLabelFields, patch: Partial<ExtractedLabelFields>): ExtractedLabelFields {
  const next = { ...fields };
  for (const key of Object.keys(patch) as (keyof ExtractedLabelFields)[]) {
    const value = patch[key];
    if (!value) continue;
    const isOverridableProductName = key === 'productName' && isGenericProductFormWord(next.productName);
    if (!next[key] || isOverridableProductName) next[key] = value;
  }
  return next;
}

// Runs the primary OCR pass over one image (a rasterized PDF page, or the
// uploaded image itself), then escalates — only as needed — with a second
// preprocessing pass for brand/product name and a targeted region re-OCR
// for marketing company/address. Returns the combined raw text (folded
// into the caller's running text for the other fields) and the fields
// parsed from everything gathered for this image.
async function ocrImageWithEnhancement(imageBuffer: Buffer, priorText: string): Promise<{ text: string; fields: ExtractedLabelFields }> {
  const primaryProcessed = await preprocessForOcr(imageBuffer);
  const { text: primaryText, words } = await recognizePageWithWords(primaryProcessed);

  let combinedText = [priorText, primaryText].filter((part) => part.trim().length > 0).join('\n');
  let fields = extractLabelFields(combinedText);

  // Tracks every pass's own (image, words) pairing for the title-region
  // escalation below. The brand can end up findable in ONE pass's word
  // positions but genuinely absent from another's (the two preprocessing
  // passes are tuned differently and don't always read the same text) — a
  // real case, not hypothetical, so both are kept and tried in turn rather
  // than only ever handing forward whichever pass ran last.
  const ocrSources: OcrSource[] = [{ image: primaryProcessed, words }];

  if (!fields.brand || !fields.productName) {
    debugLog('brand/productName missing after primary OCR pass — retrying with alternate preprocessing.');
    const altProcessed = await preprocessForOcrAlt(imageBuffer);
    const { text: altText, words: altWords } = await recognizePageWithWords(altProcessed);
    combinedText = [combinedText, altText].filter((part) => part.trim().length > 0).join('\n');
    fields = extractLabelFields(combinedText);
    ocrSources.push({ image: altProcessed, words: altWords });
  }

  if (!fields.marketingCompany || !fields.address) {
    debugLog('marketingCompany/address missing after full-page OCR — trying a targeted region re-OCR around a located anchor.');
    const regionFields = await extractMarketingCompanyAndAddressFromRegion(primaryProcessed, words);
    fields = fillBlanks(fields, regionFields);
  }

  // A product name that's still empty or just a single word, alongside a
  // brand that WAS found, is the same shape as a title graphic whose middle
  // line full-page OCR dropped entirely (a real product name is essentially
  // never a single word) — worth the extra targeted pass; a label with no
  // detected brand has no anchor to crop around, so this is skipped rather
  // than guessing at a region.
  const productNameWordCount = fields.productName.trim() ? fields.productName.trim().split(/\s+/).length : 0;
  if (fields.brand && productNameWordCount <= 1) {
    debugLog('productName still missing or a single word after full-page OCR — trying a targeted title-region re-OCR near the brand.');
    const recoveredTitle = await recoverProductTitleFromRegion(ocrSources, fields.brand, fields.productName);
    if (recoveredTitle) {
      debugLog(`productName: enriched to "${recoveredTitle}" via targeted title-region re-OCR.`);
      fields = { ...fields, productName: recoveredTitle };
    }
  }

  // A front-of-pack count badge (e.g. "30 GUMMIES" in a circular graphic)
  // is frequently read unevenly by general-purpose OCR — the product-form
  // word comes through fine while its bolder/differently-styled number is
  // dropped or misread, so the two never land on the same text line the
  // text-based extractor above needs. Only attempted when packageSize is
  // still missing, since this is a real escalation cost (a handful of
  // extra, deliberately narrow OCR passes at most).
  if (!fields.packageSize) {
    debugLog('packageSize still missing after full-page OCR — trying spatial/targeted front-badge recovery.');
    const recoveredPackageSize = await recoverPackageSizeFromBadge(ocrSources);
    if (recoveredPackageSize) {
      debugLog(`packageSize: enriched to "${recoveredPackageSize}" via front-badge recovery.`);
      fields = { ...fields, packageSize: recoveredPackageSize };
    }
  }

  return { text: combinedText, fields };
}

// Gathers the raw text for a PDF and parses it into fields, escalating to
// OCR (with the enhancement passes above, per rasterized page) when the
// text layer alone doesn't yield a complete result. Never throws — a
// rasterization/OCR failure just means the text-layer-only result
// (however complete) is kept.
async function extractFieldsFromPdf(pdfBuffer: Buffer): Promise<ExtractedLabelFields> {
  const { text: textLayerText } = await extractPdfText(pdfBuffer);
  debugLog(`PDF text layer (${textLayerText.length} chars):\n${textLayerText}`);

  const textLayerUsable = hasUsablePdfText(textLayerText);
  const textLayerFields = textLayerUsable ? extractLabelFields(textLayerText) : null;

  if (textLayerFields && isComplete(textLayerFields)) {
    return textLayerFields;
  }

  if (!textLayerUsable) {
    console.warn('[labelExtraction] PDF has no usable text layer — rasterizing pages for OCR.');
  } else {
    console.warn('[labelExtraction] PDF text layer is missing one or more fields — also rasterizing pages for OCR.');
  }

  const pageImages = await rasterizePdfPages(pdfBuffer);
  if (pageImages.length === 0) {
    console.warn('[labelExtraction] No pages could be rasterized for OCR — using text-layer result as-is.');
    return textLayerFields ?? extractLabelFields('');
  }

  let combinedText = textLayerText;
  let fields = textLayerFields ?? extractLabelFields('');
  for (const pageImage of pageImages) {
    if (isComplete(fields)) break;
    const result = await ocrImageWithEnhancement(pageImage, combinedText);
    combinedText = result.text;
    fields = fillBlanks(fields, result.fields);
  }
  debugLog(`Combined text after OCR (${combinedText.length} chars):\n${combinedText}`);

  return fields;
}

async function extractFieldsFromImage(imageBuffer: Buffer): Promise<ExtractedLabelFields> {
  const { text, fields } = await ocrImageWithEnhancement(imageBuffer, '');
  debugLog(`OCR text (${text.length} chars):\n${text}`);
  return fields;
}

// The real integration point: reads the uploaded label, runs it through the
// appropriate OCR path for its file type, parses the raw text into the
// label fields, and returns the same LabelExtractionResult shape the
// placeholder used — so labels.controller.ts and the API response contract
// never change based on which internal path ran. Falls back to
// buildPlaceholderExtraction() — never an exception, never a fabricated
// value — for any missing/corrupt file, unsupported type, or OCR failure.
export async function extractLabelFromFile(filePath: string, mimeType: string): Promise<LabelExtractionResult> {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    const fields =
      mimeType === 'application/pdf' ? await extractFieldsFromPdf(fileBuffer) : await extractFieldsFromImage(fileBuffer);

    debugLog(`Parsed fields: ${JSON.stringify(fields)}`);

    if (Object.values(fields).every((value) => !value.trim())) {
      console.warn('[labelExtraction] No fields could be confidently extracted from the uploaded file — returning blank fields.');
    }

    return toResult(fields);
  } catch (error) {
    console.error('[labelExtraction] Unexpected error during label extraction:', error instanceof Error ? error.message : error);
    return buildPlaceholderExtraction();
  }
}
