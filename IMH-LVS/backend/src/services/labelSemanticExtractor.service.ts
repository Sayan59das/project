// Ingredients, Claims and Nutrition Table Format — three of the six label
// parameters the existing field extractor does not produce.
//
// All three come out of text the OCR/PDF pipeline already has. No model, no
// network, and — the property that matters most on a regulated label — nothing
// here can invent a value that is not physically present in the text. A
// generative model asked for a label's claims can produce a plausible claim the
// label does not make, and on a pharma label that is a compliance incident, not
// a bad guess.
//
// A note on the input: PDF text extraction returns draw order, not reading
// order, and litters runs of spaces inside words ('Pantothenic   Acid' is one
// real example from the dataset). Everything here normalises first.

/** Collapses the whitespace PDF extraction leaves behind, preserving lines. */
function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** The same text as one line — for matching phrases broken across lines. */
function flatten(text: string): string {
  return normalise(text).replace(/\n/g, ' ');
}

// ---------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------

// What ends an ingredients declaration. The list runs until the label moves on
// to another section, and these are the openers seen on real labels — plus the
// disclaimer sentences that habitually follow the list ('This food is by nature
// gluten free.' trails the ingredients on the NutriBears artwork).
const INGREDIENTS_TERMINATORS =
  /\b(nutritional\s+(facts|information)|recommended\s+usage|duration\s+of\s+usage|storage|store\s+in|keep\s+(out|away)|marketed\s+by|manufactured\s+by|packed\s+by|fssai|customer\s+care|consumer\s+care|net\s+(content|wt)|batch\s+no|mfg\.?\s*date|use\s+by|m\.?r\.?p|best\s+before|this\s+food\s+is|allergen|contains\s+permitted|not\s+for\s+medicinal|to\s+be\s+sold|images?\s+are|pouches?\s+not)/i;

/**
 * The ingredients declaration, or '' when the label has none.
 *
 * '' is absence, and the caller stores it as NULL — the comparison then reports
 * MISSING rather than matching one unread label against another.
 */
export function extractIngredients(text: string): string {
  const flat = flatten(text);
  const anchor = flat.search(/\bingredients?\s*:/i);
  if (anchor === -1) return '';

  const afterAnchor = flat.slice(anchor).replace(/^\s*ingredients?\s*:\s*/i, '');

  // Cut at the next section, then at the last full stop before it — an
  // ingredients list ends on a period, and keeping a trailing sentence
  // fragment would make two identical lists compare as merely SIMILAR.
  const terminator = afterAnchor.search(INGREDIENTS_TERMINATORS);
  const window = terminator === -1 ? afterAnchor : afterAnchor.slice(0, terminator);

  const lastStop = window.lastIndexOf('.');
  const declaration = (lastStop === -1 ? window : window.slice(0, lastStop + 1)).trim();

  // Two ingredients is the floor for something worth calling a declaration.
  // Below that the anchor almost always matched a cross-reference ('see
  // ingredients') rather than the list itself.
  if (declaration.split(',').length < 2) return '';
  return declaration;
}

// ---------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------

// Claim-shaped phrases that appear on labels as badges rather than sentences.
// This list exists because the Claims master cannot be assumed complete — the
// seeded master has four entries and the real artwork carries claims none of
// them cover — and because a claim present on the label but absent from the
// stored value is how two different labels compare as a MATCH.
const CLAIM_BADGES: readonly { pattern: RegExp; claim: string }[] = [
  { pattern: /\bgluten[\s-]?free\b/i, claim: 'Gluten Free' },
  { pattern: /\bsugar[\s-]?free\b/i, claim: 'Sugar Free' },
  { pattern: /\bno\s+added\s+sugar\b/i, claim: 'No Added Sugar' },
  { pattern: /\bnatural\s+colou?rs?\s*(&|and)\s*flavou?rs?\b/i, claim: 'Natural Colours & Flavours' },
  { pattern: /\bno\s+(added\s+)?preservatives?\b/i, claim: 'No Added Preservatives' },
  { pattern: /\b(100%\s*)?vegetarian\b/i, claim: 'Vegetarian' },
  { pattern: /\bnon[\s-]?gmo\b/i, claim: 'Non GMO' },
  { pattern: /\bhealth\s+supplement\b/i, claim: 'Health Supplement' },
  { pattern: /\busfda\s+registered\s+facility\b/i, claim: 'USFDA Registered Facility' },
  { pattern: /\bgmp\s+certified\b/i, claim: 'GMP Certified' },
  { pattern: /\bhalal\b/i, claim: 'Halal' }
];

// THERE IS DELIBERATELY NO GENERIC 'Supports X' MATCHER HERE.
//
// One was written and removed after running it on the dataset. A pattern for
// the verb-led form the Claims master uses (supports/boosts/promotes/helps...)
// looks safe and is not, because PDF text arrives in draw order: the NutriBears
// artwork's separate design elements 'Cell', 'Support', 'B', 'VITAMIN C'
// flatten into one line, and the matcher reported a claim of
// 'Support B Vitamin C' that appears nowhere on the label. It also lifted
// 'Help Them Get Their' out of a sentence of marketing prose.
//
// Fabricating a claim on a pharma label is a compliance incident, not a bad
// guess, so the rule is: a claim is reported only when it matches a curated
// Claims master record or a known badge below. Anything else is absent, the
// database stores NULL, and the comparison reports MISSING — which is a
// reviewer's cue to look, and is always recoverable. An invented claim that
// compares as MATCH is not.
//
// Telling a claim badge from marketing prose needs the label's typography —
// badges are large, isolated and usually uppercase — and flattened text has
// thrown that away. If this is ever revisited, it belongs in the OCR layer
// where word bounding boxes and heights still exist, not here.

export type ClaimsResult = {
  /** Every claim found on the label, in the ' | ' form the app stores. */
  claims: string;
  /** Claims that matched a record in the Claims master. */
  matched: string[];
  /**
   * Claims found on the label with no master record.
   *
   * Deliberately surfaced rather than dropped. They are still stored in
   * `claims` — a claim the label makes is on the label whether or not Masters
   * knows about it, and omitting it would let two differently-claiming labels
   * compare as MATCH. Reporting them is what tells a Manager which records the
   * Claims master is missing.
   */
  unmatched: string[];
};

/**
 * Claims present on the label.
 *
 * `knownClaims` is the Claims master (masterService/claims.list()). Matching is
 * case- and space-insensitive; a master claim is reported as matched when its
 * text appears on the label, never when it merely could apply.
 */
export function extractClaims(text: string, knownClaims: readonly string[] = []): ClaimsResult {
  const flat = flatten(text);
  const found = new Map<string, boolean>(); // claim -> matched a master record

  for (const known of knownClaims) {
    const escaped = known.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (escaped.length > 0 && new RegExp(`\\b${escaped}\\b`, 'i').test(flat)) {
      found.set(known.trim(), true);
    }
  }

  for (const badge of CLAIM_BADGES) {
    if (!badge.pattern.test(flat)) continue;
    const alreadyKnown = [...found.keys()].some(
      (claim) => claim.toLowerCase() === badge.claim.toLowerCase()
    );
    if (!alreadyKnown) found.set(badge.claim, isKnown(badge.claim, knownClaims));
  }

  const claims = [...found.keys()];
  return {
    // ' | ' is the separator the existing comparison data uses
    // ('Supports Immunity | High in Vitamin C'), so a stored value from here is
    // directly comparable with one authored by hand.
    claims: claims.join(' | '),
    matched: claims.filter((claim) => found.get(claim) === true),
    unmatched: claims.filter((claim) => found.get(claim) !== true)
  };
}

function isKnown(claim: string, knownClaims: readonly string[]): boolean {
  return knownClaims.some((known) => known.trim().toLowerCase() === claim.toLowerCase());
}

// ---------------------------------------------------------------------
// Nutrition Table Format
// ---------------------------------------------------------------------

// 'Serving size: 1 Gummy | No. of servings per pack: 30' is the real shape on
// the dataset artwork. The basis is what a reviewer compares between two
// labels — a table restated per 100 g instead of per gummy is a genuine
// difference even when every number is derived from the same formulation.
const SERVING_BASIS =
  /\bserving\s+size\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?\s*(?:gummies|gummy|tablets?|capsules?|g|ml|mg)\b)/i;
const PER_HUNDRED = /\bper\s*100\s*(g|ml|gm|gms|grams?)\b/i;

// Nutrient rows a 'Detailed' table carries beyond the basics. Counting declared
// nutrients is what separates a full nutritional panel from the short form.
const NUTRIENT_ROW =
  /\b(energy|protein|total\s+fat|saturated\s+fat|trans\s+fat|cholesterol|total\s+carbohydrate|total\s+sugars?|added\s+sugars?|dietary\s+fibre|dietary\s+fiber|sodium|calcium|iron|iodine|zinc|magnesium|folate|folic\s+acid|inositol|choline|biotin|niacin|riboflavin|thiamine|pantothenic\s+acid|vitamin\s+[abcdek][0-9]{0,2})\b/gi;

const DETAILED_ROW_THRESHOLD = 12;

/**
 * The nutrition table's format, e.g. 'Standard (per 1 Gummy)', or '' when the
 * label declares no serving basis.
 *
 * 'Detailed' means the panel is stated per 100 g/ml, or declares more than
 * DETAILED_ROW_THRESHOLD distinct nutrients — the two things that actually
 * distinguish a full panel from the short form. The threshold is a documented
 * rule rather than a judgement call, so two reviewers reading the same label
 * get the same answer and a disagreement is about the rule, not the reading.
 */
export function extractNutritionTableFormat(text: string): string {
  const flat = flatten(text);

  const servingMatch = flat.match(SERVING_BASIS);
  const perHundred = PER_HUNDRED.test(flat);

  if (!servingMatch && !perHundred) return '';

  const distinctNutrients = new Set(
    [...flat.matchAll(NUTRIENT_ROW)].map((match) => match[0].toLowerCase().replace(/\s+/g, ' '))
  );

  const kind = perHundred || distinctNutrients.size > DETAILED_ROW_THRESHOLD ? 'Detailed' : 'Standard';

  const basis = servingMatch
    ? servingMatch[1].replace(/\s+/g, ' ').trim()
    : '100 g';

  return `${kind} (per ${basis})`;
}
