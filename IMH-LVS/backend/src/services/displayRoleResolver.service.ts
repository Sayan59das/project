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
  occurrences?: number;
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
 * Build the set of valid role options: single candidates plus vertically-adjacent composites.
 * Returns singles (deduplicated by norm, keeping first casing, excluding logo debris) + composites (pairs only),
 * deduplicated by norm, capped at 24 entries (singles first).
 *
 * Composites are built only from candidates with numeric topPx, sorted ascending.
 * A pair (a, b) is included if:
 * - vertical gap < 1.2 × max(heightPx) — candidates are close vertically
 * - height ratio <= 2 — candidates are similar size (not tiny text above huge text)
 * - normalized texts are different — avoid "foo foo" from near-duplicates
 *
 * Logo debris (e.g., "CUC" from an emblem) is excluded: single-token candidates with
 * fewer than 4 letters and occurrences undefined or ≤ 2 are filtered out.
 * A real 3-letter brand repeats on every panel (occurrences >= 4), so the threshold
 * guards against rare short noise while keeping legitimate repetitive branding.
 */
export function buildRoleOptions(candidates: readonly DisplayCandidateIn[]): string[] {
  // Helper: is this text single-token and short?
  const isShortSingleToken = (text: string): boolean => {
    const tokens = norm(text).split(/\s+/);
    return tokens.length === 1 && tokens[0].length < 4;
  };

  // Singles: deduplicated by norm, keeping first casing; exclude logo debris
  const seen = new Set<string>();
  const singles: string[] = [];
  for (const c of candidates) {
    const n = norm(c.text);
    if (!seen.has(n)) {
      // Exclude logo debris: short rare candidates
      if (isShortSingleToken(c.text) && (c.occurrences === undefined || c.occurrences <= 2)) {
        continue; // Skip this candidate
      }
      seen.add(n);
      singles.push(c.text);
    }
  }

  // Composites: find vertically adjacent pairs
  const composites: string[] = [];
  const withTopPx = candidates.filter((c) => c.topPx !== undefined);

  // Sort by topPx ascending
  const sorted = [...withTopPx].sort((a, b) => (a.topPx ?? 0) - (b.topPx ?? 0));

  // Check each consecutive pair
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];

    // Calculate vertical gap: distance from a's bottom to b's top
    const gap = (b.topPx ?? 0) - ((a.topPx ?? 0) + a.heightPx);
    const maxHeight = Math.max(a.heightPx, b.heightPx);
    const minHeight = Math.min(a.heightPx, b.heightPx);
    const heightRatio = maxHeight / minHeight;

    // Check conditions
    if (gap < 1.2 * maxHeight && heightRatio <= 2 && norm(a.text) !== norm(b.text)) {
      const composite = `${a.text} ${b.text}`;
      const compositeNorm = norm(composite);
      if (!seen.has(compositeNorm)) {
        seen.add(compositeNorm);
        composites.push(composite);
      }
    }
  }

  // Combine singles + composites, deduplicated, capped at 24
  const result = [...singles, ...composites].slice(0, 24);
  return result;
}

/**
 * Build the JSON schema for display role resolution with enum constraints.
 * Forces the model to choose from the provided options (plus empty string).
 */
export function buildDisplayRoleSchema(options: readonly string[]): object {
  const enumValues = [...options, ''];
  return {
    type: 'object',
    properties: {
      brand: { type: 'string', enum: enumValues },
      productName: { type: 'string', enum: enumValues },
      confidence: { type: 'number' }
    },
    required: ['brand', 'productName', 'confidence']
  };
}

/**
 * Build the prompt for the VLM to classify brand vs product.
 * Uses the role options (singles + composites) rather than raw candidate texts.
 * Includes repetition signal (occurrences) to help identify the brand wordmark.
 */
export function buildDisplayRolePrompt(candidates: readonly DisplayCandidateIn[]): string {
  const options = buildRoleOptions(candidates);
  let prompt =
    `This is the print artwork of a food-supplement label. OCR read these prominent display texts on it: ${JSON.stringify(
      options
    )}. Decide which one is the BRAND name (the maker's mark, often near a logo, often repeated on several panels) ` +
    `and which one is the PRODUCT name (what the item is, e.g. 'Multivitamin Gummies'). Answer using ONLY strings from the list; use an empty string when unsure. confidence is 0..1.`;

  // Add repetition signal if any candidate appears more than once across panels
  const repetitions = candidates.filter((c) => (c.occurrences ?? 1) > 1);
  if (repetitions.length > 0) {
    const repetitionMap = Object.fromEntries(
      repetitions.map((c) => [c.text, c.occurrences])
    );
    prompt += ` Repetition across the label's panels: ${JSON.stringify(repetitionMap)} — the brand wordmark is usually the one repeated on several panels; the product name usually appears once, on the front panel, often above a dosage-form word such as GUMMIES.`;
  }

  return prompt;
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

  // Build role options and schema with enum constraints
  const options = buildRoleOptions(candidates);
  const schema = buildDisplayRoleSchema(options);

  // Ask VLM
  const raw = await client.askJson(image, buildDisplayRolePrompt(candidates), schema);

  // Not an object → null
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  // Build allCandidates: real candidates + composites-as-candidates for grounding.
  // Composites are treated as candidates with heightPx=0 and confidence=1 so they
  // match exactly (rule 1) and get groundConf=1.0 when grounded as composites.
  const composites = options.filter(
    (opt) =>
      !candidates.some((c) => norm(c.text) === norm(opt)) // opt is a composite (not in singles)
  );
  const compositeCandidates: DisplayCandidateIn[] = composites.map((text) => ({
    text,
    heightPx: 0,
    confidence: 1,
    topPx: 0
  }));
  const allCandidates = [...candidates, ...compositeCandidates];

  // Ground brand and productName against allCandidates (real + composite)
  const rawObj = raw as Record<string, unknown>;
  const brand = groundToCandidates(String(rawObj.brand ?? ''), allCandidates);
  const productName = groundToCandidates(String(rawObj.productName ?? ''), allCandidates);

  // Deterministic prior: when the model left the brand blank, a lone candidate repeated
  // on >= 3 panels is the wordmark (on die lines the maker's mark is printed on every
  // panel: Homeo-Vita x5, Nutrinol x3). Fills a blank only, never overrides the model,
  // never duplicates the product name, and caps confidence at 0.7 (heuristic, not vision).
  // Runs BEFORE the both-null gate: the model answering ''/'' is exactly the case it is for.
  let finalBrand = brand;
  let finalBrandConf = 1.0;
  if (!finalBrand) {
    const repeated = candidates.filter((c) => (c.occurrences ?? 1) >= 3);
    if (repeated.length === 1 && (!productName || norm(repeated[0].text) !== norm(productName))) {
      finalBrand = repeated[0].text;
      finalBrandConf = 0.7;
    }
  }

  // Both null → reject
  if (finalBrand === null && productName === null) {
    return null;
  }

  // Both grounded but same text (after norm) → set productName to empty
  let finalProductName = productName;
  if (finalBrand && productName && norm(finalBrand) === norm(productName)) {
    finalProductName = null;
  }

  // Extract model confidence, clamp to [0, 1]
  const modelConf = Math.max(0, Math.min(1, Number(rawObj.confidence) || 0.5));

  // Ground confidence: 1.0 if both exact, 0.85 if any composed.
  // Exact means: the normalized text matches a single candidate in allCandidates
  // (which includes both real and composite candidates).
  let groundConf = 1.0;
  const brandWasExact = finalBrand && allCandidates.find((c) => norm(c.text) === norm(finalBrand));
  const productWasExact = finalProductName && allCandidates.find((c) => norm(c.text) === norm(finalProductName));

  if ((finalBrand && !brandWasExact) || (finalProductName && !productWasExact)) {
    groundConf = 0.85;
  }

  // Final confidence = min(modelConf, groundConf, priorConf)
  const confidence = Math.min(modelConf, groundConf, finalBrandConf);

  return {
    brand: finalBrand ?? '',
    productName: finalProductName ?? '',
    confidence
  };
}
