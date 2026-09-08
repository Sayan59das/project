// Unit tests for productIdentification.service.ts — AI module brief Step 2.
// Every scenario here is driven against a real local HTTP server this suite
// spins up itself to stand in for ai_backend, rather than stubbing global
// fetch: `node --test` runs test files in this suite concurrently in one
// process, and stubbing globalThis.fetch would break any other concurrently
// -running file (several already make real fetch() calls to their own test
// server, e.g. labels.compareExtracted.test.ts). A per-test ephemeral-port
// server has no such collision risk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identifyProductAt } from '../services/productIdentification.service';
import { Product } from '../types/domain';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'PRD-0001',
    productName: 'Vitamin C Gummies',
    brandName: 'VitaFit',
    marketingCompany: 'ABC Healthcare',
    manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
    flavour: 'Orange',
    fssaiNumber: '10023045000000',
    status: 'Active',
    createdDate: '2024-01-01',
    updatedDate: '2024-01-01',
    createdBy: 'Test Actor',
    updatedBy: 'Test Actor',
    ...overrides
  };
}

/** Spins up a throwaway HTTP server standing in for ai_backend for the duration of `run`. */
async function withFakeAiBackend(
  respond: (requestBody: unknown) => { status: number; body: unknown },
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      const requestBody: unknown = raw ? JSON.parse(raw) : {};
      const { status, body } = respond(requestBody);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('Returns unavailable, never throwing, when no AI backend URL is configured', async () => {
  const result = await identifyProductAt(undefined, { productName: 'X', brand: 'Y', marketingCompany: 'Z' }, [product()]);
  assert.deepEqual(result, { status: 'unavailable' });
});

test('Returns unavailable, not a thrown error, when the AI backend is unreachable', async () => {
  // Port 1 is a privileged port nothing in this test suite is listening on.
  const result = await identifyProductAt('http://127.0.0.1:1', { productName: 'X', brand: 'Y', marketingCompany: 'Z' }, [product()]);
  assert.deepEqual(result, { status: 'unavailable' });
});

test("Maps a name+company match reported by the AI backend back to the caller's own product record", async () => {
  const existing = product();
  await withFakeAiBackend(
    () => ({
      status: 200,
      body: {
        status: 'Existing Product Found',
        product: {
          product_id: existing.id,
          brand_name: existing.brandName,
          product_name: existing.productName,
          marketing_company: existing.marketingCompany,
          fssai_number: existing.fssaiNumber
        }
      }
    }),
    async (baseUrl) => {
      const result = await identifyProductAt(
        baseUrl,
        { productName: existing.productName, brand: existing.brandName, marketingCompany: existing.marketingCompany },
        [existing]
      );
      assert.deepEqual(result, { status: 'existing_product_found', product: existing });
    }
  );
});

test('Reports new_product_no_match when the AI backend finds nothing', async () => {
  await withFakeAiBackend(
    () => ({ status: 200, body: { status: 'New Product / No Match', product: null } }),
    async (baseUrl) => {
      const result = await identifyProductAt(baseUrl, { productName: 'Nonexistent', brand: 'Nobrand', marketingCompany: 'Nocompany' }, [product()]);
      assert.deepEqual(result, { status: 'new_product_no_match' });
    }
  );
});

test("Sends the label and existing products mapped to the AI backend's own schema, with a blank FSSAI number sent as null, not an empty string", async () => {
  const existing = product({ fssaiNumber: '' });
  let receivedBody: any;
  await withFakeAiBackend(
    (requestBody) => {
      receivedBody = requestBody;
      return { status: 200, body: { status: 'New Product / No Match', product: null } };
    },
    async (baseUrl) => {
      await identifyProductAt(baseUrl, { productName: 'x', brand: 'y', marketingCompany: 'z' }, [existing]);
    }
  );

  assert.deepEqual(receivedBody.extracted_label, {
    product_name: 'x',
    brand_name: 'y',
    marketing_company: 'z',
    fssai_number: null
  });
  assert.deepEqual(receivedBody.existing_products, [
    {
      product_id: existing.id,
      brand_name: existing.brandName,
      product_name: existing.productName,
      marketing_company: existing.marketingCompany,
      fssai_number: null
    }
  ]);
});

test('A match naming a product_id the caller does not recognise is treated as no match, never a fabricated product', async () => {
  await withFakeAiBackend(
    () => ({
      status: 200,
      body: { status: 'Existing Product Found', product: { product_id: 'PRD-NOTREAL', brand_name: 'x', product_name: 'y', marketing_company: 'z' } }
    }),
    async (baseUrl) => {
      const result = await identifyProductAt(baseUrl, { productName: 'y', brand: 'x', marketingCompany: 'z' }, [product()]);
      assert.deepEqual(result, { status: 'new_product_no_match' });
    }
  );
});

test('A non-200 response from the AI backend is treated as unavailable, not thrown', async () => {
  await withFakeAiBackend(
    () => ({ status: 500, body: { detail: 'boom' } }),
    async (baseUrl) => {
      const result = await identifyProductAt(baseUrl, { productName: 'x', brand: 'y', marketingCompany: 'z' }, []);
      assert.deepEqual(result, { status: 'unavailable' });
    }
  );
});

test('A non-object response body (an array) is treated as unavailable, not thrown', async () => {
  await withFakeAiBackend(
    () => ({ status: 200, body: [] }),
    async (baseUrl) => {
      const result = await identifyProductAt(baseUrl, { productName: 'x', brand: 'y', marketingCompany: 'z' }, []);
      assert.deepEqual(result, { status: 'unavailable' });
    }
  );
});
