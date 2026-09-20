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
import { snapToMaster } from './masterSnap.service';
import { extractColourTheme } from './colourTheme.service';
import { looksLikeOcrGarbage, scrubPlaceholders } from './placeholderText.service';
import { applyAiFallback } from './aiExtraction.service';
import {
  extractClaims,
  extractIngredients,
  extractNutritionTableFormat,
  splitIngredientsList,
  findGenericShapeClaims,
  ALLERGEN_DIETARY_WORDS,
  type ClaimsResult
} from './labelSemanticExtractor.service';
import {
  segmentPanels,
  toReadingOrderText,
  extractNutritionTableFromPanels,
  extractNutritionTableFromOcrWords,
  extractNutritionTableFromPpOcrLines,
  medianFontSize
} from './textLayerGeometry.service';
import {
  projectSpanToPixels,
  findOutlinedLines,
  planOcrStrips,
  dropStripEdgeLines,
  dedupeOverlappingLines,
  medianLineHeight,
  mapRotatedBoxToPage,
  type OcrLineLike
} from './outlinedText.service';
import { createHash } from 'crypto';
import { isVlmEnabled, prepareImage, ollamaClient, type VlmImage, type VlmClient } from './ollamaVlm.service';
import {
  findNutritionPanelFromSpans,
  findNutritionPanelFromWords,
  padCropBox,
  readNutritionTableFromCrop
} from './nutritionCropReader.service';
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
  | 'vlm-fallback'
  | 'master-snap'
  // accuracy3 Step 1.6: PP-OCR as a first-class, separately-tagged source.
  // 'ppocr-nutrition' and 'ppocr-text' are both produced by
  // recoverBodyTextViaPpOcr's single scan (nutrition table vs. everything
  // else); kept as two source tags rather than one because the by-source
  // accuracy table (score.py) needs to be able to gate one off per-field
  // without gating the other -- a source can read a nutrition table well
  // and a scalar field badly, or vice versa. 'ppocr-crop' is reserved for
  // Step 4's crop-reader extension (vlm-read-ingredients/claims/identity);
  // no producer yet, same "reserve the tag before the widen" reasoning
  // 'display-candidates' above already used for Step 5.6.
  | 'ppocr-nutrition'
  | 'ppocr-text'
  | 'ppocr-crop';

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

  /**
   * accuracy3 Step 3: the same claims as `result.claims`, as a real array
   * rather than a ' | '-joined string. Lives on the report object, not on
   * LabelExtractionResult, so it doesn't touch EXTRACTION_RESULT_KEYS or
   * any compare-extracted fixture built against the existing shape. A
   * combined-badge claim (e.g. "Free From Gluten | Milk | Soy") can
   * contain a literal " | " in its own text, which `result.claims` alone
   * can't be told apart from three separately-joined claims by any
   * consumer that splits it back apart on that same delimiter (see
   * scripts/extract-pipeline.ts's own switch to this field for exactly
   * that reason).
   */
  claimsList: string[];
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
// accuracy3 Step 3.3: findGenericShapeClaims's own required corroboration
// -- a candidate is only trusted when the same claim (case-insensitively)
// is found by an independent extraction of BOTH texts this function
// already has in hand. This is the one place in the whole claims pipeline
// where two independently-derived texts are both available, so it's where
// the generic matcher's corroboration requirement is applied, not inside
// findGenericShapeClaims itself (which only ever sees one text at a time).
const GENERIC_CLAIMS_CAP = 12;

export function mergeClaimsResults(primary: ClaimsResult, primaryText: string, secondaryText: string | undefined, knownClaims: readonly string[]): ClaimsResult {
  // accuracy3 Step 3.3: generic-shape candidates need BOTH texts even when
  // secondaryText is absent -- findGenericShapeClaims(primaryText) alone
  // is never enough to satisfy its own corroboration requirement, so with
  // no secondary text there is nothing to add here either, and the
  // original early return (unchanged) is still correct.
  if (!secondaryText) return primary;
  const secondary = extractClaims(secondaryText, knownClaims);

  // accuracy3 Step 3: reads primary.claimsList/secondary.claimsList (the
  // real arrays), not primary.claims.split(' | ')/secondary.claims.split(
  // ' | ') -- splitting the joined STRING back apart is exactly the bug
  // claimsList exists to avoid: a combined-badge claim whose own text
  // contains " | " (see ClaimsResult.claimsList's doc comment) would be
  // shattered into meaningless fragments here otherwise, the same way it
  // would downstream.
  const merged = new Map<string, string>(); // lowercase -> canonical casing, primary wins ties
  for (const claim of primary.claimsList) {
    if (claim) merged.set(claim.toLowerCase(), claim);
  }
  for (const claim of secondary.claimsList) {
    if (claim && !merged.has(claim.toLowerCase())) merged.set(claim.toLowerCase(), claim);
  }

  const primaryGeneric = findGenericShapeClaims(primaryText);
  const secondaryGenericLower = new Set(findGenericShapeClaims(secondaryText).map((c) => c.toLowerCase()));
  const corroboratedGeneric = primaryGeneric
    .filter((claim) => secondaryGenericLower.has(claim.toLowerCase()))
    .slice(0, GENERIC_CLAIMS_CAP);
  for (const claim of corroboratedGeneric) {
    if (!merged.has(claim.toLowerCase())) merged.set(claim.toLowerCase(), claim);
  }

  const matchedLower = new Set([...primary.matched, ...secondary.matched].map((claim) => claim.toLowerCase()));
  const mergedClaims = [...merged.values()];
  return {
    claims: mergedClaims.join(' | '),
    claimsList: mergedClaims,
    matched: mergedClaims.filter((claim) => matchedLower.has(claim.toLowerCase())),
    unmatched: mergedClaims.filter((claim) => !matchedLower.has(claim.toLowerCase()))
  };
}

// accuracy3 Step 2: the same reading-order-vs-flattened-text rescue
// mergeClaimsResults applies to claims, applied to ingredients. Real gap
// found via a score.py measurement (Calcimax pack 60 IRN169-2.pdf): its
// ingredients paragraph sits at the same Y-coordinates as a narrow MRP/
// pricing side column, so the geometry-based reading-order reconstruction
// zigzags between them, splicing pricing fragments into the middle of the
// list and truncating it early. The PDF's own flattened (draw-order) text
// doesn't reconstruct columns at all, so it isn't vulnerable to this
// specific failure mode.
//
// Unlike claims (an unordered set of independent badge matches, safe to
// union), an ingredients declaration is one coherent ordered list -- safe
// to swap wholesale for a better candidate, unsafe to merge fragments of
// (splicing two different runs' text together would scramble the order
// and risk creating an item that was never really printed as such). Picks
// whichever source recovers strictly more items, via the same
// splitIngredientsList every other consumer of a declaration already
// uses; a tie keeps the reading-order result, since it's still the
// better-tested default for every label that doesn't hit this failure mode.
export function mergeIngredientsResults(text: string, flattenedText: string | undefined): string {
  const primary = extractIngredients(text);
  if (!flattenedText) return primary;

  const secondary = extractIngredients(flattenedText);
  if (!secondary) return primary;

  const primaryCount = splitIngredientsList(primary).length;
  const secondaryCount = splitIngredientsList(secondary).length;
  return secondaryCount > primaryCount ? secondary : primary;
}

type ExtendedFields = {
  values: Pick<LabelExtractionResult, 'colourTheme' | 'claims' | 'ingredients' | 'nutritionTableFormat' | 'nutritionTable' | 'displayTextCandidates'>;
  unknownClaims: string[];
  /**
   * accuracy3 Step 3: the same claims as `values.claims`, as a real array
   * rather than a ' | '-joined string. See ClaimsResult.claimsList's own
   * doc comment for why this exists — a combined-badge claim can contain a
   * literal " | " in its own text, which the joined string alone can't
   * tell apart from three separately-joined claims once split back apart.
   */
  claimsList: string[];
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
  const claims = mergeClaimsResults(extractClaims(text, knownClaims), text, flattenedText, knownClaims);

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
      ingredients: mergeIngredientsResults(text, flattenedText),
      nutritionTableFormat: extractNutritionTableFormat(text),
      // nutritionTable is filled from the PDF's geometry structure (Task 5) or
      // the AI backend's vision-model fallback. This function only stringifies
      // what was already extracted; never invents a value.
      nutritionTable: nutritionTable && Object.keys(nutritionTable).length ? JSON.stringify(nutritionTable) : '',
      // displayTextCandidates is filled from display text recovered from the rasterized
      // page or image; stringified when present, '' when none.
      displayTextCandidates: displayTextCandidates && displayTextCandidates.length ? JSON.stringify(displayTextCandidates) : ''
    },
    unknownClaims: claims.unmatched,
    claimsList: claims.claimsList
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
  knownFlavours: readonly string[],
  knownBrands: readonly string[] = []
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

      // Master-snap for brand (Step 2, accuracy2 plan). Once a real master
      // list is loaded, this source's own by-source history is roughly 1
      // correct / 13 wrong — a candidate that doesn't match anything in the
      // client's real catalogue has no business filling the field, and one
      // that does is snapped to the MASTER's own spelling (not the
      // candidate's OCR-noisy text), tagged 'master-snap' below so two
      // labels for the same brand always compare identically.
      let flattenedBrandSnapped = false;
      let orderedBrandSnapped = false;
      if (knownBrands.length > 0) {
        if (cleanedFlattenedFields.brand) {
          const snap = snapToMaster(cleanedFlattenedFields.brand, knownBrands);
          if (snap) {
            cleanedFlattenedFields.brand = snap.value;
            flattenedBrandSnapped = true;
          } else {
            debugLog(`brand "${cleanedFlattenedFields.brand}" does not snap to any master brand — blanking before fillBlanks`);
            cleanedFlattenedFields.brand = '';
          }
        }
        if (cleanedOrderedFields.brand) {
          const snap = snapToMaster(cleanedOrderedFields.brand, knownBrands);
          if (snap) {
            cleanedOrderedFields.brand = snap.value;
            orderedBrandSnapped = true;
          } else {
            cleanedOrderedFields.brand = '';
          }
        }
      }

      const flattenedMeta = tagFilledFields(cleanedFlattenedFields, 'text-layer-flattened');
      const merged = fillBlanksFrom(cleanedFlattenedFields, cleanedOrderedFields, 'text-layer-reading-order', flattenedMeta);
      fields = merged.fields;
      fieldMeta = merged.meta;

      // The merge above tags every field by WHICH PASS produced it, not
      // whether that pass's value was grounded against a master -- override
      // brand's own source afterward, to whichever pass's snapped value
      // actually won the merge (flattened wins if non-empty; ordered only
      // if it filled a blank left by flattened).
      if (flattenedBrandSnapped && cleanedFlattenedFields.brand) {
        fieldMeta.brand = { ...fieldMeta.brand, source: 'master-snap', needsReview: false };
      } else if (orderedBrandSnapped && !cleanedFlattenedFields.brand && cleanedOrderedFields.brand) {
        fieldMeta.brand = { ...fieldMeta.brand, source: 'master-snap', needsReview: false };
      }

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
  /** The PDF's own text-layer spans, when one exists -- passed on so a later PP-OCR body-text recovery (Step 3) can strip-plan around real panel geometry instead of scanning blind. Empty on the text-layer-absent / image-upload path. */
  spans?: TextSpan[];
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
export type PpOcrPageScan = {
  deduped: OcrLineLike[];
  spanRects: ReturnType<typeof projectSpanToPixels>[];
  occurrenceMap: Map<string, number>;
};

// accuracy3 Step 1.4: scanPageWithPpOcr is the single most expensive read in
// this pipeline (one recognizeLines call per strip, now potentially times
// three angles -- see below), and recoverDisplayTextCandidates and
// recoverBodyTextViaPpOcr both call it on the SAME page image within one
// extraction. Cached per sha256(page bytes) for the process lifetime --
// deliberately not per-request or LRU-bounded, since this is a single label
// extraction's own page image, never re-used across different labels, so
// the cache cannot grow unbounded within one process's real workload.
const ppOcrScanCache = new Map<string, Promise<PpOcrPageScan | null>>();

function hashPageImage(pageImage: Buffer): string {
  return createHash('sha256').update(pageImage).digest('hex');
}

// OCRs one strip of one (possibly already-rotated) page image, applying the
// accuracy3 Step 1.3 upscale rule to THIS strip alone: PP-OCR's recogniser
// works at ~48px line height; 300 DPI of 6.8pt body text (a real nutrition
// panel's print size) renders at ~28px, below that. Re-running a whole page
// at 2x (scripts/dump-readable-text.ts's own proxy) is a blunt fix -- most
// pages don't need it, and the ones that do usually only need it for the
// one small-print strip, not the large front-panel wordmark strip sitting
// right next to it. Re-runs just the strip whose OWN median line height is
// below the threshold, then halves that strip's boxes back to 1x before the
// caller offsets them onto the page.
async function ocrOneStrip(
  pageImage: Buffer,
  strip: { left: number; width: number },
  pageWidth: number,
  pageHeightPx: number
): Promise<OcrLineLike[]> {
  const crop = await sharp(pageImage)
    .extract({ left: Math.round(strip.left), top: 0, width: Math.round(strip.width), height: Math.round(pageHeightPx) })
    .png()
    .toBuffer();
  const lines = await recognizeLines(crop);
  let trimmed = dropStripEdgeLines(lines, strip, pageWidth);

  const height = medianLineHeight(trimmed);
  if (height > 0 && height < 32) {
    try {
      const upscaledCrop = await sharp(pageImage)
        .extract({ left: Math.round(strip.left), top: 0, width: Math.round(strip.width), height: Math.round(pageHeightPx) })
        .resize({ width: Math.round(strip.width) * 2 })
        .png()
        .toBuffer();
      const upscaledLines = await recognizeLines(upscaledCrop);
      const halved = upscaledLines.map((l) => ({
        ...l,
        box: { x0: l.box.x0 / 2, y0: l.box.y0 / 2, x1: l.box.x1 / 2, y1: l.box.y1 / 2 }
      }));
      const trimmedUpscaled = dropStripEdgeLines(halved, strip, pageWidth);
      // Same tie-break dump-readable-text.ts already validated: more lines
      // recovered means the upscale genuinely helped; fewer or equal means
      // the retry found nothing the first pass didn't, so keep the cheaper
      // 1x read rather than trust a strictly-worse-or-equal one.
      if (trimmedUpscaled.length > trimmed.length) {
        trimmed = trimmedUpscaled;
      }
    } catch (upscaleError) {
      debugLog(`Strip upscale retry failed: ${upscaleError instanceof Error ? upscaleError.message : String(upscaleError)}`);
    }
  }

  return trimmed.map((line) => ({
    text: line.text,
    box: {
      x0: line.box.x0 + strip.left,
      y0: line.box.y0,
      x1: line.box.x1 + strip.left,
      y1: line.box.y1
    },
    confidence: line.confidence
  }));
}

// OCRs every strip of one page image (already rotated or not) and returns
// every line found, still in THAT image's own coordinate space -- the
// caller is responsible for remapping rotated-pass lines back onto the
// original page. Fail-soft per strip, matching every other OCR escalation
// in this module: one bad strip does not lose the others.
async function ocrAllStrips(
  pageImage: Buffer,
  strips: readonly { left: number; width: number }[],
  pageWidth: number,
  pageHeightPx: number
): Promise<OcrLineLike[]> {
  const allLines: OcrLineLike[] = [];
  for (const strip of strips) {
    try {
      const lines = await ocrOneStrip(pageImage, strip, pageWidth, pageHeightPx);
      allLines.push(...lines);
    } catch (stripError) {
      debugLog(`OCR strip [${strip.left}, ${strip.left + strip.width}) failed: ${
        stripError instanceof Error ? stripError.message : String(stripError)
      }`);
    }
  }
  return allLines;
}

// The shared strip-based PP-OCR page scan (accuracy2 plan Step 3, extended
// by accuracy3 Step 1): plans strips from text-layer panel geometry (or a
// blind full-width strip when no spans exist), OCRs each strip -- upscaling
// any strip whose own print is too small to read reliably (Step 1.3) --
// additionally scans the page rotated +/-90 degrees when the label's own
// text layer says some panel is rotated, or there is no text layer to say
// otherwise (Step 1.2, since a label with no readable text layer is exactly
// the case most likely to be a sideways-printed panel baked into artwork),
// dedupes overlapping reads across all angles, and counts occurrences. Two
// different consumers need exactly this same expensive pass:
// recoverDisplayTextCandidates (the top OUTLINED lines, for brand/product
// name) and recoverBodyTextViaPpOcr (EVERY line, for nutrition/claims/
// ingredients -- the body text recoverDisplayTextCandidates itself used to
// read and then simply discard, keeping only its own top 10). Cached per
// page (Step 1.4). Fail-soft like every OCR escalation in this module:
// null, never a throw.
export async function scanPageWithPpOcr(
  pageImage: Buffer,
  spans: readonly TextSpan[],
  dpi: number,
  pageNumber = 1
): Promise<PpOcrPageScan | null> {
  const cacheKey = `${hashPageImage(pageImage)}:${dpi}:${pageNumber}`;
  const cached = ppOcrScanCache.get(cacheKey);
  if (cached) return cached;

  const scanPromise = scanPageWithPpOcrUncached(pageImage, spans, dpi, pageNumber);
  ppOcrScanCache.set(cacheKey, scanPromise);
  return scanPromise;
}

async function scanPageWithPpOcrUncached(
  pageImage: Buffer,
  spans: readonly TextSpan[],
  dpi: number,
  pageNumber: number
): Promise<PpOcrPageScan | null> {
  try {
    // Compute image metadata once
    const metadata = await sharp(pageImage).metadata();
    const pageHeightPt = metadata.height! / (dpi / 72);
    const width = metadata.width!;
    const heightPx = metadata.height!;

    // Identify which text spans are "covered" by the geometry layer, so we can
    // focus on text regions not already in the text layer.
    let spanRects: ReturnType<typeof projectSpanToPixels>[] = [];
    if (spans.length > 0) {
      // Project only THIS page's spans to pixel rectangles -- accuracy3
      // Step 1.1: recoverBodyTextViaPpOcr now scans every page, and a page 2
      // scanned against page 1's spans would plan strips from the wrong
      // panel geometry entirely.
      spanRects = spans
        .filter((s) => s.page === pageNumber)
        .map((s) => projectSpanToPixels(s, pageHeightPt, dpi));
    }

    // Compute panel X ranges from text-layer geometry (rotation-0 only)
    const thisPageSpans = spans.filter((s) => s.page === pageNumber);
    let panelXRanges: Array<{ left: number; right: number }> = [];
    let anyPanelRotated = false;

    if (thisPageSpans.length > 0) {
      const panels = segmentPanels(thisPageSpans);
      const s = dpi / 72;

      for (const panel of panels) {
        if (Math.abs(panel.rotation) >= 0.01) {
          anyPanelRotated = true;
          continue;
        }
        let minX = Infinity;
        let maxX = -Infinity;

        for (const line of panel.lines) {
          for (const span of line.spans) {
            minX = Math.min(minX, span.x);
            maxX = Math.max(maxX, span.x + span.width);
          }
        }

        if (minX !== Infinity && maxX !== -Infinity) {
          panelXRanges.push({ left: minX * s, right: maxX * s });
        }
      }
    }

    // Compute padding: 40px or 1.5 * median font size, whichever is larger
    const s = dpi / 72;
    const medianFontSizeVal = thisPageSpans.length > 0 ? medianFontSize(thisPageSpans) : 0;
    const padPx = Math.max(40, Math.round(1.5 * medianFontSizeVal * s));

    // Plan OCR strips (panels + gaps) and OCR the 0-degree pass.
    const strips = planOcrStrips(panelXRanges, width, padPx);
    const allLines: OcrLineLike[] = await ocrAllStrips(pageImage, strips, width, heightPx);

    // accuracy3 Step 1.2: rotated passes. Triggered when the text layer
    // itself says a panel is printed sideways, or when there's no text
    // layer at all to say either way (an image upload, or a scanned PDF --
    // both cases where "is anything rotated" is simply unknown, so it's
    // checked for rather than assumed absent). Each rotated pass reads the
    // WHOLE page as one blind strip (panelXRanges=[]) -- text-layer panel
    // geometry doesn't line up once the image itself has been rotated,
    // same reasoning scripts/dump-readable-text.ts already uses for its own
    // rotation passes.
    const needsRotation = thisPageSpans.length === 0 || anyPanelRotated;
    if (needsRotation) {
      for (const angle of [90, 270] as const) {
        try {
          const rotated = await sharp(pageImage).rotate(angle).png().toBuffer();
          const rotatedMeta = await sharp(rotated).metadata();
          const rotatedStrips = planOcrStrips([], rotatedMeta.width!, padPx);
          const rotatedLines = await ocrAllStrips(rotated, rotatedStrips, rotatedMeta.width!, rotatedMeta.height!);
          for (const line of rotatedLines) {
            allLines.push({
              text: line.text,
              box: mapRotatedBoxToPage(line.box, angle, width, heightPx),
              confidence: line.confidence
            });
          }
        } catch (rotateError) {
          debugLog(`Rotated (${angle}deg) PP-OCR pass failed: ${rotateError instanceof Error ? rotateError.message : String(rotateError)}`);
        }
      }
    }

    // Dedupe: two lines whose boxes have IoU > 0.7 are one line read by two
    // overlapping strips or angles (the padding, or a rotated pass reading
    // the same text the 0-degree pass already got) → keep the
    // higher-confidence read.
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

    return { deduped, spanRects, occurrenceMap };
  } catch (error) {
    console.warn(
      '[labelExtraction] PP-OCR page scan failed: ' +
        (error instanceof Error ? error.message : String(error))
    );
    return null;
  }
}

async function recoverDisplayTextCandidates(
  pageImage: Buffer,
  spans: readonly TextSpan[],
  dpi: number
): Promise<DisplayTextCandidate[]> {
  const scan = await scanPageWithPpOcr(pageImage, spans, dpi);
  if (!scan) return [];

  // Filter to outlined lines: those that survived the segmentation logic
  // (high confidence, consistent box structure, etc.)
  const outlined = findOutlinedLines(scan.deduped, scan.spanRects);

  // Return top 10 by height, with heights and confidence rounded for readability.
  // Fragment removal plus headroom for two-line product names (e.g. "Sharp\nMind Plus").
  return outlined.slice(0, 10).map((l) => {
    const normalized = l.text.toLowerCase().replace(/\s+/g, ' ').trim();
    return {
      text: l.text,
      heightPx: Math.round(l.box.y1 - l.box.y0),
      confidence: Math.round(l.confidence * 100) / 100,
      topPx: Math.round(l.box.y0),
      occurrences: scan.occurrenceMap.get(normalized) ?? 0
    };
  });
}

// Step 3 of the accuracy2 plan: the body text recoverDisplayTextCandidates
// already reads on every strip and then discards -- every nutrition row,
// ingredient, and claim it saw, not just the top 10 outlined display lines.
// Reading order is top-to-bottom then left-to-right (y0 then x0), the same
// order a person reads a panel in; a genuine split-region row (name and
// value as two separate PP-OCR detections at the same baseline) still
// lands adjacent to itself in that order, which is what groupSpansIntoLines
// downstream (extractNutritionTableFromPpOcrLines) needs to rejoin it.
//
// accuracy3 Step 1.1: runs over EVERY rasterized page, not just the first --
// a real client label's nutrition table, ingredient list, or claims can sit
// on page 2 of a multi-page PDF (a back-panel scan, or a second artwork
// page), and the single-page version of this function could never reach
// it. Nutrition table: first page with a non-empty table wins, the same
// "don't overwrite a value that's already there" rule
// extractNutritionTableFromOcrWords's own caller already follows. Body
// text: every page's text concatenated in page order, since claims/
// ingredients extraction reads the whole string and a real ingredient list
// or claim can be split across the panel boundary a page break happens to
// fall on. Capped by PPOCR_MAX_PAGES (default 4) so a very long PDF can't
// turn one label's extraction into dozens of full-page PP-OCR scans.
//
// Returns null (fail-soft) only when EVERY page's scan failed; an
// empty-but-real scan (nothing detected anywhere) returns text: '' and no
// nutritionTable, which callers treat as "nothing new to add," not an
// error.
export async function recoverBodyTextViaPpOcr(
  pageImages: readonly Buffer[],
  spans: readonly TextSpan[],
  dpi: number
): Promise<{ text: string; nutritionTable?: Record<string, string> } | null> {
  const pagesToScan = pageImages.slice(0, env.ppOcrMaxPages);
  const texts: string[] = [];
  let nutritionTable: Record<string, string> | undefined;
  let anyScanSucceeded = false;

  for (let i = 0; i < pagesToScan.length; i++) {
    const scan = await scanPageWithPpOcr(pagesToScan[i], spans, dpi, i + 1);
    if (!scan) continue;
    anyScanSucceeded = true;

    const ordered = [...scan.deduped].sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
    const pageText = ordered.map((l) => l.text).join('\n');
    if (pageText) texts.push(pageText);

    if (!nutritionTable) {
      const pageNutritionTable = extractNutritionTableFromPpOcrLines(ordered);
      if (Object.keys(pageNutritionTable).length > 0) nutritionTable = pageNutritionTable;
    }
  }

  if (!anyScanSucceeded) return null;
  return { text: texts.join('\n'), nutritionTable };
}

// accuracy3 Step 1.6: which of recoverBodyTextViaPpOcr's own scalar reads
// are safe to route into the fillBlanks cascade as source 'ppocr-text'.
// brand/productName are excluded unconditionally -- PP-OCR's raw strip-
// order text is exactly the source that produced this project's 0-correct/
// 13-wrong flattened-text brand guess (see recoverNamesViaVlm/
// recoverDisplayTextCandidates for the only path allowed to touch those
// two fields). The other four exclusions come from the first real by-
// source measurement of this source (2026-09-20, RESULTS.md `84b3695` row,
// pipeline vlm-off/masters-on, 45 real labels): address 0 correct/3 wrong,
// customer_care_number 0/3, flavour 0/2, marketing_company 0/6 -- net
// harmful on all four, and the flavour misses included a NEW fabrication
// (a value filled in on a label ground truth says has none), which this
// project's own rule never allows in exchange for accuracy elsewhere.
// customerCareEmail (6/0), fssaiNumber (3/1), and packageSize (1/1, not
// "more wrong than correct") measured net-positive-or-neutral and stay
// enabled. Per Step 1.6's own instruction: "let the by-source table
// decide... name which ones in the report."
export function ppOcrTextScalarPatch(candidates: ExtractedLabelFields): Partial<ExtractedLabelFields> {
  const {
    brand: _brand,
    productName: _productName,
    address: _address,
    customerCareNumber: _customerCareNumber,
    flavour: _flavour,
    marketingCompany: _marketingCompany,
    ...patch
  } = candidates;
  return patch;
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

async function extractFieldsFromPdf(pdfBuffer: Buffer, knownFlavours: readonly string[], knownBrands: readonly string[] = []): Promise<FieldPass> {
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
    const result = await extractFieldsFromTextLayer(pdfBuffer, textLayerText, knownFlavours, knownBrands);
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
      flattenedText: textLayerText,
      spans
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
      flattenedText: textLayerText,
      spans
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

  return { fields, text: finalText, pageImages, nutritionTable, displayTextCandidates, fieldMeta, flattenedText: textLayerText, spans };
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
  knownClaims: readonly string[] = [],
  knownBrands: readonly string[] = []
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
      const result = await extractFieldsFromTextLayer(pdfBuffer, textLayerText, knownFlavours, knownBrands);
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
  knownFlavours: readonly string[] = [],
  knownBrands: readonly string[] = []
): Promise<LabelExtractionResult> {
  return (await extractLabelReportFromFile(filePath, mimeType, knownClaims, knownFlavours, knownBrands)).result;
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
  knownFlavours: readonly string[] = [],
  // Only the PDF text-layer path snaps brand to a master today (see
  // masterSnap.service.ts) — that's where the regression this was built to
  // fix (text-layer-flattened brand at ~1 correct / 13 wrong) actually
  // lives. Tesseract full-page OCR (extractFieldsFromImage, and the
  // rasterized-page loop inside extractFieldsFromPdf) isn't snapped yet;
  // extending master-snap to OCR-sourced brand reads is deferred alongside
  // the PP-OCR-line and VLM-transcript snap points (accuracy2 plan Steps 3/5).
  knownBrands: readonly string[] = []
): Promise<LabelExtractionReport> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const isPdf = mimeType === 'application/pdf';

    const pass = isPdf
      ? await extractFieldsFromPdf(fileBuffer, knownFlavours, knownBrands)
      : await extractFieldsFromImage(fileBuffer, knownFlavours);

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

    let bodyText = pass.text;
    let nutritionTable = pass.nutritionTable;

    let extended = await extractExtendedFields(
      bodyText,
      pageImage,
      knownClaims,
      nutritionTable,
      pass.displayTextCandidates,
      pass.flattenedText
    );

    // Step 3 (accuracy2 plan): PP-OCR as a first-class reader for nutrition/
    // claims/ingredients, the biggest lever per the ceiling analysis
    // (ai_backend/eval/ceiling.py) -- recoverDisplayTextCandidates already
    // strip-scans the whole page and used to keep only its top 10 outlined
    // lines; recoverBodyTextViaPpOcr reruns that same scan (shared core:
    // scanPageWithPpOcr) and hands back every line, folded into the body
    // text claims/ingredients read from and parsed for a nutrition table
    // the same way a PDF's own text-layer geometry is.
    //
    // Only escalates when at least one of the three is still genuinely
    // missing after every other source had its turn, and only when an
    // OCR-RESOLUTION page image exists (never the 72dpi colour-only
    // `pageImage` fallback above, which is unreadable at OCR quality): same
    // "don't pay for OCR you don't need" discipline every other escalation
    // in this pipeline follows.
    const stillMissingBodyText =
      !hasNutritionTable(nutritionTable) || !extended.values.ingredients || extended.values.claims === '';

    // accuracy3 Step 1.5: extractFieldsFromPdf's isComplete() fast path
    // returns pageImages: [] once every SCALAR field is resolved from the
    // text layer -- it has no way to know nutrition_table/claims/
    // ingredients are still empty, since those aren't part of isComplete()'s
    // check. Before this fix, that meant a label whose scalars all came
    // from the text layer NEVER reached the PP-OCR/crop side channels below,
    // even when its nutrition table or claims were genuinely missing --
    // permanently, since nothing downstream would ever ask for OCR-quality
    // pages again. Rasterizing here -- only when actually needed -- gives
    // the fast path the exact same escalation the slow path already has, by
    // reusing this same code rather than duplicating it inside the fast
    // path's own branch.
    let ocrPageImages: Buffer[] = pass.pageImages;
    if (ocrPageImages.length === 0 && isPdf && stillMissingBodyText) {
      try {
        ocrPageImages = await rasterizePdfPages(fileBuffer);
      } catch (error) {
        console.warn(
          '[labelExtraction] Fast-path OCR-quality rasterization failed: ' +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }

    if (stillMissingBodyText && ocrPageImages[0]) {
      const recovered = await recoverBodyTextViaPpOcr(ocrPageImages, pass.spans ?? [], env.pdfRasterDpi);
      if (recovered && (recovered.text || recovered.nutritionTable)) {
        if (recovered.nutritionTable && !hasNutritionTable(nutritionTable)) {
          nutritionTable = recovered.nutritionTable;
        }
        if (recovered.text) {
          bodyText = [bodyText, recovered.text].filter((t) => t.trim().length > 0).join('\n');

          // accuracy3 Step 1.6: route PP-OCR's own reading-order text
          // through the same fillBlanks scalar cascade every other source
          // uses -- blanks only (fillBlanks never overwrites a value
          // that's already there), and explicitly NEVER into brand/
          // productName: PP-OCR's raw strip-order text is exactly the
          // source that produced this project's 0-correct/13-wrong
          // flattened-text brand guess (see the comment on
          // recoverNamesViaVlm/recoverDisplayTextCandidates for the only
          // path allowed to touch those two fields).
          //
          // Also gated off address/customerCareNumber/flavour/
          // marketingCompany: the first real by-source measurement of this
          // source (2026-09-20, RESULTS.md `84b3695` row) found it net-
          // harmful on exactly those four -- address 0/3, customer_care_
          // number 0/3, flavour 0/2, marketing_company 0/6 (correct/wrong)
          // -- and the flavour misses included a new fabrication (a value
          // filled in on a label ground truth says has none), which this
          // project's own rule never allows in exchange for accuracy
          // elsewhere. customerCareEmail (6/0), fssaiNumber (3/1), and
          // packageSize (1/1, not "more wrong than correct") stay enabled.
          // Per Step 1.6's own instruction: "let the by-source table
          // decide."
          const ppOcrScalarCandidates = extractLabelFields(recovered.text, { knownFlavours });
          const ppOcrScalarPatch = ppOcrTextScalarPatch(ppOcrScalarCandidates);
          const ppOcrMerge = fillBlanksFrom(pass.fields, ppOcrScalarPatch, 'ppocr-text', pass.fieldMeta ?? {});
          pass.fields = ppOcrMerge.fields;
          pass.fieldMeta = ppOcrMerge.meta;
        }
        // Re-run once, over the enriched text/table together, rather than
        // patching claims/ingredients/nutritionTable individually -- claims
        // extraction in particular cross-checks against flattenedText too
        // (mergeClaimsResults), so a partial patch here could disagree with
        // a second, separately-patched call.
        extended = await extractExtendedFields(
          bodyText,
          pageImage,
          knownClaims,
          nutritionTable,
          pass.displayTextCandidates,
          pass.flattenedText
        );
      }
    }

    // Step 7 (accuracy2 plan): the VLM as a grounded reader on a crop of
    // just the nutrition panel -- last resort, after the text layer,
    // Tesseract, and PP-OCR body-text passes above all had their turn and
    // nutrition_table is STILL empty. Validated in
    // eval/STEP7_CROP_DIAGNOSTIC.md: the whole page squeezed to
    // prepareImage()'s fixed 1008px width reads small nutrition-panel
    // print so poorly the model hallucinates a plausible-looking but
    // wrong table; the same model reading a real-resolution crop of just
    // the panel reads it correctly, at no extra latency cost. Every row
    // is grounded before being trusted (readNutritionTableFromCrop), so a
    // crop that doesn't hold up leaves the field MISSING, same as today,
    // never WRONG for the sake of filling something in.
    if (!hasNutritionTable(nutritionTable) && isVlmEnabled() && ocrPageImages[0]) {
      try {
        const pageImageBuffer = ocrPageImages[0];
        const meta = await sharp(pageImageBuffer).metadata();
        const pageWidth = meta.width!;
        const pageHeight = meta.height!;
        const dpi = env.pdfRasterDpi;

        let box = findNutritionPanelFromSpans(pass.spans ?? [], pageHeight / (dpi / 72), dpi);
        if (!box) {
          const { words } = await recognizePageWithWords(pageImageBuffer);
          box = findNutritionPanelFromWords(words, pageWidth, pageHeight);
        }

        if (box) {
          const padded = padCropBox(box, 20, pageWidth, pageHeight);
          const recovered = await readNutritionTableFromCrop(pageImageBuffer, padded, ollamaClient);
          if (recovered) {
            nutritionTable = recovered;
            // Only this one value changed -- extractExtendedFields also
            // recomputes colour theme (real image processing) and re-runs
            // claims/ingredients, neither of which depends on
            // nutritionTable, so a full re-call would be pure waste here.
            extended = { ...extended, values: { ...extended.values, nutritionTable: JSON.stringify(recovered) } };
          }
        }
      } catch (error) {
        console.warn(
          '[labelExtraction] Nutrition-panel crop recovery failed: ' +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }

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

    return { result: postProcessed, unknownClaims: extended.unknownClaims, discardedFields, fieldMeta, claimsList: extended.claimsList };
  } catch (error) {
    console.error('[labelExtraction] Unexpected error during label extraction:', error instanceof Error ? error.message : error);
    return { result: buildPlaceholderExtraction(), unknownClaims: [], discardedFields: [], fieldMeta: {}, claimsList: [] };
  }
}
