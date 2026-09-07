// Artwork data access, against the real API.
//
// FILE STORAGE IS STILL NOT SOLVED, and this file is honest about it. The rows
// live in Postgres now — id, version, status, remarks, who uploaded it — but
// the bytes do not: the backend has a storage_key column and no object store
// behind it, so an artwork read back from the API has `filePath: ''`, which the
// preview components already render as "preview not available".
//
// What is preserved is the behaviour people rely on TODAY: a file picked in
// this tab stays viewable in this tab. The upload creates a browser object URL,
// and sessionFiles below remembers it for the artwork id the server issues, so
// previews and the comparison workflow keep working for the upload you just
// did. That URL dies with the tab, and nothing pretends otherwise — it is
// deliberately not persisted anywhere, because a stored object URL is a string
// that looks like a file and is not one.
//
// THE SERVER ISSUES THE VERSION NUMBER, under a lock (see the artwork
// repository's nextVersionNumber). suggestNextArtworkVersion below still
// exists, but it is now only what the upload form SHOWS before saving; two
// people uploading at once are no longer both told they are V5.

import { apiRequest, findOne } from './apiClient';
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
  const created = await apiRequest<Artwork>('/artworks', { method: 'POST', body: input });

  // Remember this tab's object URL against the id the server just issued, so
  // the artwork stays previewable for the rest of the session.
  if (input.filePath?.startsWith('blob:')) sessionFiles.set(created.id, input.filePath);

  return withSessionFile(created);
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
