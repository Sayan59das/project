// Unit tests for labels.controller.ts's loadKnownMasterNames() — the OCR
// candidate-name source for the flavour/claims anchor-less fallback tiers.
// Two things this covers directly against the real test database (no HTTP
// layer needed, loadKnownMasterNames has no session/request dependency):
//   1. Only Active Claims/Flavours seed the candidate list — an Inactive
//      master was deliberately retired and must not resurface as something
//      OCR tries to match against.
//   2. The short TTL cache actually caches — a second call within the TTL
//      window does not re-read rows created after the first call.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env';
import { getPool, closePool } from '../db/pool';
import { flavours, claims } from '../repositories/masters.repository';
import { loadKnownMasterNames, _resetMasterNamesCacheForTests } from '../controllers/labels.controller';

const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — loadKnownMasterNames needs a database';

const ACTOR = 'USR-T-KNOWN-MASTER-NAMES';
const ACTIVE_FLAVOUR = 'ZzTest Active Flavour';
const INACTIVE_FLAVOUR = 'ZzTest Inactive Flavour';
const ACTIVE_CLAIM = 'ZzTest Active Claim';
const INACTIVE_CLAIM = 'ZzTest Inactive Claim';

const createdFlavourIds: string[] = [];
const createdClaimIds: string[] = [];

before(async () => {
  if (SKIP) return;
  const activeFlavour = await flavours.create({ flavourName: ACTIVE_FLAVOUR, status: 'Active' }, ACTOR);
  const inactiveFlavour = await flavours.create({ flavourName: INACTIVE_FLAVOUR, status: 'Inactive' }, ACTOR);
  const activeClaim = await claims.create({ claimText: ACTIVE_CLAIM, description: '', status: 'Active' }, ACTOR);
  const inactiveClaim = await claims.create({ claimText: INACTIVE_CLAIM, description: '', status: 'Inactive' }, ACTOR);
  createdFlavourIds.push(activeFlavour.id, inactiveFlavour.id);
  createdClaimIds.push(activeClaim.id, inactiveClaim.id);
});

after(async () => {
  if (!SKIP) {
    const pool = getPool();
    for (const id of createdFlavourIds) await pool.query('DELETE FROM flavours WHERE id = $1', [id]);
    for (const id of createdClaimIds) await pool.query('DELETE FROM claims WHERE id = $1', [id]);
  }
  await closePool();
});

test('Only Active flavours and claims are included as OCR candidates', { skip: SKIP }, async () => {
  _resetMasterNamesCacheForTests();
  const { knownClaims, knownFlavours } = await loadKnownMasterNames();

  assert.ok(knownFlavours.includes(ACTIVE_FLAVOUR), 'Active flavour should be a candidate');
  assert.ok(!knownFlavours.includes(INACTIVE_FLAVOUR), 'Inactive flavour must not be a candidate');
  assert.ok(knownClaims.includes(ACTIVE_CLAIM), 'Active claim should be a candidate');
  assert.ok(!knownClaims.includes(INACTIVE_CLAIM), 'Inactive claim must not be a candidate');
});

test('A second call within the TTL window is served from cache, not a fresh query', { skip: SKIP }, async () => {
  _resetMasterNamesCacheForTests();
  await loadKnownMasterNames(); // primes the cache

  // Create a new Active flavour AFTER the cache was primed — a genuinely
  // fresh query would see it; a cached result must not.
  const lateFlavour = await flavours.create({ flavourName: 'ZzTest Late Flavour', status: 'Active' }, ACTOR);
  createdFlavourIds.push(lateFlavour.id);

  const { knownFlavours } = await loadKnownMasterNames();
  assert.ok(!knownFlavours.includes('ZzTest Late Flavour'), 'a cached result must not reflect a row created after the cache was primed');

  _resetMasterNamesCacheForTests();
  const { knownFlavours: freshFlavours } = await loadKnownMasterNames();
  assert.ok(freshFlavours.includes('ZzTest Late Flavour'), 'resetting the cache must make the new row visible');
});
