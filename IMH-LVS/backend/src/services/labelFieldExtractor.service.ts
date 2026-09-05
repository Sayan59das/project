// Parses raw OCR/PDF-text-layer text into the label fields using regex,
// keyword-anchor, and positional heuristics. Never guesses: any field that
// isn't confidently matched is left as an empty string rather than filled
// with a best-effort guess — this is a hard rule, not a preference, per
// the "OCR confidence vs field extraction confidence" distinction: OCR (or
// the PDF's own text layer) can produce perfectly correct text and this
// module can still — correctly — decide it has no confident match for a
// given field.
import { FIXED_MANUFACTURING_COMPANY } from '../config/constants';

// Temporary, opt-in debug tracing (see env.LABEL_EXTRACTION_DEBUG) — logs
// which anchor/pattern each field matched, or why it didn't, to help
// diagnose a real label that isn't extracting as expected. Off by default;
// never enabled implicitly.
let debugEnabled = false;
export function setLabelFieldExtractorDebug(enabled: boolean): void {
  debugEnabled = enabled;
}
function debugLog(message: string): void {
  if (debugEnabled) console.log(`[labelFieldExtractor] ${message}`);
}

export type ExtractedLabelFields = {
  marketingCompany: string;
  address: string;
  fssaiNumber: string;
  email: string;
  customerCareNumber: string;
  brand: string;
  flavour: string;
  productName: string;
  packageSize: string;
};

function emptyFields(): ExtractedLabelFields {
  return {
    marketingCompany: '',
    address: '',
    fssaiNumber: '',
    email: '',
    customerCareNumber: '',
    brand: '',
    flavour: '',
    productName: '',
    packageSize: ''
  };
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// Strips a "Label prefix:" (e.g. "Marketed by:") off the front of a line,
// returning just the value that follows it, if the prefix is present.
function stripLabelPrefix(line: string, prefixPattern: RegExp): string | null {
  const match = line.match(prefixPattern);
  if (!match) return null;
  return line.slice(match[0].length).trim();
}

// ---------------------------------------------------------------------
// Manufacturing- vs marketing-context disambiguation.
//
// Real labels frequently print TWO of the same kind of value (e.g. two
// FSSAI numbers: the manufacturer's and the marketing company's) with no
// reliable line-order guarantee once text has gone through OCR or a PDF's
// own (sometimes column-scrambled) text layer. Rather than trusting "first
// match wins", candidates are scored by which anchor phrase — a
// manufacturing one or a marketing one — is physically closer to them in
// the text, and a candidate closer to a manufacturing anchor is rejected,
// since manufacturingCompany (and everything tied to it) is never sourced
// from OCR.
// ---------------------------------------------------------------------
const MANUFACTURING_CONTEXT_PATTERN = /manufactured\s+by|manufacturing\s+company|mfd\.?\s+by|mfg\.?\s+by/gi;
const MARKETING_CONTEXT_PATTERN =
  /marketed\s*(?:in\s*india\s*)?(?:&|and)?\s*distributed\s*by|marketed\s*in\s*india\s*by|marketed\s*by|manufactured\s*\/?\s*marketed\s*by|manufactured\s+for|mfd\.?\s+for|mfg\.?\s+for|distributed\s+by|customer\s*care|consumer\s*care|helpline|toll[\s-]?free|registered\s*office|regd\.?\s*office/gi;

function findAllIndices(text: string, globalPattern: RegExp): number[] {
  const re = new RegExp(globalPattern.source, globalPattern.flags.includes('g') ? globalPattern.flags : `${globalPattern.flags}g`);
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    indices.push(match.index);
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return indices;
}

function nearestDistance(indices: number[], pos: number): number {
  if (indices.length === 0) return Infinity;
  let min = Infinity;
  for (const index of indices) {
    const distance = Math.abs(index - pos);
    if (distance < min) min = distance;
  }
  return min;
}

// Index of the closest anchor at or before `pos`, or -Infinity if none
// precedes it. Labels are organized in sequential sections (a heading
// anchor, then its associated details, until the next heading) — the most
// recent anchor *before* a candidate reliably tells us which section it's
// in. A plain nearest-in-either-direction distance was tried first and
// mis-classified candidates sitting in a short section immediately
// followed by a different, closer section header (e.g. a short
// manufacturer block right before "Marketed in India by:").
function nearestPrecedingIndex(indices: number[], pos: number): number {
  let nearest = -Infinity;
  for (const index of indices) {
    if (index <= pos && index > nearest) nearest = index;
  }
  return nearest;
}

function isCloserToManufacturing(text: string, pos: number): boolean {
  const mfgNearest = nearestPrecedingIndex(findAllIndices(text, MANUFACTURING_CONTEXT_PATTERN), pos);
  const mktNearest = nearestPrecedingIndex(findAllIndices(text, MARKETING_CONTEXT_PATTERN), pos);
  if (mfgNearest === -Infinity) return false; // no manufacturing anchor precedes it at all
  if (mktNearest === -Infinity) return true; // only a manufacturing anchor precedes it
  return mfgNearest > mktNearest; // whichever anchor is more recent (nearer from behind) governs this candidate
}

// ---------------------------------------------------------------------
// Shared noise/confidence gate for short values read off OCR text —
// marketing company names and address lines. Real labels sometimes OCR
// into a single reconstructed "line" that fuses a genuine anchor (e.g.
// "Marketed in India by:") together with unrelated nearby content: a
// garbled icon/badge graphic, or a whole unrelated sentence from a
// different part of the label that ended up on the same text line because
// OCR's page-segmentation read a dense, multi-column layout out of order.
// Rather than accept whatever text follows an anchor, or reject the whole
// line outright, this trims a candidate down to its clean leading portion
// (stopping at the first noise character or the first sign of unrelated
// content — ingredient/nutrition vocabulary, for instance) and then
// verifies what's left doesn't still look like noise, so a fused line
// still yields a real value when one is genuinely present in it, and
// yields nothing at all when it doesn't — "uncertain = blank, never
// guessed" applies here exactly as everywhere else.
// ---------------------------------------------------------------------
const NOISE_CHAR_PATTERN = /[[\]{}~^|®©™_¥§£]|—|–/;
// Vocabulary that only ever appears in ingredient/nutrition copy — a
// company-name or address candidate that runs into one of these has
// crossed into unrelated content, so everything from that word onward is
// discarded rather than kept.
const OFF_TOPIC_VOCABULARY =
  /\b(ingredients?|acidity|regulator|vinegar|colou?r|concentrate|extract|sweetener|stevia|folic|carbohydrate|nutritional|calcium|vitamin|mcg|kcal|allerg(?:en|y)|gluten|dietary|fibre|fiber|protein|sodium|calorie)\b/i;

// A handful of short tokens that are legitimately part of a company name
// or address (abbreviations, connectors, unit-like numbers) and must not
// count against a candidate the way an arbitrary 1-2 letter OCR fragment
// (like a mis-read icon) does.
const ALLOWED_SHORT_TOKENS = new Set(['&', 'ltd', 'pvt', 'llp', 'inc', 'co', 'of', 'in', 'by', 'for', 'the', 'and', 'to', 'no', 'p.o', 'po', 'rd', 'st']);

// Returns the clean leading portion of `line` (up to but not including the
// first noise character or off-topic word) plus whether a genuine cut
// actually happened — distinct from ordinary trailing punctuation being
// trimmed off a clean line, which is not a sign of noise and must not by
// itself signal "this line ran into unrelated content".
function truncateAtFirstNoise(line: string): { value: string; wasTruncated: boolean } {
  let cutIndex = line.length;
  const noiseMatch = NOISE_CHAR_PATTERN.exec(line);
  if (noiseMatch) cutIndex = Math.min(cutIndex, noiseMatch.index);
  const offTopicMatch = OFF_TOPIC_VOCABULARY.exec(line);
  if (offTopicMatch) cutIndex = Math.min(cutIndex, offTopicMatch.index);
  const wasTruncated = cutIndex < line.trimEnd().length;
  const value = line
    .slice(0, cutIndex)
    .trim()
    .replace(/[,;:\-–—]+$/, '')
    .trim();
  return { value, wasTruncated };
}

// Fraction of "words" in the text that look like OCR noise (a fragment
// too short to be a real word and not one of the allowed short tokens, or
// a token that's pure punctuation once letters/digits are stripped out).
function garbageTokenRatio(text: string): number {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  let badCount = 0;
  for (const token of tokens) {
    const clean = token.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length === 0) {
      badCount += 1;
    } else if (clean.length <= 2 && !/^\d+$/.test(clean) && !ALLOWED_SHORT_TOKENS.has(token.toLowerCase().replace(/[.,]/g, ''))) {
      badCount += 1;
    }
  }
  return badCount / tokens.length;
}

const MAX_GARBAGE_RATIO = 0.3;

// Truncates a raw OCR line to its clean leading portion and returns it —
// along with whether real noise/off-topic content was cut off — only if
// what remains is long enough and clean enough to trust; null otherwise,
// meaning the caller should treat this candidate as unusable.
function sanitizeCandidateLine(rawLine: string, maxLength: number): { value: string; wasTruncated: boolean } | null {
  const { value, wasTruncated } = truncateAtFirstNoise(rawLine);
  if (value.length < 3 || value.length > maxLength) return null;
  if (garbageTokenRatio(value) > MAX_GARBAGE_RATIO) return null;
  return { value, wasTruncated };
}

// ---------------------------------------------------------------------
// Marketing Company / Party
// ---------------------------------------------------------------------
// Shared phrase set for both line-anchored matching (below) and, unanchored,
// for locating an approximate on-page position to target with region-based
// OCR (see labelExtraction.service.ts) — exported so both call sites stay
// in sync with a single source of truth for what counts as a
// marketing-company anchor phrase.
export const MARKETING_ANCHOR_PHRASES =
  /marketed\s*(?:in\s*india\s*)?(?:&|and)?\s*distributed\s*by|marketed\s*in\s*india\s*by|marketed\s*by|manufactured\s*\/?\s*marketed\s*by|manufactured\s*for|mfd\.?\s*for|mfg\.?\s*for|distributed\s*by/i;
const MARKETING_COMPANY_PREFIX = new RegExp(`^(${MARKETING_ANCHOR_PHRASES.source}|company\\s*name)\\s*[:\\-]?\\s*`, 'i');
const MANUFACTURING_KEYWORDS = /manufactured\s*by|manufacturing\s*company|mfd\.?\s*by|mfg\.?\s*by/i;
// Lower-confidence fallback for a bare "For <Company>" line (common on
// Indian labels) — only accepted when the remainder clearly names a
// company (a Ltd/Pvt/LLP/etc. suffix), so an ordinary sentence that
// happens to start with "For" (e.g. "For external use only") is never
// mistaken for this.
const FOR_COMPANY_LINE = /^for\s*[:\-]?\s*(.+?(?:ltd\.?|pvt\.?\s*ltd\.?|limited|llp|inc\.?|co\.?))\.?$/i;

// A handful of well-known company-suffix abbreviations are prone to a
// specific, predictable OCR character confusion at the exact same position
// every time (e.g. "Ltd." misread as "Lid." — the lowercase "t" reads as an
// "i" when its crossbar is faint/thin, particularly in bold display text).
// This is intentionally narrow: it only fires on the standalone trailing
// suffix token of an already-identified company name, never mid-word or
// mid-sentence, and is not specific to any one company — the same
// correction applies wherever this exact suffix confusion occurs.
const COMPANY_SUFFIX_OCR_FIXES: [RegExp, string][] = [[/\bLid\.?$/i, 'Ltd.']];

function normalizeCompanySuffix(value: string): string {
  for (const [pattern, replacement] of COMPANY_SUFFIX_OCR_FIXES) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value;
}

function extractMarketingCompany(lines: string[]): { value: string; lineIndex: number } {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "Manufactured/Marketed by" lines name the marketing company even
    // though the line also mentions manufacturing — matched by the prefix
    // pattern above. A line that ONLY says "Manufactured by" (no mention of
    // marketing) is the manufacturing company and must be skipped, since
    // manufacturingCompany is never derived from OCR.
    if (MANUFACTURING_KEYWORDS.test(line) && !MARKETING_COMPANY_PREFIX.test(line)) continue;

    const prefixMatch = line.match(MARKETING_COMPANY_PREFIX);
    if (!prefixMatch) continue;

    const sameLineRaw = line.slice(prefixMatch[0].length).trim();
    if (sameLineRaw) {
      const sanitized = sanitizeCandidateLine(sameLineRaw, 60);
      if (sanitized) {
        const value = normalizeCompanySuffix(sanitized.value);
        debugLog(`marketingCompany: matched "${value}" from line "${line}"`);
        return { value, lineIndex: i };
      }
      debugLog(`marketingCompany: rejected "${sameLineRaw}" from line "${line}" — fails the noise/length sanity gate.`);
    }

    // The anchor is on its own line ("Marketed in India by:") with the
    // company name on the next line — common when a design's stacked
    // text gets OCR'd or extracted as separate lines.
    const nextLine = lines[i + 1];
    if (nextLine && !MANUFACTURING_KEYWORDS.test(nextLine)) {
      const sanitized = sanitizeCandidateLine(nextLine, 60);
      if (sanitized) {
        const value = normalizeCompanySuffix(sanitized.value);
        debugLog(`marketingCompany: matched "${value}" from the line following anchor "${line}"`);
        return { value, lineIndex: i + 1 };
      }
      debugLog(`marketingCompany: rejected "${nextLine}" following anchor "${line}" — fails the noise/length sanity gate.`);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (MANUFACTURING_KEYWORDS.test(line)) continue;
    const match = line.match(FOR_COMPANY_LINE);
    if (match) {
      const sanitized = sanitizeCandidateLine(match[1].trim(), 60);
      if (sanitized) {
        const value = normalizeCompanySuffix(sanitized.value);
        debugLog(`marketingCompany: matched "${value}" via bare "For <Company>" fallback from line "${line}"`);
        return { value, lineIndex: i };
      }
    }
  }

  debugLog('marketingCompany: no confident anchor found — leaving blank.');
  return { value: '', lineIndex: -1 };
}

// ---------------------------------------------------------------------
// Address — the marketing company's, never the manufacturer's.
// ---------------------------------------------------------------------
const ADDRESS_PREFIX = /^address\s*[:\-]?\s*/i;
const REGISTERED_OFFICE_PREFIX = /^(registered\s*office|regd\.?\s*office)\s*[:\-]?\s*/i;
const ADDRESS_STOP_LINE =
  /^(fssai|customer\s*care|consumer\s*care|helpline|toll[\s-]?free|batch|mfg\.?\s*(date|by)|use\s*by|m\.?r\.?p\.?|manufactured|net\s*(content|wt)|ingredients|nutritional\s*information|to\s*be\s*sold|not\s*for\s*medicinal|recommended\s*usage|health\s*supplement)/i;

function extractAddress(lines: string[], emailPattern: RegExp, marketingCompanyLineIndex: number): string {
  for (const line of lines) {
    if (MANUFACTURING_KEYWORDS.test(line)) continue;
    const value = stripLabelPrefix(line, ADDRESS_PREFIX);
    if (value) {
      debugLog(`address: matched "${value}" via "Address:" prefix from line "${line}"`);
      return value;
    }
  }

  for (const line of lines) {
    if (MANUFACTURING_KEYWORDS.test(line)) continue;
    const value = stripLabelPrefix(line, REGISTERED_OFFICE_PREFIX);
    if (value) {
      debugLog(`address: matched "${value}" via "Registered Office" prefix from line "${line}"`);
      return value;
    }
  }

  // Common layout: the marketing company's name is immediately followed by
  // its address across 1-3 lines, until the next section starts. Preserve
  // the complete block rather than a single line. Each line is put through
  // the same noise/confidence gate used for the marketing company itself —
  // a dense, multi-column label can OCR an address line fused with
  // unrelated content, and stopping at the first line that fails the gate
  // (rather than skipping it and continuing further into the document)
  // avoids drifting into content that only coincidentally looks clean.
  if (marketingCompanyLineIndex >= 0) {
    const collected: string[] = [];
    for (let i = marketingCompanyLineIndex + 1; i < lines.length && collected.length < 4; i++) {
      const line = lines[i];
      if (ADDRESS_STOP_LINE.test(line) || emailPattern.test(line) || MANUFACTURING_KEYWORDS.test(line)) break;

      const sanitized = sanitizeCandidateLine(line, 80);
      if (!sanitized) {
        debugLog(`address: stopped collecting at line "${line}" — fails the noise/length sanity gate.`);
        break;
      }
      collected.push(sanitized.value);
      // A line that had to be truncated (real noise or unrelated content
      // followed the clean part, as opposed to just trailing punctuation
      // being trimmed) marks the end of the address section — don't keep
      // reading further lines past it.
      if (sanitized.wasTruncated) break;
    }
    if (collected.length > 0) {
      const value = collected.join(', ');
      debugLog(`address: matched "${value}" from the lines following the identified marketing company.`);
      return value;
    }
  }

  debugLog('address: no confident anchor found — leaving blank.');
  return '';
}

// ---------------------------------------------------------------------
// FSSAI Number — always exactly 14 digits, preserved as printed (digits
// only). Handles the common real-world case of two FSSAI numbers on one
// label (manufacturer's + marketing company's) by rejecting whichever
// candidate sits closer to a manufacturing anchor.
// ---------------------------------------------------------------------
// "FSSAI" is the primary anchor, but some labels print the number after
// "Lic. No."/"License No." instead of the word "FSSAI" itself (the FSSAI
// logo/wordmark is sometimes a graphic that doesn't survive text
// extraction while the adjacent printed number does). This is safe to
// widen because the strict-14-digit validation below still applies — a
// non-FSSAI license number (a drug/AYUSH license like "T-2304/Ayur", for
// example) is never a clean 14-digit run, so it can never match here
// regardless of which anchor phrase precedes it.
const FSSAI_LABELED_PATTERN = /(?:fssai(?:\s*(?:no\.?|number|lic\.?|license))?|lic\.?\s*no\.?|license\s*no\.?)[^0-9]{0,60}?(\d[\d\s-]{10,20}\d)/gi;
const BARE_14_DIGIT_PATTERN = /\b(\d{14})\b/g;
const CUSTOMER_OR_EMAIL_CONTEXT_PATTERN = /customer\s*care|consumer\s*care|helpline|toll[\s-]?free|email|e-mail/gi;
const BARE_NUMBER_CONTEXT_WINDOW = 40;

function normalizeFssaiDigits(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

function extractFssaiNumber(text: string): string {
  const labeled: { index: number; digits: string }[] = [];
  const labeledRe = new RegExp(FSSAI_LABELED_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = labeledRe.exec(text))) {
    const digits = normalizeFssaiDigits(match[1]);
    if (/^\d{14}$/.test(digits)) labeled.push({ index: match.index, digits });
  }

  const notManufacturers = labeled.filter((candidate) => !isCloserToManufacturing(text, candidate.index));
  if (notManufacturers.length > 0) {
    debugLog(`fssaiNumber: matched "${notManufacturers[0].digits}" via "FSSAI"-labeled pattern (not closer to a manufacturing anchor).`);
    return notManufacturers[0].digits;
  }
  if (labeled.length > 0) {
    // Every "FSSAI"-labeled number found is closer to a manufacturing
    // anchor than to any marketing one — before giving up, check for an
    // unlabeled candidate near a marketing anchor (see fallback below);
    // otherwise this label's marketing-company FSSAI number genuinely
    // isn't identifiable and the field is left blank rather than reusing
    // the manufacturer's number.
    debugLog(
      `fssaiNumber: rejected ${labeled.length} "FSSAI"-labeled candidate(s) (${labeled
        .map((c) => c.digits)
        .join(', ')}) as closer to a manufacturing anchor than a marketing one.`
    );
  }

  // Fallback: a bare 14-digit run sitting right next to a customer-care or
  // email anchor is very likely the marketing company's own FSSAI number
  // printed without the word "FSSAI" surviving text extraction — this
  // happens in practice when a stylized "FSSAI" wordmark/logo doesn't
  // extract as text (broken font encoding, or the logo is a raster image)
  // while the adjacent printed number does.
  const contextIndices = findAllIndices(text, CUSTOMER_OR_EMAIL_CONTEXT_PATTERN);
  if (contextIndices.length > 0) {
    const bareRe = new RegExp(BARE_14_DIGIT_PATTERN);
    while ((match = bareRe.exec(text))) {
      const distance = nearestDistance(contextIndices, match.index);
      if (distance <= BARE_NUMBER_CONTEXT_WINDOW) {
        debugLog(`fssaiNumber: matched "${match[1]}" via bare-14-digit-near-customer-care/email fallback (no adjacent "FSSAI" keyword survived text extraction).`);
        return match[1];
      }
    }
  }

  debugLog('fssaiNumber: no confident candidate found — leaving blank.');
  return '';
}

// ---------------------------------------------------------------------
// Package Size — the total count printed on the front of the pack (e.g.
// "30 Gummies", "60 GUMMIES"), never the per-serving amount. V1 targets
// the number immediately adjacent to "Gummy"/"Gummies" (per spec), with
// "Count"/"Capsules"/"Tablets" as more general contextual words for future
// label types — never a hardcoded number, never guessed.
// ---------------------------------------------------------------------
// Shared with isGenericProductFormWord (title-block splitting, below) and,
// exported, with packageSizeOcr.service.ts's badge/region recovery — a
// single source of truth for "words that name a product's physical form
// rather than its identity", across every place that needs to recognize
// one.
export const PRODUCT_FORM_WORDS = 'gummies|gummy|capsules?|tablets?|softgels?|sachets?|pieces?|units?|count|ct\\.?';
const PACKAGE_SIZE_PATTERN = new RegExp(`\\b(\\d{1,4})\\s*(${PRODUCT_FORM_WORDS})\\b`, 'gi');
// Anything indicating the number is a per-serving amount, not the total
// pack count — "Serving Size: 1 Gummy" must never be read as packageSize.
// Checked against the text on the SAME LINE before the number, and the one
// LINE ABOVE it too (a "Recommended Usage:" / "Dosage:" heading commonly
// sits on its own line directly above the actual instruction line, e.g.
// "Recommended Usage:\n1 Gummy daily or as suggested by your dietitian.").
// Not a raw character window — a fixed-size window bleeds across short
// lines (e.g. would wrongly reject a "30 Gummies" line just for sitting a
// dozen characters after an unrelated "Serving Size: 1 Gummy" line above
// it).
const SERVING_OR_DOSAGE_CONTEXT_PATTERN =
  /serving\s*size|per\s*serving|servings?\s*per\s*container|no\.?\s*of\s*serving|amount\s*per\s*serving|recommended\s*(usage|dosage)|directions?\s*for\s*use|suggested\s*use|dosage|how\s*to\s*use/i;

function lineAt(text: string, index: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return { start, end: end === -1 ? text.length : end };
}

function isPrecededByServingContext(text: string, matchIndex: number): boolean {
  const currentLine = lineAt(text, matchIndex);
  if (SERVING_OR_DOSAGE_CONTEXT_PATTERN.test(text.slice(currentLine.start, matchIndex))) return true;
  if (currentLine.start === 0) return false;
  const previousLine = lineAt(text, currentLine.start - 1);
  return SERVING_OR_DOSAGE_CONTEXT_PATTERN.test(text.slice(previousLine.start, previousLine.end));
}

// A dosage/usage instruction states how much to take PER DAY, never the
// total pack count — "1 Gummy daily", "2 Tablets per day", "1 Gummy ...
// as suggested by your dietitian" are dosage instructions regardless of
// what (if anything) precedes them on the line, so this is checked against
// the text immediately AFTER the match on the same line too, not just what
// precedes it.
const DOSAGE_TRAILING_PATTERN = /\bdaily\b|\bper\s*day\b|\ba\s*day\b|\bas\s*(?:suggested|directed|recommended)\b/i;

function isFollowedByDosageWording(text: string, matchEndIndex: number): boolean {
  const lineEnd = text.indexOf('\n', matchEndIndex);
  const restOfLine = text.slice(matchEndIndex, lineEnd === -1 ? text.length : lineEnd);
  return DOSAGE_TRAILING_PATTERN.test(restOfLine);
}

function extractPackageSize(text: string): string {
  const re = new RegExp(PACKAGE_SIZE_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (isPrecededByServingContext(text, match.index)) {
      debugLog(`packageSize: rejected "${match[1]}" from "${match[0].trim()}" — immediately follows serving-size/dosage wording.`);
      continue;
    }
    if (isFollowedByDosageWording(text, match.index + match[0].length)) {
      debugLog(`packageSize: rejected "${match[1]}" from "${match[0].trim()}" — followed by dosage wording ("daily"/"per day"/...), a per-day dose, not the total pack count.`);
      continue;
    }
    debugLog(`packageSize: matched "${match[1]}" from "${match[0].trim()}".`);
    return match[1];
  }

  debugLog('packageSize: no confident "<number> Gummies/Count/..." wording found — leaving blank.');
  return '';
}

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function extractEmail(text: string): string {
  const match = text.match(EMAIL_PATTERN);
  if (!match) {
    debugLog('email: no valid email pattern found — leaving blank.');
    return '';
  }
  // Trailing punctuation is occasionally picked up from sentence context
  // ("...contact us at care@brand.com."), never part of a real address.
  const value = match[0].replace(/[.,;:]+$/, '');
  debugLog(`email: matched "${value}".`);
  return value;
}

// ---------------------------------------------------------------------
// Customer Care Number
// ---------------------------------------------------------------------
const CUSTOMER_CARE_PREFIX = /(customer\s*care|consumer\s*care|helpline|toll[\s-]?free)[^0-9+]{0,20}?(\+?\d[\d\s-]{6,17}\d)/i;

function cleanPhoneNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

// A bare phone number is only trusted near the words "care"/"helpline" to
// avoid mistaking, say, a pincode or FSSAI-adjacent digits for a phone
// number.
function extractCustomerCareNumber(text: string): string {
  const match = text.match(CUSTOMER_CARE_PREFIX);
  if (!match) {
    debugLog('customerCareNumber: no "Customer Care"/"Helpline"/"Toll Free"-anchored number found — leaving blank.');
    return '';
  }
  const value = cleanPhoneNumber(match[2]);
  debugLog(`customerCareNumber: matched "${value}" near anchor "${match[1]}".`);
  return value;
}

// ---------------------------------------------------------------------
// Flavour
// ---------------------------------------------------------------------
const KNOWN_FLAVOURS = [
  'orange',
  'strawberry',
  'mango',
  'mixed berry',
  'mixed fruit',
  'lemon',
  'lime',
  'grape',
  'apple',
  'pineapple',
  'vanilla',
  'chocolate',
  'blueberry',
  'raspberry',
  'watermelon',
  'guava',
  'litchi',
  'lychee',
  'peach',
  'banana',
  'kiwi',
  'mint',
  'coffee',
  'butterscotch',
  'cardamom'
];

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// A compound flavour name ("Strawberry & Mint", "Strawberry, Raspberry &
// Blueberry", "Strawberry-Mint") is still ONE flavour, not "the last word
// before Flavour" — CONNECTOR joins consecutive Title-Case words the same
// way plain whitespace already did, generalized to the punctuation/words a
// label actually uses to join a multi-part flavour: "&", "+", "/", a
// comma, a hyphen, or the word "and". Deliberately does NOT include a bare
// newline as a connector (see the [ \t]-not-\s reasoning below) — two
// words separated by an actual line break are joined into one candidate
// only when the FIRST line visibly ends in one of these connectors (see
// joinDanglingConnectorLineBreaks), never unconditionally.
//
// The hyphen is deliberately its own bare alternative with NO surrounding
// [ \t]* — a tight hyphen with no adjacent whitespace ("Strawberry-Mint")
// is a genuine compound-word formation and must connect, but a SPACED dash
// ("Vitamin C Gummies - Orange") is a phrase/clause separator (e.g. product
// name vs. flavour), not a word-compound joiner, and must NOT let the
// capture chain backward through an unrelated preceding phrase.
const FLAVOUR_WORD_JOIN = '(?:[ \\t]+(?:and[ \\t]+)?|[ \\t]*(?:&|\\+|/|,)[ \\t]*|-)';
// Capped at 4 words total (1 + up to 3 more) — long enough for every real
// multi-part flavour phrase this label category actually uses ("Strawberry,
// Raspberry & Blueberry" is 3), short enough that this can never run on
// into an unrelated sentence: every additional word must independently
// look like a Title-Case/ALL-CAPS name, and the chain stops the instant a
// character outside a word or one of the connectors above appears (a
// period, a parenthesis, an unconnected line break), which is what keeps
// this from ever reaching back through real punctuation into unrelated
// preceding text.
const MAX_ADDITIONAL_FLAVOUR_WORDS = 3;

// Case-insensitive alternation of every known flavour word, longest-first so
// a multi-word entry ("mixed berry") wins over accidentally matching just
// its first word via a shorter alternative later in the list.
const KNOWN_FLAVOUR_ALTERNATION = KNOWN_FLAVOURS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

// A compound flavour with NO "Flavour" wording anywhere near it ("Strawberry
// & Mint" printed as a bare front-of-pack callout, with no anchor word for
// the two regexes above to key off of) still needs both halves captured —
// reusing the exact same connector definition as those anchored tiers, but
// chaining together known-flavour words instead of arbitrary Title-Case
// ones, since there is no "Flavour" anchor here to establish that an
// unfamiliar word is part of a flavour name at all. Requires at least TWO
// known-flavour words joined by a connector — a single known-flavour word
// with no connector is left to the plain keyword-scan fallback tier below,
// which already handles that case.
const COMPOUND_KNOWN_FLAVOUR_PATTERN = new RegExp(
  `\\b(?:${KNOWN_FLAVOUR_ALTERNATION})(?:${FLAVOUR_WORD_JOIN}(?:${KNOWN_FLAVOUR_ALTERNATION})){1,${MAX_ADDITIONAL_FLAVOUR_WORDS}}\\b`,
  'gi'
);

// "<Name(s)> Flavour" (e.g. "Apple Flavour", "Mixed Berry Flavour",
// "Strawberry & Mint Flavour") is the dominant on-label wording — checked
// before "Flavour: <Name>" and before the known-flavour keyword scan, so
// an explicit label always wins over an incidental ingredient mention
// (e.g. "Apple Cider Vinegar" elsewhere on the same label).
// [ \t]+ (not \s+) deliberately — \s would also match newlines, letting the
// match run backward across unrelated title lines above the real "<Name>
// Flavour" line (seen in practice: a multi-line ALL-CAPS product-name
// block sitting just above the flavour caption).
// The "Flavour"/"Flavor" keyword itself is matched case-insensitively
// (spelled out as an explicit either-case character class per letter,
// rather than the regex's `i` flag) since many real labels print this
// wording in ALL CAPS ("DELICIOUS MIXED BERRY FLAVOUR") — but the
// preceding word(s) must still start with a genuine uppercase letter
// (Title Case or ALL CAPS), same as before. Using the `i` flag instead
// would also loosen `[A-Z]` to match a lowercase start, which would start
// matching ordinary lowercase sentence text mentioning "flavour" (e.g. "...
// contains natural flavour...") that this pattern must not match — that
// case is intentionally left to the anchored "Flavour: <Name>" pattern
// below instead.
const NAME_THEN_FLAVOUR_WORD = new RegExp(
  `\\b([A-Z][a-zA-Z]*(?:${FLAVOUR_WORD_JOIN}[A-Z][a-zA-Z]*){0,${MAX_ADDITIONAL_FLAVOUR_WORDS}})[ \\t]+[Ff][Ll][Aa][Vv][Oo][Uu]?[Rr]\\b`,
  'g'
);
// \b after Flavou?r is required — without it, this also matches inside
// "Flavouring"/"Flavours" (e.g. real label text "ADDED FLAVOURS (NATURAL
// FLAVOURING SUBSTANCES)"), where the regex engine, unable to satisfy the
// capture group right after "Flavour" in "Flavours" (only one letter
// remains before punctuation), backtracks to the NEXT "Flavour"-like
// substring it can find — "Flavouring" — and wrongly captures "ing
// Substances" as if it were a flavour name.
//
// The anchor itself already establishes intent ("Flavour:" only ever
// prefixes the label's own flavour statement), so — unlike the pattern
// above, which has to lean on capitalization to avoid matching ordinary
// sentence text — the captured name here is allowed to start with either
// case, while still using the same bounded word+connector structure
// (never an unstructured run of letters) to stay a genuine flavour phrase
// rather than drifting into the next sentence.
const FLAVOUR_WORD_THEN_NAME = new RegExp(
  `\\b[Ff][Ll][Aa][Vv][Oo][Uu]?[Rr]\\b[ \\t]*[:\\-]?[ \\t]*([A-Za-z][a-zA-Z]*(?:${FLAVOUR_WORD_JOIN}[A-Za-z][a-zA-Z]*){0,${MAX_ADDITIONAL_FLAVOUR_WORDS}})`,
  'g'
);

// A line ending in a dangling connector ("Strawberry &") whose phrase
// continues on the next line ("Mint Flavour") is a real, common label
// layout — a compound flavour name split across two visually-stacked
// lines/font runs by the label's own design (the same reason
// findTitleBlock's product-name detection, below, treats a
// dangling-connector line the same way; seen in practice on a real label
// whose front badge reads "Strawberry &" / "Mint Flavour" as two separate
// lines from the PDF's own text layer). This is deliberately narrow: a
// line only ever merges into the one before it when that previous line
// visibly ends in one of the flavour connectors, or the current line is
// ITSELF nothing but a connector — it can never bridge an arbitrary
// paragraph wrap, and it never invents a connector that isn't actually
// printed (see the module-level "never guess" rule). Applied only within
// extractFlavour, on a local copy of the text — this never changes what
// any other field sees.
const ENDS_WITH_FLAVOUR_CONNECTOR = /(?:&|\+|\band\b)[ \t]*$/i;
const LONE_CONNECTOR_LINE = /^[ \t]*(?:&|\+|and)[ \t]*$/i;

function joinDanglingConnectorLineBreaks(text: string): string {
  const lines = text.split(/\r?\n/);
  const joined: string[] = [];
  for (const line of lines) {
    const previous = joined[joined.length - 1];
    const shouldMerge = previous !== undefined && (ENDS_WITH_FLAVOUR_CONNECTOR.test(previous.trim()) || LONE_CONNECTOR_LINE.test(line));
    if (shouldMerge) {
      joined[joined.length - 1] = `${previous.replace(/[ \t]+$/, '')} ${line.trim()}`;
    } else {
      joined.push(line);
    }
  }
  return joined.join('\n');
}

// A "<Name> Flavour" match inside a "Free of: ..., Artificial Flavour, ..."
// disclaimer states the opposite of what it looks like — the product does
// NOT contain that flavour — so it must never be read as the product's
// actual flavour (seen in practice: a herbal-blend label whose only
// "Flavour" mention at all is this kind of "does not contain" clause). A
// fixed lookback window (rather than searching back to the nearest
// sentence-ending period) is deliberate: this comma-separated "free of"
// list commonly wraps across a line break, and on OCR'd text a stray
// period from a completely unrelated, out-of-order-reconstructed sentence
// can land between the two, making "nearest period" an unreliable
// boundary. A window wide enough to span a realistic "free of" list is
// more robust to that kind of interstitial noise.
const NEGATION_CONTEXT_PATTERN = /\bfree\s*of\b|\bwithout\b|\bcontains?\s*no\b/i;
const NEGATION_CONTEXT_WINDOW = 250;

function isPrecededByNegationContext(text: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - NEGATION_CONTEXT_WINDOW);
  return NEGATION_CONTEXT_PATTERN.test(text.slice(windowStart, matchIndex));
}

// Used only by the anchor-less known-flavour keyword scan (see
// extractFlavour below) — "Flavouring" (not "Flavour") right next to a
// known flavour word describes what a flavouring AGENT is made of, not a
// claim that the product itself is that flavour (e.g. "Natural Mint
// Flavouring" as one ingredient among several, on a label whose own front
// makes no flavour statement at all). A short, symmetric window catches it
// on either side ("Flavouring: Mint" as well as "Mint Flavouring").
const FLAVOURING_MENTION_PATTERN = /\bflavouring\b/i;
const FLAVOURING_MENTION_WINDOW = 20;
function isAdjacentToFlavouringMention(text: string, matchIndex: number, matchLength: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - FLAVOURING_MENTION_WINDOW), matchIndex);
  const after = text.slice(matchIndex + matchLength, matchIndex + matchLength + FLAVOURING_MENTION_WINDOW);
  return FLAVOURING_MENTION_PATTERN.test(before) || FLAVOURING_MENTION_PATTERN.test(after);
}

// The length of the line a match sits on — used to prefer an isolated,
// standalone flavour statement over the same wording restated inside a
// long, comma-dense ingredients sentence (see bestNonNegatedMatch below).
function enclosingLineLength(text: string, matchIndex: number): number {
  const lineStart = text.lastIndexOf('\n', matchIndex - 1) + 1;
  const lineEndIndex = text.indexOf('\n', matchIndex);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  return lineEnd - lineStart;
}

// Among every non-negated match, prefers whichever sits on the SHORTEST
// enclosing line. A label's real front-of-pack flavour statement is
// printed as its own short, isolated callout ("Strawberry & Mint
// Flavour"); an ingredients declaration restating the same flavour (a
// real, common pattern — the ingredient list itself has to name what
// "natural flavouring" actually is) sits embedded inside a much longer,
// comma-dense sentence alongside unrelated ingredients (seen in practice:
// "Monk Fruit juice, Strawberry-Mint Flavour and Food Colours: Black
// Carrot Concentrate ..."). Both are genuine, correctly-matched flavour
// phrases — this is a preference between two valid candidates based on
// which reads as the label's own standalone statement, not a fallback
// from a bad one. With only one candidate (the common case), this is a
// no-op and behaves exactly as a plain first-match search would.
function bestNonNegatedMatch(text: string, pattern: RegExp): RegExpExecArray | null {
  const re = new RegExp(pattern.source, pattern.flags);
  const candidates: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (!isPrecededByNegationContext(text, match.index)) candidates.push(match);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    enclosingLineLength(text, candidate.index) < enclosingLineLength(text, best.index) ? candidate : best
  );
}

function extractFlavour(text: string): string {
  // Only affects the two anchor-based tiers below — a compound flavour
  // phrase split across a dangling-connector line break needs to read as
  // one contiguous run for them to see it as a single name. The
  // no-anchor keyword-scan fallback (further below) works on the
  // unmodified text; it only ever returns a single known flavour word, so
  // joining line breaks wouldn't change anything for it.
  const textWithJoinedFlavourLines = joinDanglingConnectorLineBreaks(text);

  const nameThenFlavour = bestNonNegatedMatch(textWithJoinedFlavourLines, NAME_THEN_FLAVOUR_WORD);
  if (nameThenFlavour) {
    const value = titleCase(nameThenFlavour[1].trim());
    debugLog(`flavour: matched "${value}" via "<Name> Flavour" wording ("${nameThenFlavour[0]}").`);
    return value;
  }

  const flavourThenName = bestNonNegatedMatch(textWithJoinedFlavourLines, FLAVOUR_WORD_THEN_NAME);
  if (flavourThenName) {
    const value = titleCase(flavourThenName[1].trim());
    debugLog(`flavour: matched "${value}" via "Flavour: <Name>" wording ("${flavourThenName[0]}").`);
    return value;
  }

  // Still no "Flavour" anchor anywhere — but a compound flavour can be
  // printed as a bare front-of-pack callout with no anchor word at all
  // ("Strawberry & Mint", no trailing "Flavour"). This tier chains together
  // two-or-more KNOWN flavour words joined by the same connectors as the
  // anchored tiers above (see COMPOUND_KNOWN_FLAVOUR_PATTERN) — reusing the
  // dangling-connector line join for the same reason the anchored tiers
  // need it, and the same "Ingredients:" cutoff and "Flavouring"-adjacency
  // guard as the plain single-word scan below, since it is exactly as
  // exposed to both false-positive sources.
  const joinedIngredientsLabelIndex = textWithJoinedFlavourLines.search(/\bingredients\s*:/i);
  const joinedPreIngredientsText =
    joinedIngredientsLabelIndex >= 0 ? textWithJoinedFlavourLines.slice(0, joinedIngredientsLabelIndex) : textWithJoinedFlavourLines;
  const compoundKnownFlavour = bestNonNegatedMatch(joinedPreIngredientsText, COMPOUND_KNOWN_FLAVOUR_PATTERN);
  if (
    compoundKnownFlavour &&
    !isAdjacentToFlavouringMention(joinedPreIngredientsText.toLowerCase(), compoundKnownFlavour.index, compoundKnownFlavour[0].length)
  ) {
    const value = titleCase(compoundKnownFlavour[0].trim());
    debugLog(`flavour: matched "${value}" via compound known-flavour keyword scan (no explicit "Flavour" wording found).`);
    return value;
  }

  // This last-resort tier has no anchor at all — it just scans for any
  // known flavour word appearing anywhere — so it must not scan past an
  // "Ingredients:" label: several known flavour words (cardamom, mint,
  // ginger, etc.) are also common herbal/ingredient names, and a
  // multi-item ingredient list is exactly where one is likely to appear
  // without actually being the product's stated flavour (seen in practice:
  // a Chyawanprash herbal-blend ingredient list mentioning "Cardamom
  // (Elettaria cardamomum) Seed Extract", on a label with no flavour of
  // its own at all).
  const ingredientsLabelIndex = text.search(/\bingredients\s*:/i);
  const preIngredientsText = ingredientsLabelIndex >= 0 ? text.slice(0, ingredientsLabelIndex) : text;
  const lower = preIngredientsText.toLowerCase();
  for (const flavour of KNOWN_FLAVOURS) {
    const matchIndex = lower.indexOf(flavour);
    // A known-flavour word sitting next to "Flavouring" ("Natural Mint
    // Flavouring") is naming what a flavouring AGENT is made from — an
    // ingredient description, not a "this product is <flavour>" statement
    // — and this anchor-less fallback tier has nothing else to tell the
    // two apart, so it must not treat it as the product's stated flavour.
    if (matchIndex >= 0 && !isAdjacentToFlavouringMention(lower, matchIndex, flavour.length)) {
      const value = titleCase(flavour);
      debugLog(`flavour: matched "${value}" via known-flavour keyword scan (no explicit "Flavour" wording found).`);
      return value;
    }
  }

  debugLog('flavour: no explicit wording or known flavour keyword found — leaving blank.');
  return '';
}

// ---------------------------------------------------------------------
// Brand / Product Name
//
// Both are identified the same way: real product packaging almost always
// prints its brand and product name as short, prominent, ALL-CAPS display
// text (a title/logo block), distinct from the surrounding mixed-case body
// copy. Rather than picking "the first line that survives a blacklist"
// (which is easy to fool with any unanticipated short line — a stray
// "(Inclusive of All Taxes)" or "Use By" table label, for example), both
// fields require this kind of POSITIVE signal before returning a value;
// finding none, they are left blank rather than guessed. This deliberately
// makes both fields blank more often on messy compliance-text-only content
// — a correct outcome per the no-fabrication rule, not a regression.
// ---------------------------------------------------------------------
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Checks for the manufacturing company's first word as a whole word, not a
// substring — a plain .includes() check would also match "IM" inside an
// unrelated word like "IMMUNITY" (seen in practice on a real label's
// marketing badge callout, "IMMUNITY BOOSTER"), wrongly excluding it as if
// it named the manufacturer.
const manufacturingCompanyFirstWordPattern = new RegExp(`\\b${escapeRegExp(FIXED_MANUFACTURING_COMPANY.split(' ')[0])}\\b`, 'i');
function mentionsManufacturingCompany(line: string): boolean {
  return manufacturingCompanyFirstWordPattern.test(line);
}

// The trailing group (immunity|booster|...) is generic supplement-marketing
// claim vocabulary — words a front-of-pack "claim badge" icon uses (e.g.
// "IMMUNITY BOOSTER", "NATURAL", "ENERGY & VITALITY", "DAILY WELLNESS",
// "NUTRACEUTICAL") on countless different brands' health-supplement
// packaging, not anything specific to one label. Without this, a cluster
// of such badge captions sitting near each other can form a longer
// ALL-CAPS "run" than the label's actual (often shorter, or mixed-case)
// brand/product title, and get mistaken for it — seen in practice on a
// real Chyawanprash gummy label, where "GUMMIES IMMUNITY BOOSTER NATURAL"
// (four adjacent claim-badge lines) outscored the genuine title.
// "AN AYURVEDIC PROPRIETARY MEDICINE" / "AYURVEDIC PROPRIETARY MEDICINE" is
// standard regulatory boilerplate printed on any Ayurvedic-category
// product's label (alongside "NOT FOR MEDICINAL USE", already covered
// below) — never part of a brand or product name, on this or any other
// Ayurvedic label.
//
// A line led by a claim verb ("SUPPORTS BRAIN HEALTH", "HELPS BOOST
// IMMUNITY", "PROMOTES BETTER SLEEP") is a front-of-pack marketing claim
// callout, not the product's identity — the same category of generic
// claim-badge text as the immunity/booster/energy/etc. words already
// excluded below, just verb-led instead of noun-led, and just as common
// across supplement labels regardless of what the specific claim is about.
const TITLE_BOILERPLATE_LINE =
  /^(marketed|manufactured|address|fssai|customer\s*care|consumer\s*care|helpline|email|e-mail|website|www\.|toll[\s-]?free|batch|mfg|exp|use\s*by|m\.?r\.?p\.?|price|net\s*(content|wt)|ingredients|images?\s*are|keep\s*out|keep\s*away|store\s*in|not\s*for|registered|regd|facility|nutritional|recommended\s*usage|duration\s*of|do\s*not|this\s*food|contains|health\s*supplement|to\s*be\s*sold|per\s*(gummy|serving)|free\s*of|serving\s*size|no\.?\s*of\s*serving|immunity|booster|energy|vitality|wellness|nutraceutical|daily|ayurvedic|proprietary\s*medicine|supports?\b|helps?\b|promotes?\b|boosts?\b|improves?\b|maintains?\b|enhances?\b)/i;

const ALL_CAPS_LINE = /^[A-Z][A-Z0-9 &'.-]*$/;

// A line ending in a bare colon (optionally followed only by more
// punctuation/whitespace) is a table/form field label with its value
// elsewhere (blank, or on another line) — e.g. "Price   :", "M.R.P. :" —
// never a real brand/product/company name.
function isBareFieldLabel(line: string): boolean {
  return /:\s*[:.\-]*\s*$/.test(line);
}

function isTitleCandidateLine(line: string): boolean {
  if (line.length < 2 || line.length > 40) return false;
  if (/^\(.*\)$/.test(line)) return false;
  if (/\d{3,}/.test(line)) return false;
  if (isBareFieldLabel(line)) return false;
  if (TITLE_BOILERPLATE_LINE.test(line)) return false;
  if (EMAIL_PATTERN.test(line)) return false;
  if (mentionsManufacturingCompany(line)) return false;
  return ALL_CAPS_LINE.test(line) && /[A-Z]{2,}/.test(line);
}

// Collapses a line that is itself just a short phrase repeated end-to-end
// (e.g. "GUMMIES GUMMIES GUMMIES GUMMIES GUMMIES") down to one occurrence.
// Seen in practice on a print sheet where the same banner artwork repeats
// several times across the page and OCR reads each repetition's text as
// part of one continuous line — without this, the repeated text is both
// mistaken for "too long to be a brand" and, if kept, would corrupt a
// product name with nonsense repetition. General-purpose: works for any
// repeated word/phrase and repeat count, not specific to any one label.
function collapseRepeatedPhrase(line: string): string {
  const words = line.trim().split(/\s+/);
  const n = words.length;
  for (let period = 1; period <= Math.floor(n / 2); period++) {
    if (n % period !== 0) continue;
    let isRepeating = true;
    for (let i = period; i < n; i++) {
      if (words[i].toLowerCase() !== words[i % period].toLowerCase()) {
        isRepeating = false;
        break;
      }
    }
    if (isRepeating) return words.slice(0, period).join(' ');
  }
  return line;
}

// Same idea as collapseRepeatedPhrase above, one level up: a candidate RUN
// (multiple consecutive title-candidate LINES) that is itself a shorter
// cycle of lines repeated end-to-end collapses down to one cycle. A banner
// graphic repeating "SHARP MIND PLUS" / "GUMMIES" side by side several
// times across a print sheet — each repetition now correctly split onto
// its own line by the PDF-text-layer's font-size/position-aware line
// breaking (see pdf.service.ts) rather than fused into one over-length
// line — would otherwise form a run several lines long that out-scores the
// genuine single occurrence purely by being longer, corrupting the product
// name with nonsense repetition. General-purpose: works for any repeated
// line cycle and repeat count, not specific to any one label.
function collapseRepeatedLineRun(lines: string[]): string[] {
  const n = lines.length;
  for (let period = 1; period <= Math.floor(n / 2); period++) {
    if (n % period !== 0) continue;
    let isRepeating = true;
    for (let i = period; i < n; i++) {
      if (lines[i].toLowerCase() !== lines[i % period].toLowerCase()) {
        isRepeating = false;
        break;
      }
    }
    if (isRepeating) return lines.slice(0, period);
  }
  return lines;
}

const GENERIC_PRODUCT_FORM_LINE = new RegExp(`^(${PRODUCT_FORM_WORDS})$`, 'i');

// Exported so labelExtraction.service.ts can recognize a productName that's
// nothing but this generic form word as still effectively "unset" — worth
// letting a later, more complete OCR pass overwrite, rather than a value to
// lock in the way any other non-empty field normally would be.
export function isGenericProductFormWord(line: string): boolean {
  return GENERIC_PRODUCT_FORM_LINE.test(line.trim());
}

const DANGLING_CONNECTOR_LINE = /(?:\b(?:and|or)\b|[&,])\s*$/i;

function endsWithDanglingConnector(line: string): boolean {
  return DANGLING_CONNECTOR_LINE.test(line.trim());
}

function dedupeConsecutiveLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const norm = line.trim().toLowerCase();
    if (out.length > 0 && out[out.length - 1].trim().toLowerCase() === norm) continue;
    out.push(line);
  }
  return out;
}

type TitleBlockResult = { brand: string; productName: string };

function findTitleBlock(lines: string[], marketingCompany: string): TitleBlockResult {
  // Collapse a repeated-phrase line ("GUMMIES GUMMIES GUMMIES...") down to
  // one occurrence BEFORE candidacy checks — otherwise the repeated text
  // either fails the length cap (wrongly excluding a genuinely short word)
  // or, if short enough to pass, corrupts the eventual product name with
  // nonsense repetition.
  const deduped = dedupeConsecutiveLines(lines).map((line) => collapseRepeatedPhrase(line));
  const candidates: { line: string; pos: number }[] = [];
  deduped.forEach((line, pos) => {
    if (marketingCompany && line.toLowerCase().includes(marketingCompany.toLowerCase())) return;
    // A short ALL-CAPS line immediately following one that ends in a
    // dangling connector ("&", "and", "or", a trailing comma) is the
    // wrapped tail of a longer sentence, not a standalone title — seen in
    // practice on a real label's compliance paragraph ("CONTAINS
    // PERMITTED NATURAL COLOURS (INS) AND ADDED FLAVOURS (NATURAL
    // FLAVOURING SUBSTANCES) &" wrapping onto "NON CALORIE SWEETENER
    // STEVIA"), where the wrapped fragment happened to be short enough to
    // otherwise pass every other title-candidate check.
    //
    // BUT this must not fire when the preceding line is ITSELF already a
    // valid title candidate — a deliberate two-line title/brand split
    // ("CALCIUM &" / "VITAMIN-D", read together as "CALCIUM & VITAMIN-D")
    // also ends in a dangling "&", and rejecting its second line here would
    // leave "CALCIUM &" as an isolated, truncated-looking fragment. The
    // distinguishing signal: an over-length wrapped sentence fragment never
    // itself passes isTitleCandidateLine (it's far longer than 40 chars),
    // while a genuine short title line does.
    if (pos > 0 && endsWithDanglingConnector(deduped[pos - 1]) && !isTitleCandidateLine(deduped[pos - 1])) return;
    if (isTitleCandidateLine(line)) candidates.push({ line, pos });
  });

  if (candidates.length === 0) {
    debugLog('brand/productName: no prominent ALL-CAPS title text found — leaving both blank.');
    return { brand: '', productName: '' };
  }

  const runs: { line: string; pos: number }[][] = [];
  let currentRun: { line: string; pos: number }[] = [candidates[0]];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].pos === candidates[i - 1].pos + 1) {
      currentRun.push(candidates[i]);
    } else {
      runs.push(currentRun);
      currentRun = [candidates[i]];
    }
  }
  runs.push(currentRun);

  // Collapse each run down to its shortest repeating cycle, if it has one,
  // BEFORE completeness/length checks — see collapseRepeatedLineRun above.
  const collapsedRuns = runs.map((run) => {
    const lines = run.map((candidate) => candidate.line);
    const collapsedLines = collapseRepeatedLineRun(lines);
    return collapsedLines.length === run.length ? run : run.slice(0, collapsedLines.length).map((candidate, i) => ({ ...candidate, line: collapsedLines[i] }));
  });

  // A run whose LAST line ends in a dangling connector ("CALCIUM &" with no
  // following "VITAMIN-D" candidate to complete it) is itself a truncated
  // fragment, not a complete title — its continuation existed on the label
  // but didn't survive as a candidate this time (seen in practice: OCR
  // separated "CALCIUM &" from "VITAMIN-D" onto non-adjacent reconstructed
  // lines). Trusting it as a complete brand/productName produces a
  // nonsensical value ("Calcium &") and, worse, can anchor a later
  // region-based re-OCR at the wrong place on the page (any other stray
  // mention of the same word, e.g. a nutrition-table row). Excluded from
  // consideration entirely rather than accepted as "the best available" —
  // a complete run elsewhere wins instead, or this leaves both blank.
  const completeRuns = collapsedRuns.filter((run) => !endsWithDanglingConnector(run[run.length - 1].line));
  if (completeRuns.length === 0) {
    debugLog('brand/productName: only truncated (dangling-connector) title fragments found — leaving both blank.');
    return { brand: '', productName: '' };
  }

  const bestRun = completeRuns.slice().sort((a, b) => b.map((c) => c.line).join(' ').length - a.map((c) => c.line).join(' ').length)[0];
  const runLines = bestRun.map((c) => c.line);

  debugLog(`brand/productName: title block found: [${runLines.join(' | ')}]`);

  if (runLines.length === 1) {
    const wordCount = runLines[0].split(/\s+/).length;
    if (wordCount <= 2 && runLines[0].length <= 20 && !isGenericProductFormWord(runLines[0])) {
      debugLog(`brand: matched "${titleCase(runLines[0])}" (single short title line).`);
      return { brand: titleCase(runLines[0]), productName: '' };
    }
    debugLog(`productName: matched "${titleCase(runLines[0])}" (single title line, too long or too generic for a brand).`);
    return { brand: '', productName: titleCase(runLines[0]) };
  }

  // A 2-line run pairing exactly one generic product-form word with one
  // non-generic word is the same brand/form distinction as above, just
  // with the form word appearing ALONGSIDE the brand rather than replacing
  // it — regardless of which of the two lines comes first (OCR reading
  // order doesn't reliably reflect the artwork's actual visual stacking).
  // The non-generic line is the brand; the form word becomes productName.
  if (runLines.length === 2) {
    const [a, b] = runLines;
    const aIsGeneric = isGenericProductFormWord(a);
    const bIsGeneric = isGenericProductFormWord(b);
    if (aIsGeneric !== bIsGeneric) {
      const nameLine = aIsGeneric ? b : a;
      const formLine = aIsGeneric ? a : b;
      if (nameLine.split(/\s+/).length <= 2 && nameLine.length <= 20) {
        const brand = titleCase(nameLine);
        const productName = titleCase(formLine);
        debugLog(`brand: matched "${brand}" (the non-generic line of a 2-line title block). productName: matched "${productName}" (the block's generic product-form line).`);
        return { brand, productName };
      }
      // The non-generic line is too long/multi-word to plausibly be a
      // BRAND (a real brand name is essentially never 3+ words) — it's the
      // PRODUCT NAME instead, printed with its product-form word on a
      // separate, visually smaller line beneath it (e.g. "SHARP MIND
      // PLUS" / "GUMMIES"). The form word names what kind of product this
      // is, not part of its stated name, so it's dropped rather than
      // appended; no brand is available from this run (a real brand, if
      // present, is found elsewhere via a separate anchor).
      const productName = titleCase(nameLine);
      debugLog(`productName: matched "${productName}" (the non-generic line of a 2-line title block; its product-form pair "${formLine}" is a separate, smaller line, not part of the name).`);
      return { brand: '', productName };
    }
  }

  const [first, ...rest] = runLines;
  const firstWordCount = first.split(/\s+/).length;
  // A first line ending in a dangling connector ("CALCIUM &" followed by
  // "VITAMIN-D") is one half of a single compound phrase meant to be read
  // as a unit ("Calcium & Vitamin-D") — splitting it into "brand: Calcium
  // &" plus a separate productName would both look broken on its own and
  // sever two words that only make sense together. Kept as one productName
  // instead (brand left for a separate anchor, e.g. a distinct super-brand
  // watermark elsewhere on the label, to supply if one exists).
  if (endsWithDanglingConnector(first)) {
    const productName = titleCase(runLines.join(' '));
    debugLog(`productName: matched "${productName}" (whole title block; first line ends in a connector, so it's one compound phrase, not a brand/name split).`);
    return { brand: '', productName };
  }
  // A short first line is only trusted as the BRAND when it isn't itself
  // just a generic product-form word ("Gummies", "Capsules", ...) — that
  // word names what kind of product this is, not who makes/sells it, and
  // treating it as the brand produces a nonsensical result (seen in
  // practice: a title block reading "GUMMIES" then "NUTRINOL", where
  // "NUTRINOL" — appearing second — is clearly the real brand name).
  if (firstWordCount <= 2 && first.length <= 20 && !isGenericProductFormWord(first)) {
    const brand = titleCase(first);
    const productName = titleCase(rest.join(' '));
    debugLog(`brand: matched "${brand}" (first line of title block). productName: matched "${productName}" (remaining title lines).`);
    return { brand, productName };
  }
  const productName = titleCase(runLines.join(' '));
  debugLog(`productName: matched "${productName}" (whole title block; first line too long or too generic to be a standalone brand).`);
  return { brand: '', productName };
}

function looksLikeSentence(line: string): boolean {
  const wordCount = line.trim().split(/\s+/).length;
  if (wordCount >= 6) return true;
  if (/[.!?]$/.test(line.trim())) return true;
  return false;
}

// Used only when findTitleBlock finds no ALL-CAPS title text at all (e.g. a
// clean, well-formatted PDF text layer that simply prints the brand as an
// ordinary mixed-case line, with no stylized logo/title graphic in play) —
// the first line that survives every boilerplate/sentence/company-name
// filter. Never used to override or second-guess a positive ALL-CAPS match.
//
// Stops at the FIRST line that looks like regulatory/compliance copy
// (manufacturer info, FSSAI, ingredients, nutrition table, etc.) rather
// than skipping such lines individually and continuing — a well-formed
// label always states its brand/product identity before any of that, and
// scanning past it risks picking up an innocuous-looking table fragment
// (a nutrition row like "Energy" or "Sugars", for instance) as if it were
// a name.
function extractBrandFallback(lines: string[], marketingCompany: string): string {
  for (const line of lines) {
    if (TITLE_BOILERPLATE_LINE.test(line)) break;
    if (/^\(.*\)$/.test(line)) continue;
    if (/\d{3,}/.test(line)) continue;
    if (isBareFieldLabel(line)) continue;
    if (EMAIL_PATTERN.test(line)) continue;
    if (marketingCompany && line.toLowerCase().includes(marketingCompany.toLowerCase())) continue;
    if (mentionsManufacturingCompany(line)) continue;
    if (looksLikeSentence(line)) continue;
    if (line.length < 2 || line.length > 40) continue;
    debugLog(`brand: matched "${line}" via mixed-case fallback (no ALL-CAPS title text found).`);
    return line;
  }
  return '';
}

export function extractLabelFields(rawText: string): ExtractedLabelFields {
  const text = rawText ?? '';
  if (!text.trim()) return emptyFields();

  const lines = splitLines(text);
  const { value: marketingCompany, lineIndex: marketingCompanyLineIndex } = extractMarketingCompany(lines);
  const titleBlock = findTitleBlock(lines, marketingCompany);
  const brand = titleBlock.brand || (titleBlock.productName ? '' : extractBrandFallback(lines, marketingCompany));

  return {
    marketingCompany,
    address: extractAddress(lines, EMAIL_PATTERN, marketingCompanyLineIndex),
    fssaiNumber: extractFssaiNumber(text),
    email: extractEmail(text),
    customerCareNumber: extractCustomerCareNumber(text),
    brand,
    flavour: extractFlavour(text),
    productName: titleBlock.productName,
    packageSize: extractPackageSize(text)
  };
}
