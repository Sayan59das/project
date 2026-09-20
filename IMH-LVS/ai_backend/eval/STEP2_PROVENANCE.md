# Step 2 — Provenance per field, accuracy per source

## What changed

**Backend (`backend/src/services/labelExtraction.service.ts`)**: `fieldMeta`
used to only record the two VLM sources (`vlm-role-resolution`,
`vlm-fallback`) — every text-layer or Tesseract read was invisible. Widened
`FieldMeta.source` to a 9-value `FieldSource` union covering every pass in
the fillBlanks cascade (`text-layer-flattened`, `text-layer-reading-order`,
`tesseract-full-page`, `tesseract-region-ocr`, `tesseract-title-region`,
`package-size-ocr`, plus the two VLM sources; `display-candidates` is
reserved for a heuristic Step 5.6 doesn't have yet). `fillBlanks` — the
single choke point every pass already went through to merge its answer in —
is now also the single place that tags which pass supplied each field,
via two new helpers (`tagFilledFields`, `fillBlanksFrom`). Every one of the
9 identity/contact fields (the ten scalar fields minus
`manufacturing_company`, a fixed constant that never goes through this
cascade) now carries a `{source, needsReview}` entry in the result whenever
it's non-blank, not just the model-inferred ones. `needsReview` is true only
for the two VLM sources, per the directive; Step 7 will recalibrate this
using the by-source data this step produces.

Nine new unit tests (`labelExtraction.fieldMeta.test.ts`) pin the merge
logic directly: blank-only tagging, never overwriting a non-blank field
(except the existing generic-product-word escape hatch), multi-source
patches preserving their own per-field tags rather than collapsing to one,
and confidence/meta surviving untouched for fields a later patch doesn't
touch. The existing `labels.extract.test.ts` fieldMeta assertion (previously
asserting `{}` on the "fast path") was updated to the new contract — and,
as a side effect, revealed that fixture never was a true no-OCR fast path;
its `productName` has always come from a title-region OCR recovery, just
invisibly until now.

**CLI (`backend/scripts/extract-pipeline.ts`)**: switched from
`extractLabelFromFile` to `extractLabelReportFromFile` to get `fieldMeta`,
and added a `field_sources` key to its JSON-record output — the 9 tracked
fields' sources, snake_cased to match the record's own field names, absent
key meaning blank (same convention as every other field). Updated
`extractPipelineCli.test.ts`'s key-set assertion and added a check that a
real label's `field_sources` is actually populated with valid source names,
not just present-but-empty.

**Scorer (`ai_backend/eval/score.py`)**: added `--vlm {on,off}`. `on`
(default) changes nothing — inherits whatever `OLLAMA_URL` is already in the
environment, exactly like before this flag existed. `off` explicitly blanks
`OLLAMA_URL` for the Node subprocess only, regardless of what's configured
around it, forcing the VLM role-resolution step off for that one run.
Added `compute_by_source_table()` (joins each field's `field_sources` entry
against `score_field`'s own correct/wrong verdict, tallied per (field,
source) pair) and `format_by_source_table()`, wired into `write_results_md`
as a second table under the by-field one, on the same commit. 12 new tests
in `test_score.py` cover the env-var threading and the table computation.

## Before / after

Nothing about the extraction rules changed in this step — same as Step 1,
this is instrumentation, not a fix. The strict headline is unchanged
(25.5%), confirmed by re-running the real pipeline end to end, both with
and without the VLM, over all 45 labels:

| run | overall | correct | wrong | missing |
|---|---|---|---|---|
| `--vlm off` | 25.1% | 570 | 604 | 1099 |
| `--vlm on` | 25.5% | 580 | 613 | 1080 |

(Both rows are in `RESULTS.md`, dated 2026-09-15. A third row in between,
also labeled `pipeline (vlm on)`, is **mislabeled** — see the correction
note directly below it in `RESULTS.md`: `OLLAMA_URL` wasn't actually set in
the shell that ran it, an operational mistake on my part, not a code bug.
Caught immediately because its own by-source table had zero
`vlm-role-resolution`/`vlm-fallback` entries — exactly the signature of a
run where the VLM never fired. Left in place per the "never delete a row"
rule, with the mistake explained inline, rather than deleted or hidden.)

## What the by-source table says (the actual point of this step)

From the genuine `--vlm on` run, the two headline findings:

- **brand_name**: every non-VLM source is at 0% (`tesseract-full-page` 0/5,
  `text-layer-flattened` 0/17, `text-layer-reading-order` 0/4).
  `vlm-role-resolution` is the only source that gets this field right at
  all — 10 correct / 1 wrong, 90.9%. This directly contradicts the
  suspicion in the original directive that the VLM is likely the problem
  for the identity fields — for brand_name specifically, it's the opposite:
  the VLM is carrying this field almost entirely, and the text-layer/OCR
  reads that run before it are currently worthless here.
- **product_name**: every source, VLM included, is at 0%
  (`tesseract-full-page` 0/7, `tesseract-title-region` 0/5,
  `text-layer-flattened` 0/22, `vlm-role-resolution` 0/8). No pass is
  getting this field right at all right now — this is consistent with Step
  1.2's finding that a lot of wrong product_name answers are role-swaps and
  claims-text substitutions, not a single bad pass to blame.

So the two identity fields that looked similar in Step 1's strict numbers
(both near 0%) turn out to have completely different root causes once
source is visible: brand_name has one working pass being drowned out by
three broken ones; product_name has no working pass at all. Step 5.6 should
treat them as separate problems, not one "fix brand/product together" task.

Other candidates for gating (more wrong than correct on a field):
- `package_size`: **every** source is at 0% (`package-size-ocr` 0/2,
  `tesseract-full-page` 0/15, `text-layer-flattened` 0/23) — but this is
  almost certainly the unit-word-dropped near-miss pattern Step 1.2 already
  found (35/40 wrong answers), which the strict metric can't see past. This
  is a case where Step 3's fuzzy metric should be checked BEFORE gating
  anything off here — gating would be the wrong fix for what's actually a
  scoring-strictness problem, not a source problem.
- `marketing_company`: `tesseract-region-ocr` is net-negative (1 correct /
  8 wrong, 11.1%) while `text-layer-flattened` is solidly positive (10/8,
  55.6%) — a real gating candidate for Step 5.5.
- `address`: all three sources are weak (22-33%) with small sample sizes;
  not a clean gating call yet, needs more data or Step 3's fuzzy address
  matching first (address is already a FUZZY_FIELD).

The full by-field and by-source tables are in `RESULTS.md`; this file only
summarizes what they mean.

## Suite check (ground rule 6, end of Step 2)

- **ai_backend**: `python -m pytest tests/` — 168/168 pass (up from 157;
  12 new tests for `--vlm`/by-source, plus the ones already added in Step
  1). The 1 flaky test from Step 1's report didn't recur this run.
- **frontend**: `npx tsc --noEmit` clean; `npm test` — 48/48 pass. Untouched
  by this step (nothing here reads `fieldMeta` yet — that's Step 7).
- **backend**: `npx tsc --noEmit && npm run typecheck` clean. Full
  `npm test` run: 402/417 pass, 10 fail — every one of them the same
  already-documented pre-existing environmental issues from Step 0/Step 1
  (7 DB row-count/state pollution from real manual testing, 2 Postgres-pool-
  contention-under-parallel-load timeouts confirmed fixed by a serial
  re-run, 1 missing fixture file not committed to git per project policy).
  Zero regressions from this step's changes. The three files this step
  actually touched (`extractPipelineCli.test.ts`,
  `labelExtraction.fieldMeta.test.ts`, `labels.extract.test.ts`) were
  re-run together afterward: 27/27 pass.

## What I was unsure about

- Whether `tesseract-region-ocr` (the marketing-company/address targeted
  region re-OCR pass) deserved its own tag or should fold into
  `tesseract-full-page` — the directive's own list of 8 tags didn't name it
  separately. Gave it its own tag because Step 1.2 already flagged
  marketing_company/address as having a distinct, systemic failure pattern,
  and folding it into `tesseract-full-page` would have hidden exactly the
  signal (region-ocr net-negative, 1/8) this step exists to surface.
- Whether the title-region productName recovery (an unconditional overwrite
  in the original code, not a `fillBlanks`-style guarded merge) should stay
  unconditional once wrapped in the new tagging. Kept it unconditional on
  purpose — see the comment left in the code — because a `fillBlanks` merge
  would silently stop overwriting a genuine single-word product name,
  changing real behavior in a step that's supposed to be provenance-only.
- `display-candidates` has no producer anywhere in this file today. Left it
  in the `FieldSource` union as directed, but it's currently a type with no
  code path — worth remembering it's aspirational, not implemented.

## What was NOT done in this step

- No extraction behavior changed anywhere except the operational
  `OLLAMA_URL`-threading fix in `score.py` itself — every value in the
  final result is exactly what it would have been before this step; only
  which pass gets credited for it is new.
- Nothing was gated off yet. This step identifies net-negative sources; Step
  5 is where a source actually gets disabled for a field, and only after a
  failing test pins the specific case.
- `needsReview`'s calibration (>10% wrong-rate on a field, per source) is
  Step 7's job, not this one — today it's still the simple "true only for
  VLM sources" rule the directive specified for this step.
- The `finetune/source_labels/` directory this project's own scripts and
  `.env` docs point at no longer exists on disk; the same 45 PDFs are all
  present in `all labels/` at the repo root instead (verified file-by-file
  before running anything). Used `EVAL_LABEL_PDF_DIR` to point at it for
  this step's runs rather than changing any default, since I don't know
  whether that move was intentional reorganization or the default should
  change — flagging it rather than guessing.
