// Integration tests for durable artwork file storage — POST/GET
// /api/artworks/:id/file (see artworks.routes.ts and
// artworkFileStorage.service.ts). Drives the real Express app over HTTP with
// real fixture files, same pattern as labels.compareVisual.test.ts.
//
// Every artwork this suite creates is deleted in after(), and every file it
// durably stores is removed from disk too — the same "created, not borrowed,
// and cleaned up" discipline testSession.ts documents for test accounts,
// applied here to the artwork rows this suite is the only writer of.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { env } from '../config/env';
import { closePool, getPool } from '../db/pool';
import { artworkFilePath } from '../services/artworkFileStorage.service';
import { TEST_ACCOUNTS, createTestAccount, listenForTests, removeTestAccount } from './testSession';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
let server: Server;
let baseUrl: string;
let token: string;

const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — /api/artworks needs a session and a real product';

// Artwork ids + mime types this suite created, so after() can remove both the
// row and the file on disk regardless of which test created them.
const createdArtworks: { id: string; mimeType: string }[] = [];

// PRD-0002 deliberately, not PRD-0001: api.persistence.test.ts and
// db.repositories.test.ts both assert PRD-0001 has EXACTLY 7 artworks, and
// those suites run concurrently with this one under `node --test` — a real
// (not rolled-back) artwork this suite commits is briefly visible to any
// concurrent reader of the same product. Creating a brand new PRODUCT would
// have the same problem one level up (api.persistence.test.ts's "lists every
// product" asserts an exact total of 16), so this suite attaches its
// artworks to an existing, otherwise-unasserted product instead of creating
// one of its own.
const TEST_PRODUCT_ID = 'PRD-0002';

before(async () => {
  if (SKIP) return;
  ({ server, baseUrl } = await listenForTests());
  token = await createTestAccount(baseUrl, TEST_ACCOUNTS.artworkFile);
});

after(async () => {
  if (!SKIP) {
    for (const { id, mimeType } of createdArtworks) {
      await getPool().query('DELETE FROM artworks WHERE id = $1', [id]);
      fs.rmSync(artworkFilePath(id, mimeType), { force: true });
    }
    await removeTestAccount(TEST_ACCOUNTS.artworkFile);
  }
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

// byte_size is NOT NULL but never asserted on by these tests, which are about
// the upload/serve routes, not the metadata row — an arbitrary positive
// number is honest enough for a fileName that is never actually uploaded
// under (the mismatched-type and no-file tests only need the row to exist).
async function createArtwork(fileType: string, fileName: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/artworks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      productId: TEST_PRODUCT_ID,
      productName: 'Multivitamin Gummies',
      brand: 'NutriPlus',
      marketingCompany: 'XYZ Healthcare',
      manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
      artworkType: 'Front Artwork',
      fileName,
      fileType,
      fileSize: 1_000,
      filePath: '',
      status: 'Draft',
      remarks: 'artworks.file.test.ts fixture'
    })
  });
  const body = (await response.json()) as { data?: { id?: string }; message?: string };
  if (!body.data?.id) throw new Error(`Failed to create test artwork: ${body.message}`);
  createdArtworks.push({ id: body.data.id, mimeType: fileType });
  return body.data.id;
}

async function uploadFile(
  artworkId: string,
  fixtureName: string | null,
  mimeType = 'application/pdf'
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  if (fixtureName) form.append('file', new Blob([fixture(fixtureName)], { type: mimeType }), fixtureName);
  const res = await fetch(`${baseUrl}/api/artworks/${artworkId}/file`, {
    method: 'POST',
    body: form,
    headers: { authorization: `Bearer ${token}` }
  });
  return { status: res.status, body: await res.json() };
}

test('storing then serving a real label file round-trips the exact bytes', { skip: SKIP }, async () => {
  const artworkId = await createArtwork('application/pdf', 'apple-cider-vinegar-gummy.pdf');

  const stored = await uploadFile(artworkId, 'apple-cider-vinegar-gummy.pdf');
  assert.equal(stored.status, 200);
  assert.equal(stored.body.success, true);
  assert.equal(stored.body.data.filePath, `${env.publicBaseUrl}/api/artworks/${artworkId}/file`);

  const served = await fetch(`${baseUrl}/api/artworks/${artworkId}/file`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'application/pdf');
  const servedBytes = Buffer.from(await served.arrayBuffer());
  assert.deepEqual(servedBytes, fixture('apple-cider-vinegar-gummy.pdf'));
});

test('a second upload onto the same artwork is refused rather than silently overwriting the first', { skip: SKIP }, async () => {
  const artworkId = await createArtwork('application/pdf', 'apple-cider-vinegar-gummy.pdf');
  await uploadFile(artworkId, 'apple-cider-vinegar-gummy.pdf');

  const second = await uploadFile(artworkId, 'chyawanprash-gummies.pdf');
  assert.equal(second.status, 409);
  assert.equal(second.body.success, false);
  assert.match(second.body.message, /already has a stored file/i);
});

test('an uploaded file whose type disagrees with the artwork\'s declared type is rejected', { skip: SKIP }, async () => {
  const artworkId = await createArtwork('application/pdf', 'declared-only.pdf');

  const { status, body } = await uploadFile(artworkId, 'jpg-label.jpg', 'image/jpeg');
  assert.equal(status, 400);
  assert.match(body.message, /does not match this artwork's declared file type/i);
});

test('uploading with no file attached is a controlled 400', { skip: SKIP }, async () => {
  const artworkId = await createArtwork('application/pdf', 'declared-only.pdf');

  const { status, body } = await uploadFile(artworkId, null);
  assert.equal(status, 400);
  assert.match(body.message, /no file uploaded/i);
});

test('uploading to an artwork that does not exist is a 404 naming it', { skip: SKIP }, async () => {
  const { status, body } = await uploadFile('ART-9999', 'apple-cider-vinegar-gummy.pdf');
  assert.equal(status, 404);
  assert.match(body.message, /Artwork "ART-9999" was not found/);
});

test('reading the file of an artwork nobody has uploaded to yet is a 404, not an empty body', { skip: SKIP }, async () => {
  const artworkId = await createArtwork('application/pdf', 'declared-only.pdf');

  const response = await fetch(`${baseUrl}/api/artworks/${artworkId}/file`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 404);
  const body = (await response.json()) as { message: string };
  assert.match(body.message, /has no stored file/i);
});
