// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// Unit tests for labelIntakeService.findExactProductMatch — the function
// Quick Label Comparison relies on to identify which Product an uploaded
// artwork belongs to (see labelComparisonWorkflowService.ts). No fuzzy or
// AI-based matching exists or should exist here: only an exact Product
// Name + Brand + Marketing Company match counts, anything else must be
// reported as "not found" rather than guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// findExactProductMatch reads products via productService.getProducts(), which
// now calls the backend over apiClient rather than localStorage — so tests
// seed the mocked HTTP layer instead of localStorage.
const { default: apiClient } = await import('../apiClient');
const { findExactProductMatch } = await import('../labelIntakeService');

type ProductLike = {
  id: string;
  productName: string;
  brandName: string;
  marketingCompany: string;
  manufacturingCompany: string;
  flavour: string;
  fssaiNumber: string;
  packageSize?: string;
  status: string;
  createdDate: string;
  updatedDate: string;
  createdBy: string;
  updatedBy: string;
};

function product(overrides: Partial<ProductLike> & Pick<ProductLike, 'id' | 'productName' | 'brandName' | 'marketingCompany'>): ProductLike {
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

function seed(products: ProductLike[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (apiClient.get as any) = async (url: string) => {
    assert.equal(url, '/products');
    return { data: products };
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

test('Finds the product when Product Name + Brand + Marketing Company match exactly', async () => {
  seed([product({ id: 'PRD-0001', productName: 'Apple Cider Vinegar Gummies', brandName: 'Nutrinol', marketingCompany: 'Knoll Pharmaceuticals Ltd.' })]);

  const match = await findExactProductMatch(extractedFields());
  assert.equal(match?.id, 'PRD-0001');
});

test('Matching is case/whitespace-insensitive but not fuzzy', async () => {
  seed([product({ id: 'PRD-0001', productName: 'apple cider vinegar gummies', brandName: '  Nutrinol  ', marketingCompany: 'KNOLL PHARMACEUTICALS LTD.' })]);

  const match = await findExactProductMatch(extractedFields());
  assert.equal(match?.id, 'PRD-0001');
});

test('Returns undefined when no product matches the extracted Marketing Company', async () => {
  seed([product({ id: 'PRD-0001', productName: 'Apple Cider Vinegar Gummies', brandName: 'Nutrinol', marketingCompany: 'A Totally Different Company' })]);

  const match = await findExactProductMatch(extractedFields());
  assert.equal(match, undefined);
});

test('Returns undefined when no product matches the extracted Product Name', async () => {
  seed([product({ id: 'PRD-0001', productName: 'Chyawanprash Gummies', brandName: 'Nutrinol', marketingCompany: 'Knoll Pharmaceuticals Ltd.' })]);

  const match = await findExactProductMatch(extractedFields());
  assert.equal(match, undefined);
});

test('Returns undefined (never guesses) when required identity fields were not read from the label', async () => {
  seed([product({ id: 'PRD-0001', productName: 'Apple Cider Vinegar Gummies', brandName: 'Nutrinol', marketingCompany: 'Knoll Pharmaceuticals Ltd.' })]);

  const match = await findExactProductMatch(extractedFields({ brand: '' }));
  assert.equal(match, undefined);
});
