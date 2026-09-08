import fs from 'fs';
import { Request, Response } from 'express';
import { buildPlaceholderExtraction, extractLabelFromFile, LabelExtractionResult } from '../services/labelExtraction.service';
import { compareLabels as compareLabelData, ComparisonStage } from '../services/labelComparison.service';
import { compareArtworkImages, compareFingerprints, fingerprintArtworkImage, ArtworkVisualComparison } from '../services/imageSimilarity.service';
import { identifyProduct as identifyProductWithAi, ProductIdentificationInput } from '../services/productIdentification.service';
import { claims as claimsMaster, flavours as flavoursMaster } from '../repositories/masters.repository';
import { getProducts } from '../repositories/product.repository';

type KnownMasterNames = { knownClaims: string[]; knownFlavours: string[] };

// Short TTL, not "load once and keep forever": Master Data is edited
// through its own admin page (activating/deactivating a Claim or Flavour,
// or adding a new one) while the server keeps running, and a cache with no
// expiry would keep serving OCR extraction against a stale candidate list
// until the next restart. 30s bounds that staleness to something a reviewer
// would never notice mid-task, while still saving a masters-table round
// trip on every single /extract and /compare call — this endpoint is on
// the hot path for every label upload.
const MASTER_NAMES_CACHE_TTL_MS = 30_000;
let masterNamesCache: { value: KnownMasterNames; expiresAt: number } | undefined;

/**
 * The Claims/Flavours master lists, if a database is reachable — never
 * required. extractLabelFromFile stays stateless and works with no
 * DATABASE_URL at all (see its own comment); this only makes the two
 * anchor-less fallback tiers that need candidate names smarter when a
 * database happens to be configured, by supplying this deployment's own
 * real master data instead of anything baked into the OCR module. A
 * missing/unreachable database is not an error here — the extraction is
 * still complete, just without those two tiers.
 *
 * Only Active masters seed the OCR candidate list — an Inactive Claim or
 * Flavour was deliberately retired (see masters.repository's own status
 * field) and OCR treating it as a live candidate to match against would
 * quietly resurrect it.
 */
export async function loadKnownMasterNames(): Promise<KnownMasterNames> {
  if (masterNamesCache && masterNamesCache.expiresAt > Date.now()) {
    return masterNamesCache.value;
  }

  try {
    const [claimRecords, flavourRecords] = await Promise.all([claimsMaster.list(), flavoursMaster.list()]);
    const value: KnownMasterNames = {
      knownClaims: claimRecords.filter((claim) => claim.status === 'Active').map((claim) => claim.claimText),
      knownFlavours: flavourRecords.filter((flavour) => flavour.status === 'Active').map((flavour) => flavour.flavourName)
    };
    masterNamesCache = { value, expiresAt: Date.now() + MASTER_NAMES_CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.warn(
      '[labels.controller] Could not load Claims/Flavours master data (no database configured, or unreachable) — ' +
        'continuing with OCR-only extraction for those fields.',
      error instanceof Error ? error.message : error
    );
    // Not cached: a database outage should not lock this endpoint out of
    // trying again on the very next request once it recovers.
    return { knownClaims: [], knownFlavours: [] };
  }
}

/** Test-only: clears the cache so a test's freshly-seeded master data is visible immediately rather than waiting out the TTL. */
export function _resetMasterNamesCacheForTests(): void {
  masterNamesCache = undefined;
}

const EXTRACTION_RESULT_KEYS: (keyof LabelExtractionResult)[] = [
  'marketingCompany',
  'address',
  'fssaiNumber',
  'email',
  'customerCareNumber',
  'brand',
  'flavour',
  'productName',
  'packageSize',
  'manufacturingCompany',
  'colourTheme',
  'claims',
  'ingredients',
  'nutritionTableFormat',
  'nutritionTable'
];

// Accepts only a plain object whose extraction-result fields are all
// strings (missing fields default to ''), rejecting anything else — this
// endpoint trusts the caller already ran extraction, but never trusts the
// shape of what it's handed.
function parseExtractionResult(value: unknown): LabelExtractionResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const result = {} as LabelExtractionResult;
  for (const key of EXTRACTION_RESULT_KEYS) {
    const field = record[key];
    if (field !== undefined && typeof field !== 'string') return null;
    result[key] = typeof field === 'string' ? field : '';
  }
  return result;
}

// POST /api/labels/extract — validates the uploaded label file (see
// middleware/upload.middleware.ts for type/size checks), runs it through
// open-source Tesseract OCR, and returns the structured result. This
// controller has no OCR logic of its own and doesn't know how extraction is
// implemented internally — see services/labelExtraction.service.ts.
// extractLabelFromFile() never throws for OCR-side problems (corrupt file,
// no usable text, missing OCR tooling) — it already falls back to the
// blank-field placeholder itself. The try/catch here only guards against
// something failing outside that (e.g. the temp file itself being
// unreadable), so the response contract stays identical either way.
export async function extractLabel(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: 'No file uploaded. Please attach a PDF, JPG or JPEG label file.' });
    return;
  }

  try {
    const { knownClaims, knownFlavours } = await loadKnownMasterNames();
    const data = await extractLabelFromFile(file.path, file.mimetype, knownClaims, knownFlavours);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[labels.controller] Unexpected failure building the extraction result:', error instanceof Error ? error.message : error);
    res.status(200).json({ success: true, data: buildPlaceholderExtraction() });
  } finally {
    removeTempFile(file);
  }
}

function removeTempFile(file: Express.Multer.File | undefined) {
  if (!file) return;
  fs.unlink(file.path, (unlinkError) => {
    if (unlinkError) console.error(`Failed to remove temporary upload ${file.path}:`, unlinkError);
  });
}

// POST /api/labels/compare — V1 of Label Comparison. Validates both
// uploaded files (see middleware/upload.middleware.ts's labelPairUpload,
// which applies the exact same type/size rules as /extract), runs EACH
// one through the same extractLabelFromFile() pipeline /extract uses (no
// separate/duplicated OCR logic here), then hands both structured results
// to labelComparison.service.ts for the field-by-field comparison. Like
// extractLabel above, extraction itself never throws — an unreadable or
// content-free label comes back as a normal, fully-blank extraction
// result, which the comparison service reports as MISSING/NOT_COMPARED
// fields rather than an error. The try/catch here only guards against a
// genuinely unexpected failure outside that (e.g. a temp file becoming
// unreadable mid-request).
export async function compareLabels(req: Request, res: Response) {
  const files = req.files as { labelA?: Express.Multer.File[]; labelB?: Express.Multer.File[] } | undefined;
  const fileA = files?.labelA?.[0];
  const fileB = files?.labelB?.[0];

  if (!fileA || !fileB) {
    removeTempFile(fileA);
    removeTempFile(fileB);
    const message = !fileA && !fileB ? 'Both Label A and Label B files are required.' : !fileA ? 'Label A file is required.' : 'Label B file is required.';
    res.status(400).json({ success: false, message });
    return;
  }

  try {
    const { knownClaims, knownFlavours } = await loadKnownMasterNames();
    const [labelA, labelB, visualComparison] = await Promise.all([
      extractLabelFromFile(fileA.path, fileA.mimetype, knownClaims, knownFlavours),
      extractLabelFromFile(fileB.path, fileB.mimetype, knownClaims, knownFlavours),
      buildVisualComparison(fileA, fileB)
    ]);
    const comparison = compareLabelData(labelA, labelB);
    res.status(200).json({ success: true, data: { labelA, labelB, comparison, visualComparison } });
  } catch (error) {
    console.error('[labels.controller] Unexpected failure building the comparison result:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: 'Could not compare the uploaded labels. Please try again.' });
  } finally {
    removeTempFile(fileA);
    removeTempFile(fileB);
  }
}

// Logo / Design-Layout / Colour (AI module brief §7/§9) — compared on the
// actual artwork pixels, never on a vision model's text description of
// them. See imageSimilarity.service.ts's module comment for why, and for
// what the two reported signals (artworkSimilarity, colourSimilarity) each
// measure and why neither substitutes for the other.
//
// Logo and Design/Layout share the ONE "artworkSimilarity" result, not
// separate rows: both would be driven by the identical whole-image
// structural hash, which would show as two independently-passing checks in
// the UI when only one real measurement was ever taken. Collapsing them
// into a single honest row until a logo-localisation step exists is the
// no-fabrication-consistent choice; splitting it into two numbers that
// happen to always agree would not be. Colour is a second, genuinely
// independent measurement (a colour histogram, not a grayscale structural
// hash), so it gets its own row rather than being folded into the same one.
//
// Never throws: fs.readFile can fail for an unreadable temp file just like
// any other I/O, and extractLabelFromFile's own no-throw guarantee (see its
// header comment) must not be undone by this running alongside it in the
// same Promise.all — a visual-comparison failure degrades to MISSING for
// both signals, the same contract the frontend's tryCompareVisual already
// holds itself to.
async function buildVisualComparison(fileA: Express.Multer.File, fileB: Express.Multer.File): Promise<ArtworkVisualComparison> {
  try {
    const [bufferA, bufferB] = await Promise.all([fs.promises.readFile(fileA.path), fs.promises.readFile(fileB.path)]);
    return await compareArtworkImages(
      { buffer: bufferA, mimeType: fileA.mimetype },
      { buffer: bufferB, mimeType: fileB.mimetype }
    );
  } catch (error) {
    console.error('[labels.controller] Could not build the visual comparison — reporting MISSING instead of failing the request:', error instanceof Error ? error.message : error);
    return { artworkSimilarity: { status: 'MISSING' }, colourSimilarity: { status: 'MISSING' } };
  }
}

// POST /api/labels/compare-visual — the visual counterpart to
// /compare-extracted for Quick Label Comparison. That endpoint compares
// already-extracted TEXT fields and has no file bytes to work with; this
// endpoint is the reverse — it takes the two raw artwork files the
// frontend already fetched for extraction and returns ONLY the Artwork
// Similarity visual comparison, so the text and visual comparisons can be
// requested independently without changing /compare-extracted's existing
// JSON-only contract.
export async function compareVisual(req: Request, res: Response) {
  const files = req.files as { labelA?: Express.Multer.File[]; labelB?: Express.Multer.File[] } | undefined;
  const fileA = files?.labelA?.[0];
  const fileB = files?.labelB?.[0];

  if (!fileA || !fileB) {
    removeTempFile(fileA);
    removeTempFile(fileB);
    const message = !fileA && !fileB ? 'Both Label A and Label B files are required.' : !fileA ? 'Label A file is required.' : 'Label B file is required.';
    res.status(400).json({ success: false, message });
    return;
  }

  try {
    const visualComparison = await buildVisualComparison(fileA, fileB);
    res.status(200).json({ success: true, data: { visualComparison } });
  } catch (error) {
    console.error('[labels.controller] Unexpected failure building the visual comparison result:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: 'Could not compare the uploaded artwork images. Please try again.' });
  } finally {
    removeTempFile(fileA);
    removeTempFile(fileB);
  }
}

// Reads and fingerprints one uploaded file, never throwing — an unreadable
// file fingerprints to null, which compareFingerprints reports as MISSING
// for both signals rather than crashing the batch.
async function fingerprintUploadedFile(file: Express.Multer.File) {
  try {
    const buffer = await fs.promises.readFile(file.path);
    return await fingerprintArtworkImage({ buffer, mimeType: file.mimetype });
  } catch (error) {
    console.error('[labels.controller] Could not fingerprint an uploaded file for batch visual comparison:', error instanceof Error ? error.message : error);
    return null;
  }
}

// POST /api/labels/compare-visual-batch — one subject artwork against every
// cross-company candidate in a single request. Exists because the Quick
// Label Comparison workflow's cross-company step compares one subject
// against N other marketing companies' artwork; calling /compare-visual
// once per candidate would re-upload and re-process the identical subject
// file N times. The subject is fingerprinted exactly once here and reused
// for every candidate. Results are returned in the same order candidates
// were sent.
export async function compareVisualBatch(req: Request, res: Response) {
  const files = req.files as { subject?: Express.Multer.File[]; candidates?: Express.Multer.File[] } | undefined;
  const subjectFile = files?.subject?.[0];
  const candidateFiles = files?.candidates ?? [];
  const cleanup = () => {
    removeTempFile(subjectFile);
    candidateFiles.forEach(removeTempFile);
  };

  if (!subjectFile || candidateFiles.length === 0) {
    cleanup();
    const message = !subjectFile ? 'A subject artwork file is required.' : 'At least one candidate artwork file is required.';
    res.status(400).json({ success: false, message });
    return;
  }

  try {
    const subjectFingerprint = await fingerprintUploadedFile(subjectFile);
    const results = await Promise.all(
      candidateFiles.map(async (candidateFile) => compareFingerprints(subjectFingerprint, await fingerprintUploadedFile(candidateFile)))
    );
    res.status(200).json({ success: true, data: { results } });
  } catch (error) {
    console.error('[labels.controller] Unexpected failure building the batch visual comparison result:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: 'Could not compare the uploaded artwork images. Please try again.' });
  } finally {
    cleanup();
  }
}

// POST /api/labels/compare-extracted — supports Quick Label Comparison's
// "one new artwork vs. the automatically-selected latest approved artwork"
// workflow. Unlike /compare above, this endpoint never touches OCR or
// files: the frontend (the only place that knows Product/Artwork/Approval
// data — this backend has no database) has already extracted BOTH labels
// itself, one via /extract for the uploaded artwork and one via /extract
// for the approved baseline it fetched. This is a pure JSON-in/JSON-out
// wrapper around the exact same compareLabelData() used by /compare, so
// the weighted comparison logic is never duplicated — only OCR is skipped
// here because it was already done.
// Same-company (a new version vs. its own latest approved baseline) excludes
// Address/Customer Care Number/Email from the comparison — see
// labelComparison.service.ts's ComparisonStage and the AI module brief's §7.
// An absent or unrecognised value defaults to 'cross_company' (the full
// field set) rather than rejecting the request, matching compareLabels' own
// default for callers with no stage concept.
function parseComparisonStage(value: unknown): ComparisonStage {
  return value === 'same_company' ? 'same_company' : 'cross_company';
}

export function compareExtractedLabels(req: Request, res: Response) {
  const body = req.body as { labelA?: unknown; labelB?: unknown; stage?: unknown } | undefined;
  const labelA = parseExtractionResult(body?.labelA);
  const labelB = parseExtractionResult(body?.labelB);

  if (!labelA || !labelB) {
    res.status(400).json({ success: false, message: 'Both labelA and labelB extraction results are required.' });
    return;
  }

  const comparison = compareLabelData(labelA, labelB, parseComparisonStage(body?.stage));
  res.status(200).json({ success: true, data: { labelA, labelB, comparison } });
}

// Accepts only the four fields the identify-product check actually needs —
// deliberately not the full LabelExtractionResult shape, since the check has
// no use for the other ten-plus extraction fields, and validating a narrower
// shape catches a caller sending the wrong data sooner.
function parseIdentifyProductInput(value: unknown): ProductIdentificationInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { productName, brand, marketingCompany, fssaiNumber } = record;
  if (typeof productName !== 'string' || typeof brand !== 'string' || typeof marketingCompany !== 'string') return null;
  if (fssaiNumber !== undefined && typeof fssaiNumber !== 'string') return null;
  return { productName, brand, marketingCompany, fssaiNumber };
}

// POST /api/labels/identify-product — AI module brief Step 2: given a
// label's already-extracted identity fields, checks whether it matches an
// existing Product by FSSAI number or by (Product Name + Marketing
// Company), via ai_backend's /api/v1/identify-product. Distinct from
// productService.findPossibleDuplicate (the SQL-based check the intake form
// already runs on every keystroke): that one only ever matches by name/
// brand/company; this one ALSO matches by FSSAI number, which catches a
// label whose product name was misread but whose FSSAI (a government-issued,
// effectively unique ID) still matches an existing product. See
// labelIntakeService.ts's submitLabelIntake for where this is consulted, as
// a last-resort check before a genuinely new product gets created.
//
// Never fails the request over an AI-backend outage: identifyProductWithAi's
// own no-throw guarantee (see productIdentification.service.ts's header
// comment) means 'unavailable' comes back as ordinary data, not a caught
// error — the response always carries success: true, and the caller decides
// what an "unavailable" verdict means for it.
export async function identifyProduct(req: Request, res: Response) {
  const input = parseIdentifyProductInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, message: 'productName, brand, and marketingCompany (strings) are required.' });
    return;
  }

  const existingProducts = await getProducts();
  const result = await identifyProductWithAi(input, existingProducts);
  res.status(200).json({ success: true, data: result });
}
