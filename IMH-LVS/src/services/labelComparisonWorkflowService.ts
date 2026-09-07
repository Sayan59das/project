// Orchestrates the Label Comparison workflow:
//
//   Select an existing label (Product) -> does it have an Approved/Final
//   Approved artwork? -> YES: Version Comparison (its own highest-versioned
//   artwork vs. that latest approved one) / NO: skip, note why -> always
//   run Cross-Company Comparison (this label vs. every other marketing
//   company's approved artwork for the same product name) -> one combined
//   result.
//
// There is no file upload anywhere in this workflow — every artwork
// compared is an EXISTING Artwork Management record the user already has
// (selected by product, never by hand-picking a version or company). This
// deliberately reuses existing app logic rather than reinventing any of it:
//   - getArtworksByProduct / getLatestApprovedArtworkForProduct /
//     parseVersionNumber (artworkService.ts) resolve which two artworks to
//     compare, and comparisonService.getCrossCompanyCandidates resolves
//     which other companies' labels are relevant.
//   - Extraction reuses labelExtractionService.extractLabel (the same OCR
//     endpoint used everywhere else) exactly once per file.
//   - The actual field-by-field comparison reuses
//     labelComparisonService.compareExtractedLabels — no comparison logic
//     is duplicated on the client.
//
// A run (version comparison, if applicable, plus every cross-company
// result) is persisted as ONE LabelComparisonRun via
// labelComparisonHistoryService — that's what feeds the Label Comparison
// page's history table and its Detail page.
//
// Honesty note: Artwork records are frontend-only (localStorage). Seed/demo
// Artwork records have no real file behind them (see artworkService.ts's
// file-storage-limitation comment) — filePath is only a usable browser
// object URL for artwork uploaded earlier in THIS session. When an artwork
// needed for comparison has no retrievable file, this module reports that
// plainly rather than faking a comparison.
import { extractLabel, LabelExtractionError, type LabelExtractionApiResult } from './labelExtractionService';
import { compareExtractedLabels, LabelComparisonError } from './labelComparisonService';
import { getArtworkById, getArtworksByProduct, getLatestApprovedArtworkForProduct, parseVersionNumber } from './artworkService';
import { getCrossCompanyCandidates } from './comparisonService';
import { getProductById, getProducts } from './productService';
import { saveLabelComparisonRun } from './labelComparisonHistoryService';
import type { Product } from '../types/product';
import type { Artwork } from '../types/artwork';
import type { CrossCompanyResultEntry, LabelComparisonRun } from '../types/labelComparisonRecord';
import type { CrossCompanyCandidate } from '../types/comparison';

export { LabelExtractionError, LabelComparisonError };

// ---------------------------------------------------------------------
// Label selection
// ---------------------------------------------------------------------

export function getSelectableLabels(): Product[] {
  return getProducts().filter((product) => product.status !== 'Inactive');
}

export function formatLabelName(product: Product): string {
  return `${product.brandName} ${product.productName}`.trim();
}

// ---------------------------------------------------------------------
// Step 1 — identify the comparison plan for a selected label.
// ---------------------------------------------------------------------

export type ComparisonPlan =
  // This label has no artwork at all yet — nothing exists to compare.
  | { status: 'no_artwork'; product: Product }
  // The label's own highest-versioned artwork IS already the approved
  // one — there is no newer/pending version to check.
  | { status: 'up_to_date'; product: Product; approvedArtwork: Artwork }
  // No Approved/Final Approved artwork exists yet for this label —
  // version comparison will be skipped; cross-company still runs.
  | { status: 'no_approved_baseline'; product: Product; candidateArtwork: Artwork }
  // A newer candidate artwork and an approved baseline both exist.
  | { status: 'ready'; product: Product; candidateArtwork: Artwork; approvedArtwork: Artwork };

export function identifyComparisonPlan(productId: string): ComparisonPlan | undefined {
  const product = getProductById(productId);
  if (!product) return undefined;

  const artworks = getArtworksByProduct(productId).filter((artwork) => artwork.status !== 'Archived');
  if (artworks.length === 0) {
    return { status: 'no_artwork', product };
  }

  const candidateArtwork = artworks.sort((a, b) => parseVersionNumber(b.version) - parseVersionNumber(a.version))[0];
  const approvedArtwork = getLatestApprovedArtworkForProduct(productId, product.marketingCompany);

  if (!approvedArtwork) {
    return { status: 'no_approved_baseline', product, candidateArtwork };
  }
  if (candidateArtwork.id === approvedArtwork.id) {
    return { status: 'up_to_date', product, approvedArtwork };
  }
  return { status: 'ready', product, candidateArtwork, approvedArtwork };
}

// ---------------------------------------------------------------------
// Step 2 — run the full workflow: version comparison (if applicable),
// then cross-company comparison against every relevant candidate.
// ---------------------------------------------------------------------

// Resolves an Artwork's stored filePath to a real File the browser can
// still read. Returns undefined (never throws) for a blank filePath or one
// that can no longer be fetched — both are the same honest outcome from the
// caller's point of view: "there is no retrievable file for this artwork."
async function fetchArtworkFile(artwork: Artwork): Promise<File | undefined> {
  if (!artwork.filePath.trim()) return undefined;
  try {
    const response = await fetch(artwork.filePath);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return new File([blob], artwork.fileName || artwork.id, { type: artwork.fileType || blob.type });
  } catch {
    return undefined;
  }
}

async function extractArtwork(artwork: Artwork): Promise<LabelExtractionApiResult | undefined> {
  const file = await fetchArtworkFile(artwork);
  if (!file) return undefined;
  return extractLabel(file);
}

async function compareCandidate(subjectExtraction: LabelExtractionApiResult, candidate: CrossCompanyCandidate): Promise<CrossCompanyResultEntry> {
  const base = {
    candidateProductId: candidate.productId,
    candidateProductName: candidate.productName,
    candidateMarketingCompany: candidate.marketingCompany,
    candidateArtworkId: candidate.artworkId,
    candidateArtworkVersion: candidate.artworkVersion
  };
  const candidateArtwork = getArtworkById(candidate.artworkId);
  if (!candidateArtwork) return { ...base, outcome: { status: 'file_unavailable' } };
  const candidateExtraction = await extractArtwork(candidateArtwork);
  if (!candidateExtraction) return { ...base, outcome: { status: 'file_unavailable' } };
  const result = await compareExtractedLabels(subjectExtraction, candidateExtraction, 'cross_company');
  return { ...base, outcome: { status: 'success', result } };
}

export type RunOutcome =
  | { status: 'file_unavailable'; artwork: Artwork } // the candidate or approved artwork itself has no retrievable file
  | { status: 'success'; run: LabelComparisonRun };

export async function runComparisonWorkflow(plan: ComparisonPlan, actor: string): Promise<RunOutcome> {
  if (plan.status === 'no_artwork') {
    throw new Error('Cannot run a comparison for a label with no artwork.');
  }

  const candidateArtwork = plan.status === 'up_to_date' ? plan.approvedArtwork : plan.candidateArtwork;
  const candidateExtraction = await extractArtwork(candidateArtwork);
  if (!candidateExtraction) return { status: 'file_unavailable', artwork: candidateArtwork };

  let versionComparison: LabelComparisonRun['versionComparison'];
  if (plan.status === 'ready') {
    const approvedExtraction = await extractArtwork(plan.approvedArtwork);
    if (!approvedExtraction) return { status: 'file_unavailable', artwork: plan.approvedArtwork };
    const result = await compareExtractedLabels(candidateExtraction, approvedExtraction, 'same_company');
    versionComparison = {
      candidateArtworkId: candidateArtwork.id,
      candidateArtworkVersion: candidateArtwork.version,
      candidateArtworkFileName: candidateArtwork.fileName,
      approvedArtworkId: plan.approvedArtwork.id,
      approvedArtworkVersion: plan.approvedArtwork.version,
      approvedArtworkFileName: plan.approvedArtwork.fileName,
      approvedArtworkStatus: plan.approvedArtwork.status,
      approvedArtworkApprovedDate: plan.approvedArtwork.updatedDate,
      result
    };
  }

  const candidates = getCrossCompanyCandidates(plan.product.id);
  const crossCompanyResults: CrossCompanyResultEntry[] = [];
  for (const candidate of candidates) {
    crossCompanyResults.push(await compareCandidate(candidateExtraction, candidate));
  }

  const run = saveLabelComparisonRun({
    productId: plan.product.id,
    productName: plan.product.productName,
    brandName: plan.product.brandName,
    marketingCompany: plan.product.marketingCompany,
    comparedBy: actor,
    comparisonDate: new Date().toISOString(),
    candidateArtworkId: candidateArtwork.id,
    candidateArtworkVersion: candidateArtwork.version,
    candidateArtworkFileName: candidateArtwork.fileName,
    versionComparison,
    crossCompanyResults
  });

  return { status: 'success', run };
}
