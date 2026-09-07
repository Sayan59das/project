// Password hashing and verification.
//
// scrypt from node:crypto, deliberately, rather than bcrypt or argon2 from
// npm. Both of those are better-known, and neither is better here:
//
//   - bcrypt/argon2 are native addons. This backend already has to build on a
//     Windows laptop with no toolchain guaranteed, in a Linux container, and
//     on Render, and a password hash that fails to compile is an outage of
//     the login endpoint specifically. bcryptjs avoids the addon by being
//     pure JS and pays for it with an order of magnitude less work per
//     second, which is the one number that must NOT go down.
//   - scrypt is memory-hard, is in the standard library at every Node version
//     this project supports, and adds no dependency to audit.
//
// argon2id would be the better primitive if it were free of the build
// problem. It is not, and the gap between argon2id and correctly-parameterised
// scrypt is far smaller than the gap between either and getting the
// surrounding code wrong.

import { ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// promisify() resolves to the callback overload without options, so the cost
// parameters would be dropped silently if this were left inferred. Naming the
// signature is what keeps N, r and p attached to the call.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>;

/**
 * Work factors, stored WITH each hash rather than read from here at
 * verification time.
 *
 * These are the values a NEW hash is created with. An existing hash carries
 * its own, which is what makes raising them possible at all: turn N up, and
 * passwords already in the database keep verifying against the parameters
 * they were made with while new ones use the higher cost. A single global
 * constant consulted on both paths would invalidate every stored credential
 * the moment it changed.
 *
 * N=16384, r=8 costs roughly 16 MB and ~50-100ms per hash on this class of
 * hardware. The memory figure is the point: it is what makes a GPU array
 * ineffective, and it is why N is the parameter to raise later rather than p.
 */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * `scrypt$N=<n>,r=<r>,p=<p>$<salt>$<derived key>`, both fields base64url.
 *
 * Self-describing on purpose. A bare digest is only verifiable by code that
 * remembers which algorithm and cost produced it, which makes the format
 * impossible to migrate and easy to misidentify in a database dump. The
 * leading algorithm name also means a future move to argon2id can write
 * `argon2id$...` rows alongside these and verify both.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    `N=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p}`,
    salt.toString('base64url'),
    derived.toString('base64url')
  ].join('$');
}

/**
 * Whether `password` produced `stored`.
 *
 * Returns false — never throws — for a hash this function cannot parse. A
 * malformed or truncated row is a credential that cannot be verified, and the
 * answer to "can this person log in" is then no. Throwing would turn one bad
 * row into a 500 that distinguishes it from every other failed login, which is
 * exactly the distinction an attacker probing for interesting accounts wants.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;

  let derived: Buffer;
  try {
    derived = await scryptAsync(password.normalize('NFKC'), parsed.salt, parsed.hash.length, parsed.params);
  } catch {
    // Only reachable via absurd parameters in a corrupt row (an N that
    // exceeds maxmem, say). Same reasoning as above: unverifiable is "no".
    return false;
  }

  // Lengths are equal by construction — derived was requested at
  // parsed.hash.length — but timingSafeEqual throws rather than returning
  // false on a mismatch, so the guard stays.
  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

type ParsedHash = { params: { N: number; r: number; p: number }; salt: Buffer; hash: Buffer };

function parseStoredHash(stored: string): ParsedHash | undefined {
  const parts = stored.split('$');
  if (parts.length !== 4) return undefined;
  const [algorithm, rawParams, rawSalt, rawHash] = parts;
  if (algorithm !== 'scrypt') return undefined;

  const params = { N: 0, r: 0, p: 0 };
  for (const pair of rawParams.split(',')) {
    const [key, value] = pair.split('=');
    if (key !== 'N' && key !== 'r' && key !== 'p') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
    params[key] = parsed;
  }
  if (params.N === 0 || params.r === 0 || params.p === 0) return undefined;

  const salt = Buffer.from(rawSalt, 'base64url');
  const hash = Buffer.from(rawHash, 'base64url');
  if (salt.length === 0 || hash.length === 0) return undefined;

  return { params, salt, hash };
}

/**
 * A password that is refused before it is ever hashed.
 *
 * Length only, and a low bar at that. Composition rules ("one uppercase, one
 * digit, one symbol") are not enforced because they measurably push people
 * toward a small set of predictable shapes; length is the property that
 * actually buys entropy. The floor exists so that a one-character password
 * cannot be set by accident, not as a claim that 10 characters is strong.
 *
 * Returns the reason to show, or undefined when the password is acceptable.
 */
export function rejectWeakPassword(password: string): string | undefined {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 256) return 'Password must be at most 256 characters.';
  return undefined;
}
