// Users repository — the reviewer/approver directory (see migration 002 for
// department/phone/user_status, added after 001 modelled a thinner shape).
//
// Unlike products/artworks/masters, this table has no created_by/updated_by
// columns (domain.ts's AppUser has no updatedDate either), so none of these
// functions take an `actor` parameter.
//
// PERMISSIONS. The frontend's AppUser carries a `permissions` object of
// `{ modules, actions }` (src/data/usersStore.ts). Those two halves are not
// alike and are not treated alike here:
//
//   actions — always recomputed from the role by UsersPage on save, with no
//             control that edits it. Derived data; not stored, and storing it
//             would put a stale copy of ROLE_ACTIONS in the database.
//   modules — a Manager ticks and unticks these per user in the Users dialog
//             and the app persists what they chose. Real data, and stored,
//             in user_module_access (migration 003).
//
// What comes back in AppUser.moduleAccess is therefore the OVERRIDES only,
// absent for a user nobody has customised. Callers combine it with the role's
// defaults from src/auth/permissions.ts, which remains the one place that
// policy lives.

import { Pool, PoolClient } from 'pg';
import { getPool, withTransaction } from '../db/pool';
import { emptyToNull, nullToUndefined, toDateString, toIsoString } from './mappers';
import { AppUser, ModuleAccess, UserStatus } from '../types/domain';
import { ConflictError, DomainError } from '../middleware/domainError';

// See masters.repository.ts for why this is declared locally in every
// repository file instead of imported from one shared place.
export type Queryable = Pick<Pool | PoolClient, 'query'>;

// Joins the caller's transaction when already inside one; opens a fresh one
// around `fn` for the default (bare pool) case — see masters.repository.ts's
// inTransaction for the full rationale (id issuance below needs this).
async function inTransaction<T>(db: Queryable, fn: (client: Queryable) => Promise<T>): Promise<T> {
  if (db instanceof Pool) return withTransaction(fn);
  return fn(db);
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

// Same race-safe pattern as the other three repositories — see
// masters.repository.ts's nextSequentialId for the full rationale.
//
// The sequence is read with a regex rather than that helper's
// `substring(id from 5)`, which assumes every id in a table shares one
// 4-character prefix. Users are the one table where that does not hold: the
// app's own directory numbers people 'U-001' (src/data/usersStore.ts) while
// ids issued here are 'USR-0001'. A fixed offset reads 'U-010' as 0 and would
// hand out an id that already exists; the trailing digit run is the sequence
// in both layouts.
async function nextUserId(client: Queryable): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('users_id'))");
  const { rows } = await client.query<{ next_seq: number }>(
    "SELECT coalesce(max(substring(id from '(\\d+)$')::int), 0) + 1 AS next_seq FROM users"
  );
  return `USR-${String(rows[0].next_seq).padStart(4, '0')}`;
}

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string;
  status: UserStatus;
  phone: string | null;
  last_login: Date | null;
  created_at: Date;
  module_access: ModuleAccess | null;
};

const USER_COLUMNS = 'id, full_name, email, role, department, status, phone, last_login, created_at';

// Overrides arrive as one JSON object per user rather than one row per
// (user, module). A join would multiply every user row by up to ten and leave
// the caller to regroup them, and nothing in the app wants a single module's
// flag on its own — it wants the sheet.
//
// jsonb_object_agg over zero rows is NULL, not '{}', which is exactly the
// distinction the domain type draws: no rows means no overrides.
const MODULE_ACCESS_COLUMN = `(
    SELECT jsonb_object_agg(access.module, access.allowed)
      FROM user_module_access access
     WHERE access.user_id = users.id
  ) AS module_access`;

const USER_SELECT = `SELECT ${USER_COLUMNS}, ${MODULE_ACCESS_COLUMN} FROM users`;

function mapUser(row: UserRow): AppUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    department: row.department,
    status: row.status,
    createdDate: toDateString(row.created_at),
    phone: nullToUndefined(row.phone),
    lastLogin: toIsoString(row.last_login),
    moduleAccess: nullToUndefined(row.module_access)
  };
}

export type UserInput = Pick<
  AppUser,
  'fullName' | 'email' | 'role' | 'department' | 'status' | 'phone' | 'moduleAccess'
>;

// email carries the table's only UNIQUE constraint besides the primary key,
// so a 23505 here can only mean a duplicate email — translated into a message
// an API consumer can actually show, rather than the raw "duplicate key value
// violates unique constraint \"users_email_key\"".
//
// 22P02 is a module id that is not in the app_module enum, which a caller
// reaches by sending a typo ('dashbaord') or a module this build does not
// have. Worth naming: the driver's message quotes the enum's internal name
// and says nothing about where the value came from.
function translateUserError(error: unknown, email: string | undefined): unknown {
  if (pgErrorCode(error) === '23505') return new ConflictError(`A user with email "${email}" already exists.`);
  if (pgErrorCode(error) === '22P02') {
    return new DomainError(
      'Unknown module in moduleAccess. Valid modules are the ids in APP_MODULES ' +
        '(src/types/domain.ts); adding one needs a migration extending the app_module enum.'
    );
  }
  return error;
}

// Replaces a user's whole sheet of overrides: a module the caller left out of
// `access` has no override afterwards, which is how a Manager undoes a
// customisation and returns someone to their role's defaults. A caller that
// means "change one flag" must therefore send the full map — the app already
// does, because the Users dialog edits every checkbox as one form.
//
// Two statements over arrays rather than a loop of inserts, so the number of
// round trips does not grow with the number of modules.
async function replaceModuleAccess(userId: string, access: ModuleAccess, client: Queryable): Promise<void> {
  await client.query('DELETE FROM user_module_access WHERE user_id = $1', [userId]);

  const entries = Object.entries(access).filter(
    (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
  );
  if (entries.length === 0) return;

  await client.query(
    `INSERT INTO user_module_access (user_id, module, allowed)
     SELECT $1, entry.module::app_module, entry.allowed
       FROM unnest($2::text[], $3::boolean[]) AS entry(module, allowed)`,
    [userId, entries.map(([module]) => module), entries.map(([, allowed]) => allowed)]
  );
}

export async function listUsers(db: Queryable = getPool()): Promise<AppUser[]> {
  const { rows } = await db.query<UserRow>(`${USER_SELECT} ORDER BY id`);
  return rows.map(mapUser);
}

export async function getUserById(id: string, db: Queryable = getPool()): Promise<AppUser | undefined> {
  const { rows } = await db.query<UserRow>(`${USER_SELECT} WHERE id = $1`, [id]);
  return rows[0] ? mapUser(rows[0]) : undefined;
}

// email is CITEXT, so this lookup is already case-insensitive at the column
// type level — wrapping it in lower() here would be redundant and would stop
// Postgres using the citext-backed unique index for the comparison.
export async function getUserByEmail(email: string, db: Queryable = getPool()): Promise<AppUser | undefined> {
  const { rows } = await db.query<UserRow>(`${USER_SELECT} WHERE email = $1`, [email]);
  return rows[0] ? mapUser(rows[0]) : undefined;
}

export async function createUser(input: UserInput, db: Queryable = getPool()): Promise<AppUser> {
  return inTransaction(db, async (client) => {
    const id = await nextUserId(client);
    try {
      await client.query(
        `INSERT INTO users (id, full_name, email, role, department, status, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, input.fullName, input.email, input.role, input.department, input.status, emptyToNull(input.phone)]
      );
      if (input.moduleAccess) await replaceModuleAccess(id, input.moduleAccess, client);
    } catch (error) {
      throw translateUserError(error, input.email);
    }

    // Read back rather than RETURNING, because the record the caller wants
    // now spans two tables. Same transaction, so this cannot observe a
    // half-written user.
    const created = await getUserById(id, client);
    if (!created) {
      // Internal invariant, not caller error — see comparison.repository.ts.
      throw new Error(`User ${id} could not be read back after insert.`);
    }
    return created;
  });
}

export async function updateUser(
  id: string,
  patch: Partial<UserInput>,
  db: Queryable = getPool()
): Promise<AppUser | undefined> {
  const assignments: Array<[string, unknown]> = [];
  if (patch.fullName !== undefined) assignments.push(['full_name', patch.fullName]);
  if (patch.email !== undefined) assignments.push(['email', patch.email]);
  if (patch.role !== undefined) assignments.push(['role', patch.role]);
  if (patch.department !== undefined) assignments.push(['department', patch.department]);
  if (patch.status !== undefined) assignments.push(['status', patch.status]);
  // '' is how a caller asks to clear phone (never stored as '' — see the
  // CHECK in migration 002); omitting the key entirely leaves it untouched,
  // same as every other field here.
  if (patch.phone !== undefined) assignments.push(['phone', emptyToNull(patch.phone)]);

  if (assignments.length === 0 && patch.moduleAccess === undefined) return getUserById(id, db);

  // Transactional even when only one of the two tables is written: the Users
  // dialog saves a role change and its module sheet as one action, and a role
  // that lands without its overrides — or overrides without their role —
  // grants access nobody chose.
  return inTransaction(db, async (client) => {
    let exists: boolean;

    if (assignments.length > 0) {
      const setSql = assignments.map(([column], index) => `${column} = $${index + 2}`).join(', ');
      try {
        const { rowCount } = await client.query(
          `UPDATE users SET ${setSql}, updated_at = now() WHERE id = $1`,
          [id, ...assignments.map(([, value]) => value)]
        );
        exists = rowCount === 1;
      } catch (error) {
        throw translateUserError(error, patch.email);
      }
    } else {
      // A patch of overrides alone writes no column, so nothing has yet
      // established that the user is real. Asking is not redundant: without it
      // the overrides go to the foreign key, which reports a constraint
      // violation where `undefined` — the answer every other function here
      // gives for an unknown id — is the truth.
      const { rowCount } = await client.query('SELECT 1 FROM users WHERE id = $1', [id]);
      exists = rowCount === 1;
    }

    if (!exists) return undefined;

    if (patch.moduleAccess !== undefined) {
      try {
        await replaceModuleAccess(id, patch.moduleAccess, client);
      } catch (error) {
        throw translateUserError(error, patch.email);
      }
    }

    return getUserById(id, client);
  });
}

// A narrow, single-purpose write — recording a login timestamp is not a
// profile edit, so (like setProductSourceArtwork in product.repository.ts) it
// deliberately leaves updated_at alone rather than making every sign-in look
// like a record update.
export async function recordLogin(id: string, db: Queryable = getPool()): Promise<AppUser | undefined> {
  const { rowCount } = await db.query('UPDATE users SET last_login = now() WHERE id = $1', [id]);
  return rowCount === 1 ? getUserById(id, db) : undefined;
}

/**
 * The stored credential for an email address, for the login path only.
 *
 * Deliberately NOT part of AppUser or USER_SELECT. Every other read in this
 * file returns a record that gets serialised to an API response somewhere, and
 * a password hash that travels inside the ordinary user shape is one
 * forgetful `res.json(user)` away from being published. Keeping it behind its
 * own function means the hash only ever loads where somebody asked for it by
 * name.
 *
 * Returns the row for ANY status, not just Active. Whether a suspended account
 * may log in is an authorisation question the caller answers after the
 * password is verified — checking it here instead would answer it by failing
 * the password comparison, which tells the caller "wrong password" about an
 * account whose password was right.
 */
export type UserCredential = { id: string; status: UserStatus; passwordHash: string | undefined };

export async function getCredentialByEmail(
  email: string,
  db: Queryable = getPool()
): Promise<UserCredential | undefined> {
  const { rows } = await db.query<{ id: string; status: UserStatus; password_hash: string | null }>(
    'SELECT id, status, password_hash FROM users WHERE email = $1',
    [email]
  );
  const row = rows[0];
  return row ? { id: row.id, status: row.status, passwordHash: nullToUndefined(row.password_hash) } : undefined;
}

/**
 * Sets or replaces a user's password.
 *
 * Takes an already-hashed value rather than a plaintext one, so this file
 * never sees a password and cannot log one. Hashing lives in
 * services/password.service.ts; choosing to hash is the caller's decision and
 * the caller is the only place that holds the plaintext.
 *
 * Moves password_updated_at but NOT updated_at, for the same reason
 * recordLogin above leaves it alone: a credential change is not an edit to the
 * directory entry, and conflating them makes "when was this profile last
 * modified" unanswerable.
 *
 * Ending the user's other sessions is NOT done here. It has to happen, but it
 * is a second table and a policy decision (a self-service change should end
 * the others and keep the current one; an administrator's reset should end
 * them all), so it belongs to the route that knows which of those it is.
 */
export async function setPasswordHash(id: string, passwordHash: string, db: Queryable = getPool()): Promise<boolean> {
  const { rowCount } = await db.query(
    'UPDATE users SET password_hash = $2, password_updated_at = now() WHERE id = $1',
    [id, passwordHash]
  );
  return rowCount === 1;
}
