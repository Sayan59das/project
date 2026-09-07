// Centralized environment configuration. Every other module reads settings
// from here rather than touching process.env directly, so there is exactly
// one place that knows about .env — see .env.example for the full list.
import dotenv from 'dotenv';

dotenv.config();

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOrigins(value: string | undefined, fallback: string): string | string[] {
  const raw = value ?? fallback;
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 1 ? origins : origins[0];
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Postgres connection string. Deliberately has NO fallback value: a silent
  // default would let a misconfigured deployment connect to the wrong
  // database (or to nothing) and only reveal it once data went missing.
  //
  // It is also deliberately NOT validated here. Label extraction is
  // stateless — /api/labels/extract does OCR on an uploaded file and stores
  // nothing — so the OCR half of this service must keep starting, and its
  // tests keep running, on a machine with no database at all. The check
  // happens on first database use instead (see src/db/pool.ts), which fails
  // loudly for the routes that actually need it and stays silent for the
  // ones that do not.
  databaseUrl: process.env.DATABASE_URL?.trim() ?? '',
  // Hosted Postgres requires TLS; local Docker Postgres has no certificate.
  // Explicit rather than inferred from NODE_ENV — see src/db/pool.ts.
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
  // Render's free Postgres plan caps concurrent connections in the low tens
  // and this process is not the only client, so stay well under it.
  databasePoolMax: parsePositiveNumber(process.env.DATABASE_POOL_MAX, 10),
  port: parsePositiveNumber(process.env.PORT, 4000),
  frontendOrigin: parseOrigins(process.env.FRONTEND_ORIGIN, 'http://localhost:4173'),
  maxUploadFileSizeMb: parsePositiveNumber(process.env.MAX_UPLOAD_FILE_SIZE_MB, 5),
  // A PDF text layer shorter than this (after trimming) is treated as "no
  // usable text" and the PDF is rasterized to images for OCR instead.
  pdfMinTextLength: parsePositiveNumber(process.env.PDF_MIN_TEXT_LENGTH, 20),
  // Upper bound on how many pages of a scanned/image PDF get rasterized and
  // OCR'd, so a very long PDF can't stall a request indefinitely.
  pdfMaxOcrPages: parsePositiveNumber(process.env.PDF_MAX_OCR_PAGES, 5),
  // DPI used when rasterizing scanned PDF pages via pdftoppm before OCR.
  pdfRasterDpi: parsePositiveNumber(process.env.PDF_RASTER_DPI, 300),
  // Verbose extraction debugging (raw PDF/OCR text, parsed fields, and the
  // source text each field was matched from) — logged to the console ONLY
  // when explicitly enabled, and never on by default. Meant for temporary
  // use while diagnosing a real label's extraction; never enable this in a
  // deployment handling real uploads for longer than a debugging session,
  // since it logs label file content.
  labelExtractionDebug: process.env.LABEL_EXTRACTION_DEBUG === 'true',

  // How long a session lasts from the moment it is issued. Absolute, not
  // sliding — see 004_auth.sql. Eight hours is one working day: a reviewer
  // signs in once in the morning, and a machine left logged in overnight is
  // not still authenticated in the morning.
  sessionTtlHours: parsePositiveNumber(process.env.SESSION_TTL_HOURS, 8),

  // The session cookie's SameSite/Secure attributes.
  //
  // Locally the API (4000) and the Vite dev server (4173/5173) differ only by
  // port, and ports do not make two origins cross-SITE, so a Lax cookie is
  // sent and nothing special is needed. On Render they are two hosts under
  // onrender.com, which IS on the public suffix list, so they are cross-site
  // and the cookie has to be SameSite=None; Secure or the browser drops it.
  //
  // Explicit rather than inferred from NODE_ENV, matching databaseSsl above:
  // the deployment topology is the thing that decides this, and a developer
  // running NODE_ENV=production locally over http must not silently get a
  // cookie the browser refuses to store.
  sessionCookieCrossSite: parseBoolean(process.env.SESSION_COOKIE_CROSS_SITE, false),

  // A password applied to every seeded user by `npm run db:seed`.
  //
  // Has NO default, on purpose. Seeding a known password into a database
  // nobody asked to be seeded that way is how a demo credential reaches a
  // deployment; leaving it unset means the seeded users simply have no
  // credential and cannot log in until somebody sets one. For local work,
  // put SEED_USER_PASSWORD=password123 in .env — the same password the
  // frontend prototype's mock login used (src/auth/mockUsers.ts).
  seedUserPassword: process.env.SEED_USER_PASSWORD?.trim() ?? ''
};
