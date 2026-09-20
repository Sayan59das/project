// Unit tests for mergeIngredientsResults (labelExtraction.service.ts).
//
// accuracy3 Step 2 continuation: the same reading-order-vs-flattened-text
// rescue mergeClaimsResults already applies for claims (see
// labelExtraction.mergeClaimsResults.test.ts's own header), now applied to
// ingredients too. Real gap found via a score.py measurement, not invented:
// Calcimax pack 60 IRN169-2.pdf's ingredients paragraph sits at the same
// Y-coordinates as a narrow MRP/pricing side column, so the geometry-based
// reading-order reconstruction (toReadingOrderText) zigzags between them,
// splicing "M.R.P. (Inclusive of All taxes)" fragments into the middle of
// the ingredients list and truncating it early. The PDF's own flattened
// (draw-order) text doesn't reconstruct columns at all, so it isn't
// vulnerable to this specific failure mode -- confirmed directly against
// the real PDF:
//   extractIngredients(reading-order text) -> 4 items, one of them garbled
//   extractIngredients(flattened text)     -> 8 items, all correct
//
// Unlike claims (an unordered set of independent badge matches, safe to
// union), an ingredients declaration is one coherent ordered list -- safe
// to swap wholesale for a better candidate, not safe to merge partial
// fragments of. "Better" is measured by item count via the same
// splitIngredientsList every other consumer of a declaration already uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeIngredientsResults } from '../services/labelExtraction.service';

test('prefers the flattened text when it recovers strictly more items -- real gap on Calcimax pack 60 IRN169-2.pdf', () => {
  // A synthetic stand-in for the real column-interleaving: the
  // reading-order text's declaration gets cut short after two items.
  const readingOrder = 'Ingredients: Maltitol Syrup, Water M.R.P. (Inclusive of All taxes)';
  const flattened = 'Ingredients: Maltitol Syrup, Water, Gelling Agents, Vitamin D.';
  const merged = mergeIngredientsResults(readingOrder, flattened);
  assert.match(merged, /^Maltitol Syrup, Water, Gelling Agents/);
});

test('keeps the reading-order result when it already has at least as many items as the flattened text', () => {
  const readingOrder = 'Ingredients: Maltitol Syrup, Water, Gelling Agents, Vitamin D.';
  const flattened = 'Ingredients: Maltitol Syrup, Water.';
  const merged = mergeIngredientsResults(readingOrder, flattened);
  assert.match(merged, /^Maltitol Syrup, Water, Gelling Agents/);
});

test('with no flattened text, returns the reading-order result unchanged', () => {
  const readingOrder = 'Ingredients: Maltitol Syrup, Water, Gelling Agents.';
  const merged = mergeIngredientsResults(readingOrder, undefined);
  assert.match(merged, /^Maltitol Syrup, Water, Gelling Agents/);
});

test('with no declaration in either text, returns empty', () => {
  const merged = mergeIngredientsResults('Net Content: 30 N', 'Batch No. 123');
  assert.equal(merged, '');
});

test('a flattened text with no declaration at all does not clobber a real reading-order result', () => {
  const readingOrder = 'Ingredients: Maltitol Syrup, Water, Gelling Agents.';
  const flattened = 'Batch No. 123\nUse By: 2027';
  const merged = mergeIngredientsResults(readingOrder, flattened);
  assert.match(merged, /^Maltitol Syrup, Water, Gelling Agents/);
});
