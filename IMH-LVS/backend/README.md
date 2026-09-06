# IMH LVS Backend

Foundation backend for IMH LVS. Node.js + Express + TypeScript, kept
completely separate from the existing React/Vite frontend (which continues
to run entirely on localStorage). Label extraction is powered entirely by
**open-source Tesseract OCR** (via `tesseract.js`) running locally — there
is no paid AI/OCR API involved and no external service call at extraction
time. When OCR can't confidently read a field, it comes back as an empty
string rather than a guess.

## Install

```bash
cd backend
npm install
```

### System dependency for scanned/image-based PDFs: `poppler-utils`

Most of the OCR pipeline (JPG/JPEG images, and PDFs with a real text layer)
works with nothing beyond `npm install`. Scanned/image-only PDFs are
rasterized to page images via the `pdftoppm` command-line tool before OCR,
which ships in the `poppler-utils` system package:

```bash
# Debian/Ubuntu
sudo apt-get install poppler-utils

# macOS (Homebrew)
brew install poppler
```

If `pdftoppm` is not installed, that one path (scanned PDFs specifically —
everything else is unaffected) degrades gracefully: the API still returns
`200` with all 7 fields blank rather than erroring or crashing, and a clear
message is logged server-side. See "Known limitations" below.

## There is no authentication yet — do not expose this API

The persistence routes (`/api/masters`, `/api/products`, `/api/users`,
`/api/artworks`, `/api/comparisons`) have **no authentication and no
authorization**. Every write is recorded against a person because the audit
trail requires one, and with no sessions the caller simply states who they are:

```
X-Actor-Name: Neha Singh          # every write
X-Actor-Id / X-Actor-Role          # also required for a workflow decision
```

The server believes it. Anyone who can reach the API can approve a label as
anybody, and read or change every record.

A missing actor is a `400` rather than a default like `system`, on purpose: a
fabricated name in a pharma approval trail reads exactly like a real one, and
is worse than a refused request. But that only makes the trail honest about
*absence* — it does nothing about impersonation.

**So until real auth lands, this backend must not be reachable from the public
internet.** `requireActor` in `src/controllers/http.ts` is the single place a
decoded session would replace these headers.

## Database (Postgres)

The backend persists Products, Artwork, Masters, Users, Label Attributes and
Comparisons in Postgres. Label extraction is the exception — `/api/labels/extract`
is stateless, OCRs the uploaded file and stores nothing, so **it works with no
database configured at all**. That is why a missing `DATABASE_URL` does not stop
the server booting; it fails on the first request that actually needs storage.

### Why Postgres and not MongoDB

This domain is relational and the invariants are worth enforcing in the
database rather than in whichever service happens to write:

- **Cross-company comparison** finds the same product name at a *different*
  marketing company and then that product's latest approved artwork — a
  self-join plus a ranking, expressed as one query against
  `products_name_lower_idx` and the `latest_approved_artworks` view.
- **`comparison_parameters_absent_is_missing`** makes it impossible to store
  "these two labels match" when either side has no captured value. That
  false-MATCH was a real defect; it is now unrepresentable.
- **`comparison_workflow_history` is append-only**, enforced by a trigger.
  An audit trail a compliance reviewer relies on should not depend on every
  code path remembering not to rewrite it.
- **Approval decisions write three tables atomically** (comparison status,
  history entry, artwork status). One transaction, or none of it.

The `$jsonSchema` validators MongoDB offers cannot express a cross-field
conditional like the first two, and it has no triggers for the third.

### User permissions

A user's `permissions` object has two halves and they are stored differently
(migration 003):

- **`actions`** is not stored. `UsersPage` recomputes it from the role on
  every save and offers no control that edits it, so it is derived. A stored
  copy would go stale the moment `src/auth/permissions.ts` changes, and a
  stale action list is how a revoked capability comes back.
- **`modules`** is stored, in `user_module_access`, because a Manager can
  tick and untick it per user. Only the **overrides** are there: a user with
  no rows has not been customised, and the caller applies the role's defaults
  from `ROLE_MODULE_ACCESS`, which stays the only copy of that policy.

Absence therefore means "no override", never "no access" — reading it the
other way would have locked every existing user out the moment the migration
ran.

### Local setup

Run Postgres in Docker (port 5433 rather than 5432, so it cannot collide
with a Postgres already installed on the host):

```bash
docker run -d --name imh-lvs-pg \
  -e POSTGRES_USER=lvs -e POSTGRES_PASSWORD=lvsdev -e POSTGRES_DB=imh_lvs \
  -p 5433:5432 --restart unless-stopped postgres:16-alpine
```

Then, with `DATABASE_URL` set in `.env` (see `.env.example`):

```bash
npm run db:migrate   # apply schema migrations
npm run db:seed      # load the app's existing demo data
```

Both are safe to re-run. Migrations are recorded in `schema_migrations` and
skipped once applied; seed inserts are `ON CONFLICT DO NOTHING`.

A `psql` shell, without installing Postgres locally:

```bash
docker exec -it imh-lvs-pg psql -U lvs -d imh_lvs
```

#### Without Docker

If the Docker daemon is not available, `embedded-postgres` runs a real
Postgres as an ordinary process — no VM, no admin rights, contrib extensions
(`citext`, which the schema needs) included. Install it **outside this
repository** so it does not become a dependency of the backend:

```bash
mkdir /tmp/pg && cd /tmp/pg && npm init -y && npm install embedded-postgres
BIN=node_modules/@embedded-postgres/*/native/bin
printf 'lvsdev' > pwfile.txt
$BIN/initdb -D ./pgdata -U lvs --pwfile=./pwfile.txt -E UTF8 --auth=md5
$BIN/pg_ctl -D ./pgdata -l pg.log -o "-p 5433 -c listen_addresses=127.0.0.1" start
```

Then create the database once (`CREATE DATABASE imh_lvs`) and use the same
`DATABASE_URL` as the Docker setup, with host `127.0.0.1` rather than
`localhost` — the cluster above listens on IPv4 only, and `localhost`
resolves to `::1` first on Windows.

### Database tests

`src/__tests__/db.repositories.test.ts` runs the repositories and the
schema's constraints against a real database. It **skips** when
`DATABASE_URL` is unset, so `npm test` still works on a machine with no
Postgres — the same rule `src/db/pool.ts` follows.

When it is set, the tests expect a migrated and seeded database and say so if
they do not find one. Every write runs in a transaction that is rolled back
whether the test passes or fails, so the suite leaves the seed data exactly
as it found it and is safe to re-run.

### Migrations

SQL files in `db/migrations/`, named `NNN_description.sql` and applied in
filename order, exactly once each, by `src/db/migrate.ts`.

Rules the runner enforces:

- **Each migration runs in its own transaction**, together with its
  bookkeeping row. A failure part-way leaves it fully rolled back, never
  half-applied and recorded as done.
- **Migration files must not contain their own `BEGIN`/`COMMIT`.** The
  runner owns the transaction; an inner `COMMIT` would close it early.
- **Applied migrations are immutable.** Each file's checksum is stored, and
  editing an already-applied migration aborts the next run with an
  explanation. Add a new migration instead.
- Concurrent runners (two deploy hooks, CI racing a developer) serialise on
  a table lock, so the second one skips rather than double-applies.

### Deployment

`render.yaml` provisions a managed Postgres and injects its connection
string. Migrations run in the service's pre-deploy command:

```
node dist/db/migrate.js && node dist/db/seed.js
```

Compiled output, not `npm run db:migrate` — that runs the TypeScript through
`tsx`, which is a devDependency and absent from the production image. It is a
pre-deploy step rather than part of `CMD` so it runs once per deploy instead
of racing every replica against the same migration.

Set `DATABASE_SSL=true` for any hosted Postgres (Render, Neon, Supabase);
local Docker Postgres has no certificate, so it stays `false`.

## Development

```bash
npm run dev
```

Starts the server with hot reload (via `tsx watch`) on the port from
`.env` (default `4000`).

## Build

```bash
npm run build
```

Compiles TypeScript from `src/` to `dist/`.

## Run the production build

```bash
npm start
```

Runs the compiled output at `dist/server.js`. Run `npm run build` first.

## Type-check only

```bash
npm run typecheck
```

## Tests

```bash
npm test
```

Runs the integration test suite (Node's built-in `node:test` runner, no
extra test-framework dependency) against `POST /api/labels/extract`,
covering: a JPG label, a PDF with a selectable text layer, a scanned/
image-only PDF, a real label PDF (`apple-cider-vinegar-gummy.pdf`) with a
known text-layer-only limitation, a JPG reproducing that same real-label
pattern via OCR, an unsupported file type, an oversized file, a missing
file, and corrupt/unreadable PDF and image files. Fixtures live in
`src/__tests__/fixtures/` — mostly synthetic (generated for this test
suite), plus one real label PDF — see "Known limitations".

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Port the server listens on. |
| `NODE_ENV` | `development` | Standard Node environment flag. |
| `FRONTEND_ORIGIN` | `http://localhost:4173` | Allowed CORS origin(s) — comma-separate multiple values (e.g. local dev + the Vercel-deployed frontend URL). |
| `MAX_UPLOAD_FILE_SIZE_MB` | `5` | Maximum accepted label file size. |
| `PDF_MIN_TEXT_LENGTH` | `20` | A PDF text layer shorter than this many characters is treated as "no usable text", triggering the scanned-PDF OCR path instead. |
| `PDF_MAX_OCR_PAGES` | `5` | Maximum number of pages of a scanned/image PDF rasterized and OCR'd per request. |
| `PDF_RASTER_DPI` | `300` | DPI used by `pdftoppm` when rasterizing scanned PDF pages before OCR. |
| `LABEL_EXTRACTION_DEBUG` | `false` | When `true`, logs the raw PDF/OCR text, parsed fields, and the anchor/reason each field matched (or didn't) — see "How OCR is connected". Temporary debugging aid only; never leave enabled in a long-lived deployment, since it logs label content. |

No API key is required — Tesseract OCR runs locally. `.env` is git-ignored
(see `.gitignore`); this project has no secrets to protect for this
feature, but the same rule stands for future providers.

## Deployment

The frontend (deployed separately, e.g. on Vercel) needs this backend
running at a **public HTTPS URL** — `VITE_API_BASE_URL` in the frontend
build must point at it (see the root `.env.example`). This backend does
**not** deploy on Vercel itself (Vercel's serverless functions don't fit an
Express server with local file processing and a native image library); use
a container/VM-style host instead — Render, Railway, Fly.io, or your own
server.

### Docker

`backend/Dockerfile` builds a self-contained, production-ready image:

```bash
cd backend
docker build -t imh-lvs-backend .
docker run -p 4000:4000 -e FRONTEND_ORIGIN=https://your-frontend.vercel.app imh-lvs-backend
```

It uses `node:22-slim` (not Alpine) deliberately — `sharp`'s prebuilt
binaries and glibc compatibility are far more reliable there than on
musl/Alpine — and installs `poppler-utils` (`pdftoppm`) via `apt` in the
image, so the scanned-PDF OCR path works out of the box, unlike the
sandbox this backend was originally built in (see "Known limitations").
This same Dockerfile works unchanged on Render, Railway, and Fly.io, all of
which support "deploy from Dockerfile."

### Render

A ready-to-use Blueprint is provided at the repo root
(`render.yaml`, referencing `backend/Dockerfile`):

1. In the Render dashboard: **New** → **Blueprint**, point it at this repo.
2. Render builds and deploys `backend/` as a Docker web service and exposes
   a public `https://<service-name>.onrender.com` URL automatically —
   Render sets `$PORT` itself, which `src/config/env.ts` already respects.
3. After the first deploy, set the `FRONTEND_ORIGIN` environment variable
   (left blank in the blueprint on purpose) to your deployed frontend's
   exact origin, e.g. `https://your-app.vercel.app`, then redeploy.
4. Health check: `GET /api/health` (already wired into the blueprint).

Railway and Fly.io both auto-detect `backend/Dockerfile` if you point
their CLI/dashboard at this repo with `backend` as the app root — the same
environment variables from the table above apply; the platform's own
`$PORT` is always respected.

### After deploying

Once the backend has a public URL:

1. Set `VITE_API_BASE_URL` to that URL in the frontend hosting platform's
   environment variables (e.g. Vercel → Project → Settings → Environment
   Variables) and redeploy the frontend — it's a build-time value, so a
   redeploy is required for the change to take effect.
2. Set this backend's `FRONTEND_ORIGIN` to the frontend's exact deployed
   origin so CORS allows the browser request.

## API endpoints

### `GET /api/health`

```json
{ "success": true, "message": "IMH LVS Backend is running" }
```

### `POST /api/labels/extract`

Multipart form upload, field name `file`. Accepts **PDF, JPG or JPEG only**,
up to `MAX_UPLOAD_FILE_SIZE_MB`.

**Example request:**

```bash
curl -X POST http://localhost:4000/api/labels/extract \
  -F "file=@/path/to/label.jpg"
```

**Success (`200`)** — the 9 fields below are read from the label via OCR;
`manufacturingCompany` is always the fixed value shown and is **never**
read from the label:

```json
{
  "success": true,
  "data": {
    "marketingCompany": "Knoll Pharmaceuticals Ltd.",
    "address": "M-17, Pharma Tower, First Floor, Badli Industrial Area, New Delhi 110042 (INDIA)",
    "fssaiNumber": "13319002000728",
    "email": "sales@knollpharma.in",
    "customerCareNumber": "+91-9958879977",
    "brand": "Nutrinol",
    "flavour": "Apple",
    "productName": "Apple Cider Vinegar Gummies",
    "packageSize": "30",
    "manufacturingCompany": "IM Healthcare Pvt. Ltd."
  }
}
```

Any of the 9 fields OCR can't confidently identify comes back as `""` — it
is **never guessed or fabricated**, even when OCR itself read the
surrounding text perfectly (see "OCR confidence vs. field extraction
confidence" below). If nothing could be extracted at all (e.g. an
unreadable/corrupt file, or a scanned PDF and `pdftoppm` isn't installed),
the endpoint still returns `200` with all 9 fields blank
(`manufacturingCompany` still fixed) rather than an error — see
`src/services/labelExtraction.service.ts`. The response never includes raw
OCR text or any other debug/internal detail by default; that text is used
internally for field-parsing only and is not part of the response shape
unless `LABEL_EXTRACTION_DEBUG` is explicitly turned on (server-side
console logging only — never added to the HTTP response).

Error responses (all shapes are `{ "success": false, "message": "..." }`) —
these only cover upload validation; OCR-side failures never reach this
shape, per above:

| Condition | Status |
|---|---|
| No file attached | `400` |
| Unsupported file type (not PDF/JPG/JPEG) | `400` |
| File exceeds `MAX_UPLOAD_FILE_SIZE_MB` | `413` |
| Unexpected server error | `500` |

## Project structure

```
backend/
  src/
    server.ts                 # process entry point
    app.ts                    # express app wiring (middleware + routes)
    config/
      env.ts                  # loads and validates environment variables
      constants.ts            # fixed manufacturing company, allowed MIME types
    routes/
      index.ts                # mounts /health and /labels under /api
      health.routes.ts
      labels.routes.ts
    controllers/
      health.controller.ts
      labels.controller.ts    # no OCR logic — only validates, delegates, cleans up
    services/
      labelExtraction.service.ts     # orchestrator: PDF/image routing + escalation + fallback
      pdf.service.ts                 # PDF text-layer extraction + pdftoppm rasterization
      tesseract.service.ts           # tesseract.js worker wrapper (text, word-boxes, region OCR)
      regionOcr.service.ts           # targeted region re-OCR for marketing company/address
      imagePreprocessing.service.ts  # sharp: grayscale/resize/contrast/threshold (+ alt variant)
      labelFieldExtractor.service.ts # regex/heuristic parsing of raw text into the 9 fields
    middleware/
      upload.middleware.ts    # multer: file type/size validation
      errorHandler.middleware.ts
    __tests__/
      labels.extract.test.ts  # integration tests against the real Express app
      fixtures/                # synthetic test files (see "Known limitations")
  uploads/                     # temporary upload storage, git-ignored
  .env.example
  .gitignore
```

## How OCR is connected

`src/services/labelExtraction.service.ts` is the single orchestrator and
the only module that knows OCR is implemented with Tesseract —
`labels.controller.ts` only calls `extractLabelFromFile(filePath, mimeType)`
and gets back the same `LabelExtractionResult` shape every time, regardless
of internal path. Swapping the OCR engine (or adding a future provider)
later only touches this service layer, never the controller, route, or
response contract.

Internally:

1. **Get raw text.**
   - **Image (JPG/JPEG):** the buffer is preprocessed
     (`imagePreprocessing.service.ts`: grayscale → upscale if small →
     normalize contrast → threshold to black/white) and passed straight to
     `tesseract.service.ts`'s `recognizeText()`.
   - **PDF:** see "PDF handling" below — this is where OCR gets combined
     with the PDF's own text layer, not just used as a fallback for
     completely textless PDFs.
2. **Parse fields.** The available raw text is handed to
   `labelFieldExtractor.service.ts`, which uses regex/keyword-anchor/
   positional heuristics per field (see below) and returns `""` for
   anything not confidently matched — **on purpose, independently of
   whether the underlying OCR/text-layer text itself was accurate**. This
   is the "OCR confidence vs. field extraction confidence" distinction:
   OCR can read a label's text perfectly and this step can still correctly
   decide "this field genuinely isn't identifiable" (e.g. a label that
   simply never prints an email address) rather than guess.
3. **Fix manufacturing company.** `manufacturingCompany` is set to the fixed
   constant `IM Healthcare Pvt. Ltd.` (`config/constants.ts`) — it is never
   part of OCR or parsing, and field extraction never even considers a
   candidate that names it.
4. **Fail safe.** Any error anywhere in steps 1–2 (corrupt file, OCR
   exception, no text found) is caught and answered with
   `buildPlaceholderExtraction()` — all 8 fields blank, manufacturing
   company still fixed. The API never throws a 500 for a bad/corrupt label
   file; it always returns a controlled `200` with blank fields instead.

### Tesseract engine (`tesseract.service.ts`)

Uses `tesseract.js` (pure JS/WASM, MIT-licensed, no paid API). Trained data
for English is bundled locally via the `@tesseract.js-data/eng` npm
package rather than fetched from a CDN at request time — this makes OCR
work fully offline and removes a runtime dependency on a third-party CDN
being reachable. `tesseract.js-core` (the WASM recognition engine) is
likewise a local npm dependency, not fetched remotely.

### Field extraction heuristics (`labelFieldExtractor.service.ts`)

A recurring problem on real labels: the SAME kind of value appears twice —
once for the manufacturer, once for the marketing company (most often an
FSSAI number, sometimes an address) — with no guaranteed line order once
text has gone through OCR or a PDF's own (occasionally column-scrambled)
text layer. Rather than trusting "first match wins", candidates for these
fields are scored by which anchor phrase — a manufacturing one
("Manufactured by", "Mfg by") or a marketing one ("Marketed by", "Marketed
in India by", "Customer Care", "Registered Office", etc.) — most recently
precedes them in the text, and a candidate whose nearest anchor is a
manufacturing one is rejected, since manufacturingCompany (and anything
tied to it) is never sourced from OCR.

A second, distinct problem shows up specifically on dense, multi-column,
icon-heavy label layouts: Tesseract's default page segmentation can read
such a page out of order and fuse a real anchor (e.g. "Marketed in India
by:") onto the same reconstructed OCR "line" as an unrelated garbled icon
graphic or a whole unrelated sentence from elsewhere on the page.
`sanitizeCandidateLine` guards Marketing Company and Address specifically
against this: it truncates a candidate at the first noise character
(`[`, `]`, `®`, an em dash, etc.) or the first word that only belongs in
ingredient/nutrition copy ("Ingredients", "Acidity", "Vinegar", ...), then
rejects what remains if it's too long or too much of it is short,
non-word-like fragments (an OCR-garbled icon reads as a run of 1-2 letter
nonsense tokens) — returning blank rather than a multi-hundred-character
fusion of real and garbled text.

- **Marketing Company / Party:** a line matching a prefix like `Marketed
  by`, `Marketed in India by`, `Marketed & Distributed by`, `Manufactured
  for`, `Distributed by`, `Mfd./Mfg. for`, or `Manufactured/Marketed by`,
  run through the noise gate above. Handles the anchor and the company name
  being on separate lines (e.g. "Marketed in India by:" on one line, "Knoll
  Pharmaceuticals Ltd." on the next) — common once a design's stacked text
  is OCR'd. Falls back to a bare "For `<Company incl. Ltd/Pvt/LLP/etc.>`"
  line only when it clearly names a company, so an ordinary sentence
  starting with "For" is never mistaken for it. A line that says only
  "Manufactured by" (no marketing wording) is always skipped.
- **Address:** an `Address:` or `Registered Office:`/`Regd. Office:` line,
  or — the common real-world layout — the 1-3 lines immediately following
  the identified marketing company, each run through the same noise gate
  and collected until the next section (FSSAI/customer care/email/etc.)
  starts or a line fails the gate — collection stops there rather than
  skipping the bad line and reading further, so a later line that only
  coincidentally looks clean is never picked up out of context. Never the
  lines following a "Manufactured by" block.
- **FSSAI Number:** every `FSSAI`/`FSSAI Lic. No.`/`FSSAI License No.`
  match is collected as a candidate, and any candidate closer to a
  manufacturing anchor than a marketing one is rejected — this is what
  correctly picks the marketing company's FSSAI number over the
  manufacturer's when a label prints both. If every labeled candidate is
  manufacturer-side, a bare 14-digit run sitting right next to "Customer
  Care" or an email address is accepted as a lower-confidence fallback
  (handles a stylized "FSSAI" logo/wordmark that doesn't survive text
  extraction while the adjacent number does). Always exactly 14 digits,
  preserved as printed.
- **Email:** standard email-address pattern; trailing sentence punctuation
  is trimmed.
- **Customer Care Number:** a phone-like number found near "Customer Care",
  "Consumer Care", "Helpline", or "Toll-free" — preserves a leading `+`
  country-code prefix and collapses incidental whitespace; a bare number
  elsewhere on the label (e.g. a pincode) is never treated as a phone
  number.
- **Brand / Product Name:** both are read the same way real packaging
  prints them — as short, prominent, **ALL-CAPS** display text (a
  title/logo block), distinct from mixed-case body copy. A single short
  (≤2 words) ALL-CAPS line is the brand; a longer or multi-line ALL-CAPS
  block is the product name; a short line followed by a longer block is
  brand-then-product-name. Table/form fragments ("Price :", a nutrition
  row like "Energy") and parenthetical asides are excluded, and scanning
  stops at the first sign of manufacturer/FSSAI/ingredients/nutrition copy
  — a well-formed label always states its identity before any of that.
  If no ALL-CAPS text is found at all, brand falls back to the first
  mixed-case line surviving the same filters (for a plain, non-stylized PDF
  text layer with no logo graphic in play); product name has no such
  fallback — a wrong product name would incorrectly auto-match or create
  the wrong Product record downstream, so it is left blank rather than
  guessed from body text. A line that is itself a short phrase repeated
  end-to-end (e.g. "GUMMIES GUMMIES GUMMIES GUMMIES GUMMIES" — seen on a
  print sheet where the same banner artwork repeats several times across
  the page and OCR reads each repetition as part of one line) is collapsed
  to a single occurrence before any of the above runs, so repeated banner
  text is neither wrongly excluded for being "too long" nor turned into
  nonsense-repeated output.
- **Flavour:** explicit `<Name> Flavour`/`<Name> Flavor` wording (the
  dominant on-label phrasing, e.g. "Apple Flavour") is checked first, then
  `Flavour: <Name>`, then a list of common flavour/variant keywords
  (Orange, Strawberry, Mango, Mixed Berry, etc.) as a last resort — in that
  order, so an explicit label always wins over an incidental ingredient
  mention elsewhere (e.g. "Apple Cider Vinegar" in an ingredients list).
- **Package Size:** the total pack count printed on the front of the
  label — a number immediately next to "Gummies"/"Gummy" (the V1 target;
  "Count"/"Capsules"/"Tablets" are supported too for future label types),
  e.g. "30 Gummies" → `"30"`. Never the per-serving amount: a candidate is
  rejected when "Serving Size"/"Per Serving"/"Servings Per Container"/"No.
  of Serving" wording appears earlier on the **same line** — so "Serving
  Size: 1 Gummy" is correctly ignored even when a real "30 Gummies" line
  sits immediately next to it. No hardcoded numbers; a label with no such
  wording anywhere comes back blank rather than guessed.

### OCR confidence vs. field extraction confidence — escalation passes

Two of the fields above (Marketing Company/Address, and Brand/Product
Name) get extra OCR attempts — but only when the simpler/cheaper attempt
already came up short, so a label that extracts cleanly on the first pass
never pays for either:

- **A second preprocessing pass for Brand/Product Name.** The default
  preprocessing (`imagePreprocessing.service.ts`) applies a fixed
  brightness threshold, which can inconsistently blow out large, bold,
  high-contrast display text (e.g. white text on a saturated color
  banner) — losing it entirely rather than just misreading it. If brand or
  product name are still missing after the primary pass, the same image is
  re-preprocessed **without** the hard threshold (letting Tesseract's own
  adaptive binarization handle it) and re-OCR'd; the result is folded into
  the combined text pool alongside the primary pass's, so either can
  supply the title text the other missed.
- **Targeted, region-based re-OCR for Marketing Company/Address**
  (`regionOcr.service.ts`). A full-page OCR pass on a dense, multi-column,
  icon-heavy label can read the page out of its intended order and fuse a
  real anchor (e.g. "Marketed in India by:") onto the same reconstructed
  line as unrelated content from a different part of the page — which the
  noise/confidence gate above correctly rejects, but that still leaves the
  field blank when the real value was recoverable. If marketing
  company/address are still missing after the full-page pass, the primary
  pass's own word-level positions (requested via Tesseract's `blocks`
  output) are searched for a marketing-company anchor phrase; once found,
  a region around it — sized as a multiple of the anchor's own text height
  (so it scales with page size/DPI rather than guessing a fixed pixel
  width) — is cropped and re-OCR'd on its own with `PSM.SINGLE_BLOCK`
  (Tesseract's page-segmentation mode for "one uniform block of text"),
  away from whatever unrelated column confused the full-page reading
  order. The focused text is parsed with the exact same
  `extractMarketingCompany`/`extractAddress` logic and confidence gates as
  everywhere else — this escalation only ever *finds* a value it would
  already have trusted from anywhere else, it doesn't relax the bar to get
  one. Sizing the crop from the page's own text height (rather than a
  fraction of the page's width) was a deliberate choice after a
  width-relative crop reached across a genuinely separate column on a
  wide, multi-panel real label — there's no reliable relationship between
  a column's width and the page's total width, but there is between text
  size and page DPI.

### Debugging a real label's extraction

Set `LABEL_EXTRACTION_DEBUG=true` (see "Environment variables") to log, for
one request: the raw PDF text layer, the OCR text (if OCR ran), the fully
parsed field values, and — for every field — which anchor/pattern it
matched or why it didn't. This is server-console-only and is never added
to the HTTP response; turn it off again once you're done, since it logs
label file content.

Every rule above only returns a value when it's confident; anything else is
`""`.

## PDF handling

`src/services/pdf.service.ts` provides two building blocks that
`labelExtraction.service.ts` combines rather than picking strictly one or
the other:

1. **Text-layer extraction (`extractPdfText`)** — uses `pdfjs-dist`
   (Mozilla's PDF.js) to read the PDF's existing text layer directly, with
   no OCR involved. Line breaks are rebuilt from pdfjs's per-item `hasEOL`
   marker so the field heuristics above (which are line-based) see the
   label's real line structure rather than one long run-on line. Supports
   multi-page PDFs — all pages' text is combined before field extraction.
   `pdfjs-dist` ships ESM-only builds; since this project compiles to
   CommonJS, it's loaded via a real dynamic `import()` forced through
   `new Function('specifier', 'return import(specifier)')` rather than a
   plain `import`, which `tsc` would otherwise rewrite into a `require()`
   that can't load `.mjs` files.
2. **Rasterization + OCR (`rasterizePdfPages`)** — rasterizes up to
   `PDF_MAX_OCR_PAGES` pages to PNG at `PDF_RASTER_DPI` by shelling out to
   the `pdftoppm` command (poppler-utils); each page image is then
   preprocessed and OCR'd the same way a JPG upload would be. The temp
   directory (source PDF + rendered pages) is always deleted afterward,
   success or failure. If `pdftoppm` is missing (`ENOENT`) or rendering
   otherwise fails, this resolves to an empty result — logged clearly.

**When OCR runs, and why it's not just a fallback for textless PDFs.** The
orchestrator (`labelExtraction.service.ts`) first parses fields from the
text layer alone. If the text layer is missing or too short
(`hasUsablePdfText`, threshold `PDF_MIN_TEXT_LENGTH`) **or any required
field is still missing after parsing it**, it also rasterizes and OCRs the
page(s), combines that OCR text with the text layer, and re-parses once
more. This matters because a PDF frequently isn't cleanly "all real text"
or "all scanned image" — a real label encountered during development had a
genuine, fully-extractable compliance-text panel (FSSAI number, email,
customer care) sitting right next to a brand/product-name/marketing-company
header that turned out to be unreadable as text (an embedded raster image
in that case; a display font with a broken/missing Unicode mapping would
produce the identical symptom). Checking only "does the text layer have
enough characters" would call that PDF's text "usable" and never attempt
OCR at all, silently losing the header. If OCR can't run (`pdftoppm`
missing), the text-layer-only fields are kept rather than discarded —
partial, honest data beats none.

**Why shell out to `pdftoppm` instead of rendering PDF pages to images
in-process?** Two in-process approaches were evaluated and rejected during
development: `pdfjs-dist` + `@napi-rs/canvas` caused a hard process
**segmentation fault**, which would violate "the API should return a
controlled response rather than crashing the server"; `pdfjs-dist` +
classic `canvas` (node-canvas) avoided the crash but threw from inside
pdfjs-dist's internal image-rendering pipeline (`Image or Canvas expected`)
— a real version incompatibility, reproduced with two different PDF
fixtures. `pdftoppm` is a mature, independent native tool with none of
those failure modes, at the cost of a system-level dependency instead of a
pure-npm one.

## Image preprocessing

`src/services/imagePreprocessing.service.ts` uses `sharp` to improve OCR
accuracy: grayscale, upscale if narrower than 1600px, contrast
normalization, and a fixed threshold to black/white. This is deliberately
minimal per the "don't over-engineer this phase" scope — **deskewing is
not implemented**; a rotated/skewed photo of a label may OCR poorly. All
preprocessing happens on in-memory buffers; the original uploaded file on
disk is never modified, and the temp upload is deleted by
`labels.controller.ts` after the request completes either way.

## Known limitations

- **Deskew is not implemented.** A significantly rotated or skewed photo of
  a label may produce poor OCR results.
- **`pdftoppm` (poppler-utils) is a required deployment prerequisite** for
  the rasterize → OCR path (both for scanned/image-only PDFs and for the
  hybrid text-layer+OCR escalation described in "PDF handling") — it ships
  in the backend's Docker image (`apt-get install poppler-utils`, see
  `Dockerfile`) and has been verified end-to-end: installing the identical
  package outside Docker and running the full pipeline (PDF text layer →
  rasterize via `pdftoppm` → preprocess → Tesseract OCR → field extraction)
  against both a synthetic fixture and the real label PDF below produced
  real, non-simulated OCR text and correctly extracted fields. If
  `pdftoppm` is missing at runtime, this path falls back to whatever the
  text layer alone provided rather than crashing (see the corrupt-PDF test
  for that failure mode specifically).
- **Test fixtures include one real label** (`apple-cider-vinegar-gummy.pdf`,
  a real "Nutrinol Apple Cider Vinegar Gummies" label) alongside the
  synthetic ones from the initial build. Two things about it turned out to
  need dedicated handling, both now covered by regression tests:
  - Its brand/product-title/marketing-company/address are printed as an
    embedded image (or vector text in a font with a broken Unicode mapping
    — pdfjs can't recover either as text) while a separate, genuinely
    extractable compliance-text panel carries the rest, including a
    *second*, unlabeled FSSAI number — this is what the hybrid
    text-layer+OCR escalation and the FSSAI manufacturing/marketing
    disambiguation (see "Field extraction heuristics") exist for.
  - Once OCR does run, this label's actual layout is dense, multi-column,
    and icon-heavy enough that Tesseract's default page segmentation reads
    it out of order, occasionally fusing a real anchor (e.g. "Marketed in
    India by:") onto the same reconstructed line as an unrelated garbled
    icon graphic or a whole unrelated sentence from elsewhere on the page,
    and its title banner repeats 5 times across the print sheet. A
    noise/confidence gate (`sanitizeCandidateLine`) rejects a fused/garbled
    candidate outright rather than returning it, a repeated-phrase collapse
    fixes the repeated-banner case, and a targeted region re-OCR around the
    located anchor (`regionOcr.service.ts`) now **reliably** recovers
    marketing company and address for this file specifically — verified
    deterministic across repeated runs, so the regression test asserts
    their actual recovered content, not just "not garbled" — never the
    confidently-wrong data they used to return. Product name is the one
    field that remains incomplete on this exact file: a second
    preprocessing pass recovers the brand ("Nutrinol") that the primary
    pass drops entirely, but the title banner's middle line ("Apple Cider
    Vinegar") isn't read as text by either preprocessing pass against this
    specific rendering — the result is the real, correctly-deduplicated
    OCR text ("Gummies"), not a fabricated complete title. Broader
    real-label accuracy testing (varied fonts, layouts, photo quality,
    lighting, skew) beyond this one file still needs to be performed
    against more real label files.
- **Regex/heuristic field parsing** (not a language model) can miss
  fields on label layouts that differ significantly from the patterns
  described above (e.g. unusual phrasing for "marketed by", a flavour name
  not in the known-flavour list, a brand/product name that isn't printed in
  ALL-CAPS anywhere, or an FSSAI number that isn't exactly 14 digits after
  OCR misreads a character). In every such case the field is left `""`
  rather than guessed, per the no-fabrication requirement, but that also
  means some genuinely-present values may legitimately come back blank and
  need manual entry — this is expected behavior, not a bug, for an
  OCR+regex pipeline as opposed to an AI vision model.

## Relationship to the frontend

The frontend (`/src` at the repo root) is unaffected by this change — the
API endpoint and response contract are identical to before, and the
frontend has no knowledge of which OCR/AI provider is used internally.
