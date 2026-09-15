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
