// Unit tests for mergeClaimsResults (labelExtraction.service.ts).
//
// Step 5 continuation (accuracy plan): a real gap found by dumping one
// real label's actual text two different ways (Cal. Vit D IRN120-2.pdf).
// Claims extraction uses the geometry-based "reading order" text as its
// primary source (it generally respects visual layout better than the
// PDF's plain flattened text) -- but for this label, the reading-order
// reconstruction scrambles a "NO GELATIN NO GLUTEN NO MILK..." allergen
// badge row that sits spatially close to the nutrition table: "NO" ends
// up appended to one nutrition-table line and "GELATIN" to a completely
// different one, losing the claim entirely. The plain flattened text
// keeps the same badge cluster together and finds it correctly:
//   extractClaims(flattened text)     -> ...| No Gelatin | No Gluten | ...
//   extractClaims(reading-order text) -> missing all six
// Confirmed directly against the real PDF, not invented. Merging by
// union (rather than switching primary sources, which would risk
// breaking whatever reading-order text does BETTER for other labels)
// recovers the claim from whichever text preserves it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeClaimsResults } from '../services/labelExtraction.service';
import { extractClaims } from '../services/labelSemanticExtractor.service';

test('recovers a claim the primary text lost but the secondary text still has', () => {
  const primary = extractClaims('Calories 12 kcal\nNO\nTotal Carbohydrate 3.2 g GELATIN');
  const primaryText = 'Calories 12 kcal\nNO\nTotal Carbohydrate 3.2 g GELATIN';
  const secondary = 'NO\nGELATIN\nNO\nGLUTEN';
  const merged = mergeClaimsResults(primary, primaryText, secondary, []);
  assert.ok(merged.claims.includes('No Gelatin'));
  assert.ok(merged.claims.includes('No Gluten'));
});

test('does not duplicate a claim both texts agree on', () => {
  const primary = extractClaims('Gluten Free');
  const merged = mergeClaimsResults(primary, 'Gluten Free', 'Gluten Free', []);
  assert.deepEqual(merged.claims.split(' | '), ['Gluten Free']);
});

test('with no secondary text, returns the primary result unchanged', () => {
  const primary = extractClaims('Gluten Free. Milk Free.');
  const merged = mergeClaimsResults(primary, 'Gluten Free. Milk Free.', undefined, []);
  assert.equal(merged, primary);
});

test('matched/unmatched are recomputed correctly across the merged set', () => {
  const primary = extractClaims('Supports Immunity', ['Supports Immunity']);
  const secondary = 'Gluten Free';
  const merged = mergeClaimsResults(primary, 'Supports Immunity', secondary, ['Supports Immunity']);
  assert.deepEqual(merged.matched, ['Supports Immunity']);
  assert.deepEqual(merged.unmatched, ['Gluten Free']);
});

// accuracy3 Step 3.3: the generic claim-shape extractor's own
// corroboration requirement, applied here since this is the one place
// mergeClaimsResults already has both independently-extracted texts in
// hand. A generic-shape candidate is only trusted when the SAME claim
// (case-insensitively) is found by findGenericShapeClaims in BOTH the
// primary and secondary text -- a real fabrication-risk safeguard, not a
// nice-to-have: findGenericShapeClaims alone can still latch onto a
// one-off OCR/reading-order artifact that happens to look claim-shaped,
// and requiring it to survive two independent extractions of the same
// label is what catches that before it reaches a report.
test('adds a generic-shape claim only when found in BOTH primary and secondary text', () => {
  const text = 'Supports Hair Health';
  const primary = extractClaims(text, []);
  const merged = mergeClaimsResults(primary, text, text, []);
  assert.ok(merged.claimsList.includes('Supports Hair Health'));
});

test('does NOT add a generic-shape claim found in only one of the two texts', () => {
  const primaryText = 'Supports Hair Health';
  const primary = extractClaims(primaryText, []);
  const secondaryText = 'Net Content: 30 Gummies';
  const merged = mergeClaimsResults(primary, primaryText, secondaryText, []);
  assert.equal(merged.claimsList.includes('Supports Hair Health'), false);
});

test('caps generic-shape additions at 12 per label', () => {
  const nouns = [
    'Bone Density', 'Muscle Tone', 'Skin Glow', 'Eye Comfort', 'Joint Ease',
    'Heart Rhythm', 'Liver Function', 'Gut Balance', 'Brain Focus', 'Nerve Health',
    'Blood Flow', 'Lung Capacity', 'Bladder Control', 'Hormone Cycle', 'Immune Response'
  ];
  const text = nouns.map((n) => `Supports ${n}`).join('\n');
  const primary = extractClaims(text, []);
  const merged = mergeClaimsResults(primary, text, text, []);
  const genericAdded = merged.claimsList.filter((c) => /^supports\s/i.test(c));
  assert.ok(genericAdded.length <= 12, `expected at most 12 generic claims, got ${genericAdded.length}`);
});
