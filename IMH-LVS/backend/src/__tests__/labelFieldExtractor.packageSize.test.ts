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

// Step 5 follow-up (accuracy plan): a real full 45-label run showed the
// ORIGINAL order (Net Content checked first) was wrong far more often
// than right — 22 of 26 wrong package_size answers were "<N> N" where the
// label's own front-of-pack form-word badge ("<N> Gummies"/"<N> Sticks")
// was the ground truth's actual answer, and both are genuinely printed on
// the same label (confirmed on a real one, Cal. Vit D IRN120-1.pdf: both
// "Net Content: 30 N" and a separate "30\nGUMMIES" badge are really
// there). The user was shown this exact tradeoff — including that it
// would flip Cal. Vit D IRN120-1 itself from correct to wrong — and chose
// to reorder anyway as the better net bet across all 45 labels.
test('prefers the form-word badge over the Net Content declaration when both are printed', () => {
  // Casing kept exactly as printed (the label really does print "GUMMIES"
  // in caps here), same as every other packageSize value — not a bug in
  // this test's assertion, matches the function's own documented behavior.
  const text = 'Net Content: 30 N\n30\nGUMMIES\nSupport for Strong, Healthy Bones and Teeth';
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});

test('still falls back to the Net Content declaration when no form-word badge exists', () => {
  const text = 'Net Content: 30 N\nSupport for Strong, Healthy Bones and Teeth';
  assert.equal(extractLabelFields(text).packageSize, '30 N');
});
