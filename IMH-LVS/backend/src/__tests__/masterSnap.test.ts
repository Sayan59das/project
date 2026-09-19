// Unit tests for snapToMaster (masterSnap.service.ts) — Step 2 of the
// accuracy2 plan. A pure function: given a candidate string read off a
// label and the client's own master list (real data, not hardcoded — see
// masters.repository.ts / eval/masters.json), decides whether the
// candidate is close enough to one master entry to be that entry, and if
// so, snaps to the MASTER's own spelling (not the candidate's) so two
// labels for the same brand always compare identically regardless of
// which one had a cleaner OCR read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapToMaster } from '../services/masterSnap.service';

const MASTERS = ['BioFaith', 'ChewNectar', 'Calcimax', 'Vit2Fit', 'Sleeprio'];

test('an exact match snaps to the master spelling', () => {
  const result = snapToMaster('BioFaith', MASTERS);
  assert.deepEqual(result, { value: 'BioFaith', score: 1 });
});

test('case-insensitive match still snaps to the master spelling, not the candidate casing', () => {
  const result = snapToMaster('biofaith', MASTERS);
  assert.equal(result?.value, 'BioFaith');
});

test('whole-word containment either way counts as a match', () => {
  // The candidate contains the whole master word plus surrounding noise
  // (a real OCR shape: a badge/wordmark box catches nearby text too).
  const result = snapToMaster('BioFaith Healthcare', MASTERS);
  assert.equal(result?.value, 'BioFaith');
});

test('containment the other way (master contains the shorter candidate) also counts, whole-word only', () => {
  const result = snapToMaster('Chew', ['ChewNectar']);
  // "Chew" is a substring of "ChewNectar" but NOT a whole word inside it
  // (the boundary lands mid-word) -- must NOT match on substring alone.
  assert.equal(result, null);
});

test('a close OCR misread snaps via the Levenshtein-ratio fallback', () => {
  // Real OCR shape from this project's own history: "NUTRINOL" read as
  // "NUTRINOU" by one pass. One character different in an 8-character
  // word is a ratio comfortably above 0.85.
  const result = snapToMaster('NUTRINOU', ['NUTRINOL']);
  assert.equal(result?.value, 'NUTRINOL');
  assert.ok(result!.score >= 0.85);
});

test('a genuinely different word does not snap, even if short', () => {
  const result = snapToMaster('Calrio', ['Calcimax']);
  assert.equal(result, null);
});

test('a hyphen difference is ignored (case- and hyphen-insensitive per the directive)', () => {
  const result = snapToMaster('NovocalKid', ['Novocal-Kid']);
  assert.equal(result?.value, 'Novocal-Kid');
});

test('an empty master list never matches anything', () => {
  assert.equal(snapToMaster('BioFaith', []), null);
});

test('an empty or whitespace-only candidate never matches', () => {
  assert.equal(snapToMaster('', MASTERS), null);
  assert.equal(snapToMaster('   ', MASTERS), null);
});

test('when two masters both plausibly match, the higher-scoring one wins', () => {
  // "Calcimax" is an exact match; "Calrio" only clears the ratio threshold
  // weakly if at all -- exact must win over a same-list fuzzy competitor.
  const result = snapToMaster('Calcimax', ['Calcimax', 'Calrio']);
  assert.equal(result?.value, 'Calcimax');
  assert.equal(result?.score, 1);
});

test('OCR debris well below the ratio threshold does not force a match onto the nearest master', () => {
  const result = snapToMaster('XQZ industrial supply co', MASTERS);
  assert.equal(result, null);
});
