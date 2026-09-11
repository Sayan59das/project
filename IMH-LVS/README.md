# IMH Label Verification System — session handoff notes

This file exists for continuity across Claude Code sessions working on this
repo, not as end-user documentation (see `backend/README.md` for backend
setup/run instructions). If you're picking this project back up, read this
file first — it will save you re-discovering things that took a full session
to work out.

**Reference document**: `AI_Label_Reading_Comparison_Module_Developer_Brief (2).docx`
in the repo root is the authoritative requirements spec for the AI Label
Reading & Comparison module. Section numbers below (§3, §7, etc.) refer to it.

## Current state (as of 2026-09-11)

**Branch**: `feature/durable-artwork-storage`, pushed directly onto `origin/main`
(this repo's workflow pushes straight to `main`, no PR). If your local `main`
branch looks stale/behind, that's just an unfetched local ref — `origin/main`
is current; `git fetch && git reset --hard origin/main` (on `main` only, never
on a feature branch with uncommitted work) will fix it.

**Test status, verified fresh today (2026-09-11)**:
- Backend: `cd backend && npx tsc --noEmit && node -r tsx/cjs --test "src/**/*.test.ts"` → 250 tests, **243 pass, 7 fail**.
  All 7 failures are DB row-count/identity assertions (`db.repositories.test.ts`
  and friends) thrown off by real rows a live-browser test session created
  earlier today (see "Clean DB baseline row counts" below) — not a code
  regression. Re-confirm this is still the case (not a real break) before
  trusting it as "code is fine."
- Frontend: `npx tsc --noEmit && npm test` → 42/42.
- AI backend (Python): `cd ai_backend && python -m pytest tests/ -v` → 63/63.

**Brief compliance**: every section (§3–§11) has a real implementation, but
three specific things below are less finished than earlier notes here
claimed — durable file storage only survives on a persistent local disk, not
on an ephemeral-filesystem host like Render (see below); `/identify-product`
is a plain string-equality check, not AI matching; and §9's "Logo" signal is
currently just an alias for the layout/dHash signal, not its own
measurement. See the relevant bullets below for each. Extraction accuracy
(how correctly text fields get read off a label in the first place) is the
other real, still-open gap — see "Model fine-tuning" below.

## What's done

- **§3 AI Label Reading** — Tesseract OCR primary (`backend/src/services/labelExtraction.service.ts`,
  `labelFieldExtractor.service.ts`), Qwen2-VL-2B vision-model fallback via
  `ai_backend/` only when Tesseract can't read brand/product/company/FSSAI
  (`backend/src/services/aiExtraction.service.ts`). No hardcoded product
  names/brands/flavours/companies anywhere — known-flavour/claim candidates
  are sourced from Masters at runtime.
- **§4 Product/Version Identification** — `src/services/labelIntakeService.ts`
  plus the new `/api/labels/identify-product` endpoint (`productIdentification`
  service, backend `labels.controller.ts`). **Correction: this is a plain
  string-equality rule, not an AI model.** `ai_backend`'s `/identify-product`
  (`ai_backend/app/api/v1/endpoints.py`) matches an existing product by exact
  FSSAI-number equality, OR by exact (case-insensitive) Product Name +
  Marketing Company equality — no fuzzy matching, no model inference. It's
  also entirely OFF unless `AI_EXTRACTION_URL` is set: `identifyProductAt()`
  returns `unavailable` immediately when that env var is unset, so a
  deployment without it configured gets none of this matching at all,
  silently. Exact match reuses the product; a near-match is surfaced to a human;
  genuinely new products get created; versions are issued under a
  Postgres advisory lock (`nextVersionNumber` in `artwork.repository.ts`,
  scoped to `product_id + marketing_company + artwork_type`) so concurrent
  uploads can't collide. **Live-verified end-to-end today**: uploading the
  same real product twice (`Multivitamin IRN56-1.pdf` then `-2.pdf`) correctly
  created V1, then matched the existing product and assigned V2, with a
  visible "matches existing product... will be saved as a new version" banner
  before saving.
- **Durable artwork file storage — done for local disk, NOT yet done for
  production.** `POST /api/artworks` (or the label-upload flow) saves the
  actual uploaded bytes to `backend/uploads/artworks/<ARTWORK_ID>.<ext>` and
  serves them back via the auth-protected `GET /api/artworks/:id/file`;
  `artworks.storage_key` is populated — this used to be the #1 documented gap
  in this file, and the local-disk part of it really is done, not a blob-URL
  placeholder anymore. **But** if this app is deployed on a host with an
  ephemeral filesystem (Render's free/standard web services, for example),
  every new deploy wipes `backend/uploads/`, silently losing every saved
  artwork file — so this is still a real, open production blocker, not a
  finished item. The fix is a swap to real object storage (S3 or Cloudflare
  R2); the change is confined to `backend/src/services/artworkFileStorage.service.ts`
  (the one place that reads/writes `storage_key`), but that swap has not been
  done yet.
- **§5 Comparison flow** — `src/services/labelComparisonWorkflowService.ts`.
  Latest approved artwork is auto-selected, never user-picked. No-baseline
  correctly skips version comparison and goes straight to cross-company
  (`ComparisonPlan` type has an explicit `no_approved_baseline` state).
- **§6 Cross-Company Best Match** — `findBestCrossCompanyMatch()` in the same
  file: sorts candidates by `overallPercentage`, picks the top successful
  one, carried into `LabelComparisonRun.bestCrossCompanyMatch` and the PDF.
- **§7 Comparison parameters per stage** — `backend/src/services/labelComparison.service.ts`'s
  `FIELD_CONFIG` + `ComparisonStage` (`same_company` excludes
  Address/Customer Care Number/Email; `cross_company` includes them). All 14
  text fields plus nutrition rows plus Logo/Layout/Colour (see §9).
- **§8 MATCH/SIMILAR/CONFLICT/MISSING** — same file's `isSimilarText()`:
  real edit-distance + word-overlap based SIMILAR detection, not a UI-layer
  approximation.
- **§9 Visual Comparison** — `backend/src/services/imageSimilarity.service.ts`.
  Two independently-computed signals per artwork pair, from ONE
  rasterization (`fingerprintArtworkImage`): a grayscale perceptual hash
  (dHash, structural/layout) and an RGB colour histogram (palette), computed
  and reported separately because neither subsumes the other (a recolour with
  the same layout MATCHes one and CONFLICTs the other). **"Logo" is NOT its
  own signal yet** — the brief asks for Logo, Layout and Colour as three
  things, but this code only has two measurements, and the file's own
  comment says so: the "Logo" row is aliased to the same whole-page dHash as
  "Design/Layout", because there is no logo-region detection step to crop a
  logo out and compare it on its own. Don't mark §9 fully done until a real
  `compareLogos()` exists (planned for Phase E of the extraction rebuild).
- **§10 PDF Report** — `src/utils/comparisonReportPdf.ts` (jsPDF +
  jspdf-autotable, client-side). Summary, parameter table, nutrition table,
  visual comparison table, artwork images.
- **§11 API alignment** — `POST /api/labels/compare-visual`,
  `POST /api/labels/compare-visual-batch`, `POST /api/labels/identify-product`.
- **§12 (nutrition table rows)** — `LabelExtractionResult.nutritionTable`
  compared row-by-row in `compareNutritionTables()`.

## Model fine-tuning — tried, NOT on the roadmap anymore

**Fine-tuning is no longer the plan. Do not resume it, and do not extend
`ai_backend/finetune/`.** Two rounds of QLoRA fine-tuning were tried on this
project (2B model, then a 7B model, full history below) and neither one
produced a real accuracy win — the 7B run finished with a much better
training loss than the 2B run (0.19 vs 0.32) but scored about the same on
the same held-out pages (36.3% vs 35.4%), so a bigger model was not the
answer either. On top of that, this client's label artwork is confidential
and is not allowed to leave this machine — no cloud GPU notebook (Colab,
Kaggle, or similar), no hosted API, ever gets a copy of any file under
`Dataset_Example/`, `Final_dataset/`, `all labels/` or `backend/uploads/` —
which rules out easily training a bigger model even if one might eventually
help. The current plan instead is to fix the parts of the pipeline that
throw away information the label PDF already gives us for free (its text
layer's font sizes and positions), replace Tesseract with a better local OCR
engine for stylized/outlined text, and use a local model (via Ollama) only
as a narrow, schema-constrained resolver for the few fields geometry and OCR
genuinely can't settle — never as a one-shot "read the whole label" call.
See the extraction-rebuild plan for the current phase.

Full QLoRA pipeline still exists in `ai_backend/finetune/` (`prepare_dataset.py`,
`build_training_set.py`, `train_lora.py`, `evaluate_adapter.py`) and is being
left in place as a record of what was tried, not as active tooling. 60
label pages have been manually reviewed/annotated
(`ai_backend/finetune/reviewed/annotations/`, committed) and were used to
train the LoRA adapters below — but every one of those 60 files currently
has the placeholder `"reviewedAt": 1` rather than a real timestamp, so how
carefully each one was actually checked is unverified. A full human
re-review pass is planned (see the extraction-rebuild plan's Phase B) before
these are trusted as ground truth for anything new.

**2026-09-09 evaluation, 6-page held-out validation split:**

| | Base (no adapter) | Tuned (LoRA adapter) |
|---|---|---|
| Overall | **38.2%** | **36.3%** |

The adapter was **not an improvement** — four of six pages scored a bit
better, but one page (`sleeprio_irn157_1_p1`) completely collapsed: the
fine-tuned model entered a degenerate repetition loop (a nonsensical,
endlessly-repeating "Pale [colour]" list inside the nutrition-table field),
which broke JSON parsing entirely and zeroed that page's score. That one
failure dragged the average below the base model's.

**2026-09-10: retrained on a bigger dataset (the "New Data" batch — Immunogum,
Iron, Cal Vit D, Derocal, etc. added to `Final_dataset/`), same result.**
`prepare_dataset.py`/`build_training_set.py` were extended with real fixes
(byte-identical-file dedup, ICC-profile stripping so Pillow doesn't choke on
a CMYK JPEG, and union-find grouping so validation is held out by real
product family — brand+product+FSSAI signals shared across pages — not by
filename, which was silently leaking near-duplicate artwork between train
and validation before). Training ran 5 of 6 planned epochs (interrupted when
the previous session ended; val loss was still falling each epoch: 0.55 →
0.40 → 0.35 → 0.33 → **0.32**) — the saved adapter reflects epoch 5.

Evaluated against the new, larger 16-page validation split
(`PYTHONPATH=. python finetune/evaluate_adapter.py base|tuned`, run from
`ai_backend/` — the `-m finetune.evaluate_adapter` form above also works,
`PYTHONPATH=.` is only needed for the direct-script form):

| | Base (no adapter) | Tuned (LoRA adapter) |
|---|---|---|
| Overall | **34.6%** | **33.8%** |
| Pages returned completely blank | 3 of 16 | **8 of 16** |

(An earlier version of this table also listed a "Tesseract-only (no AI):
33.9%" column. That number has been removed — `evaluate_adapter.py` has no
Tesseract-only mode, so there is no real run behind that figure. If a real
plain-OCR baseline number is needed, it has to come from `ai_backend/eval/score.py`
once that exists, not from this script.)

**Same conclusion as 2026-09-09, worse in one respect**: more data alone did
not fix the degenerate repetition loop — it happened again, on different
pages, and the fine-tuned model gave up completely (all-null) on over twice
as many pages as the untrained base model. **Root cause found**:
`extract_from_image` in `ai_backend/app/services/extraction.py` only ran its
completion-retry/tile-fallback recovery when the first-pass output was
non-empty (`if blank and label_data:`) — so a page whose first pass failed
*completely* (which is exactly what a repetition-loop degeneration produces:
unparseable JSON with no closing brace) got **zero** recovery attempts,
while a partially-bad page got full recovery. That bug was fixed
(`if blank:`, see the bugs list below), and re-running the same 16-page tuned
eval with the fix in place gave 35.4% (barely moved). A 7B model was then
tried too, to test whether a bigger base model was the missing ingredient:
it trained to a much better loss (0.19 vs the 2B run's 0.32) but scored
36.3% on the same 16 pages — no meaningful improvement. Both results are
consistent with the same conclusion: the ceiling here isn't model size or
training data volume, it's the one-shot "read the whole page and guess JSON"
approach itself. **`LABEL_LORA_ADAPTER` stays unset in production.** No
further fine-tuning work is planned — see the "not on the roadmap" note at
the top of this section for what replaces it.

## Extraction rebuild plan — six phases, in progress

Replaces fine-tuning as the plan for improving extraction accuracy (see
above). Ground rules for every phase: write a failing test before writing
the fix; never touch the database without the user's explicit per-action
permission, and report any rows created by testing; treat the human-reviewed
annotations as ground truth, and ask the human rather than guess when a
field is ambiguous; commit each phase with a message describing what the
scoreboard showed before/after; push each phase to its own
`feat/extraction-<phase>` branch, never straight to `main`; never quote an
accuracy number that isn't a row in `ai_backend/eval/RESULTS.md` once that
file exists (Phase B). Client label artwork never leaves this machine — no
cloud notebook, no hosted API, ever sees it.

- **Phase A — housekeeping (this phase).** Merge in a pending fix branch for
  a decoding/FSSAI-identity bug (blocked — see below), delete the
  cloud-training files this repo should never have had, correct several
  claims in this file that turned out to be wrong or stale (see "Current
  state" and the corrected bullets above). **Blocked on the user**: the
  branch `fix/decoding-ban-and-fssai-identity` isn't on `origin` yet, so it
  can't be merged — needs the user to push it (do not hand-reimplement it).
- **Phase B — an honest scoreboard.** A full human re-review of all 60
  annotation files (real `reviewedAt` timestamps, a new `is_front` field),
  and a new `ai_backend/eval/score.py` that becomes the one source of truth
  for every future accuracy number, replacing `evaluate_adapter.py`'s
  scoring. Gates every phase after it.
- **Phase C — use the PDF's own text layer.** `pdf.service.ts` gains
  `extractTextSpans()` (font size, position, rotation per span, from
  `pdfjs-dist`'s `getTextContent()`), panel/line segmentation, and
  display-text/nutrition-table detection from that geometry — expected to be
  the single biggest accuracy gain, with no AI model involved at all.
- **Phase D — better OCR for stylized text.** Replace Tesseract with
  RapidOCR for outlined/vectorized display text Tesseract can't read, using
  IoU-diffing against the text layer to find where OCR is needed.
- **Phase E — narrow, local-model resolvers.** Retire the one-shot "read the
  whole label" Qwen2-VL call entirely. Use Ollama, running fully locally,
  with schema-constrained JSON decoding, as a set of narrow resolver
  functions only for the specific fields geometry + OCR couldn't settle.
- **Phase F — confidence and human review.** Attach confidence/abstention
  metadata to each extracted field and add a "needs review" flow in the
  intake UI for low-confidence fields, instead of silently trusting
  everything the pipeline produces.

## Bugs found and fixed today (2026-09-09)

- **Model wrote the literal string `"null"` instead of a real null.**
  Observed on `fssai_number` on a real, known-correct label — the model
  answered with the 4-character string `"null"`, which is non-blank, so it
  silently skipped the completion-retry and tile-fallback recovery paths
  entirely (those only ever triggered for a genuinely *omitted* key, by
  design, on the theory that an explicit answer — even a bad one — should be
  trusted). Fixed in `ai_backend/app/services/extraction.py`:
  `_normalize_literal_null_strings()` converts a literal `"null"` string to
  a real `None` right after JSON parsing, AND the retry/tile-fallback
  eligibility was widened from "omitted keys only" to "any field with no
  real content" (`_has_content(...)` is false) — a field that's genuinely
  not on the label just gets reconfirmed null at the cost of one extra
  generation, which is a fine trade against silently losing a real value.
  5 new tests added, `_missing_fields`/`_has_content` test names/docstrings
  updated to match the new behavior. 58 → 63 Python tests.
- **PDF preview showed "Preview not available" for every real uploaded
  file.** Root cause: `src/hooks/usePdfThumbnail.ts` calls
  `pdfjsLib.getDocument(fileUrl)` to render a label's first page as a
  thumbnail, but artwork files are served from the auth-protected
  `/api/artworks/:id/file` endpoint (httpOnly session cookie), and pdf.js's
  own networking layer does not send credentials by default — so every real
  file's PDF fetch silently 401'd. Fixed by passing
  `{ url: fileUrl, withCredentials: true }` instead of a bare URL string.
  Verified live: uploaded a real label, saved it, and the preview rendered
  the actual artwork sharply in both the small thumbnail and the full
  "Artwork Preview" panel. (A *pre-seeded* demo artwork with a genuinely
  empty `filePath` — predates the durable-storage feature — correctly still
  shows "not available"; that's real absent data, not this bug.)
- **Stale production frontend build.** `dist/` was found to be a day older
  than `src/` during live testing, meaning `npm run preview` was serving a
  build that predated a credentials fix already in source — causing
  spurious "Sign in to continue" errors on every upload. There's no CI step
  that catches this; **always `npm run build` before trusting
  `npm run preview` for testing**, especially after pulling changes.
- **Node backend's AI-fallback timeout (`AI_EXTRACTION_TIMEOUT_MS`, default
  45s) is too tight** for the widened retry/tile-fallback logic above — a
  label with several genuinely-blank fields can now legitimately take
  60–120s+ (up to 11 sequential model generations: 1 main pass + 1 whole-page
  retry + up to 9 isolated tile crops). Raised to 120000 for testing; **not
  yet persisted to `backend/.env`** — do that before relying on the AI
  fallback for a label with many blank fields.

## Bugs found and fixed today (2026-09-10)

- **Total first-pass extraction failure skipped all recovery.** See "Model
  fine-tuning" above for the full story — `extract_from_image`'s
  `if blank and label_data:` guard meant a first pass that produced zero
  parseable JSON (the shape a repetition-loop degeneration produces) got
  no completion-retry and no tile fallback, while a partial failure got
  full recovery. Changed to `if blank:` so total failures get the same
  (much narrower, much more likely to succeed) recovery attempt. Test
  `test_no_retry_when_the_first_pass_produced_nothing_at_all` renamed to
  `test_a_totally_failed_first_pass_still_gets_retried_and_tiled` and
  rewritten to assert the new behavior. Also added `no_repeat_ngram_size=4`
  to the `model.generate()` call in `_generate_json` alongside the existing
  `repetition_penalty=1.15` — a hard constraint against short-phrase loops
  as a second line of defense, since the penalty alone had twice failed to
  prevent one (2026-09-09 and 2026-09-10 eval runs).
- **Fixing the bug above immediately exposed a second, pre-existing one**:
  the retry/tile-fallback path now actually runs for totally-failed pages,
  and real model output on a garbled page can contain a character (observed:
  a Unicode replacement character, `�`) that Windows' default console
  encoding (cp1252) cannot print — crashing the whole extraction with
  `UnicodeEncodeError` on what should have been a harmless diagnostic
  `print()` of the failed JSON. This code path was previously dead for
  total failures (see bug above), so the crash was never reachable until
  today's fix made it reachable. Fixed in the same file's `_generate_json`:
  the diagnostic print now re-encodes with `errors="replace"` against
  `sys.stdout.encoding` before printing.

## Known open issues (not fixed, real, worth picking up)

1. **Extraction latency vs. thoroughness is an open tradeoff, not yet
   decided.** The widened retry/tile-fallback logic (see bug fixes above)
   trades speed for correctness — worst case per label is now 60–120s+.
   Options discussed with the user, none implemented: cap the tile budget to
   3–4 positions instead of 9, batch the tile calls into one GPU forward
   pass instead of 9 sequential ones, or narrow the widened retry back down
   to identity-critical fields only. Needs a decision before this matters in
   practice.

## Architecture gotchas — read before touching comparison code

**There are THREE separate, non-interacting comparison implementations.**
Don't confuse them:
- `src/services/comparisonService.ts` — the OLDER Label
  Final→Technical→QA→Manager **approval pipeline**. Uses a hand-authored
  13-parameter model (`ParameterResult = 'MATCH'|'SIMILAR'|'CONFLICT'|'MISSING'`).
  Has its own dead `findBestMatch()` function (zero callers) — not the same
  as `findBestCrossCompanyMatch()` above; don't "fix" one thinking it's the
  other.
- `src/services/labelComparisonWorkflowService.ts` +
  `backend/src/services/labelComparison.service.ts` — the **Quick Label
  Comparison** feature, i.e. what §5–§10 of the brief actually describe.
- `ai_backend/app/services/comparison.py` — a separate Python
  sentence-transformers-based comparator. Not wired into the live app.

**Auth**: session-cookie based (httpOnly cookie, scrypt password hashing,
`sessions` table — deliberately not JWT, so sessions are revocable).
`requireSession`/`requireActor` middleware guards `/api/*`. Every frontend
fetch to these routes needs `credentials: 'include'` — this now also applies
to non-`fetch` consumers of protected URLs, like pdf.js (see bug fix above).
If you add a new way of reaching a protected endpoint, check it explicitly.

**Poppler (`pdftoppm`) is required** for any PDF rasterization (OCR
fallback, image previews, visual/colour comparison, PDF report artwork
images), and is **not on PATH by default** in this dev environment.
**`backend` no longer needs the PATH workaround** — `backend/.env`'s
`PDFTOPPM_PATH` points straight at the poppler install (read by
`backend/src/config/env.ts`, used in `pdf.service.ts`), so it's set once and
just works, no per-shell export needed. `ai_backend` is still on the old
workaround, though — it calls poppler through Python's `pdf2image`
(`from pdf2image import convert_from_bytes` in `extraction.py`), which has
no equivalent path-override setting, so it still needs poppler's `bin`
folder exported onto PATH in every fresh shell that starts it:
```
export PATH="/c/Users/sayan/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin:$PATH"
```

**Python interpreter for `ai_backend`**: use the plain `python` on PATH
(system install, currently 3.14 — confirmed today it has `torch` 2.11+cu128
with CUDA available and `bitsandbytes` 0.50.2). **`backend/venv/` is a red
herring** — it has `torch`/`transformers`/`accelerate` but NOT
`bitsandbytes`, so anything doing 4-bit loading (training or eval) fails
with `ImportError: Using bitsandbytes 4-bit quantization requires
bitsandbytes` if run with that venv's interpreter. Also: running a
`finetune/*.py` script directly (`python finetune/evaluate_adapter.py`) needs
`PYTHONPATH=.` set (from `ai_backend/`) for the `from app.services...` import
to resolve — the `python -m finetune.evaluate_adapter` form doesn't need it,
since `-m` puts the cwd on `sys.path` automatically.

**GPU**: local machine is an RTX 4050 laptop (6GB VRAM) — enough for exactly
ONE Qwen2-VL-2B instance at a time. Running the live `ai_backend` server
*and* a separate evaluation/training script concurrently causes severe
slowdown or OOM; stop one before starting the other.
`_load_model()` loads the base model in 4-bit (bitsandbytes) whenever a LoRA
adapter path is set, fp16 otherwise — a QLoRA adapter trained against 4-bit
weights produces garbage output if served on fp16, so this isn't optional.

**Database**: Postgres on `localhost:5433`, db `imh_lvs`, user `lvs` /
password `lvsdev` (see `backend/.env`). `SEED_USER_PASSWORD=password123`
lets you log into any seeded account. Seed accounts (all `@imhealthcare.com`):
`manager`, `account` (**account_manager — the ONLY role that can see the
"Upload Artwork" button**, per `ArtworkPage.tsx`'s role gating), `labelfinal`,
`technical`, `qa`. Frontend production preview (`npm run preview`) is Vite on
port **4173** — if that port is already taken by a leftover process, Vite
silently falls back to 4174, which then mismatches the backend's
`FRONTEND_ORIGIN` CORS allow-list and produces confusing "Sign in to
continue" errors that look like an auth bug but are actually a port
collision. Always confirm which port actually came up. Backend on port 4000
(`backend/.env`'s `PORT`).

**Clean DB baseline row counts** (use this to tell real pollution apart from
a real bug if a `db.repositories.test.ts` count assertion fails after any
manual/live browser testing — every manual test action, including just
logging in, mutates shared seed rows like `last_login`, and uploading a
label auto-creates brand/marketing-company/flavour master rows via
`getOrCreate*`):
```
products=16  artworks=12  brands=11  flavours=8
marketing_companies=7  manufacturing_companies=2  claims=4  product_categories=5
```
**Currently one artwork and one product above this baseline**: a live-browser
demo today uploaded a real label (`all labels/Cal. Vit D IRN120-1.pdf`)
through the actual UI, creating **Artwork ART-0013** and **Product PRD-0017**
("Calcium 125 mg + Vitamin D 200 IU Gummy", brand "ChewNectar"). Nobody has
cleaned these up yet — that needs the user's explicit go-ahead first (see
below), so the counts above and the next artwork ID (`ART-0014`, not
`ART-0013`) will look "off by one" against a truly clean baseline until then.
That's exactly what's causing today's 7 backend test failures noted above.

If you do any live browser testing, check these afterward and clean up
whatever you personally created (with the user's explicit sign-off each
time — this is a destructive DB action) before trusting the test suite again.
Note `labels.extract.test.ts` posts real files to a real running server
*outside any rollback transaction* — running the full backend suite
repeatedly can itself accumulate real rows even without any browser testing.

**Data folders that are NOT committed to git** (by design, confirm with the
user before adding): `Dataset_Example/*` (churns constantly), `Final_dataset/`
(the 31-file training set — now WITH real annotations, see "Model
fine-tuning" above; the annotations themselves ARE committed, under
`ai_backend/finetune/reviewed/`), `scratch/`, the developer brief `.docx`.

## Quick start for a new session

1. `git checkout feature/durable-artwork-storage && git pull` (or just work
   directly off `origin/main`, which this branch is currently in sync with).
2. Start Postgres (should already be running as a local service).
3. `backend` reads poppler's location from `PDFTOPPM_PATH` in `backend/.env`
   — nothing to export for it. `ai_backend` still needs poppler's `bin`
   folder on PATH in every fresh shell before running its tests or starting
   its server (see "Architecture gotchas" above for the export command).
4. Backend: `cd backend && npm run dev` (port 4000). Frontend production
   preview: `npm run build && npm run preview` at repo root — **rebuild
   first**, `preview` serves the stale `dist/` otherwise (bit us today). AI
   backend (optional, only needed for the vision-model fallback path):
   `cd ai_backend && uvicorn app.main:app --host 127.0.0.1 --port 8000`
   (leave `LABEL_LORA_ADAPTER` unset — see "Model fine-tuning" above).
5. Run the three test suites (commands above) before making changes, so you
   have a known-good baseline. Check the DB row counts afterward if you did
   any live browser testing or ran the backend suite more than once.
