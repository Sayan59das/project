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
  const secondary = 'NO\nGELATIN\nNO\nGLUTEN';
  const merged = mergeClaimsResults(primary, secondary, []);
  assert.ok(merged.claims.includes('No Gelatin'));
  assert.ok(merged.claims.includes('No Gluten'));
});

test('does not duplicate a claim both texts agree on', () => {
  const primary = extractClaims('Gluten Free');
  const secondary = 'Gluten Free';
  const merged = mergeClaimsResults(primary, secondary, []);
  assert.deepEqual(merged.claims.split(' | '), ['Gluten Free']);
});

test('with no secondary text, returns the primary result unchanged', () => {
  const primary = extractClaims('Gluten Free. Milk Free.');
  const merged = mergeClaimsResults(primary, undefined, []);
  assert.equal(merged, primary);
});

test('matched/unmatched are recomputed correctly across the merged set', () => {
  const primary = extractClaims('Supports Immunity', ['Supports Immunity']);
  const secondary = 'Gluten Free';
  const merged = mergeClaimsResults(primary, secondary, ['Supports Immunity']);
  assert.deepEqual(merged.matched, ['Supports Immunity']);
  assert.deepEqual(merged.unmatched, ['Gluten Free']);
});
