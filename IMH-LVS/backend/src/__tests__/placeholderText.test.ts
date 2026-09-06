// Artwork templates, and the Net Content pack-count declaration.
//
// Both come from running the extractor over the project's own dataset
// (IMH-LVS/Dataset Example) and comparing what it produced against the artwork
// itself. The fixtures below are the real text that caused each fix.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderValue, looksLikeOcrGarbage, scrubPlaceholders } from '../services/placeholderText.service';
import { extractLabelFields } from '../services/labelFieldExtractor.service';

// Every one of these was extracted, faithfully, from the blank template in the
// dataset and offered as a real field value.
test('recognises the placeholder text a blank artwork template leaves behind', () => {
  assert.equal(isPlaceholderValue('Company Name & Logo'), true);
  assert.equal(isPlaceholderValue('Xxxxxxxxxxxxxxxx'), true);
  assert.equal(isPlaceholderValue('XXXXXXXXXXXXXXX'), true);
  assert.equal(isPlaceholderValue('(if different from marketeer address)'), true);
  assert.equal(isPlaceholderValue('Complete Address with Pincode'), true);
  assert.equal(isPlaceholderValue('Customer care phone number'), true);
  assert.equal(isPlaceholderValue('email id'), true);
  assert.equal(isPlaceholderValue('_______'), true);
  assert.equal(isPlaceholderValue('TBD'), true);
});

// The dangerous direction. A rule loose enough to blank a real value silently
// loses label content, which is worse than missing a placeholder — a
// conspicuously wrong value gets caught by the reviewer reading it.
test('leaves real label values alone', () => {
  assert.equal(isPlaceholderValue('Azveston Healthcare Pvt. Ltd.'), false);
  assert.equal(isPlaceholderValue('IM Healthcare Pvt. Ltd.'), false);
  assert.equal(isPlaceholderValue('NutriBears'), false);
  assert.equal(isPlaceholderValue('Homeo-Vita'), false);
  assert.equal(isPlaceholderValue('care@imhealthcare.com'), false);
  assert.equal(isPlaceholderValue('10023045001234'), false);
  assert.equal(isPlaceholderValue('Strawberry & Orange'), false);
  // Contains a field-prompt phrase but is not one — only a whole-value match
  // counts, so a company that happens to be named this way survives.
  assert.equal(isPlaceholderValue('Company Name Foods Pvt. Ltd.'), false);
  // A parenthetical alongside a value, rather than instead of one.
  assert.equal(isPlaceholderValue('Vitamin C (as ascorbic acid)'), false);
});

test('an already-absent field is not a placeholder', () => {
  assert.equal(isPlaceholderValue(''), false);
  assert.equal(isPlaceholderValue('   '), false);
});

test('blanks placeholders and reports which fields they were', () => {
  const { fields, blanked } = scrubPlaceholders({
    marketingCompany: 'Company Name & Logo',
    address: '(if different from marketeer address)',
    brand: 'Xxxxxxxxxxxxxxxx',
    flavour: 'Lemon & Strawberry',
    manufacturingCompany: 'IM Healthcare Pvt. Ltd.'
  });

  assert.equal(fields.marketingCompany, '');
  assert.equal(fields.address, '');
  assert.equal(fields.brand, '');
  // Untouched — these are real.
  assert.equal(fields.flavour, 'Lemon & Strawberry');
  assert.equal(fields.manufacturingCompany, 'IM Healthcare Pvt. Ltd.');
  assert.deepEqual(blanked.sort(), ['address', 'brand', 'marketingCompany']);
});

// 'Net Content: 30 N' is the count declaration Indian supplement labels carry,
// and all three dataset artworks use it. Before this, the pack count fell
// through to OCR of the stylised front badge, which read a pack of 30 as '9'.
test('reads the pack count from the Net Content declaration', () => {
  assert.equal(extractLabelFields('Pouches not to be sold loose.\nNet Content: 30 N').packageSize, '30');
  assert.equal(extractLabelFields('Net Content : 30 N').packageSize, '30');
  assert.equal(extractLabelFields('Net Qty: 60 Nos').packageSize, '60');
  assert.equal(extractLabelFields('Net Quantity: 12 units').packageSize, '12');
});

// The unit alternation is what keeps this a count. A weight or volume
// declaration must not be read as a pack of that many.
test('never reads a weight or volume declaration as a pack count', () => {
  assert.equal(extractLabelFields('Net Content: 100 g').packageSize, '');
  assert.equal(extractLabelFields('Net Quantity: 250 ml').packageSize, '');
  assert.equal(extractLabelFields('Net Wt.: 75 gm').packageSize, '');
});

// The trailing word boundary matters: without it the 'n' of 'Nutritional'
// would satisfy the counting-unit alternation.
test('does not mistake a following word starting with n for the N unit', () => {
  assert.equal(extractLabelFields('Net Content: 30 Nutritional Information').packageSize, '');
});

// The existing '<number> Gummies' wording still works, and still refuses a
// serving size — 'Serving size: 1 Gummy' is a dose, not a pack.
test('keeps the existing pack-count wording and its serving-size guard', () => {
  assert.equal(extractLabelFields('30 Gummies').packageSize, '30');
  assert.equal(extractLabelFields('Serving size: 1 Gummy').packageSize, '');
});

// Stylised display type is what OCR reads worst, and when it fails it returns
// short fragments rather than nothing. The Unicare artwork's title came back as
// 'Mc Mc Mg' — which would compare against a real product name and report a
// CONFLICT over a string nobody printed.
test('rejects OCR debris from stylised display type', () => {
  assert.equal(looksLikeOcrGarbage('Mc Mc Mg'), true);
  assert.equal(looksLikeOcrGarbage('Mc Mc'), true);
  assert.equal(looksLikeOcrGarbage('a b c'), true);
  assert.equal(looksLikeOcrGarbage('VitaFit VitaFit'), true);
});

// The rules are narrow on purpose: a real name wrongly blanked is silent data
// loss, which is worse than debris a reviewer can see is wrong.
test('keeps real names, including short ones', () => {
  assert.equal(looksLikeOcrGarbage('Vitamin C Gummies'), false);
  assert.equal(looksLikeOcrGarbage('NutriBears'), false);
  assert.equal(looksLikeOcrGarbage('Homeo-Vita'), false);
  assert.equal(looksLikeOcrGarbage('MULTIVITAMIN & MINERALS GUMMY'), false);
  assert.equal(looksLikeOcrGarbage('Apple Cider Vinegar Gummy'), false);
  // A single short token is never judged — 'UC' is a real brand on one of
  // these labels and nothing about its shape distinguishes it from debris.
  assert.equal(looksLikeOcrGarbage('UC'), false);
  assert.equal(looksLikeOcrGarbage('B12'), false);
});
