// Vision-model fallback for fields Tesseract could not read.
//
// Talks to ai_backend/ (FastAPI + Qwen2-VL), which runs as a separate on-prem
// process. It is OFF unless AI_EXTRACTION_URL is set: a deployment may simply
// not run the model, and label extraction must degrade to Tesseract-only
// rather than fail.
//
// This is a SEPARATE MODULE, not a block inside labelExtraction.service.ts,
// for one reason: the mapping between the two services' field names is the
// part most likely to be wrong, and it deserves to be readable, testable, and
// in one place. Both halves of that mapping are stated explicitly below rather
// than inferred by iterating keys — the two services do not share a schema and
// never did, and code that assumes they do fails silently.
//
// GUARANTEE: this never throws and never rejects. Every failure path returns
// the caller's own result unchanged. A model that is down, slow, or talking
// nonsense must cost the upload some latency and nothing else.

import { env } from '../config/env';
import type { LabelExtractionResult } from './labelExtraction.service';

/**
 * The response shape ai_backend returns (see ai_backend/app/schemas/label.py).
 *
 * snake_case, and deliberately typed as its own thing rather than reusing
 * LabelExtractionResult: the two are DIFFERENT SCHEMAS, with different names,
 * different value types (lists and dicts here, flat strings there) and fields
 * on each side the other has no equivalent for. Writing that out is what makes
 * the mismatch visible instead of a silent no-op.
 */
type AiExtractedLabel = {
  brand_name?: string | null;
  product_name?: string | null;
  colour_theme?: string[] | null;
  flavour?: string | null;
  claims?: string[] | null;
  logo?: string | null;
  layout?: string | null;
  nutrition_table?: Record<string, unknown> | null;
  fssai_number?: string | null;
  ingredients?: string[] | null;
  marketing_company?: string | null;
  address?: string | null;
  customer_care_number?: string | null;
  customer_care_email?: string | null;
  package_size?: string | null;
  manufacturing_company?: string | null;
};

/**
 * Which of OUR fields is worth a call to a slow local model.
 *
 * Identity only. The obvious rule — "call the model if ANY field is empty" —
 * fires on essentially every real label, because plenty of fields are
 * legitimately absent (not every label prints a customer care email), and it
 * would put a multi-second model call in front of every single upload while
 * describing itself as a fallback.
 *
 * These four are the fields the intake pipeline needs to match a label to a
 * product at all (see labelIntakeService.findPossibleProductMatches). If they
 * were read, a gap elsewhere is a MISSING for a reviewer to resolve, not a
 * reason to wake the GPU.
 */
const TRIGGER_FIELDS = ['brand', 'productName', 'marketingCompany', 'fssaiNumber'] as const;

/**
 * How each field of THEIR schema becomes a field of OURS.
 *
 * Every entry is deliberate, and the omissions are as deliberate as the
 * entries:
 *
 *  - `logo` and `layout` have no destination. Both are genuinely visual and
 *    want a same/different verdict between two artworks rather than a
 *    description, which is why LabelExtractionResult has no field for either
 *    (see its own comment) — see imageSimilarity.service.ts instead, which
 *    compares them on the actual artwork pixels.
 *
 *  - `ingredients` and `nutrition_table` have no destination EITHER, and that
 *    is a deliberate, evidence-based exclusion rather than an oversight. Both
 *    are long, dense, many-valued fields, and this model does not read them —
 *    it writes something plausible instead. Asked to read a real client label
 *    (HSN VF IRN75-1.pdf) it returned ingredients that appear nowhere on the
 *    pack ('Lactose, 120 mg', 'Maltodextrin, 300 mg'; the real declaration
 *    starts 'Corn Syrup, Sugar, Water'), and a nutrition table with 4 of the
 *    label's 17 rows, with figures that contradict the printed ones ('Energy:
 *    67 kJ' where the label prints 8 kcal). The developer brief's own rule is
 *    that the fabrication rate must never rise in exchange for accuracy, and
 *    both fields already have grounded readers that work off text actually
 *    present on the page (labelSemanticExtractor, textLayerGeometry). A blank
 *    here is a MISSING a reviewer investigates; an invented value compares
 *    like a real one and is the more dangerous failure. Worth revisiting only
 *    with a model measured to read these two fields faithfully.
 *
 * The list separators match what our own extractors emit, so an AI-filled
 * value and a Tesseract-read one compare on equal terms: ' | ' for claims
 * (labelSemanticExtractor) and ' & ' for colour theme (colourTheme.service).
 */
const FIELD_MAP: {
  [K in keyof LabelExtractionResult]?: (ai: AiExtractedLabel) => string | null | undefined;
} = {
  brand: (ai) => ai.brand_name,
  productName: (ai) => ai.product_name,
  flavour: (ai) => ai.flavour,
  fssaiNumber: (ai) => ai.fssai_number,
  marketingCompany: (ai) => ai.marketing_company,
  manufacturingCompany: (ai) => ai.manufacturing_company,
  address: (ai) => ai.address,
  customerCareNumber: (ai) => ai.customer_care_number,
  email: (ai) => ai.customer_care_email,
  packageSize: (ai) => ai.package_size,
  claims: (ai) => joinList(ai.claims, ' | '),
  colourTheme: (ai) => joinList(ai.colour_theme, ' & ')
};

/**
 * Text the model writes INSTEAD of an answer, which must never be stored.
 *
 * A model that cannot read a field has two honest options — omit the key or
 * write null — and this one regularly takes a third, writing its apology into
 * the value: 'No Marketing Company Provided' and 'Not Available' both came
 * back from a single real label. Stored as content that is the dangerous
 * failure the placeholder-text service exists to prevent one layer up: two
 * labels the model gave up on would compare MATCH on 'Not Available', and a
 * label compared against one would report a CONFLICT over words nobody printed.
 *
 * Deliberately narrow, because the cost of over-matching is losing real label
 * content. A bare 'None'/'Unknown'/'N/A' is refused outright, and a 'No <...>'
 * phrase is refused ONLY when it closes with a did-not-find verb — so the real
 * claim shapes this client actually prints ('No Added Sugar', 'No Gelatin')
 * and names that merely begin with those letters ('Novocal', 'Nourish') are
 * all still accepted.
 */
const MODEL_NON_ANSWER: readonly RegExp[] = [
  /^(n\/?a|none|nil|null|unknown|unspecified|undisclosed|not\s+applicable)$/i,
  /^not\s+(available|provided|specified|mentioned|found|listed|stated|given|present|readable|legible|visible|detected)\b/i,
  /^no\s+.{0,60}?\s+(provided|available|found|specified|mentioned|listed|stated|given|present|detected|visible)$/i
];

function isModelNonAnswer(value: string): boolean {
  const trimmed = value.trim().replace(/[.\s]+$/, '');
  if (trimmed === '') return true;
  return MODEL_NON_ANSWER.some((pattern) => pattern.test(trimmed));
}

// Refusals are filtered per ITEM, not only on the joined string: a list that
// is half real and half apology ('Gelatin Free', 'None') would otherwise sail
// through the whole-value check and store 'None' as though it were a claim.
function joinList(value: string[] | null | undefined, separator: string): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0 && !isModelNonAnswer(item));
  return items.length > 0 ? items.join(separator) : undefined;
}

/**
 * Fills blank fields in `current` from the vision model, where it is running.
 *
 * Returns the result to use and which fields the model supplied — the caller
 * logs those, because "this value came from the model, not from the label's
 * own text layer" is something a reviewer chasing a wrong field needs to know.
 */
export async function applyAiFallback(
  current: LabelExtractionResult,
  file: { buffer: Buffer; mimeType: string; isPdf: boolean },
  overwritable: readonly (keyof LabelExtractionResult)[] = []
): Promise<{ result: LabelExtractionResult; filled: string[] }> {
  const unchanged = { result: current, filled: [] as string[] };

  if (!env.aiExtractionUrl) return unchanged;
  if (TRIGGER_FIELDS.every((field) => current[field].trim() !== '')) return unchanged;

  let payload: AiExtractedLabel;
  try {
    payload = await requestExtraction(file);
  } catch (error) {
    // Down, slow, or unreachable. Tesseract already produced a result; that
    // result is still the answer.
    console.warn(
      '[aiExtraction] Vision-model fallback did not answer — continuing with Tesseract-only fields.',
      error instanceof Error ? error.message : error
    );
    return unchanged;
  }

  const result = { ...current };
  const filled: string[] = [];
  const mayOverwrite = new Set(overwritable);

  for (const [field, read] of Object.entries(FIELD_MAP) as [
    keyof LabelExtractionResult,
    (ai: AiExtractedLabel) => string | null | undefined
  ][]) {
    // Only ever fills a gap. A value our own extraction read off the label's
    // text layer is evidence; a value the model inferred is a guess, and a
    // guess must not overwrite evidence.
    //
    // The exception the caller opts into: a field it has already judged to
    // hold something that is not a value at all. On a real client label
    // (HSN VF IRN75-1.pdf) the text layer put '12.00 mm' in brand — a bare
    // measurement, never a brand — and because that string is non-empty it
    // silently blocked this model's correct 'BioFaith' from ever being used.
    // That is the same wrong-value-blocks-a-better-source defect the recovery
    // passes in labelExtraction already treat as blank; this honours the same
    // judgement rather than making its own.
    if (result[field].trim() !== '' && !mayOverwrite.has(field)) continue;

    const value = read(payload);
    if (value === null || value === undefined) continue;
    const trimmed = String(value).trim();
    // A refusal must not fill a gap, and must not replace known-garbage
    // either — leaving the garbage visible to a reviewer beats overwriting it
    // with the model's apology.
    if (trimmed === '' || isModelNonAnswer(trimmed)) continue;

    result[field] = trimmed;
    filled.push(field);
  }

  return { result, filled };
}

async function requestExtraction(file: { buffer: Buffer; mimeType: string; isPdf: boolean }): Promise<AiExtractedLabel> {
  // /api/v1/read-label — the router's prefix (ai_backend/app/main.py) plus the
  // endpoint (ai_backend/app/api/v1/endpoints.py). Built from the configured
  // origin so the two stay in one place.
  const url = `${env.aiExtractionUrl!.replace(/\/+$/, '')}/api/v1/read-label`;

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
    // The endpoint validates by extension, so the name has to carry a real one.
    file.isPdf ? 'upload.pdf' : 'upload.jpg'
  );

  // AbortSignal rather than a promise race, so a timed-out request is actually
  // cancelled instead of left running against a busy GPU.
  const response = await fetch(url, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(env.aiExtractionTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${url} returned ${typeof body}, expected a JSON object`);
  }
  return body as AiExtractedLabel;
}
