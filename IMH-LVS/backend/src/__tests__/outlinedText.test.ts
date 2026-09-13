import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  projectSpanToPixels,
  coverageFraction,
  looksLikeDisplayText,
  findOutlinedLines,
  type OcrLineLike
} from '../services/outlinedText.service';
import type { Rectangle } from '../services/tesseract.service';

test('projectSpanToPixels: rotation 0', () => {
  const span = { x: 72, y: 72, width: 144, height: 36, rotation: 0 };
  const pageHeightPt = 792;
  const dpi = 300;
  const result = projectSpanToPixels(span, pageHeightPt, dpi);

  const s = dpi / 72; // 300/72 = 4.1667
  const expectedLeft = 72 * s; // 300
  const expectedTop = (792 - 108) * s; // 684 * 4.1667 = 2850
  const expectedWidth = 144 * s; // 600
  const expectedHeight = 36 * s; // 150

  assert.ok(Math.abs(result.left - expectedLeft) < 1e-6, `left: ${result.left} vs ${expectedLeft}`);
  assert.ok(Math.abs(result.top - expectedTop) < 1e-6, `top: ${result.top} vs ${expectedTop}`);
  assert.ok(Math.abs(result.width - expectedWidth) < 1e-6, `width: ${result.width} vs ${expectedWidth}`);
  assert.ok(Math.abs(result.height - expectedHeight) < 1e-6, `height: ${result.height} vs ${expectedHeight}`);
});

test('projectSpanToPixels: rotation PI/2', () => {
  const span = { x: 100, y: 100, width: 50, height: 10, rotation: Math.PI / 2 };
  const pageHeightPt = 792;
  const dpi = 300;
  const result = projectSpanToPixels(span, pageHeightPt, dpi);

  const s = dpi / 72;

  // After 90° rotation:
  // Corner (0, 0): X = 0 * 0 - 0 * 1 + 100 = 100, Y = 0 * 1 + 0 * 0 + 100 = 100
  // Corner (50, 0): X = 50 * 0 - 0 * 1 + 100 = 100, Y = 50 * 1 + 0 * 0 + 100 = 150
  // Corner (50, 10): X = 50 * 0 - 10 * 1 + 100 = 90, Y = 50 * 1 + 10 * 0 + 100 = 150
  // Corner (0, 10): X = 0 * 0 - 10 * 1 + 100 = 90, Y = 0 * 1 + 10 * 0 + 100 = 100
  // minX = 90, maxX = 100, minY = 100, maxY = 150

  const expectedLeft = 90 * s;
  const expectedTop = (pageHeightPt - 150) * s;
  const expectedWidth = 10 * s;
  const expectedHeight = 50 * s;

  assert.ok(Math.abs(result.left - expectedLeft) < 1e-6, `left: ${result.left} vs ${expectedLeft}`);
  assert.ok(Math.abs(result.top - expectedTop) < 1e-6, `top: ${result.top} vs ${expectedTop}`);
  assert.ok(Math.abs(result.width - expectedWidth) < 1e-6, `width: ${result.width} vs ${expectedWidth}`);
  assert.ok(Math.abs(result.height - expectedHeight) < 1e-6, `height: ${result.height} vs ${expectedHeight}`);
});

test('coverageFraction: no rects', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const result = coverageFraction(box, []);
  assert.equal(result, 0);
});

test('coverageFraction: one rect fully containing the box', () => {
  const box = { x0: 10, y0: 10, x1: 90, y1: 90 };
  const rects: Rectangle[] = [{ left: 0, top: 0, width: 100, height: 100 }];
  const result = coverageFraction(box, rects);
  assert.equal(result, 1);
});

test('coverageFraction: a rect covering exactly the left half', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const rects: Rectangle[] = [{ left: 0, top: 0, width: 50, height: 100 }];
  const result = coverageFraction(box, rects);
  assert.equal(result, 0.5);
});

test('coverageFraction: two identical full rects capped at 1', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const rects: Rectangle[] = [
    { left: 0, top: 0, width: 100, height: 100 },
    { left: 0, top: 0, width: 100, height: 100 }
  ];
  const result = coverageFraction(box, rects);
  assert.equal(result, 1);
});

test('coverageFraction: degenerate box (x1 === x0)', () => {
  const box = { x0: 50, y0: 0, x1: 50, y1: 100 };
  const rects: Rectangle[] = [{ left: 0, top: 0, width: 100, height: 100 }];
  const result = coverageFraction(box, rects);
  assert.equal(result, 0);
});

test('looksLikeDisplayText: returns true for valid display text', () => {
  const validTexts = ['Homeo-Vita', 'MULTIVITAMIN', 'GUMMIES', 'She- Arise', 'Net Content: 30 N'];
  for (const text of validTexts) {
    assert.equal(looksLikeDisplayText(text), true, `Should be true for "${text}"`);
  }
});

test('looksLikeDisplayText: returns false for invalid text', () => {
  const invalidTexts = ['WW 08', 'WW 03 Gondl io! HOMOEOPATHY Sed Lijy HOMOEOPATHY S', '30', '|', ':', '', '=) es'];
  for (const text of invalidTexts) {
    assert.equal(looksLikeDisplayText(text), false, `Should be false for "${text}"`);
  }
});

test('findOutlinedLines: with default options', () => {
  // Synthetic test lines
  const lines: OcrLineLike[] = [
    {
      text: 'Homeo-Vita',
      box: { x0: 0, y0: 0, x1: 100, y1: 137 },
      confidence: 0.98
    },
    {
      text: 'GUMMIES',
      box: { x0: 0, y0: 150, x1: 100, y1: 219 },
      confidence: 0.99
    },
    {
      text: 'NUTRITIONAL INFORMATION',
      box: { x0: 0, y0: 250, x1: 200, y1: 310 },
      confidence: 0.95
    },
    {
      text: 'Faint',
      box: { x0: 0, y0: 350, x1: 100, y1: 430 },
      confidence: 0.4
    },
    {
      text: 'tiny',
      box: { x0: 0, y0: 500, x1: 50, y1: 520 },
      confidence: 0.99
    },
    {
      text: 'gummies',
      box: { x0: 0, y0: 550, x1: 80, y1: 600 },
      confidence: 0.9
    }
  ];

  // Create a rectangle that covers line C (NUTRITIONAL INFORMATION) at 90%
  const spanRects: Rectangle[] = [
    {
      left: 0,
      top: 250,
      width: 180, // 90% of 200
      height: 60
    }
  ];

  const result = findOutlinedLines(lines, spanRects);

  // Expected: A, B (in that order by height desc)
  // A: 'Homeo-Vita' h=137, covered=0, conf=0.98 -> keep
  // B: 'GUMMIES' h=69, covered=0, conf=0.99 -> keep
  // C: 'NUTRITIONAL INFORMATION' h=60, covered=0.9, conf=0.95 -> filtered (coverage > 0.3)
  // D: 'Faint' h=80, covered=0, conf=0.4 -> filtered (conf < 0.6)
  // E: 'tiny' h=20, covered=0, conf=0.99 -> filtered (height < 40)
  // F: 'gummies' h=50, covered=0, conf=0.9 -> keep, but deduped with B

  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'Homeo-Vita');
  assert.equal(result[1].text, 'GUMMIES');
});

test('findOutlinedLines: with custom options and empty spanRects', () => {
  const lines: OcrLineLike[] = [
    {
      text: 'Homeo-Vita',
      box: { x0: 0, y0: 0, x1: 100, y1: 137 },
      confidence: 0.98
    },
    {
      text: 'GUMMIES',
      box: { x0: 0, y0: 150, x1: 100, y1: 219 },
      confidence: 0.99
    },
    {
      text: 'NUTRITIONAL INFORMATION',
      box: { x0: 0, y0: 250, x1: 200, y1: 310 },
      confidence: 0.95
    },
    {
      text: 'Faint',
      box: { x0: 0, y0: 350, x1: 100, y1: 430 },
      confidence: 0.4
    },
    {
      text: 'tiny',
      box: { x0: 0, y0: 500, x1: 50, y1: 520 },
      confidence: 0.99
    },
    {
      text: 'gummies',
      box: { x0: 0, y0: 550, x1: 80, y1: 600 },
      confidence: 0.9
    }
  ];

  const result = findOutlinedLines(lines, [], { minHeightPx: 10 });

  // Expected: A, B, C, E (in that order by height desc, then y0 asc)
  // A: 'Homeo-Vita' h=137, conf=0.98 -> keep
  // B: 'GUMMIES' h=69, conf=0.99 -> keep
  // C: 'NUTRITIONAL INFORMATION' h=60, conf=0.95 -> keep (now uncovered)
  // D: 'Faint' h=80, conf=0.4 -> filtered (conf < 0.6)
  // E: 'tiny' h=20 px, conf=0.99 -> passes minHeightPx=10
  // F: 'gummies' h=50, conf=0.9 -> deduped with B

  // Sort by height desc: A(137), D(80), B(69), C(60), F(50), E(10)
  // After filtering out D and deduping F: A(137), B(69), C(60), E(10)
  // By height desc then y0 asc: A, B, C, E

  assert.equal(result.length, 4);
  assert.equal(result[0].text, 'Homeo-Vita');
  assert.equal(result[1].text, 'GUMMIES');
  assert.equal(result[2].text, 'NUTRITIONAL INFORMATION');
  assert.equal(result[3].text, 'tiny');
});
