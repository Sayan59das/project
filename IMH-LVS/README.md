# IMH Label Verification System — session handoff notes

This file exists for continuity across Claude Code sessions working on this
repo, not as end-user documentation (see `backend/README.md` for backend
setup/run instructions). If you're picking this project back up, read this
file first — it will save you re-discovering things that took a full session
to work out.

**Reference document**: `AI_Label_Reading_Comparison_Module_Developer_Brief (2).docx`
in the repo root is the authoritative requirements spec for the AI Label
Reading & Comparison module. Section numbers below (§3, §7, etc.) refer to it.

## Current state (as of 2026-09-08)

**Branch**: `feature/comparison-completeness-and-gpu-hardening` — this is the
most complete branch in the repo. It is a strict superset of
`feature/ai-backend-updates`, `feature/postgres-backend-and-local-extraction`,
and `merge/unify-branches` (all three were merged/absorbed into it earlier
this session; none of them have anything this branch lacks). Work from here,
not from any of those.

**Test status — all green**:
- Backend: `cd backend && npx tsc --noEmit && node -r tsx/cjs --test "src/**/*.test.ts"` → 223/223
- Frontend: `npx tsc --noEmit && npm test` → 32/32
- AI backend (Python): `cd ai_backend && python -m pytest tests/ -v` → 24/24

**Brief compliance**: every section (§3–§11) is implemented. See "What's NOT
done" below for the only real gaps, none of which are missing logic.

## What's done

- **§3 AI Label Reading** — Tesseract OCR primary (`backend/src/services/labelExtraction.service.ts`,
  `labelFieldExtractor.service.ts`), Qwen2-VL-2B vision-model fallback via
  `ai_backend/` only when Tesseract can't read brand/product/company/FSSAI
  (`backend/src/services/aiExtraction.service.ts`). No hardcoded product
  names/brands/flavours/companies anywhere — known-flavour/claim candidates
  are sourced from Masters at runtime.
- **§4 Product/Version Identification** — `src/services/labelIntakeService.ts`.
  Exact match reuses the product; a near-match is surfaced to a human;
  genuinely new products get created; versions are issued under a
  Postgres advisory lock (`nextSequentialId`) so concurrent uploads can't
  collide.
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
  approximation. `DIFFERENT` was renamed to `CONFLICT` everywhere (backend
  engine, both controllers, `StatusChip`, `DeviationsPanel`, frontend types).
- **§9 Visual Comparison** — `backend/src/services/imageSimilarity.service.ts`.
  Two independently-computed signals per artwork pair, from ONE
  rasterization (`fingerprintArtworkImage`):
  - `artworkSimilarity`: grayscale perceptual hash (dHash), Hamming
    distance — structural/layout, blind to colour by design.
  - `colourSimilarity`: RGB colour histogram (216 bins), histogram
    intersection — colour palette, blind to layout by design.
  Both are genuinely separate measurements (a recoloured-but-same-layout
  artwork MATCHes on one and CONFLICTs on the other) — see the module's own
  comment for why. **Honest limitation**: both are whole-image; there is no
  logo/region-detection step, so a bundled press-approval panel (some real
  files in `Dataset_Example/` have one) gets measured too. Spelling-variant
  detection and nutrition-table-structure comparison are the same §9
  sub-requirements — see §8 and §12 respectively, both done.
- **§10 PDF Report** — `src/utils/comparisonReportPdf.ts` (jsPDF +
  jspdf-autotable, generated entirely client-side — not routed through
  `ai_backend/app/services/reporting.py`, which is optional on-prem
  infra that may not be running). Summary, parameter table, nutrition
  table, visual comparison table, artwork images, 10pt+ font throughout.
  Wired to `ComparisonDetailPage.tsx`'s Download Report button.
- **§11 API alignment** — new endpoints follow existing REST conventions
  (`POST /api/labels/compare-visual`, `POST /api/labels/compare-visual-batch`).
- **§12 (nutrition table rows)** — `LabelExtractionResult.nutritionTable`
  (JSON-encoded nutrient→amount map, only ever populated by the AI
  backend fallback — Tesseract has no row-structure parser) compared
  row-by-row in `compareNutritionTables()`, not just the coarse
  `nutritionTableFormat` classification string.

### Bugs found and fixed along the way (not brief items, but real)
- `credentials: 'include'` was missing on 4 frontend fetch calls to
  `/api/labels/*`, causing 401s on every call after the session-auth
  migration. Fixed in `labelExtractionService.ts` / `labelComparisonService.ts`.
- `labelIntakeService.ts` hardcoded the literal string `'Not specified'`
  for unextracted fields, which the DB's own anti-fabrication CHECK
  constraint (`backend/src/repositories/artwork.repository.ts`) correctly
  rejects — this was **blocking every single new artwork upload** in the
  live app until fixed (now uses `''`, matching the honest-absence
  convention used everywhere else).
- A token-overlap false-SIMILAR on short numeric values ("2 g" vs "5 g")
  in the text comparison engine — fixed by adding measurement units to
  the similarity stopword set.
- `ai_backend`'s colour hardcoding (38-word list) replaced with structural
  validation; `ALLOW_CPU_INFERENCE=1` opt-in added so the AI backend isn't
  unstartable on a machine with no GPU; the missing `accelerate` pip
  dependency (required for `device_map`) was added.

## What's NOT done (real gaps, not code defects)

1. **Durable artwork file storage.** `artworks.storage_key` is a real DB
   column but stays empty for any browser-uploaded file today — artwork
   bytes only live as a session-scoped blob URL. This is why cross-session
   or cross-user comparisons often report "file unavailable". Needs an
   actual object-storage (S3, or even a persistent local-disk multer
   endpoint) integration — not started.
2. **The `/identify-product` endpoint.** Doesn't exist anywhere in the
   routes. Never built. (User has explicitly deferred this.)
3. **Model fine-tuning.** `Final_dataset/` (repo root, gitignored/untracked
   — NOT committed) has 31 real label files across ~18 products but **no
   ground-truth annotations at all**. Fine-tuning can't start until either
   (a) the user provides annotated ground truth, or (b) someone builds it
   by manually reviewing each label (very feasible at only 31 files).
   **Ask the user about this before doing anything else with that folder.**

## Architecture gotchas — read before touching comparison code

**There are THREE separate, non-interacting comparison implementations.**
Don't confuse them:
- `src/services/comparisonService.ts` — the OLDER Label
  Final→Technical→QA→Manager **approval pipeline**. Uses a hand-authored
  13-parameter model (`ParameterResult = 'MATCH'|'SIMILAR'|'CONFLICT'|'MISSING'`,
  already existed before this session's work — that's why `StatusChip`
  already had those exact chip colours). Has its own dead `findBestMatch()`
  function (zero callers) — not the same as `findBestCrossCompanyMatch()`
  above; don't "fix" one thinking it's the other.
- `src/services/labelComparisonWorkflowService.ts` +
  `backend/src/services/labelComparison.service.ts` — the **Quick Label
  Comparison** feature, i.e. what §5–§10 of the brief actually describe,
  and what essentially all of this session's work targeted.
- `ai_backend/app/services/comparison.py` — a separate Python
  sentence-transformers-based comparator. Not wired into the live app at
  all as far as established this session.

**Auth**: session-cookie based (httpOnly cookie, scrypt password hashing,
`sessions` table — deliberately not JWT, so sessions are revocable).
`requireSession`/`requireActor` middleware guards `/api/*`. Every frontend
fetch to these routes needs `credentials: 'include'` or it silently 401s —
already fixed everywhere, but if you add a new fetch call, remember this.

**Poppler (`pdftoppm`) is required** for any PDF rasterization (OCR
fallback, image previews, visual/colour comparison, PDF report artwork
images) and is **not on PATH by default** in this dev environment. It was
installed via `winget install --id oschwartz10612.Poppler` but PATH changes
don't persist across shells — every new Bash session needs:
```
export PATH="/c/Users/sayan/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin:$PATH"
```
Without this, ~6 backend PDF tests fail for environmental reasons, not real
ones — don't mistake that for a regression.

**GPU**: local machine is an RTX 4050 laptop (6GB VRAM). `ai_backend` needs
the CUDA build of torch (`cu128`) — a CPU-only torch build silently makes
inference unusably slow (`torch.cuda.is_available()` was the tell last
time this happened). `_load_model()` now refuses to start on CPU unless
`ALLOW_CPU_INFERENCE=1` is explicitly set.

**Database**: Postgres on `localhost:5433`, db `imh_lvs`, user `lvs` /
password `lvsdev` (see `backend/.env`). `SEED_USER_PASSWORD=password123`
lets you log into any seeded account. Seed accounts (all `@imhealthcare.com`):
`manager`, `account` (**account_manager — the ONLY role that can see the
"Upload Artwork" button**, per `ArtworkPage.tsx`'s role gating), `labelfinal`,
`technical`, `qa`. Frontend dev server is Vite on **port 4173**, not the
default 5173 (check `vite.config.ts` if that ever seems wrong). Backend on
port 4000 (`backend/.env`'s `PORT`).

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

**Data folders that are NOT committed to git** (by design, confirm with the
user before adding): `Dataset_Example/*` (churns constantly — some files
tracked from way earlier, most new ones untracked), `Final_dataset/` (the
31-file training-candidate set), `scratch/` (this session's throwaway
files), the developer brief `.docx` itself (a reference doc, not code).

## Quick start for a new session

1. `git checkout feature/comparison-completeness-and-gpu-hardening && git pull`
2. Start Postgres (should already be running as a local service).
3. `export PATH=".../poppler-25.07.0/Library/bin:$PATH"` (see above) in every
   new shell before running backend tests or anything PDF-related.
4. Backend: `cd backend && npm run dev` (port 4000). Frontend: `npm run dev`
   at repo root (port 4173). AI backend (optional, only needed for the
   vision-model fallback path): `cd ai_backend && uvicorn app.main:app`.
5. Run the three test suites (commands above) before making changes, so you
   have a known-good baseline.
