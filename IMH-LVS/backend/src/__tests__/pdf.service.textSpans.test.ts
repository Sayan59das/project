// extractTextSpans() — the structured, position-aware reading of a PDF's
// text layer that Phase C of the extraction rebuild is built on (see
// README.md's "Extraction rebuild plan"). Unlike extractPdfText() (which
// throws away font size/position once it has flattened everything to a
// string), this keeps them, so a caller can do things like "the biggest
// text on the page is very likely the product name" — impossible from a
// plain string.
//
// Fixtures used:
//  - text-label.pdf: a small synthetic label built specifically to make
//    this easy to verify — "VitaFit" is printed in a visibly larger font
//    than everything else, and every other field is real, known text.
//  - she-arise-gummies.pdf: a real project label (a die-line proof sheet
//    with the front panel repeated six times at different sizes), used to
//    confirm this works against real, messy PDF output — not just a
//    synthetic fixture built to be convenient.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { extractPdfText, extractTextSpans } from '../services/pdf.service';

const FIXTURES = path.join(__dirname, 'fixtures');
const load = (name: string) => readFileSync(path.join(FIXTURES, name));

test('every span carries a positive font size, width and height', async () => {
  const spans = await extractTextSpans(load('text-label.pdf'));
  assert.ok(spans.length > 0);
  for (const span of spans) {
    assert.ok(span.fontSize > 0, `${span.text}: fontSize`);
    assert.ok(span.width > 0, `${span.text}: width`);
    assert.ok(span.height > 0, `${span.text}: height`);
  }
});

test('blank/whitespace-only items are not returned as spans', async () => {
  const spans = await extractTextSpans(load('text-label.pdf'));
  assert.ok(spans.every((span) => span.text.trim().length > 0));
});

test('every span is tagged with its 1-indexed page number', async () => {
  const spans = await extractTextSpans(load('text-label.pdf'));
  assert.ok(spans.every((span) => span.page === 1));
});

test('the largest text on the page is the brand name, not any other field', async () => {
  // The whole point of exposing font size: on a real label the biggest
  // text is almost always the brand/product name, which is exactly the
  // kind of thing plain OCR/text extraction has no way to tell apart from
  // a phone number or an address without this.
  const spans = await extractTextSpans(load('text-label.pdf'));
  const biggest = spans.reduce((max, span) => (span.fontSize > max.fontSize ? span : max));
  assert.equal(biggest.text.trim(), 'VitaFit');
});

test('an unrotated label reports ~0 rotation on every span', async () => {
  const spans = await extractTextSpans(load('text-label.pdf'));
  for (const span of spans) {
    assert.ok(Math.abs(span.rotation) < 0.01, `${span.text}: rotation ${span.rotation}`);
  }
});

test('the FSSAI number appears verbatim in some span, not just the flattened string', async () => {
  const spans = await extractTextSpans(load('text-label.pdf'));
  assert.ok(spans.some((span) => span.text.includes('10023045009876')));
});

test('a real label PDF: the single biggest span is the brand name, not the repeated smaller copies', async () => {
  // she-arise-gummies.pdf is a die-line proof with "She-Arise" repeated six
  // times at different sizes across the sheet (a real, messy case, not a
  // fixture built to be convenient) — the single largest instance is the
  // one that actually matters.
  const spans = await extractTextSpans(load('she-arise-gummies.pdf'));
  const biggest = spans.reduce((max, span) => (span.fontSize > max.fontSize ? span : max));
  assert.equal(biggest.text.trim(), 'She-Arise');
  assert.ok(biggest.fontSize > 35 && biggest.fontSize < 42, `fontSize was ${biggest.fontSize}`);
});

test('a corrupt PDF returns no spans rather than throwing', async () => {
  const spans = await extractTextSpans(load('corrupt.pdf'));
  assert.deepEqual(spans, []);
});

test('extractPdfText is untouched by this addition and still works the same', async () => {
  // extractTextSpans is deliberately a SEPARATE reading of the PDF, not a
  // refactor of extractPdfText onto a shared code path: extractTextSpans
  // merges glyph-runs and drops blank hasEOL markers (noise for a
  // position-aware caller), but extractPdfText's own line-break logic
  // depends on exactly those blank markers to reconstruct blank lines
  // faithfully. Rebuilding one on top of the other risked a silent
  // behavior change for extractPdfText's existing callers; this pins that
  // it still produces the same output.
  const result = await extractPdfText(load('text-label.pdf'));
  assert.ok(result.text.startsWith('VitaFit'));
  assert.ok(result.text.includes('Vitamin C Gummies - Orange Flavour'));
  assert.ok(result.text.includes('Marketed by: ABC Healthcare Pvt Ltd'));
  assert.ok(result.text.includes('FSSAI Lic. No: 10023045009876'));
  assert.ok(result.text.includes('Manufactured by: Some Other Factory Pvt Ltd'));
  assert.equal(result.pageCount, 1);
});

test('extractPdfText still splits the product-name row from the product-form row beneath it', async () => {
  // The exact real-world case pdf.service.ts's own LINE_BREAK_Y_RATIO
  // comment describes: a large product-name row directly above a much
  // smaller product-form row, which pdfjs's own hasEOL flag fails to
  // separate on this fixture.
  const result = await extractPdfText(load('sharp-mind-plus-gummies.pdf'));
  const lines = result.text.split('\n');
  const nameLineIndex = lines.findIndex((line) => line.includes('SHARP MIND PLUS'));
  assert.ok(nameLineIndex >= 0, 'expected a line containing SHARP MIND PLUS');
  assert.ok(!lines[nameLineIndex].includes('GUMMIES'), 'GUMMIES must not be fused onto the same line');
});
