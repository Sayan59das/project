// Signing a test suite in.
//
// Every route except /api/health and /api/auth needs a session since
// 004_auth.sql, so the suites that drive routes over HTTP need one too. This
// is the one place that knows how to get it.
//
// WHAT THIS COSTS, AND WHY IT IS STILL RIGHT
// ---------------------------------------------------------------------
// The label routes used to run with no database at all — extraction is
// stateless, and src/config/env.ts says in as many words that the OCR half of
// this service must keep working on a machine with no Postgres. Putting
// /api/labels behind the session guard ends that for the HTTP-level suites,
// because a session comes out of the users table and there is no honest way to
// authenticate without one. (The extraction logic itself is still covered
// DB-free by the unit suites — labelSemanticExtractor, placeholderText,
// packageSizeOcr, displayTextRegion, labelFieldExtractor.flavour — which call
// the services directly and never bind a port.)
//
// The alternative was leaving /api/labels open, and that is worse: it is a
// file-upload endpoint that rasterizes and OCRs whatever it is given, on a
// public Render URL, processing pre-launch pharma artwork. Open, it is both a
// way to hand somebody else's artwork to this host and a way to spend its CPU
// for free.
//
// Suites using this therefore SKIP without DATABASE_URL rather than failing,
// the same rule src/db/pool.ts and db.repositories.test.ts follow.

import type { Server } from 'node:http';
import { createApp } from '../app';
import { getPool } from '../db/pool';
import { hashPassword } from '../services/password.service';

/**
 * One account per suite that needs to sign in, created and removed by that
 * suite.
 *
 * CREATED, NOT BORROWED, and both halves of that are load-bearing.
 *
 * Not borrowed from the seed, because the seeded rows are themselves under
 * test: db.repositories.test.ts asserts that U-002 has never logged in, and a
 * suite that signs in as U-002 writes last_login and fails it. Every seeded
 * user is somebody's fixture, and signing in is a mutation.
 *
 * One each rather than one shared, because `node --test` runs these files
 * concurrently and removeTestAccount deletes the row and its sessions. Two
 * suites on one account means whichever finishes first revokes the other's
 * token mid-run, which surfaces as a scatter of unrelated 401s that look
 * nothing like the cause.
 *
 * The ids are outside the USR-#### / U-### sequences the app issues, so
 * nextUserId (users.repository.ts) cannot collide with them: its regex reads
 * the trailing digit run, and these have none.
 *
 * Where the role matters it is noted — the workflow-stage rule in
 * comparisons.routes.ts ties each stage to exactly one role.
 */
export const TEST_ACCOUNTS = {
  /** label_final, because the decision api.persistence exercises is that stage. */
  persistence: { id: 'USR-T-PERSISTENCE', role: 'label_final' },
  /** account_manager owns no stage at all, which is the point in auth.test.ts. */
  auth: { id: 'USR-T-AUTH', role: 'account_manager' },
  /** The label routes need a session, not a particular role. */
  extract: { id: 'USR-T-EXTRACT', role: 'qa' },
  compare: { id: 'USR-T-COMPARE', role: 'qa' },
  compareExtracted: { id: 'USR-T-COMPARE-EXTRACTED', role: 'qa' }
} as const;

export type TestAccount = (typeof TEST_ACCOUNTS)[keyof typeof TEST_ACCOUNTS];

/** The address and password a test account signs in with, derived from its id. */
function credentialsFor(account: TestAccount): { email: string; password: string } {
  return { email: `${account.id.toLowerCase()}@test.invalid`, password: 'suite-password-not-secret' };
}

/**
 * Creates the account and returns a bearer token for it.
 *
 * `.invalid` is the reserved TLD for exactly this (RFC 2606), so one of these
 * rows reaching a real environment addresses nowhere.
 */
export async function createTestAccount(baseUrl: string, account: TestAccount): Promise<string> {
  const { email, password } = credentialsFor(account);
  await getPool().query(
    `INSERT INTO users (id, full_name, email, role, department, status, password_hash, password_updated_at)
     VALUES ($1, $2, $3, $4, 'Test', 'Active', $5, now())
     ON CONFLICT (id) DO UPDATE
        SET password_hash = EXCLUDED.password_hash, status = 'Active', role = EXCLUDED.role`,
    [account.id, `Test ${account.role}`, email, account.role, await hashPassword(password)]
  );
  return signInForTests(baseUrl, { email, password });
}

/** Removes the account. Its sessions cascade with it (004_auth.sql). */
export async function removeTestAccount(account: TestAccount): Promise<void> {
  await getPool().query('DELETE FROM users WHERE id = $1', [account.id]);
}

/**
 * Gives the account a password, signs in, and returns the bearer token.
 *
 * Bearer rather than the cookie because there is no cookie jar in these tests
 * and the header is the path the API deliberately keeps open for non-browser
 * callers — see auth.middleware.ts.
 */
export async function signInForTests(
  baseUrl: string,
  account: { email: string; password: string }
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password })
  });
  const body = (await response.json()) as { data?: { token?: string }; message?: string };
  if (!body?.data?.token) {
    throw new Error(`Could not sign in as ${account.email}: ${body?.message ?? JSON.stringify(body)}`);
  }
  return body.data.token;
}

/** Binds the app to an ephemeral port and reports the server and its base URL. */
export async function listenForTests(): Promise<{ server: Server; baseUrl: string }> {
  const server = createApp().listen();
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}
