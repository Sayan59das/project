// productService.findPossibleDuplicate() — the query string it sends to
// GET /api/products/possible-duplicate. Same stubbed-fetch boundary as
// productService.identifyProduct.test.ts; no server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryLocalStorage } from './testLocalStorage';

installMemoryLocalStorage();

const { findPossibleDuplicate } = await import('../productService');

function capturingFetch(seen: { url?: string }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    seen.url = String(input);
    return { ok: true, status: 200, json: async () => ({ success: true, data: null }) } as Response;
  }) as typeof fetch;
}

async function withStubbedFetch<T>(stub: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('Sends the FSSAI licence so the server can rescue a misread marketing company', async () => {
  const seen: { url?: string } = {};
  await withStubbedFetch(capturingFetch(seen), () =>
    findPossibleDuplicate({
      productName: 'Vitamin C Gummies',
      brandName: 'VitaFit',
      marketingCompany: 'ABC Healthcare Pvt Ltd',
      fssaiNumber: '10023045001234'
    })
  );
  const query = new URL(seen.url!, 'http://localhost').searchParams;
  assert.equal(query.get('fssaiNumber'), '10023045001234');
  assert.equal(query.get('productName'), 'Vitamin C Gummies');
});

test('Omits the FSSAI parameter entirely when the label had none', async () => {
  const seen: { url?: string } = {};
  await withStubbedFetch(capturingFetch(seen), () =>
    findPossibleDuplicate({ productName: 'Vitamin C Gummies', brandName: 'VitaFit', marketingCompany: 'ABC Healthcare' })
  );
  const query = new URL(seen.url!, 'http://localhost').searchParams;
  assert.equal(query.has('fssaiNumber'), false);
});
