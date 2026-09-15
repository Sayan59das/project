// Unit tests for the three text-derived label parameters. Pure functions over
// strings — no database, no files, no network — so these run everywhere.
//
// The fixtures are real text shapes taken from the dataset artwork
// (IMH-LVS/Dataset Example), including its draw-order jumbling, because that
// jumbling is what broke the first version of the claims extractor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractClaims,
  extractIngredients,
  extractNutritionTableFormat,
  splitIngredientsList
} from '../services/labelSemanticExtractor.service';

const MASTER_CLAIMS = ['Supports Immunity', 'Sugar Free', 'High in Vitamin C', 'No Added Preservatives'];

// Reproduced from the NutriBears artwork, multi-space artefacts and all.
const NUTRIBEARS_INGREDIENTS = `Ingredients: Corn Syrup, Sugar, Water, Gelling Agent (INS 440), Acidity
Regulator (INS 330 & 331iii), Vitamin C, Sodium Chloride, Vitamin E,
Pantothenic   Acid,   Zinc,   Magnesium,   Choline,   Strawberry   &   Orange
Flavour, Food Colour: Black Carrot Concentrate (INS 163) & Paprika (INS
160c), Vitamin A, Folic Acid, Iodine, Vitamin D, Vitamin B12, Inositol. This
food is by nature gluten free.`;

test('reads an ingredients declaration across lines and collapses PDF spacing', () => {
  const ingredients = extractIngredients(NUTRIBEARS_INGREDIENTS);
  assert.match(ingredients, /^Corn Syrup, Sugar, Water/);
  assert.match(ingredients, /Pantothenic Acid, Zinc, Magnesium/);
  assert.match(ingredients, /Inositol\.$/);
  // The disclaimer that follows the list is not part of it.
  assert.equal(ingredients.includes('by nature gluten free'), false);
});

test('treats a label with no ingredients declaration as absent, not empty-ish', () => {
  assert.equal(extractIngredients('Net Content: 30 N\nBatch No.\nMfg. Date'), '');
});

test('does not mistake a cross-reference for a declaration', () => {
  assert.equal(extractIngredients('For allergens see ingredients: overleaf.'), '');
});

// Step 5.2 (accuracy plan): splitting an ingredients declaration into
// discrete items on every comma breaks any item whose own name contains a
// comma inside parentheses/brackets -- an INS food-additive code list being
// the single dominant real-world case (Step 1.2's diff sample: ~83% of
// wrong ingredients items were exactly this). Real examples below are from
// this file's own NUTRIBEARS_INGREDIENTS fixture and from a real
// eval/diff.py --field ingredients run (see STEP1_FAILURE_ANALYSIS.md /
// STEP5 report), not invented.
test('splitIngredientsList: a comma inside parentheses does not split the item', () => {
  const items = splitIngredientsList('Gelling Agent (INS 440), Acidity Regulator (INS 330 & 331iii)');
  assert.deepEqual(items, ['Gelling Agent (INS 440)', 'Acidity Regulator (INS 330 & 331iii)']);
});

test('splitIngredientsList: real multi-code INS list from a diff stays one item, not three fragments', () => {
  // Real wrong-answer fragments from eval/diff.py: predicted 'Gelling
  // Agents (INS 440', '418', '407)' as three separate items instead of one.
  const items = splitIngredientsList('Corn Syrup, Gelling Agents (INS 440, 418, 407), Sugar');
  assert.deepEqual(items, ['Corn Syrup', 'Gelling Agents (INS 440, 418, 407)', 'Sugar']);
});

test('splitIngredientsList: the full NUTRIBEARS fixture splits into exactly its real ingredients, no INS fragments', () => {
  const declaration = extractIngredients(NUTRIBEARS_INGREDIENTS);
  const items = splitIngredientsList(declaration);
  assert.ok(items.includes('Gelling Agent (INS 440)'));
  assert.ok(items.includes('Acidity Regulator (INS 330 & 331iii)'));
  assert.ok(items.includes('Food Colour: Black Carrot Concentrate (INS 163) & Paprika (INS 160c)'));
  // None of the parenthetical INS numbers leaked out as their own item.
  assert.equal(items.some((item) => /^\d+\)?$/.test(item.trim())), false);
});

test('splitIngredientsList: an item with brackets instead of parentheses is also kept whole', () => {
  const items = splitIngredientsList('Vitamin C [as Ascorbic Acid, 40 mg], Zinc');
  assert.deepEqual(items, ['Vitamin C [as Ascorbic Acid, 40 mg]', 'Zinc']);
});

test('splitIngredientsList: plain comma-separated items with no parentheses split as before', () => {
  assert.deepEqual(splitIngredientsList('Sugar, Water, Gelatin'), ['Sugar', 'Water', 'Gelatin']);
});

test('splitIngredientsList: blank input returns an empty list', () => {
  assert.deepEqual(splitIngredientsList(''), []);
});

// THE REGRESSION THIS FILE EXISTS FOR.
//
// PDF text arrives in draw order, so these separate design elements from the
// NutriBears front panel flatten into one line. The first version of
// extractClaims matched a verb-led pattern across them and reported
// 'Support B Vitamin C' — a claim that appears nowhere on the label. Inventing
// a claim on a pharma label is a compliance incident, so this must stay empty.
test('never fabricates a claim from draw-order jumbled design elements', () => {
  const jumbled = 'VITAMIN A\nEye\nHealth\nA\nB VITAMINS\nCell\nSupport\nB\nVITAMIN C\nImmune\nDefence\nC';
  const result = extractClaims(jumbled, MASTER_CLAIMS);
  assert.deepEqual(result.claims, '');
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.unmatched, []);
});

test('never lifts a claim out of marketing prose', () => {
  const prose =
    'NutriBears is India’s #1st gummy vitamin brand launched way back in 2012. ' +
    'Our aim is to help them get their daily requirement of vitamins & minerals.';
  assert.equal(extractClaims(prose, MASTER_CLAIMS).claims, '');
});

test('reports badge claims present on the label', () => {
  const text = 'NATURAL COLOURS & FLAVOURS\nHEALTH SUPPLEMENT\nThis food is by nature gluten free.';
  const result = extractClaims(text, MASTER_CLAIMS);
  assert.deepEqual(result.claims.split(' | ').sort(), [
    'Gluten Free',
    'Health Supplement',
    'Natural Colours & Flavours'
  ]);
});

// Step 5.3 (accuracy plan): claims are barely found at all (327 of 383
// ground-truth claim cells missing) because the badge list only recognised
// two specific "X Free" claims (gluten, sugar) out of the many real ones on
// the actual dataset — Gelatin Free, Milk Free, Nut Free, Peanut Free, Soy
// Free are all real claims from the ground truth annotations
// (finetune/reviewed/annotations), not invented. Generalised to the SHAPE
// (any short word immediately followed by "free"), per the directive's own
// "... free" pattern, rather than hardcoding each allergen name.
test('reports the generic "X Free" claim shape for allergens the fixed badge list never had', () => {
  const text = 'Gelatin Free. Milk Free. Nut Free. Peanut Free. Soy Free.';
  const result = extractClaims(text);
  assert.deepEqual(result.claims.split(' | ').sort(), ['Gelatin Free', 'Milk Free', 'Nut Free', 'Peanut Free', 'Soy Free']);
});

test('"X Free" claim shape is case-insensitive and normalises to Title Case', () => {
  const result = extractClaims('DAIRY FREE');
  assert.deepEqual(result.claims.split(' | '), ['Dairy Free']);
});

test('does not report "Toll Free" as a claim near a customer care number', () => {
  // Real risk on this label family: "Toll Free: 1800-555-1234" appears in
  // the customer-care section of several real labels, right next to
  // genuine claims text -- structurally identical to "Nut Free" otherwise.
  const result = extractClaims('Gluten Free. Customer Care Toll Free: 1800-555-1234');
  assert.equal(result.claims.includes('Toll Free'), false);
  assert.ok(result.claims.includes('Gluten Free'));
});

// A claim on the label with no master record is still stored — omitting it
// would let two differently-claiming labels compare as a MATCH — but it is
// reported separately so a Manager knows what the Claims master is missing.
test('separates claims the Masters module knows from ones it does not', () => {
  const result = extractClaims('Supports Immunity. Gluten Free.', MASTER_CLAIMS);
  assert.deepEqual(result.matched, ['Supports Immunity']);
  assert.deepEqual(result.unmatched, ['Gluten Free']);
  assert.equal(result.claims, 'Supports Immunity | Gluten Free');
});

test('matches a master claim broken across lines by the PDF', () => {
  const result = extractClaims('High in\nVitamin C', MASTER_CLAIMS);
  assert.deepEqual(result.matched, ['High in Vitamin C']);
});

test('reads the serving basis a nutrition panel declares', () => {
  const panel =
    'Nutritional Facts\nServing size: 1 Gummy | No. of servings per pack: 30\n' +
    'Energy 7.5 kcal\nTotal Carbohydrate 2 g\nTotal Sugar 1.5 g\nProtein 0 g\nTotal Fat 0 g';
  assert.equal(extractNutritionTableFormat(panel), 'Standard (per 1 Gummy)');
});

// Past the documented nutrient-count threshold, the same per-serving basis is
// a Detailed panel — which is what the dataset's own artwork carries.
test('calls a full panel Detailed on the same serving basis', () => {
  const panel =
    'Serving size: 1 Gummy\nEnergy\nTotal Carbohydrate\nTotal Sugar\nDietary Fibre\nProtein\n' +
    'Total Fat\nVitamin C\nSodium\nVitamin E\nPantothenic Acid\nZinc\nMagnesium\nVitamin A\n' +
    'Folate\nIodine\nVitamin D\nVitamin B12\nCholine\nInositol';
  assert.equal(extractNutritionTableFormat(panel), 'Detailed (per 1 Gummy)');
});

test('calls a per-100g panel Detailed whatever its row count', () => {
  assert.equal(extractNutritionTableFormat('Nutritional Information per 100 g\nEnergy\nProtein'), 'Detailed (per 100 g)');
});

test('reports no format when the label declares no basis', () => {
  assert.equal(extractNutritionTableFormat('Keep out of reach of children.'), '');
});
