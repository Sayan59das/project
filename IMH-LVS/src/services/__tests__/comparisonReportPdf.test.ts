// Unit tests for comparisonReportPdf.ts's pure formatting helpers — the
// PDF generation itself needs real browser DOM/Canvas/Image/fetch APIs
// (see the module's own comment), so that part is verified by live browser
// smoke-testing rather than here; this covers what CAN run in plain Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cell, fieldRows, formatVersionLabel, visualCell } from '../../utils/comparisonReportPdf';
import type { LabelComparisonFieldResult } from '../../types/labelComparison';

test('cell renders a blank value as an em dash, not an empty string', () => {
  assert.equal(cell(''), '—');
  assert.equal(cell('   '), '—');
  assert.equal(cell('VitaFit'), 'VitaFit');
});

test('formatVersionLabel normalises any version representation to "vN"', () => {
  assert.equal(formatVersionLabel('V3'), 'v3');
  assert.equal(formatVersionLabel('v3'), 'v3');
  assert.equal(formatVersionLabel('3'), 'v3');
});

test('fieldRows builds one Parameter/Current/Compared/Result row per field, matching the brief\'s §10 table shape', () => {
  const fields: LabelComparisonFieldResult[] = [
    { field: 'brand', label: 'Brand', labelA: 'VitaFit', labelB: 'VitaFit', status: 'MATCH', similarity: 1, weight: 3, importance: 'HIGH' },
    { field: 'flavour', label: 'Flavour', labelA: 'Strawberry', labelB: '', status: 'MISSING', similarity: 0, weight: 2, importance: 'MEDIUM' }
  ];
  assert.deepEqual(fieldRows(fields), [
    ['Brand', 'VitaFit', 'VitaFit', 'MATCH'],
    ['Flavour', 'Strawberry', '—', 'MISSING']
  ]);
});

test('visualCell renders a real percentage when present, an em dash for MISSING (no percentage computed)', () => {
  assert.equal(visualCell({ status: 'MATCH', similarityPercentage: 97 }), '97%');
  assert.equal(visualCell({ status: 'MISSING' }), '—');
});
