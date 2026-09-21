// Unit tests for ingredientsCropReader.service.ts -- accuracy3 Step 4's
// second crop-reader extension, following the exact pattern
// nutritionCropReader.service.ts already proved in production (accuracy2
// Step 7): locate the real panel from the PDF's own text-layer geometry,
// crop it at real resolution, ask the VLM to transcribe it, and ground
// every item before trusting it -- a last-resort side channel, only
// reached when every text-based ingredients path (extractIngredients,
// mergeIngredientsResults) already came back empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  findIngredientsPanelFromSpans,
  readIngredientsFromCrop
} from '../services/ingredientsCropReader.service';
import type { TextSpan } from '../services/pdf.service';
import type { VlmClient } from '../services/ollamaVlm.service';

function span(
  props: Partial<TextSpan> & { text: string; x: number; y: number; width: number; fontSize: number }
): TextSpan {
  return {
    page: props.page ?? 1,
    text: props.text,
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.fontSize,
    fontSize: props.fontSize,
    rotation: props.rotation ?? 0,
    fontName: props.fontName ?? 'F'
  };
}

// ============================================================================
// findIngredientsPanelFromSpans -- the PDF-text-layer path
// ============================================================================

test('findIngredientsPanelFromSpans: finds the panel bounding box when a panel line matches the ingredients anchor', () => {
  const spans: TextSpan[] = [
    span({ text: 'Ingredients:', x: 20, y: 700, width: 80, fontSize: 10 }),
    span({ text: 'Glucose Syrup, Sugar, Water, Pectin, Citric Acid.', x: 20, y: 685, width: 300, fontSize: 10 })
  ];
  const box = findIngredientsPanelFromSpans(spans, 792, 300);
  assert.ok(box, 'should find a panel');
  assert.ok(box!.width > 0 && box!.height > 0);
});

test('findIngredientsPanelFromSpans: recognizes "Composition" and "Ingredientes" the same way the text-based anchor does', () => {
  const spans: TextSpan[] = [
    span({ text: 'Composition:', x: 20, y: 700, width: 80, fontSize: 10 }),
    span({ text: 'Vitamin C, Zinc, Ascorbic Acid.', x: 20, y: 685, width: 200, fontSize: 10 })
  ];
  const box = findIngredientsPanelFromSpans(spans, 792, 300);
  assert.ok(box, 'should find a panel for the "Composition" anchor too');
});

test('findIngredientsPanelFromSpans: returns null when no panel matches the ingredients anchor', () => {
  const spans: TextSpan[] = [
    span({ text: 'Nutrition Information', x: 300, y: 700, width: 200, fontSize: 12 }),
    span({ text: 'Energy 16 kcal', x: 300, y: 680, width: 100, fontSize: 10 })
  ];
  assert.equal(findIngredientsPanelFromSpans(spans, 792, 300), null);
});

test('findIngredientsPanelFromSpans: returns null for empty spans', () => {
  assert.equal(findIngredientsPanelFromSpans([], 792, 300), null);
});

// ============================================================================
// readIngredientsFromCrop -- the VLM call + grounding
// ============================================================================

function fakeClient(response: unknown): VlmClient {
  return { askJson: async () => response };
}

async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
}

test('readIngredientsFromCrop: joins plausible items into a comma-separated declaration', async () => {
  const image = await tinyPng();
  const client = fakeClient({ items: ['Glucose Syrup', 'Sugar', 'Water', 'Pectin', 'Citric Acid'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.equal(result, 'Glucose Syrup, Sugar, Water, Pectin, Citric Acid');
});

test('readIngredientsFromCrop: drops empty or absurdly long items -- a model guess is not a printed fact until it clears the same bar every other source does', async () => {
  const image = await tinyPng();
  const longItem = 'x'.repeat(150);
  const client = fakeClient({ items: ['Sugar', '', longItem, 'Water'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.equal(result, 'Sugar, Water');
});

test('readIngredientsFromCrop: drops a pure-digit or pure-punctuation item (never a real ingredient name)', async () => {
  const image = await tinyPng();
  const client = fakeClient({ items: ['Sugar', '12345', '---', 'Water'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.equal(result, 'Sugar, Water');
});

test('readIngredientsFromCrop: returns null when fewer than 2 plausible items survive -- the same floor extractIngredients itself applies', async () => {
  const image = await tinyPng();
  const client = fakeClient({ items: ['Sugar'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.equal(result, null);
});

test('readIngredientsFromCrop: returns null for a malformed or empty VLM response, never throws', async () => {
  const image = await tinyPng();
  for (const response of [null, {}, { items: 'not an array' }, { items: [] }]) {
    const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, fakeClient(response));
    assert.equal(result, null);
  }
});

test('readIngredientsFromCrop: caps at a generous item count to guard against a runaway hallucinated list', async () => {
  const image = await tinyPng();
  const items = Array.from({ length: 100 }, (_, i) => `Ingredient ${i}`);
  const client = fakeClient({ items });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  const count = result ? result.split(', ').length : 0;
  assert.ok(count <= 60, `expected at most 60 items, got ${count}`);
});
