// Integration tests for POST /api/labels/identify-product — AI module brief
// Step 2. This suite exercises validation, auth, and the response envelope
// over a real HTTP request to the real route; it deliberately does NOT
// assert on which of the three ProductIdentificationResult states comes back
// for a valid request, because that depends on whether this environment's
// configured AI_EXTRACTION_URL actually has ai_backend listening — exactly
// the reason aiExtraction.service.ts's own AI-backend call has no
// integration test asserting a specific fallback-filled value (see that
// file's header comment). productIdentification.service.test.ts is where
// every logic branch (existing match by name+company, no match, unreachable,
// malformed response) is deterministically covered against a fake local
// server this suite has no need to duplicate.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { env } from '../config/env';
import { closePool } from '../db/pool';
import { TEST_ACCOUNTS, createTestAccount, listenForTests, removeTestAccount } from './testSession';

let server: Server;
let baseUrl: string;
let token: string;

// /api/labels sits behind the session guard (004_auth.sql), and a session
// comes out of the users table — see labels.compareExtracted.test.ts's own
// comment for why this suite, which drives the route over HTTP, needs a
// database where the underlying service does not.
const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — /api/labels needs a session';

before(async () => {
  if (SKIP) return;
  ({ server, baseUrl } = await listenForTests());
  token = await createTestAccount(baseUrl, TEST_ACCOUNTS.identifyProduct);
});

after(async () => {
  if (!SKIP) await removeTestAccount(TEST_ACCOUNTS.identifyProduct);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

async function postIdentifyProduct(body: unknown, options: { withAuth?: boolean } = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.withAuth !== false) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/labels/identify-product`, { method: 'POST', headers, body: JSON.stringify(body) });
  const parsedBody = await res.json();
  return { status: res.status, body: parsedBody };
}

test(
  'A valid request always gets a 200 with one of the three known result states, regardless of whether the AI backend happens to be running',
  { skip: SKIP },
  async () => {
    const { status, body } = await postIdentifyProduct({ productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare' });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(['existing_product_found', 'new_product_no_match', 'unavailable'].includes(body.data.status));
    if (body.data.status === 'existing_product_found') {
      assert.equal(typeof body.data.product?.id, 'string');
    }
  }
);

test('An optional fssaiNumber is accepted', { skip: SKIP }, async () => {
  const { status, body } = await postIdentifyProduct({ productName: 'X', brand: 'Y', marketingCompany: 'Z', fssaiNumber: '10023045000000' });
  assert.equal(status, 200);
  assert.equal(body.success, true);
});

test('Missing productName is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postIdentifyProduct({ brand: 'Y', marketingCompany: 'Z' });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('Missing brand is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postIdentifyProduct({ productName: 'X', marketingCompany: 'Z' });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('Missing marketingCompany is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postIdentifyProduct({ productName: 'X', brand: 'Y' });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('A non-string fssaiNumber is rejected rather than silently coerced', { skip: SKIP }, async () => {
  const { status, body } = await postIdentifyProduct({ productName: 'X', brand: 'Y', marketingCompany: 'Z', fssaiNumber: 12345 });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('Empty request body is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postIdentifyProduct({});
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('Requires an authenticated session, matching every other /api/labels route', { skip: SKIP }, async () => {
  const { status } = await postIdentifyProduct({ productName: 'X', brand: 'Y', marketingCompany: 'Z' }, { withAuth: false });
  assert.equal(status, 401);
});
