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

// Real wrong answer (Calcimax Pack 30/60 IRN168/169-2.pdf, eval/diff.py
// --mode pipeline --field product_name): productName came back as
// "Meyer Organics Pvt. Ltd." -- the label's own marketing company name
// -- instead of "Calcimax Gummies", the real product name printed
// nearby in the same title-candidate block. A company-suffix-shaped
// line is never a real product name, checked independently of whether
// it happens to match the marketingCompany field's own resolved value,
// so this catches the mistake even on a label where marketingCompany
// wasn't resolved from the exact same text.
test('a company-suffix-shaped line is never picked as the product name, even inside the title candidate block', () => {
  const text = `CALCIMAX
GUMMIES
Meyer Organics Pvt. Ltd.

Marketed By:
Meyer Organics Pvt. Ltd.`;
  const fields = extractLabelFields(text);
  assert.notEqual(fields.productName, 'Meyer Organics Pvt. Ltd.');
  assert.match(fields.productName, /Gummies/i);
});

// Real follow-up on the SAME real label: excluding the company name (the
// fix above) surfaced a second real wrong answer sitting right behind it
// in the same candidate block -- "Not To Be Sold Loose", standard Indian
// packaged-goods boilerplate. The old TITLE_BOILERPLATE_LINE/
// ADDRESS_STOP_LINE exclusion already had "to be sold" but anchored to
// the start of the line, so this real "Not..." phrasing slipped past it.
test('boilerplate "Not To Be Sold Loose" is excluded from title candidacy, not just "To Be Sold" on its own', () => {
  const text = `CALCIMAX
GUMMIES
Meyer Organics Pvt. Ltd.
Not To Be Sold Loose

Marketed By:
Meyer Organics Pvt. Ltd.`;
  const fields = extractLabelFields(text);
  assert.notEqual(fields.productName, 'Meyer Organics Pvt. Ltd.');
  assert.notEqual(fields.productName, 'Not To Be Sold Loose');
  assert.match(fields.productName, /Gummies/i);
});
