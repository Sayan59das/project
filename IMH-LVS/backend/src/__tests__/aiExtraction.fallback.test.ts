// Unit tests for applyAiFallback (aiExtraction.service.ts) — the vision-model
// fallback that fills fields the label's own text layer / OCR could not read.
//
// WHY THESE EXIST (accuracy plan, Step 6 follow-up)
// ---------------------------------------------------------------------
// This fallback had never actually run in any real measurement: it is gated on
// AI_EXTRACTION_URL, which is set in backend/.env, but the ai_backend service
// it points at was not running during any score.py run, so every call failed
// with 'fetch failed' and silently returned the Tesseract-only result.
//
// Once the service was actually started and asked to read a real client label
// (HSN VF IRN75-1.pdf, one of the 14 labels whose nutrition_table comes back
// 100% blank), the model's answer was genuinely mixed, and these tests encode
// each half of it:
//
//   REAL GAINS  brand_name 'BioFaith' (the text layer reads '12.00 mm' there),
//               product name, and 3 of the label's 8 real claims — all correct.
//
//   REAL HARM   ingredients that are not on the label at all ('Lactose, 120 mg',
//               'Maltodextrin, 300 mg' — the real list starts Corn Syrup, Sugar,
//               Water), a nutrition table with 4 of 17 rows and wrong numbers
//               ('Energy: 67 kJ' where the label prints 8 kcal), and refusal
//               text stored as if it were a value ('No Marketing Company
//               Provided', 'Not Available').
//
// The developer brief's own rule is that the fabrication rate must never rise
// in exchange for accuracy, so the harm half has to be closed before this
// fallback can be trusted with the gain half.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env';
import { applyAiFallback } from '../services/aiExtraction.service';
import { buildPlaceholderExtraction } from '../services/labelExtraction.service';
import type { LabelExtractionResult } from '../services/labelExtraction.service';

const FILE = { buffer: Buffer.from('not really a pdf'), mimeType: 'application/pdf', isPdf: true };

// The fallback is a no-op unless AI_EXTRACTION_URL is configured, and that is
// set in backend/.env, which is gitignored and absent on a fresh checkout.
// These tests are about this module's own rules, not about deployment, so they
// set the origin themselves rather than silently turning into no-ops wherever
// that file happens not to exist. Read at call time, so assigning it here is
// enough — no module-cache juggling needed.
const REAL_AI_EXTRACTION_URL = env.aiExtractionUrl;

function withAiConfigured<T>(run: () => T): T {
  env.aiExtractionUrl = 'http://127.0.0.1:8000';
  try {
    return run();
  } finally {
    env.aiExtractionUrl = REAL_AI_EXTRACTION_URL;
  }
}

// A blank result with only the named fields set, so each test states exactly
// the starting point it cares about and nothing else.
function resultWith(fields: Partial<LabelExtractionResult>): LabelExtractionResult {
  return { ...buildPlaceholderExtraction(), ...fields };
}

// applyAiFallback talks to ai_backend over fetch(). These tests stub global
// fetch so they assert this module's OWN rules — which answers it accepts,
// which it refuses, which fields it may write — without a model, a GPU or a
// running service. Restores the real fetch afterwards so nothing leaks between
// tests.
async function withAiAnswering<T>(payload: unknown, run: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as typeof globalThis.fetch;
  try {
    return await withAiConfigured(run);
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('refusal text the model writes in place of an answer is never stored as a value', async () => {
  // Both real, from the model's own answer for HSN VF IRN75-1.pdf. Stored as
  // content, either one compares like any other string — two labels the model
  // gave up on would report MATCH on 'Not Available'.
  const payload = {
    marketing_company: 'No Marketing Company Provided',
    customer_care_number: 'Not Available'
  };

  const { result, filled } = await withAiAnswering(payload, () =>
    applyAiFallback(resultWith({}), FILE)
  );

  assert.equal(result.marketingCompany, '', 'refusal text must leave the field blank, not fill it');
  assert.equal(result.customerCareNumber, '');
  assert.deepEqual(filled, [], 'a refused field was not filled, so it must not be reported as filled');
});

test('other common non-answer spellings are refused too, whatever the field', async () => {
  const payload = {
    brand_name: 'None',
    product_name: 'Unknown',
    flavour: 'N/A',
    address: 'No Address Found'
  };

  const { result } = await withAiAnswering(payload, () => applyAiFallback(resultWith({}), FILE));

  assert.equal(result.brand, '');
  assert.equal(result.productName, '');
  assert.equal(result.flavour, '');
  assert.equal(result.address, '');
});

test('a real value that merely starts with "No" is still accepted', async () => {
  // The refusal rule must not swallow genuine label content: 'No Added Sugar'
  // is a real claim shape on this client's own labels, and Nourish/Nova-style
  // brand names really do start with 'No'.
  const payload = { brand_name: 'Novocal', claims: ['No Added Sugar', 'Gelatin Free'] };

  const { result } = await withAiAnswering(payload, () => applyAiFallback(resultWith({}), FILE));

  assert.equal(result.brand, 'Novocal');
  assert.equal(result.claims, 'No Added Sugar | Gelatin Free');
});

test('the model is never allowed to supply ingredients — it invents them', async () => {
  // Real answer for HSN VF IRN75-1.pdf. Neither ingredient is printed on that
  // label; the real declaration starts 'Corn Syrup, Sugar, Water'. A blank
  // ingredients field is a MISSING a reviewer investigates; an invented one
  // compares as though it were read off the pack.
  const payload = { ingredients: ['Lactose, 120 mg', 'Maltodextrin, 300 mg'] };

  const { result, filled } = await withAiAnswering(payload, () =>
    applyAiFallback(resultWith({}), FILE)
  );

  assert.equal(result.ingredients, '', 'ingredients must stay blank rather than be invented');
  assert.deepEqual(filled, []);
});

test('the model is never allowed to supply a nutrition table — it invents the numbers', async () => {
  // Real answer for the same label: 4 rows where the label prints 17, and the
  // figures do not match the ones actually printed ('Energy: 8 kcal', not 67 kJ;
  // 'Total Carbohydrate: 2.2 g', not 9 g).
  const payload = {
    nutrition_table: { Energy: '67 kJ', Carbohydrates: '9 g', Protein: '0 g', Fiber: '0 g' }
  };

  const { result, filled } = await withAiAnswering(payload, () =>
    applyAiFallback(resultWith({}), FILE)
  );

  assert.equal(result.nutritionTable, '', 'nutrition rows must stay blank rather than be invented');
  assert.deepEqual(filled, []);
});

test('a value our own extraction really read is still never overwritten', async () => {
  // Unchanged, existing guarantee: evidence beats a guess.
  const payload = { brand_name: 'BioFaith', flavour: 'Mango' };

  const { result, filled } = await withAiAnswering(payload, () =>
    applyAiFallback(resultWith({ brand: 'Calrio', flavour: 'Strawberry' }), FILE)
  );

  assert.equal(result.brand, 'Calrio');
  assert.equal(result.flavour, 'Strawberry');
  assert.deepEqual(filled, []);
});

test('a field the caller marks as known-garbage IS overwritten by the model', async () => {
  // The real blocking case. On HSN VF IRN75-1.pdf the text layer puts '12.00 mm'
  // in brand_name — a bare measurement, never a brand — and because that value
  // is non-empty it silently blocked the model's correct 'BioFaith' from ever
  // being used. The caller decides what counts as garbage (labelExtraction's
  // own nameFieldMissing); this module only honours the list it is given.
  const payload = { brand_name: 'BioFaith' };

  const { result, filled } = await withAiAnswering(payload, () =>
    applyAiFallback(resultWith({ brand: '12.00 mm' }), FILE, ['brand'])
  );

  assert.equal(result.brand, 'BioFaith');
  assert.deepEqual(filled, ['brand']);
});

test('a known-garbage field is left as it was when the model refuses it too', async () => {
  // Overwriting garbage with refusal text would be strictly worse than leaving
  // the garbage in place for a reviewer to see.
  const payload = { brand_name: 'Not Available' };

  const { result, filled } = await withAiAnswering(payload, () =>
    applyAiFallback(resultWith({ brand: '12.00 mm' }), FILE, ['brand'])
  );

  assert.equal(result.brand, '12.00 mm');
  assert.deepEqual(filled, []);
});

test('a model that is down still costs the caller nothing but latency', async () => {
  // Existing guarantee, restated here because the fixes above add new early
  // returns and must not change it.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('fetch failed');
  }) as typeof globalThis.fetch;
  try {
    const before = resultWith({ brand: 'Calrio' });
    const { result, filled } = await withAiConfigured(() => applyAiFallback(before, FILE));
    assert.equal(result.brand, 'Calrio');
    assert.deepEqual(filled, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});
