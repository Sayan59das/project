// Integration tests for POST /api/labels/compare (Label Comparison V1).
// Same pattern as labels.extract.test.ts: drives the real Express app
// (createApp()) over HTTP so this exercises the full
// upload -> validate -> extract (both files) -> compare -> respond
// pipeline exactly as a real client would, reusing the same real-label PDF
// fixtures already established as extraction regression references.
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

// /api/labels moved behind the session guard in 004_auth.sql, and a session
// comes out of the users table — so this suite, which drives the route over
// HTTP, now needs a database where it used to need none. See testSession.ts for
// why that trade was made and what still covers extraction without one.
const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — /api/labels needs a session';

before(async () => {
  if (SKIP) return;
  ({ server, baseUrl } = await listenForTests());
  token = await createTestAccount(baseUrl, TEST_ACCOUNTS.compare);
});

after(async () => {
  if (!SKIP) await removeTestAccount(TEST_ACCOUNTS.compare);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

async function postCompare(
  labelAFile: string | null,
  labelBFile: string | null,
  mimeType = 'application/pdf'
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  if (labelAFile) form.append('labelA', new Blob([fixture(labelAFile)], { type: mimeType }), labelAFile);
  if (labelBFile) form.append('labelB', new Blob([fixture(labelBFile)], { type: mimeType }), labelBFile);
  const res = await fetch(`${baseUrl}/api/labels/compare`, { method: 'POST', body: form, headers: { authorization: `Bearer ${token}` } });
  const body = await res.json();
  return { status: res.status, body };
}

function fieldResult(body: any, field: string) {
  return body.data.comparison.fields.find((f: any) => f.field === field);
}

// Two different real labels from the same manufacturer/marketing company
// (see labels.extract.test.ts for the full extraction expectations this
// relies on) — genuinely different products, so this exercises MATCH (the
// fields that are actually identical, e.g. brand/marketing company/FSSAI),
// CONFLICT (product name), and MISSING (flavour: Apple Cider Vinegar
// Gummy states one, Chyawanprash Gummies states none) all in one real,
// non-synthetic comparison.
test('Compare two different real label PDFs: MATCH/CONFLICT/MISSING all correctly distinguished', { skip: SKIP }, async () => {
  const { status, body } = await postCompare('apple-cider-vinegar-gummy.pdf', 'chyawanprash-gummies.pdf');
  assert.equal(status, 200);
  assert.equal(body.success, true);

  assert.ok(body.data.labelA);
  assert.ok(body.data.labelB);
  assert.equal(body.data.labelA.productName, 'Apple Cider Vinegar Gummies');
  assert.equal(body.data.labelB.productName, 'Chyawanprash Gummies');

  const comparison = body.data.comparison;
  assert.ok(Array.isArray(comparison.fields));
  assert.equal(comparison.fields.length, 14);

  // Same manufacturer/marketing company/party details on both real labels.
  assert.equal(fieldResult(body, 'brand').status, 'MATCH');
  assert.equal(fieldResult(body, 'marketingCompany').status, 'MATCH');
  assert.equal(fieldResult(body, 'fssaiNumber').status, 'MATCH');
  assert.equal(fieldResult(body, 'email').status, 'MATCH');
  assert.equal(fieldResult(body, 'customerCareNumber').status, 'MATCH');
  assert.equal(fieldResult(body, 'manufacturingCompany').status, 'MATCH');

  // Genuinely different products — never reported as merely "different"
  // when one side has nothing to compare (that's MISSING, per the
  // business rule below), but productName differs on BOTH sides so it
  // must be CONFLICT, not MISSING. The two names share no meaningful words
  // and aren't a close spelling variant, so this isn't a SIMILAR case either.
  assert.equal(fieldResult(body, 'productName').status, 'CONFLICT');

  // Apple Cider Vinegar Gummy states a flavour; Chyawanprash Gummies
  // states none at all — a gap on one side, not two conflicting values.
  assert.equal(fieldResult(body, 'flavour').status, 'MISSING');
  assert.equal(fieldResult(body, 'flavour').labelA, 'Apple');
  assert.equal(fieldResult(body, 'flavour').labelB, '');

  // Both labels declare "Net Content: 30 N", so this parameter now has a value
  // on both sides and genuinely matches. It used to be NOT_COMPARED because
  // neither count could be read, not because neither existed — the
  // NOT_COMPARED path itself is still covered, by the two-unreadable-files
  // test further down.
  assert.equal(fieldResult(body, 'packageSize').status, 'MATCH');

  // Summary counts must match what was actually computed, not a
  // hardcoded/demo figure.
  const fields = comparison.fields;
  assert.equal(comparison.matchingFields, fields.filter((f: any) => f.status === 'MATCH').length);
  assert.equal(comparison.similarFields, fields.filter((f: any) => f.status === 'SIMILAR').length);
  assert.equal(comparison.conflictingFields, fields.filter((f: any) => f.status === 'CONFLICT').length);
  assert.equal(comparison.missingFields, fields.filter((f: any) => f.status === 'MISSING').length);
  assert.equal(comparison.notComparedFields, fields.filter((f: any) => f.status === 'NOT_COMPARED').length);
  assert.equal(comparison.totalFieldsCompared, fields.length - comparison.notComparedFields);
  assert.ok(comparison.overallPercentage >= 0 && comparison.overallPercentage <= 100);
});

// The same file compared against itself must report every field that has
// a real value as MATCH (case/whitespace-insensitive normalization aside,
// this is byte-identical content), never CONFLICT, SIMILAR or MISSING —
// and a 100% overall score, since every field that was actually compared
// matched exactly.
test('Compare a real label against itself: every populated field matches, overall score is 100%', { skip: SKIP }, async () => {
  const { status, body } = await postCompare('apple-cider-vinegar-gummy.pdf', 'apple-cider-vinegar-gummy.pdf');
  assert.equal(status, 200);
  assert.equal(body.success, true);

  const comparison = body.data.comparison;
  for (const field of comparison.fields) {
    assert.notEqual(field.status, 'CONFLICT', `${field.field} must not be CONFLICT when comparing a label against itself`);
    assert.notEqual(field.status, 'SIMILAR', `${field.field} must not be SIMILAR when comparing a label against itself — identical text is an exact MATCH`);
    assert.notEqual(field.status, 'MISSING', `${field.field} must not be MISSING when comparing a label against itself`);
  }
  assert.equal(comparison.similarFields, 0);
  assert.equal(comparison.conflictingFields, 0);
  assert.equal(comparison.missingFields, 0);
  assert.equal(comparison.overallPercentage, 100);
});

test('Missing Label A returns a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompare(null, 'chyawanprash-gummies.pdf');
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /label a/i);
});

test('Missing Label B returns a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompare('apple-cider-vinegar-gummy.pdf', null);
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /label b/i);
});

test('Missing both files returns a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompare(null, null);
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /label a.*label b|both/i);
});

test('Unsupported file type on either side is rejected with a controlled 400', { skip: SKIP }, async () => {
  const { status, body } = await postCompare('unsupported.txt', 'chyawanprash-gummies.pdf', 'text/plain');
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /unsupported file type/i);
});

test('Oversized file on either side is rejected with a controlled error, not a crash', { skip: SKIP }, async () => {
  const { status, body } = await postCompare('oversized.jpg', 'chyawanprash-gummies.pdf', 'image/jpeg');
  assert.equal(status, 413);
  assert.equal(body.success, false);
});

// Two corrupt/unreadable files still return a normal 200 comparison
// response — an empty extraction on both sides is a valid state (per the
// no-fabrication rule everywhere else in this app), reported as
// NOT_COMPARED fields, never surfaced as a request failure.
test('Two unreadable files: comparison still succeeds, reported as NOT_COMPARED rather than an error', { skip: SKIP }, async () => {
  const { status, body } = await postCompare('corrupt.pdf', 'corrupt.pdf');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  const comparison = body.data.comparison;
  for (const field of comparison.fields) {
    if (field.field === 'manufacturingCompany') continue; // always the fixed constant, always MATCH
    assert.equal(field.status, 'NOT_COMPARED', `${field.field} should be NOT_COMPARED when neither label extracted any data`);
  }
});
