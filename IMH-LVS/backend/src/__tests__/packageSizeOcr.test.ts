// Unit tests for packageSizeOcr.service.ts's pure spatial-matching helpers
// — using synthetic OCR word data (bounding boxes + confidence) rather
// than real images, so these run instantly and deterministically,
// independent of real OCR variance. The full pipeline's real-artwork
// behavior is covered by the "She-Arise Gummies" and "Sharp Mind Plus
// Gummies" cases in labels.extract.test.ts; these tests isolate the
// spatial logic itself against the specific layouts it needs to handle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNearbyNumber, findProminentProductFormWord } from '../services/packageSizeOcr.service';
import type { OcrWord } from '../services/tesseract.service';

function word(text: string, box: { x0: number; y0: number; x1: number; y1: number }, confidence = 90): OcrWord {
  return { text, bbox: box, confidence };
}

test('findProminentProductFormWord picks a large front-badge form word over small body-text occurrences', () => {
  const words: OcrWord[] = [
    // Ordinary body copy, normal size (~14px tall) — "Serving Size: 1 gummy"
    word('Serving', { x0: 100, y0: 500, x1: 150, y1: 514 }),
    word('Size:', { x0: 155, y0: 500, x1: 190, y1: 514 }),
    word('1', { x0: 195, y0: 500, x1: 200, y1: 514 }),
    word('gummy', { x0: 205, y0: 500, x1: 240, y1: 514 }),
    // A handful of other body-sized words to establish the page's median height.
    word('Ingredients:', { x0: 100, y0: 550, x1: 180, y1: 564 }),
    word('Corn', { x0: 185, y0: 550, x1: 210, y1: 564 }),
    word('Syrup', { x0: 215, y0: 550, x1: 245, y1: 564 }),
    // The real front badge — much larger (~40px tall).
    word('Gummies', { x0: 300, y0: 800, x1: 420, y1: 840 })
  ];

  const result = findProminentProductFormWord(words);
  assert.equal(result?.text, 'Gummies');
});

test('findProminentProductFormWord returns null when no form word is prominently sized', () => {
  const words: OcrWord[] = [
    word('Serving', { x0: 100, y0: 500, x1: 150, y1: 514 }),
    word('Size:', { x0: 155, y0: 500, x1: 190, y1: 514 }),
    word('1', { x0: 195, y0: 500, x1: 200, y1: 514 }),
    word('gummy', { x0: 205, y0: 500, x1: 240, y1: 514 }),
    word('Ingredients:', { x0: 100, y0: 550, x1: 180, y1: 564 })
  ];

  assert.equal(findProminentProductFormWord(words), null);
});

test('findNearbyNumber (Layout E: separate OCR lines) joins adjacent single-digit tokens above the form word into one number', () => {
  const formWord = word('GUMMIES', { x0: 300, y0: 900, x1: 420, y1: 940 });
  const words: OcrWord[] = [
    formWord,
    // "30" printed above the badge's form word, read by OCR as two
    // separate adjacent digit tokens on the same row — the exact real
    // failure mode this was built for.
    word('3', { x0: 340, y0: 820, x1: 360, y1: 860 }),
    word('0', { x0: 365, y0: 820, x1: 385, y1: 860 })
  ];

  assert.equal(findNearbyNumber(words, formWord), '30');
});

test('findNearbyNumber (Layout D: one combined token) uses a single "30"-style token directly', () => {
  const formWord = word('GUMMIES', { x0: 300, y0: 900, x1: 420, y1: 940 });
  const words: OcrWord[] = [formWord, word('30', { x0: 340, y0: 820, x1: 385, y1: 860 })];

  assert.equal(findNearbyNumber(words, formWord), '30');
});

test('findNearbyNumber does not merge a digit token from a different, unrelated row even when it sorts between real ones by x-position', () => {
  const formWord = word('GUMMIES', { x0: 300, y0: 900, x1: 420, y1: 940 });
  const words: OcrWord[] = [
    formWord,
    word('3', { x0: 340, y0: 820, x1: 360, y1: 860 }),
    // A stray digit from a completely different row/context, whose x0
    // happens to fall between the real "3" and "0" — must not split them
    // apart or get absorbed into the result (the exact regression this
    // module's two-phase, row-then-column clustering was built to avoid).
    word('0', { x0: 362, y0: 1050, x1: 380, y1: 1082 }),
    word('0', { x0: 365, y0: 820, x1: 385, y1: 860 })
  ];

  assert.equal(findNearbyNumber(words, formWord), '30');
});

test('findNearbyNumber does not treat a percentage figure ("100%") as a package count', () => {
  const formWord = word('GUMMIES', { x0: 300, y0: 900, x1: 420, y1: 940 });
  const words: OcrWord[] = [formWord, word('100%', { x0: 320, y0: 950, x1: 380, y1: 985 })];

  assert.equal(findNearbyNumber(words, formWord), null);
});

test('findNearbyNumber (Layout F: no reliable evidence) returns null rather than guessing from a distant, unrelated number', () => {
  const formWord = word('GUMMIES', { x0: 300, y0: 900, x1: 420, y1: 940 });
  const words: OcrWord[] = [
    formWord,
    // A world away on the page (e.g. an ingredient quantity or a footnote) — far outside any reasonable proximity to the badge.
    word('150', { x0: 2000, y0: 100, x1: 2040, y1: 120 })
  ];

  assert.equal(findNearbyNumber(words, formWord), null);
});
