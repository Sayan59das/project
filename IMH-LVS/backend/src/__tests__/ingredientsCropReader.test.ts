// Unit tests for ingredientsCropReader.service.ts -- accuracy3 Step 4's
// second crop-reader extension, following the exact pattern
// nutritionCropReader.service.ts already proved in production (accuracy2
// Step 7): locate the real panel, crop it at real resolution, ask the VLM
// to transcribe it, and ground every item before trusting it -- a
// last-resort side channel, only reached when every text-based ingredients
// path (extractIngredients, mergeIngredientsResults) already came back
// empty.
//
// Extended (Step 4.1's full spec, from the original directive): a
// no-anchor fallback that locates the ingredients panel from OCR line
// geometry alone (the panel holding the longest continuous run of small
// print) for labels with no PDF text layer at all -- and whole-phrase
// corroboration, so a VLM item is trusted only when it also appears,
// independently, in the panel's own OCR/text-layer lines. This is what
// closes the real gap found validating the span-only v1 against 69 real
// labels: every currently-empty-ingredients label lacks a text layer, so
// the span-only locator never had a panel to crop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  findIngredientsPanelFromSpans,
  findIngredientsPanelFromLines,
  isCorroboratedWholePhrase,
  readIngredientsFromCrop
} from '../services/ingredientsCropReader.service';
import type { TextSpan } from '../services/pdf.service';
import type { OcrLineLike } from '../services/outlinedText.service';
import type { VlmClient } from '../services/ollamaVlm.service';

function line(text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90): OcrLineLike {
  return { text, box: { x0, y0, x1, y1 }, confidence };
}

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

test('findIngredientsPanelFromSpans: finds the panel and its corroboration text when a panel line matches the ingredients anchor', () => {
  const spans: TextSpan[] = [
    span({ text: 'Ingredients:', x: 20, y: 700, width: 80, fontSize: 10 }),
    span({ text: 'Glucose Syrup, Sugar, Water, Pectin, Citric Acid.', x: 20, y: 685, width: 300, fontSize: 10 })
  ];
  const match = findIngredientsPanelFromSpans(spans, 792, 300);
  assert.ok(match, 'should find a panel');
  assert.ok(match!.box.width > 0 && match!.box.height > 0);
  assert.match(match!.corroborationText, /Glucose Syrup/);
});

test('findIngredientsPanelFromSpans: recognizes "Composition" and "Ingredientes" the same way the text-based anchor does', () => {
  const spans: TextSpan[] = [
    span({ text: 'Composition:', x: 20, y: 700, width: 80, fontSize: 10 }),
    span({ text: 'Vitamin C, Zinc, Ascorbic Acid.', x: 20, y: 685, width: 200, fontSize: 10 })
  ];
  const match = findIngredientsPanelFromSpans(spans, 792, 300);
  assert.ok(match, 'should find a panel for the "Composition" anchor too');
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
// findIngredientsPanelFromLines -- the no-anchor, OCR-only fallback (Step
// 4.1's own spec: "with no anchor, the panel holding the longest
// continuous small-text run"). This is what a scanned/image-only label
// needs, since it has no PDF spans at all for the anchor-based path.
// ============================================================================

test('findIngredientsPanelFromLines: picks the column with the longest run of small-print lines', () => {
  const lines: OcrLineLike[] = [
    // A big brand wordmark -- tall, not small print.
    line('SUPER GUMMIES', 20, 20, 300, 70),
    // A short 2-line caption -- small print, but too short a run to trust.
    line('Net Wt 60g', 20, 700, 120, 718),
    line('30 Gummies', 20, 720, 130, 738),
    // The real ingredients declaration -- a long run of small-print lines,
    // same column (overlapping X range), contiguous in Y.
    line('Glucose Syrup, Sugar, Water,', 20, 300, 280, 318),
    line('Pectin, Citric Acid, Sodium', 20, 320, 280, 338),
    line('Citrate, Natural Flavours,', 20, 340, 280, 358),
    line('Colours (INS 100, INS 133).', 20, 360, 280, 378)
  ];
  const match = findIngredientsPanelFromLines(lines);
  assert.ok(match, 'should find the longest small-print run');
  assert.match(match!.corroborationText, /Glucose Syrup/);
  assert.doesNotMatch(match!.corroborationText, /SUPER GUMMIES/);
});

test('findIngredientsPanelFromLines: a column break (different X range) is not merged into the same run', () => {
  const lines: OcrLineLike[] = [
    // Left column: a short 2-line address block.
    line('123 Main St,', 20, 300, 150, 318),
    line('Springfield.', 20, 320, 150, 338),
    // Right column (non-overlapping X): the real long ingredients run.
    line('Water, Sugar, Citric Acid,', 400, 300, 650, 318),
    line('Natural Flavours, Pectin,', 400, 320, 650, 338),
    line('Sodium Citrate, Colours.', 400, 340, 650, 358)
  ];
  const match = findIngredientsPanelFromLines(lines);
  assert.ok(match);
  assert.match(match!.corroborationText, /Water, Sugar/);
  assert.doesNotMatch(match!.corroborationText, /Main St/);
});

test('findIngredientsPanelFromLines: a large vertical gap breaks a run even within the same column', () => {
  const lines: OcrLineLike[] = [
    line('Directions: take one', 20, 100, 280, 118),
    line('gummy daily.', 20, 120, 280, 138),
    // A big gap (unrelated content in between, e.g. a nutrition table not
    // itself represented here) before the real ingredients run.
    line('Water, Sugar, Citric Acid,', 20, 600, 280, 618),
    line('Natural Flavours, Pectin,', 20, 620, 280, 638),
    line('Sodium Citrate, Colours.', 20, 640, 280, 658)
  ];
  const match = findIngredientsPanelFromLines(lines);
  assert.ok(match);
  assert.match(match!.corroborationText, /Water, Sugar/);
  assert.doesNotMatch(match!.corroborationText, /Directions/);
});

test('findIngredientsPanelFromLines: returns null when no run reaches the minimum line count -- too little signal to trust', () => {
  const lines: OcrLineLike[] = [
    line('Net Wt 60g', 20, 700, 120, 718),
    line('30 Gummies', 20, 720, 130, 738)
  ];
  assert.equal(findIngredientsPanelFromLines(lines), null);
});

test('findIngredientsPanelFromLines: returns null for empty input', () => {
  assert.equal(findIngredientsPanelFromLines([]), null);
});

// ============================================================================
// isCorroboratedWholePhrase -- the grounding check every VLM item must
// clear before being trusted, per Step 4.1's own spec: "accepted only
// when a PP-OCR or text-layer line in the same crop corroborates it
// whole-phrase".
// ============================================================================

test('isCorroboratedWholePhrase: an item that appears verbatim in the corroboration text passes', () => {
  assert.ok(isCorroboratedWholePhrase('Glucose Syrup', 'Ingredients: Glucose Syrup, Sugar, Water.'));
});

test('isCorroboratedWholePhrase: case and whitespace differences do not defeat a real match', () => {
  assert.ok(isCorroboratedWholePhrase('glucose   syrup', 'GLUCOSE SYRUP, Sugar, Water.'));
});

test('isCorroboratedWholePhrase: minor OCR punctuation noise does not defeat a real match', () => {
  assert.ok(isCorroboratedWholePhrase('Gelling Agents (INS 440)', 'Gelling Agents [INS 440], Sugar.'));
});

test('isCorroboratedWholePhrase: a fabricated item with no basis in the corroboration text fails', () => {
  assert.equal(isCorroboratedWholePhrase('Palm Oil', 'Ingredients: Glucose Syrup, Sugar, Water.'), false);
});

test('isCorroboratedWholePhrase: a longer item is not corroborated just because a shorter real ingredient is a substring of it', () => {
  // "Sugar" genuinely appears in the corroboration text, but "Palm Sugar"
  // as a WHOLE PHRASE does not -- the model naming a different, unprinted
  // ingredient must not be waved through just because part of its name
  // happens to match something real.
  assert.equal(isCorroboratedWholePhrase('Palm Sugar', 'Ingredients: Cane Sugar, Water.'), false);
});

// ============================================================================
// readIngredientsFromCrop -- the VLM call + grounding (now requires
// whole-phrase corroboration against the panel's own corroboration text,
// per Step 4.1's full spec)
// ============================================================================

function fakeClient(response: unknown): VlmClient {
  return { askJson: async () => response };
}

async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
}

const CORROBORATION_TEXT = 'Ingredients: Glucose Syrup, Sugar, Water, Pectin, Citric Acid.';

test('readIngredientsFromCrop: joins plausible, corroborated items into a comma-separated declaration', async () => {
  const image = await tinyPng();
  const client = fakeClient({ items: ['Glucose Syrup', 'Sugar', 'Water', 'Pectin', 'Citric Acid'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client, CORROBORATION_TEXT);
  assert.equal(result, 'Glucose Syrup, Sugar, Water, Pectin, Citric Acid');
});

test('readIngredientsFromCrop: rejects an item the corroboration text does not back up -- a model guess is not a printed fact until something independent confirms it', async () => {
  const image = await tinyPng();
  const client = fakeClient({ items: ['Glucose Syrup', 'Sugar', 'Palm Oil'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client, CORROBORATION_TEXT);
  assert.equal(result, 'Glucose Syrup, Sugar');
});

test('readIngredientsFromCrop: drops empty or absurdly long items -- a model guess is not a printed fact until it clears the same bar every other source does', async () => {
  const image = await tinyPng();
  const longItem = 'x'.repeat(150);
  const client = fakeClient({ items: ['Sugar', '', longItem, 'Water'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client, CORROBORATION_TEXT);
  assert.equal(result, 'Sugar, Water');
});

test('readIngredientsFromCrop: drops a pure-digit or pure-punctuation item (never a real ingredient name)', async () => {
  const image = await tinyPng();
  const client = fakeClient({ items: ['Sugar', '12345', '---', 'Water'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client, CORROBORATION_TEXT);
  assert.equal(result, 'Sugar, Water');
});

test('readIngredientsFromCrop: returns null when fewer than 2 plausible items survive -- the same floor extractIngredients itself applies', async () => {
  const image = await tinyPng();
  const client = fakeClient({ items: ['Sugar'] });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client, CORROBORATION_TEXT);
  assert.equal(result, null);
});

test('readIngredientsFromCrop: returns null for a malformed or empty VLM response, never throws', async () => {
  const image = await tinyPng();
  for (const response of [null, {}, { items: 'not an array' }, { items: [] }]) {
    const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, fakeClient(response), CORROBORATION_TEXT);
    assert.equal(result, null);
  }
});

test('readIngredientsFromCrop: caps at a generous item count to guard against a runaway hallucinated list', async () => {
  const image = await tinyPng();
  const items = Array.from({ length: 100 }, (_, i) => `Ingredient ${i}`);
  const longCorroboration = items.join(', ');
  const client = fakeClient({ items });
  const result = await readIngredientsFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client, longCorroboration);
  const count = result ? result.split(', ').length : 0;
  assert.ok(count <= 60, `expected at most 60 items, got ${count}`);
});
