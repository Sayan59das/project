// Authentication, over real HTTP against the real app — same pattern as
// api.persistence.test.ts.
//
// What this suite is actually pinning is the property the API did not have
// before 004_auth.sql: that the actor recorded against a write is the person
// who proved they hold a session, and NOT anything the caller asserted. The
// header-impersonation tests below are the regression tests for that, and they
// are the reason the rest exists.
//
// Every write here either fails before it writes, or touches only `sessions`
// and the password/status columns of the one seeded account this suite borrows
// and restores, so the seeded data is left exactly as it was found.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { closePool, getPool } from '../db/pool';
import { env } from '../config/env';
import { hashPassword, rejectWeakPassword, verifyPassword } from '../services/password.service';
import { TEST_ACCOUNTS, createTestAccount, removeTestAccount } from './testSession';

const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — see src/db/pool.ts';

// An account this suite creates and removes — see testSession.ts. It has to be
// its own, because the tests below suspend it, change its password and revoke
// its sessions, none of which a shared or seeded account would survive.
//
// account_manager owns no stage of the approval chain, which is what makes the
// stage-role refusal below a real test rather than an accident of ordering.
const TEST_USER = TEST_ACCOUNTS.auth;
const TEST_EMAIL = `${TEST_ACCOUNTS.auth.id.toLowerCase()}@test.invalid`;
const TEST_PASSWORD = 'suite-password-not-secret';

let server: Server;
let baseUrl: string;

before(async () => {
  if (SKIP) return;

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  baseUrl = `http://127.0.0.1:${address.port}`;

  await createTestAccount(baseUrl, TEST_USER);
});

after(async () => {
  if (!SKIP) await removeTestAccount(TEST_USER);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

async function call(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; setCookie: string | null }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return {
    status: response.status,
    body: await response.json(),
    setCookie: response.headers.get('set-cookie')
  };
}

async function login(email: string = TEST_EMAIL, password: string = TEST_PASSWORD) {
  return call('POST', '/api/auth/login', { body: { email, password } });
}

describe('password hashing', () => {
  it('verifies a password against its own hash and rejects every other one', async () => {
    const hash = await hashPassword('a-real-password');
    assert.equal(await verifyPassword('a-real-password', hash), true);
    assert.equal(await verifyPassword('a-real-passworD', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });

  it('produces a different hash every time, so equal passwords are not equal ciphertext', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    assert.notEqual(first, second, 'two hashes of one password must differ — otherwise the salt is not doing anything');
    assert.equal(await verifyPassword('same', first), true);
    assert.equal(await verifyPassword('same', second), true);
  });

  it('carries its cost parameters in the hash, so they can be raised later', async () => {
    const hash = await hashPassword('parameterised');
    assert.match(hash, /^scrypt\$N=\d+,r=\d+,p=\d+\$/);
  });

  it('returns false rather than throwing for a hash it cannot parse', async () => {
    for (const malformed of ['', 'not-a-hash', 'scrypt$N=16384$onlythree', 'bcrypt$N=1,r=1,p=1$aa$bb']) {
      assert.equal(await verifyPassword('anything', malformed), false, `should refuse: ${malformed}`);
    }
  });

  it('refuses a password too short to be worth hashing', () => {
    assert.ok(rejectWeakPassword('short'));
    assert.equal(rejectWeakPassword('long-enough-password'), undefined);
  });
});

describe('login', { skip: SKIP }, () => {
  it('issues a session for the right password and returns the user', async () => {
    const { status, body, setCookie } = await login();
    assert.equal(status, 200);
    assert.equal(body.data.user.email, TEST_EMAIL);
    assert.ok(body.data.token, 'a token is returned for non-browser callers');
    assert.ok(setCookie?.includes('imh_lvs_session='), 'and a cookie for browsers');
  });

  it('sets the session cookie httpOnly, so page script can never read it', async () => {
    const { setCookie } = await login();
    assert.match(setCookie ?? '', /HttpOnly/i);
  });

  it('never says whether the email exists', async () => {
    const wrongPassword = await login(TEST_EMAIL, 'not-the-password');
    const noSuchUser = await login('nobody@imhealthcare.com', 'not-the-password');

    assert.equal(wrongPassword.status, 401);
    assert.equal(noSuchUser.status, 401);
    assert.equal(
      wrongPassword.body.message,
      noSuchUser.body.message,
      'a different message for an unknown email turns this endpoint into a staff directory'
    );
  });

  it('refuses an account that is not Active, and says so', async () => {
    await getPool().query("UPDATE users SET status = 'Restricted' WHERE id = $1", [TEST_USER.id]);
    try {
      const { status, body } = await login();
      assert.equal(status, 403);
      assert.match(body.message, /restricted/i);
    } finally {
      await getPool().query("UPDATE users SET status = 'Active' WHERE id = $1", [TEST_USER.id]);
    }
  });
});

describe('session enforcement', { skip: SKIP }, () => {
  it('refuses every persistence route without a session', async () => {
    for (const path of ['/api/masters/brands', '/api/products', '/api/users', '/api/artworks', '/api/comparisons']) {
      const { status } = await call('GET', path);
      assert.equal(status, 401, `${path} must not be readable without signing in`);
    }
  });

  it('refuses label extraction without a session', async () => {
    const { status } = await call('POST', '/api/labels/extract');
    assert.equal(status, 401);
  });

  it('leaves /api/health public, because a platform health check has no session', async () => {
    const { status } = await call('GET', '/api/health');
    assert.equal(status, 200);
  });

  it('accepts the session and serves the route', async () => {
    const { body } = await login();
    const { status } = await call('GET', '/api/masters/brands', { token: body.data.token });
    assert.equal(status, 200);
  });

  it('rejects a token that is not a session', async () => {
    const { status } = await call('GET', '/api/masters/brands', { token: 'a'.repeat(43) });
    assert.equal(status, 401);
  });

  it('stops accepting a session after logout', async () => {
    const { body } = await login();
    const token = body.data.token;

    assert.equal((await call('GET', '/api/masters/brands', { token })).status, 200);
    await call('POST', '/api/auth/logout', { headers: { cookie: `imh_lvs_session=${token}` } });
    assert.equal(
      (await call('GET', '/api/masters/brands', { token })).status,
      401,
      'a revoked session must stop working immediately, which is the whole reason sessions are a table'
    );
  });

  it('stops accepting a live session the moment the account stops being Active', async () => {
    const { body } = await login();
    const token = body.data.token;
    assert.equal((await call('GET', '/api/masters/brands', { token })).status, 200);

    await getPool().query("UPDATE users SET status = 'Inactive' WHERE id = $1", [TEST_USER.id]);
    try {
      assert.equal(
        (await call('GET', '/api/masters/brands', { token })).status,
        401,
        'a Manager suspending an account must take effect on that person\'s next request, not when their token expires'
      );
    } finally {
      await getPool().query("UPDATE users SET status = 'Active' WHERE id = $1", [TEST_USER.id]);
    }
  });

  it('reports the signed-in user at /auth/me and 401s without a session', async () => {
    const { body } = await login();
    const me = await call('GET', '/api/auth/me', { token: body.data.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.id, TEST_USER.id);

    assert.equal((await call('GET', '/api/auth/me')).status, 401);
  });
});

describe('the actor is the session, not the caller\'s claim', { skip: SKIP }, () => {
  it('ignores X-Actor-Name entirely', async () => {
    const { body } = await login();

    // The pre-004 API believed this header. Sending it alongside a real
    // session must not change who the write is attributed to — the comparison
    // below is refused for a missing field, but it is refused as the SESSION
    // user, having never consulted the header.
    const { status } = await call('POST', '/api/comparisons', {
      token: body.data.token,
      headers: { 'x-actor-name': 'Somebody Else', 'x-actor-id': 'USR-0001', 'x-actor-role': 'manager' },
      body: {}
    });

    assert.equal(status, 400, 'rejected on the missing productId, not accepted as the claimed actor');
  });

  it('refuses a write that carries the old headers and no session at all', async () => {
    const { status } = await call('POST', '/api/comparisons', {
      headers: { 'x-actor-name': 'Aman Kumar', 'x-actor-id': 'USR-0001', 'x-actor-role': 'manager' },
      body: { productId: 'PRD-0001', newArtworkId: 'ART-0001' }
    });

    assert.equal(
      status,
      401,
      'this exact request used to be accepted and recorded against Aman Kumar — that is the hole this suite exists for'
    );
  });

  it('refuses a workflow decision taken at a stage the signed-in role does not own', async () => {
    const { body } = await login();

    // TEST_USER is account_manager, which owns no stage at all. The Manager
    // stage is not theirs to sign, and claiming otherwise in the body must not
    // help.
    const { status, body: refused } = await call('POST', '/api/comparisons/CMP-0001/decisions', {
      token: body.data.token,
      body: { stage: 'Manager', action: 'Approved', resultingStatus: 'Approved' }
    });

    assert.equal(status, 403);
    assert.match(refused.message, /manager role/i);
  });
});

describe('changing your own password', { skip: SKIP }, () => {
  it('requires the current one, ends the other sessions, and leaves the new password working', async () => {
    const first = await login();
    const second = await login();
    const newPassword = 'a-different-long-password';

    const wrongCurrent = await call('POST', '/api/auth/password', {
      token: first.body.data.token,
      body: { currentPassword: 'not-it', newPassword }
    });
    assert.equal(wrongCurrent.status, 403, 'an unlocked laptop must not be enough to change the credential');

    const changed = await call('POST', '/api/auth/password', {
      token: first.body.data.token,
      body: { currentPassword: TEST_PASSWORD, newPassword }
    });
    assert.equal(changed.status, 200);

    try {
      assert.equal(
        (await call('GET', '/api/auth/me', { token: second.body.data.token })).status,
        401,
        'the other session must end, or the password change locks nobody out'
      );
      assert.equal(
        (await call('GET', '/api/auth/me', { token: changed.body.data.token })).status,
        200,
        'and the caller keeps a working session rather than being signed out of their own browser'
      );
      assert.equal((await login(TEST_EMAIL, newPassword)).status, 200);
      assert.equal((await login()).status, 401, 'the old password must stop working');
    } finally {
      await getPool().query('UPDATE users SET password_hash = $2 WHERE id = $1', [
        TEST_USER.id,
        await hashPassword(TEST_PASSWORD)
      ]);
    }
  });

  it('refuses a new password too short to be worth setting', async () => {
    const { body } = await login();
    const { status } = await call('POST', '/api/auth/password', {
      token: body.data.token,
      body: { currentPassword: TEST_PASSWORD, newPassword: 'short' }
    });
    assert.equal(status, 400);
  });
});
