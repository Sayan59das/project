// The rules that decide whether a recovered display heading is trustworthy.
//
// Pure string logic, no OCR — deliberately, because these rules are what stand
// between recovering a brand and storing a wrong one, and they should be
// pinned independently of the recognition passes that feed them.
//
// Every fixture below is real OCR output from the project's dataset
// (IMH-LVS/Dataset Example), with the confidences Tesseract actually returned.
//
// The service these test is NOT currently wired into the extraction pipeline.
// Locating display type works; transcribing stylised type does not yet meet the
// bar, so the integration is parked. See the file header for the findings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHeading } from '../services/displayTextRegion.service';
import type { OcrWord } from '../services/tesseract.service';

/** An OCR word at a nominal position; only text matters to these rules. */
function word(text: string, confidence = 80, index = 0): OcrWord {
  return {
    text,
    confidence,
    bbox: { x0: index * 100, y0: 0, x1: index * 100 + 90, y1: 40 }
  };
}

// The Unicare artwork's brand, and the one case that survives every gate.
test('accepts a heading whose every token reads cleanly', () => {
  assert.equal(cleanHeading([word('Homeo-', 48, 0), word('Vita', 48, 1)]), 'Homeo-Vita');
});

// OCR sets the hyphen as its own glyph, so a hyphenated name arrives split.
// Joining it back is the difference between the brand 'Homeo-Vita' and the
// two-word string 'Homeo- Vita', which would compare as different text.
test('rejoins a name OCR split across a hyphen', () => {
  assert.equal(cleanHeading([word('Homeo', 60, 0), word('-', 60, 1), word('Vita', 60, 2)]), 'Homeo-Vita');
});

// The NutriBears wordmark. 'NUTR!' is 'NUTRI' with the I misread, and 'JF' is a
// glyph cluster that is not a word. All-or-nothing: one junk token means the
// recogniser lost the typeface, so nothing from that block is trusted.
test('rejects the whole heading when any token is garbled', () => {
  assert.equal(cleanHeading([word('NUTR!', 55, 0), word('BEARS', 68, 1), word('JF', 58, 2)]), '');
});

// Salvaging the clean tokens is worse than dropping them: it would yield the
// brand 'BEARS', which is not what the label says and which compares like a
// real value.
test('never salvages the clean tokens out of a garbled heading', () => {
  const salvaged = cleanHeading([word('NUTR!', 55, 0), word('BEARS', 68, 1)]);
  assert.equal(salvaged, '');
  assert.notEqual(salvaged, 'BEARS');
});

// Confidence is deliberately not a gate here, and this is why: on this dataset
// the correct reading scores LOWER than the wrong one. A confidence threshold
// would keep the mistake and discard the answer.
test('does not prefer a confident wrong reading over a hesitant right one', () => {
  const hesitantAndRight = cleanHeading([word('Homeo-', 48, 0), word('Vita', 48, 1)]);
  const confidentAndWrong = cleanHeading([word('NUTR!', 55, 0), word('BEARS', 68, 1), word('JF', 58, 2)]);
  assert.equal(hesitantAndRight, 'Homeo-Vita');
  assert.equal(confidentAndWrong, '');
});

// 'Cel' is a clipped 'Cell' from one of these artworks. A short fragment is
// indistinguishable from a short brand by shape, and this path only runs when
// the field is otherwise absent — so a genuinely short brand is preferred lost
// over a fragment being stored as one.
test('rejects a heading too short to be more than a fragment', () => {
  assert.equal(cleanHeading([word('Cel', 70, 0)]), '');
  assert.equal(cleanHeading([word('UC', 90, 0)]), '');
  // Four letters clears the bar.
  assert.equal(cleanHeading([word('Vita', 70, 0)]), 'Vita');
});

test('rejects a token that is punctuation or digits alone', () => {
  assert.equal(cleanHeading([word('|', 70, 0), word('BEARS', 70, 1)]), '');
  assert.equal(cleanHeading([word('30', 90, 0), word('GUMMIES', 90, 1)]), '');
});

// Short tokens with no vowel are glyph clusters the recogniser could not
// resolve, not words.
test('rejects short vowel-less clusters', () => {
  assert.equal(cleanHeading([word('Fm', 60, 0), word('rm', 60, 1)]), '');
});

test('an empty region yields no heading', () => {
  assert.equal(cleanHeading([]), '');
  assert.equal(cleanHeading([word('   ', 90, 0)]), '');
});

// Real names that must survive, including the punctuation a company name
// legitimately carries.
test('keeps names with legitimate punctuation', () => {
  assert.equal(cleanHeading([word('NutriBears', 70, 0)]), 'NutriBears');
  assert.equal(cleanHeading([word('VitaFit', 70, 0)]), 'VitaFit');
  assert.equal(cleanHeading([word('Nature', 70, 0), word('&', 70, 1), word('Co', 70, 2)]), 'Nature & Co');
});
