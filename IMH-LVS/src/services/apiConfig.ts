// Shared backend base URL resolution — every service that calls the IMH
// LVS backend (label extraction, label comparison, ...) imports API_BASE_URL
// from here rather than re-deriving it, so there is exactly one place that
// knows about VITE_API_BASE_URL and its production fallback warning.
//
// The backend URL is never hardcoded — it comes from VITE_API_BASE_URL
// (see .env.example), defaulting to the local dev backend only when unset.
// In a production build that default is almost certainly wrong (it would
// point the deployed site at the *visitor's own* localhost, which is what
// caused label extraction to silently fail on Vercel until this was
// caught), so a missing value is logged loudly instead of failing quietly.
// Read through a guarded alias rather than `import.meta.env.X` directly.
// Vite replaces `import.meta.env` with a real object at build time, so the
// browser build is unchanged — but the unit tests run this module under plain
// node (services that talk to the API are now imported by code under test),
// where `import.meta.env` does not exist and a direct property read throws
// before any test can run.
type ViteEnv = { VITE_API_BASE_URL?: string; PROD?: boolean };
const env: ViteEnv = (import.meta as ImportMeta & { env?: ViteEnv }).env ?? {};

const rawApiBaseUrl = env.VITE_API_BASE_URL;

if (!rawApiBaseUrl && env.PROD) {
  // eslint-disable-next-line no-console
  console.error(
    '[apiConfig] VITE_API_BASE_URL is not set in this production build — ' +
      'backend requests will try to reach http://localhost:4000, which does not exist for site visitors. ' +
      'Set VITE_API_BASE_URL to the deployed backend\'s public HTTPS URL in the hosting platform\'s environment variables and redeploy.'
  );
}

export const API_BASE_URL = (rawApiBaseUrl || 'http://localhost:4000').replace(/\/+$/, '');
