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

/**
 * Splits an ingredients declaration into its individual items on commas —
 * but not a comma that falls inside parentheses or brackets, so a food
 * additive's own code list ("Gelling Agents (INS 440, 418, 407)") stays one
 * item instead of breaking into "Gelling Agents (INS 440", "418", "407)".
 * This was the dominant real bug in eval/diff.py's wrong-ingredients sample
 * (Step 5.2, accuracy plan) — a naive `.split(',')` doesn't know a comma
 * inside "(...)"/"[...]" isn't a list separator. Generic (works on any
 * bracketed code list, not a specific one); trims and drops empty items,
 * same as the plain split it replaces.
 */
export function splitIngredientsList(declaration: string): string[] {
  if (!declaration) return [];

  const items: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of declaration) {
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);

  // Real, common wrong-answer pattern (eval/diff.py --mode pipeline --field
  // ingredients, a real 45-label run): comma-splitting alone leaves the
  // declaration's own closing full stop attached to whichever item happens
  // to be last — "...Vitamin D." instead of "...Vitamin D" — 27 of 75 wrong
  // answers in one real run were exactly this. An ingredient name is never
  // itself supposed to end in a period, so trimming one trailing "." off
  // every item (not just the last — the same stray-punctuation shape can
  // turn up anywhere a source PDF's line break lands right on it) is safe.
  return items
    .map((item) => item.trim().replace(/\.$/, '').trim())
    .filter((item) => item.length > 0);
}

// ---------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------

// Claim-shaped phrases that appear on labels as badges rather than sentences.
// Generic allergen/dietary vocabulary shared by the "X Free" and "No X"
// claim-shape matchers below. A small, industry-standard set of terms any
// food/supplement label might declare — not built from any one client's
// products — used to gate those matchers so they only accept a REAL
// allergen/dietary word next to "free" or "no", not whatever word happens
// to precede it (see the matchers themselves for the real-label evidence
// that made this allowlist necessary).
export const ALLERGEN_DIETARY_WORDS = new Set([
  'gluten', 'dairy', 'milk', 'lactose', 'casein', 'soy', 'soya', 'nut', 'nuts', 'peanut', 'peanuts',
  'egg', 'eggs', 'wheat', 'gelatin', 'gelatine', 'shellfish', 'fish', 'sesame', 'corn', 'yeast',
  'sugar', 'alcohol', 'caffeine', 'gmo', 'preservative', 'preservatives', 'msg', 'paraben', 'parabens',
  'sulphate', 'sulphates', 'sulfate', 'sulfates', 'fragrance', 'artificial', 'cruelty'
]);

// This list exists because the Claims master cannot be assumed complete — the
// seeded master has four entries and the real artwork carries claims none of
// them cover — and because a claim present on the label but absent from the
// stored value is how two different labels compare as a MATCH.
const CLAIM_BADGES: readonly { pattern: RegExp; claim: string }[] = [
  { pattern: /\bno\s+added\s+sugar\b/i, claim: 'No Added Sugar' },
  { pattern: /\bnatural\s+colou?rs?\s*(&|and)\s*flavou?rs?\b/i, claim: 'Natural Colours & Flavours' },
  // Two separate patterns, not one with an optional "added" — a real label
  // (EYE WELLNESS DOMESTIC LABEL MHJ.pdf) prints bare "No Preservatives",
  // and a single pattern that always output 'No Added Preservatives'
  // regardless of which words were actually on the label was reporting a
  // claim the label doesn't make (WRONG) while also missing the one it
  // does (MISSING) — the exact same real bug in the same shape as the
  // "X Free"/"No X" fixes above. "no added preservatives" can only match
  // the first pattern (the word "added" sits between "no" and
  // "preservatives", so the second pattern's direct adjacency never
  // matches it too), so the two never double up on the same text.
  { pattern: /\bno\s+added\s+preservatives?\b/i, claim: 'No Added Preservatives' },
  { pattern: /\bno\s+preservatives?\b/i, claim: 'No Preservatives' },
  // Real ground-truth claim (same EYE WELLNESS label, and LXIR Shilajit
  // STICK) not previously in this list at all.
  { pattern: /\bno\s+artificial\s+colou?rs?\b/i, claim: 'No Artificial Colours' },
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

  // Step 5.3 (accuracy plan): claims were barely being found at all (327 of
  // 383 ground-truth claim cells missing) because the fixed badge list only
  // recognised two specific "X Free" claims (gluten, sugar) while the real
  // dataset's ground truth has Gelatin Free, Milk Free, Nut Free, Peanut
  // Free, Soy Free and more — a closed list can never keep up with every
  // allergen a label might declare. Matches the SHAPE instead: a word
  // immediately followed by "free" — but ONLY when that word is one of a
  // small, generic set of allergen/dietary terms every label in this
  // industry uses (not a list built from any one client's products).
  //
  // Step 5.6 follow-up (accuracy plan): a first version of this accepted
  // ANY word before "free", denylisting only a few known false positives
  // ("toll free", "carefree"). Running it against the client's real 45
  // labels (eval/diff.py --mode pipeline --field claims) showed that was
  // far too loose — OCR misreads a letter or two right before a genuine
  // "free" elsewhere on the label, and every one of those misread
  // fragments ("D Free", "Wilk Free", "Nay Free", "Aicima Free", "Seby
  // Free", "Ees Free", "Eruchy Free", ...) was reported as its own
  // fabricated claim, none of which the label actually says. An allowlist
  // of real allergen/dietary words fixes this the same way the rest of
  // this matcher already works: generic across any label, never built
  // from one label's specific text.
  const FREE_CLAIM = /\b([A-Za-z]+)[\s-]free\b/gi;
  for (const match of flat.matchAll(FREE_CLAIM)) {
    const word = match[1];
    if (!ALLERGEN_DIETARY_WORDS.has(word.toLowerCase())) continue;
    const claim = `${word[0].toUpperCase()}${word.slice(1).toLowerCase()} Free`;
    const alreadyKnown = [...found.keys()].some((existing) => existing.toLowerCase() === claim.toLowerCase());
    if (!alreadyKnown) found.set(claim, isKnown(claim, knownClaims));
  }

  // Same idea, the label's OTHER common way of printing the same fact: a
  // standalone "NO <ALLERGEN>" badge (e.g. "NO GELATIN", "NO GLUTEN", "NO
  // MILK") rather than "<allergen> free" — confirmed on a real label by
  // dumping its actual PDF text layer (Cal. Vit D IRN120-1.pdf prints six
  // of these as separate two-line badges: "NO\nGELATIN", "NO\nGLUTEN", ...).
  // The SAME allergen allowlist keeps this safe: "no" alone is far too
  // common a word to match generically ("do not exceed", "not meant to
  // diagnose"), but "no" immediately before one of these specific allergen
  // words is not a risk shared with ordinary label prose.
  const NO_CLAIM = /\bno\s+([A-Za-z]+)\b/gi;
  for (const match of flat.matchAll(NO_CLAIM)) {
    const word = match[1];
    if (!ALLERGEN_DIETARY_WORDS.has(word.toLowerCase())) continue;
    const claim = `No ${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
    // Prefix check, not just exact match: a real bug caught by the test
    // suite — "No Artificial Colours" (the CLAIM_BADGES pattern, checked
    // above) and this matcher's own "No Artificial" (since "artificial"
    // is in the allergen allowlist too) both fired for the same text,
    // because an exact-string dedup only catches an identical claim, not
    // a shorter fragment of a longer one already found. Same risk for
    // "No Added Preservatives" if the allowlist word were the SECOND
    // word rather than "added" the first — checked for completeness even
    // though no current allowlist word triggers that specific case.
    const alreadyKnown = [...found.keys()].some(
      (existing) => existing.toLowerCase().startsWith(claim.toLowerCase())
    );
    if (!alreadyKnown) found.set(claim, isKnown(claim, knownClaims));
  }

  // NOT IMPLEMENTED, on purpose: a third real shape for the same fact was
  // found and confirmed on a real label — Iron IRN74-1.pdf prints "FREE
  // FROM   GLUTEN | MILK | SOY" as one combined badge, literal pipe
  // characters and all, alongside six separate "GLUTEN FREE"/"MILK
  // FREE"/... badges. Ground truth records it as its own single claim
  // entry, "Free From Gluten | Milk | Soy". But this app's storage format
  // joins every claim on a label into ONE string using that exact same
  // " | " separator (see the join below, and CLAIM_DELIMITER in
  // scripts/extract-pipeline.ts, which un-joins it the same naive way —
  // value.split(' | ')). A claim whose own text contains " | " would be
  // shattered back into three wrong fragments instead of staying one
  // claim, which is worse than not extracting it at all. Recording this
  // rather than guessing at a workaround (a different internal separator
  // would silently stop matching the ground truth's exact string; storing
  // claims as a real array end-to-end would be the correct fix but touches
  // every caller of this field) — a decision for the human, not a code
  // change to make unasked.

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
