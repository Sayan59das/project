// Dedicated client for the IMH LVS backend's Label Comparison API
// (POST /api/labels/compare — see backend/src/controllers/labels.controller.ts
// and labelComparison.service.ts). This is the ONLY module that knows the
// endpoint URL, the multipart request shape, or how to talk HTTP for this
// feature — the Comparison page and its components call compareLabels()
// and never touch fetch/FormData directly, mirroring how
// labelExtractionService.ts is the sole HTTP boundary for extraction.
import { API_BASE_URL } from './apiConfig';
import type {
  ArtworkVisualComparison,
  LabelComparisonApiResult,
  LabelComparisonFieldResult,
  LabelComparisonSummary,
  NutritionRowComparison,
  NutritionTableComparison,
  VisualComparisonResult,
  VisualComparisonStatus
} from '../types/labelComparison';
import type { LabelExtractionApiResult } from './labelExtractionService';

// Thrown only for transport/server-side problems (network unreachable,
// backend down, unexpected response shape, or a validation rejection from
// the backend itself — missing file, unsupported type, oversized file).
// Never thrown just because a comparison field couldn't be confidently
// matched — that's a normal success response reporting MISSING/DIFFERENT/
// NOT_COMPARED on that field.
export class LabelComparisonError extends Error {}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readExtractionResult(data: unknown): LabelExtractionApiResult {
  const record = (data ?? {}) as Record<string, unknown>;
  return {
    marketingCompany: readString(record.marketingCompany),
    address: readString(record.address),
    fssaiNumber: readString(record.fssaiNumber),
    email: readString(record.email),
    customerCareNumber: readString(record.customerCareNumber),
    brand: readString(record.brand),
    flavour: readString(record.flavour),
    productName: readString(record.productName),
    packageSize: readString(record.packageSize),
    manufacturingCompany: readString(record.manufacturingCompany),
    colourTheme: readString(record.colourTheme),
    claims: readString(record.claims),
    ingredients: readString(record.ingredients),
    nutritionTableFormat: readString(record.nutritionTableFormat),
    nutritionTable: readString(record.nutritionTable)
  };
}

function readComparisonSummary(data: unknown): LabelComparisonSummary {
  const record = (data ?? {}) as Record<string, unknown>;
  const rawFields = Array.isArray(record.fields) ? record.fields : [];
  const fields: LabelComparisonFieldResult[] = rawFields.map((raw) => {
    const field = raw as Record<string, unknown>;
    return {
      field: readString(field.field) as LabelComparisonFieldResult['field'],
      label: readString(field.label),
      labelA: readString(field.labelA),
      labelB: readString(field.labelB),
      status: readString(field.status) as LabelComparisonFieldResult['status'],
      similarity: typeof field.similarity === 'number' ? field.similarity : 0,
      weight: typeof field.weight === 'number' ? field.weight : 0,
      importance: readString(field.importance) as LabelComparisonFieldResult['importance']
    };
  });

  return {
    fields,
    overallPercentage: typeof record.overallPercentage === 'number' ? record.overallPercentage : 0,
    totalFieldsCompared: typeof record.totalFieldsCompared === 'number' ? record.totalFieldsCompared : 0,
    matchingFields: typeof record.matchingFields === 'number' ? record.matchingFields : 0,
    similarFields: typeof record.similarFields === 'number' ? record.similarFields : 0,
    conflictingFields: typeof record.conflictingFields === 'number' ? record.conflictingFields : 0,
    missingFields: typeof record.missingFields === 'number' ? record.missingFields : 0,
    notComparedFields: typeof record.notComparedFields === 'number' ? record.notComparedFields : 0,
    nutritionComparison: readNutritionComparison(record.nutritionComparison)
  };
}

function readNutritionComparison(data: unknown): NutritionTableComparison | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  const rawRows = Array.isArray(record.rows) ? record.rows : [];
  const rows: NutritionRowComparison[] = rawRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      nutrient: readString(row.nutrient),
      valueA: readString(row.valueA),
      valueB: readString(row.valueB),
      status: readString(row.status) as NutritionRowComparison['status']
    };
  });
  return {
    rows,
    matchingRows: typeof record.matchingRows === 'number' ? record.matchingRows : 0,
    similarRows: typeof record.similarRows === 'number' ? record.similarRows : 0,
    conflictingRows: typeof record.conflictingRows === 'number' ? record.conflictingRows : 0,
    missingRows: typeof record.missingRows === 'number' ? record.missingRows : 0
  };
}

// Posts both label files to the backend, which extracts each with the
// same OCR pipeline used everywhere else in the app and returns a
// field-by-field comparison. Never guesses or computes anything
// client-side — this is purely a request/response boundary.
export async function compareLabels(labelAFile: File, labelBFile: File): Promise<LabelComparisonApiResult> {
  const formData = new FormData();
  formData.append('labelA', labelAFile);
  formData.append('labelB', labelBFile);

  const compareUrl = `${API_BASE_URL}/api/labels/compare`;

  let response: Response;
  try {
    // credentials: 'include' — see labelExtractionService.ts's extractLabel
    // for why this is required, not optional, on every /api/labels/* call.
    response = await fetch(compareUrl, { method: 'POST', body: formData, credentials: 'include' });
  } catch (err) {
    console.error(`[labelComparisonService] Request to ${compareUrl} failed:`, err);
    throw new LabelComparisonError('Label comparison service is currently unavailable. Please try again.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LabelComparisonError('The label comparison service returned an unexpected response.');
  }

  const parsed = body as { success?: boolean; message?: string; data?: Record<string, unknown> } | null;

  if (!response.ok || !parsed?.success) {
    throw new LabelComparisonError(readString(parsed?.message) || 'Could not compare the uploaded labels. Please try again.');
  }

  const data = parsed.data ?? {};
  return {
    labelA: readExtractionResult(data.labelA),
    labelB: readExtractionResult(data.labelB),
    comparison: readComparisonSummary(data.comparison)
  };
}

function readVisualComparisonResult(data: unknown): VisualComparisonResult {
  const record = (data ?? {}) as Record<string, unknown>;
  const status = readString(record.status) as VisualComparisonStatus;
  return {
    status: status || 'MISSING',
    similarityPercentage: typeof record.similarityPercentage === 'number' ? record.similarityPercentage : undefined
  };
}

function readArtworkVisualComparison(data: unknown): ArtworkVisualComparison {
  const record = (data ?? {}) as Record<string, unknown>;
  return {
    artworkSimilarity: readVisualComparisonResult(record.artworkSimilarity),
    colourSimilarity: readVisualComparisonResult(record.colourSimilarity)
  };
}

// Posts both artwork files for Artwork/Colour Similarity visual comparison
// (POST /api/labels/compare-visual) — the visual counterpart to
// compareExtractedLabels below. Kept separate because it needs the actual
// image bytes, not extracted text fields; see
// backend/src/services/imageSimilarity.service.ts for what it measures.
export async function compareVisual(labelAFile: File, labelBFile: File): Promise<ArtworkVisualComparison> {
  const formData = new FormData();
  formData.append('labelA', labelAFile);
  formData.append('labelB', labelBFile);

  const compareUrl = `${API_BASE_URL}/api/labels/compare-visual`;

  let response: Response;
  try {
    // credentials: 'include' — see labelExtractionService.ts's extractLabel
    // for why this is required, not optional, on every /api/labels/* call.
    response = await fetch(compareUrl, { method: 'POST', body: formData, credentials: 'include' });
  } catch (err) {
    console.error(`[labelComparisonService] Request to ${compareUrl} failed:`, err);
    throw new LabelComparisonError('Visual comparison service is currently unavailable. Please try again.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LabelComparisonError('The visual comparison service returned an unexpected response.');
  }

  const parsed = body as { success?: boolean; message?: string; data?: Record<string, unknown> } | null;

  if (!response.ok || !parsed?.success) {
    throw new LabelComparisonError(readString(parsed?.message) || 'Could not compare the uploaded artwork images. Please try again.');
  }

  return readArtworkVisualComparison(parsed.data?.visualComparison);
}

// Posts ONE subject artwork against MANY candidates (POST
// /api/labels/compare-visual-batch) in a single request — used by the
// cross-company comparison loop, which otherwise re-uploads and re-hashes
// the identical subject file once per candidate. Returns results in the
// same order `candidateFiles` was given, so the caller can zip them back
// onto whichever candidates they came from.
export async function compareVisualBatch(subjectFile: File, candidateFiles: File[]): Promise<ArtworkVisualComparison[]> {
  const formData = new FormData();
  formData.append('subject', subjectFile);
  candidateFiles.forEach((file) => formData.append('candidates', file));

  const compareUrl = `${API_BASE_URL}/api/labels/compare-visual-batch`;

  let response: Response;
  try {
    response = await fetch(compareUrl, { method: 'POST', body: formData, credentials: 'include' });
  } catch (err) {
    console.error(`[labelComparisonService] Request to ${compareUrl} failed:`, err);
    throw new LabelComparisonError('Visual comparison service is currently unavailable. Please try again.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LabelComparisonError('The visual comparison service returned an unexpected response.');
  }

  const parsed = body as { success?: boolean; message?: string; data?: Record<string, unknown> } | null;

  if (!response.ok || !parsed?.success) {
    throw new LabelComparisonError(readString(parsed?.message) || 'Could not compare the uploaded artwork images. Please try again.');
  }

  const rawResults = Array.isArray(parsed.data?.results) ? (parsed.data!.results as unknown[]) : [];
  return rawResults.map(readArtworkVisualComparison);
}

// Posts two ALREADY-EXTRACTED labels for comparison (POST
// /api/labels/compare-extracted) — used by Quick Label Comparison, which
// extracts the uploaded artwork and the automatically-selected latest
// approved artwork itself (via extractLabel() above, once each) rather than
// letting the backend re-extract from files a second time. The backend
// endpoint does no OCR at all; it only runs the same weighted comparison
// service compareLabels() above already uses.
export async function compareExtractedLabels(
  labelA: LabelExtractionApiResult,
  labelB: LabelExtractionApiResult,
  stage: 'same_company' | 'cross_company' = 'cross_company'
): Promise<LabelComparisonApiResult> {
  const compareUrl = `${API_BASE_URL}/api/labels/compare-extracted`;

  let response: Response;
  try {
    response = await fetch(compareUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelA, labelB, stage }),
      credentials: 'include'
    });
  } catch (err) {
    console.error(`[labelComparisonService] Request to ${compareUrl} failed:`, err);
    throw new LabelComparisonError('Label comparison service is currently unavailable. Please try again.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LabelComparisonError('The label comparison service returned an unexpected response.');
  }

  const parsed = body as { success?: boolean; message?: string; data?: Record<string, unknown> } | null;

  if (!response.ok || !parsed?.success) {
    throw new LabelComparisonError(readString(parsed?.message) || 'Could not compare the uploaded labels. Please try again.');
  }

  const data = parsed.data ?? {};
  return {
    labelA: readExtractionResult(data.labelA),
    labelB: readExtractionResult(data.labelB),
    comparison: readComparisonSummary(data.comparison)
  };
}
