// The one Postgres connection pool for the process.
//
// Every repository goes through `getPool()` (or runs inside a transaction
// started by `withTransaction`) rather than constructing its own pool, so
// connection limits are respected — Render's free Postgres plan allows very
// few concurrent connections and a pool-per-module design exhausts them
// under trivial load.
//
// The pool is created on FIRST USE, not at import. Label extraction
// (/api/labels/extract) is stateless and stores nothing, so the OCR half of
// this service has to keep working — and its tests keep running — on a
// machine with no database configured at all. Importing a repository must
// therefore never be what opens a connection.

import { Pool, PoolClient, types } from 'pg';
import { env } from '../config/env';

// node-postgres parses DATE (OID 1082) into a JS Date at local midnight,
// which silently shifts a calendar date backwards for anyone west of UTC —
// '2026-01-10' can render as Jan 9. Every date this app stores is a
// calendar date the label and audit trail display verbatim, so keep the
// 'YYYY-MM-DD' string Postgres actually sent. This is registered at module
// load, before any pool exists, because the parser is global to `pg`.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

// BIGINT (OID 20) arrives as a string, because a 64-bit integer does not fit
// in a JS number. The only BIGINTs here are artworks.byte_size and the
// history identity column, both far below Number.MAX_SAFE_INTEGER, so
// converting is safe and saves every caller from remembering to.
types.setTypeParser(types.builtins.INT8, (value: string) => Number(value));

// NUMERIC (OID 1700) arrives as a string for the same exactness reason.
// comparison_parameters.similarity is a 0..1 ratio where float precision is
// entirely adequate.
types.setTypeParser(types.builtins.NUMERIC, (value: string) => Number(value));

let poolInstance: Pool | undefined;

/**
 * The shared pool, created on first call.
 *
 * Throws a directed error rather than a driver-level one when DATABASE_URL
 * is missing, because "password authentication failed for user undefined"
 * is a genuinely confusing way to learn that a .env file was never copied.
 */
export function getPool(): Pool {
  if (poolInstance) return poolInstance;

  if (!env.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set, so this request cannot reach the database. ' +
        'Copy backend/.env.example to backend/.env and set it — the local ' +
        'Docker default is postgres://lvs:lvsdev@localhost:5433/imh_lvs. ' +
        '(Label extraction at /api/labels/extract is stateless and does not ' +
        'need a database; only the persistence routes do.)'
    );
  }

  poolInstance = new Pool({
    connectionString: env.databaseUrl,
    // Hosted Postgres (Render, Neon, Supabase) refuses non-TLS connections;
    // local Docker Postgres has no certificate at all. Explicit rather than
    // inferred from NODE_ENV, because pointing a local build at a hosted
    // database is a normal thing to do and should not need a code change.
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: env.databasePoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  // An idle client dying (network blip, database restart) emits 'error' on
  // the pool. With no listener that is an unhandled 'error' event, which
  // takes the whole process down — while the pool itself would have
  // recovered on the next query.
  poolInstance.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error('[db] idle client error (pool will recover):', error.message);
  });

  return poolInstance;
}

/**
 * Runs `fn` inside a single database transaction, committing on success and
 * rolling back on any thrown error.
 *
 * This exists because several of this app's writes are only correct as a
 * unit. Recording an approval decision updates the comparison's status,
 * appends its audit-history entry, and changes the artwork's status; the
 * frontend does those as three independent localStorage writes today, which
 * is how a comparison can end up reading 'Final Approved' over an artwork
 * that was never approved.
 *
 * Pass the supplied client to every query inside `fn`. A query sent to the
 * shared pool instead borrows a DIFFERENT connection and silently will not
 * be part of the transaction.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let rollbackFailed = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // A failed ROLLBACK must not mask the original error — that is the one
      // the caller needs. The connection is in an unknown state, so it is
      // destroyed below instead of being returned to the pool.
      rollbackFailed = true;
    }
    throw error;
  } finally {
    client.release(rollbackFailed);
  }
}

/** Closes the pool so a script or test process can exit. */
export async function closePool(): Promise<void> {
  if (!poolInstance) return;
  await poolInstance.end();
  poolInstance = undefined;
}
