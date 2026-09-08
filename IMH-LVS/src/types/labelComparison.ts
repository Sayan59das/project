// Types for the Label Comparison V1 feature (POST /api/labels/compare) —
// mirrors backend/src/services/labelComparison.service.ts's shapes
// exactly, field for field, since this is the same JSON the backend
// returns; there is no separate frontend-side mapping layer for this
// feature the way extractionService.ts remaps extraction fields for the
// Artwork upload form. Kept distinct from that existing product-intake
// flow and from types/comparison.ts (the existing artwork-version
// comparison history/workflow) — this is a new, standalone "upload two
// files, compare their extracted data" utility.
import type { LabelExtractionApiResult } from '../services/labelExtractionService';

// MATCH/SIMILAR/CONFLICT/MISSING is the AI module brief's §8 vocabulary.
// NOT_COMPARED is the backend engine's own addition on top of it — see
// labelComparison.service.ts's own comment on why neither label stating a
// field at all is a different situation from a genuine mismatch. SIMILAR
// is a real, computed spelling/wording-variant detection (edit distance +
// token overlap), not a UI-layer guess — see the backend's isSimilarText.
export type LabelComparisonFieldStatus = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING' | 'NOT_COMPARED';

export type LabelComparisonFieldImportance = 'HIGH' | 'MEDIUM' | 'LOW';

export type LabelComparisonFieldResult = {
  field: keyof LabelExtractionApiResult;
  label: string;
  labelA: string;
  labelB: string;
  status: LabelComparisonFieldStatus;
  similarity: number;
  weight: number;
  importance: LabelComparisonFieldImportance;
};

// AI module brief §7/§12 — the nutrition panel's actual rows compared
// nutrient by nutrient. Undefined when neither side has a structured table
// to compare (today: only the AI backend's vision-model fallback ever
// populates one — see backend/src/services/labelExtraction.service.ts's
// nutritionTable comment), not an empty/fabricated result.
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

export type LabelComparisonSummary = {
  fields: LabelComparisonFieldResult[];
  overallPercentage: number;
  totalFieldsCompared: number;
  matchingFields: number;
  similarFields: number;
  conflictingFields: number;
  missingFields: number;
  notComparedFields: number;
  nutritionComparison?: NutritionTableComparison;
};

export type LabelComparisonApiResult = {
  labelA: LabelExtractionApiResult;
  labelB: LabelExtractionApiResult;
  comparison: LabelComparisonSummary;
};

// Artwork Similarity (Logo / Design-Layout, AI module brief §7/§9) — POST
// /api/labels/compare-visual (see backend/src/services/imageSimilarity.service.ts).
// Same MATCH/SIMILAR/CONFLICT/MISSING vocabulary as LabelComparisonFieldStatus
// above, but computed from a continuous PIXEL similarity score (a
// perceptual hash's Hamming distance) rather than text — a genuinely
// different measurement, kept as its own type rather than reusing
// LabelComparisonFieldStatus so the two are never accidentally conflated.
//
// Reported as ONE result, not separate Logo and Design/Layout rows: both
// would be driven by the identical whole-image hash today (no logo
// localisation step exists to measure them independently), so showing two
// numbers would misrepresent one real measurement as two independent ones.
export type VisualComparisonStatus = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING';

export type VisualComparisonResult = {
  status: VisualComparisonStatus;
  similarityPercentage?: number;
};
