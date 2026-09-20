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
// 'usage\s+instruction' (accuracy3 Step 2): a real over-capture bug found on
// honey-stick-style artwork -- a dosage sentence right after the list had
// no terminator to stop at, so the declaration ran straight into it.
// 'mfg\.?\s*by' (accuracy3 Step 2): the abbreviated form of "manufactured
// by" -- a real gap found on Calcimax pack 60 IRN169-2.pdf's flattened
// text ("Pillow pouches Mfg by: Osho Industries Ltd...").
const INGREDIENTS_TERMINATORS =
  /\b(nutritional\s+(facts|information)|recommended\s+usage|duration\s+of\s+usage|usage\s+instruction|storage|store\s+in|keep\s+(out|away)|marketed\s+by|manufactured\s+by|mfg\.?\s*by|packed\s+by|fssai|customer\s+care|consumer\s+care|net\s+(content|wt)|batch\s+no|mfg\.?\s*date|use\s+by|m\.?r\.?p|best\s+before|this\s+food\s+is|allergen|contains\s+permitted|not\s+for\s+medicinal|to\s+be\s+sold|images?\s+are|pouches?\s+not)/i;

// accuracy3 Step 2: the anchor phrases that introduce an ingredients
// declaration, generalized beyond the old "ingredients:" -- a mandatory
// colon on the bare English word only. Each alternative is whole-word
// matched (\b...\b) so "ingredients?" can't steal a prefix match off
// "ingredientes" (the Spanish spelling) before the longer alternative gets
// a chance.
//
// Deliberately NOT included: "each <unit> contains", despite it appearing
// in an earlier draft of this generalization. Real, ground-truth-verified
// conflict found while building this: Calcimax Pack 30/60 IRN168-2/
// 169-2.pdf (both scored labels) use "Each serving contains:" to introduce
// the NUTRITION TABLE, not ingredients -- adding it here would capture
// nutrition data as a fabricated ingredients value on real client labels,
// with no offsetting real-world case found where it actually introduces
// ingredients. See the test pinning this exclusion.
// Longer/more-specific alternatives listed first: regex alternation tries
// left-to-right and takes the first match at a position, not the longest,
// so "ingredient\s+list" and "ingredientes" must come before the bare
// "ingredients?" or it steals a prefix match first (e.g. "ingredient" out
// of "ingredient list", leaving "list:" as if it were part of the value).
// (?!-) after the word boundary: a real heading is followed by whitespace,
// a colon, or nothing; a coincidental line-wrap mid-compound-word is
// followed by "-continuation" (real regression found by measurement:
// "...All claims are\ningredient-based and not based on..." wraps the
// word "ingredient" onto its own line as part of "ingredient-based",
// which line-start alone can't tell apart from a genuine heading --
// Calcimax pack 60 IRN169-2.pdf, a scored label).
const INGREDIENTS_ANCHOR = /(^|\n)\s*\b(ingredient\s+list|ingredientes|ingredients?|composition)\b(?!-)\s*:?\s*/i;

/**
 * The ingredients declaration, or '' when the label has none.
 *
 * '' is absence, and the caller stores it as NULL — the comparison then reports
 * MISSING rather than matching one unread label against another.
 *
 * accuracy3 Step 2: the anchor search runs on newline-preserving normalised
 * text, not the fully flattened text the rest of this function uses --
 * INGREDIENTS_ANCHOR requires a line start (or string start), which is how
 * a bare colon-less "Ingredients" heading is told apart from the same word
 * appearing mid-sentence ('Made with only natural ingredients sourced
 * from...'). Validated against all 45 real scored labels' currently-
 * working extractions before shipping: zero regressions, plus one real,
 * previously-silent gap fixed (Immunogum 4S IRN131-1.pdf's Spanish-
 * language "Ingredientes:" declaration).
 */
export function extractIngredients(text: string): string {
  const normalised = normalise(text);
  const anchorMatch = normalised.match(INGREDIENTS_ANCHOR);
  if (!anchorMatch) return '';

  const afterAnchor = flatten(normalised.slice(anchorMatch.index! + anchorMatch[0].length));

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

// Text that reads like a claim but is a mandatory regulatory CATEGORY
// designation, not something the marketer chose to say -- the same kind of
// designation as "Dietary Supplement" in the US. Checked against EVERY
// match source below (Masters list included), not just CLAIM_BADGES: a
// real 45-label run (accuracy2 Step 4) showed 'Health Supplement' scores
// 21 wrong / 0 correct once a real knownClaims list flows through, because
// it's boilerplate text on nearly every label in this category but only
// 2 of 45 ground-truth reviews happened to record it as a claim. Case-
// insensitive exact match only -- this is a denylist for one specific,
// evidenced false positive, not a broad pattern.
const NEVER_A_CLAIM = new Set(['health supplement']);

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
  { pattern: /\busfda\s+registered\s+facility\b/i, claim: 'USFDA Registered Facility' },
  { pattern: /\bgmp\s+certified\b/i, claim: 'GMP Certified' },
  { pattern: /\bhalal\b/i, claim: 'Halal' }
  // Deliberately NOT here: 'Health Supplement'. It used to be, on the
  // reasoning that it reads like a badge the same way 'Vegetarian' or
  // 'Halal' does. A real 45-label run (eval/diff.py --mode pipeline
  // --field claims) showed that reasoning was wrong: it fired as WRONG on
  // 20 different labels and was never once CORRECT. Every reviewed label
  // treats it as the product's regulatory CATEGORY (the same kind of
  // designation as "Dietary Supplement", required by law to appear
  // somewhere on the pack) rather than a claim the marketer chose to make
  // — the same distinction that already keeps a plain ingredients
  // declaration out of this list.
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
  /**
   * accuracy3 Step 3: the same claims as a real array, in the same order
   * `claims` joins them in. Exists so a combined-badge claim whose own
   * text contains a literal " | " (see the FREE FROM matcher below) can be
   * told apart from three separately-joined claims -- something the
   * `claims` string alone can never do once split back apart by any
   * consumer using the same ' | ' delimiter this file joins with.
   */
  claimsList: string[];
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
    const trimmed = known.trim();
    if (NEVER_A_CLAIM.has(trimmed.toLowerCase())) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (escaped.length > 0 && new RegExp(`\\b${escaped}\\b`, 'i').test(flat)) {
      found.set(trimmed, true);
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
  // Step 6-follow-up (accuracy plan): a THIRD real shape was found the same
  // way, on the HSN/Iron/PMS label family — "FREE FROM GLUTEN MILK SOY"
  // printed as one design element, which the reviewed ground truth records
  // as ONE combined claim, 'Free From Gluten | Milk | Soy'. A matcher for
  // that shape was written and deliberately NOT kept: this codebase joins
  // a label's separate claims into one string with ' | ' EVERYWHERE (see
  // CLAIM_DELIMITER in scripts/extract-pipeline.ts, used by score.py) —
  // the exact same character sequence the ground truth chose to use
  // INSIDE this one claim's own text. A combined claim built that way
  // would round-trip correctly through this function's own return value.
  // It would not survive scoring: the delimiter-based parser downstream
  // splits it back into three meaningless fragments ('Free From Gluten',
  // 'Milk', 'Soy'), none of which match anything, so the fix could only
  // ever relabel three WRONG claims as three MISSING ones — no actual
  // accuracy gain — without a wider, deliberate change to how claims are
  // delimited project-wide, which is a bigger decision than this one bug
  // warrants making unilaterally.

  // accuracy3 Step 3: the previously-backed-out combined badge -- see
  // ClaimsResult.claimsList's own doc comment for why it's safe to ship
  // now. Confirmed on the actual label: Iron IRN74-1.pdf prints "FREE
  // FROM   GLUTEN | MILK | SOY" as one combined design element. Requires
  // an explicit "|"-separated run of at least two words (not "free from
  // artificial preservatives", ordinary prose with no pipes) and every
  // captured word to be in the same generic allergen/dietary allowlist
  // every other matcher here already uses, so this can't fire on
  // arbitrary "free from X | Y" text that isn't really an allergen badge.
  //
  // The SAME label also prints separate "GLUTEN FREE"/"MILK FREE"/
  // "SOY FREE" badges elsewhere -- a design redundancy for the exact same
  // fact the combined badge already states, not a second real claim.
  // combinedAllergens records every word a combined badge already
  // accounted for, so the individual FREE_CLAIM/NO_CLAIM matchers below
  // can skip them and avoid reporting both "Free From Gluten | Milk | Soy"
  // AND a separate "Gluten Free" for the same allergen (ground truth has
  // only the one combined entry for those three; ANOTHER allergen not
  // named in any combined badge, like "Gelatin Free" on this same label,
  // still has to be reported on its own).
  const FREE_FROM_COMBINED = /\bfree\s+from\s+([A-Za-z]+(?:\s*\|\s*[A-Za-z]+)+)/gi;
  const combinedAllergens = new Set<string>();
  for (const match of flat.matchAll(FREE_FROM_COMBINED)) {
    const words = match[1].split('|').map((w) => w.trim());
    if (words.length < 2 || !words.every((w) => ALLERGEN_DIETARY_WORDS.has(w.toLowerCase()))) continue;
    const claim = `Free From ${words.map((w) => `${w[0].toUpperCase()}${w.slice(1).toLowerCase()}`).join(' | ')}`;
    const alreadyKnown = [...found.keys()].some((existing) => existing.toLowerCase() === claim.toLowerCase());
    if (!alreadyKnown) found.set(claim, isKnown(claim, knownClaims));
    for (const w of words) combinedAllergens.add(w.toLowerCase());
  }

  // Real regression found the same way (Cal. Vit D/Iron/PMS/HSN families
  // again): "This food is by its nature gluten free." is a standard
  // regulatory disclaimer sentence, not a printed claim badge, but reads
  // identically to a real "gluten free" badge to this matcher. Every label
  // that carries it ALSO carries the real badge elsewhere in a different,
  // correct wording ("NO\nGLUTEN"), so left unguarded this sentence adds
  // nothing but a second, wrong, redundant claim for an allergen already
  // correctly found. A disclaimer-sentence SHAPE, not this client's
  // specific wording — "by nature"/"by its nature" is the generic tell,
  // and only excludes an "X free" match that directly follows it, not the
  // phrase "X free" anywhere else (a real, standalone "Gluten Free" badge
  // with no such lead-in still has to be reported, and is).
  const BY_NATURE_DISCLAIMER = /\bby\s+(its\s+)?nature\s*$/i;
  const FREE_CLAIM = /\b([A-Za-z]+)[\s-]free\b/gi;
  for (const match of flat.matchAll(FREE_CLAIM)) {
    const word = match[1];
    if (!ALLERGEN_DIETARY_WORDS.has(word.toLowerCase())) continue;
    if (combinedAllergens.has(word.toLowerCase())) continue;
    if (BY_NATURE_DISCLAIMER.test(flat.slice(Math.max(0, match.index - 20), match.index))) continue;
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
    if (combinedAllergens.has(word.toLowerCase())) continue;
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

  // A third language, not just a third shape: at least one client label
  // is printed for a Spanish-speaking market (Immunogum 4S IRN131-1.pdf,
  // exported to Venezuela) and uses "LIBRE DE <ALLERGEN>" the same way
  // other labels use "NO <ALLERGEN>" — confirmed on that label's actual
  // text, six standalone badges in a row: "LIBRE DE GELATINA LIBRE DE
  // GLUTEN LIBRE DE LÁCTEOS LIBRE DE MANÍ LIBRE DE NUEZ LIBRE DE SOYA".
  // A small, separate Spanish allergen vocabulary (not reusing the
  // English one — the words are different) keeps this exactly as safe as
  // the English "NO X" matcher above. Ground truth drops the accents when
  // it records the claim ("Lácteos" -> "Lacteos", "Maní" -> "Mani"), so
  // the accent is stripped before the word is checked against the
  // allowlist and before it's used to build the claim string, but the
  // regex itself still has to match the accented word as printed.
  const SPANISH_ALLERGEN_WORDS = new Set([
    'gelatina', 'gluten', 'lacteos', 'leche', 'soya', 'mani', 'nuez', 'nueces',
    'huevo', 'huevos', 'trigo', 'pescado', 'mariscos', 'azucar', 'cafeina',
    'colorantes', 'conservantes', 'gmo', 'transgenicos'
  ]);
  const stripAccents = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // No trailing \b: JS's \b is ASCII-only ([A-Za-z0-9_]), so it silently
  // fails to match right after an accented letter at the end of a word
  // (e.g. "MANÍ" followed by whitespace) — caught by this file's own test
  // suite. The character class on the capture group already limits what
  // can match, so the trailing boundary isn't needed for correctness.
  const LIBRE_DE_CLAIM = /\blibre\s+de\s+([A-Za-zÀ-ÿ]+)/gi;
  for (const match of flat.matchAll(LIBRE_DE_CLAIM)) {
    const normalizedWord = stripAccents(match[1]).toLowerCase();
    if (!SPANISH_ALLERGEN_WORDS.has(normalizedWord)) continue;
    const claim = `Libre de ${normalizedWord[0].toUpperCase()}${normalizedWord.slice(1)}`;
    const alreadyKnown = [...found.keys()].some(
      (existing) => existing.toLowerCase().startsWith(claim.toLowerCase())
    );
    if (!alreadyKnown) found.set(claim, isKnown(claim, knownClaims));
  }

  const claims = [...found.keys()];
  return {
    // ' | ' is the separator the existing comparison data uses
    // ('Supports Immunity | High in Vitamin C'), so a stored value from here is
    // directly comparable with one authored by hand.
    claims: claims.join(' | '),
    claimsList: claims,
    matched: claims.filter((claim) => found.get(claim) === true),
    unmatched: claims.filter((claim) => found.get(claim) !== true)
  };
}

function isKnown(claim: string, knownClaims: readonly string[]): boolean {
  return knownClaims.some((known) => known.trim().toLowerCase() === claim.toLowerCase());
}

// accuracy3 Step 3.3: generic verb-led claim sentences ("Supports Hair
// Health", "Helps Reduce Tiredness") — the recurring real shape a scan of
// all 45 labels' ground truth turned up, not built from any one label's
// specific wording. Generic across the industry the same way the fixed
// CLAIM_BADGES list and the allergen matchers above already are.
//
// "Contains" deliberately excluded despite being a real claim-verb on some
// labels ("Contains 40+ Ayurvedic herbs"): it's also exactly how an
// ingredients declaration itself commonly opens ("Contains: Corn Syrup,
// Sugar..."), and INGREDIENTS_SHAPE below only catches the literal word
// "ingredients"/"composition", not an arbitrary run of ingredient names —
// "Contains Corn Syrup Sugar Water" would otherwise slip through as a
// false claim. Left out rather than building a riskier, looser ingredients
// check just to admit one verb.
const CLAIM_VERB = /^(supports?|helps?|promotes?|boosts?|aids?|improves?|reduces?|prevents?|maintains?|provides?|enhances?|protects?|strengthens?|nourishes?|delivers?)\b/i;

// Shape exclusions: a line that LOOKS like a claim sentence but is really
// one of these other label sections. Each is a narrow, generic shape
// check (a unit, a digit pattern, a suffix, a symbol) — never built from
// one client's specific company/address/product text.
const NUTRITION_SHAPE = /\b\d+(\.\d+)?\s*(mg|mcg|g|kg|ml|l|kcal|iu|%)\b/i;
const INGREDIENTS_SHAPE = /\b(ingredients?|composition|ingredient\s+list)\b/i;
const COMPANY_SHAPE = /\b(pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|limited|llp|inc\.?)\b/i;
const ADDRESS_SHAPE = /\b\d{6}\b|\b(village|road|street|nagar|industrial\s+area|sector|highway)\b/i;
const REGULATORY_SHAPE = /\b(fssai|licen[cs]e|lic\.?\s*no|registered|regd\.?)\b/i;
const URL_SHAPE = /https?:\/\/|www\.|\.(com|in|org|net)\b/i;
const EMAIL_SHAPE = /@/;
const PHONE_SHAPE = /\b\d{10}\b|\b\d{3,5}[-\s]\d{6,8}\b/;

// A line whose only digits form a standalone "100%" or "40+" token still
// counts as digit-free for this matcher's purposes — both are real,
// recurring claim shapes ("100% Vegan", "Ayurvedic 40+ herbs") confirmed
// on real labels, not invented; any OTHER digit (a dose, a count, a
// measurement) is exactly the nutrition/ingredients-adjacent content this
// matcher must not mistake for a claim. Matched as a token anywhere in the
// line, not just its first/last characters -- a real claim can read
// "Supports 100% Natural Wellness" just as well as "100% Natural".
function hasDisallowedDigits(line: string): boolean {
  // No trailing \b after "%"/"+": both are non-word characters, so a \b
  // right after either can never match (a word boundary needs one side to
  // be a word character) -- caught by this file's own test suite.
  const stripped = line.replace(/\b100%/gi, '').replace(/\b40\+/gi, '');
  return /\d/.test(stripped);
}

const CASE_CONNECTOR_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'with', 'is', 'are']);

// Title Case (connector words may stay lowercase, every other word starts
// uppercase) or ALL CAPS — not ordinary sentence-case prose, which is the
// shape of a disclaimer or instruction, not a printed claim badge.
function isTitleCaseOrAllCaps(line: string): boolean {
  const words = line.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0) return false;
  if (words.every((w) => w === w.toUpperCase())) return true;
  return words.every((w, i) => {
    const bareLower = w.toLowerCase().replace(/[^a-z]/g, '');
    if (i > 0 && CASE_CONNECTOR_WORDS.has(bareLower)) return true;
    return /^[A-Z]/.test(w);
  });
}

/**
 * Candidate generic-shape claims found in `text` — verb-led sentences
 * naming a benefit, narrowly gated (see this file's own test suite for
 * the full list of real positive and negative shapes this was built and
 * validated against): 2-8 words, no digits except a leading "100%" or
 * trailing "40+", Title Case or ALL CAPS, starts with a generic claim
 * verb, and not shaped like nutrition, ingredients, a company name, an
 * address, a regulatory line, a URL, an email, or a phone number.
 *
 * Returns every CANDIDATE the shape rules allow — corroboration across
 * two independently-extracted texts and the 12/label cap are the CALLER's
 * job (mergeClaimsResults, labelExtraction.service.ts), not this
 * function's, the same separation of concerns extractClaims/
 * mergeClaimsResults already use for the badge/allergen matchers above.
 *
 * Deliberately does NOT implement the original directive's "OR lies in
 * the front panel" alternative to the verb requirement, or "OR >=0.9
 * PP-OCR confidence" alternative to corroboration — neither panel
 * geometry nor PP-OCR per-line confidence is available to this text-only
 * function. Under-catching (missing a real front-panel claim with no
 * verb, like "Great Taste") is the safe failure direction; a looser rule
 * without that signal would risk matching ordinary prose instead.
 */
// accuracy3 Step 3.3: anchored on the verb, not split into lines first —
// a first version that split on newlines fragmented real multi-line
// claims ("Support Strong Bones\n& Healthy Growth" became just "Support
// Strong Bones"), confirmed as a real 0%-true-positive/16-false-positive
// result validating against all 45 labels' ground truth. PDF text
// legitimately line-wraps mid-claim, so a fixed line boundary can't be
// trusted as a claim boundary.
//
// Instead, scans the FLATTENED text (newlines collapsed to spaces, same
// as every other matcher in this file) for each CLAIM_VERB occurrence,
// then windows forward from there up to whichever comes first: a
// sentence-ending punctuation mark, 8 words, or -- critically -- the
// START of the NEXT claim-verb match. That third bound is what tells
// "Support Strong Bones & Healthy Growth" (one real claim, no punctuation
// mid-sentence) apart from "Supports Hair Health Helps Maintain Healthy
// Skin" (two adjacent real claims on the same label with no punctuation
// between them either) -- without it, the second case merges into one
// over-long candidate that would either falsely span two claims or get
// rejected outright by the word-count gate, silently losing one of the
// two real claims either way.
// CLAIM_VERB.source (without its leading ^) reused here, not
// re-typed -- the same verb list, just anchored to occur ANYWHERE in the
// flattened text rather than only at the very start of the whole string.
// A real bug caught by this file's own test suite: naively wrapping
// CLAIM_VERB.source in a 'g' flag while its ^ anchor was still embedded
// meant it only ever matched once, at position 0.
const CLAIM_VERB_GLOBAL = new RegExp(`\\b${CLAIM_VERB.source.replace(/^\^/, '')}`, 'gi');
const SENTENCE_END = /[.!?]/;

export function findGenericShapeClaims(text: string): string[] {
  const flat = flatten(text);
  const rawVerbMatches = [...flat.matchAll(CLAIM_VERB_GLOBAL)];

  // Real bug caught the same way: several real claims use two DIFFERENT
  // verbs from this list back to back ("Helps Maintain Healthy Skin",
  // "Helps Reduce Tiredness") -- the second verb was being treated as the
  // start of a brand-new claim, splitting "Helps" off on its own (too
  // short, discarded) and losing the real claim's own leading word. A verb
  // match only counts as a genuine new claim boundary when there is at
  // least one real word between it and the previous verb match; back-to-
  // back DIFFERENT verbs stay part of the same claim's window.
  //
  // Deliberately NOT merged: the SAME verb root repeated back to back
  // (e.g. "...DAILY NUTRITIONAL SUPPORT\nSUPPORTS IMMUNITY", a real
  // Multivitamin Gummies.pdf badge layout) -- confirmed as a real false
  // positive ("SUPPORT SUPPORTS IMMUNITY", one garbled candidate instead
  // of two real separate claims). A genuine compound verb phrase never
  // repeats the same root; a design layout running two adjacent badge
  // captions together can and does.
  const verbRoot = (word: string): string => word.toLowerCase().replace(/s$/, '');
  const verbMatches = rawVerbMatches.filter((match, i) => {
    if (i === 0) return true;
    const previous = rawVerbMatches[i - 1];
    // Same root repeated: always a genuine new claim boundary, never a
    // compound-verb continuation to merge away.
    if (verbRoot(previous[0]) === verbRoot(match[0])) return true;
    const gap = flat.slice(previous.index! + previous[0].length, match.index!);
    return gap.trim().length > 0;
  });

  const candidates: string[] = [];
  for (let i = 0; i < verbMatches.length; i++) {
    const start = verbMatches[i].index!;
    const nextVerbStart = i + 1 < verbMatches.length ? verbMatches[i + 1].index! : flat.length;
    const rest = flat.slice(start, nextVerbStart);

    const terminator = rest.search(SENTENCE_END);
    const bounded = terminator === -1 ? rest : rest.slice(0, terminator);

    // Word count checked on the FULL window, before any truncation -- an
    // over-long window (marketing prose, or two claims that failed to
    // split apart) must be rejected outright, never silently chopped down
    // to its first 8 words and passed off as a real, complete claim.
    const words = bounded.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 8) continue;
    const line = words.join(' ');

    // A trailing "*" is a footnote marker pointing at qualifying fine
    // print elsewhere on the label -- a real, recurring shape (Sleeprio
    // Gummies.pdf prints "SUPPORTS RELAXATION*", "PROMOTES RESTFUL
    // SLEEP*", "Helps Regulate Sleep Cycle*") that ground truth does NOT
    // record as its own standalone claim, unlike the same label's
    // unqualified badges. A conditional, footnoted statement is a
    // different, weaker kind of claim than an unqualified one; treating
    // them the same overstates what the label actually asserts.
    if (/\*\s*$/.test(line)) continue;

    if (hasDisallowedDigits(line)) continue;
    if (!isTitleCaseOrAllCaps(line)) continue;
    if (NUTRITION_SHAPE.test(line)) continue;
    if (INGREDIENTS_SHAPE.test(line)) continue;
    if (COMPANY_SHAPE.test(line)) continue;
    if (ADDRESS_SHAPE.test(line)) continue;
    if (REGULATORY_SHAPE.test(line)) continue;
    if (URL_SHAPE.test(line)) continue;
    if (EMAIL_SHAPE.test(line)) continue;
    if (PHONE_SHAPE.test(line)) continue;
    if (INGREDIENTS_TERMINATORS.test(line)) continue;

    if (!candidates.some((c) => c.toLowerCase() === line.toLowerCase())) {
      candidates.push(line);
    }
  }
  return candidates;
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
