// Brand vs product classifier for label display regions — using a VLM to pick
// which of the OCR candidates is the brand name and which is the product name.
//
// Phase D produces ranked candidates { text, heightPx, confidence, topPx? } for
// labels whose brand/product are outlined. This service asks a VLM which
// candidate is the brand and which the product, then grounds the answer back to
// candidate text (the model may compose strings like "Gummies Multivitamin" —
// grounding turns that into "MULTIVITAMIN GUMMIES" in reading order, or rejects
// fabricated words).

import type { VlmImage, VlmClient } from './ollamaVlm.service';

export type DisplayCandidateIn = {
  text: string;
  heightPx: number;
  confidence: number;
  topPx?: number;
};

export type DisplayRoles = {
  brand: string;
  productName: string;
  confidence: number;
};

export const DISPLAY_ROLE_SCHEMA: object = {
  type: 'object',
  properties: {
    brand: { type: 'string' },
    productName: { type: 'string' },
    confidence: { type: 'number' }
  },
  required: ['brand', 'productName', 'confidence']
};

/**
 * Normalize a string for comparison: lowercase, replace non-alphanumeric
 * chars (except &, ', space) with space, collapse whitespace, trim.
 * Note: hyphens are converted to spaces so 'Homeo-Vita' and 'homeo vita' normalize to the same string.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9&' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the prompt for the VLM to classify brand vs product.
 */
export function buildDisplayRolePrompt(candidates: readonly DisplayCandidateIn[]): string {
  return (
    `This is the print artwork of a food-supplement label. OCR read these prominent display texts on it: ${JSON.stringify(
      candidates.map((c) => c.text)
    )}. Decide which one is the BRAND name (the maker's mark, often near a logo, often repeated on several panels) ` +
    `and which one is the PRODUCT name (what the item is, e.g. 'Multivitamin Gummies'). Answer using ONLY strings from the list; use an empty string when unsure. confidence is 0..1.`
  );
}

/**
 * Ground a model answer back to candidate text. Returns null if:
 * - answer is empty/blank
 * - no candidate has exact or composed match
 * - model added a word that appears in no candidate (fabrication)
 *
 * Otherwise returns candidate text, joining multiple candidates in reading order
 * (topPx ascending) if grounding was composed.
 */
export function groundToCandidates(answer: string, candidates: readonly DisplayCandidateIn[]): string | null {
  const a = norm(answer);

  // Empty answer → null
  if (a === '') {
    return null;
  }

  // (1) Exact match: find a candidate with norm(c.text) === a
  const exactMatch = candidates.find((c) => norm(c.text) === a);
  if (exactMatch) {
    return exactMatch.text;
  }

  // (2) Composed: build set of model's tokens
  const answerTokens = new Set(a.split(' '));

  // All answer tokens must appear in at least one candidate's tokens
  const allCandidateTokens = new Set<string>();
  for (const c of candidates) {
    norm(c.text)
      .split(' ')
      .forEach((t) => allCandidateTokens.add(t));
  }

  for (const token of answerTokens) {
    if (!allCandidateTokens.has(token)) {
      // Fabricated word — reject
      return null;
    }
  }

  // Filter candidates whose tokens are all in answerTokens
  const matched = candidates.filter((c) =>
    norm(c.text)
      .split(' ')
      .every((t) => answerTokens.has(t))
  );

  if (matched.length === 0) {
    return null;
  }

  // Sort by topPx ascending IF all have topPx, otherwise keep candidate order
  const sorted =
    matched.every((c) => c.topPx !== undefined) ?
      [...matched].sort((a, b) => (a.topPx ?? 0) - (b.topPx ?? 0))
    : matched;

  return sorted.map((c) => c.text).join(' ');
}

/**
 * Ask a VLM to classify which candidate is brand and which is product,
 * then ground the answer back to the original candidate text.
 *
 * Returns null if:
 * - candidates array is empty (VLM not called)
 * - VLM returns invalid JSON
 * - neither brand nor productName ground to candidates
 * - both ground to the same text (after normalization)
 */
export async function resolveDisplayRoles(
  image: VlmImage,
  candidates: readonly DisplayCandidateIn[],
  client: VlmClient
): Promise<DisplayRoles | null> {
  // Empty candidates → null (don't call VLM)
  if (candidates.length === 0) {
    return null;
  }

  // Ask VLM
  const raw = await client.askJson(image, buildDisplayRolePrompt(candidates), DISPLAY_ROLE_SCHEMA);

  // Not an object → null
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  // Ground brand and productName
  const rawObj = raw as Record<string, unknown>;
  const brand = groundToCandidates(String(rawObj.brand ?? ''), candidates);
  const productName = groundToCandidates(String(rawObj.productName ?? ''), candidates);

  // Both null → reject
  if (brand === null && productName === null) {
    return null;
  }

  // Normalize for duplicate check
  const brandNorm = brand ? norm(brand) : '';
  const productNorm = productName ? norm(productName) : '';

  // Both grounded but same text (after norm) → set productName to empty
  let finalProductName = productName;
  if (brand && productName && brandNorm === productNorm) {
    finalProductName = null;
  }

  // Extract model confidence, clamp to [0, 1]
  const modelConf = Math.max(0, Math.min(1, Number(rawObj.confidence) || 0.5));

  // Ground confidence: 1.0 if both exact (rule 1), 0.85 if any composed
  let groundConf = 1.0;
  const brandWasExact = brand && candidates.find((c) => norm(c.text) === norm(brand));
  const productWasExact = finalProductName && candidates.find((c) => norm(c.text) === norm(finalProductName));

  if ((brand && !brandWasExact) || (finalProductName && !productWasExact)) {
    groundConf = 0.85;
  }

  // Final confidence = min(modelConf, groundConf)
  const confidence = Math.min(modelConf, groundConf);

  return {
    brand: brand ?? '',
    productName: finalProductName ?? '',
    confidence
  };
}
