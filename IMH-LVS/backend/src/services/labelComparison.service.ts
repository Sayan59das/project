// Field-by-field comparison of two already-extracted labels (V1 of Label
// Comparison — see backend/src/controllers/labels.controller.ts's
// compareLabels() and the frontend Comparison page).
//
// This module never touches OCR/extraction itself — it only compares two
// LabelExtractionResult objects the caller already produced via the
// existing extractLabelFromFile() pipeline. It has no knowledge of files,
// requests, or HTTP.
//
// Scope note: the task that introduced this only lists fields the
// extraction pipeline actually produces today (see
// labelFieldExtractor.service.ts's ExtractedLabelFields and this module's
// LabelExtractionResult). Claims, ingredients, logo, layout, and nutrition
// are NOT compared here because nothing currently extracts them — adding
// those would mean extending the OCR pipeline itself, which is out of
// scope for this comparison feature and risks the extraction behavior
// every existing test and regression fixture depends on. When/if those
// fields are extracted in a later version, add them to FIELD_CONFIG below
// and everything else (weighting, status, summary) picks them up
// automatically.
import type { LabelExtractionResult } from './labelExtraction.service';

export type FieldComparisonStatus = 'MATCH' | 'DIFFERENT' | 'MISSING' | 'NOT_COMPARED';

export type FieldImportance = 'HIGH' | 'MEDIUM' | 'LOW';

export type LabelComparisonField = keyof LabelExtractionResult;

export type FieldComparisonResult = {
  field: LabelComparisonField;
  label: string;
  labelA: string;
  labelB: string;
  status: FieldComparisonStatus;
  similarity: number;
  weight: number;
  importance: FieldImportance;
};

export type LabelComparisonResult = {
  fields: FieldComparisonResult[];
  overallPercentage: number;
  totalFieldsCompared: number;
  matchingFields: number;
  differentFields: number;
  missingFields: number;
  notComparedFields: number;
};

// ---------------------------------------------------------------------
// Field configuration — the single place that defines which fields are
// compared, in what order, under what display name, and with what weight.
// Change weights/importance here only; nothing else needs to change.
//
// High importance: the fields that most directly identify WHAT the label
// is and WHO is responsible for it — a mismatch here means these are very
// likely two genuinely different labels, not just a minor print variation.
//
// Medium importance: real identifying details, but less likely on their
// own to signal "these are different products" (a label can legitimately
// vary its package size or customer care number across print runs while
// still being the same base label).
//
// manufacturingCompany is a special case: per this system's existing
// business rule, it is NEVER read from OCR — every extraction result
// carries the same fixed constant (see labelExtraction.service.ts's
// toResult()). Comparing it will therefore always report MATCH for any
// two labels this system extracted; it's kept in the comparison for
// completeness/transparency (so the field list is honest about what was
// checked) but weighted lowest since it has no power to distinguish two
// labels from each other in this system.
// ---------------------------------------------------------------------
const FIELD_CONFIG: { field: LabelComparisonField; label: string; weight: number; importance: FieldImportance }[] = [
  { field: 'brand', label: 'Brand', weight: 3, importance: 'HIGH' },
  { field: 'productName', label: 'Product Name', weight: 3, importance: 'HIGH' },
  { field: 'marketingCompany', label: 'Marketing Company', weight: 3, importance: 'HIGH' },
  { field: 'fssaiNumber', label: 'FSSAI Number', weight: 3, importance: 'HIGH' },
  { field: 'flavour', label: 'Flavour', weight: 2, importance: 'MEDIUM' },
  { field: 'packageSize', label: 'Package Size', weight: 2, importance: 'MEDIUM' },
  { field: 'address', label: 'Address', weight: 2, importance: 'MEDIUM' },
  { field: 'customerCareNumber', label: 'Customer Care Number', weight: 2, importance: 'MEDIUM' },
  { field: 'email', label: 'Email', weight: 2, importance: 'MEDIUM' },
  { field: 'manufacturingCompany', label: 'Manufacturing Company', weight: 1, importance: 'LOW' }
];

// ---------------------------------------------------------------------
// Normalization — for COMPARISON purposes only. The labelA/labelB values
// returned in FieldComparisonResult are always the exact, untouched
// strings extraction produced; normalization never changes what's
// displayed, only what's used to decide MATCH vs DIFFERENT.
//
// Deliberately conservative: case-insensitive, whitespace-collapsing, and
// trailing-punctuation-insensitive only ("Nutrinol" vs "NUTRINOL", or
// "Knoll Pharmaceuticals Ltd." vs "Knoll Pharmaceuticals Ltd" are the same
// value with cosmetic differences). This is NOT fuzzy/similarity matching
// — two genuinely different strings (e.g. two different product names)
// are never normalized into looking equal. There is no dictionary,
// edit-distance, or partial-match logic here on purpose.
// ---------------------------------------------------------------------
function normalizeForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '');
}

function compareField(field: LabelComparisonField, label: string, weight: number, importance: FieldImportance, rawA: string, rawB: string): FieldComparisonResult {
  const valueA = rawA ?? '';
  const valueB = rawB ?? '';
  const trimmedA = valueA.trim();
  const trimmedB = valueB.trim();

  let status: FieldComparisonStatus;
  let similarity: number;

  if (!trimmedA && !trimmedB) {
    // Neither label states this field — there's nothing to compare, and
    // that's not the same as a discrepancy (see the MISSING branch below).
    status = 'NOT_COMPARED';
    similarity = 0;
  } else if (!trimmedA || !trimmedB) {
    // Exactly one side has a value — this is a gap in one label, not a
    // conflict between two different values. Must never be reported as
    // DIFFERENT (that's reserved for two values that were both read and
    // don't match).
    status = 'MISSING';
    similarity = 0;
  } else if (normalizeForComparison(trimmedA) === normalizeForComparison(trimmedB)) {
    status = 'MATCH';
    similarity = 1;
  } else {
    status = 'DIFFERENT';
    similarity = 0;
  }

  return { field, label, labelA: valueA, labelB: valueB, status, similarity, weight, importance };
}

// Compares two already-extracted labels field by field and produces a
// weighted overall result. Pure and synchronous — no I/O, no OCR, so it's
// trivially unit-testable and safe to call from any controller.
export function compareLabels(labelA: LabelExtractionResult, labelB: LabelExtractionResult): LabelComparisonResult {
  const fields = FIELD_CONFIG.map(({ field, label, weight, importance }) =>
    compareField(field, label, weight, importance, labelA[field], labelB[field])
  );

  const matchingFields = fields.filter((f) => f.status === 'MATCH').length;
  const differentFields = fields.filter((f) => f.status === 'DIFFERENT').length;
  const missingFields = fields.filter((f) => f.status === 'MISSING').length;
  const notComparedFields = fields.filter((f) => f.status === 'NOT_COMPARED').length;

  // NOT_COMPARED fields (neither label states them) are excluded from both
  // the weighted score and "total fields compared" — a field neither label
  // mentions can't count for or against a match. MISSING fields DO count
  // in the denominator (something was expected to compare, one side just
  // didn't have it) but contribute zero matched weight, same as DIFFERENT.
  const consideredFields = fields.filter((f) => f.status !== 'NOT_COMPARED');
  const totalConsideredWeight = consideredFields.reduce((sum, f) => sum + f.weight, 0);
  const matchedWeight = consideredFields.filter((f) => f.status === 'MATCH').reduce((sum, f) => sum + f.weight, 0);
  const overallPercentage = totalConsideredWeight > 0 ? Math.round((matchedWeight / totalConsideredWeight) * 100) : 0;

  return {
    fields,
    overallPercentage,
    totalFieldsCompared: consideredFields.length,
    matchingFields,
    differentFields,
    missingFields,
    notComparedFields
  };
}
