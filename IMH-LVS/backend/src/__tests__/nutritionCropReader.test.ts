// Unit tests for nutritionCropReader.service.ts -- Step 7 of the accuracy2
// plan, turned from a design diagnostic (eval/STEP7_CROP_DIAGNOSTIC.md)
// into a real feature. See that doc for why this exists: a whole-page VLM
// read hallucinates a plausible-looking but wrong nutrition table; the
// same model reading a real-resolution crop of just the panel reads it
// correctly, at no extra latency cost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  findNutritionPanelFromSpans,
  findNutritionPanelFromWords,
  padCropBox,
  readNutritionTableFromCrop,
  type CropBox
} from '../services/nutritionCropReader.service';
import type { TextSpan } from '../services/pdf.service';
import type { OcrWord } from '../services/tesseract.service';
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

function ocrWord(props: { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number }): OcrWord {
  return { text: props.text, bbox: { x0: props.x0, y0: props.y0, x1: props.x1, y1: props.y1 }, confidence: props.confidence ?? 90 };
}

// ============================================================================
// findNutritionPanelFromSpans -- the PDF-text-layer path
// ============================================================================

test('findNutritionPanelFromSpans: finds the panel bounding box when the text layer has a real nutrition panel', () => {
  const spans: TextSpan[] = [
    span({ text: 'Nutrition Information', x: 300, y: 700, width: 200, fontSize: 12 }),
    span({ text: 'Energy', x: 300, y: 680, width: 60, fontSize: 10 }),
    span({ text: '16 kcal', x: 450, y: 680, width: 50, fontSize: 10 }),
    span({ text: 'Protein', x: 300, y: 660, width: 60, fontSize: 10 }),
    span({ text: '0 g', x: 450, y: 660, width: 30, fontSize: 10 })
  ];
  const box = findNutritionPanelFromSpans(spans, 792, 300);
  assert.ok(box, 'should find a panel');
  assert.ok(box!.width > 0 && box!.height > 0);
});

test('findNutritionPanelFromSpans: returns null when no panel matches the nutrition header', () => {
  const spans: TextSpan[] = [
    span({ text: 'Ingredients: Corn Syrup, Sugar, Water.', x: 20, y: 100, width: 300, fontSize: 10 })
  ];
  assert.equal(findNutritionPanelFromSpans(spans, 792, 300), null);
});

test('findNutritionPanelFromSpans: returns null for empty spans', () => {
  assert.equal(findNutritionPanelFromSpans([], 792, 300), null);
});

// ============================================================================
// findNutritionPanelFromWords -- the real-label fallback (no PDF text layer
// for the panel at all -- confirmed on Dr. Chewitals Vision IRN13-1.pdf,
// see STEP7_CROP_DIAGNOSTIC.md)
// ============================================================================

test('findNutritionPanelFromWords: finds a region from real nutrient-name anchor words', () => {
  const words: OcrWord[] = [
    ocrWord({ text: 'Energy', x0: 1500, y0: 650, x1: 1600, y1: 680 }),
    ocrWord({ text: 'Protein', x0: 1500, y0: 700, x1: 1620, y1: 730 }),
    ocrWord({ text: 'Vitamin', x0: 1500, y0: 750, x1: 1610, y1: 780 }),
    ocrWord({ text: 'Sodium', x0: 1500, y0: 800, x1: 1600, y1: 830 })
  ];
  const box = findNutritionPanelFromWords(words, 3426, 1772);
  assert.ok(box, 'should find a region from >= 3 anchor words');
  // Widened right to include the value column the anchor words themselves don't cover.
  assert.ok(box!.width > 100, `expected the box to be widened for the value column, got width=${box!.width}`);
});

test('findNutritionPanelFromWords: returns null with fewer than 3 anchor words (too little signal to trust)', () => {
  const words: OcrWord[] = [
    ocrWord({ text: 'Energy', x0: 1500, y0: 650, x1: 1600, y1: 680 }),
    ocrWord({ text: 'Protein', x0: 1500, y0: 700, x1: 1620, y1: 730 })
  ];
  assert.equal(findNutritionPanelFromWords(words, 3426, 1772), null);
});

test('findNutritionPanelFromWords: ordinary label prose is not mistaken for nutrient anchors', () => {
  const words: OcrWord[] = [
    ocrWord({ text: 'Keep', x0: 100, y0: 100, x1: 150, y1: 130 }),
    ocrWord({ text: 'out', x0: 160, y0: 100, x1: 200, y1: 130 }),
    ocrWord({ text: 'of', x0: 210, y0: 100, x1: 240, y1: 130 }),
    ocrWord({ text: 'reach', x0: 250, y0: 100, x1: 320, y1: 130 })
  ];
  assert.equal(findNutritionPanelFromWords(words, 3426, 1772), null);
});

// ============================================================================
// padCropBox
// ============================================================================

test('padCropBox: pads on all sides, clamped to the page bounds', () => {
  const box: CropBox = { left: 100, top: 100, width: 200, height: 150 };
  const padded = padCropBox(box, 20, 1000, 1000);
  assert.deepEqual(padded, { left: 80, top: 80, width: 240, height: 190 });
});

test('padCropBox: clamps at the top-left edge instead of going negative', () => {
  const box: CropBox = { left: 5, top: 5, width: 50, height: 50 };
  const padded = padCropBox(box, 20, 1000, 1000);
  assert.equal(padded.left, 0);
  assert.equal(padded.top, 0);
});

test('padCropBox: clamps at the bottom-right edge instead of exceeding the page', () => {
  const box: CropBox = { left: 950, top: 950, width: 40, height: 40 };
  const padded = padCropBox(box, 20, 1000, 1000);
  assert.equal(padded.left + padded.width, 1000);
  assert.equal(padded.top + padded.height, 1000);
});

// ============================================================================
// readNutritionTableFromCrop -- the VLM call + grounding
// ============================================================================

function fakeClient(response: unknown): VlmClient {
  return { askJson: async () => response };
}

async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
}

test('readNutritionTableFromCrop: accepts plausible rows (name + value starting with a number)', async () => {
  const image = await tinyPng();
  const client = fakeClient({
    rows: [
      { name: 'Energy', value: '16 kcal' },
      { name: 'Protein', value: '0 g' }
    ]
  });
  const result = await readNutritionTableFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.deepEqual(result, { Energy: '16 kcal', Protein: '0 g' });
});

test('readNutritionTableFromCrop: drops a row whose value does not start with a number -- a model guess is not a printed fact until it clears the same bar every other source does', async () => {
  const image = await tinyPng();
  const client = fakeClient({
    rows: [
      { name: 'Energy', value: '16 kcal' },
      { name: 'Marketing Claim', value: 'Supports Immunity' }
    ]
  });
  const result = await readNutritionTableFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.deepEqual(result, { Energy: '16 kcal' });
});

test('readNutritionTableFromCrop: drops a row with an empty or absurdly long name', async () => {
  const image = await tinyPng();
  const longName = 'x'.repeat(200);
  const client = fakeClient({
    rows: [
      { name: '', value: '16 kcal' },
      { name: longName, value: '10 mg' },
      { name: 'Sodium', value: '8 mg' }
    ]
  });
  const result = await readNutritionTableFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.deepEqual(result, { Sodium: '8 mg' });
});

test('readNutritionTableFromCrop: a repeated name keeps its first value, same convention as the text-layer/OCR paths', async () => {
  const image = await tinyPng();
  const client = fakeClient({
    rows: [
      { name: 'Energy', value: '16 kcal' },
      { name: 'Energy', value: '99 kcal' }
    ]
  });
  const result = await readNutritionTableFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.deepEqual(result, { Energy: '16 kcal' });
});

test('readNutritionTableFromCrop: returns null (not an empty object, not a throw) when every row is implausible', async () => {
  const image = await tinyPng();
  const client = fakeClient({ rows: [{ name: 'Note', value: 'see back panel' }] });
  const result = await readNutritionTableFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, client);
  assert.equal(result, null);
});

test('readNutritionTableFromCrop: returns null for a malformed or empty VLM response, never throws', async () => {
  const image = await tinyPng();
  for (const response of [null, {}, { rows: 'not an array' }, { rows: [] }]) {
    const result = await readNutritionTableFromCrop(image, { left: 0, top: 0, width: 40, height: 40 }, fakeClient(response));
    assert.equal(result, null);
  }
});
