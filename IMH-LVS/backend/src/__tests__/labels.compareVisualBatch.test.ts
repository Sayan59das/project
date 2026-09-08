// Integration tests for POST /api/labels/compare-visual-batch — one
// subject artwork against N candidates in a single request (see
// labels.controller.ts's own comment on why this exists: the Quick Label
// Comparison workflow's cross-company step was re-uploading and re-hashing
// the identical subject file once per candidate).
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
  token = await createTestAccount(baseUrl, TEST_ACCOUNTS.compareVisualBatch);
});

after(async () => {
  if (!SKIP) await removeTestAccount(TEST_ACCOUNTS.compareVisualBatch);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

async function postBatch(subject: string | null, candidates: string[]): Promise<{ status: number; body: any }> {
  const form = new FormData();
  if (subject) form.append('subject', new Blob([fixture(subject)], { type: 'application/pdf' }), subject);
  candidates.forEach((name) => form.append('candidates', new Blob([fixture(name)], { type: 'application/pdf' }), name));
  const res = await fetch(`${baseUrl}/api/labels/compare-visual-batch`, { method: 'POST', body: form, headers: { authorization: `Bearer ${token}` } });
  const body = await res.json();
  return { status: res.status, body };
}

test('One subject against three candidates returns three results in the same order', { skip: SKIP }, async () => {
  const { status, body } = await postBatch('apple-cider-vinegar-gummy.pdf', [
    'apple-cider-vinegar-gummy.pdf', // identical -> MATCH
    'chyawanprash-gummies.pdf', // different -> CONFLICT
    'corrupt.pdf' // unreadable -> MISSING
  ]);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.results.length, 3);
  assert.equal(body.data.results[0].status, 'MATCH');
  assert.equal(body.data.results[1].status, 'CONFLICT');
  assert.equal(body.data.results[2].status, 'MISSING');
});

test('A corrupt subject reports MISSING for every candidate rather than failing the batch', { skip: SKIP }, async () => {
  const { status, body } = await postBatch('corrupt.pdf', ['apple-cider-vinegar-gummy.pdf', 'chyawanprash-gummies.pdf']);
  assert.equal(status, 200);
  assert.equal(body.data.results[0].status, 'MISSING');
  assert.equal(body.data.results[1].status, 'MISSING');
});

test('Missing subject returns a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postBatch(null, ['chyawanprash-gummies.pdf']);
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /subject/i);
});

test('No candidates returns a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postBatch('apple-cider-vinegar-gummy.pdf', []);
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /candidate/i);
});
