// Unit tests for the three text-derived label parameters. Pure functions over
// strings — no database, no files, no network — so these run everywhere.
//
// The fixtures are real text shapes taken from the dataset artwork
// (IMH-LVS/Dataset Example), including its draw-order jumbling, because that
// jumbling is what broke the first version of the claims extractor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractClaims,
  extractIngredients,
  extractNutritionTableFormat,
  splitIngredientsList,
  findGenericShapeClaims
} from '../services/labelSemanticExtractor.service';

const MASTER_CLAIMS = ['Supports Immunity', 'Sugar Free', 'High in Vitamin C', 'No Added Preservatives'];

// Reproduced from the NutriBears artwork, multi-space artefacts and all.
const NUTRIBEARS_INGREDIENTS = `Ingredients: Corn Syrup, Sugar, Water, Gelling Agent (INS 440), Acidity
Regulator (INS 330 & 331iii), Vitamin C, Sodium Chloride, Vitamin E,
Pantothenic   Acid,   Zinc,   Magnesium,   Choline,   Strawberry   &   Orange
Flavour, Food Colour: Black Carrot Concentrate (INS 163) & Paprika (INS
160c), Vitamin A, Folic Acid, Iodine, Vitamin D, Vitamin B12, Inositol. This
food is by nature gluten free.`;

test('reads an ingredients declaration across lines and collapses PDF spacing', () => {
  const ingredients = extractIngredients(NUTRIBEARS_INGREDIENTS);
  assert.match(ingredients, /^Corn Syrup, Sugar, Water/);
  assert.match(ingredients, /Pantothenic Acid, Zinc, Magnesium/);
  assert.match(ingredients, /Inositol\.$/);
  // The disclaimer that follows the list is not part of it.
  assert.equal(ingredients.includes('by nature gluten free'), false);
});

test('treats a label with no ingredients declaration as absent, not empty-ish', () => {
  assert.equal(extractIngredients('Net Content: 30 N\nBatch No.\nMfg. Date'), '');
});

test('does not mistake a cross-reference for a declaration', () => {
  assert.equal(extractIngredients('For allergens see ingredients: overleaf.'), '');
});

// accuracy3 Step 2: generalizing the anchor beyond a mandatory colon on the
// bare English word. Real, ground-truth-verified gap: Immunogum 4S
// IRN131-1.pdf (one of the 45 scored labels) is a Spanish-language label
// whose declaration reads "Ingredientes:", which the old
// /\bingredients?\s*:/i anchor never matched (it isn't "ingredient" or
// "ingredients" as a whole word) -- the label's real 15-item ingredients
// list was silently missed entirely.
test('recognizes the Spanish spelling "Ingredientes" as an anchor (real gap: Immunogum 4S IRN131-1.pdf)', () => {
  const ingredients = extractIngredients(
    'Ingredientes: Ácido Cítrico, sabor a mango, extracto de saúco, vitamina E, Pectina, zinc.'
  );
  assert.match(ingredients, /^Ácido Cítrico, sabor a mango/);
  assert.equal(ingredients.includes('Ingredientes'), false, 'the anchor word itself is stripped from the declaration');
});

test('recognizes "Composition" as an anchor, not just "Ingredients"', () => {
  const ingredients = extractIngredients('Composition: Vitamin C, Zinc, Magnesium, Calcium.');
  assert.match(ingredients, /^Vitamin C, Zinc, Magnesium/);
});

test('recognizes "Ingredient List" as an anchor', () => {
  const ingredients = extractIngredients('Ingredient List: Honey, Ginger Extract, Black Pepper Extract, Cardamom.');
  assert.match(ingredients, /^Honey, Ginger Extract/);
});

// accuracy3 Step 2: colon becomes optional -- some artwork uses a
// heading-style layout ("Ingredients" alone on its own line, the list on
// the line(s) after) rather than "Ingredients: <list>" on one line. Colon
// still works when present (every other test in this file already proves
// that); this proves the anchor also fires without one, as long as it's
// genuinely at the start of a line.
test('recognizes a colon-less heading-style anchor ("Ingredients" alone on its own line)', () => {
  const ingredients = extractIngredients('Ingredients\nCorn Syrup, Sugar, Water, Pectin.');
  assert.match(ingredients, /^Corn Syrup, Sugar, Water/);
});

// accuracy3 Step 2's own directive text suggested "each <unit> contains" as
// a fourth anchor phrase -- deliberately NOT implemented. Real, ground-
// truth-verified conflict: Calcimax Pack 30/60 IRN168-2/169-2.pdf (both
// scored labels) use "Each serving contains:" to introduce the NUTRITION
// TABLE, not ingredients. Adding it as an ingredients anchor would capture
// nutrition data as a fabricated "ingredients" value on real client
// labels -- this test pins that the anchor is NOT recognized, so a future
// change doesn't reintroduce it by accident.
test('does NOT treat "each ... contains" as an ingredients anchor -- real conflict with the nutrition table (Calcimax Pack 30/60)', () => {
  const text = 'Each serving contains: Kids % RDA Children % RDA\nElemental Calcium 125 mg 19.50 250 mg 25.00';
  assert.equal(extractIngredients(text), '');
});

// accuracy3 Step 2: without the line-start requirement, a bare mid-sentence
// mention of the word "ingredients" followed by an unrelated comma list
// (an address, a claims list, anything) could be mistaken for a
// declaration once the colon stopped being mandatory. Line-start anchoring
// is what keeps that safe.
test('a mid-sentence mention of "ingredients" with no colon is NOT mistaken for a declaration', () => {
  const text = 'Made with only natural ingredients sourced from trusted farms, Acme Wellness, Mumbai, India.';
  assert.equal(extractIngredients(text), '');
});

// accuracy3 Step 2: real regression caught by a score.py measurement after
// this whole generalization first shipped (Calcimax pack 60 IRN169-2.pdf,
// a scored label). Line-start alone isn't enough to tell a real heading
// from a coincidental line-wrap: "...All claims are\ningredient-based and
// not based on the final product." wraps the word "ingredient" onto its
// own line as part of the compound word "ingredient-based", which the
// colon-optional anchor matched as if it were a real heading -- then
// captured the unrelated allergen-free list that followed as "ingredients"
// instead of the label's real declaration further down. Fixed with a
// negative lookahead rejecting a hyphen immediately after the anchor word
// (a real heading is always followed by whitespace, a colon, or nothing;
// a line-wrapped compound word is followed by "-continuation").
test('a line-wrapped compound word ("ingredient-based") is NOT mistaken for a heading -- real regression on Calcimax pack 60 IRN169-2.pdf', () => {
  const text =
    'This product is not meant to diagnose any disease. All claims are\n' +
    'ingredient-based and not based on the final product.\n' +
    'Free of:\n' +
    'Proteins, Trans Fats, Saturated Fats, Cholesterol, Gelatin, Wheat (Gluten), Milk, Eggs, Soy.\n' +
    'Ingredients: Maltitol Syrup (INS 965), Water, Gelling Agents (INS 440), Acidity Regulator.';
  const ingredients = extractIngredients(text);
  assert.equal(ingredients.includes('Proteins'), false, 'must not capture the unrelated allergen-free list');
  assert.match(ingredients, /^Maltitol Syrup/, 'must find the REAL declaration further down instead');
});

// accuracy3 Step 2: a real over-capture bug found while investigating the
// anchor gap above (pre-existing, not introduced by this change) -- a
// dosage/usage-instruction sentence right after the ingredients list on
// several real labels (e.g. a Shilajit honey-stick artwork) has no
// terminator word in the old list, so the declaration ran straight into
// "Usage Instruction: 1 stick a day...".
test('stops at "Usage Instruction" -- a real over-capture bug on honey-stick-style artwork', () => {
  const text = 'Ingredients: Honey, Proprietary Blend (Tulsi Extract, Guava Extract), Natural Vitamin C.\nUsage Instruction: 1 stick a day for children.';
  const ingredients = extractIngredients(text);
  assert.equal(ingredients.includes('Usage Instruction'), false);
  assert.equal(ingredients.includes('stick a day'), false);
  assert.match(ingredients, /Natural Vitamin C\.$/);
});

// accuracy3 Step 2: another real over-capture bug, found while investigating
// the Calcimax pack 60 regression above (via the PDF's own flattened text --
// see mergeIngredientsResults in labelExtraction.service.ts) -- "Mfg by:" is
// the abbreviated form of "Manufactured by:" the old terminator list only
// had spelled out in full.
test('stops at "Mfg by" -- the abbreviated form of "Manufactured by" (real gap on Calcimax pack 60 IRN169-2.pdf)', () => {
  const text = 'Ingredients: Maltitol Syrup, Water, Gelling Agents, Vitamin D.\nPillow pouches Mfg by: Osho Industries Ltd. CPCB Regn. No.';
  const ingredients = extractIngredients(text);
  assert.equal(ingredients.includes('Mfg by'), false);
  assert.equal(ingredients.includes('Osho Industries'), false);
  assert.match(ingredients, /Vitamin D\.$/);
});

// Step 5.2 (accuracy plan): splitting an ingredients declaration into
// discrete items on every comma breaks any item whose own name contains a
// comma inside parentheses/brackets -- an INS food-additive code list being
// the single dominant real-world case (Step 1.2's diff sample: ~83% of
// wrong ingredients items were exactly this). Real examples below are from
// this file's own NUTRIBEARS_INGREDIENTS fixture and from a real
// eval/diff.py --field ingredients run (see STEP1_FAILURE_ANALYSIS.md /
// STEP5 report), not invented.
test('splitIngredientsList: a comma inside parentheses does not split the item', () => {
  const items = splitIngredientsList('Gelling Agent (INS 440), Acidity Regulator (INS 330 & 331iii)');
  assert.deepEqual(items, ['Gelling Agent (INS 440)', 'Acidity Regulator (INS 330 & 331iii)']);
});

test('splitIngredientsList: real multi-code INS list from a diff stays one item, not three fragments', () => {
  // Real wrong-answer fragments from eval/diff.py: predicted 'Gelling
  // Agents (INS 440', '418', '407)' as three separate items instead of one.
  const items = splitIngredientsList('Corn Syrup, Gelling Agents (INS 440, 418, 407), Sugar');
  assert.deepEqual(items, ['Corn Syrup', 'Gelling Agents (INS 440, 418, 407)', 'Sugar']);
});

test('splitIngredientsList: the full NUTRIBEARS fixture splits into exactly its real ingredients, no INS fragments', () => {
  const declaration = extractIngredients(NUTRIBEARS_INGREDIENTS);
  const items = splitIngredientsList(declaration);
  assert.ok(items.includes('Gelling Agent (INS 440)'));
  assert.ok(items.includes('Acidity Regulator (INS 330 & 331iii)'));
  assert.ok(items.includes('Food Colour: Black Carrot Concentrate (INS 163) & Paprika (INS 160c)'));
  // None of the parenthetical INS numbers leaked out as their own item.
  assert.equal(items.some((item) => /^\d+\)?$/.test(item.trim())), false);
});

test('splitIngredientsList: an item with brackets instead of parentheses is also kept whole', () => {
  const items = splitIngredientsList('Vitamin C [as Ascorbic Acid, 40 mg], Zinc');
  assert.deepEqual(items, ['Vitamin C [as Ascorbic Acid, 40 mg]', 'Zinc']);
});

test('splitIngredientsList: plain comma-separated items with no parentheses split as before', () => {
  assert.deepEqual(splitIngredientsList('Sugar, Water, Gelatin'), ['Sugar', 'Water', 'Gelatin']);
});

test('splitIngredientsList: blank input returns an empty list', () => {
  assert.deepEqual(splitIngredientsList(''), []);
});

// Real, common wrong-answer pattern from a real 45-label run: comma-
// splitting alone leaves the whole declaration's closing full stop
// attached to the last item ("Vitamin D." instead of "Vitamin D") -- 27
// of 75 wrong ingredient answers in one real run were exactly this.
test('splitIngredientsList: strips the declaration-ending period from the last item', () => {
  const items = splitIngredientsList('Tricalcium Phosphate, Vitamin D.');
  assert.deepEqual(items, ['Tricalcium Phosphate', 'Vitamin D']);
});

test('splitIngredientsList: a real parenthetical item is not damaged by the period fix', () => {
  const items = splitIngredientsList('Corn Syrup, Natural Sweetener Stevia (INS 960).');
  assert.deepEqual(items, ['Corn Syrup', 'Natural Sweetener Stevia (INS 960)']);
});

// accuracy3 Step 3: extractClaims now also returns claimsList -- the raw
// array before it gets joined with ' | ' into the claims string. Needed so
// a combined-badge claim whose OWN text contains a literal " | " (see the
// FREE FROM matcher below) can round-trip as one array element instead of
// being indistinguishable from three separately-joined claims.
test('claimsList is the same claims as an array, in the same order as the joined string', () => {
  const result = extractClaims('Gluten Free. Sugar Free.', MASTER_CLAIMS);
  assert.deepEqual(result.claimsList, result.claims.split(' | '));
  assert.deepEqual(new Set(result.claimsList), new Set(['Gluten Free', 'Sugar Free']));
});

// accuracy3 Step 3: the previously-backed-out combined badge, now safe to
// ship because claimsList is a real array -- see this file's own note just
// above the matcher for the full history (the codebase joins every OTHER
// claim on a label with the exact same ' | ' the ground truth chose to use
// INSIDE this one claim's text; that only breaks the ' | '-joined STRING
// form, not a real array). Confirmed on the actual label: Iron IRN74-1.pdf
// prints "FREE FROM   GLUTEN | MILK | SOY" as one combined design element,
// alongside six separate "<allergen> free" badges elsewhere on the same
// label; ground truth records it as one claim, "Free From Gluten | Milk |
// Soy".
test('reports "FREE FROM X | Y | Z" as one combined claim, not three fragments -- real badge on Iron IRN74-1.pdf', () => {
  const text = 'FREE FROM   GLUTEN | MILK | SOY \nFor Kids & Adults';
  const result = extractClaims(text, []);
  assert.ok(result.claimsList.includes('Free From Gluten | Milk | Soy'));
  // The combined claim's own internal " | " must not fragment it when the
  // array is later re-joined with the same delimiter for the legacy string
  // field -- proven by finding it back out as one element, not three.
  assert.equal(result.claimsList.filter((c) => /gluten|milk|soy/i.test(c)).length, 1);
});

test('a combined "FREE FROM X | Y" badge with only two allergens still reports correctly', () => {
  const text = 'FREE FROM GLUTEN | SOY';
  const result = extractClaims(text, []);
  assert.ok(result.claimsList.includes('Free From Gluten | Soy'));
});

test('does not report a combined badge from ordinary "free from" prose with no allergen list', () => {
  const text = 'This product is free from artificial preservatives and colours, made with love.';
  const result = extractClaims(text, []);
  assert.equal(result.claimsList.some((c) => c.toLowerCase().startsWith('free from')), false);
});

// accuracy3 Step 3: real label shape (Iron IRN74-1.pdf's actual text) --
// the SAME three allergens the combined badge names ALSO appear as
// separate standalone "GLUTEN FREE"/"MILK FREE"/"SOY FREE" badges
// elsewhere on the same label (a design redundancy, not a second real
// claim). Ground truth records only the one combined claim for those
// three, not four entries for the same fact. An allergen NOT part of the
// combined badge ("Gelatin Free", printed separately, no pipe-list
// anywhere) still has to be reported on its own.
test('an allergen already covered by a combined "FREE FROM" badge is not ALSO reported as its own separate claim -- real duplicate risk on Iron IRN74-1.pdf', () => {
  const text = 'GELATIN FREE \nGLUTEN FREE \nMILK FREE \nPEANUT FREE \nNUT FREE \nSOY FREE \nFREE FROM   GLUTEN | MILK | SOY';
  const result = extractClaims(text, []);
  assert.ok(result.claimsList.includes('Free From Gluten | Milk | Soy'));
  assert.equal(result.claimsList.includes('Gluten Free'), false);
  assert.equal(result.claimsList.includes('Milk Free'), false);
  assert.equal(result.claimsList.includes('Soy Free'), false);
  // Allergens outside the combined badge still report normally.
  assert.ok(result.claimsList.includes('Gelatin Free'));
  assert.ok(result.claimsList.includes('Peanut Free'));
  assert.ok(result.claimsList.includes('Nut Free'));
});

// THE REGRESSION THIS FILE EXISTS FOR.
//
// PDF text arrives in draw order, so these separate design elements from the
// NutriBears front panel flatten into one line. The first version of
// extractClaims matched a verb-led pattern across them and reported
// 'Support B Vitamin C' — a claim that appears nowhere on the label. Inventing
// a claim on a pharma label is a compliance incident, so this must stay empty.
test('never fabricates a claim from draw-order jumbled design elements', () => {
  const jumbled = 'VITAMIN A\nEye\nHealth\nA\nB VITAMINS\nCell\nSupport\nB\nVITAMIN C\nImmune\nDefence\nC';
  const result = extractClaims(jumbled, MASTER_CLAIMS);
  assert.deepEqual(result.claims, '');
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.unmatched, []);
});

test('never lifts a claim out of marketing prose', () => {
  const prose =
    'NutriBears is India’s #1st gummy vitamin brand launched way back in 2012. ' +
    'Our aim is to help them get their daily requirement of vitamins & minerals.';
  assert.equal(extractClaims(prose, MASTER_CLAIMS).claims, '');
});

test('reports badge claims present on the label', () => {
  const text = 'NATURAL COLOURS & FLAVOURS\nGLUTEN FREE\nGMP CERTIFIED';
  const result = extractClaims(text, MASTER_CLAIMS);
  assert.deepEqual(result.claims.split(' | ').sort(), ['GMP Certified', 'Gluten Free', 'Natural Colours & Flavours']);
});

// Step 5.3 (accuracy plan): claims are barely found at all (327 of 383
// ground-truth claim cells missing) because the badge list only recognised
// two specific "X Free" claims (gluten, sugar) out of the many real ones on
// the actual dataset — Gelatin Free, Milk Free, Nut Free, Peanut Free, Soy
// Free are all real claims from the ground truth annotations
// (finetune/reviewed/annotations), not invented. Generalised to the SHAPE
// (any short word immediately followed by "free"), per the directive's own
// "... free" pattern, rather than hardcoding each allergen name.
test('reports the generic "X Free" claim shape for allergens the fixed badge list never had', () => {
  const text = 'Gelatin Free. Milk Free. Nut Free. Peanut Free. Soy Free.';
  const result = extractClaims(text);
  assert.deepEqual(result.claims.split(' | ').sort(), ['Gelatin Free', 'Milk Free', 'Nut Free', 'Peanut Free', 'Soy Free']);
});

test('"X Free" claim shape is case-insensitive and normalises to Title Case', () => {
  const result = extractClaims('DAIRY FREE');
  assert.deepEqual(result.claims.split(' | '), ['Dairy Free']);
});

test('does not report "Toll Free" as a claim near a customer care number', () => {
  // Real risk on this label family: "Toll Free: 1800-555-1234" appears in
  // the customer-care section of several real labels, right next to
  // genuine claims text -- structurally identical to "Nut Free" otherwise.
  const result = extractClaims('Gluten Free. Customer Care Toll Free: 1800-555-1234');
  assert.equal(result.claims.includes('Toll Free'), false);
  assert.ok(result.claims.includes('Gluten Free'));
});

// Real regression found by running the "X Free" shape-matcher (above)
// against the client's actual 45 labels: OCR misreads a letter or two right
// before a genuine "free" elsewhere on the label, and the shape matcher
// -- which accepted ANY word immediately before "free" -- reported the
// misread fragment as its own claim. None of these fragments were invented
// for this test; every one is copied verbatim from a real diff.py run
// (eval/diff.py --mode pipeline --field claims): "D Free", "Wilk Free",
// "Nay Free", "Aicima Free", "Seby Free", "Ees Free", "Eruchy Free" and
// others, none of which the label actually says. Fixed by checking the
// captured word against a small, generic allergen/dietary vocabulary
// (the same kind of common terms — gluten, milk, soy, nut, peanut,
// dairy, egg, wheat, gelatin — every food/supplement label in this
// industry uses, not anything specific to one client's products) instead
// of accepting every shape match.
test('does not report OCR-garbled fragments before "free" as claims', () => {
  const result = extractClaims('RIOMEDICA D Free HEALTHCARE Wilk Free Nay Free Aicima Free Seby Free Ees Free Eruchy Free');
  assert.equal(result.claims, '');
});

test('still reports the real allergen "X Free" claims alongside OCR-garbled noise on the same label', () => {
  const result = extractClaims('Gluten Free. Milk Free. Nut Free. Peanut Free. Soy Free. Wilk Free. D Free.');
  assert.deepEqual(
    result.claims.split(' | ').sort(),
    ['Gluten Free', 'Milk Free', 'Nut Free', 'Peanut Free', 'Soy Free']
  );
});

// Real second claim shape found on the same real label (Cal. Vit D
// IRN120-1.pdf, dumped via its actual PDF text layer): six allergens
// printed as standalone two-line badges — "NO\nGELATIN", "NO\nGLUTEN",
// "NO\nMILK", "NO\nPEANUT", "NO\nNUT", "NO\nSOY" — a completely different
// shape from "<allergen> free", and previously not recognised by anything
// in this file (all six were MISSING, not just mis-cased, in a real
// score.py run). Gated by the same allergen allowlist as the "X Free"
// matcher, since "no" alone is common in ordinary label prose ("do not
// exceed...", "not meant to diagnose...") in a way "X free" mostly isn't.
test('reports the "NO X" allergen badge shape, a real second claim wording on the same label family', () => {
  const result = extractClaims('NO GELATIN NO GLUTEN NO MILK NO PEANUT NO NUT NO SOY');
  assert.deepEqual(
    result.claims.split(' | ').sort(),
    ['No Gelatin', 'No Gluten', 'No Milk', 'No Nut', 'No Peanut', 'No Soy']
  );
});

test('does not treat ordinary "no <word>" label prose as an allergen claim', () => {
  // The word right after "no" here is real prose, not an allergen — the
  // allowlist gate (shared with the "X Free" matcher) has to reject this
  // the same way it rejects OCR garbage before "free".
  const result = extractClaims('No returns will be accepted once the seal is broken. No warranty is implied.');
  assert.equal(result.claims, '');
});

// Real bug found reading claims' real wrong-answer list (eval/diff.py
// --mode pipeline --field claims, a real 45-label run): "This food is by
// its nature gluten free." is a standard regulatory disclaimer sentence
// printed verbatim (or near enough) on several of this client's labels
// (Cal. Vit D, Iron, PMS, HSN families all carry it) — a descriptive
// phrase inside ordinary prose, not a printed claim badge. The "X Free"
// shape matcher can't tell "gluten free" here from a real standalone
// badge, and on every one of those labels the real badge ALREADY exists
// elsewhere in the correct wording ("NO\nGLUTEN"), so the sentence just
// adds a second, WRONG, redundant "Gluten Free" claim alongside the
// correct "No Gluten" one. A disclaimer phrase, not a specific client's
// wording, so excluding it is generic the same way "Toll Free" already is.
test('does not report "X free" inside the standard "by (its) nature ... free" disclaimer sentence as a claim', () => {
  const result = extractClaims(
    'NO GLUTEN NO MILK. This food is by its nature gluten free. Free of: Proteins, Total Fat.'
  );
  assert.deepEqual(result.claims.split(' | ').sort(), ['No Gluten', 'No Milk']);
});

test('the disclaimer-sentence exclusion is specific to "by nature", not a blanket "X free" refusal', () => {
  // The same sentence shape without the disclaimer lead-in is still a real
  // claim shape and must still be reported — this isn't a ban on "gluten
  // free" as a phrase, only on this one specific prose construction.
  const result = extractClaims('This product is gluten free.');
  assert.deepEqual(result.claims.split(' | '), ['Gluten Free']);
});

// Real bug found the same way: a real label (EYE WELLNESS DOMESTIC LABEL
// MHJ.pdf) prints bare "No Preservatives", but the one CLAIM_BADGES
// pattern that existed always reported 'No Added Preservatives' whether
// or not "added" was actually printed — fabricating a claim the label
// doesn't make while missing the one it does.
test('reports "No Preservatives" as its own claim, distinct from "No Added Preservatives"', () => {
  const bare = extractClaims('No Preservatives');
  assert.deepEqual(bare.claims.split(' | '), ['No Preservatives']);

  const added = extractClaims('No Added Preservatives');
  assert.deepEqual(added.claims.split(' | '), ['No Added Preservatives']);
});

test('reports "No Artificial Colours" as a claim badge', () => {
  const result = extractClaims('No Artificial Colours');
  assert.deepEqual(result.claims.split(' | '), ['No Artificial Colours']);
});

// Real claim shape from a real Spanish-market label (Immunogum 4S
// IRN131-1.pdf, exported to Venezuela), dumped from its actual PDF text:
// "LIBRE DE GELATINA   LIBRE DE GLUTEN   LIBRE DE LÁCTEOS   LIBRE DE
// MANÍ   LIBRE DE NUEZ   LIBRE DE SOYA" as six standalone badges, the
// same shape as the English "NO X" badges above but in Spanish. Ground
// truth records the claim text with accents stripped ("Lácteos" ->
// "Lacteos", "Maní" -> "Mani") even though the label prints them
// accented.
test('reports the Spanish "LIBRE DE X" allergen badge shape, accents stripped to match ground truth', () => {
  const result = extractClaims(
    'LIBRE DE GELATINA   LIBRE DE GLUTEN   LIBRE DE LÁCTEOS   LIBRE DE MANÍ   LIBRE DE NUEZ   LIBRE DE SOYA'
  );
  assert.deepEqual(
    result.claims.split(' | ').sort(),
    ['Libre de Gelatina', 'Libre de Gluten', 'Libre de Lacteos', 'Libre de Mani', 'Libre de Nuez', 'Libre de Soya']
  );
});

test('does not treat ordinary "libre de <word>" Spanish prose as a claim', () => {
  // "de" is a common Spanish preposition -- the allowlist gate has to
  // reject an ordinary phrase the same way the English "no <word>" gate
  // rejects ordinary prose.
  const result = extractClaims('Este producto es libre de preocupaciones para toda la familia.');
  assert.equal(result.claims, '');
});

// A claim on the label with no master record is still stored — omitting it
// would let two differently-claiming labels compare as a MATCH — but it is
// reported separately so a Manager knows what the Claims master is missing.
test('separates claims the Masters module knows from ones it does not', () => {
  const result = extractClaims('Supports Immunity. Gluten Free.', MASTER_CLAIMS);
  assert.deepEqual(result.matched, ['Supports Immunity']);
  assert.deepEqual(result.unmatched, ['Gluten Free']);
  assert.equal(result.claims, 'Supports Immunity | Gluten Free');
});

test('matches a master claim broken across lines by the PDF', () => {
  const result = extractClaims('High in\nVitamin C', MASTER_CLAIMS);
  assert.deepEqual(result.matched, ['High in Vitamin C']);
});

// Step 4 (accuracy2 plan): 'Health Supplement' was already deliberately kept
// OUT of CLAIM_BADGES (see that list's own comment) after a real 45-label
// run showed it fires as WRONG everywhere and is never CORRECT -- every
// reviewed label treats it as the product's mandatory regulatory CATEGORY,
// the same kind of designation as "Dietary Supplement", not a claim the
// marketer chose to make. But the Masters-matching loop above has no
// equivalent guard: once accuracy2 Step 2 wired a real knownClaims list
// through, and exactly 2 of 45 ground-truth labels happened to record
// 'Health Supplement' as a claim, it started firing as a false positive on
// every OTHER label whose OCR text also carries this boilerplate category
// text (confirmed: 21 wrong / 0 correct in a real masters-on pipeline run).
// The same policy decision has to hold regardless of which path found the
// match.
test('never reports "Health Supplement" as a claim, even when it is in the Masters list', () => {
  const result = extractClaims('Health Supplement. Gluten Free.', ['Health Supplement', 'Gluten Free']);
  assert.deepEqual(result.matched, ['Gluten Free']);
  assert.equal(result.claims, 'Gluten Free');
});

// ---------------------------------------------------------------------
// accuracy3 Step 3.3: the generic claim-shape extractor
// ---------------------------------------------------------------------
//
// Every fixed matcher above only catches a specific closed vocabulary
// (badge list, allergen words). Scanning all 45 real labels' ground-truth
// claims against what those matchers currently find turned up 297 real
// misses (eval, not invented) -- most far too long to be a real badge
// (marketing prose, correctly excluded by design), but a real, recurring
// SHAPE showed up across many different labels' front panels: a short,
// verb-led sentence naming a benefit ("Supports Hair Health", "Helps
// Reduce Tiredness", "Supports Menstrual Comfort"). This is the shape
// findGenericShapeClaims targets, gated narrowly to avoid the fabrication
// risk a loose "any short sentence" rule would carry:
//   - 2-8 words
//   - no digits, except a leading "100%" or trailing "40+"
//   - Title Case or ALL CAPS (not ordinary sentence-case prose)
//   - starts with a generic claim verb (Supports/Helps/Promotes/...)
//   - not shaped like nutrition, ingredients, a terminator phrase,
//     a company name, an address, a regulatory line, a URL, an email,
//     or a phone number
//
// NOT implemented, on purpose, and worth being explicit about: the
// original directive's "OR lies in the front panel" alternative to the
// claim-verb requirement, and "OR >=0.9 PP-OCR confidence" alternative to
// two-source corroboration. Neither panel geometry nor PP-OCR per-line
// confidence is available to this text-only function; extending it to use
// them is future work, not silently approximated here. This function
// finds CANDIDATES only -- corroboration across two independently-
// extracted texts and the 12/label cap are applied by the caller
// (mergeClaimsResults, labelExtraction.service.ts), the same place
// mergeClaimsResults already unions claims from two text sources.
//
// The "100%"/"40+" digit exception is a standalone-token allowance
// (either may appear anywhere in an otherwise verb-led, digit-free
// sentence), not strictly the first/last characters of the line -- a bare
// non-verb "100% Vegan" or "Ayurvedic 40+ herbs" (the real ground-truth
// wording) still needs the front-panel path this function doesn't
// implement, same as "Great Taste" above.
test('findGenericShapeClaims: catches real verb-led claim sentences found missing on real labels (HSN/Iron/PMS families)', () => {
  const text = 'Supports Hair Health\nHelps Maintain Healthy Skin\nHelps Maintain Healthy Nails';
  const claims = findGenericShapeClaims(text);
  assert.ok(claims.includes('Supports Hair Health'));
  assert.ok(claims.includes('Helps Maintain Healthy Skin'));
  assert.ok(claims.includes('Helps Maintain Healthy Nails'));
});

test('findGenericShapeClaims: catches a real multi-word claim with "&" and no digits (Calrio IRN159-1.pdf)', () => {
  const claims = findGenericShapeClaims('Support Strong Bones & Healthy Growth');
  assert.ok(claims.includes('Support Strong Bones & Healthy Growth'));
});

test('findGenericShapeClaims: rejects long marketing prose over 8 words (real over-length miss, Sleeprio Gummies.pdf)', () => {
  const claims = findGenericShapeClaims(
    'Riomedica Relax Gummies are thoughtfully formulated with melatonin and botanical extracts to support restful sleep and relaxation.'
  );
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects ordinary sentence-case prose (not Title Case or ALL CAPS)', () => {
  const claims = findGenericShapeClaims('this product supports healthy digestion every day.');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects a phrase with no claim verb and no way to check "front panel" -- conservative by design', () => {
  // "Great Taste" is a real ground-truth claim (Calrio IRN159-1.pdf) this
  // function deliberately does NOT catch: it has no verb, and front-panel
  // position isn't available to a text-only function. Under-catching here
  // is the safe failure direction, not a bug.
  const claims = findGenericShapeClaims('Great Taste');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: allows a "100%" or "40+" token without rejecting the whole line for having a digit', () => {
  const claims = findGenericShapeClaims('Supports 100% Natural Wellness\nDelivers 40+ Essential Nutrients');
  assert.ok(claims.includes('Supports 100% Natural Wellness'));
  assert.ok(claims.includes('Delivers 40+ Essential Nutrients'));
});

test('findGenericShapeClaims: rejects any other digit shape (a real dose/count, not a claim)', () => {
  const claims = findGenericShapeClaims('Supports 2 Servings Daily');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects a nutrition-shaped line (has a unit)', () => {
  const claims = findGenericShapeClaims('Supports Elemental Calcium 125 mg');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects an ingredients-shaped line', () => {
  const claims = findGenericShapeClaims('Contains Corn Syrup Sugar Water');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects a company-name-shaped line', () => {
  const claims = findGenericShapeClaims('Helps IM Healthcare Pvt Ltd');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects an address-shaped line (a real PIN code)', () => {
  const claims = findGenericShapeClaims('Supports Village Doduwal 173205');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects a regulatory/FSSAI-shaped line', () => {
  const claims = findGenericShapeClaims('Supports FSSAI Registered Facility');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects a URL-shaped line', () => {
  const claims = findGenericShapeClaims('Helps Visit www.example.com');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects an email-shaped line', () => {
  const claims = findGenericShapeClaims('Helps Contact care@example.com');
  assert.equal(claims.length, 0);
});

test('findGenericShapeClaims: rejects a terminator-shaped line (batch/use-by/storage etc.)', () => {
  const claims = findGenericShapeClaims('Helps Store In Cool Dry Place');
  assert.equal(claims.length, 0);
});

test('reads the serving basis a nutrition panel declares', () => {
  const panel =
    'Nutritional Facts\nServing size: 1 Gummy | No. of servings per pack: 30\n' +
    'Energy 7.5 kcal\nTotal Carbohydrate 2 g\nTotal Sugar 1.5 g\nProtein 0 g\nTotal Fat 0 g';
  assert.equal(extractNutritionTableFormat(panel), 'Standard (per 1 Gummy)');
});

// Past the documented nutrient-count threshold, the same per-serving basis is
// a Detailed panel — which is what the dataset's own artwork carries.
test('calls a full panel Detailed on the same serving basis', () => {
  const panel =
    'Serving size: 1 Gummy\nEnergy\nTotal Carbohydrate\nTotal Sugar\nDietary Fibre\nProtein\n' +
    'Total Fat\nVitamin C\nSodium\nVitamin E\nPantothenic Acid\nZinc\nMagnesium\nVitamin A\n' +
    'Folate\nIodine\nVitamin D\nVitamin B12\nCholine\nInositol';
  assert.equal(extractNutritionTableFormat(panel), 'Detailed (per 1 Gummy)');
});

test('calls a per-100g panel Detailed whatever its row count', () => {
  assert.equal(extractNutritionTableFormat('Nutritional Information per 100 g\nEnergy\nProtein'), 'Detailed (per 100 g)');
});

test('reports no format when the label declares no basis', () => {
  assert.equal(extractNutritionTableFormat('Keep out of reach of children.'), '');
});
