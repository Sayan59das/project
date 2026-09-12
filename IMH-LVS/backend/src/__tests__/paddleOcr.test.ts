// Unit tests for paddleOcr.service.ts — PP-OCR line recognition wrapper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { collapseRepeatedPhrase, recognizeLines } from '../services/paddleOcr.service';
import { rasterizePdfPages } from '../services/pdf.service';

test('collapseRepeatedPhrase: Homeo-Vita Homeo-Vita Homeo-Vita → Homeo-Vita', () => {
  assert.equal(collapseRepeatedPhrase('Homeo-Vita Homeo-Vita Homeo-Vita'), 'Homeo-Vita');
});

test('collapseRepeatedPhrase: WW 08 WW 08 → WW 08', () => {
  assert.equal(collapseRepeatedPhrase('WW 08 WW 08'), 'WW 08');
});

test('collapseRepeatedPhrase: GUMMIES GUMMIES → GUMMIES', () => {
  assert.equal(collapseRepeatedPhrase('GUMMIES GUMMIES'), 'GUMMIES');
});

test('collapseRepeatedPhrase: NUTRINOU Proteins og 0% unchanged', () => {
  assert.equal(collapseRepeatedPhrase('NUTRINOU Proteins og 0%'), 'NUTRINOU Proteins og 0%');
});

test('collapseRepeatedPhrase: a a a a → a', () => {
  assert.equal(collapseRepeatedPhrase('a a a a'), 'a');
});

test('collapseRepeatedPhrase: a b a → a b a', () => {
  assert.equal(collapseRepeatedPhrase('a b a'), 'a b a');
});

test('collapseRepeatedPhrase: spaced out (with extra whitespace)', () => {
  assert.equal(collapseRepeatedPhrase('  spaced   out '), 'spaced out');
});

test('collapseRepeatedPhrase: empty string → empty string', () => {
  assert.equal(collapseRepeatedPhrase(''), '');
});

test.skip('recognizeLines: white 4×4 PNG → empty array (no throw)', async () => {
  // Create a small but valid PNG (4x4 white image)
  const whitePng = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 255, b: 255 } }
  }).png().toBuffer();

  // This should complete without throwing, returning an empty array
  // (the engine cannot extract text from a 4x4 image, which is expected)
  const lines = await recognizeLines(whitePng);
  assert.equal(Array.isArray(lines), true);
  assert.equal(lines.length, 0);
});

test('recognizeLines: real PDF fixture → lines with expected content', async () => {
  // First engine call takes ~10s, total test needs ~2 min

  const [page] = await rasterizePdfPages(
    readFileSync('M:/New Drive/Desktop/bot/project/IMH-LVS/Dataset_Example/Unicare MV IRN219-2 (1).pdf'),
    { maxPages: 1 }
  );

  const lines = await recognizeLines(page);

  // Assert we got many lines
  assert(lines.length > 20, `Expected > 20 lines, got ${lines.length}`);

  // Assert some line has 'Homeo-Vita' text with high confidence
  const homeoLine = lines.find((l) => l.text === 'Homeo-Vita');
  assert(homeoLine, 'Expected a line with text "Homeo-Vita"');
  assert(homeoLine.confidence >= 0.9, `Expected confidence >= 0.9, got ${homeoLine.confidence}`);

  // Assert some line matches /GUMMIES/
  const gummiesLine = lines.find((l) => /GUMMIES/i.test(l.text));
  assert(gummiesLine, 'Expected a line matching /GUMMIES/i');

  // Assert every box has valid dimensions and every confidence is in [0, 1]
  for (const line of lines) {
    assert(line.box.x1 > line.box.x0, `Expected x1 (${line.box.x1}) > x0 (${line.box.x0})`);
    assert(line.box.y1 > line.box.y0, `Expected y1 (${line.box.y1}) > y0 (${line.box.y0})`);
    assert(line.confidence >= 0 && line.confidence <= 1, `Expected confidence in [0, 1], got ${line.confidence}`);
  }
});
