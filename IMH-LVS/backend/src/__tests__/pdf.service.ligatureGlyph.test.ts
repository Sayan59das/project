// Unit tests for normalizeKnownLigatureGlyphs (pdf.service.ts).
//
// Step 5 continuation (accuracy plan): a real font-encoding glitch found
// on several client labels (the Cal. Vit D / Iron IRN121 template
// family) -- their actual PDF text reads "Registered ofce" /
// "Corporate ofce", where U+F001 is a Private-Use-Area glyph this
// PDF's font uses for the "fi" ligature with no ToUnicode entry to
// recover the real letters from. Confirmed by dumping the real PDF text
// directly, not invented. Deliberately narrow: replaces the exact known
// word this glyph was confirmed to complete ("office"), not the glyph
// itself wherever it might appear -- a Private-Use-Area code point has
// no fixed meaning across fonts, so guessing it always means "fi" would
// risk corrupting a different label's text in a font that assigns
// U+F001 to something else entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKnownLigatureGlyphs } from '../services/pdf.service';

test('normalizes the known "of<ligature glyph>ce" pattern to "office"', () => {
  const text = 'Registered ofce: B-1/357 Janakpuri, New Delhi - 110058.\nCorporate ofce: NESCO IT Park.';
  const result = normalizeKnownLigatureGlyphs(text);
  assert.equal(result.includes(''), false);
  assert.match(result, /Registered office:/);
  assert.match(result, /Corporate office:/);
});

test('is case-insensitive, matching "Of<glyph>ce" and "OF<glyph>CE" too', () => {
  // The match is case-insensitive; the replacement text is always the
  // lowercase word "office" (only the matched span is replaced, so text
  // around it, like "HEAD", is untouched either way).
  assert.equal(normalizeKnownLigatureGlyphs('Head Ofce'), 'Head office');
  assert.equal(normalizeKnownLigatureGlyphs('HEAD OFCE'), 'HEAD office');
});

test('leaves ordinary text with no glyph completely unchanged', () => {
  const text = 'Marketed By: Neonutriva Healthcare Pvt. Ltd.\nB-53, Krishna Park, Vikas Puri, West, Delhi - 110018 INDIA';
  assert.equal(normalizeKnownLigatureGlyphs(text), text);
});

test('does not touch the word "office" when it is already printed normally', () => {
  const text = 'Registered office: some address here.';
  assert.equal(normalizeKnownLigatureGlyphs(text), text);
});
