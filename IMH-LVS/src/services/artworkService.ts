// Artwork data access, against the real API.
//
// FILE STORAGE: durable now. createArtwork() saves the row, then the caller
// (labelIntakeService.submitLabelIntake) calls uploadArtworkFile() below to
// send the actual bytes to POST /api/artworks/:id/file, which writes them to
// disk server-side and records a storage_key — see backend's
// artworkFileStorage.service.ts. An artwork read back from the API from then
// on has a real `filePath`: an absolute URL the browser can fetch from any
// tab, any session, computed by the backend from that storage_key.
//
// sessionFiles below is kept as a same-tab fallback, not the primary
// mechanism it used to be: it only overlays a blob: URL when the server's own
// `filePath` is still empty (upload not yet attempted, or failed and the
// caller chose to continue anyway), so a preview keeps working in this tab
// for that one gap. It was never shared across tabs/sessions and still isn't.
//
// THE SERVER ISSUES THE VERSION NUMBER, under a lock (see the artwork
// repository's nextVersionNumber). suggestNextArtworkVersion below still
// exists, but it is now only what the upload form SHOWS before saving; two
// people uploading at once are no longer both told they are V5.

import { apiRequest, findOne } from './apiClient';
import { API_BASE_URL } from './apiConfig';
import { Artwork, ArtworkInput, ArtworkStatus, ArtworkType } from '../types/artwork';
import { RoleId } from '../auth/permissions';

// artworkId -> object URL for files picked in THIS tab. Not persisted, not
// shared, and cleared when the tab closes, which is exactly the lifetime of the
// URLs it holds.
const sessionFiles = new Map<string, string>();

/** Overlays this session's object URL onto a row whose stored file is absent. */
function withSessionFile(artwork: Artwork): Artwork {
  const sessionUrl = sessionFiles.get(artwork.id);
  return sessionUrl && !artwork.filePath ? { ...artwork, filePath: sessionUrl } : artwork;
}

function withSessionFiles(artworks: Artwork[]): Artwork[] {
  return sessionFiles.size === 0 ? artworks : artworks.map(withSessionFile);
}

export async function getArtworks(): Promise<Artwork[]> {
  return withSessionFiles(await apiRequest<Artwork[]>('/artworks'));
}

export async function getArtworkById(id: string): Promise<Artwork | undefined> {
  const artwork = await findOne(apiRequest<Artwork>(`/artworks/${encodeURIComponent(id)}`));
  return artwork ? withSessionFile(artwork) : undefined;
}

export async function getArtworksByProduct(productId: string): Promise<Artwork[]> {
  // Served by the product's own route rather than by filtering the full list
  // client-side — the table that owns these rows can answer it directly.
  return withSessionFiles(await apiRequest<Artwork[]>(`/products/${encodeURIComponent(productId)}/artworks`));
}

/**
 * The approved baseline a new label is compared against: the highest-versioned
 * Approved (or Final Approved) artwork for this Product + Marketing Company,
 * optionally narrowed to one Artwork Type.
 *
 * Both statuses qualify. 'Approved' is the pre-workflow legacy terminal status
 * still carried by existing artworks; 'Final Approved' is what the
 * Manager-approval stage produces. Either is a valid comparison reference, and
 * that rule now lives in the query rather than in a client-side sort.
 *
 * Undefined when there is none — a product's first-ever label has nothing to
 * compare against, which is a normal state the workflow reports rather than an
 * error.
 */
export async function getLatestApprovedArtwork(
  productId: string,
  marketingCompany: string,
  artworkType?: ArtworkType
): Promise<Artwork | undefined> {
  const baseline = await apiRequest<Artwork | null>('/artworks/latest-approved', {
    query: { productId, marketingCompany, artworkType }
  });
  return baseline ? withSessionFile(baseline) : undefined;
}

/**
 * For Quick Label Comparison, where the uploaded file is not yet a saved
 * Artwork record and so has no type of its own to match.
 *
 * BEHAVIOUR CHANGE, deliberate: the localStorage version considered artworks of
 * every type and could return a Front Artwork crop as the baseline for a full
 * label. The server keeps each artwork type its own version line and defaults
 * to 'Full Label' when no type is given, which is the right answer — comparing
 * a full label against a front-panel crop reports differences that are just the
 * crop. A product whose only approved artwork is a Front Artwork now correctly
 * reports no baseline.
 */
export function getLatestApprovedArtworkForProduct(productId: string, marketingCompany: string): Promise<Artwork | undefined> {
  return getLatestApprovedArtwork(productId, marketingCompany);
}

// ---------------------------------------------------------------------------
// Writes
//
// No `actor` argument: the server records who uploaded or changed an artwork
// from the session. An artwork's content is immutable once uploaded — a
// corrected label is a new version, not an edit — so the only write besides
// creation is a status transition, which is why there is no general update
// here any more.
// ---------------------------------------------------------------------------

/** What the caller supplies; the server issues id, version and audit fields. */
export type ArtworkCreateInput = Omit<ArtworkInput, 'version'>;

export async function createArtwork(input: ArtworkCreateInput): Promise<Artwork> {
  // input.filePath is this tab's blob: URL (if any) and is meaningful only to
  // sessionFiles below — it must never reach the server as the row's
  // filePath. It used to: the backend stored whatever non-empty string it was
  // given straight into storage_key, so every upload's dead-on-arrival blob:
  // URL (useless outside the tab that created it) got recorded as if it were
  // a durably stored file. That was invisible before uploadArtworkFile()
  // existed — a blob: URL and an empty string both render as "preview not
  // available" once the tab closes — but now storage_key's presence is what
  // POST /:id/file checks to refuse overwriting an existing file, and a blob:
  // URL there made every real upload attempt fail with a false "already has a
  // stored file" conflict.
  const { filePath, ...rest } = input;
  const created = await apiRequest<Artwork>('/artworks', { method: 'POST', body: { ...rest, filePath: '' } });

  // Remember this tab's object URL against the id the server just issued, so
  // the artwork stays previewable for the rest of the session — overwritten by
  // withSessionFile once uploadArtworkFile() below gives the row a real
  // filePath, since that check prefers the server's own value.
  if (filePath?.startsWith('blob:')) sessionFiles.set(created.id, filePath);

  return withSessionFile(created);
}

/** Thrown only for transport/server-side upload failures, never for a slow network by itself. */
export class ArtworkFileUploadError extends Error {}

/**
 * Sends the real file bytes for an already-created artwork row to the
 * backend, which durably stores them and returns the row with its now-real
 * `filePath`.
 *
 * A raw `fetch`/`FormData` call rather than apiRequest(), which always
 * JSON-encodes its body — same reason labelExtractionService.ts's
 * extractLabel() does its own fetch. `credentials: 'include'` for the same
 * cookie-session reason apiClient.ts's own comment explains.
 */
export async function uploadArtworkFile(artworkId: string, file: File): Promise<Artwork> {
  const formData = new FormData();
  formData.append('file', file);

  const uploadUrl = `${API_BASE_URL}/api/artworks/${encodeURIComponent(artworkId)}/file`;

  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: 'POST', body: formData, credentials: 'include' });
  } catch (err) {
    console.error(`[artworkService] Request to ${uploadUrl} failed:`, err);
    throw new ArtworkFileUploadError('Could not reach the server to store the uploaded file. Please try again.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ArtworkFileUploadError('The server returned an unexpected response while storing the uploaded file.');
  }

  const parsed = body as { success?: boolean; message?: string; data?: Artwork } | null;
  if (!response.ok || !parsed?.success || !parsed.data) {
    throw new ArtworkFileUploadError(parsed?.message || 'Could not store the uploaded file.');
  }

  return withSessionFile(parsed.data);
}

export async function updateArtworkStatus(id: string, status: ArtworkStatus, remarks?: string): Promise<Artwork | undefined> {
  const updated = await findOne(
    apiRequest<Artwork>(`/artworks/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: { status, remarks }
    })
  );
  return updated ? withSessionFile(updated) : undefined;
}

/**
 * Artwork is never physically removed — archiving flips status to Archived so
 * it stays in version history but is excluded from active workflows and from
 * the approved-baseline lookup.
 */
export function archiveArtwork(id: string): Promise<Artwork | undefined> {
  return updateArtworkStatus(id, 'Archived');
}

/**
 * Marks an artwork sent onward — status only, no comparison logic.
 *
 * The role check stays on the client as a courtesy that fails fast; the server
 * enforces the same rule from the session (see the stage-role rule in the API's
 * auth middleware), which is what actually decides it.
 */
export function sendArtworkForComparison(id: string, actor: { id: string; name: string; role: RoleId }): Promise<Artwork | undefined> {
  if (actor.role !== 'account_manager' && actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to submit artwork for comparison.`);
  }
  return updateArtworkStatus(id, 'Pending Comparison');
}

// ---------------------------------------------------------------------------
// Selectors over an already-loaded list
//
// Questions about rows a screen is already showing, answered without another
// request. The version suggestion and the duplicate check both run while
// somebody types in the upload form.
// ---------------------------------------------------------------------------

/** Exported for Reports' Artwork History report, which flags each latest version. */
export function parseVersionNumber(version: string): number {
  const match = /(\d+)/.exec(version);
  return match ? Number(match[1]) : 0;
}

export function selectArtworksByCompany(artworks: Artwork[], marketingCompany: string): Artwork[] {
  return artworks.filter((artwork) => artwork.marketingCompany === marketingCompany);
}

/**
 * What the upload form shows as the next version: 'V1' if none exist, otherwise
 * one past the highest for this Product + Marketing Company + Artwork Type.
 *
 * A SUGGESTION, and now only that. The server issues the real version number
 * when the artwork is created, under a lock, so this being stale means the
 * saved artwork gets a different number than the form displayed — not that two
 * artworks collide.
 */
export function suggestNextArtworkVersion(
  artworks: Artwork[],
  productId: string,
  marketingCompany: string,
  artworkType: ArtworkType
): string {
  const matches = artworks.filter(
    (artwork) => artwork.productId === productId && artwork.marketingCompany === marketingCompany && artwork.artworkType === artworkType
  );
  if (matches.length === 0) return 'V1';
  return `V${Math.max(...matches.map((artwork) => parseVersionNumber(artwork.version))) + 1}`;
}

/** Same Product + Marketing Company + Version + Artwork Type already uploaded. */
export function findDuplicateArtworkVersion(
  artworks: Artwork[],
  productId: string,
  marketingCompany: string,
  version: string,
  artworkType: ArtworkType,
  excludeId?: string
): Artwork | undefined {
  const norm = (value: string) => value.trim().toLowerCase();
  return artworks.find(
    (artwork) =>
      artwork.id !== excludeId &&
      artwork.productId === productId &&
      norm(artwork.marketingCompany) === norm(marketingCompany) &&
      norm(artwork.version) === norm(version) &&
      artwork.artworkType === artworkType
  );
}

/**
 * The Final Approved repository — set exclusively by the Manager-approval stage
 * (see comparisonService's submitManagerDecision). Newest first by last status
 * change.
 */
export function selectFinalApprovedArtworks(artworks: Artwork[]): Artwork[] {
  return artworks
    .filter((artwork) => artwork.status === 'Final Approved')
    .sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime());
}
