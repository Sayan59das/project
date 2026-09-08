// Unit tests for the field-by-field comparison engine (labelComparison.service.ts)
// — synthetic LabelExtractionResult fixtures, no OCR/files/poppler involved,
// so these run instantly and cover the engine's own logic (stage-based field
// filtering, MATCH/SIMILAR/CONFLICT/MISSING/NOT_COMPARED classification,
// weighted scoring) independently of whatever real-label integration tests
// exist elsewhere (labels.compare.test.ts, labels.compareExtracted.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLabels, compareNutritionTables } from '../services/labelComparison.service';
import { buildPlaceholderExtraction, LabelExtractionResult } from '../services/labelExtraction.service';

function label(overrides: Partial<LabelExtractionResult>): LabelExtractionResult {
  return { ...buildPlaceholderExtraction(), ...overrides };
}

function fieldNames(result: ReturnType<typeof compareLabels>): string[] {
  return result.fields.map((f) => f.field).sort();
}

test('cross_company (the default) compares all fourteen fields, including Address/Customer Care Number/Email', () => {
  const a = label({ brand: 'VitaFit' });
  const b = label({ brand: 'VitaFit' });
  const result = compareLabels(a, b);
  assert.deepEqual(
    fieldNames(result),
    [
      'address',
      'brand',
      'claims',
      'colourTheme',
      'customerCareNumber',
      'email',
      'flavour',
      'fssaiNumber',
      'ingredients',
      'manufacturingCompany',
      'marketingCompany',
      'nutritionTableFormat',
      'packageSize',
      'productName'
    ].sort()
  );
});

test('same_company excludes Address, Customer Care Number and Email entirely — not just from the score', () => {
  const a = label({ brand: 'VitaFit' });
  const b = label({ brand: 'VitaFit' });
  const result = compareLabels(a, b, 'same_company');
  assert.equal(fieldNames(result).includes('address'), false);
  assert.equal(fieldNames(result).includes('customerCareNumber'), false);
  assert.equal(fieldNames(result).includes('email'), false);
  assert.equal(result.fields.length, 11);
});

test('same_company: a same-company address mismatch does not affect the score at all', () => {
  const a = label({ brand: 'VitaFit', address: '123 Health Street' });
  const b = label({ brand: 'VitaFit', address: '456 Wellness Road' });
  const sameCompany = compareLabels(a, b, 'same_company');
  const crossCompany = compareLabels(a, b, 'cross_company');

  // Excluded entirely for same_company, so it can't drag the score down...
  assert.equal(sameCompany.overallPercentage, 100);
  // ...whereas the identical mismatch DOES count against cross_company.
  assert.ok(crossCompany.overallPercentage < 100);
});

test('colourTheme, claims, ingredients and nutritionTableFormat are compared like any other field', () => {
  const a = label({
    colourTheme: 'Green & Orange',
    claims: 'Sugar Free',
    ingredients: 'Vitamin C, Pectin',
    nutritionTableFormat: 'Standard (per 2 gummies)'
  });
  const b = label({
    colourTheme: 'Green & Orange',
    claims: 'Gluten Free',
    ingredients: 'Vitamin C, Pectin',
    nutritionTableFormat: 'Detailed (per 100g)'
  });
  const result = compareLabels(a, b);

  const byField = Object.fromEntries(result.fields.map((f) => [f.field, f.status]));
  assert.equal(byField.colourTheme, 'MATCH');
  // "Sugar Free" vs. "Gluten Free" share only the generic word "free" —
  // genuinely different claims, not a wording variant of the same one.
  assert.equal(byField.claims, 'CONFLICT');
  assert.equal(byField.ingredients, 'MATCH');
  assert.equal(byField.nutritionTableFormat, 'CONFLICT');
});

test('a field neither label states is NOT_COMPARED, not MATCH — MISSING is reserved for a one-sided gap', () => {
  const a = label({});
  const b = label({});
  const result = compareLabels(a, b);
  const claims = result.fields.find((f) => f.field === 'claims')!;
  assert.equal(claims.status, 'NOT_COMPARED');

  const onlyOneStated = label({ claims: 'Sugar Free' });
  const missingResult = compareLabels(onlyOneStated, b);
  const missingClaims = missingResult.fields.find((f) => f.field === 'claims')!;
  assert.equal(missingClaims.status, 'MISSING');
});

test('a spelling/wording variant reads SIMILAR, not CONFLICT — the AI module brief §9/§10 requirement', () => {
  // A near-identical string (small edit distance) — a plural/typo variant.
  const a = label({ claims: 'Boost Immunity' });
  const b = label({ claims: 'Boosts Immunity' });
  const result = compareLabels(a, b);
  const claims = result.fields.find((f) => f.field === 'claims')!;
  assert.equal(claims.status, 'SIMILAR');
});

test('the same underlying claim worded differently reads SIMILAR — the brief\'s own §10 report example', () => {
  // The brief's PDF report example table lists exactly this pair as
  // SIMILAR: different first word, same claim topic (shares "immunity").
  const a = label({ claims: 'Supports Immunity' });
  const b = label({ claims: 'Boosts Immunity' });
  const result = compareLabels(a, b);
  const claims = result.fields.find((f) => f.field === 'claims')!;
  assert.equal(claims.status, 'SIMILAR');
});

test('two genuinely unrelated values are CONFLICT, not SIMILAR', () => {
  const a = label({ productName: 'Apple Cider Vinegar Gummies' });
  const b = label({ productName: 'Chyawanprash Gummies' });
  const result = compareLabels(a, b);
  const productName = result.fields.find((f) => f.field === 'productName')!;
  assert.equal(productName.status, 'CONFLICT');
});

test('SIMILAR contributes half credit to the overall score — more than CONFLICT, less than MATCH', () => {
  const base = label({ brand: 'VitaFit' });
  const similar = compareLabels(base, label({ brand: 'VitaFit', claims: 'Boost Immunity' }));
  const matchClaims = compareLabels(label({ brand: 'VitaFit', claims: 'Boost Immunity' }), label({ brand: 'VitaFit', claims: 'Boost Immunity' }));
  const conflictClaims = compareLabels(label({ brand: 'VitaFit', claims: 'Boost Immunity' }), label({ brand: 'VitaFit', claims: 'Completely Different Wording' }));

  assert.ok(similar.overallPercentage <= matchClaims.overallPercentage);
  assert.ok(conflictClaims.overallPercentage < matchClaims.overallPercentage);
});

test('summary counts reflect the brief\'s vocabulary: matching, similar, conflicting, missing', () => {
  const a = label({ brand: 'VitaFit', claims: 'Boost Immunity', productName: 'Gummy A', flavour: '' });
  const b = label({ brand: 'VitaFit', claims: 'Boosts Immunity', productName: 'Gummy B', flavour: 'Orange' });
  const result = compareLabels(a, b);

  assert.equal(result.matchingFields, result.fields.filter((f) => f.status === 'MATCH').length);
  assert.equal(result.similarFields, result.fields.filter((f) => f.status === 'SIMILAR').length);
  assert.equal(result.conflictingFields, result.fields.filter((f) => f.status === 'CONFLICT').length);
  assert.equal(result.missingFields, result.fields.filter((f) => f.status === 'MISSING').length);
  assert.equal(result.notComparedFields, result.fields.filter((f) => f.status === 'NOT_COMPARED').length);
  assert.ok(result.similarFields >= 1, 'claims should have registered as SIMILAR');
  assert.ok(result.missingFields >= 1, 'flavour should have registered as MISSING');
});

test('compareNutritionTables: neither side has a structured table returns undefined, not an empty result', () => {
  assert.equal(compareNutritionTables('', ''), undefined);
});

test('compareNutritionTables: malformed JSON on both sides is treated as absent rather than throwing', () => {
  assert.equal(compareNutritionTables('not json', '{broken'), undefined);
});

test('compareNutritionTables: identical tables report every row as MATCH', () => {
  const table = JSON.stringify({ 'Vitamin C': '12 mg', Protein: '2 g' });
  const result = compareNutritionTables(table, table)!;
  assert.equal(result.rows.length, 2);
  assert.equal(result.matchingRows, 2);
  assert.equal(result.conflictingRows, 0);
});

test('compareNutritionTables: a changed value on a shared nutrient is CONFLICT', () => {
  const a = JSON.stringify({ Protein: '2 g' });
  const b = JSON.stringify({ Protein: '5 g' });
  const result = compareNutritionTables(a, b)!;
  assert.equal(result.rows[0].status, 'CONFLICT');
  assert.equal(result.rows[0].valueA, '2 g');
  assert.equal(result.rows[0].valueB, '5 g');
});

test('compareNutritionTables: a nutrient present on only one side is MISSING, not CONFLICT', () => {
  const a = JSON.stringify({ Protein: '2 g', Iron: '1 mg' });
  const b = JSON.stringify({ Protein: '2 g' });
  const result = compareNutritionTables(a, b)!;
  const iron = result.rows.find((r) => r.nutrient === 'Iron')!;
  assert.equal(iron.status, 'MISSING');
  assert.equal(iron.valueA, '1 mg');
  assert.equal(iron.valueB, '');
});

test('compareNutritionTables: nutrient names are matched case/whitespace-insensitively', () => {
  const a = JSON.stringify({ 'Vitamin C': '12 mg' });
  const b = JSON.stringify({ 'vitamin  c': '12 mg' });
  const result = compareNutritionTables(a, b)!;
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].status, 'MATCH');
});

test('compareNutritionTables: a minor formatting difference in the same value reads SIMILAR', () => {
  const a = JSON.stringify({ Sodium: '7.7 mg' });
  const b = JSON.stringify({ Sodium: '7.7mg' });
  const result = compareNutritionTables(a, b)!;
  assert.equal(result.rows[0].status, 'SIMILAR');
});

test('compareNutritionTables: only one side having a table still compares — the other side is all MISSING rows', () => {
  const a = JSON.stringify({ Protein: '2 g', Iron: '1 mg' });
  const result = compareNutritionTables(a, '')!;
  assert.ok(result);
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((r) => r.status === 'MISSING'));
});
