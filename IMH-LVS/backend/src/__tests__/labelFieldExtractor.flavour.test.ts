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
