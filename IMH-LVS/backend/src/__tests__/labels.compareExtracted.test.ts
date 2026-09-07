// Integration tests for POST /api/labels/compare-extracted — the
// JSON-in/JSON-out endpoint Quick Label Comparison uses once the frontend
// has already extracted both the new artwork and the automatically-selected
// latest approved artwork via /api/labels/extract. Unlike labels.compare.test.ts
// (which drives real file uploads through OCR), this endpoint does no
// extraction at all, so these tests post already-extracted field objects
// directly and only exercise validation + the comparison computation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { env } from '../config/env';
import { closePool } from '../db/pool';
import { TEST_ACCOUNTS, createTestAccount, listenForTests, removeTestAccount } from './testSession';

let server: Server;
let baseUrl: string;
let token: string;

// /api/labels moved behind the session guard in 004_auth.sql, and a session
// comes out of the users table — so this suite, which drives the route over
// HTTP, now needs a database where it used to need none. See testSession.ts for
// why that trade was made and what still covers extraction without one.
const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — /api/labels needs a session';

before(async () => {
  if (SKIP) return;
  ({ server, baseUrl } = await listenForTests());
  token = await createTestAccount(baseUrl, TEST_ACCOUNTS.compareExtracted);
});

after(async () => {
  if (!SKIP) await removeTestAccount(TEST_ACCOUNTS.compareExtracted);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

function extraction(overrides: Partial<Record<string, string>> = {}) {
  return {
    marketingCompany: 'IMH Ventures',
    address: '123 Health Street',
    fssaiNumber: '12345678901234',
    email: 'care@imh.com',
    customerCareNumber: '1800-123-456',
    brand: 'Nutrinol',
    flavour: 'Apple',
    productName: 'Apple Cider Vinegar Gummies',
    packageSize: '60 Gummies',
    manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
    colourTheme: 'Green & Orange',
    claims: 'Supports Immunity',
    ingredients: 'Apple Cider Vinegar, Pectin, Sugar',
    nutritionTableFormat: 'Standard (per 2 gummies)',
    ...overrides
  };
}

async function postCompareExtracted(body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/labels/compare-extracted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const parsedBody = await res.json();
  return { status: res.status, body: parsedBody };
}

test('Compares two already-extracted labels: identical inputs report a 100% match with no DIFFERENT/MISSING fields', { skip: SKIP }, async () => {
  const labelA = extraction();
  const labelB = extraction();
  const { status, body } = await postCompareExtracted({ labelA, labelB });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data.labelA, labelA);
  assert.deepEqual(body.data.labelB, labelB);
  assert.equal(body.data.comparison.overallPercentage, 100);
  assert.equal(body.data.comparison.differentFields, 0);
  assert.equal(body.data.comparison.missingFields, 0);
  assert.equal(body.data.comparison.fields.length, 14);
});

test('Reports DIFFERENT for a genuinely conflicting field between the new artwork and the approved baseline', { skip: SKIP }, async () => {
  const labelA = extraction({ productName: 'Apple Cider Vinegar Gummies' });
  const labelB = extraction({ productName: 'Chyawanprash Gummies' });
  const { body } = await postCompareExtracted({ labelA, labelB });

  const productNameField = body.data.comparison.fields.find((f: any) => f.field === 'productName');
  assert.equal(productNameField.status, 'DIFFERENT');
  assert.ok(body.data.comparison.overallPercentage < 100);
});

test('Reports MISSING when only one side states a field', { skip: SKIP }, async () => {
  const labelA = extraction({ flavour: 'Apple' });
  const labelB = extraction({ flavour: '' });
  const { body } = await postCompareExtracted({ labelA, labelB });

  const flavourField = body.data.comparison.fields.find((f: any) => f.field === 'flavour');
  assert.equal(flavourField.status, 'MISSING');
});

test('Missing labelA is rejected with a controlled 400, never a crash', { skip: SKIP }, async () => {
  const { status, body } = await postCompareExtracted({ labelB: extraction() });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('Missing labelB is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompareExtracted({ labelA: extraction() });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('A non-string field value is rejected rather than silently coerced', { skip: SKIP }, async () => {
  const { status, body } = await postCompareExtracted({ labelA: { ...extraction(), brand: 42 }, labelB: extraction() });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('Empty request body is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompareExtracted({});
  assert.equal(status, 400);
  assert.equal(body.success, false);
});
