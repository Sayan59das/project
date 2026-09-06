// Migration runner: applies every unapplied file in db/migrations, in
// filename order, exactly once.
//
// Run with `npm run db:migrate`. Safe to run repeatedly — already-applied
// migrations are skipped, so this is what a deploy hook should call.
//
// Deliberately hand-rolled rather than pulling in a migration framework:
// this needs to do three things (order, once-only, atomic), all of which
// Postgres already provides, and a dependency here would be more code to
// audit than the 100 lines it replaces.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { closePool, getPool, withTransaction } from './pool';

// Resolved from this file rather than process.cwd() so `npm run db:migrate`
// behaves the same whether it is invoked from backend/ or from the repo root.
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

type AppliedMigration = { filename: string; checksum: string };

async function ensureBookkeepingTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function readAppliedMigrations(client: PoolClient): Promise<Map<string, string>> {
  const { rows } = await client.query<AppliedMigration>(
    'SELECT filename, checksum FROM schema_migrations'
  );
  return new Map(rows.map((row) => [row.filename, row.checksum]));
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  // Lexicographic order over zero-padded numeric prefixes ('001_', '002_')
  // is the intended order. Anything not matching that pattern is ignored
  // rather than guessed at, so an editor backup or a stray .md in the
  // folder cannot become a migration.
  return entries.filter((name) => /^\d{3,}_.*\.sql$/.test(name)).sort();
}

function checksumOf(sql: string): string {
  // Line endings differ between a Windows checkout and a Linux CI runner,
  // and that difference is not a change to the migration. Normalise before
  // hashing so the same file does not read as edited across platforms.
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  const pool = getPool();
  const setupClient = await pool.connect();
  try {
    await ensureBookkeepingTable(setupClient);
  } finally {
    setupClient.release();
  }

  const files = await listMigrationFiles();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const filename of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = checksumOf(sql);

    // Each migration gets its own transaction, so a failure part-way through
    // a run leaves every earlier migration committed and this one fully
    // rolled back — never half-applied.
    const wasApplied = await withTransaction(async (client) => {
      // Serialises concurrent runners (two deploy hooks, a developer racing
      // CI). The second one blocks here until the first commits, then reads
      // the updated bookkeeping table and correctly skips.
      await client.query('LOCK TABLE schema_migrations IN SHARE ROW EXCLUSIVE MODE');

      const alreadyApplied = await readAppliedMigrations(client);
      const previousChecksum = alreadyApplied.get(filename);

      if (previousChecksum !== undefined) {
        // An applied migration that no longer matches what was applied means
        // history was edited. Applying it again would either fail on
        // duplicate objects or, worse, half-succeed — so stop and make a
        // human decide. The fix is a new migration, not an edit to an old one.
        if (previousChecksum !== checksum) {
          throw new Error(
            `Migration ${filename} has changed since it was applied ` +
              `(recorded ${previousChecksum.slice(0, 12)}, now ${checksum.slice(0, 12)}). ` +
              'Applied migrations are history and must not be edited — add a new ' +
              'migration with the change instead. If this database is disposable, ' +
              'recreate it from scratch.'
          );
        }
        return false;
      }

      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
        filename,
        checksum
      ]);
      return true;
    });

    if (wasApplied) {
      applied.push(filename);
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${filename}`);
    } else {
      skipped.push(filename);
    }
  }

  return { applied, skipped };
}

// Executed directly (`npm run db:migrate`) rather than imported.
if (require.main === module) {
  migrate()
    .then(({ applied, skipped }) => {
      // eslint-disable-next-line no-console
      console.log(
        applied.length === 0
          ? `[migrate] database is up to date (${skipped.length} migration(s) already applied)`
          : `[migrate] done — ${applied.length} applied, ${skipped.length} already up to date`
      );
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[migrate] FAILED:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closePool);
}
