import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import {
  medianFontSize,
  groupSpansIntoLines,
  splitLineIntoCells,
  rankDisplayLines,
  segmentPanels,
  toReadingOrderText,
  extractNutritionTableFromPanels,
  ocrWordsToTextSpans,
  extractNutritionTableFromOcrWords,
  type TextLine,
} from '../services/textLayerGeometry.service';
import { extractTextSpans } from '../services/pdf.service';
import type { TextSpan } from '../services/pdf.service';
import type { OcrWord } from '../services/tesseract.service';

const FIXTURES = path.join(__dirname, 'fixtures');
const load = (name: string) => readFileSync(path.join(FIXTURES, name));

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
    fontName: props.fontName ?? 'F',
  };
}

test('medianFontSize: empty input returns 0', () => {
  assert.equal(medianFontSize([]), 0);
});

test('medianFontSize: odd-length array returns middle element', () => {
  const sizes = [span({ text: 'a', x: 0, y: 0, width: 10, fontSize: 8 }), span({ text: 'b', x: 10, y: 0, width: 10, fontSize: 8 }), span({ text: 'c', x: 20, y: 0, width: 10, fontSize: 24 })];
  assert.equal(medianFontSize(sizes), 8);
});

test('medianFontSize: even-length array returns average of two middle elements', () => {
  const sizes = [span({ text: 'a', x: 0, y: 0, width: 10, fontSize: 8 }), span({ text: 'b', x: 10, y: 0, width: 10, fontSize: 24 })];
  assert.equal(medianFontSize(sizes), 16);
});

test('groupSpansIntoLines: two spans on same baseline join into one line', () => {
  const spans = [
    span({ text: 'Vitamin', x: 10, y: 100, width: 40, fontSize: 8 }),
    span({ text: 'C', x: 60, y: 100, width: 10, fontSize: 8 }),
    span({ text: '40 mg', x: 10, y: 88, width: 30, fontSize: 8 }),
  ];
  const lines = groupSpansIntoLines(spans);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'Vitamin C');
  assert.equal(lines[1].text, '40 mg');
});

test('groupSpansIntoLines: rotated span does not join unrotated line', () => {
  const spans = [
    span({ text: 'Normal', x: 0, y: 0, width: 10, fontSize: 8 }),
    span({ text: 'Rotated', x: 0, y: 0, width: 10, fontSize: 8, rotation: 1.571 }),
  ];
  const lines = groupSpansIntoLines(spans);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].rotation, 0);
  assert.equal(lines[1].rotation, 1.57); // rounded to 2 dp
});

test('groupSpansIntoLines: rotated lines come after unrotated', () => {
  const spans = [
    span({ text: 'Rotated', x: 0, y: 50, width: 10, fontSize: 8, rotation: 1.571 }),
    span({ text: 'Normal', x: 0, y: 0, width: 10, fontSize: 8 }),
  ];
  const lines = groupSpansIntoLines(spans);
  assert.equal(lines[0].rotation, 0);
  assert.equal(lines[1].rotation, 1.57);
});

test('splitLineIntoCells: small gap joins into one cell', () => {
  const line: TextLine = {
    page: 1,
    text: 'Vitamin C',
    rotation: 0,
    along: 10,
    extent: 60,
    cross: 100,
    fontSize: 8,
    spans: [
      span({ text: 'Vitamin', x: 10, y: 100, width: 40, fontSize: 8 }),
      span({ text: 'C', x: 60, y: 100, width: 10, fontSize: 8 }),
    ],
  };
  const cells = splitLineIntoCells(line);
  assert.equal(cells.length, 1);
  assert.equal(cells[0], 'Vitamin C');
});

test('splitLineIntoCells: large gap creates two cells', () => {
  const line: TextLine = {
    page: 1,
    text: 'Vitamin C',
    rotation: 0,
    along: 10,
    extent: 80,
    cross: 100,
    fontSize: 8,
    spans: [
      span({ text: 'Vitamin', x: 10, y: 100, width: 40, fontSize: 8 }),
      span({ text: 'C', x: 80, y: 100, width: 10, fontSize: 8 }),
    ],
  };
  const cells = splitLineIntoCells(line);
  assert.equal(cells.length, 2);
});

test('rankDisplayLines: returns only lines >= ratio * median', () => {
  const allSpans = [
    span({ text: 'Title', x: 0, y: 0, width: 10, fontSize: 24 }),
    span({ text: 'a', x: 0, y: 50, width: 10, fontSize: 8 }),
    span({ text: 'b', x: 0, y: 60, width: 10, fontSize: 8 }),
    span({ text: 'c', x: 0, y: 70, width: 10, fontSize: 8 }),
    span({ text: 'd', x: 0, y: 80, width: 10, fontSize: 8 }),
  ];
  const lines = groupSpansIntoLines(allSpans);
  const displayLines = rankDisplayLines(lines);
  assert.equal(displayLines.length, 1);
  assert.equal(displayLines[0].text, 'Title');
});

test('rankDisplayLines: excludes lines too small compared to median', () => {
  const allSpans = [
    span({ text: 'Small', x: 0, y: 0, width: 10, fontSize: 10 }),
    span({ text: 'a', x: 0, y: 50, width: 10, fontSize: 8 }),
    span({ text: 'b', x: 0, y: 60, width: 10, fontSize: 8 }),
  ];
  const lines = groupSpansIntoLines(allSpans);
  const displayLines = rankDisplayLines(lines);
  assert.equal(displayLines.length, 0); // 10 < 2.5 * 8
});

test('rankDisplayLines: excludes lines with no letters', () => {
  const allSpans = [
    span({ text: '500', x: 0, y: 0, width: 10, fontSize: 30 }),
    span({ text: 'a', x: 0, y: 50, width: 10, fontSize: 8 }),
  ];
  const lines = groupSpansIntoLines(allSpans);
  const displayLines = rankDisplayLines(lines);
  assert.equal(displayLines.length, 0); // '500' has no letters
});

test('rankDisplayLines: returns empty when median is 0', () => {
  const emptySpans: TextSpan[] = [];
  const displayLines = rankDisplayLines([], 2.5);
  assert.equal(displayLines.length, 0);
});

test('segmentPanels: two columns of 3 spans each with shared baselines → two panels', () => {
  // Two columns: left at x=0..100, right at x=400..500, three shared baselines (y=100, 80, 60)
  // Since no span bridges the columns, they remain separate panels.
  const allSpans = [
    span({ text: 'Left1', x: 0, y: 100, width: 100, fontSize: 8 }),
    span({ text: 'Left2', x: 0, y: 80, width: 100, fontSize: 8 }),
    span({ text: 'Left3', x: 0, y: 60, width: 100, fontSize: 8 }),
    span({ text: 'Right1', x: 400, y: 100, width: 100, fontSize: 8 }),
    span({ text: 'Right2', x: 400, y: 80, width: 100, fontSize: 8 }),
    span({ text: 'Right3', x: 400, y: 60, width: 100, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  assert.equal(panels.length, 2);
  // First panel has left column, second has right column
  assert.ok(panels[0].lines[0].text.includes('Left1'));
  assert.ok(panels[1].lines[0].text.includes('Right1'));
});

test('segmentPanels: wide header span bridges columns into one panel', () => {
  // A wide header span at x=0 width 500 bridges both columns on a fourth baseline (y=120)
  // This creates one panel that contains spans from both columns.
  const allSpans = [
    span({ text: 'Header', x: 0, y: 120, width: 500, fontSize: 8 }),
    span({ text: 'Left1', x: 0, y: 100, width: 100, fontSize: 8 }),
    span({ text: 'Right1', x: 400, y: 100, width: 100, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  assert.equal(panels.length, 1);
  // The panel contains both left and right spans
  const allText = panels[0].lines.map((l) => l.text).join(' ');
  assert.ok(allText.includes('Left1'));
  assert.ok(allText.includes('Right1'));
});

test('segmentPanels: nutrition-row case — header bridges name and value on one line', () => {
  // Header span at x=0 width 300 (y=200) bridges a nutrition row:
  // "Vitamin C" at x=0 width 40 (y=188) and "40 mg" at x=250 width 25 (y=188).
  // Because the header bridges the gap, all three spans are in one panel,
  // and the baseline y=188 becomes ONE line with two spans.
  const withHeader = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Vitamin C', x: 0, y: 188, width: 40, fontSize: 8 }),
    span({ text: '40 mg', x: 250, y: 188, width: 25, fontSize: 8 }),
  ];
  const panels = segmentPanels(withHeader);
  assert.equal(panels.length, 1, 'Header bridges columns into one panel');
  // Find the line at y=188 (cross=188 for rotation 0)
  const line188 = panels[0].lines.find((l) => Math.abs(l.cross - 188) < 1);
  assert.ok(line188, 'Should have a line at y=188');
  assert.equal(line188!.text, 'Vitamin C 40 mg', 'Line should contain both name and value');
  const cells = splitLineIntoCells(line188!);
  assert.deepEqual(cells, ['Vitamin C', '40 mg'], 'Cells should split by the gap');

  // Without the header, the two spans are in separate panels
  const withoutHeader = [
    span({ text: 'Vitamin C', x: 0, y: 188, width: 40, fontSize: 8 }),
    span({ text: '40 mg', x: 250, y: 188, width: 25, fontSize: 8 }),
  ];
  const panelsNoHeader = segmentPanels(withoutHeader);
  assert.equal(panelsNoHeader.length, 2, 'Without header, no span bridges the gap, so two panels');
});

test('toReadingOrderText: converts spans to reading-order text with panels separated by blank lines', async () => {
  const allSpans = [
    span({ text: 'Left1', x: 0, y: 100, width: 100, fontSize: 8 }),
    span({ text: 'Left2', x: 0, y: 80, width: 100, fontSize: 8 }),
    span({ text: 'Left3', x: 0, y: 60, width: 100, fontSize: 8 }),
    span({ text: 'Right1', x: 400, y: 100, width: 100, fontSize: 8 }),
    span({ text: 'Right2', x: 400, y: 80, width: 100, fontSize: 8 }),
    span({ text: 'Right3', x: 400, y: 60, width: 100, fontSize: 8 }),
  ];
  const text = toReadingOrderText(allSpans);
  const parts = text.split('\n\n');
  assert.ok(parts.length >= 2);
  assert.ok(parts[0].includes('Left1'));
  assert.ok(parts[0].includes('Left2'));
  assert.ok(parts[0].includes('Left3'));
  assert.ok(parts[1].includes('Right1'));
});

test('toReadingOrderText: returns empty string for empty spans', () => {
  const text = toReadingOrderText([]);
  assert.equal(text, '');
});

test('toReadingOrderText: real fixture she-arise-gummies.pdf', async () => {
  const spans = await extractTextSpans(load('she-arise-gummies.pdf'));
  assert.ok(spans.length > 0);

  const text = toReadingOrderText(spans);
  assert.ok(text.length > 0);

  // Every span's text appears in the reading order text
  for (const span of spans) {
    assert.ok(text.includes(span.text.trim()), `span text "${span.text}" not found in reading order`);
  }

  // The brand text (biggest span) is in the display lines
  const lines = groupSpansIntoLines(spans);
  const displayLines = rankDisplayLines(lines);
  assert.ok(displayLines.length > 0);
  assert.ok(displayLines[0].text.includes('She-Arise'));
});

test('extractNutritionTableFromPanels: header + two two-cell rows and one three-cell row', () => {
  // fontSize 8, y descending by 12 per row; header span width bridges name and value columns
  const allSpans = [
    // Header at y=200 with wide width to bridge columns
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    // Row 1: Energy | 12 kcal
    span({ text: 'Energy', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '12 kcal', x: 200, y: 188, width: 50, fontSize: 8 }),
    // Row 2: Protein | 0.5 g
    span({ text: 'Protein', x: 0, y: 176, width: 50, fontSize: 8 }),
    span({ text: '0.5 g', x: 200, y: 176, width: 50, fontSize: 8 }),
    // Row 3: Vitamin C | 40 mg | 66% (three cells; the one %RDA column is
    // now kept, appended as "(66% DV)" -- see the %DV-append tests below
    // for why this changed from the old drop-it behavior).
    span({ text: 'Vitamin C', x: 0, y: 164, width: 60, fontSize: 8 }),
    span({ text: '40 mg', x: 200, y: 164, width: 50, fontSize: 8 }),
    span({ text: '66%', x: 270, y: 164, width: 30, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    Energy: '12 kcal',
    Protein: '0.5 g',
    'Vitamin C': '40 mg (66% DV)',
  });
});

// Step 6-prep (accuracy plan follow-up): the ground-truth review found
// several nutrition tables where a real single %DV/%RDA column WAS being
// dropped even though it's genuinely printed and the ground truth records
// it (e.g. "0 g (0% DV)", "170 mg (100% DV)"). A single extra column is
// unambiguous -- there's only one number it could be -- so it's now kept.
// A row with TWO OR MORE extra columns (e.g. separate Kids/Teens figures)
// is deliberately left as before: which column belongs to which age group
// would need the header row's own labels read and matched positionally,
// a real, separate piece of work not attempted here.
test('extractNutritionTableFromPanels: a single extra %DV/%RDA column is kept, appended as "(<value> DV)"', () => {
  const allSpans = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Iron', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '13 mg', x: 200, y: 188, width: 50, fontSize: 8 }),
    span({ text: '<0.5%', x: 270, y: 188, width: 40, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    Iron: '13 mg (<0.5% DV)',
  });
});

test('extractNutritionTableFromPanels: two extra columns (e.g. Kids/Teens) are left dropped, not guessed at', () => {
  const allSpans = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Iron', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '13 mg', x: 200, y: 188, width: 50, fontSize: 8 }),
    span({ text: '100%', x: 270, y: 188, width: 40, fontSize: 8 }),
    span({ text: '50%', x: 320, y: 188, width: 40, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    Iron: '13 mg',
  });
});

test('extractNutritionTableFromPanels: stop at Ingredients', () => {
  // Header + 2 rows, then "Ingredients:" stops the table
  const allSpans = [
    span({ text: 'Nutrition Facts', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Energy', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '12 kcal', x: 200, y: 188, width: 50, fontSize: 8 }),
    span({ text: 'Protein', x: 0, y: 176, width: 50, fontSize: 8 }),
    span({ text: '0.5 g', x: 200, y: 176, width: 50, fontSize: 8 }),
    // This line stops the table
    span({ text: 'Ingredients: sugar, water', x: 0, y: 164, width: 200, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    Energy: '12 kcal',
    Protein: '0.5 g',
  });
});

test('extractNutritionTableFromPanels: no header returns empty object', () => {
  const allSpans = [
    span({ text: 'Energy', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '12 kcal', x: 200, y: 188, width: 50, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {});
});

test('extractNutritionTableFromPanels: one-cell rows and skipped rows', () => {
  const allSpans = [
    span({ text: 'Nutrition Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    // One-cell row: "Vitamin D3 400 IU" (has digit at start, should be included)
    span({ text: 'Vitamin D3 400 IU', x: 0, y: 188, width: 120, fontSize: 8 }),
    // One-cell row with no digit: "Per serving %RDA" (no digit, skipped)
    span({ text: 'Per serving %RDA', x: 0, y: 176, width: 120, fontSize: 8 }),
    // Two-cell row that should be skipped: value doesn't start with a digit
    span({ text: 'Per Serving', x: 0, y: 164, width: 70, fontSize: 8 }),
    span({ text: 'in Adults (18 years & above)', x: 200, y: 164, width: 120, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    'Vitamin D3': '400 IU',
  });
});

test('extractNutritionTableFromPanels: rows in different panel not included', () => {
  // Header in left panel (x 0-300), rows in left panel, then a row in right panel (x 400+)
  const allSpans = [
    // Header at x=0 width 300 (left panel only)
    span({ text: 'Nutrition Facts', x: 0, y: 200, width: 300, fontSize: 8 }),
    // Row in left panel
    span({ text: 'Energy', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '12 kcal', x: 200, y: 188, width: 50, fontSize: 8 }),
    // Row in right panel (x 400+) - should NOT be included
    span({ text: 'Protein', x: 400, y: 188, width: 50, fontSize: 8 }),
    span({ text: '0.5 g', x: 600, y: 188, width: 50, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  // Should only include the row from the same panel as the header
  assert.deepEqual(result, {
    Energy: '12 kcal',
  });
});

test('extractNutritionTableFromPanels: repeated name keeps first value', () => {
  const allSpans = [
    span({ text: 'Nutrition Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Energy', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '12 kcal', x: 200, y: 188, width: 50, fontSize: 8 }),
    // Duplicate name
    span({ text: 'Energy', x: 0, y: 176, width: 50, fontSize: 8 }),
    span({ text: '10 kcal', x: 200, y: 176, width: 50, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    Energy: '12 kcal', // First value is kept
  });
});

// Step 5.1 (accuracy plan): the dominant real bug found in
// STEP1_FAILURE_ANALYSIS.md's nutrition_table sample — a footnote/dosage/
// storage sentence elsewhere in the panel, which happens to start with a
// digit, gets captured as if it were a nutrient row's value. Real examples
// below are taken directly from eval/diff.py --field nutrition_table
// output, not invented (see the comment on each).
test('extractNutritionTableFromPanels: a footnote sentence starting with a digit is not captured as a value', () => {
  // Real value from Calrio/CALRIO Gummies' wrong nutrition_table cells —
  // a "based on a 2000kcal diet" disclaimer line, not a nutrient.
  const allSpans = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Energy', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '12 kcal', x: 200, y: 188, width: 50, fontSize: 8 }),
    span({
      text: '2,000 kcal energy per day, however, calorie needs may vary.',
      x: 0,
      y: 176,
      width: 300,
      fontSize: 8
    })
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, { Energy: '12 kcal' });
});

test('extractNutritionTableFromPanels: an RDA-guideline sentence starting with a year is not captured', () => {
  // Real value from several labels' wrong nutrition_table cells — "2020
  // guidelines for Children 5-17years & ..." is a citation for where the
  // %RDA figures come from, not itself a row.
  const allSpans = [
    span({ text: 'Nutrition Facts', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Protein', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '0.5 g', x: 200, y: 188, width: 50, fontSize: 8 }),
    span({ text: '2020 guidelines for Children 5-17years &', x: 0, y: 176, width: 300, fontSize: 8 })
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, { Protein: '0.5 g' });
});

test('extractNutritionTableFromPanels: a dosage sentence with a short parenthetical but more prose after it is not captured', () => {
  // Real value from Calcimax's wrong nutrition_table cells — the
  // parenthetical ("approx. 3g") is short like a real DV annotation, but
  // there's meaningful text after it closes, which a real value never has.
  const allSpans = [
    span({ text: 'Nutrition Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Energy', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '12 kcal', x: 200, y: 188, width: 50, fontSize: 8 }),
    span({
      text: '1 gummy (approx. 3g) for kids & 2 gummies for adults.',
      x: 0,
      y: 176,
      width: 300,
      fontSize: 8
    })
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, { Energy: '12 kcal' });
});

test('extractNutritionTableFromPanels: a real DV/RDA parenthetical breakdown is still captured, even though it is wordy', () => {
  // Real CORRECT value shape (Step 1.2/Step 3's near-miss pattern) — must
  // not be broken by the footnote-rejection rule above just because it has
  // several words inside its parenthetical.
  const allSpans = [
    span({ text: 'Nutrition Facts', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Iron', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({
      text: '0.5 mg (Children 1% / Teens 0.25% / Adults <0.5% DV)',
      x: 200,
      y: 188,
      width: 200,
      fontSize: 8
    })
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, { Iron: '0.5 mg (Children 1% / Teens 0.25% / Adults <0.5% DV)' });
});

test('extractNutritionTableFromPanels: real fixture she-arise-gummies.pdf', async () => {
  const spans = await extractTextSpans(load('she-arise-gummies.pdf'));
  const panels = segmentPanels(spans);
  const result = extractNutritionTableFromPanels(panels);

  assert.equal(typeof result, 'object');
  // Every value should contain a digit
  for (const [name, value] of Object.entries(result)) {
    assert.ok(/\d/.test(value), `Value for "${name}" ("${value}") should contain a digit`);
  }
});

test('extractNutritionTableFromPanels: real fixture chyawanprash-gummies.pdf', async () => {
  const spans = await extractTextSpans(load('chyawanprash-gummies.pdf'));
  const panels = segmentPanels(spans);
  const result = extractNutritionTableFromPanels(panels);

  assert.equal(typeof result, 'object');
  for (const [name, value] of Object.entries(result)) {
    assert.ok(/\d/.test(value), `Value for "${name}" ("${value}") should contain a digit`);
  }
});

test('extractNutritionTableFromPanels: real fixture IMH-LVS/Dataset_Example/Multivitamin IRN56-3.pdf', async () => {
  const spans = await extractTextSpans(load('../../../../Dataset_Example/Multivitamin IRN56-3.pdf'));
  const panels = segmentPanels(spans);
  const result = extractNutritionTableFromPanels(panels);

  assert.equal(typeof result, 'object');
  for (const [name, value] of Object.entries(result)) {
    assert.ok(/\d/.test(value), `Value for "${name}" ("${value}") should contain a digit`);
  }
});

test('extractNutritionTableFromPanels: value cleanup strips trailing %-column tokens', () => {
  // Test case from brief: "7.5 kcal <0.5% <0.5% <0.5%" should become "7.5 kcal"
  const allSpans = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    // This row has the value cell containing %RDA columns
    span({ text: 'Some Nutrient', x: 0, y: 188, width: 80, fontSize: 8 }),
    span({ text: '7.5 kcal <0.5% <0.5% <0.5%', x: 200, y: 188, width: 150, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    'Some Nutrient': '7.5 kcal',
  }, 'Value should have trailing %-column tokens stripped');
});

test('extractNutritionTableFromPanels: value with parenthesized % is left alone', () => {
  // Test case from brief: "40 mg (66%)" should NOT be changed because the % is in parentheses
  const allSpans = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Calcium', x: 0, y: 188, width: 50, fontSize: 8 }),
    span({ text: '40 mg (66%)', x: 200, y: 188, width: 80, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    'Calcium': '40 mg (66%)',
  }, 'Value with parenthesized % should not be stripped');
});

// Step 6-prep (accuracy plan follow-up): the single-cell counterpart to the
// multi-cell "single extra %DV/%RDA column is kept" test above -- same
// underlying situation (a real %DV figure right after the amount), just
// reaching stripTrailingPercentColumns via the single merged-string parse
// path instead of splitLineIntoCells's gap-based columns.
test('extractNutritionTableFromPanels: a single trailing %-figure (single-cell row) is kept, appended as "(<value> DV)"', () => {
  const allSpans = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Zinc 4 mg <0.5%', x: 0, y: 188, width: 300, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    Zinc: '4 mg (<0.5% DV)',
  });
});

test('extractNutritionTableFromPanels: multiple trailing %-figures (single-cell row) still get dropped, not guessed at', () => {
  // Same "7.5 kcal <0.5% <0.5% <0.5%" shape as the brief's own test above,
  // just confirming the new single-figure exception doesn't fire here too.
  const allSpans = [
    span({ text: 'Nutritional Information', x: 0, y: 200, width: 300, fontSize: 8 }),
    span({ text: 'Some Other Nutrient 7.5 kcal <0.5% <0.5% <0.5%', x: 0, y: 188, width: 300, fontSize: 8 }),
  ];
  const panels = segmentPanels(allSpans);
  const result = extractNutritionTableFromPanels(panels);

  assert.deepEqual(result, {
    'Some Other Nutrient': '7.5 kcal',
  });
});

function ocrWord(props: { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number }): OcrWord {
  return {
    text: props.text,
    bbox: { x0: props.x0, y0: props.y0, x1: props.x1, y1: props.y1 },
    confidence: props.confidence ?? 90,
  };
}

test('ocrWordsToTextSpans: pixel (y-down) coordinates are converted to PDF-style (y-up) spans', () => {
  // A word nearer the TOP of the image (smaller y0) must end up with a
  // LARGER converted y than a word further down — matching the PDF-space
  // convention the rest of this module's geometry sorting (cross DESC)
  // assumes, so a page read via OCR sorts top-to-bottom just like one read
  // from a real PDF text layer.
  const words = [
    ocrWord({ text: 'Top', x0: 10, y0: 20, x1: 40, y1: 32 }),
    ocrWord({ text: 'Bottom', x0: 10, y0: 200, x1: 60, y1: 212 }),
  ];
  const spans = ocrWordsToTextSpans(words);
  const top = spans.find((s) => s.text === 'Top')!;
  const bottom = spans.find((s) => s.text === 'Bottom')!;
  assert.ok(top.y > bottom.y, 'the word nearer the top of the image should have the larger (PDF-style) y');
  assert.equal(top.rotation, 0);
  assert.equal(top.width, 30);
  assert.equal(top.fontSize, 12);
});

test('extractNutritionTableFromOcrWords: recovers a nutrition table from OCR word boxes alone (no PDF text layer)', () => {
  // Real shape of the problem this exists for: some client labels render
  // their whole nutrition panel as artwork, so the PDF text layer has zero
  // nutrition data — extractNutritionTableFromPanels(segmentPanels(spans))
  // on the real text layer returns {} no matter what. This is the OCR
  // fallback: the same header+rows table, but built from a rasterized
  // page's OCR word boxes (pixel, y-down) instead of PDF spans (points,
  // y-up) — three rows, one row's value has a single trailing %DV column
  // that should be kept exactly like the PDF-text-layer path already does.
  const words = [
    ocrWord({ text: 'Nutrition', x0: 20, y0: 40, x1: 90, y1: 52 }),
    ocrWord({ text: 'Information', x0: 92, y0: 40, x1: 170, y1: 52 }),
    ocrWord({ text: 'Energy', x0: 20, y0: 60, x1: 70, y1: 72 }),
    ocrWord({ text: '12', x0: 220, y0: 60, x1: 235, y1: 72 }),
    ocrWord({ text: 'kcal', x0: 238, y0: 60, x1: 265, y1: 72 }),
    ocrWord({ text: 'Protein', x0: 20, y0: 80, x1: 75, y1: 92 }),
    ocrWord({ text: '0.5', x0: 220, y0: 80, x1: 240, y1: 92 }),
    ocrWord({ text: 'g', x0: 243, y0: 80, x1: 250, y1: 92 }),
    ocrWord({ text: 'Vitamin', x0: 20, y0: 100, x1: 70, y1: 112 }),
    ocrWord({ text: 'C', x0: 73, y0: 100, x1: 82, y1: 112 }),
    ocrWord({ text: '40', x0: 220, y0: 100, x1: 235, y1: 112 }),
    ocrWord({ text: 'mg', x0: 238, y0: 100, x1: 255, y1: 112 }),
    ocrWord({ text: '66%', x0: 290, y0: 100, x1: 315, y1: 112 }),
  ];
  const result = extractNutritionTableFromOcrWords(words);

  assert.deepEqual(result, {
    Energy: '12 kcal',
    Protein: '0.5 g',
    'Vitamin C': '40 mg (66% DV)',
  });
});
