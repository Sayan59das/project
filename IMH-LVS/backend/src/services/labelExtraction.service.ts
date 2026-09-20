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
import sharp from 'sharp';
import { env } from '../config/env';
import { FIXED_MANUFACTURING_COMPANY } from '../config/constants';
import { extractPdfText, extractTextSpans, hasUsablePdfText, rasterizePdfPages, type TextSpan } from './pdf.service';
import { preprocessForOcr, preprocessForOcrAlt } from './imagePreprocessing.service';
import { recognizePageWithWords, type OcrWord } from './tesseract.service';
import { recognizeLines } from './paddleOcr.service';
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
  extractNutritionTableFormat,
  ALLERGEN_DIETARY_WORDS,
  type ClaimsResult
} from './labelSemanticExtractor.service';
import {
  segmentPanels,
  toReadingOrderText,
  extractNutritionTableFromPanels,
  extractNutritionTableFromOcrWords,
  medianFontSize
} from './textLayerGeometry.service';
import { projectSpanToPixels, findOutlinedLines, planOcrStrips, dropStripEdgeLines, dedupeOverlappingLines, type OcrLineLike } from './outlinedText.service';
import { isVlmEnabled, prepareImage, ollamaClient, type VlmImage, type VlmClient } from './ollamaVlm.service';
import { resolveDisplayRoles, type DisplayCandidateIn } from './displayRoleResolver.service';

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

  // Ranked display-text candidates (brand names, product titles, marketing
  // headers) recovered from the rasterized PDF page or image when the text
  // layer doesn't have them, as a JSON array of { text, heightPx, confidence },
  // ordered tallest first. '' when none are recovered or when the text layer
  // was complete so no rasterization occurred. Filled only for PDFs/images;
  // text-layer-only extractions leave it '' (fast path, no pixels).
  displayTextCandidates: string;
};

export type DisplayTextCandidate = {
  text: string;
  heightPx: number;
  confidence: number;
  topPx: number;
  occurrences: number;
};

/**
 * Step 2 (accuracy plan): every pass that can fill one of the nine
 * fillBlanks-cascade fields (marketingCompany, address, fssaiNumber, email,
 * customerCareNumber, brand, flavour, productName, packageSize — the ten
 * scalar identity/contact fields minus manufacturingCompany, which is a
 * fixed constant and never goes through this cascade). 'display-candidates'
 * has no producer yet in this file — reserved for a future non-VLM
 * candidate-picking heuristic (Step 5.6) so the type doesn't need to widen
 * again to add it.
 */
export type FieldSource =
  | 'text-layer-flattened'
  | 'text-layer-reading-order'
  | 'tesseract-full-page'
  | 'tesseract-region-ocr'
  | 'tesseract-title-region'
  | 'package-size-ocr'
  | 'display-candidates'
  | 'vlm-role-resolution'
  | 'vlm-fallback';

/**
 * Phase F (widened for Step 2): which pass produced this field's value, for
 * EVERY non-blank field among the nine above — not just the model-inferred
 * ones. A field absent from this map is blank in the result; nothing else
 * about a field can be inferred from its absence any more (Step 2 changes
 * this from "absent means read normally" to "absent means blank"), the same
 * "blank/absent means nothing to report" convention this file already uses
 * for discardedFields/unknownClaims.
 */
export type FieldMeta = {
  /** Which pass produced this value. */
  source: FieldSource;
  /** 0-1 when the resolver reports one (vlm-role-resolution always does); omitted everywhere else. */
  confidence?: number;
  /** True only for the two model-inferred sources — a value read straight off the label, however it was read, doesn't need a human's confirmation the way an inferred one does. */
  needsReview: boolean;
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

  /**
   * Phase F: which fields (keyed by their LabelExtractionResult name, e.g.
   * 'brand', 'productName') were inferred by a model rather than read off
   * the label, and so need a human's confirmation before being trusted.
   * See FieldMeta's own doc comment for the absence convention.
   */
  fieldMeta: Record<string, FieldMeta>;
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
    nutritionTable: '',
    displayTextCandidates: ''
  };
}

function debugLog(message: string): void {
  if (env.labelExtractionDebug) console.log(`[labelExtraction] ${message}`);
}

function toResult(fields: ExtractedLabelFields, extended: ExtendedFields): LabelExtractionResult {
  return { ...fields, manufacturingCompany: FIXED_MANUFACTURING_COMPANY, ...extended.values };
}

// Real bug found by dumping one real label's actual text both ways
// (Cal. Vit D IRN120-2.pdf): the geometry-based reading-order text (used
// as claims' primary source because it generally respects visual layout
// better) can scramble a badge cluster that sits spatially close to an
// unrelated block — a "NO GELATIN NO GLUTEN NO MILK..." allergen row
// next to the nutrition table ends up with "NO" landing on one
// nutrition-table line and "GELATIN" on a completely different one,
// losing the claim entirely — while the plain flattened text-layer text
// keeps the same badge cluster together and finds it correctly. Rather
// than pick a winner (reading-order text is still better for OTHER
// labels, which is why it stayed primary), extracting from both and
// taking the union recovers a real claim whichever text preserves it,
// with no added fabrication risk: every claim-shape matcher already
// gates on a narrow, generic word list regardless of which text
// surfaced the match, so a claim found either way is still a claim
// really printed on the label.
export function mergeClaimsResults(primary: ClaimsResult, secondaryText: string | undefined, knownClaims: readonly string[]): ClaimsResult {
  if (!secondaryText) return primary;
  const secondary = extractClaims(secondaryText, knownClaims);

  const merged = new Map<string, string>(); // lowercase -> canonical casing, primary wins ties
  for (const claim of primary.claims.split(' | ')) {
    if (claim) merged.set(claim.toLowerCase(), claim);
  }
  for (const claim of secondary.claims.split(' | ')) {
    if (claim && !merged.has(claim.toLowerCase())) merged.set(claim.toLowerCase(), claim);
  }

  const matchedLower = new Set([...primary.matched, ...secondary.matched].map((claim) => claim.toLowerCase()));
  const mergedClaims = [...merged.values()];
  return {
    claims: mergedClaims.join(' | '),
    matched: mergedClaims.filter((claim) => matchedLower.has(claim.toLowerCase())),
    unmatched: mergedClaims.filter((claim) => !matchedLower.has(claim.toLowerCase()))
  };
}

type ExtendedFields = {
  values: Pick<LabelExtractionResult, 'colourTheme' | 'claims' | 'ingredients' | 'nutritionTableFormat' | 'nutritionTable' | 'displayTextCandidates'>;
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
 *
 * `displayTextCandidates` is ranked display-text candidates (brand names, product
 * titles) recovered from the rasterized page or image when the text layer doesn't
 * have them. Filled when OCR runs, absent when the text layer was complete.
 */
async function extractExtendedFields(
  text: string,
  pageImage: Buffer | undefined,
  knownClaims: readonly string[],
  nutritionTable?: Record<string, string>,
  displayTextCandidates?: DisplayTextCandidate[],
  flattenedText?: string
): Promise<ExtendedFields> {
  const claims = mergeClaimsResults(extractClaims(text, knownClaims), flattenedText, knownClaims);

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
      nutritionTable: nutritionTable && Object.keys(nutritionTable).length ? JSON.stringify(nutritionTable) : '',
      // displayTextCandidates is filled from display text recovered from the rasterized
      // page or image; stringified when present, '' when none.
      displayTextCandidates: displayTextCandidates && displayTextCandidates.length ? JSON.stringify(displayTextCandidates) : ''
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

// A label's nutrition panel is sometimes baked into the artwork as an image
// with no real text in the PDF's own text layer at all — the text-layer
// geometry pass (extractNutritionTableFromPanels) then always returns {}
// for that label, no matter how complete every OTHER field is. Used to
// decide whether OCR is still worth running even when every scalar field
// already has a value, and to decide whether to keep giving the nutrition
// OCR fallback another page's worth of tries.
function hasNutritionTable(table: Record<string, string> | undefined): boolean {
  return !!table && Object.keys(table).length > 0;
}

// A productName that's nothing but a generic product-form word ("Gummies",
// "Capsules", ...) doesn't actually identify the product — it's treated
// like an unset value here so a later, more complete pass (e.g. a
// rasterized page's OCR, run after an earlier pass already set this from a
// weaker source like the PDF's own text layer) can still improve it,
// rather than being permanently blocked by the ordinary "never overwrite a
// non-empty field" rule every other field follows.
/**
 * Tags every non-blank field in `fields` with `source` — for the base pass
 * of a cascade stage (the first fields object a stage produces, before any
 * fillBlanks patch is merged on top of it), since fillBlanks itself only
 * tags fields it actually MOVES from blank to filled, and the very first
 * assignment in a stage needs its own tagging call to be covered at all.
 */
export function tagFilledFields(fields: Partial<ExtractedLabelFields>, source: FieldSource): Record<string, FieldMeta> {
  const meta: Record<string, FieldMeta> = {};
  const needsReview = source === 'vlm-role-resolution' || source === 'vlm-fallback';
  for (const key of Object.keys(fields) as (keyof ExtractedLabelFields)[]) {
    if (fields[key]) meta[key] = { source, needsReview };
  }
  return meta;
}

// Step 2: fillBlanks is the single choke point every extraction pass goes
// through to merge its answer into the running result, so it is also the
// single place that records provenance. patchMeta supplies the FieldMeta
// for whichever keys `patch` may fill — built via tagFilledFields for a
// single-source patch (the common case), or passed through unchanged when
// merging an already-tagged multi-source fields object (e.g. one image's
// whole OCR pass, which may itself contain several different sources'
// fields). Only keys fillBlanks actually moves from blank to filled get a
// meta entry — a field patch offers but that the existing value wins over
// keeps its old entry, exactly mirroring which value survives in `fields`.
export function fillBlanks(
  fields: ExtractedLabelFields,
  patch: Partial<ExtractedLabelFields>,
  patchMeta: Record<string, FieldMeta>,
  meta: Record<string, FieldMeta> = {}
): { fields: ExtractedLabelFields; meta: Record<string, FieldMeta> } {
  const next = { ...fields };
  const nextMeta = { ...meta };
  for (const key of Object.keys(patch) as (keyof ExtractedLabelFields)[]) {
    const value = patch[key];
    if (!value) continue;
    const isOverridableProductName = key === 'productName' && isGenericProductFormWord(next.productName);
    if (!next[key] || isOverridableProductName) {
      next[key] = value;
      if (patchMeta[key]) nextMeta[key] = patchMeta[key];
    }
  }
  return { fields: next, meta: nextMeta };
}

// Convenience wrapper for the common case: a patch that is entirely from
// one named source, so its per-field meta is just that source applied to
// every key the patch actually sets.
export function fillBlanksFrom(
  fields: ExtractedLabelFields,
  patch: Partial<ExtractedLabelFields>,
  source: FieldSource,
  meta: Record<string, FieldMeta> = {}
): { fields: ExtractedLabelFields; meta: Record<string, FieldMeta> } {
  return fillBlanks(fields, patch, tagFilledFields(patch, source), meta);
}

// Extract fields from a PDF's text layer using geometry-based text processing.
// This helper is shared between extractFieldsFromPdf and extractLabelFromTextLayerOnly
// to avoid duplication of the text-layer extraction pipeline.
//
// WHY flattened text is primary, not the reading-order text: the flattened text
// (pdf.js's own item order via extractPdfText) is the tested baseline every fixture
// in labels.extract.test.ts was written against. The reading-order text from
// toReadingOrderText is geometry-aware and gets some things the flattened text
// can't (multi-column layouts read in the wrong order in the flattened text), but
// it also joins same-baseline cells that carry different semantic roles — e.g. on
// the Sharp Mind Plus label, the title "Sharp Mind Plus" and the description text
// "An Ayurvedic..." share a baseline and land on one reading-order line, so the
// regex extractor returns the fused "Sharp Mind Plus Gummies An Ayurvedic" instead
// of the correct "Sharp Mind Plus" the flattened text gives directly. So the
// flattened pass runs first and the reading-order pass only fills what it left
// blank, via fillBlanks — additive, never overriding a value the flattened text
// already found. This should flip once a broader (60-label) scoreboard shows the
// reading-order text winning more often than it costs; until then, treat it as a
// second opinion, not the primary source.
//
// Returns reading-order text (respects layout, used downstream for claims/
// ingredients extraction), extracted fields (flattened text primary, reading-order
// text fills blanks), and nutrition table from geometry structure (Task 5).
async function extractFieldsFromTextLayer(
  pdfBuffer: Buffer,
  textLayerText: string,
  knownFlavours: readonly string[]
): Promise<{
  orderedText: string;
  fields: ExtractedLabelFields;
  nutritionTable?: Record<string, string>;
  spans: TextSpan[];
  fieldMeta: Record<string, FieldMeta>;
}> {
  let orderedText = textLayerText;
  let fields = extractLabelFields(textLayerText, { knownFlavours });
  let fieldMeta = tagFilledFields(fields, 'text-layer-flattened');
  let nutritionTable: Record<string, string> | undefined;
  let spans: TextSpan[] = [];

  try {
    spans = await extractTextSpans(pdfBuffer);
    if (spans.length > 0) {
      const panels = segmentPanels(spans);
      orderedText = toReadingOrderText(spans);

      debugLog(`Reading-order text (${orderedText.length} chars):\n${orderedText}`);

      // Flattened text is primary (see WHY comment above); reading-order text is
      // the patch that fills whatever the flattened pass left blank.
      const flattenedFields = extractLabelFields(textLayerText, { knownFlavours });
      const orderedFields = extractLabelFields(orderedText, { knownFlavours });

      // Blank brand/productName on EITHER pass if they look like OCR garbage
      // before fillBlanks — symmetric treatment, so garbage from one pass never
      // blocks a genuine value from the other, and garbage never survives into
      // the merged result even when both passes agree on it. Post-processing
      // would blank it anyway, but only after OCR has already run (or been
      // skipped for being "complete"), so it's blanked here first.
      const cleanedFlattenedFields = { ...flattenedFields };
      const cleanedOrderedFields = { ...orderedFields };
      for (const field of ['brand', 'productName'] as const) {
        if (cleanedFlattenedFields[field] && looksLikeOcrGarbage(cleanedFlattenedFields[field])) {
          debugLog(`${field} looks like garbage in flattened text: "${cleanedFlattenedFields[field]}" — blanking before fillBlanks`);
          cleanedFlattenedFields[field] = '';
        }
        if (cleanedOrderedFields[field] && looksLikeOcrGarbage(cleanedOrderedFields[field])) {
          debugLog(`${field} looks like garbage in ordered text: "${cleanedOrderedFields[field]}" — blanking before fillBlanks`);
          cleanedOrderedFields[field] = '';
        }
      }

      const flattenedMeta = tagFilledFields(cleanedFlattenedFields, 'text-layer-flattened');
      const merged = fillBlanksFrom(cleanedFlattenedFields, cleanedOrderedFields, 'text-layer-reading-order', flattenedMeta);
      fields = merged.fields;
      fieldMeta = merged.meta;

      // Extract nutrition table from the geometry structure (Task 5)
      const extractedTable = extractNutritionTableFromPanels(panels);
      if (Object.keys(extractedTable).length > 0) {
        nutritionTable = extractedTable;
      }
    }
  } catch (error) {
    debugLog(`Failed to extract text spans: ${error instanceof Error ? error.message : error}. Continuing with flattened text.`);
  }

  return { orderedText, fields, nutritionTable, spans, fieldMeta };
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
): Promise<{ text: string; fields: ExtractedLabelFields; fieldMeta: Record<string, FieldMeta>; words: OcrWord[] }> {
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

  // Whatever the primary (+ alt, if it ran) full-page OCR pass resolved,
  // tagged as one source — the two preprocessing passes are concatenated
  // into one text blob and re-parsed together (see above), so there's no
  // clean per-field split between "primary found this" and "alt found
  // this"; both are the same kind of pass (general-purpose full-page OCR),
  // just with different preprocessing.
  let fieldMeta = tagFilledFields(fields, 'tesseract-full-page');

  if (!fields.marketingCompany || !fields.address) {
    debugLog('marketingCompany/address missing after full-page OCR — trying a targeted region re-OCR around a located anchor.');
    const regionFields = await extractMarketingCompanyAndAddressFromRegion(primaryProcessed, words);
    const merged = fillBlanksFrom(fields, regionFields, 'tesseract-region-ocr', fieldMeta);
    fields = merged.fields;
    fieldMeta = merged.meta;
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
      // Unconditional overwrite, not a fillBlanks merge: this pass runs
      // precisely when productName is blank OR a single word (checked
      // above), and a single non-generic word is still worth replacing
      // with a full recovered title — fillBlanks's blank-or-generic-word
      // guard would keep a genuine single-word productName untouched,
      // which would silently change this pass's behaviour.
      fields = { ...fields, productName: recoveredTitle };
      fieldMeta = { ...fieldMeta, productName: { source: 'tesseract-title-region', needsReview: false } };
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
      const merged = fillBlanksFrom(fields, { packageSize: recoveredPackageSize }, 'package-size-ocr', fieldMeta);
      fields = merged.fields;
      fieldMeta = merged.meta;
    }
  }

  return { text: combinedText, fields, fieldMeta, words };
}

// A side-channel nutrition-table recovery path for a PDF whose scalar fields
// are already complete from the text layer, so the full, multi-stage OCR
// enhancement pass (ocrImageWithEnhancement) isn't worth its risk: that
// pass's title-region and other escalations can overwrite an already-
// correct-but-generic-looking productName/brand with a wrong OCR guess —
// a real regression measured when nutrition-table recovery was first tried
// by simply forcing every incomplete-nutrition label through the full pass.
// This calls only the plain word-level OCR primitive and never touches
// `fields`, so a scalar field this pass already got right cannot regress.
// Stops at the first page that yields a non-empty table; never throws.
async function recoverNutritionTableViaOcr(pdfBuffer: Buffer): Promise<Record<string, string> | undefined> {
  try {
    const pageImages = await rasterizePdfPages(pdfBuffer);
    for (const pageImage of pageImages) {
      const { words } = await recognizePageWithWords(pageImage);
      const table = extractNutritionTableFromOcrWords(words);
      if (hasNutritionTable(table)) return table;
    }
    return undefined;
  } catch (error) {
    debugLog(`Nutrition-table OCR side-channel failed: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
}

// A side-channel brand/productName recovery path, same shape and same
// reason as recoverNutritionTableViaOcr just above: a PDF whose scalar
// fields are ALL non-empty (isComplete is true — it only checks for SOME
// value, not a trustworthy one) still takes the fast path even when
// brand or productName holds a value nameFieldMissing recognises as
// untrustworthy (an allergen callout, a bare measurement, OCR debris) —
// real client labels whose actual brand is a logo-only graphic with no
// readable text anywhere fall into exactly this trap, and the full,
// multi-stage OCR enhancement pass is not worth running just to reach
// the one narrow VLM step that could fix it. Calls only that narrow
// step (recoverDisplayTextCandidates + resolveBlankDisplayRoles, which
// already only ever touches brand/productName) directly, so every OTHER
// field this pass already got right is exactly as safe as it was for
// the nutrition-table side-channel.
async function recoverNamesViaVlm(
  pdfBuffer: Buffer,
  fields: ExtractedLabelFields,
  fieldMeta: Record<string, FieldMeta>,
  spans: readonly TextSpan[]
): Promise<{ fields: ExtractedLabelFields; fieldMeta: Record<string, FieldMeta> }> {
  try {
    const pageImages = await rasterizePdfPages(pdfBuffer, { maxPages: 1 });
    if (pageImages.length === 0) return { fields, fieldMeta };
    const displayTextCandidates = await recoverDisplayTextCandidates(pageImages[0], spans, env.pdfRasterDpi);
    if (displayTextCandidates.length === 0) return { fields, fieldMeta };
    const resolved = await resolveBlankDisplayRoles(fields, pageImages[0], displayTextCandidates);
    return { fields: resolved.fields, fieldMeta: { ...fieldMeta, ...resolved.fieldMeta } };
  } catch (error) {
    debugLog(`Name recovery via VLM side-channel failed: ${error instanceof Error ? error.message : error}`);
    return { fields, fieldMeta };
  }
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
  /** Display-text candidates recovered from rasterized page or image when text layer is incomplete. Empty on the text-layer fast path. */
  displayTextCandidates?: DisplayTextCandidate[];
  /** Phase F: fields this pass filled via VLM role-resolution rather than a direct read. Undefined when that step never ran. */
  fieldMeta?: Record<string, FieldMeta>;
  /**
   * The PDF's own flattened text-layer text (before any geometry-based
   * reordering), when one exists. `text` above is normally BETTER for
   * claims/ingredients (it respects visual layout the flattened version
   * doesn't) — but a real, confirmed case (Cal. Vit D IRN120-2.pdf) shows
   * the geometry-based panel reconstruction can scramble a badge cluster
   * that sits close to an unrelated block (a "NO GELATIN NO GLUTEN..."
   * allergen badge row next to the nutrition table) into two different,
   * unrelated lines, while the plain flattened text keeps them together
   * correctly. Kept alongside `text`, not instead of it, so claims
   * extraction can check both and take the union — safe because a claim
   * found either way is still a claim really on the label, and the
   * allergen/dietary word allowlists already gate against fabrication
   * regardless of which text surfaced the match.
   */
  flattenedText?: string;
};

// Recovery helper for display-text candidates: outlined text detected on the
// rasterized page after OCR's primary pass. When the text layer is incomplete
// (missing brand or product name), we rasterize and OCR the page. This helper
// then looks for the outlined/stylised display text that branded headers are
// typically rendered in — the same text OCR often mangles — by running paddle
// OCR on vertical strips (text-layer panels + silent gaps) and filtering to
// outlined lines. Strip-wise OCR prevents the detector from merging same-baseline
// text across neighbouring panels, which would hide the front panel's display text.
// Returns top 8 ranked by height, since brand graphics are typically the
// largest text on the page.
async function recoverDisplayTextCandidates(
  pageImage: Buffer,
  spans: readonly TextSpan[],
  dpi: number
): Promise<DisplayTextCandidate[]> {
  try {
    // Compute image metadata once
    const metadata = await sharp(pageImage).metadata();
    const pageHeightPt = metadata.height! / (dpi / 72);
    const width = metadata.width!;

    // Identify which text spans are "covered" by the geometry layer, so we can
    // focus on text regions not already in the text layer.
    let spanRects: ReturnType<typeof projectSpanToPixels>[] = [];
    if (spans.length > 0) {
      // Project only first page's spans to pixel rectangles
      spanRects = spans
        .filter((s) => s.page === 1)
        .map((s) => projectSpanToPixels(s, pageHeightPt, dpi));
    }

    // Compute panel X ranges from text-layer geometry (rotation-0 only)
    const page1Spans = spans.filter((s) => s.page === 1);
    let panelXRanges: Array<{ left: number; right: number }> = [];

    if (page1Spans.length > 0) {
      const panels = segmentPanels(page1Spans);
      const s = dpi / 72;

      // Filter to rotation-0 panels and extract their X ranges
      for (const panel of panels) {
        if (Math.abs(panel.rotation) < 0.01) {
          let minX = Infinity;
          let maxX = -Infinity;

          for (const line of panel.lines) {
            for (const span of line.spans) {
              minX = Math.min(minX, span.x);
              maxX = Math.max(maxX, span.x + span.width);
            }
          }

          if (minX !== Infinity && maxX !== -Infinity) {
            panelXRanges.push({
              left: minX * s,
              right: maxX * s
            });
          }
        }
      }
    }

    // Compute padding: 40px or 1.5 * median font size, whichever is larger
    const s = dpi / 72;
    const medianFontSizeVal = page1Spans.length > 0 ? medianFontSize(page1Spans) : 0;
    const padPx = Math.max(40, Math.round(1.5 * medianFontSizeVal * s));

    // Plan OCR strips (panels + gaps)
    const strips = planOcrStrips(panelXRanges, width, padPx);

    // OCR each strip and collect all lines
    const allLines: OcrLineLike[] = [];

    for (const strip of strips) {
      try {
        const crop = await sharp(pageImage).extract({
          left: Math.round(strip.left),
          top: 0,
          width: Math.round(strip.width),
          height: Math.round(metadata.height!)
        }).png().toBuffer();

        const lines = await recognizeLines(crop);

        // Drop lines cut by the strip boundary (fragment removal)
        const trimmedLines = dropStripEdgeLines(lines, strip, width);

        // Offset every box by +strip.left on x
        for (const line of trimmedLines) {
          allLines.push({
            text: line.text,
            box: {
              x0: line.box.x0 + strip.left,
              y0: line.box.y0,
              x1: line.box.x1 + strip.left,
              y1: line.box.y1
            },
            confidence: line.confidence
          });
        }
      } catch (stripError) {
        // Strip OCR failure is fail-soft; continue with other strips
        debugLog(`OCR strip [${strip.left}, ${strip.left + strip.width}) failed: ${
          stripError instanceof Error ? stripError.message : String(stripError)
        }`);
      }
    }

    // Dedupe: two lines whose boxes have IoU > 0.7 are one line read by two
    // overlapping strips (the padding) → keep the higher-confidence read.
    const deduped = dedupeOverlappingLines(allLines);

    // Compute occurrence count before filtering: across all collected lines (after strip-edge
    // filtering, before findOutlinedLines), how many times does each normalized text appear?
    // WHY: on die lines, a wordmark repeats on every panel (Homeo-Vita ×5, Nutrinol ×3);
    // that repetition count is the best brand signal available and is otherwise discarded.
    const occurrenceMap = new Map<string, number>();
    for (const line of deduped) {
      const normalized = line.text.toLowerCase().replace(/\s+/g, ' ').trim();
      occurrenceMap.set(normalized, (occurrenceMap.get(normalized) ?? 0) + 1);
    }

    // Filter to outlined lines: those that survived the segmentation logic
    // (high confidence, consistent box structure, etc.)
    const outlined = findOutlinedLines(deduped, spanRects);

    // Return top 10 by height, with heights and confidence rounded for readability.
    // Fragment removal plus headroom for two-line product names (e.g. "Sharp\nMind Plus").
    return outlined.slice(0, 10).map((l) => {
      const normalized = l.text.toLowerCase().replace(/\s+/g, ' ').trim();
      return {
        text: l.text,
        heightPx: Math.round(l.box.y1 - l.box.y0),
        confidence: Math.round(l.confidence * 100) / 100,
        topPx: Math.round(l.box.y0),
        occurrences: occurrenceMap.get(normalized) ?? 0
      };
    });
  } catch (error) {
    console.warn(
      '[labelExtraction] display-text candidate recovery failed: ' +
        (error instanceof Error ? error.message : String(error))
    );
    return [];
  }
}

// A bare measurement/dimension value — never a brand name, but a real
// wrong guess seen on several client labels (a die-line/print-spec
// dimension nearby getting picked up instead of the brand).
const MEASUREMENT_VALUE_PATTERN = /^\d+(\.\d+)?\s*(mm|cm|m|ml|l|g|kg|mg|mcg|iu|in|inch(es)?)\.?$/i;

// True when `value`, stripped of "free"/"no" (the allergen-claim shape
// words), is made ENTIRELY of terms from the same generic allergen/
// dietary vocabulary claims extraction uses — never a brand name, but a
// real wrong guess this project's own extractor makes on several client
// labels whose real brand is a stylised logo with no readable text at
// all: with nothing better nearby, it falls back to whatever nearby real
// word it CAN read, and an allergen callout ("Gelatin", "Gelatin Free",
// "Gluten") is exactly the kind of large, isolated, badge-style text a
// title-block heuristic can mistake for a name. Only whole-value matches
// count — a real brand that merely CONTAINS one of these words (e.g. a
// name built from an ingredient word) is a different, much larger risk
// this check deliberately does not take (see the reverted Step 5.6
// blanket-gate attempt this project already tried once).
function looksLikeAllergenCallout(value: string): boolean {
  const words = value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== 'free' && word !== 'no');
  if (words.length === 0) return false;
  return words.every((word) => ALLERGEN_DIETARY_WORDS.has(word.replace(/[^a-z]/g, '')));
}

// Blank, filled with what the report stage will scrub as OCR debris
// anyway, a bare measurement, or an allergen callout — none of these are
// ever a real brand/product name, so treating them the same as blank
// here is what gives the recovery passes below (targeted OCR, VLM
// display-role resolution) a chance to find the real one instead of a
// wrong-but-non-empty guess silently blocking them forever.
// A small, unambiguous print-production/pre-press vocabulary — real
// wrong guesses seen on several client labels' "VF" (die-line/vector-
// file proof) variants specifically: "Cmyk", "Matt Uv", and (from the
// same real diff run) "Bottom Dia Colour Cmyk", "Process Color Convert
// To Pantone Client File Color", "Emboss I Gr". These files are
// pre-press production proofs, not finished consumer artwork, so
// print-spec callouts sit right where a title-block heuristic looks for
// a prominent front-of-pack name. Unlike the allergen-word check above,
// this is a CONTAINS match, not "entirely composed of" — a real brand
// or product name containing "cmyk" or "pantone" is not a real risk
// this vocabulary needs to guard against the way "milk" or "soy"
// legitimately could be part of one. Deliberately does NOT include a
// bare "uv" on its own — this client's own catalog already has a real
// claim ("Blue Light Protection") in the same UV/light-protection
// marketing space, so a bare "uv" match risks excluding a genuine
// future "UV Protection" brand/product name; only kept for the specific
// print-finish compound terms, which carry no such risk.
const PRINT_PRODUCTION_TERM = /\b(cmyk|pantone|die[\s-]?line|dieline|emboss|spot\s*uv|matt\s*uv|gloss\s*uv|foil\s*(stamp|separation)?|varnish|colou?r\s*separation|die[\s-]?cut|process\s*colou?r)\b/i;

export function nameFieldMissing(value: string): boolean {
  if (!value) return true;
  if (looksLikeOcrGarbage(value)) return true;
  if (MEASUREMENT_VALUE_PATTERN.test(value.trim())) return true;
  if (looksLikeAllergenCallout(value)) return true;
  if (PRINT_PRODUCTION_TERM.test(value)) return true;
  return false;
}

// Resolve blank brand/productName fields using VLM classification of display-text candidates.
// Returns the fields unchanged if VLM is disabled, no candidates, or both fields already filled.
// If resolution succeeds with confidence >= 0.6, fills blanks using fillBlanks;
// otherwise returns fields unchanged. Wrapped in try/catch for fail-soft extraction.
async function resolveBlankDisplayRoles(
  fields: ExtractedLabelFields,
  pageImage: Buffer,
  candidates: DisplayTextCandidate[]
): Promise<{ fields: ExtractedLabelFields; fieldMeta: Record<string, FieldMeta> }> {
  // A field holding OCR debris ("Mc Mc Mg") is blank for our purposes: the
  // report stage scrubs it anyway (looksLikeOcrGarbage), and if it is still
  // there when fillBlanks runs, the model's grounded answer is thrown away
  // in favour of the debris. Unicare lost "MULTIVITAMIN GUMMIES" exactly so.
  const brandMissing = nameFieldMissing(fields.brand);
  const productMissing = nameFieldMissing(fields.productName);
  if (!isVlmEnabled() || candidates.length === 0 || (!brandMissing && !productMissing)) {
    return { fields, fieldMeta: {} };
  }

  try {
    const image = await prepareImage(pageImage);
    debugLog(`VLM display-role candidates: ${JSON.stringify(candidates)}`);
    const roles = await resolveDisplayRoles(image, candidates, ollamaClient);
    debugLog(`VLM display-role answer: ${JSON.stringify(roles)}`);

    // No roles or confidence below threshold — return unchanged
    if (!roles || roles.confidence < 0.6) {
      return { fields, fieldMeta: {} };
    }

    // Fill blanks with resolved brand/productName, ignoring empty patch values.
    // Debris is cleared first so a grounded answer can replace it.
    const base = {
      ...fields,
      brand: brandMissing ? '' : fields.brand,
      productName: productMissing ? '' : fields.productName
    };
    const filled = fillBlanksFrom(base, { brand: roles.brand, productName: roles.productName }, 'vlm-role-resolution').fields;

    // Phase F: an inferred value, however confident, is not the same trust
    // level as a value read straight off the label — only flag the fields
    // fillBlanks actually changed (base was blank, filled is not), not
    // every field this resolver was allowed to touch.
    const fieldMeta: Record<string, FieldMeta> = {};
    for (const field of ['brand', 'productName'] as const) {
      if (!base[field] && filled[field]) {
        fieldMeta[field] = { source: 'vlm-role-resolution', confidence: roles.confidence, needsReview: true };
      }
    }

    return { fields: filled, fieldMeta };
  } catch (error) {
    console.warn(
      '[labelExtraction] VLM display-role resolution failed: ' +
        (error instanceof Error ? error.message : String(error))
    );
    // Fail-soft: return fields unchanged
    return { fields, fieldMeta: {} };
  }
}

async function extractFieldsFromPdf(pdfBuffer: Buffer, knownFlavours: readonly string[]): Promise<FieldPass> {
  const { text: textLayerText } = await extractPdfText(pdfBuffer);
  debugLog(`PDF text layer (${textLayerText.length} chars):\n${textLayerText}`);

  const textLayerUsable = hasUsablePdfText(textLayerText);

  // Attempt to extract structured text spans and use reading-order text when available
  let orderedText = textLayerText;
  let textLayerFields = textLayerUsable ? extractLabelFields(textLayerText, { knownFlavours }) : null;
  let textLayerFieldMeta: Record<string, FieldMeta> = textLayerFields ? tagFilledFields(textLayerFields, 'text-layer-flattened') : {};
  let nutritionTable: Record<string, string> | undefined;
  let spans: TextSpan[] = [];

  if (textLayerUsable) {
    const result = await extractFieldsFromTextLayer(pdfBuffer, textLayerText, knownFlavours);
    orderedText = result.orderedText;
    textLayerFields = result.fields;
    textLayerFieldMeta = result.fieldMeta;
    nutritionTable = result.nutritionTable;
    spans = result.spans;
  }

  if (textLayerFields && isComplete(textLayerFields)) {
    // Fast path: every scalar field is already resolved from the text layer,
    // so the expensive, multi-stage OCR enhancement pass (which exists to
    // recover WEAK scalar fields, and in doing so can overwrite a generic-
    // looking-but-correct productName with a wrong OCR guess) is not worth
    // the risk here. Two narrow, side-channel exceptions, each touching
    // only its own field(s) and never the rest: nutrition_table if still
    // empty, and brand/productName if nameFieldMissing judges the current
    // value untrustworthy (isComplete only checked for SOME value, not a
    // good one) — real client labels whose brand is a logo-only graphic
    // fall into exactly that gap otherwise, permanently, since isComplete
    // being true is exactly what keeps this whole label off the full OCR
    // path where the AI model would normally get a chance to fix it.
    const recoveredNutrition = hasNutritionTable(nutritionTable) ? nutritionTable : await recoverNutritionTableViaOcr(pdfBuffer);
    const namesNeedRecovery = nameFieldMissing(textLayerFields.brand) || nameFieldMissing(textLayerFields.productName);
    const recoveredNames = namesNeedRecovery
      ? await recoverNamesViaVlm(pdfBuffer, textLayerFields, textLayerFieldMeta, spans)
      : { fields: textLayerFields, fieldMeta: textLayerFieldMeta };
    return {
      fields: recoveredNames.fields,
      text: orderedText,
      pageImages: [],
      nutritionTable: recoveredNutrition,
      fieldMeta: recoveredNames.fieldMeta,
      flattenedText: textLayerText
    };
  }

  if (!textLayerUsable) {
    console.warn('[labelExtraction] PDF has no usable text layer — rasterizing pages for OCR.');
  } else {
    console.warn('[labelExtraction] PDF text layer is missing one or more fields — also rasterizing pages for OCR.');
  }

  const pageImages = await rasterizePdfPages(pdfBuffer);
  if (pageImages.length === 0) {
    console.warn('[labelExtraction] No pages could be rasterized for OCR — using text-layer result as-is.');
    return {
      fields: textLayerFields ?? extractLabelFields('', { knownFlavours }),
      text: orderedText,
      pageImages: [],
      nutritionTable,
      fieldMeta: textLayerFieldMeta,
      flattenedText: textLayerText
    };
  }

  // Use flattened text (not reading-order text) as priorText for OCR. The reading-order
  // text respects the visual layout better for field extraction, but OCR's title-region
  // recovery and other targeted passes work better with the flattened text's simpler
  // structure. The returned combinedText will be used for semantic extraction (claims,
  // ingredients, etc.), so we swap back to reading-order text for better structure.
  let combinedText = textLayerText;
  let fields = textLayerFields ?? extractLabelFields('', { knownFlavours });
  let fieldMeta = textLayerFieldMeta;
  for (const pageImage of pageImages) {
    if (isComplete(fields)) break;
    const result = await ocrImageWithEnhancement(pageImage, combinedText, knownFlavours);
    combinedText = result.text;
    // Raw fillBlanks, not fillBlanksFrom: result.fieldMeta already carries
    // fine-grained per-field sources from within this one image's OCR pass
    // (full-page vs. region vs. title-region vs. package-size), and merging
    // it straight through preserves that instead of collapsing it to one tag.
    const merged = fillBlanks(fields, result.fields, result.fieldMeta, fieldMeta);
    fields = merged.fields;
    fieldMeta = merged.meta;

    // Nutrition table has no text-layer equivalent of fillBlanks (it isn't
    // one of ExtractedLabelFields) — first non-empty OCR page wins, same
    // "don't overwrite a value that's already there" rule as everything
    // else in this pipeline.
    if (!hasNutritionTable(nutritionTable)) {
      const ocrNutrition = extractNutritionTableFromOcrWords(result.words);
      if (hasNutritionTable(ocrNutrition)) {
        nutritionTable = ocrNutrition;
      }
    }
  }
  debugLog(`Combined text after OCR (${combinedText.length} chars):\n${combinedText}`);

  // For semantic extraction (claims, ingredients), use reading-order text from the geometry
  // as the primary source, falling back to OCR-augmented text. This respects the visual
  // layout while still getting the OCR improvements for missing fields.
  const finalText = [orderedText, combinedText].filter((t) => t.trim().length > 0).join('\n');

  // After the OCR loop, if brand or product name are still missing, recover display-text
  // candidates from the first rasterized page to surface candidate brand/product titles
  // that OCR couldn't reliably extract but are visibly rendered.
  let displayTextCandidates: DisplayTextCandidate[] | undefined;
  if ((nameFieldMissing(fields.brand) || nameFieldMissing(fields.productName)) && pageImages.length > 0) {
    displayTextCandidates = await recoverDisplayTextCandidates(pageImages[0], spans, env.pdfRasterDpi);
    // Resolve blank display roles using VLM classification if available
    if (displayTextCandidates) {
      const resolved = await resolveBlankDisplayRoles(fields, pageImages[0], displayTextCandidates);
      fields = resolved.fields;
      // vlm-role-resolution may have cleared then refilled a field that
      // held OCR garbage under an earlier tag (resolveBlankDisplayRoles
      // treats garbage as blank) — its entry, spread last, correctly wins
      // over the stale OCR tag for exactly the fields it touched.
      fieldMeta = { ...fieldMeta, ...resolved.fieldMeta };
    }
  }

  return { fields, text: finalText, pageImages, nutritionTable, displayTextCandidates, fieldMeta, flattenedText: textLayerText };
}

async function extractFieldsFromImage(imageBuffer: Buffer, knownFlavours: readonly string[]): Promise<FieldPass> {
  const ocrResult = await ocrImageWithEnhancement(imageBuffer, '', knownFlavours);
  let { fields } = ocrResult;
  const { text } = ocrResult;
  let fieldMeta = ocrResult.fieldMeta;
  debugLog(`OCR text (${text.length} chars):\n${text}`);
  // The upload IS the page image, so colour reads straight off it.

  // No PDF text layer at all for a direct image upload — this is the only
  // pass that will ever see this label's nutrition panel.
  const nutritionTable = extractNutritionTableFromOcrWords(ocrResult.words);

  // For image uploads, if brand or product name are still missing after OCR,
  // recover display-text candidates. No spans from text layer, so pass empty array.
  let displayTextCandidates: DisplayTextCandidate[] | undefined;
  if (nameFieldMissing(fields.brand) || nameFieldMissing(fields.productName)) {
    displayTextCandidates = await recoverDisplayTextCandidates(imageBuffer, [], env.pdfRasterDpi);
    // Resolve blank display roles using VLM classification if available
    if (displayTextCandidates) {
      const resolved = await resolveBlankDisplayRoles(fields, imageBuffer, displayTextCandidates);
      fields = resolved.fields;
      fieldMeta = { ...fieldMeta, ...resolved.fieldMeta };
    }
  }

  return { fields, text, pageImages: [imageBuffer], nutritionTable, displayTextCandidates, fieldMeta };
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
): Promise<{ result: LabelExtractionResult; discardedFields: string[]; fieldMeta: Record<string, FieldMeta> }> {
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
  // brand/productName are the two fields a wrong-but-non-empty guess is known
  // to squat on (see nameFieldMissing's own comment for the vocabulary of
  // things that are never a name). Every earlier recovery pass already treats
  // such a value as blank; telling the model's fallback the same thing is what
  // stops '12.00 mm' from permanently blocking a correct brand name.
  const overwritable = (['brand', 'productName'] as const).filter((field) =>
    nameFieldMissing(scrubbed[field])
  );

  const ai = await applyAiFallback(scrubbed, { buffer: fileBuffer, mimeType, isPdf }, overwritable);
  if (ai.filled.length > 0) {
    console.warn(
      `[labelExtraction] Filled from the vision model rather than the label's own text: ${ai.filled.join(', ')}. ` +
        'These values were inferred, not read.'
    );
  }

  // Phase F: every field the legacy vision-model fallback filled is an
  // inference, not a read, same as a VLM role-resolution fill — flag it the
  // same way. This fallback has no per-field confidence to report (unlike
  // resolveDisplayRoles), so confidence is simply omitted here.
  const aiFieldMeta: Record<string, FieldMeta> = {};
  for (const field of ai.filled) {
    aiFieldMeta[field] = { source: 'vlm-fallback', needsReview: true };
  }

  return { result: ai.result, discardedFields: blanked, fieldMeta: aiFieldMeta };
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
    let nutritionTable: Record<string, string> | undefined;

    if (textLayerUsable) {
      const result = await extractFieldsFromTextLayer(pdfBuffer, textLayerText, knownFlavours);
      text = result.orderedText;
      fields = result.fields;
      nutritionTable = result.nutritionTable;
    } else {
      // No usable text layer; return blank fields
      fields = extractLabelFields('', { knownFlavours });
    }

    debugLog(`Parsed fields: ${JSON.stringify(fields)}`);

    // Extract extended fields without a page image (text layer only, no colour)
    const extended = await extractExtendedFields(text, undefined, knownClaims, nutritionTable, undefined, textLayerText);
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

    const extended = await extractExtendedFields(
      pass.text,
      pageImage,
      knownClaims,
      pass.nutritionTable,
      pass.displayTextCandidates,
      pass.flattenedText
    );
    const result = toResult(pass.fields, extended);

    // Post-process the result: placeholder scrubbing, garbage detection, AI fallback
    const { result: postProcessed, discardedFields, fieldMeta: aiFieldMeta } = await postProcessExtractionResult(
      result,
      fileBuffer,
      mimeType,
      isPdf
    );

    // Merge Phase F provenance from both sources: the whole read-and-resolve
    // cascade (pass.fieldMeta, now tagging every one of the nine
    // fillBlanks-cascade fields it filled, not just VLM ones — Step 2) and
    // the legacy vision-fallback (aiFieldMeta, set just above, covering
    // whichever fields IT filled — a disjoint field set from the rest in
    // practice, but a discarded-then-refilled field could in principle
    // appear in both; the fallback runs last, so its entry wins for such a
    // field, matching which value actually ended up in the result.
    //
    // Filtered against the FINAL post-processed result, not just merged:
    // placeholder scrubbing and the OCR-garbage check above can blank a
    // field after pass.fieldMeta already tagged it (e.g. a text-layer read
    // that turns out to be artwork-template scaffolding) — an entry for a
    // field that is blank in the end would be a source claim for a value
    // that no longer exists, so it's dropped here rather than trusted.
    const mergedMeta: Record<string, FieldMeta> = { ...pass.fieldMeta, ...aiFieldMeta };
    const fieldMeta: Record<string, FieldMeta> = {};
    for (const [field, entry] of Object.entries(mergedMeta)) {
      const finalValue = postProcessed[field as keyof LabelExtractionResult];
      if (typeof finalValue === 'string' && finalValue) fieldMeta[field] = entry;
    }

    return { result: postProcessed, unknownClaims: extended.unknownClaims, discardedFields, fieldMeta };
  } catch (error) {
    console.error('[labelExtraction] Unexpected error during label extraction:', error instanceof Error ? error.message : error);
    return { result: buildPlaceholderExtraction(), unknownClaims: [], discardedFields: [], fieldMeta: {} };
  }
}
