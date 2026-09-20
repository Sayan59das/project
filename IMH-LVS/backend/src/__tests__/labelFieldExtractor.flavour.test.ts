// Unit tests for the generic compound-flavour extraction logic in
// labelFieldExtractor.service.ts — using synthetic label text so each case
// runs instantly and isolates the extraction rules themselves (connector-
// aware word capture, dangling-connector line joins, and false-positive
// guards) from real OCR variance. The full pipeline's real-artwork behavior
// (a genuine "Strawberry & Mint" flavour split across two lines by the
// PDF's own layout) is covered by the "She-Arise Gummies" case in
// labels.extract.test.ts; these tests exercise the same underlying
// extractFlavour code path via extractLabelFields, just against hand-built
// text instead of a rasterized/OCR'd document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLabelFields } from '../services/labelFieldExtractor.service';

// The module has no built-in flavour list (it must stay generic — see the
// service's own comment on this). The two anchor-less tiers below only ever
// fire when a caller supplies candidates, so these tests supply their own
// fixture list rather than relying on any production data.
const KNOWN_FLAVOURS_FIXTURE = ['Strawberry', 'Mint', 'Mixed Berry', 'Apple', 'Orange', 'Mango'];

test('compound flavour joined by "&" is captured whole, not just the trailing word', () => {
  const text = 'Strawberry & Mint';
  assert.equal(extractLabelFields(text, { knownFlavours: KNOWN_FLAVOURS_FIXTURE }).flavour, 'Strawberry & Mint');
});

test('compound flavour joined by "&" with the "Flavour" anchor keeps both parts, trailing "Flavour" stripped', () => {
  const text = 'Strawberry & Mint Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Strawberry & Mint');
});

test('two-word descriptive flavour keeps both words when anchored by "Flavour"', () => {
  const text = 'Mixed Berry Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Mixed Berry');
});

test('a single-word flavour with no "Flavour" wording at all still resolves via the known-flavour fallback', () => {
  const text = 'Apple';
  assert.equal(extractLabelFields(text, { knownFlavours: KNOWN_FLAVOURS_FIXTURE }).flavour, 'Apple');
});

test('with no known-flavour candidates supplied, the anchor-less fallback does not fire at all', () => {
  const text = 'Apple';
  assert.equal(extractLabelFields(text).flavour, '');
});

test('"Flavouring" (an ingredient description) is never mistaken for a "<Name> Flavour" statement', () => {
  const text = 'Natural Mint Flavouring';
  assert.notEqual(extractLabelFields(text, { knownFlavours: KNOWN_FLAVOURS_FIXTURE }).flavour, 'Mint');
});

test('a "free from" disclaimer naming a flavour is never read as the product\'s own flavour', () => {
  const text = 'Free from Artificial Flavours';
  assert.notEqual(extractLabelFields(text, { knownFlavours: KNOWN_FLAVOURS_FIXTURE }).flavour, 'Artificial');
});

test('a three-part flavour joined by comma and "&" is captured whole', () => {
  const text = 'Strawberry, Raspberry & Blueberry Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Strawberry, Raspberry & Blueberry');
});

test('a tight compound hyphen forms one flavour name', () => {
  const text = 'Strawberry-Mint Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Strawberry-Mint');
});

test('a spaced dash separating a product name from its flavour is not treated as a compound-word connector', () => {
  const text = 'Vitamin C Gummies - Orange Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Orange');
});

test('a flavour split across two lines by a dangling "&" is joined into one candidate', () => {
  const text = 'Strawberry &\nMint Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Strawberry & Mint');
});

test('a compound flavour spelled with "and" instead of "&" is still captured whole', () => {
  const text = 'Mango and Orange Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Mango And Orange');
});

test('an isolated front-of-pack flavour statement is preferred over the same flavour restated in a dense ingredients sentence', () => {
  const text = [
    'Strawberry & Mint Flavour',
    '',
    'Ingredients: Glucose Syrup, Sugar, Water, Pectin, Citric Acid, Strawberry-Mint Flavour, Natural Colours'
  ].join('\n');
  assert.equal(extractLabelFields(text).flavour, 'Strawberry & Mint');
});

// accuracy3 Step 5: real, dominant flavour bug found across 8 of 22 wrong
// ground-truth cases (Cal. Vit D IRN120-1/2/3/4, Calcimax Pack 30/60,
// Final New-Calcimax 30, CALRIO/Calrio) -- all real client labels whose
// ingredients declaration reads "...Tricalcium Phosphate, Mango &
// Strawberry Flavour..." (Tricalcium Phosphate is a real ingredient --
// a calcium compound -- immediately before the label's own flavour
// statement, itself introduced by a bare comma). NAME_THEN_FLAVOUR_WORD's
// connector-chaining (up to MAX_ADDITIONAL_FLAVOUR_WORDS words, comma
// included) has no way to tell "this leading word is a real ingredient
// name" from "this leading word is one more part of the flavour" purely
// from sentence shape -- confirmed by an EXISTING, already-passing test
// just above ('a three-part flavour joined by comma and "&"') needing the
// exact same shape (word, word & word) to capture ALL THREE parts, so a
// structural fix (e.g. dropping comma as a connector) would silently
// break that real case while fixing this one.
//
// Fixed with a narrow, generic signal instead: common food-chemistry
// compound-name suffixes (Phosphate, Sulphate, Carbonate, Citrate, etc.)
// are never part of a flavour name on any label, in any client's
// product -- an industry-standard naming convention, not this client's
// specific ingredient list. A leading chemical-compound-shaped word run,
// followed by a comma and more content, is trimmed off the captured
// value rather than kept as part of it.
test('a leading chemical-compound ingredient name before a comma is trimmed from the captured flavour -- real bug on Cal. Vit D IRN120 family', () => {
  const text = 'Acidity Regulator (INS 330 & 331i), Tricalcium Phosphate, Mango & Strawberry Flavour and Food Colour: Curcumin.';
  assert.equal(extractLabelFields(text).flavour, 'Mango & Strawberry');
});

test('the same trim applies to a single real flavour word after the chemical compound -- real bug on Calcimax Pack 30/60', () => {
  // The exact real text shape (Calcimax Pack 30 IRN168-2.pdf).
  const text = 'Acidity Regulator [INS 330, & 331(iii)], Tricalcium Phosphate, Strawberry Flavour and Food Colour.';
  assert.equal(extractLabelFields(text).flavour, 'Strawberry');
});

test('other common chemical-compound suffixes are trimmed the same way (generic, not one client\'s specific ingredient)', () => {
  assert.equal(extractLabelFields('Sodium Citrate, Mango Flavour.').flavour, 'Mango');
  assert.equal(extractLabelFields('Calcium Carbonate, Orange Flavour.').flavour, 'Orange');
  assert.equal(extractLabelFields('Potassium Sulphate, Lemon Flavour.').flavour, 'Lemon');
});

test('a genuine three-part flavour with no chemical-compound word is still captured whole (no regression)', () => {
  // Same test as 'a three-part flavour joined by comma and "&"' above,
  // repeated here to pin that the chemical-suffix trim does not fire on
  // ordinary fruit/flavour words that happen to share the same sentence
  // shape.
  const text = 'Strawberry, Raspberry & Blueberry Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Strawberry, Raspberry & Blueberry');
});

test('a chemical-compound word that IS the whole match (no real flavour after it) is left as-is, not trimmed to nothing', () => {
  // Guards against the trim ever producing an empty/blank flavour when
  // there's genuinely nothing else to fall back to in this capture.
  const text = 'Tricalcium Phosphate Flavour';
  assert.equal(extractLabelFields(text).flavour, 'Tricalcium Phosphate');
});
