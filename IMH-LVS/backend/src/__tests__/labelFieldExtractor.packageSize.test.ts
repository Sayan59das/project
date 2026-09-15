// Unit tests for extractPackageSize (labelFieldExtractor.service.ts), via
// the public extractLabelFields entry point, against hand-built text — the
// full pipeline's real-artwork behavior is covered elsewhere
// (labels.extract.test.ts, packageSizeOcr.test.ts).
//
// Step 5.1 (accuracy plan): every real diff pair Step 1.2 found showed the
// SAME pattern — the correct number, with its unit word silently dropped
// ("30" instead of "30 Gummies", "30 N" instead of "30 N"... the Net
// Content case is subtler, see below). 35 of 40 wrong package_size answers
// in the real pipeline run were exactly this (STEP1_FAILURE_ANALYSIS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLabelFields } from '../services/labelFieldExtractor.service';

test('a "<number> Gummies" declaration keeps the unit word, not just the bare number', () => {
  // Real pattern: predicted was '30', expected '30 Gummies' on many labels.
  assert.equal(extractLabelFields('Net Weight: 30 Gummies').packageSize, '30 Gummies');
});

test('a "<number> Sticks" declaration keeps its own unit word', () => {
  // Real pattern from Shilajit Honey Sticks / LXIR Shilajit STICK labels:
  // predicted '30', expected '30 Sticks'.
  assert.equal(extractLabelFields('Contains 30 Sticks').packageSize, '30 Sticks');
});

test('a Net Content declaration keeps its own unit token ("N"), not just the number', () => {
  // Real pattern from several Cal. Vit D / Iron / Dr. Chewitals labels:
  // predicted '30', expected '30 N'.
  assert.equal(extractLabelFields('Net Content: 30 N').packageSize, '30 N');
});

test('a Net Content declaration spelled "Nos" keeps that unit token', () => {
  assert.equal(extractLabelFields('Net Qty: 60 Nos').packageSize, '60 Nos');
});

test('irregular OCR spacing around the unit word is normalised to one space', () => {
  assert.equal(extractLabelFields('30Gummies in every pack').packageSize, '30 Gummies');
});

test('still rejects a per-serving dose, not just the total pack count', () => {
  const text = 'Serving Size: 1 Gummy\nNet Content: 30 N';
  assert.equal(extractLabelFields(text).packageSize, '30 N');
});

test('still rejects a daily-dosage instruction, keeping only the real pack count', () => {
  const text = '2 Gummies daily.\nContains 60 Gummies';
  assert.equal(extractLabelFields(text).packageSize, '60 Gummies');
});

test('no confident wording anywhere leaves packageSize blank, as before', () => {
  assert.equal(extractLabelFields('No package size information here.').packageSize, '');
});
