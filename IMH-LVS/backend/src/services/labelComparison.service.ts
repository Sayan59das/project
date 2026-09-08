// Field-by-field comparison of two already-extracted labels (V1 of Label
// Comparison — see backend/src/controllers/labels.controller.ts's
// compareLabels() and the frontend Comparison page).
//
// This module never touches OCR/extraction itself — it only compares two
// LabelExtractionResult objects the caller already produced via the
// existing extractLabelFromFile() pipeline. It has no knowledge of files,
// requests, or HTTP.
//
// Scope note: this compares every field LabelExtractionResult actually
// carries — see labelExtraction.service.ts's own comment on that type.
// Logo and Label Design/Layout are compared separately, on the actual
// artwork pixels rather than as text — see imageSimilarity.service.ts and
// its own module comment for why a text-field comparison can't do that
// job. Any field LabelExtractionResult gains in the future needs only an
// entry below; weighting, status, and the summary all pick it up
// automatically.
import type { LabelExtractionResult } from './labelExtraction.service';

// MATCH/SIMILAR/CONFLICT/MISSING is the AI module brief's §8 status
// vocabulary. NOT_COMPARED is this engine's own addition on top of it —
// neither label stating a field at all is a different situation from a
// genuine mismatch (see the MISSING/NOT_COMPARED split in compareField
// below), and collapsing that distinction away would make a field neither
// label ever fills in look identical to two labels that actually disagree.
export type FieldComparisonStatus = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING' | 'NOT_COMPARED';

export type FieldImportance = 'HIGH' | 'MEDIUM' | 'LOW';

export type LabelComparisonField = keyof LabelExtractionResult;

/**
 * Which comparison this is — see the AI module brief's section 7. Two labels from
 * the SAME marketing company (a new version vs. its latest approved
 * baseline) share one company's own contact details by construction, so a
 * mismatch there is a data-entry error, not a signal the labels are
 * different products — these fields are excluded from that comparison
 * entirely rather than scored. A CROSS-company comparison is exactly the
 * opposite case: two different companies' contact details are expected to
 * differ, and confirming they do (or flagging when they don't, which can
 * indicate a copied/misattributed label) is part of the point.
 */
export type ComparisonStage = 'same_company' | 'cross_company';

// Compared only for a cross_company comparison — see ComparisonStage above.
const CROSS_COMPANY_ONLY_FIELDS: ReadonlySet<LabelComparisonField> = new Set(['address', 'customerCareNumber', 'email']);

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
  similarFields: number;
  conflictingFields: number;
  missingFields: number;
  notComparedFields: number;
  // AI module brief §7/§12 — the nutrition panel's actual rows compared
  // nutrient by nutrient, not just the coarse nutritionTableFormat
  // classification string (still one of the fields above). Undefined, not
  // an empty result, when neither side has a structured table to compare —
  // see compareNutritionTables below for when that is. Deliberately NOT
  // folded into overallPercentage: nutritionTableFormat already contributes
  // its own weight to that score, and adding a second, more granular signal
  // for the same panel would double-count it.
  nutritionComparison?: NutritionTableComparison;
};

export type NutritionRowStatus = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING';

export type NutritionRowComparison = {
  nutrient: string;
  valueA: string;
  valueB: string;
  status: NutritionRowStatus;
};

export type NutritionTableComparison = {
  rows: NutritionRowComparison[];
  matchingRows: number;
  similarRows: number;
  conflictingRows: number;
  missingRows: number;
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
//
// colourTheme/claims/ingredients/nutritionTableFormat are compared as
// plain strings, same as every other field here.
// ---------------------------------------------------------------------
const FIELD_CONFIG: { field: LabelComparisonField; label: string; weight: number; importance: FieldImportance }[] = [
  { field: 'brand', label: 'Brand', weight: 3, importance: 'HIGH' },
  { field: 'productName', label: 'Product Name', weight: 3, importance: 'HIGH' },
  { field: 'marketingCompany', label: 'Marketing Company', weight: 3, importance: 'HIGH' },
  { field: 'fssaiNumber', label: 'FSSAI Number', weight: 3, importance: 'HIGH' },
  { field: 'flavour', label: 'Flavour', weight: 2, importance: 'MEDIUM' },
  { field: 'packageSize', label: 'Package Size', weight: 2, importance: 'MEDIUM' },
  { field: 'colourTheme', label: 'Colour Theme', weight: 2, importance: 'MEDIUM' },
  { field: 'claims', label: 'Claims', weight: 2, importance: 'MEDIUM' },
  { field: 'ingredients', label: 'Ingredients', weight: 2, importance: 'MEDIUM' },
  { field: 'nutritionTableFormat', label: 'Nutrition Table Format', weight: 2, importance: 'MEDIUM' },
  { field: 'address', label: 'Address', weight: 2, importance: 'MEDIUM' },
  { field: 'customerCareNumber', label: 'Customer Care Number', weight: 2, importance: 'MEDIUM' },
  { field: 'email', label: 'Email', weight: 2, importance: 'MEDIUM' },
  { field: 'manufacturingCompany', label: 'Manufacturing Company', weight: 1, importance: 'LOW' }
];

// ---------------------------------------------------------------------
// Normalization — for COMPARISON purposes only. The labelA/labelB values
// returned in FieldComparisonResult are always the exact, untouched
// strings extraction produced; normalization never changes what's
// displayed, only what's used to decide MATCH vs SIMILAR vs CONFLICT.
//
// Case-insensitive, whitespace-collapsing, and trailing-punctuation-
// insensitive only ("Nutrinol" vs "NUTRINOL", or "Knoll Pharmaceuticals
// Ltd." vs "Knoll Pharmaceuticals Ltd" are the same value with cosmetic
// differences). This alone is still not fuzzy matching — it's what decides
// exact equality (MATCH); genuine near-matches are handled separately by
// isSimilarText below, kept apart on purpose so the difference between "the
// same value, cosmetically formatted differently" and "a genuinely
// different but closely related value" stays visible in the two distinct
// statuses.
// ---------------------------------------------------------------------
function normalizeForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '');
}

// Classic Levenshtein (single-character insert/delete/substitute) edit
// distance. O(n*m); every field value here is short label text (a claim, a
// product name), never a paragraph, so this is cheap in practice.
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(Math.min(currentRow[j - 1] + 1, previousRow[j] + 1, previousRow[j - 1] + cost));
    }
    previousRow = currentRow;
  }
  return previousRow[b.length];
}

// Generic connector words carry no claim-identifying meaning on their own:
// "Sugar Free" and "Gluten Free" share the word "free" but are two
// completely different claims, and "free" alone must never manufacture a
// false SIMILAR the way a shared meaningful word like "immunity" should.
// This is a small set of general-language stopwords, not product data —
// it applies identically regardless of what product, brand or claim is
// being compared, so it isn't the kind of product-specific hardcoding the
// brief's §3 forbids (that's about baking in specific brand/flavour/
// company names, not general-language connector words).
// Measurement units are included for the same reason: "2 g" vs. "5 g" (a
// real, different Protein amount — see compareNutritionTables below, which
// reuses this same overlap check) share the token "g", and without
// excluding it that shared unit alone would outweigh the one token that
// actually differs and matters — the number itself.
const OVERLAP_STOPWORDS = new Set([
  'free', 'with', 'and', 'the', 'for', 'of', 'a', 'an', 'to', 'in', 'on',
  'g', 'mg', 'mcg', 'kg', 'ml', 'l', 'kcal', 'cal', 'iu', 'oz', 'lb'
]);

// Fraction of A's meaningful words that also appear (verbatim) in B, out of
// the larger of the two meaningful-word counts — a plain, order-independent
// overlap measure. "Supports Immunity" vs. "Boosts Immunity" share one of
// their two words ("immunity"), for a ratio of 0.5.
function tokenOverlapRatio(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter((token) => token && !OVERLAP_STOPWORDS.has(token)));
  const tokensB = new Set(b.split(/\s+/).filter((token) => token && !OVERLAP_STOPWORDS.has(token)));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) shared += 1;
  }
  return shared / Math.max(tokensA.size, tokensB.size);
}

// Thresholds are an initial, documented calibration — there is no labelled
// dataset yet to tune these against real same/different-claim pairs, so
// they're chosen to match the AI module brief's own worked examples rather
// than measured. Revisit once real data exists.
//
// A normalized edit distance under 25% of the longer string's length reads
// as a spelling/wording variant of the same value ("Boost Immunity" vs.
// "Boosts Immunity" — a two-character edit on a 16-character string, 12%).
// A word-overlap of at least 40% reads as the same underlying claim worded
// differently even when the edit distance is large ("Supports Immunity"
// vs. "Boosts Immunity" — very different first words, but this is the
// brief's own §10 example of a SIMILAR pair, sharing the word "immunity").
// Meeting neither threshold means no meaningful similarity was detected at
// all, which is a CONFLICT, not a SIMILAR.
const EDIT_DISTANCE_SIMILARITY_THRESHOLD = 0.25;
const TOKEN_OVERLAP_SIMILARITY_THRESHOLD = 0.4;

// SIMILAR gets half credit toward the overall score — a real but partial
// match, scored between a MATCH's full weight and a CONFLICT/MISSING's
// zero, rather than being folded into either extreme.
const SIMILAR_FIELD_SCORE = 0.5;

function isSimilarText(normalizedA: string, normalizedB: string): boolean {
  if (!normalizedA || !normalizedB) return false;
  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  const editRatio = maxLength > 0 ? levenshteinDistance(normalizedA, normalizedB) / maxLength : 0;
  if (editRatio <= EDIT_DISTANCE_SIMILARITY_THRESHOLD) return true;
  return tokenOverlapRatio(normalizedA, normalizedB) >= TOKEN_OVERLAP_SIMILARITY_THRESHOLD;
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
    // CONFLICT (that's reserved for two values that were both read and
    // don't match).
    status = 'MISSING';
    similarity = 0;
  } else {
    const normalizedA = normalizeForComparison(trimmedA);
    const normalizedB = normalizeForComparison(trimmedB);
    if (normalizedA === normalizedB) {
      status = 'MATCH';
      similarity = 1;
    } else if (isSimilarText(normalizedA, normalizedB)) {
      status = 'SIMILAR';
      similarity = SIMILAR_FIELD_SCORE;
    } else {
      status = 'CONFLICT';
      similarity = 0;
    }
  }

  return { field, label, labelA: valueA, labelB: valueB, status, similarity, weight, importance };
}

// LabelExtractionResult.nutritionTable is a JSON-encoded nutrient->amount
// map (see that type's own comment) — only ever populated via the AI
// backend's vision-model fallback, never Tesseract. Returns undefined
// rather than throwing for '' or malformed JSON, the same "absent, not an
// error" treatment every other unread field gets.
function parseNutritionTable(value: string): Record<string, string> | undefined {
  if (!value.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Not JSON, or malformed — treated as absent, never crashes the
    // comparison over a value it can't parse.
  }
  return undefined;
}

// Nutrient names are matched case/whitespace-insensitively so the same
// nutrient printed with slightly different capitalisation or spacing
// ("Vitamin C" vs. "vitamin  c") is still recognised as the same row,
// rather than reported as one side missing it entirely.
function normalizeNutrientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Compares two nutrition tables nutrient by nutrient (AI module brief
 * §7/§12) — a changed Protein value is a real, specific CONFLICT on that
 * row, not just a difference somewhere inside an opaque format string.
 *
 * Returns undefined, not an empty result, when NEITHER side has a
 * structured table to compare — most labels today, since only the AI
 * backend's vision-model fallback ever populates this field (see
 * LabelExtractionResult's own comment), and that fallback itself only
 * triggers when Tesseract couldn't read certain identity fields. This is
 * an honest, current limitation of what gets extracted, not a bug in the
 * comparison itself — the coarse nutritionTableFormat field (one of the 14
 * FIELD_CONFIG entries) still gets compared regardless.
 */
export function compareNutritionTables(rawA: string, rawB: string): NutritionTableComparison | undefined {
  const tableA = parseNutritionTable(rawA);
  const tableB = parseNutritionTable(rawB);
  if (!tableA && !tableB) return undefined;

  const bySideA = new Map<string, { label: string; value: string }>();
  for (const [label, value] of Object.entries(tableA ?? {})) {
    bySideA.set(normalizeNutrientName(label), { label, value: String(value) });
  }
  const bySideB = new Map<string, { label: string; value: string }>();
  for (const [label, value] of Object.entries(tableB ?? {})) {
    bySideB.set(normalizeNutrientName(label), { label, value: String(value) });
  }

  const allNutrients = new Set([...bySideA.keys(), ...bySideB.keys()]);
  const rows: NutritionRowComparison[] = [];
  for (const key of allNutrients) {
    const entryA = bySideA.get(key);
    const entryB = bySideB.get(key);
    const nutrient = entryA?.label ?? entryB?.label ?? key;
    const valueA = entryA?.value.trim() ?? '';
    const valueB = entryB?.value.trim() ?? '';

    let status: NutritionRowStatus;
    if (!valueA || !valueB) {
      status = 'MISSING';
    } else {
      const normalizedA = normalizeForComparison(valueA);
      const normalizedB = normalizeForComparison(valueB);
      if (normalizedA === normalizedB) status = 'MATCH';
      else if (isSimilarText(normalizedA, normalizedB)) status = 'SIMILAR';
      else status = 'CONFLICT';
    }
    rows.push({ nutrient, valueA, valueB, status });
  }

  // Alphabetical by nutrient name for stable, readable output — the
  // underlying Set has no meaningful order of its own.
  rows.sort((a, b) => a.nutrient.localeCompare(b.nutrient));

  return {
    rows,
    matchingRows: rows.filter((r) => r.status === 'MATCH').length,
    similarRows: rows.filter((r) => r.status === 'SIMILAR').length,
    conflictingRows: rows.filter((r) => r.status === 'CONFLICT').length,
    missingRows: rows.filter((r) => r.status === 'MISSING').length
  };
}

// Compares two already-extracted labels field by field and produces a
// weighted overall result. Pure and synchronous — no I/O, no OCR, so it's
// trivially unit-testable and safe to call from any controller.
//
// `stage` defaults to 'cross_company' (the full field set) rather than
// making callers pass it: the raw two-file /compare endpoint has no concept
// of same-vs-cross-company at all, and comparing everything is the correct,
// conservative behavior for an ad-hoc "just diff these two files" request.
export function compareLabels(
  labelA: LabelExtractionResult,
  labelB: LabelExtractionResult,
  stage: ComparisonStage = 'cross_company'
): LabelComparisonResult {
  const fieldConfig = stage === 'same_company' ? FIELD_CONFIG.filter((entry) => !CROSS_COMPANY_ONLY_FIELDS.has(entry.field)) : FIELD_CONFIG;
  const fields = fieldConfig.map(({ field, label, weight, importance }) =>
    compareField(field, label, weight, importance, labelA[field], labelB[field])
  );

  const matchingFields = fields.filter((f) => f.status === 'MATCH').length;
  const similarFields = fields.filter((f) => f.status === 'SIMILAR').length;
  const conflictingFields = fields.filter((f) => f.status === 'CONFLICT').length;
  const missingFields = fields.filter((f) => f.status === 'MISSING').length;
  const notComparedFields = fields.filter((f) => f.status === 'NOT_COMPARED').length;

  // NOT_COMPARED fields (neither label states them) are excluded from both
  // the weighted score and "total fields compared" — a field neither label
  // mentions can't count for or against a match. MISSING/CONFLICT fields DO
  // count in the denominator (something was expected to compare, it just
  // didn't match) but contribute zero matched weight; SIMILAR contributes
  // half its weight — a real but partial match, per SIMILAR_FIELD_SCORE
  // above.
  const consideredFields = fields.filter((f) => f.status !== 'NOT_COMPARED');
  const totalConsideredWeight = consideredFields.reduce((sum, f) => sum + f.weight, 0);
  const matchedWeight = consideredFields.reduce((sum, f) => sum + f.weight * f.similarity, 0);
  const overallPercentage = totalConsideredWeight > 0 ? Math.round((matchedWeight / totalConsideredWeight) * 100) : 0;

  return {
    fields,
    overallPercentage,
    totalFieldsCompared: consideredFields.length,
    matchingFields,
    similarFields,
    conflictingFields,
    missingFields,
    notComparedFields,
    nutritionComparison: compareNutritionTables(labelA.nutritionTable, labelB.nutritionTable)
  };
}
