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

export type LabelComparisonFieldStatus = 'MATCH' | 'DIFFERENT' | 'MISSING' | 'NOT_COMPARED';

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

export type LabelComparisonSummary = {
  fields: LabelComparisonFieldResult[];
  overallPercentage: number;
  totalFieldsCompared: number;
  matchingFields: number;
  differentFields: number;
  missingFields: number;
  notComparedFields: number;
};

export type LabelComparisonApiResult = {
  labelA: LabelExtractionApiResult;
  labelB: LabelExtractionApiResult;
  comparison: LabelComparisonSummary;
};

// Logo / Design-Layout — POST /api/labels/compare-visual (see
// backend/src/services/imageSimilarity.service.ts). A separate three-tier
// status from LabelComparisonFieldStatus above: this is a continuous pixel
// similarity score bucketed into MATCH/SIMILAR/CONFLICT, not an exact-text
// match, so "SIMILAR" is a real, meaningful middle state here in a way it
// deliberately isn't for the text fields.
export type VisualComparisonStatus = 'MATCH' | 'SIMILAR' | 'CONFLICT' | 'MISSING';

export type VisualComparisonResult = {
  status: VisualComparisonStatus;
  similarityPercentage?: number;
};

// One real similarity score currently backs both rows — see
// imageSimilarity.service.ts's module comment for why (no logo/layout
// region-detection step exists yet to measure them independently).
export type VisualComparisonSummary = {
  logo: VisualComparisonResult;
  designLayout: VisualComparisonResult;
};
