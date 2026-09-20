// Unit tests for displayRoleResolver.service.ts — brand vs product classification.
//
// Pure logic with a fake client for the grounding and resolve tests; one
// conditional live test with real Ollama client and a real PDF fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isRoleEligible,
  transcriptCorroborates,
  TRANSCRIBE_PROMPT,
  groundToCandidates,
  resolveDisplayRoles,
  buildDisplayRolePrompt,
  buildRoleOptions,
  buildDisplayRoleSchema,
  type DisplayCandidateIn
} from '../services/displayRoleResolver.service';
import { rasterizePdfPages } from '../services/pdf.service';
import { ollamaClient, prepareImage } from '../services/ollamaVlm.service';

// Candidates U from the brief
const candidatesU: DisplayCandidateIn[] = [
  { text: 'Homeo-Vita', heightPx: 137, confidence: 0.98, topPx: 300 },
  { text: 'MULTIVITAMIN', heightPx: 60, confidence: 0.9, topPx: 520 },
  { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 600 }
];

// ============================================================================
// GROUNDING TESTS
// ============================================================================

test('groundToCandidates: exact match "Homeo-Vita" → "Homeo-Vita"', () => {
  const result = groundToCandidates('Homeo-Vita', candidatesU);
  assert.equal(result, 'Homeo-Vita');
});

test('groundToCandidates: composed "Gummies Multivitamin" → "MULTIVITAMIN GUMMIES" (reading order by topPx)', () => {
  const result = groundToCandidates('Gummies Multivitamin', candidatesU);
  assert.equal(result, 'MULTIVITAMIN GUMMIES');
});

test('groundToCandidates: normalized "homeo vita" (with spaces) → "Homeo-Vita" (exact after norm)', () => {
  const result = groundToCandidates('homeo vita', candidatesU);
  assert.equal(result, 'Homeo-Vita');
});

test('groundToCandidates: fabricated token "Multivitamin Gummies Extra" → null (Extra is not in any candidate)', () => {
  const result = groundToCandidates('Multivitamin Gummies Extra', candidatesU);
  assert.equal(result, null);
});

test('groundToCandidates: empty string "" → null', () => {
  const result = groundToCandidates('', candidatesU);
  assert.equal(result, null);
});

test('groundToCandidates: exact match "GUMMIES" → "GUMMIES"', () => {
  const result = groundToCandidates('GUMMIES', candidatesU);
  assert.equal(result, 'GUMMIES');
});

// ============================================================================
// ROLE OPTIONS AND SCHEMA TESTS
// ============================================================================

test('buildRoleOptions: Unicare-like set includes MULTIVITAMIN GUMMIES composite, excludes Good Lifer Homeo-Vita (gap too large)', () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 137, confidence: 0.98, topPx: 1629 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.9, topPx: 2070 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169 },
    { text: 'Good Lifer', heightPx: 45, confidence: 0.95, topPx: 680 }
  ];

  const options = buildRoleOptions(candidates);

  // Should include singles
  assert(options.includes('Homeo-Vita'));
  assert(options.includes('MULTIVITAMIN'));
  assert(options.includes('GUMMIES'));
  assert(options.includes('Good Lifer'));

  // Should include MULTIVITAMIN GUMMIES (gap 2169-(2070+71)=28 < 1.2×71≈85, heights 71 and 69 ratio ≤ 2)
  assert(options.includes('MULTIVITAMIN GUMMIES'));

  // Should NOT include Homeo-Vita MULTIVITAMIN (gap 2070-(1629+137)=304 > 1.2×137≈164.4)
  assert(!options.includes('Homeo-Vita MULTIVITAMIN'));

  // Should NOT include Good Lifer Homeo-Vita (gap 1629-(680+45)=904 ≫ 1.2×137≈164)
  assert(!options.includes('Good Lifer Homeo-Vita'));
});

test('isRoleEligible: weight, regulatory, flavour and category lines are never name options', () => {
  const reject = [
    'EKnoll Net Wt. 90gm (30 Gummies)',
    'fssat FSSAI Lic. No.10924999000068',
    '30 Strawberry Flavour',
    'Gummies HEALTHSUPPLEMENT',
    'B12 Boost 500 mcg',
    'MRP Rs. 499'
  ];
  for (const text of reject) {
    assert.equal(isRoleEligible({ text, heightPx: 60, confidence: 0.99 }), false, `should reject: ${text}`);
  }
  const accept = ['Homeo-Vita', 'MULTIVITAMIN', 'Sharp Mind Plus', 'Omega 3 Gummies', 'Vitamin D3', 'Delicious Gummies', 'Express Energy'];
  for (const text of accept) {
    assert.equal(isRoleEligible({ text, heightPx: 60, confidence: 0.99 }), true, `should accept: ${text}`);
  }
});

test('isRoleEligible: an OCR read below 0.7 confidence is debris whatever it says', () => {
  assert.equal(isRoleEligible({ text: 'Son Lijo CUC', heightPx: 76, confidence: 0.64 }), false);
  assert.equal(isRoleEligible({ text: 'Fod Heal', heightPx: 108, confidence: 0.67 }), false);
  assert.equal(isRoleEligible({ text: 'Homeo-Vita', heightPx: 120, confidence: 0.7 }), true);
});

test('buildRoleOptions: ineligible candidates are kept out of composites too (the real Unicare list)', () => {
  const unicare: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, topPx: 1628, occurrences: 4 },
    { text: 'Fod Heal', heightPx: 108, confidence: 0.67, topPx: 598, occurrences: 1 },
    { text: 'CUC', heightPx: 85, confidence: 0.75, topPx: 1521, occurrences: 1 },
    { text: 'Son Lijo CUC', heightPx: 76, confidence: 0.64, topPx: 1528, occurrences: 1 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.97, topPx: 2070, occurrences: 1 },
    { text: '30 Strawberry Flavour', heightPx: 70, confidence: 0.99, topPx: 2840, occurrences: 1 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 1 },
    { text: 'fssat FSSAI Lic. No.10924999000068', heightPx: 66, confidence: 0.97, topPx: 2765, occurrences: 1 },
    { text: 'UC MBKE INMONA', heightPx: 52, confidence: 0.88, topPx: 2422, occurrences: 1 },
    { text: 'Gummies HEALTHSUPPLEMENT', heightPx: 51, confidence: 1, topPx: 2909, occurrences: 1 }
  ];
  const options = buildRoleOptions(unicare);
  assert.deepEqual(options, ['Homeo-Vita', 'MULTIVITAMIN', 'GUMMIES', 'UC MBKE INMONA', 'MULTIVITAMIN GUMMIES']);
});

test('buildRoleOptions: the real Sharp Mind Plus list offers only the wordmark read', () => {
  const sharpMind: DisplayCandidateIn[] = [
    { text: 'FOCUS MEMORY CLARITY MENTAL 30', heightPx: 85, confidence: 0.99, topPx: 1731, occurrences: 1 },
    { text: 'EKnoll Net Wt. 90gm (30 Gummies)', heightPx: 58, confidence: 0.88, topPx: 1442, occurrences: 1 },
    { text: 'NUTRINOU', heightPx: 45, confidence: 0.98, topPx: 261, occurrences: 2 }
  ];
  assert.deepEqual(buildRoleOptions(sharpMind), ['FOCUS MEMORY CLARITY MENTAL 30', 'NUTRINOU']);
});

test('buildRoleOptions: excludes logo debris (short rare) like CUC with occurrences ≤ 2', () => {
  const candidatesWithLogoDebris: DisplayCandidateIn[] = [
    { text: 'CUC', heightPx: 85, confidence: 0.75, occurrences: 2 },
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, occurrences: 5, topPx: 1628 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.9, topPx: 2070, occurrences: 1 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 2 }
  ];

  const options = buildRoleOptions(candidatesWithLogoDebris);

  // CUC is short (3 letters) and rare (occurrences 2) → excluded
  assert(!options.includes('CUC'), 'CUC should be excluded as logo debris');
  // Homeo-Vita is repeated 5 times → included
  assert(options.includes('Homeo-Vita'), 'Homeo-Vita should be included');
  // Composite should still be built
  assert(options.includes('MULTIVITAMIN GUMMIES'), 'MULTIVITAMIN GUMMIES composite should be included');
});

test('buildRoleOptions: includes short candidate if it has high occurrences (real 3-letter brand)', () => {
  const candidatesWithRealBrand: DisplayCandidateIn[] = [
    { text: 'CUC', heightPx: 85, confidence: 0.75, occurrences: 4 },
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, occurrences: 5, topPx: 1628 }
  ];

  const options = buildRoleOptions(candidatesWithRealBrand);

  // CUC with occurrences 4 (>= 3) → included (real brand repeats on every panel)
  assert(options.includes('CUC'), 'CUC with occurrences 4 should be included');
});

test('buildDisplayRoleSchema: includes enum constraint with options and empty string', () => {
  const options = ['A', 'B'];
  const schema = buildDisplayRoleSchema(options) as Record<string, unknown>;

  assert.equal(schema.type, 'object');
  const props = schema.properties as Record<string, unknown>;
  assert(props !== null);

  // brand field should have enum ['A', 'B', '']
  const brandEnum = (props.brand as Record<string, unknown>).enum;
  assert.deepEqual(brandEnum, ['A', 'B', '']);

  // productName field should have enum ['A', 'B', '']
  const productNameEnum = (props.productName as Record<string, unknown>).enum;
  assert.deepEqual(productNameEnum, ['A', 'B', '']);

  // confidence should be number
  const confidenceType = (props.confidence as Record<string, unknown>).type;
  assert.equal(confidenceType, 'number');
});

// ============================================================================
// RESOLVE TESTS (with fake client)
// ============================================================================

test('resolveDisplayRoles: fake returns brand + composite product (from enum) → brand: "Homeo-Vita", product: "MULTIVITAMIN GUMMIES", confidence: 0.9 (exact)', async () => {
  const fakeClient = {
    askJson: async () => ({
      brand: 'Homeo-Vita',
      productName: 'MULTIVITAMIN GUMMIES',
      confidence: 0.9
    })
  };

  const fakeImage = {
    base64: 'dummy',
    sentWidth: 1008,
    sentHeight: 28,
    originalWidth: 100,
    originalHeight: 100
  };

  const result = await resolveDisplayRoles(fakeImage, candidatesU, fakeClient);

  // With enum constraint, model returns MULTIVITAMIN GUMMIES which grounds exactly
  // (composite candidate exact match), so groundConf = 1.0, final = min(0.9, 1.0) = 0.9
  assert.deepEqual(result, {
    brand: 'Homeo-Vita',
    productName: 'MULTIVITAMIN GUMMIES',
    confidence: 0.9
  });
});

test('resolveDisplayRoles: fake returns same brand and product → productName becomes empty string', async () => {
  const fakeClient = {
    askJson: async () => ({
      brand: 'Homeo-Vita',
      productName: 'Homeo-Vita',
      confidence: 1
    })
  };

  const fakeImage = {
    base64: 'dummy',
    sentWidth: 1008,
    sentHeight: 28,
    originalWidth: 100,
    originalHeight: 100
  };

  const result = await resolveDisplayRoles(fakeImage, candidatesU, fakeClient);

  assert.deepEqual(result, {
    brand: 'Homeo-Vita',
    productName: '',
    confidence: 1
  });
});

test('resolveDisplayRoles: fake returns null → null', async () => {
  const fakeClient = {
    askJson: async () => null
  };

  const fakeImage = {
    base64: 'dummy',
    sentWidth: 1008,
    sentHeight: 28,
    originalWidth: 100,
    originalHeight: 100
  };

  const result = await resolveDisplayRoles(fakeImage, candidatesU, fakeClient);

  assert.equal(result, null);
});

test('resolveDisplayRoles: fake returns brand but no grounded product → null', async () => {
  const fakeClient = {
    askJson: async () => ({
      brand: 'Nestle',
      productName: '',
      confidence: 1
    })
  };

  const fakeImage = {
    base64: 'dummy',
    sentWidth: 1008,
    sentHeight: 28,
    originalWidth: 100,
    originalHeight: 100
  };

  const result = await resolveDisplayRoles(fakeImage, candidatesU, fakeClient);

  assert.equal(result, null);
});

test('resolveDisplayRoles: empty candidates → null (VLM not called)', async () => {
  let vlmWasCalled = false;
  const fakeClient = {
    askJson: async () => {
      vlmWasCalled = true;
      return null;
    }
  };

  const fakeImage = {
    base64: 'dummy',
    sentWidth: 1008,
    sentHeight: 28,
    originalWidth: 100,
    originalHeight: 100
  };

  const result = await resolveDisplayRoles(fakeImage, [], fakeClient);

  assert.equal(result, null);
  assert.equal(vlmWasCalled, false);
});

test('resolveDisplayRoles: fake returns composite option → grounds to composite, confidence 0.9 (exact via enum)', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 137, confidence: 0.98, topPx: 1629 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.9, topPx: 2070 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169 }
  ];

  let receivedSchema: object | null = null;
  const fakeClient = {
    askJson: async (_image: unknown, _prompt: unknown, schema: object) => {
      // The role call comes first; the transcription call that follows has its own schema.
      if (receivedSchema === null) receivedSchema = schema;
      return {
        brand: 'Homeo-Vita',
        productName: 'MULTIVITAMIN GUMMIES',
        confidence: 0.9
      };
    }
  };

  const fakeImage = {
    base64: 'dummy',
    sentWidth: 1008,
    sentHeight: 28,
    originalWidth: 100,
    originalHeight: 100
  };

  const result = await resolveDisplayRoles(fakeImage, candidates, fakeClient);

  assert.deepEqual(result, {
    brand: 'Homeo-Vita',
    productName: 'MULTIVITAMIN GUMMIES',
    confidence: 0.9
  });

  // Verify schema has enum with composite option
  assert(receivedSchema !== null, 'Schema should not be null');
  const schema = receivedSchema as Record<string, unknown>;
  const props = schema.properties as Record<string, unknown>;
  const productNameEnum = (props.productName as Record<string, unknown>).enum as string[];
  assert(productNameEnum.includes('MULTIVITAMIN GUMMIES'), 'Schema should have MULTIVITAMIN GUMMIES as enum option');
});

// ============================================================================
// PROMPT BUILDING TEST
// ============================================================================

test('buildDisplayRolePrompt: returns correct prompt template with options (including composites)', () => {
  const prompt = buildDisplayRolePrompt(candidatesU);
  assert(prompt.includes('This is the print artwork of a food-supplement label'));
  assert(prompt.includes('BRAND name'));
  assert(prompt.includes('PRODUCT name'));
  assert(prompt.includes('Homeo-Vita'));
  assert(prompt.includes('MULTIVITAMIN'));
  assert(prompt.includes('GUMMIES'));
  // Should include composite option
  assert(prompt.includes('MULTIVITAMIN GUMMIES'));
});

test('buildDisplayRolePrompt: includes repetition info when candidates have occurrences > 1', () => {
  const candidatesWithReps: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, occurrences: 5, topPx: 1628 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.9, topPx: 2070, occurrences: 1 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 2 }
  ];

  const prompt = buildDisplayRolePrompt(candidatesWithReps);
  // Should include the base prompt
  assert(prompt.includes('This is the print artwork of a food-supplement label'));
  // Should include repetition sentence
  assert(prompt.includes('Repetition across the label\'s panels'));
  // Should include the occurrence counts
  assert(prompt.includes('"Homeo-Vita":5'));
  // MULTIVITAMIN has occurrences 1, so it's not in the repetition map
  assert(!prompt.includes('"MULTIVITAMIN":1'));
});

test('buildDisplayRolePrompt: does not include repetition when all occurrences are 1', () => {
  const candidatesNoReps: DisplayCandidateIn[] = [
    { text: 'Brand', heightPx: 120, confidence: 0.99, occurrences: 1 },
    { text: 'Product', heightPx: 71, confidence: 0.9, occurrences: 1 }
  ];

  const prompt = buildDisplayRolePrompt(candidatesNoReps);
  // Should NOT include repetition info
  assert(!prompt.includes('Repetition across the label\'s panels'));
});

test('resolveDisplayRoles: occurrence prior fills blank brand when one candidate repeats >= 3 times', async () => {
  // Clean candidate list: brand repeats on every panel, product form once
  const candidatesWithOccurrences: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, occurrences: 5, topPx: 1628 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.9, topPx: 2070, occurrences: 1 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 1 }
  ];

  const fakeClient = {
    askJson: async () => ({
      brand: '',
      productName: 'MULTIVITAMIN GUMMIES',
      confidence: 0.9
    })
  };

  const fakeImage = {
    base64: 'dummy',
    sentWidth: 1008,
    sentHeight: 28,
    originalWidth: 100,
    originalHeight: 100
  };

  const result = await resolveDisplayRoles(fakeImage, candidatesWithOccurrences, fakeClient);

  // Brand is blank from model, but prior detects Homeo-Vita (occurrences 5 >= 3)
  // with all others <= 1, so brand is filled with Homeo-Vita and confidence capped at 0.7
  assert.deepEqual(result, {
    brand: 'Homeo-Vita',
    productName: 'MULTIVITAMIN GUMMIES',
    confidence: 0.7
  });
});

test('resolveDisplayRoles: occurrence prior fills the brand even when the model answers blank for both', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, occurrences: 5, topPx: 1628 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.9, topPx: 2070, occurrences: 1 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 2 }
  ];
  const fakeClient = { askJson: async () => ({ brand: '', productName: '', confidence: 0.3 }) };
  const fakeImage = { base64: 'dummy', sentWidth: 1008, sentHeight: 28, originalWidth: 100, originalHeight: 100 };

  const result = await resolveDisplayRoles(fakeImage, candidates, fakeClient);

  // Without the prior this would be null (both blank). The lone x5 wordmark fills the brand;
  // GUMMIES x2 does not block it (only a second >=3 candidate would). Confidence = min(0.3, 0.7).
  assert.deepEqual(result, { brand: 'Homeo-Vita', productName: '', confidence: 0.3 });
});

test('resolveDisplayRoles: occurrence prior never duplicates the product the model chose', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, occurrences: 5, topPx: 1628 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 1 }
  ];
  const fakeClient = { askJson: async () => ({ brand: '', productName: 'Homeo-Vita', confidence: 0.9 }) };
  const fakeImage = { base64: 'dummy', sentWidth: 1008, sentHeight: 28, originalWidth: 100, originalHeight: 100 };

  const result = await resolveDisplayRoles(fakeImage, candidates, fakeClient);

  assert.deepEqual(result, { brand: '', productName: 'Homeo-Vita', confidence: 0.9 });
});

test('resolveDisplayRoles: occurrence prior stays silent when two candidates both repeat >= 3 times', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'Nutrinol', heightPx: 60, confidence: 0.99, occurrences: 3, topPx: 100 },
    { text: 'Good Life', heightPx: 58, confidence: 0.95, occurrences: 3, topPx: 900 }
  ];
  const fakeClient = { askJson: async () => ({ brand: '', productName: '', confidence: 0.5 }) };
  const fakeImage = { base64: 'dummy', sentWidth: 1008, sentHeight: 28, originalWidth: 100, originalHeight: 100 };

  const result = await resolveDisplayRoles(fakeImage, candidates, fakeClient);

  assert.equal(result, null);
});

const IMG = { base64: 'dummy', sentWidth: 1008, sentHeight: 28, originalWidth: 100, originalHeight: 100 };

// A fake that answers the role call and the transcription call differently.
function twoCallClient(roles: object, transcript: { brandAsPrinted: string; productAsPrinted: string } | null) {
  const prompts: string[] = [];
  return {
    prompts,
    askJson: async (_image: unknown, prompt: string) => {
      prompts.push(prompt);
      return prompt === TRANSCRIBE_PROMPT ? transcript : roles;
    }
  };
}

test('transcriptCorroborates: whole words, case- and hyphen-insensitive', () => {
  assert.equal(transcriptCorroborates('Homeo-Vita Gummies', 'Homeo-Vita'), true);
  assert.equal(transcriptCorroborates('HOMEO VITA GUMMIES', 'Homeo-Vita'), true);
  assert.equal(transcriptCorroborates('NUTRINOL SHARP MIND PLUS GUMMIES', 'NUTRINOU'), false);
  assert.equal(transcriptCorroborates('NUTRINOL SHARP MIND PLUS GUMMIES', 'NUTRINOL'), true);
  assert.equal(transcriptCorroborates('Supernutrinol', 'NUTRINOL'), false); // not a whole word
  assert.equal(transcriptCorroborates('', 'NUTRINOL'), false);
});

test('resolveDisplayRoles: the transcript vetoes a brand the model did not read that way, and its OWN read is used instead of going blank (Step 5, accuracy2 plan: NUTRINOU vs NUTRINOL)', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'FOCUS MEMORY CLARITY MENTAL 30', heightPx: 85, confidence: 0.99, topPx: 1731, occurrences: 1 },
    { text: 'NUTRINOU', heightPx: 45, confidence: 0.98, topPx: 261, occurrences: 2 }
  ];
  const client = twoCallClient(
    { brand: 'NUTRINOU', productName: '', confidence: 0.9 },
    { brandAsPrinted: 'NUTRINOL', productAsPrinted: 'SHARP MIND PLUS GUMMIES' }
  );
  const result = await resolveDisplayRoles(IMG, candidates, client);
  // The transcript itself IS a grounded read (asked with no knowledge of
  // the OCR options -- see the prompt-isolation assertion below), so a
  // vetoed brand is replaced by it, not dropped to blank -- lower
  // confidence than an exact/corroborated grounding, and still above the
  // 0.6 acceptance floor resolveBlankDisplayRoles applies.
  assert.deepEqual(result, { brand: 'NUTRINOL', productName: '', confidence: 0.65, brandVetoedBy: 'NUTRINOL SHARP MIND PLUS GUMMIES' });
  assert.equal(client.prompts.length, 2);
  assert.equal(client.prompts[1], TRANSCRIBE_PROMPT);
  assert.ok(!client.prompts[1].includes('NUTRINOU'), 'the transcription prompt must not show the model the OCR options');
});

test('resolveDisplayRoles: a vetoed brand still goes blank when the transcript itself is not a plausible name (empty, or a weight/regulatory/category line)', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'FOCUS MEMORY CLARITY MENTAL 30', heightPx: 85, confidence: 0.99, topPx: 1731, occurrences: 1 },
    { text: 'NUTRINOU', heightPx: 45, confidence: 0.98, topPx: 261, occurrences: 2 }
  ];
  for (const brandAsPrinted of ['', 'FSSAI Lic. No. 12345', 'Health Supplement']) {
    const client = twoCallClient(
      { brand: 'NUTRINOU', productName: '', confidence: 0.9 },
      { brandAsPrinted, productAsPrinted: 'SHARP MIND PLUS GUMMIES' }
    );
    const result = await resolveDisplayRoles(IMG, candidates, client);
    assert.equal(result, null, `brandAsPrinted ${JSON.stringify(brandAsPrinted)} must not be accepted as a brand`);
  }
});

test('resolveDisplayRoles: a vetoed brand does not fall back to the transcript when its own read runs long, like a sentence rather than a wordmark', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'FOCUS MEMORY CLARITY MENTAL 30', heightPx: 85, confidence: 0.99, topPx: 1731, occurrences: 1 },
    { text: 'NUTRINOU', heightPx: 45, confidence: 0.98, topPx: 261, occurrences: 2 }
  ];
  const client = twoCallClient(
    { brand: 'NUTRINOU', productName: '', confidence: 0.9 },
    { brandAsPrinted: 'This Is Not Really A Brand Name At All', productAsPrinted: '' }
  );
  const result = await resolveDisplayRoles(IMG, candidates, client);
  assert.equal(result, null);
});

test('resolveDisplayRoles: a string given for both roles and then vetoed as brand does not survive as the product', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'FOCUS MEMORY CLARITY MENTAL 30', heightPx: 85, confidence: 0.99, topPx: 1731, occurrences: 1 },
    { text: 'NUTRINOU', heightPx: 45, confidence: 0.98, topPx: 261, occurrences: 2 }
  ];
  const client = twoCallClient(
    { brand: 'NUTRINOU', productName: 'NUTRINOU', confidence: 0.9 },
    { brandAsPrinted: '', productAsPrinted: 'NUTRINOL SHARP MIND PLUS GUMMIES' }
  );
  assert.equal(await resolveDisplayRoles(IMG, candidates, client), null);
});

test('resolveDisplayRoles: a corroborated brand passes; the product is not subject to the veto', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, topPx: 1628, occurrences: 4 },
    { text: 'MULTIVITAMIN', heightPx: 71, confidence: 0.97, topPx: 2070, occurrences: 1 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 1 }
  ];
  const client = twoCallClient(
    { brand: 'Homeo-Vita', productName: 'MULTIVITAMIN GUMMIES', confidence: 0.95 },
    { brandAsPrinted: '', productAsPrinted: 'Homeo-Vita Gummies' } // no MULTIVITAMIN in the transcript
  );
  const result = await resolveDisplayRoles(IMG, candidates, client);
  assert.deepEqual(result, { brand: 'Homeo-Vita', productName: 'MULTIVITAMIN GUMMIES', confidence: 0.95 });
});

test('resolveDisplayRoles: the veto also applies to a brand the occurrence prior filled, with the same Step 5 transcript fallback', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'NUTRINOU', heightPx: 45, confidence: 0.98, topPx: 261, occurrences: 3 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 1 }
  ];
  const client = twoCallClient(
    { brand: '', productName: 'GUMMIES', confidence: 0.9 },
    { brandAsPrinted: 'NUTRINOL', productAsPrinted: 'GUMMIES' }
  );
  const result = await resolveDisplayRoles(IMG, candidates, client);
  assert.deepEqual(result, { brand: 'NUTRINOL', productName: 'GUMMIES', confidence: 0.65, brandVetoedBy: 'NUTRINOL GUMMIES' });
});

test('resolveDisplayRoles: an empty or failed transcription is no evidence — the brand stands', async () => {
  const candidates: DisplayCandidateIn[] = [
    { text: 'Homeo-Vita', heightPx: 120, confidence: 0.99, topPx: 1628, occurrences: 4 },
    { text: 'GUMMIES', heightPx: 69, confidence: 0.99, topPx: 2169, occurrences: 1 }
  ];
  for (const transcript of [null, { brandAsPrinted: '', productAsPrinted: '' }]) {
    const client = twoCallClient({ brand: 'Homeo-Vita', productName: 'GUMMIES', confidence: 0.9 }, transcript);
    const result = await resolveDisplayRoles(IMG, candidates, client);
    assert.deepEqual(result, { brand: 'Homeo-Vita', productName: 'GUMMIES', confidence: 0.9 });
  }
});

// ============================================================================
// LIVE TEST (conditional, requires OLLAMA_URL)
// ============================================================================

test('live: real Unicare PDF with real ollamaClient', { skip: !process.env.OLLAMA_URL, timeout: 120_000 }, async () => {
  // Rasterize Unicare MV page 1
  const pdfBuffer = readFileSync(
    'M:/New Drive/Desktop/bot/project/IMH-LVS/Dataset_Example/Unicare MV IRN219-2 (1).pdf'
  );
  const pages = await rasterizePdfPages(pdfBuffer, { dpi: 150, maxPages: 1 });
  assert(pages.length > 0, 'Failed to rasterize PDF');

  const pngBuffer = pages[0];
  const image = await prepareImage(pngBuffer);

  // Call resolveDisplayRoles with real client and candidates U
  const result = await resolveDisplayRoles(image, candidatesU, ollamaClient);

  // Assertions from brief
  assert(result !== null, 'Expected result to be non-null');
  assert.equal(result.brand, 'Homeo-Vita', `Expected brand "Homeo-Vita", got "${result.brand}"`);
  assert(/MULTIVITAMIN/.test(result.productName), `Expected productName to match /MULTIVITAMIN/, got "${result.productName}"`);
  assert(/GUMMIES/.test(result.productName), `Expected productName to match /GUMMIES/, got "${result.productName}"`);
  assert(result.confidence >= 0.6, `Expected confidence >= 0.6, got ${result.confidence}`);
});
