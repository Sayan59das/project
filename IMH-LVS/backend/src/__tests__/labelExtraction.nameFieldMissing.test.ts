// Unit tests for nameFieldMissing (labelExtraction.service.ts) -- the gate
// that decides whether a brand/productName value is trustworthy enough to
// block the OCR/VLM name-recovery passes, or weak enough that those passes
// should still get a chance to find something better.
//
// Step 5 continuation (accuracy plan): reading brand_name's real wrong-
// answer list (eval/diff.py --mode pipeline --field brand_name) showed a
// recurring shape -- several client labels whose real brand is a stylised
// logo with no readable text anywhere fall back to a nearby allergen
// callout or a bare measurement instead ("Gelatin", "Gelatin Free",
// "12.00 mm"), none of which the old nameFieldMissing recognised as
// untrustworthy (looksLikeOcrGarbage only judges 2+ token values). These
// are real, un-invented values copied from that real run. Deliberately
// narrow -- reuses the same curated allergen/dietary vocabulary claims
// extraction already uses, not a blanket "distrust text-layer" rule (that
// blanket version was tried once this project's own history, Step 5.6,
// and reverted for breaking other real, working labels).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameFieldMissing } from '../services/labelExtraction.service';

test('a bare allergen word is treated as missing, not a trustworthy brand', () => {
  assert.equal(nameFieldMissing('Gelatin'), true);
  assert.equal(nameFieldMissing('Gluten'), true);
});

test('an allergen "X Free" claim is treated as missing', () => {
  assert.equal(nameFieldMissing('Gelatin Free'), true);
});

test('a bare measurement is treated as missing', () => {
  assert.equal(nameFieldMissing('12.00 mm'), true);
  assert.equal(nameFieldMissing('30 g'), true);
});

test('a real brand name is NOT treated as missing just because it is one word', () => {
  assert.equal(nameFieldMissing('Calrio'), false);
  assert.equal(nameFieldMissing('Sleeprio'), false);
  assert.equal(nameFieldMissing('VitaFit'), false);
});

test('a real brand name that happens to contain an allergen-like word is NOT treated as missing', () => {
  // Deliberately conservative: only a value made ENTIRELY of allergen
  // words is judged, so a genuine multi-word brand built around one
  // (unlikely, but the point is the check must not overreach) survives.
  assert.equal(nameFieldMissing('Golden Milk Wellness'), false);
});

test('blank and OCR-debris values are still treated as missing, as before', () => {
  assert.equal(nameFieldMissing(''), true);
  assert.equal(nameFieldMissing('Mc Mc Mg'), true);
});
