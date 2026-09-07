// Unit tests for labelIntakeService.findExactProductMatch — the function
// Quick Label Comparison relies on to identify which Product an uploaded
// artwork belongs to (see labelComparisonWorkflowService.ts). No fuzzy or
// AI-based matching exists or should exist here: only an exact Product
// Name + Brand + Marketing Company match counts, anything else must be
// reported as "not found" rather than guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryLocalStorage } from './testLocalStorage';
import type { Product } from '../../types/product';

// Still installed: labelIntakeService imports artworkService and
// comparisonService, which read localStorage at module scope. The matcher
// under test no longer touches it — the products are handed to it directly.
installMemoryLocalStorage();

const { findExactProductMatch } = await import('../labelIntakeService');

// The real Product type, not a local stand-in. The matcher takes the list as an
// argument now, so nothing has to be shaped like a stored row any more — and a
// field the type gains is a compile error here rather than a test that quietly
// stops resembling the data.
function product(
  overrides: Partial<Product> & Pick<Product, 'id' | 'productName' | 'brandName' | 'marketingCompany'>
): Product {
  return {
    manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
    flavour: 'Apple',
    fssaiNumber: '12345678901234',
    packageSize: '60 Gummies',
    status: 'Active',
    createdDate: '2026-01-01',
    updatedDate: '2026-01-01',
    createdBy: 'Tester',
    updatedBy: 'Tester',
    ...overrides
  };
}

function extractedFields(overrides: Partial<Record<string, string>> = {}) {
  return {
    productName: 'Apple Cider Vinegar Gummies',
    marketingCompanyName: 'Knoll Pharmaceuticals Ltd.',
    address: '123 Health Street',
    fssaiNumber: '12345678901234',
    email: 'care@example.com',
    customerCareNumber: '1800-123-456',
    brand: 'Nutrinol',
    flavour: 'Apple',
    packageSize: '60 Gummies',
    ...overrides
  };
}

test('Finds the product when Product Name + Brand + Marketing Company match exactly', () => {
  const products = [product({ id: 'PRD-0001', productName: 'Apple Cider Vinegar Gummies', brandName: 'Nutrinol', marketingCompany: 'Knoll Pharmaceuticals Ltd.' })];

  const match = findExactProductMatch(products, extractedFields());
  assert.equal(match?.id, 'PRD-0001');
});

test('Matching is case/whitespace-insensitive but not fuzzy', () => {
  const products = [product({ id: 'PRD-0001', productName: 'apple cider vinegar gummies', brandName: '  Nutrinol  ', marketingCompany: 'KNOLL PHARMACEUTICALS LTD.' })];

  const match = findExactProductMatch(products, extractedFields());
  assert.equal(match?.id, 'PRD-0001');
});

test('Returns undefined when no product matches the extracted Marketing Company', () => {
  const products = [product({ id: 'PRD-0001', productName: 'Apple Cider Vinegar Gummies', brandName: 'Nutrinol', marketingCompany: 'A Totally Different Company' })];

  const match = findExactProductMatch(products, extractedFields());
  assert.equal(match, undefined);
});

test('Returns undefined when no product matches the extracted Product Name', () => {
  const products = [product({ id: 'PRD-0001', productName: 'Chyawanprash Gummies', brandName: 'Nutrinol', marketingCompany: 'Knoll Pharmaceuticals Ltd.' })];

  const match = findExactProductMatch(products, extractedFields());
  assert.equal(match, undefined);
});

test('Returns undefined (never guesses) when required identity fields were not read from the label', () => {
  const products = [product({ id: 'PRD-0001', productName: 'Apple Cider Vinegar Gummies', brandName: 'Nutrinol', marketingCompany: 'Knoll Pharmaceuticals Ltd.' })];

  const match = findExactProductMatch(products, extractedFields({ brand: '' }));
  assert.equal(match, undefined);
});
