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
import { extractPdfText, extractTextSpans, hasUsablePdfText, rasterizePdfPages } from './pdf.service';
import { preprocessForOcr, preprocessForOcrAlt } from './imagePreprocessing.service';
import { recognizePageWithWords } from './tesseract.service';
import { extractMarketingCompanyAndAddressFromRegion } from './regionOcr.service';
import { recoverProductTitleFromRegion, type OcrSource } from './titleRegionOcr.service';
import { recoverPackageSizeFromBadge } from './packageSizeOcr.service';
import { ExtractedLabelFields, extractLabelFields, isGenericProductFormWord, setLabelFieldExtractorDebug } from './labelFieldExtractor.service';
import { extractColourTheme } from './colourTheme.service';
import { looksLikeOcrGarbage, scrubPlaceholders } from './placeholderText.service';
import { applyAiFallback } from './aiExtraction.service';
import {
  extractClaims,
  extractIngredients,
  extractNutritionTableFormat
} from './labelSemanticExtractor.service';
import { segmentPanels, rankDisplayLines, toReadingOrderText } from './textLayerGeometry.service';

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

  // Four of the six comparison parameters Tesseract's anchor/regex extraction
  // cannot reach. None of them uses a model: colourTheme counts pixels
  // (colourTheme.service), the other three read structure out of the text
  // already extracted (labelSemanticExtractor.service). '' is absence
  // throughout — the caller stores NULL and the comparison reports MISSING.
  //
  // Logo and Label Design / Layout are the two still outstanding. Both are
  // genuinely visual, and both want a same/different verdict between two
  // artworks rather than a description, so neither belongs in this shape.
  colourTheme: string;
  claims: string;
  ingredients: string;
  nutritionTableFormat: string;

  // The nutrition panel's actual rows (nutrient name -> amount+unit, e.g.
  // {"Vitamin C (as Ascorbic Acid)": "12 mg"}), JSON-encoded to keep this
  // type uniformly string-valued like every other field here. Tesseract has
  // no row-structure parser for a nutrition table — this stays '' from that
  // path, the same absence-is-blank convention as every other unread field
  // — and is only ever filled in via the AI backend's vision-model fallback
  // (see aiExtraction.service.ts), which already extracts this structure.
  // labelComparison.service.ts's compareNutritionTables() is what turns two
  // of these into a real per-nutrient CONFLICT/MATCH, rather than the
  // coarse nutritionTableFormat classification comparing as one string.
  nutritionTable: string;
};

/**
 * Claims found on the label that the Claims master has no record of.
 *
 * Returned alongside the result rather than folded into it: they ARE stored in
 * `claims` (a claim the label makes is on the label whether or not Masters
 * knows it, and dropping it would let two differently-claiming labels compare
 * as MATCH), but a Manager needs to be told which master records are missing.
 */
export type LabelExtractionReport = {
  result: LabelExtractionResult;
  unknownClaims: string[];

  /**
   * Fields that were read off the page successfully and then thrown away
   * because what was read is not a value.
   *
   * Two families end up here: artwork-template scaffolding ('Company Name &
   * Logo', 'Xxxxxxxxxxxxxxxx') and OCR debris from stylised display type
   * ('Mc Mc Mg'). They are listed together because the caller does the same
   * thing with both — the field is absent, and something WAS printed there.
   *
   * Surfaced rather than silently dropped: a file whose fields are mostly
   * discarded is either a blank template somebody uploaded by mistake or an
   * artwork whose display type did not survive OCR, and telling the operator
   * which fields those were is far more useful than a form of empty boxes with
   * no explanation.
   */
  discardedFields: string[];
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
    manufacturingCompany: FIXED_MANUFACTURING_COMPANY,
    colourTheme: '',
    claims: '',
    ingredients: '',
    nutritionTableFormat: '',
    nutritionTable: ''
  };
}

function debugLog(message: string): void {
  if (env.labelExtractionDebug) console.log(`[labelExtraction] ${message}`);
}

function toResult(fields: ExtractedLabelFields, extended: ExtendedFields): LabelExtractionResult {
  return { ...fields, manufacturingCompany: FIXED_MANUFACTURING_COMPANY, ...extended.values };
}

type ExtendedFields = {
  values: Pick<LabelExtractionResult, 'colourTheme' | 'claims' | 'ingredients' | 'nutritionTableFormat' | 'nutritionTable'>;
  unknownClaims: string[];
};

/**
 * The four extra parameters, from the text already extracted plus one page
 * image.
 *
 * `pageImage` is undefined when the label could not be rasterized — no poppler
 * on the host, a PDF that produced no pages. Colour is then absent rather than
 * guessed, which is the same answer the schema wants for anything unread, and
 * the three text-derived fields are unaffected.
 *
 * `nutritionTable` is the structured nutrition data parsed from the PDF's geometry.
 * It is filled by Task 5 from the text layer's structured layout; here we only
 * pass it through to the result.
 */
async function extractExtendedFields(
  text: string,
  pageImage: Buffer | undefined,
  knownClaims: readonly string[],
  nutritionTable?: Record<string, string>
): Promise<ExtendedFields> {
  const claims = extractClaims(text, knownClaims);

  let colourTheme = '';
  if (pageImage) {
    try {
      colourTheme = (await extractColourTheme(pageImage)).theme;
    } catch (error) {
      // A colour read that fails is one absent parameter, not a failed
      // extraction — the label's text fields are already in hand and throwing
      // here would discard them.
      console.warn(
        '[labelExtraction] Colour theme could not be read:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    values: {
      colourTheme,
      claims: claims.claims,
      ingredients: extractIngredients(text),
      nutritionTableFormat: extractNutritionTableFormat(text),
      // nutritionTable is filled from the PDF's geometry structure (Task 5) or
      // the AI backend's vision-model fallback. This function only stringifies
      // what was already extracted; never invents a value.
      nutritionTable: nutritionTable && Object.keys(nutritionTable).length ? JSON.stringify(nutritionTable) : ''
    },
    unknownClaims: claims.unmatched
  };
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
async function ocrImageWithEnhancement(
  imageBuffer: Buffer,
  priorText: string,
  knownFlavours: readonly string[]
): Promise<{ text: string; fields: ExtractedLabelFields }> {
  const primaryProcessed = await preprocessForOcr(imageBuffer);
  const { text: primaryText, words } = await recognizePageWithWords(primaryProcessed);

  let combinedText = [priorText, primaryText].filter((part) => part.trim().length > 0).join('\n');
  let fields = extractLabelFields(combinedText, { knownFlavours });

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
    fields = extractLabelFields(combinedText, { knownFlavours });
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
// Carries out the text and the rasterized pages alongside the fields, because
// the four extra parameters need both and re-deriving either would mean
// re-running the expensive part of this pipeline.
type FieldPass = {
  fields: ExtractedLabelFields;
  /** Text layer plus any OCR text, which is what the semantic extractors read. */
  text: string;
  /** Pages this pass happened to rasterize. Empty on the text-layer fast path. */
  pageImages: Buffer[];
  /** Nutrition table parsed from the PDF's geometry structure. Undefined until Task 5 fills it. */
  nutritionTable?: Record<string, string>;
};

async function extractFieldsFromPdf(pdfBuffer: Buffer, knownFlavours: readonly string[]): Promise<FieldPass> {
  const { text: textLayerText } = await extractPdfText(pdfBuffer);
  debugLog(`PDF text layer (${textLayerText.length} chars):\n${textLayerText}`);

  const textLayerUsable = hasUsablePdfText(textLayerText);

  // Attempt to extract structured text spans and use reading-order text when available
  let orderedText = textLayerText;
  let textLayerFields = textLayerUsable ? extractLabelFields(textLayerText, { knownFlavours }) : null;

  if (textLayerUsable) {
    try {
      const spans = await extractTextSpans(pdfBuffer);
      if (spans.length > 0) {
        // Use geometry-based text extraction for better field recovery. The reading-order
        // text is primary because it respects the document's visual layout; the flattened
        // text layer fills what it missed, as a fallback.
        const panels = segmentPanels(spans);
        const lines = panels.flatMap((p) => p.lines);
        orderedText = toReadingOrderText(spans);

        debugLog(`Reading-order text (${orderedText.length} chars):\n${orderedText}`);

        // Extract from reading-order text first, then use flattened text to fill blanks.
        const orderedFields = extractLabelFields(orderedText, { knownFlavours });
        textLayerFields = fillBlanks(orderedFields, extractLabelFields(textLayerText, { knownFlavours }));

        // Fill brand and productName from display text if still blank
        if (lines.length > 0) {
          const displayLines = rankDisplayLines(lines);
          if (displayLines.length > 0 && !textLayerFields.brand) {
            textLayerFields.brand = displayLines[0].text;
            debugLog(`brand filled from display text: "${displayLines[0].text}"`);
          }
          if (!textLayerFields.productName && displayLines.length > 0) {
            // Find the first display line that differs from brand and is not a generic form word
            const productLine = displayLines.find((line) =>
              line.text.toLowerCase() !== textLayerFields!.brand.toLowerCase() &&
              !isGenericProductFormWord(line.text)
            );
            if (productLine) {
              textLayerFields.productName = productLine.text;
              debugLog(`productName filled from display text: "${productLine.text}"`);
            }
          }
        }
      }
    } catch (error) {
      debugLog(`Failed to extract text spans: ${error instanceof Error ? error.message : error}. Continuing with flattened text.`);
    }
  }

  if (textLayerFields && isComplete(textLayerFields)) {
    // Fast path: nothing was rasterized, so pageImages is empty and the caller
    // rasterizes a single page itself if it still wants colour.
    return { fields: textLayerFields, text: orderedText, pageImages: [] };
  }

  if (!textLayerUsable) {
    console.warn('[labelExtraction] PDF has no usable text layer — rasterizing pages for OCR.');
  } else {
    console.warn('[labelExtraction] PDF text layer is missing one or more fields — also rasterizing pages for OCR.');
  }

  const pageImages = await rasterizePdfPages(pdfBuffer);
  if (pageImages.length === 0) {
    console.warn('[labelExtraction] No pages could be rasterized for OCR — using text-layer result as-is.');
    return { fields: textLayerFields ?? extractLabelFields('', { knownFlavours }), text: orderedText, pageImages: [] };
  }

  let combinedText = orderedText;
  let fields = textLayerFields ?? extractLabelFields('', { knownFlavours });
  for (const pageImage of pageImages) {
    if (isComplete(fields)) break;
    const result = await ocrImageWithEnhancement(pageImage, combinedText, knownFlavours);
    combinedText = result.text;
    fields = fillBlanks(fields, result.fields);
  }
  debugLog(`Combined text after OCR (${combinedText.length} chars):\n${combinedText}`);

  return { fields, text: combinedText, pageImages };
}

async function extractFieldsFromImage(imageBuffer: Buffer, knownFlavours: readonly string[]): Promise<FieldPass> {
  const { text, fields } = await ocrImageWithEnhancement(imageBuffer, '', knownFlavours);
  debugLog(`OCR text (${text.length} chars):\n${text}`);
  // The upload IS the page image, so colour reads straight off it.
  return { fields, text, pageImages: [imageBuffer] };
}

// Shared post-processing for extraction results: placeholder scrubbing, garbage
// detection, AI fallback, and field validation. Extracted into a helper so both
// extractLabelReportFromFile and extractLabelFromTextLayerOnly share the same
// pipeline without duplication.
async function postProcessExtractionResult(
  result: LabelExtractionResult,
  fileBuffer: Buffer,
  mimeType: string,
  isPdf: boolean
): Promise<{ result: LabelExtractionResult; discardedFields: string[] }> {
  // Placeholder scrubbing is first, over the raw result, so it applies uniformly
  // across all sources.
  const { fields: scrubbed, blanked } = scrubPlaceholders(result);

  // Only the two name-shaped fields are judged for OCR debris. An address or
  // an ingredients list legitimately contains runs of short tokens, so the
  // same rule there would delete real content.
  for (const field of ['brand', 'productName'] as const) {
    if (scrubbed[field] !== '' && looksLikeOcrGarbage(scrubbed[field])) {
      console.warn(
        `[labelExtraction] Discarded "${scrubbed[field]}" for ${field} — reads as OCR debris from ` +
          'stylised display type rather than a name.'
      );
      scrubbed[field] = '';
      blanked.push(field);
    }
  }
  if (blanked.length > 0) {
    console.warn(
      `[labelExtraction] Discarded artwork-template placeholder text for: ${blanked.join(', ')}. ` +
        'This file may be a blank template rather than a finished label.'
    );
  }

  // The vision model runs last, over the finished result, so it fills what is
  // still blank after every other path has had its turn, including the fields
  // the check above just blanked. Running it earlier would have it fill a field
  // that placeholder text was about to be removed from, and then scrub the
  // model's answer along with the placeholder.
  //
  // A no-op unless AI_EXTRACTION_URL is set, and never throws — see
  // aiExtraction.service.ts.
  const ai = await applyAiFallback(scrubbed, { buffer: fileBuffer, mimeType, isPdf });
  if (ai.filled.length > 0) {
    console.warn(
      `[labelExtraction] Filled from the vision model rather than the label's own text: ${ai.filled.join(', ')}. ` +
        'These values were inferred, not read.'
    );
  }

  return { result: ai.result, discardedFields: blanked };
}

/**
 * Extract label fields using ONLY the PDF's text layer geometry, without any
 * rasterization or OCR fallback. Used by Task 4's CLI to test the geometry-based
 * extraction path in isolation and verify it improves field recovery without
 * depending on external tools like poppler.
 *
 * Returns all-blank fields for PDFs with no usable text layer rather than
 * throwing, consistent with the overall extraction philosophy: absent data
 * beats a thrown error.
 */
export async function extractLabelFromTextLayerOnly(
  pdfBuffer: Buffer,
  knownFlavours: readonly string[] = [],
  knownClaims: readonly string[] = []
): Promise<LabelExtractionResult> {
  try {
    const { text: textLayerText } = await extractPdfText(pdfBuffer);
    debugLog(`PDF text layer (${textLayerText.length} chars):\n${textLayerText}`);

    const textLayerUsable = hasUsablePdfText(textLayerText);

    // Try the geometry-based extraction path; fall back to the flattened text
    // if spans are not available.
    let text = textLayerText;
    let fields: ExtractedLabelFields;

    if (textLayerUsable) {
      try {
        const spans = await extractTextSpans(pdfBuffer);
        if (spans.length > 0) {
          const panels = segmentPanels(spans);
          const lines = panels.flatMap((p) => p.lines);
          text = toReadingOrderText(spans);

          debugLog(`Reading-order text (${text.length} chars):\n${text}`);

          // Extract using reading-order text (primary), fill blanks from flattened text (fallback)
          const orderedFields = extractLabelFields(text, { knownFlavours });
          fields = fillBlanks(orderedFields, extractLabelFields(textLayerText, { knownFlavours }));

          // Fill brand/productName from display text if still blank
          if (lines.length > 0) {
            const displayLines = rankDisplayLines(lines);
            if (displayLines.length > 0 && !fields.brand) {
              fields.brand = displayLines[0].text;
              debugLog(`brand filled from display text: "${displayLines[0].text}"`);
            }
            if (!fields.productName && displayLines.length > 0) {
              const productLine = displayLines.find((line) =>
                line.text.toLowerCase() !== fields!.brand.toLowerCase() &&
                !isGenericProductFormWord(line.text)
              );
              if (productLine) {
                fields.productName = productLine.text;
                debugLog(`productName filled from display text: "${productLine.text}"`);
              }
            }
          }
        } else {
          // No spans extracted; fall back to flattened text
          fields = extractLabelFields(textLayerText, { knownFlavours });
        }
      } catch (error) {
        debugLog(`Failed to extract text spans: ${error instanceof Error ? error.message : error}. Using flattened text.`);
        fields = extractLabelFields(textLayerText, { knownFlavours });
      }
    } else {
      // No usable text layer; return blank fields
      fields = extractLabelFields('', { knownFlavours });
    }

    debugLog(`Parsed fields: ${JSON.stringify(fields)}`);

    // Extract extended fields without a page image (text layer only, no colour)
    const extended = await extractExtendedFields(text, undefined, knownClaims);
    const result = toResult(fields, extended);

    // Post-process the result: placeholder scrubbing, garbage detection, AI fallback
    const { result: postProcessed } = await postProcessExtractionResult(
      result,
      pdfBuffer,
      'application/pdf',
      true
    );

    return postProcessed;
  } catch (error) {
    console.error('[labelExtraction] Unexpected error in text-layer-only extraction:', error instanceof Error ? error.message : error);
    return buildPlaceholderExtraction();
  }
}

// The real integration point: reads the uploaded label, runs it through the
// appropriate OCR path for its file type, parses the raw text into the
// label fields, and returns the same LabelExtractionResult shape the
// placeholder used — so labels.controller.ts and the API response contract
// never change based on which internal path ran. Falls back to
// buildPlaceholderExtraction() — never an exception, never a fabricated
// value — for any missing/corrupt file, unsupported type, or OCR failure.
export async function extractLabelFromFile(
  filePath: string,
  mimeType: string,
  knownClaims: readonly string[] = [],
  knownFlavours: readonly string[] = []
): Promise<LabelExtractionResult> {
  return (await extractLabelReportFromFile(filePath, mimeType, knownClaims, knownFlavours)).result;
}

/**
 * The same extraction, plus the claims the Claims master does not know about.
 *
 * `knownClaims` and `knownFlavours` are passed in rather than read from the
 * database here, on purpose: this module stays stateless and works with no
 * DATABASE_URL at all (see src/db/pool.ts). A caller that has a database
 * supplies the masters; one that does not still gets every other field —
 * with badge claims recognised and all of them reported as unknown, and the
 * flavour field simply left blank rather than guessed (see
 * labelFieldExtractor.service.ts's own note on why it carries no built-in
 * flavour list).
 */
export async function extractLabelReportFromFile(
  filePath: string,
  mimeType: string,
  knownClaims: readonly string[] = [],
  knownFlavours: readonly string[] = []
): Promise<LabelExtractionReport> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const isPdf = mimeType === 'application/pdf';

    const pass = isPdf ? await extractFieldsFromPdf(fileBuffer, knownFlavours) : await extractFieldsFromImage(fileBuffer, knownFlavours);

    debugLog(`Parsed fields: ${JSON.stringify(pass.fields)}`);

    if (Object.values(pass.fields).every((value) => !value.trim())) {
      console.warn('[labelExtraction] No fields could be confidently extracted from the uploaded file — returning blank fields.');
    }

    // Colour is the one parameter that needs pixels rather than text, and the
    // PDF fast path (a text layer complete enough to skip OCR) never
    // rasterized anything. Do it here instead — best effort, because a host
    // without pdftoppm must still return the fields it did read. One absent
    // parameter is a MISSING for a reviewer to look at; a thrown error would
    // discard a complete text extraction over a colour swatch.
    let pageImage = pass.pageImages[0];
    if (!pageImage && isPdf) {
      try {
        // One page, at a resolution suited to counting colours rather than
        // reading text — the image is downsampled to 128px square anyway, so
        // rendering it at OCR resolution would burn seconds per label to
        // produce pixels that are immediately discarded.
        pageImage = (await rasterizePdfPages(fileBuffer, { dpi: 72, maxPages: 1 }))[0];
      } catch (error) {
        console.warn(
          '[labelExtraction] Could not rasterize a page for colour extraction:',
          error instanceof Error ? error.message : error
        );
      }
    }

    const extended = await extractExtendedFields(pass.text, pageImage, knownClaims, pass.nutritionTable);
    const result = toResult(pass.fields, extended);

    // Post-process the result: placeholder scrubbing, garbage detection, AI fallback
    const { result: postProcessed, discardedFields } = await postProcessExtractionResult(
      result,
      fileBuffer,
      mimeType,
      isPdf
    );

    return { result: postProcessed, unknownClaims: extended.unknownClaims, discardedFields };
  } catch (error) {
    console.error('[labelExtraction] Unexpected error during label extraction:', error instanceof Error ? error.message : error);
    return { result: buildPlaceholderExtraction(), unknownClaims: [], discardedFields: [] };
  }
}
