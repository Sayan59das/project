// Shared translation primitives between database rows and API shapes.
//
// There are exactly four mismatches between the two, and every repository
// hits some of them. Keeping the conversions here means they are decided
// once rather than re-improvised per table:
//
//   1. NULL vs ''         — the database distinguishes them, the API does not
//   2. TIMESTAMPTZ vs date string
//   3. 'V3' vs 3          — artwork version
//   4. NULL vs undefined  — optional API fields

/**
 * A stored timestamp as the 'YYYY-MM-DD' string the app displays.
 *
 * Formatted in UTC deliberately. The frontend has always produced these
 * with `new Date().toISOString().slice(0, 10)`, so UTC is the calendar
 * every existing record was written against; formatting in server-local
 * time instead would make the same instant render as a different day
 * depending on where the server happens to run.
 */
export function toDateString(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '';
  // DATE columns are returned as 'YYYY-MM-DD' strings already (see the type
  // parser registered in src/db/pool.ts); TIMESTAMPTZ columns are Dates.
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** A stored timestamp as a full ISO string, for fields that need the time. */
export function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'string' ? value : value.toISOString();
}

/**
 * NULL -> ''. Used for fields the API types as a plain string where absence
 * is represented by the empty string.
 */
export function nullToEmpty(value: string | null | undefined): string {
  return value ?? '';
}

/**
 * '' -> NULL, and trims.
 *
 * This is the direction that matters. Writing '' into a label attribute
 * column violates the CHECK constraint added in migration 001 — on purpose,
 * because storing an empty string as though it were label content is what
 * let the comparison engine report unknown-vs-unknown as a MATCH. Absence
 * is NULL, always.
 */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** NULL -> undefined, for API fields typed as optional rather than ''. */
export function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/** undefined -> NULL, the inverse of nullToUndefined. */
export function undefinedToNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/**
 * 'V3' -> 3.
 *
 * The frontend's own parseVersionNumber regex-extracts the first digit run
 * and returns 0 for anything unexpected, which then sorts as the lowest
 * version — a silent wrong answer. Here an unparseable version is an error,
 * because it is about to be written to a NOT NULL column with a
 * `version_number > 0` CHECK and failing later with a constraint violation
 * tells the caller much less than failing here does.
 */
export function versionToNumber(version: string): number {
  const match = /(\d+)/.exec(version);
  if (!match) {
    throw new Error(
      `Artwork version "${version}" contains no version number. ` +
        'Expected a form like "V1" or "V12".'
    );
  }
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Artwork version "${version}" parsed to ${parsed}, which is not a valid version.`);
  }
  return parsed;
}

/** 3 -> 'V3'. Presentation only; the integer is the truth. */
export function numberToVersion(versionNumber: number): string {
  return `V${versionNumber}`;
}
