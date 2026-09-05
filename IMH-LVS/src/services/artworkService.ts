// Artwork data access layer — same localStorage-backed pattern as
// productService.ts / masterService.ts, so it can later be swapped for a
// real API + cloud file storage without rewriting ArtworkPage.
//
// File storage note: there is no backend/cloud storage in this prototype.
// The actual file bytes are never written to localStorage (a handful of
// PDFs would blow the ~5-10MB browser quota almost immediately). Instead,
// the UI creates a browser object URL (URL.createObjectURL) for whatever
// file the user picks and stores that URL string as `filePath` alongside
// the persisted metadata (name/type/size). Object URLs only live for the
// current browser session — after a reload, only the metadata survives,
// and the UI falls back to a "preview not available" state. Swapping in
// real cloud storage later just means `filePath` becomes a persistent
// URL instead of a session-scoped one; nothing else about this file changes.

import { Artwork, ArtworkInput, ArtworkStatus, ArtworkType } from '../types/artwork';
import { SEED_ARTWORKS } from '../data/artworks';
import { RoleId } from '../auth/permissions';

const STORAGE_KEY = 'imh_lvs_artworks';

function readAll(): Artwork[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_ARTWORKS));
    return SEED_ARTWORKS;
  }
  try {
    return JSON.parse(raw) as Artwork[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_ARTWORKS));
    return SEED_ARTWORKS;
  }
}

function writeAll(artworks: Artwork[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(artworks));
}

function nextArtworkId(existing: Artwork[]): string {
  const maxSeq = existing.reduce((max, artwork) => {
    const match = /^ART-(\d+)$/.exec(artwork.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `ART-${String(maxSeq + 1).padStart(4, '0')}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getArtworks(): Artwork[] {
  return readAll();
}

export function getArtworkById(id: string): Artwork | undefined {
  return readAll().find((artwork) => artwork.id === id);
}

export function getArtworksByProduct(productId: string): Artwork[] {
  return readAll().filter((artwork) => artwork.productId === productId);
}

export function getArtworksByCompany(marketingCompany: string): Artwork[] {
  return readAll().filter((artwork) => artwork.marketingCompany === marketingCompany);
}

// Highest-versioned Approved (or Final Approved), non-archived artwork for
// this exact Product + Marketing Company + Artwork Type combination. Feeds
// the Comparison engine's "compare against latest approved" step. Both
// statuses qualify: 'Approved' is the pre-workflow legacy terminal status
// still carried by existing seed artworks, 'Final Approved' is what the
// Manager-approval stage now produces — either is a valid comparison
// reference.
export function getLatestApprovedArtwork(productId: string, marketingCompany: string, artworkType: ArtworkType): Artwork | undefined {
  const candidates = readAll().filter(
    (artwork) =>
      artwork.productId === productId &&
      artwork.marketingCompany === marketingCompany &&
      artwork.artworkType === artworkType &&
      (artwork.status === 'Approved' || artwork.status === 'Final Approved')
  );
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => parseVersionNumber(b.version) - parseVersionNumber(a.version))[0];
}

// Same "highest-versioned Approved/Final Approved wins" rule as
// getLatestApprovedArtwork above, without the Artwork Type filter — used by
// Quick Label Comparison, where the uploaded artwork hasn't been assigned
// an Artwork Type (it's a raw file, not yet a saved Artwork record) so
// there's nothing to filter that dimension by. Never guesses across
// products or companies — productId and marketingCompany still must match
// exactly, only Artwork Type is left open.
export function getLatestApprovedArtworkForProduct(productId: string, marketingCompany: string): Artwork | undefined {
  const candidates = readAll().filter(
    (artwork) =>
      artwork.productId === productId &&
      artwork.marketingCompany === marketingCompany &&
      (artwork.status === 'Approved' || artwork.status === 'Final Approved')
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
// existing version number. Exported so both ArtworkPage and
// labelIntakeService (the label-upload product/artwork creation pipeline)
// compute versions the same way.
export function suggestNextArtworkVersion(productId: string, marketingCompany: string, artworkType: ArtworkType): string {
  const matches = readAll().filter(
    (artwork) => artwork.productId === productId && artwork.marketingCompany === marketingCompany && artwork.artworkType === artworkType
  );
  if (matches.length === 0) return 'V1';
  const maxVersion = Math.max(...matches.map((artwork) => parseVersionNumber(artwork.version)));
  return `V${maxVersion + 1}`;
}

// Duplicate check ahead of creating a new artwork: same Product + Marketing
// Company + Version + Artwork Type must not already exist.
export function findDuplicateArtworkVersion(
  productId: string,
  marketingCompany: string,
  version: string,
  artworkType: ArtworkType,
  excludeId?: string
): Artwork | undefined {
  const norm = (value: string) => value.trim().toLowerCase();
  return readAll().find(
    (artwork) =>
      artwork.id !== excludeId &&
      artwork.productId === productId &&
      norm(artwork.marketingCompany) === norm(marketingCompany) &&
      norm(artwork.version) === norm(version) &&
      artwork.artworkType === artworkType
  );
}

export function createArtwork(input: ArtworkInput, actor: string): Artwork {
  const artworks = readAll();
  const now = today();
  const newArtwork: Artwork = {
    ...input,
    id: nextArtworkId(artworks),
    uploadedBy: actor,
    uploadDate: now,
    updatedBy: actor,
    updatedDate: now
  };
  writeAll([...artworks, newArtwork]);
  return newArtwork;
}

export function updateArtwork(id: string, input: Partial<Omit<ArtworkInput, 'productId'>>, actor: string): Artwork | undefined {
  const artworks = readAll();
  const index = artworks.findIndex((artwork) => artwork.id === id);
  if (index === -1) return undefined;
  const updated: Artwork = { ...artworks[index], ...input, updatedDate: today(), updatedBy: actor };
  artworks[index] = updated;
  writeAll(artworks);
  return updated;
}

// Artwork is never physically removed — archiving flips status to Archived
// so it stays in version history but is excluded from active workflows and
// from getLatestApprovedArtwork.
export function archiveArtwork(id: string, actor: string): Artwork | undefined {
  return updateArtwork(id, { status: 'Archived' as ArtworkStatus }, actor);
}

// Marks an artwork sent onward — status only, no actual comparison logic.
// This is Account Manager's own action (initiating the workflow), not a
// stage reviewer's — independently validated here rather than trusting that
// the UI already hid the button (see permissions.ts's INITIATE action).
export function sendArtworkForComparison(id: string, actor: { id: string; name: string; role: RoleId }): Artwork | undefined {
  if (actor.role !== 'account_manager' && actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to submit artwork for comparison.`);
  }
  return updateArtwork(id, { status: 'Pending Comparison' as ArtworkStatus }, actor.name);
}

// The only artworks eligible for a future Final Approved Label Repository —
// set exclusively by the Manager-approval stage (see comparisonService's
// submitManagerDecision). Newest first by their last status change.
export function getFinalApprovedArtworks(): Artwork[] {
  return readAll()
    .filter((artwork) => artwork.status === 'Final Approved')
    .sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime());
}
