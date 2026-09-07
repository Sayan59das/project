// Integration tests for the persistence routes, driven over real HTTP against
// the real Express app — same pattern as labels.compare.test.ts.
//
// These cover what the HTTP layer is actually responsible for: routing, the
// response envelope, turning an unknown id into a 404, refusing a write with no
// actor, and carrying a repository's translated message through to the client.
// The repository behaviour underneath is covered by db.repositories.test.ts.
//
// Every test here either reads or is rejected before it writes, so the suite
// leaves the seeded database untouched without needing transactions. Mutating
// writes are tested at the repository level, where they can be rolled back.
//
// Since 004_auth.sql every one of these routes needs a session, so the suite
// creates an account of its own in before(), sends its token on every request,
// and removes it in after(). See testSession.ts for why each suite gets its own
// rather than sharing or borrowing a seeded one. Who the actor is, and the fact
// that it can no longer be asserted in a header, is covered in auth.test.ts.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { closePool, getPool } from '../db/pool';
import { env } from '../config/env';
import { TEST_ACCOUNTS, createTestAccount, removeTestAccount } from './testSession';

const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — see src/db/pool.ts';

let server: Server;
let baseUrl: string;
let token: string;

// label_final, because the workflow decision exercised below is that stage.
const SIGN_IN_AS = TEST_ACCOUNTS.persistence;

before(async () => {
  if (SKIP) return;

  const { rows } = await getPool().query<{ count: number }>(
    "SELECT count(*)::int AS count FROM products WHERE id = 'PRD-0001'"
  );
  if (rows[0].count === 0) {
    throw new Error('The database is reachable but not seeded. Run `npm run db:migrate && npm run db:seed`.');
  }

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  baseUrl = `http://127.0.0.1:${address.port}`;

  token = await createTestAccount(baseUrl, SIGN_IN_AS);
});

after(async () => {
  // Remove the account this suite created, exactly as every other suite that
  // calls createTestAccount does (auth, labels.extract, labels.compare,
  // labels.compareExtracted). This previously ran the cleanup for a BORROWED
  // seed account instead — clearing a password and sessions on a row it did
  // not own — left over from before the suite created its own. The account
  // therefore survived the run, and db.repositories.test.ts's seeded-user
  // count then failed 6 !== 5 on every subsequent run against the same
  // database: a suite that poisoned the database it was written to be safe in.
  //
  // removeTestAccount deletes the user and cascades its sessions, so no
  // separate sessions/password cleanup is needed.
  if (!SKIP) await removeTestAccount(SIGN_IN_AS);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

// Bearer rather than the cookie: there is no cookie jar here, and the header is
// the path this API deliberately keeps open for non-browser callers.
async function get(path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}

async function send(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

describe('master data routes', { skip: SKIP }, () => {
  it('lists a master resource in the standard envelope', async () => {
    const { status, body } = await get('/api/masters/brands');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.length, 11);
  });

  it('reads one record by id', async () => {
    const { status, body } = await get('/api/masters/brands/BRD-0006');
    assert.equal(status, 200);
    assert.equal(body.data.brandName, 'BoneStrong');
  });

  it('reports an unknown id as a 404 that names it', async () => {
    const { status, body } = await get('/api/masters/brands/BRD-9999');
    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.match(body.message, /Brand "BRD-9999" was not found/);
  });

  it('serves all six master resources', async () => {
    for (const [path, expected] of [
      ['marketing-companies', 7],
      ['manufacturing-companies', 2],
      ['brands', 11],
      ['flavours', 8],
      ['claims', 4],
      ['product-categories', 5]
    ] as const) {
      const { status, body } = await get(`/api/masters/${path}`);
      assert.equal(status, 200, path);
      assert.equal(body.data.length, expected, path);
    }
  });
});

// Every write is recorded against a person. There is no authentication yet, so
// the caller states who they are — but a write with nobody named is refused
// rather than attributed to 'system', because a fabricated name in an audit
// trail reads like a real one.
describe('authentication', { skip: SKIP }, () => {
  // These two used to assert that a write without X-Actor-Name was a 400 naming
  // the header. That contract is gone: the actor is no longer something a
  // caller supplies, so its absence is not a malformed request but an
  // unauthenticated one. Both are kept, pointed at the replacement behaviour,
  // because the property they were protecting — no write is ever recorded
  // without a named person behind it — is unchanged, and is the reason the
  // route refuses at all.
  it('refuses a write with no session', async () => {
    const response = await fetch(`${baseUrl}/api/masters/flavours`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flavourName: 'Blueberry', status: 'Active' })
    });
    assert.equal(response.status, 401);
    const refused = (await response.json()) as { message: string };
    assert.match(refused.message, /sign in/i);
  });

  it('refuses a workflow decision with no session, whatever the old actor headers claim', async () => {
    const response = await fetch(`${baseUrl}/api/comparisons/CMP-0001/decisions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-actor-name': 'Neha Singh',
        'x-actor-id': 'U-003',
        'x-actor-role': 'label_final'
      },
      body: JSON.stringify({
        stage: 'Label Final',
        action: 'Sent to Technical',
        resultingStatus: 'Pending Technical'
      })
    });
    assert.equal(response.status, 401);
  });
});

// The repositories translate constraint violations into sentences a reviewer
// can act on. This is the test that they survive the trip to the client instead
// of being flattened into 'Unexpected server error.'
describe('repository errors reach the client', { skip: SKIP }, () => {
  it('names the master record that does not exist', async () => {
    const { status, body } = await send(
      'POST',
      '/api/products',
      {
        productName: 'Ghost Gummies',
        brandName: 'NoSuchBrand',
        marketingCompany: 'ABC Healthcare',
        manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
        flavour: 'Orange',
        fssaiNumber: '10023045000000',
        status: 'Active'
      },
      { 'x-actor-name': 'Test Actor' }
    );
    assert.equal(status, 400);
    assert.match(body.message, /Brand "NoSuchBrand" does not exist/);
  });

  it('reports a duplicate email as a 409, not a 500', async () => {
    const { status, body } = await send('POST', '/api/users', {
      fullName: 'Impostor',
      email: 'manager@imhealthcare.com',
      role: 'manager',
      department: 'Management',
      status: 'Active'
    });
    assert.equal(status, 409);
    assert.match(body.message, /already exists/);
  });

  it('refuses a comparison result taken over a value it does not have', async () => {
    const { status, body } = await send(
      'POST',
      '/api/comparisons',
      {
        productId: 'PRD-0001',
        stage: 'same_company',
        newArtworkId: 'ART-0005',
        referenceArtworkId: 'ART-0003',
        parameters: [{ parameter: 'Logo', referenceValue: '', newValue: 'VitaFit Apple Logo v2', result: 'MATCH' }],
        overallSimilarity: 100,
        overallResult: 'MATCH',
        status: 'Draft'
      },
      { 'x-actor-name': 'Test Actor' }
    );
    assert.equal(status, 400);
    assert.match(body.message, /only admissible result is MISSING/);
  });
});

describe('product routes', { skip: SKIP }, () => {
  it('lists every product', async () => {
    const { body } = await get('/api/products');
    assert.equal(body.data.length, 16);
  });

  it('narrows by brand and marketing company', async () => {
    const { body } = await get('/api/products?brand=VitaFit&marketingCompany=ABC%20Healthcare');
    assert.deepEqual(body.data.map((product: any) => product.id).sort(), ['PRD-0001', 'PRD-0009']);
  });

  it('answers the possible-duplicate question with the match itself', async () => {
    const { body } = await get(
      '/api/products/possible-duplicate?productName=Vitamin%20C%20Gummies&brandName=VitaFit&marketingCompany=ABC%20Healthcare'
    );
    assert.equal(body.data.id, 'PRD-0001');
  });

  it('answers null when nothing is a possible duplicate', async () => {
    const { body } = await get(
      '/api/products/possible-duplicate?productName=Nothing&brandName=VitaFit&marketingCompany=ABC%20Healthcare'
    );
    assert.equal(body.data, null);
  });

  it('serves a product its artworks and comparisons', async () => {
    const artworks = await get('/api/products/PRD-0001/artworks');
    assert.equal(artworks.body.data.length, 7);

    const comparisons = await get('/api/products/PRD-0001/comparisons');
    assert.deepEqual(comparisons.body.data.map((comparison: any) => comparison.id), ['CMP-0003', 'CMP-0001']);
  });

  it('404s the sub-resources of a product that does not exist', async () => {
    const { status } = await get('/api/products/PRD-9999/artworks');
    assert.equal(status, 404);
  });
});

describe('artwork routes', { skip: SKIP }, () => {
  it('serves the approved baseline rather than the newest version', async () => {
    const { body } = await get(
      '/api/artworks/latest-approved?productId=PRD-0001&marketingCompany=ABC%20Healthcare'
    );
    assert.equal(body.data.id, 'ART-0004');
    assert.equal(body.data.version, 'V4');
  });

  // A first-ever label has no baseline. That is a state the workflow reports,
  // not a missing resource, so it is null with a 200.
  it('answers null, not 404, when there is no approved baseline', async () => {
    const { status, body } = await get(
      '/api/artworks/latest-approved?productId=PRD-0003&marketingCompany=ABC%20Healthcare'
    );
    assert.equal(status, 200);
    assert.equal(body.data, null);
  });

  it('serves cross-company candidates', async () => {
    const { body } = await get(
      '/api/artworks/cross-company-candidates?productName=Vitamin%20C%20Gummies&excludeMarketingCompany=ABC%20Healthcare'
    );
    assert.deepEqual(body.data.map((candidate: any) => candidate.artworkId).sort(), ['ART-0011', 'ART-0012']);
  });

  it('serves a stored extraction with its provenance', async () => {
    const { body } = await get('/api/artworks/ART-0004/label-attributes');
    assert.equal(body.data.colourTheme, 'Green & Orange gradient');
    assert.equal(body.data.source, 'seed');
  });

  // Never extracted is null — distinct from extracted and empty, which is what
  // stops the comparison engine reporting thirteen MISSING parameters as
  // though a comparison had actually run.
  it('answers null for an artwork nobody has extracted', async () => {
    const { status, body } = await get('/api/artworks/ART-0001/label-attributes');
    assert.equal(status, 200);
    assert.equal(body.data, null);
  });
});

describe('comparison routes', { skip: SKIP }, () => {
  it('assembles a comparison over HTTP', async () => {
    const { body } = await get('/api/comparisons/CMP-0001');
    assert.equal(body.data.parameters.length, 13);
    assert.equal(body.data.productName, 'Vitamin C Gummies');
    assert.equal(body.data.newArtworkVersion, 'V5');
  });

  it('serves the approvals queue filtered by status', async () => {
    const { body } = await get('/api/comparisons?status=Completed');
    assert.deepEqual(body.data.map((comparison: any) => comparison.id).sort(), ['CMP-0002', 'CMP-0003']);
  });

  it('accepts several statuses for one reviewer queue', async () => {
    const { body } = await get('/api/comparisons?status=Completed&status=Pending%20Label%20Final');
    assert.equal(body.data.length, 3);
  });
});

describe('user routes', { skip: SKIP }, () => {
  it('resolves a sign-in by email, case-insensitively', async () => {
    const { body } = await get('/api/users?email=MANAGER@imhealthcare.com');
    assert.equal(body.data.id, 'U-001');
  });

  it('answers null for an email with no user', async () => {
    const { body } = await get('/api/users?email=nobody@example.com');
    assert.equal(body.data, null);
  });

  it('lists the directory with module overrides absent', async () => {
    const { body } = await get('/api/users');

    // The five seeded users are asserted by id rather than by counting rows.
    // An exact count would now be a claim about every OTHER suite too — they
    // run concurrently and each creates a user of its own (testSession.ts) —
    // and this test is about the shape of a directory record, not the size of
    // the population.
    const ids = body.data.map((user: any) => user.id);
    for (const seeded of ['U-001', 'U-002', 'U-003', 'U-004', 'U-005']) {
      assert.ok(ids.includes(seeded), `directory is missing seeded user ${seeded}`);
    }
    assert.equal(body.data.every((user: any) => user.moduleAccess === undefined), true);
  });
});
