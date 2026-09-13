// Unit tests for displayRoleResolver.service.ts — brand vs product classification.
//
// Pure logic with a fake client for the grounding and resolve tests; one
// conditional live test with real Ollama client and a real PDF fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
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
      receivedSchema = schema;
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
