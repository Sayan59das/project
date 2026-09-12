// Recognises artwork-template placeholder text so it is never stored as a
// label's real content.
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------
// Not every file in an artwork library is a finished label. Blank templates
// circulate alongside real ones — a die-line for a marketer to fill in, with
// the manufacturer's block already populated and the marketer's block still
// carrying prompts. One is in the project's own dataset ('MULTIVITAMIN &
// MINERALS GUMMY'), and extracting it produced:
//
//   marketingCompany  'Company Name & Logo'
//   address           '(if different from marketeer address)'
//   brand             'Xxxxxxxxxxxxxxxx'
//
// Every one of those is a faithful reading of the text on the page, and every
// one is wrong as a value. That is the dangerous kind of extraction failure:
// an ABSENT field becomes MISSING, which a reviewer is shown and investigates,
// but a placeholder stored as content compares like any other string. Two
// templates would agree on 'Company Name & Logo' and report MATCH; a template
// against a real label would report CONFLICT on a value nobody ever printed.
//
// This is the same defect class as the 'Not specified' placeholder migration
// 001 has a CHECK constraint against — caught one layer earlier, before it can
// reach the database at all.
//
// The rules are patterns of TEMPLATE-NESS, never of specific products, so they
// stay generic per the developer brief: no rule here knows about a brand, a
// company or a product name.

/** Four or more x's is a fill-in blank, not a word. */
const FILLER_RUN = /^[\s.]*[xX]{4,}[\s.]*$/;

/** Ruled fill-in lines: '______', '. . . . .', '-----'. */
const RULE_LINE = /^[\s._\-–—.·]{3,}$/;

/**
 * A value that is entirely a parenthetical.
 *
 * '(if different from marketeer address)' is an instruction to whoever fills
 * the template in. Real field values are not wholly parenthetical — a label
 * that prints a note in brackets prints it alongside the value, not instead
 * of it.
 */
const WHOLLY_PARENTHETICAL = /^\s*[([{][^)\]}]*[)\]}]\s*$/;

/**
 * Text that names a field instead of filling it.
 *
 * Matched against the whole value, normalised — a label whose marketing company
 * is literally the string 'Company Name' is a template, whereas one that prints
 * 'Company Name Foods Pvt. Ltd.' is not, and only the first is caught.
 */
const FIELD_PROMPTS: readonly string[] = [
  'company name',
  'company name logo',
  'company name and logo',
  'brand name',
  'product name',
  'address',
  'complete address',
  'complete address with pincode',
  'customer care phone number',
  'customer care number',
  'consumer care number',
  'email id',
  'email',
  'phone number',
  'contact number',
  'batch no',
  'mfg date',
  'use by',
  'best before',
  'mrp',
  'price',
  'net content',
  'marketed by',
  'manufactured by',
  'packed by',
  'name of the company',
  'insert brand name',
  'insert product name'
];

/**
 * Markers a partially-filled template leaves behind anywhere in the value.
 *
 * Kept deliberately short. Every entry here is text that cannot plausibly be
 * part of a real printed label value, because a loose rule that blanks a
 * genuine value is worse than one that misses a placeholder — the first
 * silently loses label content, the second is caught by a reviewer reading a
 * conspicuously wrong value.
 */
const TEMPLATE_MARKERS: readonly RegExp[] = [
  /\blorem\s+ipsum\b/i,
  /\bto\s+be\s+(filled|decided|confirmed|added)\b/i,
  /\binsert\s+(your|the)?\s*(brand|product|company|name|address|here)\b/i,
  /\byour\s+(brand|company|product)\s+(name|here)\b/i,
  /\bplaceholder\b/i,
  /\bdummy\s+text\b/i,
  /\bsample\s+text\b/i,
  /^\s*(tbd|tba|n\/?a)\s*$/i,
  // Instructions addressed to whoever prepares the artwork, which appear as
  // standalone lines on templates ('Kindly do not add any direct claim').
  /^\s*kindly\s+(do\s+not|note|ensure)\b/i,
  /^\s*(please\s+)?(do\s+not|don't)\s+(add|use|change|edit)\b/i,
  /\bif\s+different\s+from\b/i,
  /\bfor\s+reference\s+(purpose|only)\b/i
];

// ---------------------------------------------------------------------
// OCR garbage
// ---------------------------------------------------------------------

// The second family of text that was read off the page but is not a value.
//
// Stylised display type — a brand wordmark, a product title in a custom face —
// is what OCR reads worst, and when it fails it does not fail silently: it
// returns short fragments. The Unicare artwork's title came back as 'Mc Mc Mg'.
//
// That is the same hazard as a template placeholder. 'Mc Mc Mg' stored as a
// product name compares against a real one and reports CONFLICT over a string
// nobody printed, and against another failed read it could report MATCH. Absent
// is the honest answer, and it surfaces as MISSING for a reviewer to check.
//
// Both rules below are narrow on purpose. Real short names — 'UC', 'VitaFit',
// 'Vitamin C Gummies' — must survive, so a single short token is never garbage
// and a value is only rejected when its shape cannot be a printed name.

/** Tokens worth judging: words, not stray punctuation. */
function wordTokens(value: string): string[] {
  return value.split(/\s+/).filter((token) => /[A-Za-z0-9]/.test(token));
}

/**
 * True when a name-shaped field is OCR debris rather than a name.
 *
 * Only for fields that hold a NAME (brand, product name). Applying it to an
 * address or an ingredients list would be wrong — those legitimately contain
 * runs of short tokens.
 */
export function looksLikeOcrGarbage(value: string): boolean {
  const tokens = wordTokens(value);

  // A single token is never judged. 'UC' is a real brand on one of these
  // labels, and there is no way to tell it from debris by shape alone.
  if (tokens.length < 2) return false;

  // Every token too short to be a word. A printed product name has at least
  // one substantial word in it; 'Mc Mc Mg' has none.
  if (tokens.every((token) => token.replace(/[^A-Za-z0-9]/g, '').length <= 3)) return true;

  // The same token twice in a row — OCR re-reading one glyph cluster, never
  // how a name is printed.
  const normalised = tokens.map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return normalised.some((token, index) => index > 0 && token !== '' && token === normalised[index - 1]);
}

/** Punctuation and spacing removed, for comparing against FIELD_PROMPTS. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when `value` is template scaffolding rather than label content.
 *
 * Callers blank the field instead of storing it, which makes the parameter
 * MISSING — the reviewer's cue to look at the artwork — rather than a value
 * that compares.
 */
export function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false; // Already absent; nothing to decide.

  if (FILLER_RUN.test(trimmed)) return true;
  if (RULE_LINE.test(trimmed)) return true;
  if (WHOLLY_PARENTHETICAL.test(trimmed)) return true;
  if (TEMPLATE_MARKERS.some((marker) => marker.test(trimmed))) return true;

  return FIELD_PROMPTS.includes(normalise(trimmed));
}

/**
 * Blanks every placeholder value in a set of extracted fields.
 *
 * Returns the field names it blanked alongside the cleaned fields, because a
 * label whose values were all placeholders is a template rather than a failed
 * extraction, and the operator uploading it deserves to be told which.
 */
export function scrubPlaceholders<T extends Record<string, string>>(
  fields: T
): { fields: T; blanked: string[] } {
  const blanked: string[] = [];
  const cleaned = { ...fields };

  for (const [key, value] of Object.entries(fields)) {
    // Skip placeholder scrubbing for nutritionTable: it's structured JSON data (from Task 5),
    // not a simple field name, and should not be subject to placeholder detection which is
    // meant for fields like brand, productName, etc. that could be template text.
    if (key === 'nutritionTable') {
      continue;
    }
    if (typeof value === 'string' && isPlaceholderValue(value)) {
      (cleaned as Record<string, string>)[key] = '';
      blanked.push(key);
    }
  }

  return { fields: cleaned, blanked };
}
