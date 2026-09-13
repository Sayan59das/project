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
  /** The model's transcript that vetoed the resolved brand, when that happened (diagnostics only). */
  brandVetoedBy?: string;
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

// Lines that are display text but can never be a brand or a product name:
// weights and counts ("Net Wt. 90gm (30 Gummies)"), regulatory identifiers
// ("FSSAI Lic. No.…"), the flavour line, the category line ("Health
// Supplement"). A 3B model offered such a line as an option WILL pick it —
// Sharp Mind Plus came back with brand "EKnoll Net Wt. 90gm (30 Gummies)" at
// confidence 1 — so they are kept out of the enum entirely.
const NON_NAME_LINE = [
  /\b(net\s*wt|net\s*weight|fssai|lic\.?|licen[cs]e|batch|mfg|mfd|exp\.?|expiry|mrp|rs\.?|₹)\b/i,
  /\d+\s*(gm|g|mg|mcg|µg|ml|l|kg|kcal|%)\b/i,
  /\(\s*\d+\s*[a-z]+\s*\)/i,
  /\bflavou?r(ed)?\b/i,
  /\b(health|dietary|food)\s*supplement/i,
  /\bnutraceutical/i
];

// PP-OCR reads a clean word at ≥ 0.9; "Son Lijo CUC" (0.64) and "Fod Heal"
// (0.67) are what a logo emblem or a strip edge look like when forced into
// text. Below this the read is debris, whatever it says.
const MIN_ROLE_CONFIDENCE = 0.7;

/**
 * A candidate is offered to the model (alone or inside a composite) only if
 * it could plausibly BE a brand or product name: a confident OCR read, not a
 * short rare token (logo debris — a real 3-letter brand repeats on every
 * panel), and not a weight / regulatory / flavour / category line.
 */
export function isRoleEligible(c: DisplayCandidateIn): boolean {
  if (c.confidence < MIN_ROLE_CONFIDENCE) return false;
  if (NON_NAME_LINE.some((re) => re.test(c.text))) return false;
  const tokens = norm(c.text).split(/\s+/);
  const shortSingleToken = tokens.length === 1 && tokens[0].length < 4;
  if (shortSingleToken && (c.occurrences === undefined || c.occurrences <= 2)) return false;
  return true;
}

/**
 * Build the set of valid role options: eligible single candidates plus
 * vertically-adjacent composites of eligible candidates. Returns singles
 * (deduplicated by norm, keeping first casing) + composites (pairs only),
 * deduplicated by norm, capped at 24 entries (singles first).
 *
 * Composites are built only from candidates with numeric topPx, sorted ascending.
 * A pair (a, b) is included if:
 * - vertical gap < 1.2 × max(heightPx) — candidates are close vertically
 * - height ratio <= 2 — candidates are similar size (not tiny text above huge text)
 * - normalized texts are different — avoid "foo foo" from near-duplicates
 *
 * Ineligible candidates (see isRoleEligible) are excluded from BOTH singles and
 * composites — filtering singles alone let "CUC" come back as "CUC Son Lijo CUC".
 */
export function buildRoleOptions(candidates: readonly DisplayCandidateIn[]): string[] {
  const eligible = candidates.filter(isRoleEligible);

  // Singles: deduplicated by norm, keeping first casing
  const seen = new Set<string>();
  const singles: string[] = [];
  for (const c of eligible) {
    const n = norm(c.text);
    if (!seen.has(n)) {
      seen.add(n);
      singles.push(c.text);
    }
  }

  // Composites: find vertically adjacent pairs among the eligible candidates
  const composites: string[] = [];
  const sorted = eligible.filter((c) => c.topPx !== undefined).sort((a, b) => (a.topPx ?? 0) - (b.topPx ?? 0));

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
  return [...singles, ...composites].slice(0, 24);
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
  const repetitions = candidates.filter((c) => isRoleEligible(c) && (c.occurrences ?? 1) > 1);
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

// Second, options-free call: the model transcribes the brand and product
// exactly as printed. This is an INDEPENDENT read of the same pixels — the
// enum call can only echo an OCR string, so an OCR misread of a stylised
// wordmark ("NUTRINOU" for NUTRINOL) sails through it, while the model
// itself reads NUTRINOL every time. The options are deliberately absent from
// this prompt: a 3B model shown "NUTRINOU" as an option copies it.
//
// The `confidence` field is load-bearing, not decoration: with only the two
// string fields in the schema, qwen2.5vl:3b's grammar-constrained decode
// returns two empty strings for the very image it transcribes in full once
// a number field follows them (measured 2026-09-13, Sharp Mind Plus: A/D
// empty, B/C "NUTRINOL SHARP MIND PLUS GUMMIES"). Keep prompt and schema
// together if you change either.
export const TRANSCRIBE_SCHEMA = {
  type: 'object',
  properties: {
    brandAsPrinted: { type: 'string' },
    productAsPrinted: { type: 'string' },
    confidence: { type: 'number' }
  },
  required: ['brandAsPrinted', 'productAsPrinted', 'confidence']
};

export const TRANSCRIBE_PROMPT =
  "This is the print artwork of a food-supplement label. Transcribe the BRAND name (the maker's mark, usually next to the logo and repeated on several panels) EXACTLY as printed, letter for letter, and the PRODUCT name exactly as printed. Use an empty string if unreadable. confidence is 0..1.";

/** The model's own transcription of the display text, '' when it gave none or the call failed. */
export async function transcribeDisplayText(image: VlmImage, client: VlmClient): Promise<string> {
  const raw = await client.askJson(image, TRANSCRIBE_PROMPT, TRANSCRIBE_SCHEMA);
  if (typeof raw !== 'object' || raw === null) return '';
  const obj = raw as Record<string, unknown>;
  const parts = [obj.brandAsPrinted, obj.productAsPrinted].filter((v): v is string => typeof v === 'string');
  return parts.join(' ').trim();
}

/** True when `text` appears in `transcript` as whole words (case- and hyphen-insensitive). */
export function transcriptCorroborates(transcript: string, text: string): boolean {
  const t = ` ${norm(transcript)} `;
  const needle = ` ${norm(text)} `;
  return needle.trim().length > 0 && t.includes(needle);
}

/**
 * Ask a VLM to classify which candidate is brand and which is product,
 * then ground the answer back to the original candidate text.
 *
 * A resolved BRAND must additionally survive the model's own transcription
 * (transcribeDisplayText): a non-empty transcript that does not contain it
 * vetoes it. Brands are stylised wordmarks — exactly where OCR misreads — and
 * a wrong brand is worse than a blank one (brief §3). Product names are not
 * vetoed: they are plain type OCR reads well, and the model's transcript
 * routinely omits the descriptor ("Homeo-Vita Gummies" for MULTIVITAMIN
 * GUMMIES). An empty transcript is no evidence either way.
 *
 * Returns null if:
 * - candidates array is empty (VLM not called)
 * - VLM returns invalid JSON
 * - neither brand nor productName ground to candidates (after the veto)
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
    const repeated = candidates.filter((c) => isRoleEligible(c) && (c.occurrences ?? 1) >= 3);
    if (repeated.length === 1 && (!productName || norm(repeated[0].text) !== norm(productName))) {
      finalBrand = repeated[0].text;
      finalBrandConf = 0.7;
    }
  }

  // Both grounded but same text (after norm) → the product is dropped. This
  // runs BEFORE the veto on purpose: a string the model gave for both roles
  // and then contradicted in its own transcript must not survive as the
  // product name just because the brand slot was cleared first.
  let finalProductName = productName;
  if (finalBrand && productName && norm(finalBrand) === norm(productName)) {
    finalProductName = null;
  }

  // Transcription veto (see the function comment): the brand we are about to
  // return — the model's pick or the prior's — must appear in the model's own
  // letter-for-letter read of the label, whenever it gave one.
  let brandVetoedBy: string | null = null;
  if (finalBrand) {
    const transcript = await transcribeDisplayText(image, client);
    if (transcript && !transcriptCorroborates(transcript, finalBrand)) {
      brandVetoedBy = transcript;
      finalBrand = null;
      finalBrandConf = 1.0;
    }
  }

  // Both null → reject
  if (finalBrand === null && finalProductName === null) {
    return null;
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

  const roles: DisplayRoles = {
    brand: finalBrand ?? '',
    productName: finalProductName ?? '',
    confidence
  };
  if (brandVetoedBy !== null) roles.brandVetoedBy = brandVetoedBy;
  return roles;
}
