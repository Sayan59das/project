// Unit tests for uploadArtworkFile() — the durable-storage upload call added
// alongside POST /api/artworks/:id/file (see backend/src/routes/artworks.routes.ts).
// No real server: global fetch is stubbed per test, the same boundary
// labelExtractionService.ts's extractLabel() sits behind, so these run as
// plain node unit tests with no network or backend dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryLocalStorage } from './testLocalStorage';

installMemoryLocalStorage();

const { ArtworkFileUploadError, createArtwork, uploadArtworkFile } = await import('../artworkService');

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

// Regression test for a real bug found live-testing this feature in a
// browser: the upload form's blob: URL (set as a tab-local preview) used to
// be sent straight through as the new artwork's filePath. The backend stored
// whatever non-empty string it was given as storage_key, so a brand-new
// artwork already looked "durably stored" the instant it was created — and
// POST /:id/file (which refuses to overwrite an existing file) then rejected
// every real upload with a false 409, even the very first one. A dead blob:
// URL and an empty filePath both used to render as "preview not available"
// once the tab closed, which is exactly why nobody had noticed.
test('createArtwork never sends this tab\'s blob: URL to the server as filePath', async () => {
  let sentBody: any;
  const artwork = await withStubbedFetch(
    (async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(init!.body as string);
      return jsonResponse(201, { success: true, data: { id: 'ART-0050', filePath: '' } });
    }) as typeof fetch,
    () =>
      createArtwork({
        productId: 'PRD-0001',
        productName: 'Test Product',
        brand: 'TestBrand',
        marketingCompany: 'Test Marketing Co',
        manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
        artworkType: 'Full Label',
        fileName: 'label.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        filePath: 'blob:http://localhost:4173/some-tab-local-id',
        status: 'Draft',
        remarks: ''
      })
  );

  assert.equal(sentBody.filePath, '');
  assert.equal(artwork.id, 'ART-0050');
});

test('Returns the stored artwork when the server reports success', async () => {
  const artwork = { id: 'ART-0099', filePath: 'http://localhost:4000/api/artworks/ART-0099/file' };
  const result = await withStubbedFetch(
    (async () => jsonResponse(200, { success: true, data: artwork })) as typeof fetch,
    () => uploadArtworkFile('ART-0099', new File(['bytes'], 'label.pdf', { type: 'application/pdf' }))
  );
  assert.deepEqual(result, artwork);
});

test('Throws ArtworkFileUploadError with the backend\'s own message on a refused upload', async () => {
  await assert.rejects(
    () =>
      withStubbedFetch(
        (async () => jsonResponse(409, { success: false, message: 'Artwork "ART-0001" already has a stored file.' })) as typeof fetch,
        () => uploadArtworkFile('ART-0001', new File(['bytes'], 'label.pdf', { type: 'application/pdf' }))
      ),
    (err: unknown) => err instanceof ArtworkFileUploadError && /already has a stored file/.test(err.message)
  );
});

test('Throws ArtworkFileUploadError, not a raw network error, when the server is unreachable', async () => {
  await assert.rejects(
    () =>
      withStubbedFetch(
        (async () => {
          throw new TypeError('fetch failed');
        }) as typeof fetch,
        () => uploadArtworkFile('ART-0001', new File(['bytes'], 'label.pdf', { type: 'application/pdf' }))
      ),
    (err: unknown) => err instanceof ArtworkFileUploadError && /could not reach the server/i.test(err.message)
  );
});

test('Throws ArtworkFileUploadError when the response body is not valid JSON', async () => {
  await assert.rejects(
    () =>
      withStubbedFetch(
        (async () =>
          ({
            ok: false,
            status: 502,
            json: async () => {
              throw new SyntaxError('Unexpected token');
            }
          }) as unknown as Response) as typeof fetch,
        () => uploadArtworkFile('ART-0001', new File(['bytes'], 'label.pdf', { type: 'application/pdf' }))
      ),
    (err: unknown) => err instanceof ArtworkFileUploadError && /unexpected response/i.test(err.message)
  );
});
