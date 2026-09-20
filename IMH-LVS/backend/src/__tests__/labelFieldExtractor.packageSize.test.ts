// Unit tests for extractPackageSize (labelFieldExtractor.service.ts), via
// the public extractLabelFields entry point, against hand-built text — the
// full pipeline's real-artwork behavior is covered elsewhere
// (labels.extract.test.ts, packageSizeOcr.test.ts).
//
// Step 5.1 (accuracy plan): every real diff pair Step 1.2 found showed the
// SAME pattern — the correct number, with its unit word silently dropped
// ("30" instead of "30 Gummies", "30 N" instead of "30 N"... the Net
// Content case is subtler, see below). 35 of 40 wrong package_size answers
// in the real pipeline run were exactly this (STEP1_FAILURE_ANALYSIS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLabelFields } from '../services/labelFieldExtractor.service';

test('a "<number> Gummies" declaration keeps the unit word, not just the bare number', () => {
  // Real pattern: predicted was '30', expected '30 Gummies' on many labels.
  assert.equal(extractLabelFields('Net Weight: 30 Gummies').packageSize, '30 Gummies');
});

test('a "<number> Sticks" declaration keeps its own unit word', () => {
  // Real pattern from Shilajit Honey Sticks / LXIR Shilajit STICK labels:
  // predicted '30', expected '30 Sticks'.
  assert.equal(extractLabelFields('Contains 30 Sticks').packageSize, '30 Sticks');
});

test('a Net Content declaration keeps its own unit token ("N"), not just the number', () => {
  // Real pattern from several Cal. Vit D / Iron / Dr. Chewitals labels:
  // predicted '30', expected '30 N'.
  assert.equal(extractLabelFields('Net Content: 30 N').packageSize, '30 N');
});

test('a Net Content declaration spelled "Nos" keeps that unit token', () => {
  assert.equal(extractLabelFields('Net Qty: 60 Nos').packageSize, '60 Nos');
});

test('irregular OCR spacing around the unit word is normalised to one space', () => {
  assert.equal(extractLabelFields('30Gummies in every pack').packageSize, '30 Gummies');
});

test('still rejects a per-serving dose, not just the total pack count', () => {
  const text = 'Serving Size: 1 Gummy\nNet Content: 30 N';
  assert.equal(extractLabelFields(text).packageSize, '30 N');
});

test('still rejects a daily-dosage instruction, keeping only the real pack count', () => {
  const text = '2 Gummies daily.\nContains 60 Gummies';
  assert.equal(extractLabelFields(text).packageSize, '60 Gummies');
});

test('no confident wording anywhere leaves packageSize blank, as before', () => {
  assert.equal(extractLabelFields('No package size information here.').packageSize, '');
});

// Step 5 follow-up (accuracy plan): a real full 45-label run showed the
// ORIGINAL order (Net Content checked first) was wrong far more often
// than right — 22 of 26 wrong package_size answers were "<N> N" where the
// label's own front-of-pack form-word badge ("<N> Gummies"/"<N> Sticks")
// was the ground truth's actual answer, and both are genuinely printed on
// the same label (confirmed on a real one, Cal. Vit D IRN120-1.pdf: both
// "Net Content: 30 N" and a separate "30\nGUMMIES" badge are really
// there). The user was shown this exact tradeoff — including that it
// would flip Cal. Vit D IRN120-1 itself from correct to wrong — and chose
// to reorder anyway as the better net bet across all 45 labels.
test('prefers the form-word badge over the Net Content declaration when both are printed', () => {
  // Casing kept exactly as printed (the label really does print "GUMMIES"
  // in caps here), same as every other packageSize value — not a bug in
  // this test's assertion, matches the function's own documented behavior.
  const text = 'Net Content: 30 N\n30\nGUMMIES\nSupport for Strong, Healthy Bones and Teeth';
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});

test('still falls back to the Net Content declaration when no form-word badge exists', () => {
  const text = 'Net Content: 30 N\nSupport for Strong, Healthy Bones and Teeth';
  assert.equal(extractLabelFields(text).packageSize, '30 N');
});

// Step 6-prep (accuracy plan follow-up): the first-pass ground-truth review
// found a real, different situation from the Cal. Vit D case above — on a
// handful of labels (Riofill Fe Next, Sleeprio Gummies x2, Femirio
// Gummies), the front-of-pack badge and the label's OWN back-panel numbers
// don't just use different wording for the same count — they give a
// genuinely different NUMBER. "10 GUMMIES" is printed as a badge, but the
// same label's serving-size × servings-per-container math, AND a separate
// Net Content declaration, both independently say 30. Since two
// independent back-panel numbers corroborate each other against one badge
// number, and the badge phrase is an identical generic ribbon reused
// unchanged across otherwise-unrelated product lines (the signature of a
// stale shared design template, not a deliberately-set count), the
// corroborated count wins — but keeps the badge's own real unit word
// ("Gummies"), not the Net Content declaration's bare "N".
test('a badge count contradicted by BOTH the Net Content declaration and the serving-count math is treated as stale, not the real count', () => {
  const text = [
    '10',
    'GUMMIES',
    'RIOFILL fe Next Iron Gummies',
    'Serving Size: 2 Gummies',
    'No. of Serving: per container 15',
    'Net Content: 30 N'
  ].join('\n');
  // Casing kept exactly as printed ("GUMMIES", matching this test's own
  // input badge text), same convention as the sibling badge-wins test
  // above — only the NUMBER is corrected, not the badge's own casing.
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});

test('the same conflict resolves correctly when serving size is 1 (servings-per-container IS the total)', () => {
  const text = [
    '10',
    'GUMMIES',
    'Sleeprio Relax Gummies',
    'Serving Size: 1 Gummy',
    'No. of Serving per container: 30',
    'Net Content: 30 N'
  ].join('\n');
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});

test('a badge count is kept when only the WORDING differs from Net Content, not the number (no serving-math corroboration)', () => {
  // Same shape as the Cal. Vit D IRN120-1 case above, just confirming the
  // new conflict-detection logic does not fire without a genuine number
  // disagreement -- Net Content and the badge already agree on "30" here,
  // so this must behave exactly as before.
  const text = 'Net Content: 30 N\n30\nGUMMIES\nServing Size: 1 Gummy\nNo. of Serving per container: 30';
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});

test('a badge/Net-Content number conflict with no serving-count math to corroborate either side keeps the badge, unresolved', () => {
  // Without the independent second signal, this stays exactly the
  // existing, already-shipped, human-confirmed behavior (badge wins) --
  // the new logic must not become a blanket "prefer Net Content" rule.
  const text = '10\nGUMMIES\nNet Content: 30 N';
  assert.equal(extractLabelFields(text).packageSize, '10 GUMMIES');
});

// Real, confirmed pattern (16 of 45 labels in a full pipeline run, e.g.
// Iron IRN74-1.pdf, HSN IRN75-1.pdf, PMS IRN71-1.pdf): the front-of-pack
// count badge is a circular/stylised graphic whose OCR reading order
// sometimes comes out word-BEFORE-number ("GUMMIES\n30", or jumbled with
// nearby marketing text as "Gummies 30 Tiredness Helps Reduce") rather
// than the number-first shape every existing test above assumes. The
// existing PACKAGE_SIZE_PATTERN only matches number-then-word, so on
// these labels it fell through to the Net Content declaration every
// time -- "30 N" where ground truth wants "30 Gummies". Same badge, same
// real count, just read in the other order.
test('a form-word badge printed word-then-number ("GUMMIES 30") is read the same as number-then-word', () => {
  const text = 'Net Content: 30 N\nGUMMIES\n30\nHelps Reduce Tiredness';
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});

test('word-then-number still rejects a per-serving dose, same guard as the number-first shape', () => {
  const text = 'Serving Size:\nGummy 1\nNet Content: 30 N';
  assert.equal(extractLabelFields(text).packageSize, '30 N');
});

test('word-then-number still rejects a daily-dosage instruction, same guard as the number-first shape', () => {
  const text = 'Gummies 2 daily.\nNet Content: 60 N';
  assert.equal(extractLabelFields(text).packageSize, '60 N');
});

test('number-then-word is still preferred over word-then-number when both somehow appear (the already-tuned shape stays primary)', () => {
  const text = '30 Gummies\nSticks 12';
  assert.equal(extractLabelFields(text).packageSize, '30 Gummies');
});

// Real, confirmed false positive (chyawanprash-gummies.pdf, part of
// labels.extract.test.ts's own fixture set): "GUMMIES" can sit right
// before an entirely UNRELATED number from surrounding draw-order text
// ("...40 + Herbs) GUMMIES 60 NUTRACEUTICAL" -- nothing to do with the
// label's real "Net Content: 30 N" pack count). Unlike the number-first
// shape (already validated to win even on disagreement across the full
// 45-label set), word-then-number is new and unproven, so it's only
// trusted when its count agrees with Net Content -- ANY disagreement
// falls through to Net Content instead, whether or not something else
// happens to corroborate it (see the next test: this fixture's own real
// serving-count math corroborates Net Content's 30 against the
// coincidental "GUMMIES 60" — if this were allowed to take the same
// corroboration-override path the number-first pattern uses, it would
// "fix" the coincidence into "30 GUMMIES", the wrong reason to land on a
// right-shaped answer for the wrong badge).
test('word-then-number is REJECTED (not trusted) when it disagrees with Net Content, even with nothing else in play', () => {
  const text = 'With Goodness Of Ayurvedic 40 + Herbs) GUMMIES 60 NUTRACEUTICAL\nNet Content: 30 N';
  assert.equal(extractLabelFields(text).packageSize, '30 N');
});

test('word-then-number is REJECTED even when serving-count math happens to corroborate Net Content against it (the exact chyawanprash-gummies.pdf shape)', () => {
  const text = [
    'With Goodness Of Ayurvedic 40 + Herbs) GUMMIES 60 NUTRACEUTICAL',
    'Serving Size: 1 Gummy',
    'No. of Serving per container 30',
    'Net Content: 30 N'
  ].join('\n');
  assert.equal(extractLabelFields(text).packageSize, '30 N');
});

test('word-then-number IS trusted when its count agrees with Net Content (the real shape all 16 confirmed labels have)', () => {
  const text = 'Net Content: 30 N\nGUMMIES\n30\nHelps Reduce Tiredness';
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});

test('word-then-number is trusted with no Net Content declared at all (nothing to disagree with)', () => {
  const text = 'GUMMIES\n30\nHelps Reduce Tiredness';
  assert.equal(extractLabelFields(text).packageSize, '30 GUMMIES');
});
