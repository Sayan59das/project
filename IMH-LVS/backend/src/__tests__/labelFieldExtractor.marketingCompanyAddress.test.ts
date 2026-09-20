// Unit tests for extractMarketingCompany / extractAddress
// (labelFieldExtractor.service.ts), via the public extractLabelFields
// entry point, against hand-built text.
//
// Step 5.5 (accuracy plan): Step 1.2's diff found a systemic bug shared
// by marketing_company AND address across the same ~8 real labels (the
// "Riomedica" template family) — both fields came back wrong with the
// exact same two boilerplate strings every time ('LIC. NO. 10824999000328'
// for marketing_company, 'Pouches not to be sold loose.' for address).
// The real cause, found by dumping this label's actual PDF text layer
// (CALRIO Gummies (2).pdf): this template prints the company name and its
// full address BEFORE the "Marketed By:" anchor line, using the anchor
// only as a trailing attribution whose own next line is a licence number,
// not the company name. The fixture below is that label's real text,
// trimmed to the relevant block, not invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLabelFields } from '../services/labelFieldExtractor.service';

const RIOMEDICA_TEMPLATE_BLOCK = `RIOMEDICA HEALTHCARE PVT. LTD.
(An ISO 9001:2015 Certied Company)
654, Arjun Nagar, Nanhera Road,
Ambala Cantt, Haryana, India
Pincode - 133001
Customer Care: +91 82229 99972
Email: riomedicahealthcare@gmail.com
Marketed By :
LIC. NO. 10824999000328
Pouches not to be sold loose.
Net Content: 30 N`;

test('company name printed BEFORE the "Marketed By" anchor is found, not the licence number after it', () => {
  const fields = extractLabelFields(RIOMEDICA_TEMPLATE_BLOCK);
  assert.equal(fields.marketingCompany, 'RIOMEDICA HEALTHCARE PVT. LTD.');
});

test('the address block above the same anchor is recovered too, not the boilerplate line that follows it', () => {
  const fields = extractLabelFields(RIOMEDICA_TEMPLATE_BLOCK);
  assert.match(fields.address, /654, Arjun Nagar, Nanhera Road/);
  assert.match(fields.address, /Ambala Cantt, Haryana, India/);
  assert.equal(fields.address.includes('Pouches not to be sold loose'), false);
});

test('a pure parenthetical aside between the company name and its address is skipped, not treated as address content', () => {
  const fields = extractLabelFields(RIOMEDICA_TEMPLATE_BLOCK);
  assert.equal(fields.address.includes('ISO 9001'), false);
});

test('the ordinary "Marketed By: <Company>" same-line layout still works unchanged', () => {
  const text = 'Marketed By: ChewNectar Pvt. Ltd.\n42 Health Park, Mumbai, India';
  const fields = extractLabelFields(text);
  assert.equal(fields.marketingCompany, 'ChewNectar Pvt. Ltd.');
});

test('the ordinary "Marketed By:" anchor-then-company-on-next-line layout still works unchanged', () => {
  const text = 'Marketed By:\nChewNectar Pvt. Ltd.\n42 Health Park, Mumbai, India';
  const fields = extractLabelFields(text);
  assert.equal(fields.marketingCompany, 'ChewNectar Pvt. Ltd.');
});

// Step 5 continuation (accuracy plan): a real, recurring wrong-answer
// pattern across several client labels (HSN IRN75-1.pdf and others) --
// "A Division of X Pvt Ltd" sits between the marketing company's own
// name and its real address, and the old address collection treated it
// as the first line of the address instead of skipping it, the same way
// it already skips a parenthetical aside.
test('a corporate-structure line between the company name and its address is skipped, not treated as address content', () => {
  const text = 'Marketed By:\nLXIR Medilabs Pvt Ltd.\nA Division of LXIR Medilabs Pvt Ltd\nPlot No. 70/85/86, Bhatoli Kalan, Baddi (H.P.)';
  const fields = extractLabelFields(text);
  assert.equal(fields.address.includes('Division'), false);
  assert.match(fields.address, /Plot No\. 70\/85\/86/);
});

// Real, minor formatting difference confirmed on a real label (MHJ
// Lutein Domestic IRN165-1.pdf): the PDF's own text layer prints
// "Delhi- 110015" (no space before the hyphen), but the ground truth
// (and every other label) has "Delhi - 110015" -- a purely cosmetic
// difference, not a wrong read.
test('a missing space before a hyphen between a place name and a PIN code is normalized', () => {
  const text = 'Marketed By:\nMHJ Wellness Pvt. Ltd.\nDSM-030/031, DLF Tower, Shivaji Marg, New Delhi- 110015, INDIA';
  const fields = extractLabelFields(text);
  assert.match(fields.address, /New Delhi - 110015/);
});

test('a plot/lot number hyphen with no letters on either side is left alone', () => {
  const text = 'Marketed By:\nDeepar Pharmaceuticals Pvt. Ltd.\nPlot no.- 3/416, Chitrakoot Scheme, Sector No. 3, Jaipur - 302021';
  const fields = extractLabelFields(text);
  assert.match(fields.address, /Plot no\.- 3\/416/);
  assert.match(fields.address, /Jaipur - 302021/);
});
