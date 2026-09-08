// Integration tests for POST /api/labels/compare-visual — the visual
// counterpart to /compare-extracted for Quick Label Comparison (see
// labels.controller.ts's own comment on why this is a separate endpoint).
// Drives the real Express app over HTTP with real label file fixtures,
// same pattern as labels.compare.test.ts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { env } from '../config/env';
import { closePool } from '../db/pool';
import { TEST_ACCOUNTS, createTestAccount, listenForTests, removeTestAccount } from './testSession';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
let server: Server;
let baseUrl: string;
let token: string;

const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — /api/labels needs a session';

before(async () => {
  if (SKIP) return;
  ({ server, baseUrl } = await listenForTests());
  token = await createTestAccount(baseUrl, TEST_ACCOUNTS.compareVisual);
});

after(async () => {
  if (!SKIP) await removeTestAccount(TEST_ACCOUNTS.compareVisual);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

async function postCompareVisual(
  labelAFile: string | null,
  labelBFile: string | null,
  mimeType = 'application/pdf'
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  if (labelAFile) form.append('labelA', new Blob([fixture(labelAFile)], { type: mimeType }), labelAFile);
  if (labelBFile) form.append('labelB', new Blob([fixture(labelBFile)], { type: mimeType }), labelBFile);
  const res = await fetch(`${baseUrl}/api/labels/compare-visual`, { method: 'POST', body: form, headers: { authorization: `Bearer ${token}` } });
  const body = await res.json();
  return { status: res.status, body };
}

test('Comparing a real label PDF against itself reports MATCH', { skip: SKIP }, async () => {
  const { status, body } = await postCompareVisual('apple-cider-vinegar-gummy.pdf', 'apple-cider-vinegar-gummy.pdf');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.visualComparison.status, 'MATCH');
  assert.ok(body.data.visualComparison.similarityPercentage >= 95);
});

test('Comparing two genuinely different real label PDFs reports CONFLICT, not a false MATCH', { skip: SKIP }, async () => {
  const { status, body } = await postCompareVisual('apple-cider-vinegar-gummy.pdf', 'chyawanprash-gummies.pdf');
  assert.equal(status, 200);
  assert.equal(body.data.visualComparison.status, 'CONFLICT');
});

test('Missing Label A returns a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompareVisual(null, 'chyawanprash-gummies.pdf');
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /label a/i);
});

test('A corrupt file on either side reports MISSING rather than a 500', { skip: SKIP }, async () => {
  const { status, body } = await postCompareVisual('corrupt.pdf', 'chyawanprash-gummies.pdf');
  assert.equal(status, 200);
  assert.equal(body.data.visualComparison.status, 'MISSING');
});

test('Unsupported file type on either side is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompareVisual('unsupported.txt', 'chyawanprash-gummies.pdf', 'text/plain');
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /unsupported file type/i);
});
