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
  type TextLine,
} from '../services/textLayerGeometry.service';
import { extractTextSpans } from '../services/pdf.service';
import type { TextSpan } from '../services/pdf.service';

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
