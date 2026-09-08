// Unit tests for productService.identifyProduct() — the frontend wrapper
// around POST /api/labels/identify-product (AI module brief Step 2; see
// backend/src/services/productIdentification.service.ts for the full
// contract). No real server: global fetch is stubbed per test, the same
// boundary artworkService.upload.test.ts's uploadArtworkFile() sits behind,
// so these run as plain node unit tests with no network or backend
// dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryLocalStorage } from './testLocalStorage';

installMemoryLocalStorage();

const { ApiError } = await import('../apiClient');
const { identifyProduct } = await import('../productService');

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function withStubbedFetch<T>(stub: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test('Returns the existing product the backend reports a match for', async () => {
  const product = { id: 'PRD-0001', productName: 'Vitamin C Gummies', brandName: 'VitaFit', marketingCompany: 'ABC Healthcare' };
  const result = await withStubbedFetch(
    (async () => jsonResponse(200, { success: true, data: { status: 'existing_product_found', product } })) as typeof fetch,
    () => identifyProduct({ productName: 'Vitamin C Gummies', brand: 'VitaFit', marketingCompany: 'ABC Healthcare' })
  );
  assert.deepEqual(result, { status: 'existing_product_found', product });
});

test('Returns new_product_no_match when the backend finds nothing', async () => {
  const result = await withStubbedFetch(
    (async () => jsonResponse(200, { success: true, data: { status: 'new_product_no_match' } })) as typeof fetch,
    () => identifyProduct({ productName: 'X', brand: 'Y', marketingCompany: 'Z' })
  );
  assert.deepEqual(result, { status: 'new_product_no_match' });
});

test('Returns unavailable as ordinary data when the AI backend is not configured — never throws for it', async () => {
  const result = await withStubbedFetch(
    (async () => jsonResponse(200, { success: true, data: { status: 'unavailable' } })) as typeof fetch,
    () => identifyProduct({ productName: 'X', brand: 'Y', marketingCompany: 'Z' })
  );
  assert.deepEqual(result, { status: 'unavailable' });
});

test('Sends productName, brand, marketingCompany and an optional fssaiNumber as the JSON body', async () => {
  let sentBody: any;
  await withStubbedFetch(
    (async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(init!.body as string);
      return jsonResponse(200, { success: true, data: { status: 'new_product_no_match' } });
    }) as typeof fetch,
    () => identifyProduct({ productName: 'X', brand: 'Y', marketingCompany: 'Z', fssaiNumber: '10023045000000' })
  );
  assert.deepEqual(sentBody, { productName: 'X', brand: 'Y', marketingCompany: 'Z', fssaiNumber: '10023045000000' });
});

test('A genuinely malformed request (backend 400) still throws ApiError, unlike an AI-backend outage', async () => {
  await assert.rejects(
    () =>
      withStubbedFetch(
        (async () => jsonResponse(400, { success: false, message: 'productName, brand, and marketingCompany (strings) are required.' })) as typeof fetch,
        () => identifyProduct({ productName: '', brand: 'Y', marketingCompany: 'Z' })
      ),
    (err: unknown) => err instanceof ApiError && err.status === 400
  );
});
