// Unit tests for the field-by-field comparison engine (labelComparison.service.ts)
// — synthetic LabelExtractionResult fixtures, no OCR/files/poppler involved,
// so these run instantly and cover the engine's own logic (stage-based field
// filtering, MATCH/DIFFERENT/MISSING/NOT_COMPARED classification, weighted
// scoring) independently of whatever real-label integration tests exist
// elsewhere (labels.compare.test.ts, labels.compareExtracted.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLabels } from '../services/labelComparison.service';
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
  const a = label({ colourTheme: 'Green & Orange', claims: 'Sugar Free', ingredients: 'Vitamin C, Pectin', nutritionTableFormat: 'Standard (per 2 gummies)' });
  const b = label({ colourTheme: 'Green & Orange', claims: 'Gluten Free', ingredients: 'Vitamin C, Pectin', nutritionTableFormat: 'Detailed (per 100g)' });
  const result = compareLabels(a, b);

  const byField = Object.fromEntries(result.fields.map((f) => [f.field, f.status]));
  assert.equal(byField.colourTheme, 'MATCH');
  assert.equal(byField.claims, 'DIFFERENT');
  assert.equal(byField.ingredients, 'MATCH');
  assert.equal(byField.nutritionTableFormat, 'DIFFERENT');
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
