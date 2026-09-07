// The one place the frontend knows how to talk to the backend.
//
// A thin wrapper over `fetch` rather than axios, even though axios is already
// a dependency here. The value this needs is not a request library — it is
// three specific things, and all three are clearer written out than configured:
// unwrapping the `{ success, data }` envelope every route returns, turning a
// `{ success: false, message }` body into an error that carries the message the
// backend wrote for the user, and sending the session cookie on every call.
//
// CREDENTIALS ARE THE POINT. The session is an httpOnly cookie, which page
// script cannot read and therefore cannot attach by hand; `credentials:
// 'include'` is what makes the browser send it, and it is why the API sets
// `cors({ credentials: true })` against an explicit origin allow-list rather
// than reflecting whatever Origin arrives.

import { API_BASE_URL } from './apiConfig';

// From apiConfig, not straight from import.meta.env: that module is already
// the single place that knows about VITE_API_BASE_URL, including the loud
// warning for a production build that forgot to set it (which once pointed a
// deployed site at the visitor's own localhost). It resolves the backend's
// ORIGIN, so the /api prefix is added here.
const BASE_URL = `${API_BASE_URL}/api`;

/**
 * A failed request, carrying the status and the backend's own message.
 *
 * The message matters: the repositories translate constraint violations into
 * sentences a reviewer can act on ('Brand "BoneStrong" does not exist.'), and
 * flattening those into a generic "request failed" throws away the only part
 * of the response a user could do anything with.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** 401 — not signed in, or the session is no longer usable. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** 403 — signed in, and not allowed to do this. Signing in again won't help. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Query parameters; entries with an undefined value are omitted. */
  query?: Record<string, string | string[] | undefined>;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}${buildQuery(query)}`, {
      method,
      // Sends the session cookie. Without this the browser holds a perfectly
      // good session and never presents it, and every call 401s.
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    // fetch rejects only for a transport failure — the server is down, DNS
    // fails, CORS refused the response outright. Worth its own message,
    // because "could not reach the server" and "the server said no" call for
    // completely different things from whoever is reading it.
    throw new ApiError(0, `Could not reach the server at ${BASE_URL}. ${error instanceof Error ? error.message : ''}`.trim());
  }

  // 204 has no body to parse. Nothing returns one today; handled so that the
  // first route that does is not a JSON parse error.
  if (response.status === 204) return undefined as T;

  const payload = await readJson(response);

  if (!response.ok || payload?.success === false) {
    throw new ApiError(response.status, payload?.message ?? `Request failed with status ${response.status}.`);
  }

  return payload?.data as T;
}

type Envelope = { success?: boolean; data?: unknown; message?: string };

async function readJson(response: Response): Promise<Envelope | undefined> {
  try {
    return (await response.json()) as Envelope;
  } catch {
    // A non-JSON body from a proxy or a crash. Undefined here lets the caller
    // above report the status rather than failing on the parse.
    return undefined;
  }
}

/**
 * For the many service functions whose contract is `T | undefined`, where
 * undefined means "no such record".
 *
 * ONLY 404 becomes undefined. Everything else — a 401, a 403, a 500, the
 * server being unreachable — is rethrown, because those are not the same
 * answer and must not be shown as one.
 *
 * That distinction is the whole point of this helper existing rather than each
 * caller writing `try { ... } catch { return undefined }`. A blanket catch
 * turns "the API is down", "your session expired" and "you are not allowed to
 * see this" all into an empty screen, and on a label-compliance system an
 * empty screen reads as "there is nothing to review" — which is exactly the
 * wrong thing to tell a QA reviewer during an outage.
 */
export async function findOne<T>(request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    // Repeated keys, not comma-joined: the approvals queue asks for several
    // statuses as ?status=A&status=B, which is what the backend reads.
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}
