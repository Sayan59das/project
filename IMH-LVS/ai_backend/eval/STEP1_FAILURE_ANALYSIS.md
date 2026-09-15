# Step 1.2 — Manual failure bucketing (pipeline mode, 25.5% baseline)

Every wrong/missing answer in `eval/runs/pipeline.json` for the 5 scalar
identity fields was read by hand and sorted into one of 5 buckets. The three
collection fields (nutrition_table, ingredients, claims) have far more wrong
items than can be read by hand, so a representative sample was pulled with
`eval/diff.py` (every 6th wrong row for nutrition_table/ingredients; claims'
32 wrong rows is small enough to read in full).

Buckets, as defined by the accuracy-improvement directive:
- **(a) near-miss** — same string modulo case/punctuation/whitespace/unit/extra word
- **(b) role-swap** — brand<->product value swapped into the wrong field
- **(c) descriptor-vs-name** — wordmark vs. a descriptive/tagline text
- **(d) OCR/structural debris** — garbled text, truncation, print-spec artifacts, wrong text block
- **(e) genuinely wrong** — confident extraction of the wrong real text

Reproduce any row below with `python eval/diff.py --mode pipeline --field <field>`.

## Scalar fields (full hand read, not sampled)

| Field | Wrong | (a) near-miss | (b) role-swap | (c) descriptor-vs-name | (d) OCR/debris | (e) genuinely wrong |
|---|---|---|---|---|---|---|
| product_name | 42 | 5 | 9 | 1 | 11 | 15 (8 of these: claims text picked instead of a name) |
| brand_name | 27 | 0 | 5 | 2 | 9 | 11 |
| package_size | 40 | **35** | 0 | 0 | 1 | 4 |
| marketing_company | 18 | 1 | 0 | 4 | 12 | 1 |
| address | 21 | 2 | 0 | 0 | 11 | 8 |

## Collection fields (sampled)

**nutrition_table** — 194 wrong of 532 cells; sample of 33 rows (every 6th):
- **DV%-suffix dropped** (value/unit correct, trailing "(X% DV)" missing): 15/33 (~45%)
- **Kids/Adults split-column not captured** (only one population's value kept): 4/33 (~12%)
- **Fabricated value** (expected blank, a real-looking number predicted): 8/33 (~24%)
- **Footnote/disclaimer mistaken for a nutrient row** ("2020 ... guidelines", "based on a 2000 kcal diet", storage temperature): 6/33 (~18%)

**ingredients** — 170 wrong of 703 cells; sample of 29 rows (every 6th):
- **List split inside an INS-code parenthetical** ("Acidity Regulator (INS 330" as its own item, or a bare fragment like "418", "407)", "331i)"): ~24/29 (~83%)
- **OCR misread** ("Com Syrup" for "Corn Syrup"): 2/29
- **Duplicate/extra split item** (real ingredient text, but split into an extra list entry): ~3/29

**claims** — 32 wrong of 383 cells, read in full:
- **100% (32/32)**: predicted a real, plausible claim string ("Health Supplement", "Gluten Free", "No Added Preservatives", "USFDA Registered Facility") where the ground truth says the field is blank. Not one of the 5 buckets above fits this — the extractor did not hallucinate or garble anything; it found text that is very likely actually printed on the label. See "Needs a human decision" below.

## Two systemic, single-root-cause bugs (not per-label problems)

1. **package_size drops the unit word almost every time it's wrong.** 35 of 40
   wrong answers (87.5%) are the correct number with the unit token missing
   ("30" vs "30 Gummies", "30 N", "30 Sticks", "15" vs "15 Gummies"). This
   looks like one regex/parse step that captures leading digits and discards
   the trailing unit token. Fixing this one thing is the single highest-yield
   change available anywhere in this dataset — it alone would flip ~35 of the
   613 total wrong cells in the pipeline run.

2. **The Riomedica-brand label template (Calrio / Femirio / Multivitamin
   Gummies / Riofill Fe Next / Sleeprio Gummies / Sleeprio IRN157-1 / Vit2Fit
   — the same ~7-8 source files, every time) fails the same way across three
   unrelated fields**: marketing_company returns the FSSAI licence number
   string instead of the company name (8/8 of that group), address returns
   the boilerplate line "Pouches not to be sold loose." instead of the real
   address (8/8), and package_size returns a stale "30" instead of the real
   "10" (4/4 of the group that's wrong on this field). One structural
   problem with this template's layout — not 20 separate bugs — is producing
   all of these. Worth investigating as a single unit in Step 5, likely in
   whatever pass decides which text block on this template corresponds to
   which field.

## ingredients list-splitting is the other high-leverage, generic fix

~83% of the sampled wrong ingredients items are a single list entry that has
been cut in half by whatever delimiter-based split produces the "list of
ingredient items" from the raw text blob, specifically when the cut point
falls inside an `(INS ###)` or `[INS ###]` parenthetical. This is a generic,
label-independent parsing fix (don't split on a delimiter that occurs inside
open parentheses/brackets) — no product-specific knowledge required, so it's
consistent with ground rule 3.

## Human decisions (ground rule 5 — asked, not guessed)

Asked directly and answered 2026-09-15; recorded at the top of `RESULTS.md`
under "Field definitions" so annotation and extraction work stay consistent
with them going forward.

- **product_name** = the brand wordmark ("AM7"), not the descriptor line
  ("Eye Multivitamin Gummies for Kids & Adults"). This unblocks Step 5.6.
- **brand_name** = whichever text is printed biggest/most prominent on the
  front, not necessarily the legal/marketing company's registered brand.
- **claims**: every single wrong claims answer (32/32) is the extractor
  confidently returning real claim-like text that is very likely actually
  printed on the label ("Health Supplement", "Gluten Free", "No Added
  Preservatives", "USFDA Registered Facility"), while ground truth has the
  field blank. Decision: the ground truth is incomplete, not the extractor
  wrong. These 32 (and any others like them found during the Step 4.2 human
  review pass) should be added to ground truth rather than coded around.
  This means claims' true fixable headroom is larger than its current 6.3%
  suggests — a meaningful chunk of its "wrong" cells are actually
  ground-truth gaps, not extraction failures, and Step 5.3 should re-check
  claims accuracy after the Step 4.2 annotation pass before writing any new
  claims-extraction code.

## What this table means for Step 5's ordering

Per the directive, the fix loop goes in cell-count order
(nutrition_table -> ingredients -> claims -> package_size ->
address/marketing_company -> brand/product). This bucketing does not change
that order, but it does say what the first fix inside each step should be:

- **nutrition_table**: capture the full cell text including the trailing
  "(X% DV)" parenthetical (fixes ~45% of sampled wrong rows on its own),
  then handle Kids/Adults two-column tables, then stop counting nearby
  footnote/disclaimer text as a nutrient row.
- **ingredients**: don't split the ingredient list on a delimiter inside
  parentheses/brackets.
- **claims**: blocked on the human decision above.
- **package_size**: keep the unit token when it's captured (87.5% of wrong
  cells are just this).
- **address / marketing_company**: investigate the Riomedica-template
  failure as one shared root cause.
- **brand_name / product_name**: blocked on Step 4.1 (wordmark vs.
  descriptor definition) and Step 2 (which pass — text-layer, Tesseract
  title-region, or VLM — actually wrote each wrong value).

## Suite check (ground rule 6, end of Step 1)

Ollama and Postgres had both gone down mid-session from Windows memory
pressure; restarted both (`ollama serve`, `docker start imh-lvs-pg`) before
this check, since a database-backed suite hangs rather than fails cleanly
when the database just isn't there.

- **ai_backend**: `python -m pytest tests/ -v` — 156/157 pass. The 1 failure
  (`test_review_server.py`, a `ConnectionAbortedError`) passed cleanly
  (10/10) re-run in isolation — a socket hiccup under load, not a real bug.
- **frontend**: `npx tsc --noEmit` clean; `npm test` — 48/48 pass.
- **backend**: `npx tsc --noEmit && npm run typecheck` clean. `npm test` —
  393/408 pass, 11 fail. All 11 are pre-existing and unrelated to this
  step's changes (this branch touched zero backend files):
  - **3** (`labels.extract.test.ts`, the three real-label PDF extraction
    tests) failed with `Connection terminated due to connection timeout` —
    Postgres pool exhaustion under `node --test`'s parallel execution.
    Re-run serially (`--test-concurrency=1`): all 3 pass.
  - **7** are row-count/state assertions (`api.persistence.test.ts`,
    `db.repositories.test.ts`) that expect a pristine seeded database but
    the local Postgres container has extra rows and a real login timestamp
    from prior manual/live-demo testing (e.g. tests expect 16 products, the
    database genuinely has 17 — confirmed directly with
    `docker exec imh-lvs-pg psql ... SELECT COUNT(*) FROM products` ->
    17). Same failures persist under a serial re-run, as expected for a
    data-state issue rather than a timing one. This is the same class of
    pre-existing pollution already flagged in the Step 0 report
    (ART-0013/PRD-0017); not a regression, not caused by anything in this
    branch, and not fixed here — fixing it means either resetting the
    local Postgres container's data or loosening these tests' exact-count
    assertions, both out of scope for an accuracy-analysis step.
  - **1** (`textLayerGeometry.test.ts`) is the already-documented missing
    fixture (`Dataset_Example/Multivitamin IRN56-3.pdf`, not committed to
    git per project policy) — same known gap noted at Step 0.

## What was NOT done in this step

- No extraction code was touched (per the Step 1 gate).
- brand_name's and product_name's OCR-debris and genuinely-wrong sub-buckets
  were categorized by eye, not algorithmically — a second reader might place
  a handful of borderline rows (e.g. "Chyawanprash" for brand_name, called
  genuinely-wrong here because it is a product-category term not a brand,
  not near-miss) differently. This does not change which bucket dominates
  any field.
- nutrition_table/ingredients bucket percentages are from a ~29-33 row
  sample out of 194/170 wrong cells respectively, not a full hand read of
  every wrong cell. The patterns were distinctive and repeated enough in the
  sample that a full read is unlikely to change the dominant pattern, but
  the exact percentages could shift a few points either way.
- Nothing here is an accuracy number — no RESULTS.md row was written by this
  step, and none of the counts above are scored by `score.py`. They are a
  qualitative read of the existing pipeline-mode run already on record at
  25.5% (eval/RESULTS.md).
