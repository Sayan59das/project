# IMH Label Verification System — session handoff notes

This file exists for continuity across Claude Code sessions working on this
repo, not as end-user documentation (see `backend/README.md` for backend
setup/run instructions). If you're picking this project back up, read this
file first — it will save you re-discovering things that took a full session
to work out.

**Reference document**: `AI_Label_Reading_Comparison_Module_Developer_Brief (2).docx`
in the repo root is the authoritative requirements spec for the AI Label
Reading & Comparison module. Section numbers below (§3, §7, etc.) refer to it.

## Current state (as of 2026-09-09)

**Branch**: `feature/durable-artwork-storage`, pushed directly onto `origin/main`
(this repo's workflow pushes straight to `main`, no PR). If your local `main`
branch looks stale/behind, that's just an unfetched local ref — `origin/main`
is current; `git fetch && git reset --hard origin/main` (on `main` only, never
on a feature branch with uncommitted work) will fix it.

**Test status — all green, verified fresh today**:
- Backend: `cd backend && npx tsc --noEmit && node -r tsx/cjs --test "src/**/*.test.ts"` → 250/250
- Frontend: `npx tsc --noEmit && npm test` → 42/42
- AI backend (Python): `cd ai_backend && python -m pytest tests/ -v` → 63/63

**Brief compliance**: every section (§3–§11) is implemented, including both
items previously listed as gaps (durable file storage and `/identify-product`
are now done — see below). The one real, still-open gap is model accuracy
(fine-tuning didn't clear the bar — see "Model fine-tuning" below).

## What's done

- **§3 AI Label Reading** — Tesseract OCR primary (`backend/src/services/labelExtraction.service.ts`,
  `labelFieldExtractor.service.ts`), Qwen2-VL-2B vision-model fallback via
  `ai_backend/` only when Tesseract can't read brand/product/company/FSSAI
  (`backend/src/services/aiExtraction.service.ts`). No hardcoded product
  names/brands/flavours/companies anywhere — known-flavour/claim candidates
  are sourced from Masters at runtime.
- **§4 Product/Version Identification** — `src/services/labelIntakeService.ts`
  plus the new `/api/labels/identify-product` endpoint (FSSAI-aware AI-backed
  matching, `productIdentification` service, backend `labels.controller.ts`).
  Exact match reuses the product; a near-match is surfaced to a human;
  genuinely new products get created; versions are issued under a
  Postgres advisory lock (`nextVersionNumber` in `artwork.repository.ts`,
  scoped to `product_id + marketing_company + artwork_type`) so concurrent
  uploads can't collide. **Live-verified end-to-end today**: uploading the
  same real product twice (`Multivitamin IRN56-1.pdf` then `-2.pdf`) correctly
  created V1, then matched the existing product and assigned V2, with a
  visible "matches existing product... will be saved as a new version" banner
  before saving.
- **Durable artwork file storage** — real, working, and live-tested today.
  `POST /api/artworks` (or the label-upload flow) saves the actual uploaded
  bytes to `backend/uploads/artworks/<ARTWORK_ID>.<ext>` and serves them back
  via the auth-protected `GET /api/artworks/:id/file`; `artworks.storage_key`
  is populated. This used to be the #1 documented gap in this file — it's
  done, not a blob-URL placeholder anymore.
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
  the same layout MATCHes one and CONFLICTs the other).
- **§10 PDF Report** — `src/utils/comparisonReportPdf.ts` (jsPDF +
  jspdf-autotable, client-side). Summary, parameter table, nutrition table,
  visual comparison table, artwork images.
- **§11 API alignment** — `POST /api/labels/compare-visual`,
  `POST /api/labels/compare-visual-batch`, `POST /api/labels/identify-product`.
- **§12 (nutrition table rows)** — `LabelExtractionResult.nutritionTable`
  compared row-by-row in `compareNutritionTables()`.

## Model fine-tuning — built, evaluated, NOT good enough to ship

Full QLoRA pipeline exists in `ai_backend/finetune/` (`prepare_dataset.py`,
`build_training_set.py`, `train_lora.py`, `evaluate_adapter.py`). 44 real
label pages were manually reviewed/annotated (`ai_backend/finetune/reviewed/annotations/`,
committed — this is real ground truth now, not the "no annotations at all"
gap this file used to describe) and used to train a LoRA adapter, sitting at
`ai_backend/finetune/adapters/label-extraction-lora/` (gitignored, ~74MB,
regenerable via `train_lora.py`).

**Evaluated today against the 6-page held-out validation split**
(`python -m finetune.evaluate_adapter base|tuned`, run from `ai_backend/`):

| | Base (no adapter) | Tuned (LoRA adapter) |
|---|---|---|
| Overall | **38.2%** | **36.3%** |

The adapter is **not an improvement** — four of six pages scored a bit
better, but one page (`sleeprio_irn157_1_p1`) completely collapsed: the
fine-tuned model entered a degenerate repetition loop (a nonsensical,
endlessly-repeating "Pale [colour]" list inside the nutrition-table field),
which broke JSON parsing entirely and zeroed that page's score. That one
failure dragged the average below the base model's.

**Do not set `LABEL_LORA_ADAPTER`** — production should keep running the base
model until this is revisited. Next steps, in likely order of impact: (1)
more annotated training examples (44 is small), (2) check the training
recipe for whatever is causing the repetition-loop degeneration (repetition
penalty / learning rate / an overfit adapter latching onto a wrong pattern
are all plausible, none confirmed), (3) re-evaluate before ever flipping the
adapter on in production.

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

## Known open issues (not fixed, real, worth picking up)

1. **Dead `/api/data/*` route still gets called from the frontend, on a
   timer, and always fails.** Observed live and repeatedly during testing:
   background requests to `/api/data/Brand`, `/api/data/Comparison`,
   `/api/data/Flavour`, `/api/data/MarketingCompany`,
   `/api/data/ManufacturingCompany`, `/api/data/Product` fire continuously
   from somewhere in the Artwork Management page and always 401/503 (this
   route doesn't exist as a real, working endpoint — it's the pre-migration
   dead CRUD route mentioned in earlier session notes). It didn't block any
   feature tested, but it's continuous failed network traffic in production
   right now. Whoever picks this up: find the component/hook still calling
   it (grep for `/api/data/`) and either point it at the real REST endpoints
   or remove it.
2. **Extraction latency vs. thoroughness is an open tradeoff, not yet
   decided.** The widened retry/tile-fallback logic (see bug fixes above)
   trades speed for correctness — worst case per label is now 60–120s+.
   Options discussed with the user, none implemented: cap the tile budget to
   3–4 positions instead of 9, batch the tile calls into one GPU forward
   pass instead of 9 sequential ones, or narrow the widened retry back down
   to identity-critical fields only. Needs a decision before this matters in
   practice (i.e. before the fine-tuning accuracy gap above is closed).
3. **`pdftoppm`/poppler is not on the Node **backend's** PATH** in this dev
   environment (a separate instance of the same gap already documented below
   for `ai_backend`) — so `backend`'s own PDF-rasterization-for-OCR path
   never runs; Tesseract currently only reads PDFs' embedded text layers.
   Same fix, just needs doing for whichever shell starts `backend/` too:
   ```
   export PATH="/c/Users/sayan/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin:$PATH"
   ```

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
images) and is **not on PATH by default** in this dev environment, for
*either* `ai_backend` or `backend` (see "Known open issues" above — this used
to only be documented for `ai_backend`). PATH changes don't persist across
shells — export it fresh in every new shell that starts either service:
```
export PATH="/c/Users/sayan/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin:$PATH"
```

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
3. `export PATH=".../poppler-25.07.0/Library/bin:$PATH"` (see above) in
   *every* new shell before running backend OR ai_backend tests, or anything
   PDF-related — this bit both services this session.
4. Backend: `cd backend && npm run dev` (port 4000). Frontend production
   preview: `npm run build && npm run preview` at repo root — **rebuild
   first**, `preview` serves the stale `dist/` otherwise (bit us today). AI
   backend (optional, only needed for the vision-model fallback path):
   `cd ai_backend && uvicorn app.main:app --host 127.0.0.1 --port 8000`
   (leave `LABEL_LORA_ADAPTER` unset — see "Model fine-tuning" above).
5. Run the three test suites (commands above) before making changes, so you
   have a known-good baseline. Check the DB row counts afterward if you did
   any live browser testing or ran the backend suite more than once.
