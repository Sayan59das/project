// Sessions: issuing one at login, resolving one on every subsequent request,
// and ending one on logout or when an account stops being allowed in.
//
// The token itself exists in exactly two places: the response that issues it,
// and the client holding it. This module never stores it and cannot recover
// it — `sessions.token_hash` is a SHA-256, and the lookup hashes the presented
// token to find the row rather than the other way round. That is what makes a
// leaked database dump useless for impersonation, and it is also why there is
// no "show me this user's sessions with their tokens" function to write.

import { Pool, PoolClient } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '../db/pool';
import { AppUser } from '../types/domain';
import { getUserById } from './users.repository';

// See masters.repository.ts for why this is declared locally in every
// repository file instead of imported from one shared place.
export type Queryable = Pick<Pool | PoolClient, 'query'>;

/**
 * 32 bytes of CSPRNG output, base64url — 256 bits, which is well past the
 * point where guessing is the attack anyone would choose.
 *
 * Deliberately carries no structure: no user id, no issue time, no signature.
 * A token that encodes anything is a token whose contents someone will
 * eventually trust without checking the database, and the database is the only
 * thing that knows whether the session is still valid.
 */
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Who a valid session belongs to.
 *
 * The full user record, not just an id: every caller needs the name and role
 * for the audit trail, and re-fetching them per request from three different
 * places is how a stale role ends up in a history row.
 */
export type AuthenticatedActor = {
  sessionId: string;
  user: AppUser;
};

/**
 * Creates a session and returns the token ONCE.
 *
 * The token is in the return value and nowhere else — not logged, not stored,
 * not recoverable afterwards. A caller that loses it has to issue a new one,
 * which is the correct outcome.
 */
export async function issueSession(
  userId: string,
  ttlMs: number,
  db: Queryable = getPool()
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const sessionId = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, userId, hashToken(token), expiresAt]
  );

  return { token, sessionId, expiresAt };
}

/**
 * Resolves a presented token to the person holding it, or undefined.
 *
 * Undefined covers every reason a session is not usable — unknown token,
 * expired, revoked, or an account that is no longer Active — and the caller
 * turns all of them into the same 401. Distinguishing them in the response
 * would tell an attacker which tokens are real, and telling a user "your
 * session is fine but your account was restricted" is a thing the login page
 * can say once they try to sign in again, where the account state is known
 * from a credential they actually proved.
 *
 * THE ACCOUNT STATUS CHECK IS THE POINT OF THE TABLE. A Manager setting
 * someone to Restricted takes effect on that person's very next request,
 * because this runs per request against live rows. See 004_auth.sql for why
 * that ruled out a self-contained signed token.
 */
export async function authenticateSession(
  token: string,
  db: Queryable = getPool()
): Promise<AuthenticatedActor | undefined> {
  const { rows } = await db.query<{ id: string; user_id: string }>(
    `UPDATE sessions
        SET last_seen_at = now()
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()
      RETURNING id, user_id`,
    [hashToken(token)]
  );
  if (!rows[0]) return undefined;

  // One statement, not a SELECT then an UPDATE: the touch and the validity
  // check have to be the same decision, or a session revoked between the two
  // gets one free authenticated request.
  const user = await getUserById(rows[0].user_id, db);

  // A session whose user is not Active is not a session. The row is left
  // alone rather than revoked here — this is a read path, and an account
  // moved back to Active should find its sessions still working rather than
  // having been quietly destroyed by the requests it made while suspended.
  if (!user || user.status !== 'Active') return undefined;

  return { sessionId: rows[0].id, user };
}

/**
 * Ends one session. Idempotent: logging out twice is not an error, and a
 * token that was never valid reports the same success as one that was, for
 * the same reason authenticateSession refuses to distinguish them.
 */
export async function revokeSessionByToken(token: string, db: Queryable = getPool()): Promise<void> {
  await db.query(
    `UPDATE sessions SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)]
  );
}

/**
 * Ends every live session a user has.
 *
 * Called when an account is deactivated or restricted, and when its password
 * changes — a password change that leaves old sessions running does not
 * actually lock anybody out, which is the one thing the person changing it is
 * usually trying to do.
 *
 * Returns how many were ended, so a caller can tell an administrator what
 * their action actually did.
 */
export async function revokeAllSessionsForUser(userId: string, db: Queryable = getPool()): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE sessions SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return rowCount ?? 0;
}

/**
 * Removes rows that can no longer authenticate anyone.
 *
 * Not called on the request path. Expiry is enforced by the WHERE clause in
 * authenticateSession, so a stale row is inert whether or not it has been
 * deleted; this exists to stop the table growing forever and is meant for a
 * scheduled job. `olderThanDays` keeps recently-ended sessions around, because
 * "when did this person last log out" is a question an incident review asks.
 */
export async function deleteFinishedSessions(olderThanDays = 30, db: Queryable = getPool()): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM sessions
      WHERE (expires_at < now() OR revoked_at IS NOT NULL)
        AND greatest(expires_at, coalesce(revoked_at, expires_at)) < now() - ($1 || ' days')::interval`,
    [olderThanDays]
  );
  return rowCount ?? 0;
}
