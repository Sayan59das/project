// Artwork data access layer — backend-persisted metadata (see
// backend/src/repositories/artwork.repository.ts), same pattern as
// productService.ts / masterService.ts.
//
// File storage note: there is still no durable file storage behind this (see
// backend/README.md's "Cloud Storage Integration" TODO — the backend's
// storage_key column exists for it, but nothing populates it yet). The actual
// file bytes are never sent to the backend: a browser object URL
// (URL.createObjectURL) is kept in an in-memory, per-tab-session map keyed by
// artwork id, and overlaid onto `filePath` for any artwork created in this
// session. Every other artwork reports `filePath: ''` (the backend's honest
// "no durably stored file" state) and the UI already treats that as
// "preview not available". Reloading the page loses the map exactly as it
// already lost the object URL before this migration — no regression, just
// backed by real records instead of localStorage now.

import { Artwork, ArtworkInput, ArtworkStatus, ArtworkType } from '../types/artwork';
import { RoleId } from '../auth/permissions';
import apiClient, { actorHeaders } from './apiClient';

const sessionFileUrls = new Map<string, string>();

function withSessionFileUrl(artwork: Artwork): Artwork {
  const url = sessionFileUrls.get(artwork.id);
  return url ? { ...artwork, filePath: url } : artwork;
}

export async function getArtworks(): Promise<Artwork[]> {
  const { data } = await apiClient.get('/artworks');
  return (data as Artwork[]).map(withSessionFileUrl);
}

export async function getArtworkById(id: string): Promise<Artwork | undefined> {
  try {
    const { data } = await apiClient.get(`/artworks/${id}`);
    return withSessionFileUrl(data);
  } catch {
    return undefined;
  }
}

// Served from /products/:id/artworks (the table that owns them) rather than
// filtering the full artwork list client-side — see products.routes.ts.
export async function getArtworksByProduct(productId: string): Promise<Artwork[]> {
  const { data } = await apiClient.get(`/products/${productId}/artworks`);
  return (data as Artwork[]).map(withSessionFileUrl);
}

export async function getArtworksByCompany(marketingCompany: string): Promise<Artwork[]> {
  const norm = (value: string) => value.trim().toLowerCase();
  const all = await getArtworks();
  return all.filter((artwork) => norm(artwork.marketingCompany) === norm(marketingCompany));
}

// Highest-versioned Approved (or Final Approved), non-archived artwork for
// this exact Product + Marketing Company + Artwork Type combination. Feeds
// the Comparison engine's "compare against latest approved" step. Backed by
// the backend's dedicated /artworks/latest-approved query (a DISTINCT ON view
// over a partial index — see artwork.repository.ts), not a client-side scan.
export async function getLatestApprovedArtwork(
  productId: string,
  marketingCompany: string,
  artworkType: ArtworkType
): Promise<Artwork | undefined> {
  const { data } = await apiClient.get('/artworks/latest-approved', { params: { productId, marketingCompany, artworkType } });
  return data ? withSessionFileUrl(data) : undefined;
}

// Same "highest-versioned Approved/Final Approved wins" rule as
// getLatestApprovedArtwork above, without the Artwork Type filter — used by
// Quick Label Comparison, where the uploaded artwork hasn't been assigned an
// Artwork Type. The backend's /artworks/latest-approved always narrows by
// type (defaulting to 'Full Label'), so this filters the product's full
// artwork list client-side instead of calling it.
export async function getLatestApprovedArtworkForProduct(productId: string, marketingCompany: string): Promise<Artwork | undefined> {
  const candidates = (await getArtworksByProduct(productId)).filter(
    (artwork) => artwork.marketingCompany === marketingCompany && (artwork.status === 'Approved' || artwork.status === 'Final Approved')
  );
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => parseVersionNumber(b.version) - parseVersionNumber(a.version))[0];
}

// Exported for Reports' Artwork History report, which needs the same
// "highest version wins" comparison to flag each artwork's latest version.
export function parseVersionNumber(version: string): number {
  const match = /(\d+)/.exec(version);
  return match ? Number(match[1]) : 0;
}

// Next version label for a Product + Marketing Company + Artwork Type
// combination — 'V1' if none exist yet, otherwise one past the highest
// existing version number. Purely advisory display: the backend always
// assigns the actual version number itself under a lock (see
// artwork.repository.ts's nextVersionNumber), so two concurrent uploads can
// never race onto the same one — whatever this suggests is what createArtwork
// will show in the form, not necessarily what gets persisted.
export async function suggestNextArtworkVersion(productId: string, marketingCompany: string, artworkType: ArtworkType): Promise<string> {
  const matches = (await getArtworksByProduct(productId)).filter(
    (artwork) => artwork.marketingCompany === marketingCompany && artwork.artworkType === artworkType
  );
  if (matches.length === 0) return 'V1';
  const maxVersion = Math.max(...matches.map((artwork) => parseVersionNumber(artwork.version)));
  return `V${maxVersion + 1}`;
}

// Duplicate check ahead of creating a new artwork: same Product + Marketing
// Company + Version + Artwork Type must not already exist. Informational only
// now that the backend assigns versions itself (see suggestNextArtworkVersion)
// — a real collision can no longer happen, but this still warns if the
// suggested version was manually edited to match an existing one.
export async function findDuplicateArtworkVersion(
  productId: string,
  marketingCompany: string,
  version: string,
  artworkType: ArtworkType,
  excludeId?: string
): Promise<Artwork | undefined> {
  const norm = (value: string) => value.trim().toLowerCase();
  const artworks = await getArtworksByProduct(productId);
  return artworks.find(
    (artwork) =>
      artwork.id !== excludeId &&
      norm(artwork.marketingCompany) === norm(marketingCompany) &&
      norm(artwork.version) === norm(version) &&
      artwork.artworkType === artworkType
  );
}

// id, version and every audit field (uploadedBy/uploadDate/updatedBy/updatedDate)
// are assigned by the backend, not the client — see
// backend/src/repositories/artwork.repository.ts's ArtworkCreateInput, which
// deliberately omits them. filePath never reaches the backend — see the
// file-storage note at the top of this file.
export async function createArtwork(input: ArtworkInput, actor: string): Promise<Artwork> {
  const { data } = await apiClient.post('/artworks', { ...input, filePath: '' }, { headers: actorHeaders(actor) });
  if (input.filePath) sessionFileUrls.set(data.id, input.filePath);
  return withSessionFileUrl(data);
}

// Artwork content is immutable once uploaded — a corrected label is a new
// version, not an edit (see artworks.routes.ts) — so status and remarks are
// the only fields the backend will actually change here.
export async function updateArtwork(id: string, input: Partial<Omit<ArtworkInput, 'productId'>>, actor: string): Promise<Artwork | undefined> {
  try {
    const { data } = await apiClient.patch(`/artworks/${id}/status`, { status: input.status, remarks: input.remarks }, { headers: actorHeaders(actor) });
    return withSessionFileUrl(data);
  } catch {
    return undefined;
  }
}

// Artwork is never physically removed — archiving flips status to Archived
// so it stays in version history but is excluded from active workflows and
// from getLatestApprovedArtwork.
export async function archiveArtwork(id: string, actor: string): Promise<Artwork | undefined> {
  return updateArtwork(id, { status: 'Archived' as ArtworkStatus }, actor);
}

// Marks an artwork sent onward — status only, no actual comparison logic.
// This is Account Manager's own action (initiating the workflow), not a
// stage reviewer's — independently validated here rather than trusting that
// the UI already hid the button (see permissions.ts's INITIATE action).
export async function sendArtworkForComparison(id: string, actor: { id: string; name: string; role: RoleId }): Promise<Artwork | undefined> {
  if (actor.role !== 'account_manager' && actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to submit artwork for comparison.`);
  }
  return updateArtwork(id, { status: 'Pending Comparison' as ArtworkStatus }, actor.name);
}

// The only artworks eligible for a future Final Approved Label Repository —
// set exclusively by the Manager-approval stage (see comparisonService's
// submitManagerDecision). Newest first by their last status change.
export async function getFinalApprovedArtworks(): Promise<Artwork[]> {
  const all = await getArtworks();
  return all
    .filter((artwork) => artwork.status === 'Final Approved')
    .sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime());
}
