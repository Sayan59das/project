# Step 3 — a metric a client would sign

## What changed

Added a second, parallel scoring pass in `ai_backend/eval/score.py` —
`score_labels_new_metric()` / `aggregate_new_metric()` — that runs
alongside the existing strict one (`score_labels()`), never replacing or
touching it. Both write to the same `RESULTS.md` row and the same
`eval/runs/<mode>.json` file, from the same run.

- **`normalize_value(field, value, strip_parenthetical=True)`**: unit-level
  normalization beyond the existing `normalize()`'s whitespace+case —
  decimal commas to decimal points, `mcg`/`µg`/`μg` unified, a missing
  space before a unit (`4.4g` -> `4.4 g`), trailing punctuation stripped,
  and (when `strip_parenthetical`, the default) a trailing `(...)`
  annotation dropped symmetrically from both sides — grounded in the real
  nutrition_table near-misses Step 1 found (`12 kcal` vs `12 kcal (<0.6%
  DV)`, `0.5 mg` vs `0.5 mg (Children 1% / Teens 0.25% / Adults <0.5%
  DV)`). List items (ingredients/claims) call this with
  `strip_parenthetical=False` — an ingredient's parenthetical is usually
  its main content (`Vitamin C (Ascorbic acid)`), not an annotation to
  discard, and stripping it there would throw away exactly what the
  token-set list matcher needs.
- **`normalize_nutrition_key()`**: strips a parenthetical unit
  (`Energy (kcal)` -> `energy`) and compares nutrition row names by token
  set, so `Total Fat` and `Fat, total` match.
- **`score_field_fuzzy()`**: a scalar field's new-metric score — a strict
  wrong gets a second chance via Levenshtein ratio >= 0.85 (using
  `rapidfuzz`, added as a new dependency — pure local, no network calls at
  runtime) or substring containment with the shorter side >= 4 characters.
- **`score_list_field_fuzzy()`**: each expected list item is matched
  against the single best still-unclaimed predicted item by rapidfuzz's
  token-set ratio >= 0.85, one-to-one (a predicted item can't satisfy two
  expected items).
- **`score_nutrition_table_fuzzy()`**: rows matched by
  `normalize_nutrition_key()`, values compared by the same fuzzy scalar
  logic as `score_field_fuzzy`.
- **`aggregate_new_metric()`**: splits `TEXT_FIELDS` (13 fields) from
  `VISUAL_FIELDS` (`logo`, `layout`, `colour_theme` — compared as images
  per the brief §9, never as text; `layout` is `null` on every label by
  construction). The 80% target applies to the text block only; the visual
  block is reported separately, strict-only (fuzzy text matching isn't
  meaningful for a free-text visual description).
- **`compute_fabrication()`**: per field, how often a value was produced
  for a label where the field is genuinely blank, as a rate over every
  label where that's even possible ("opportunities").

45 new tests (`test_score.py`), every scalar/list/nutrition rule backed by
a real pair from Step 1's `eval/diff.py` output, not an invented one —
see the test names themselves for which label/field each came from.

## Before / after (real runs, all 45 labels, same commit)

| run | strict | new metric (text fields) | delta |
|---|---|---|---|
| `--vlm off` | 25.1% | **38.9%** | +13.8 pts |
| `--vlm on` | 25.5% | **39.5%** | +14.0 pts |

Both rows are in `RESULTS.md`, dated 2026-09-15, with the full by-field,
by-source, visual, and fabrication tables. This is exactly what the
directive predicted — Step 3 moves the number a lot on its own, no
extraction code touched. ~14 points of the strict "wrong" bucket turns out
to be metric-strictness, not real mistakes.

**Where the 14 points came from, by field** (fuzzy accuracy vs. strict, vlm
on): `nutrition_table` 21.1% -> 44.6%, `ingredients` 30.9% -> 49.6%,
`flavour` 44.4% -> 60.0%, `customer_care_number` 53.3% -> 66.7%,
`customer_care_email` 64.4% -> 68.9%, `marketing_company` 26.7% -> 40.0%,
`address` 17.8% -> 20.0%. Three fields did **not** move: `package_size`
stayed at 2.2%, `brand_name` stayed flat (fuzzy = strict, 10/45), and
`claims` barely moved (6.3% -> 8.0%).

Those three non-movers are not a gap in the metric — they're each a
confirmation of something Step 1/Step 2 already found, from a different
angle:

- **`package_size`** not moving confirms Step 1.2's finding directly: the
  dominant wrong pattern is a MISSING unit word ("30" vs "30 Gummies"), not
  a formatting difference. A bare number is too short to pass the >=4-char
  containment guard, and its Levenshtein ratio against "30 Gummies" is
  nowhere near 0.85 (very different lengths). This needs Step 5.4's actual
  extraction fix (keep the unit token) — no scoring change fixes it, and
  none should try to.
- **`brand_name`** not moving (fuzzy == strict) confirms Step 2's by-source
  finding: brand_name's wrong answers aren't near-misses, they're
  confidently wrong text from a broken pass (claims/product-type text
  substituted in). A metric change can't rescue an answer that isn't
  close to being right.
- **`claims`** barely moving confirms the human decision recorded in Step
  1.2/4.1: most of its "wrong" cells are real claims the ground truth is
  missing, not the extractor producing near-miss text. Fixing that is
  Step 4.2's job (correcting ground truth), not Step 3's or Step 5.3's.

## A genuinely new finding: fabrication

`manufacturing_company` shows a 100% fabrication rate — but on its only
one (1) opportunity across all 45 labels: exactly one label in the ground
truth has `manufacturing_company` genuinely blank, and the pipeline still
filled it with the fixed constant (`IM Healthcare Pvt. Ltd.`) anyway,
because that field is never actually read from the label — it's always
injected as a fixed value (see `labelExtraction.service.ts`'s own comment:
"manufacturingCompany is never derived from OCR or the text layer"). This
is a real, if small-sample, finding: the fixed-constant approach can't
represent "this label doesn't have one," which is worth a look whenever
that field's annotation guideline is revisited — not urgent (1 label out
of 45), but not nothing either.

`flavour` shows a 28.6% fabrication rate (2 of 7 genuinely-blank labels get
a flavour value anyway) — worth watching in Step 5, though not yet
investigated further; this step's job was to measure it; Step 5 traces it.

Every other field's fabrication rate is 0% on this run — a good sign that
the pipeline is generally honest about blanks, not just guessing.

## Suite check (ground rule 6, end of Step 3)

This step touched only `ai_backend/eval/score.py`,
`ai_backend/tests/test_score.py`, and `ai_backend/requirements.txt` (added
`rapidfuzz` — a pure local library, no network calls at runtime, already
verified installable in this environment). Backend and frontend were not
touched and were both green earlier this session (Step 2's check); not
re-run here since nothing in either could have been affected.

- **ai_backend**: `python -m pytest tests/` — 205/205 pass (up from 168;
  45 new tests for Step 3's normalize/fuzzy/aggregate/fabrication
  functions, all named after which real diff pair or directive example
  grounds them).

## What I was unsure about

- **Levenshtein ratio, implemented via `rapidfuzz`** rather than hand-rolled
  against `difflib`: the directive names "Levenshtein ratio" specifically,
  and `rapidfuzz` is a well-tested, purely local, dependency-free-at-runtime
  library that implements it (and token-set ratio, also named directly)
  correctly — safer than reimplementing either algorithm by hand for a
  scoring tool whose whole purpose is to be trusted.
- Whether stripping a nutrition value's trailing parenthetical
  **symmetrically from both sides** (rather than only when one side lacks
  it) risks masking a genuinely different %DV/RDA figure behind a matching
  headline number. Decided this is the right call because the directive's
  own phrase for this column is "headline number," and Step 1.2 already
  characterized the DV%-suffix pattern as a near-miss category, not a
  content difference — but it's a judgment call, not a certainty, and
  worth another look if a real case ever turns up where the annotation's
  value genuinely differs.
- The fabrication line currently counts one opportunity per LABEL per
  field, not per list item — a label's whole `claims` list either did or
  didn't get something fabricated onto it when it should have stayed
  empty. Item-level fabrication counting for list fields felt like it would
  over-count relative to what "how often does it make something up"
  actually means to a client reading one line per field.

## What was NOT done in this step

- No extraction code touched — same discipline as Steps 1 and 2. Every
  point of the 38.9%/39.5% new-metric numbers comes from scoring the exact
  same predictions differently, not from different predictions.
- `--mode ai` and `--mode textlayer` were not re-run under the new metric
  for this report (the Definition of Done only requires `--mode pipeline`
  both ways) — though the new metric now runs on every mode by construction
  (`main()` always computes it), so re-running either later needs no code
  change, just the command.
- The visual block (logo/layout/colour_theme) is unchanged from strict
  scoring — no fuzzy matching was added there, per the directive; it's
  reported separately, not improved.
- package_size's, brand_name's, and claims' real fixes are Step 5's job
  (5.4, 5.6, and blocked-on-4.2 respectively) — this step only confirmed,
  with real numbers, which of the three is a metric problem (none of them)
  versus a code or ground-truth problem.
