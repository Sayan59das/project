// Unit tests for overlapsMarketingCompany, the guard that keeps a brand/
// product-name candidate line from being (part of) the marketing company's
// own name — via the public extractLabelFields entry point.
//
// Step 5.6 (accuracy plan): found by dumping a real label's actual OCR'd
// text (CALRIO Gummies (2).pdf, not invented — a rotated side panel gets
// OCR'd with "RIOMEDICA" alone on its own short line, separately from the
// fuller "RIOMEDICA HEALTHCARE PVT. LTD." the label's marketingCompany
// already correctly resolves to). The old exclusion check only tested
// "does the candidate line contain the company name" — never true here,
// since the fragment is the SHORTER side — so "RIOMEDICA" alone kept
// slipping through as a false brand candidate even after marketingCompany
// itself was fixed (Step 5.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLabelFields } from '../services/labelFieldExtractor.service';

test('a company-name fragment is excluded from brand candidacy, not just the full company name', () => {
  const text = `RIOMEDICA
CALRIO

Marketed By:
RIOMEDICA HEALTHCARE PVT. LTD.`;
  const fields = extractLabelFields(text);
  assert.equal(fields.marketingCompany, 'RIOMEDICA HEALTHCARE PVT. LTD.');
  assert.notEqual(fields.brand, 'RIOMEDICA');
});

test('a real brand that happens to share no text with its marketing company is unaffected', () => {
  // Real case from this project's own working test fixtures (she-arise-
  // gummies.pdf / chyawanprash-gummies.pdf / apple-cider-vinegar-gummy.pdf):
  // brand "Nutrinol", marketing company "Knoll Pharmaceuticals Ltd." — no
  // overlap either direction, must keep working exactly as before.
  const text = `NUTRINOL

Marketed By:
Knoll Pharmaceuticals Ltd.`;
  const fields = extractLabelFields(text);
  assert.equal(fields.marketingCompany, 'Knoll Pharmaceuticals Ltd.');
  assert.equal(fields.brand, 'Nutrinol');
});

test('a short, unrelated word is not excluded just because it happens to appear inside a long company name', () => {
  // "Cal" (3 chars) is a substring of "Calcimax Nutraceuticals Pvt. Ltd.",
  // but excluding every short fragment that way would be far too eager —
  // guarded to candidates of at least 4 characters.
  const text = `CAL PRO

Marketed By:
Calcimax Nutraceuticals Pvt. Ltd.`;
  const fields = extractLabelFields(text);
  assert.equal(fields.marketingCompany, 'Calcimax Nutraceuticals Pvt. Ltd.');
  assert.equal(fields.brand, 'Cal Pro');
});
