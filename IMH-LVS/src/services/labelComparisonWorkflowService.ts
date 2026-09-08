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
import { compareExtractedLabels, compareVisual, compareVisualBatch, LabelComparisonError } from './labelComparisonService';
import { getArtworkById, getArtworksByProduct, getLatestApprovedArtworkForProduct, parseVersionNumber } from './artworkService';
import { getCrossCompanyCandidates } from './comparisonService';
import { getProductById, getProducts } from './productService';
import { saveLabelComparisonRun } from './labelComparisonHistoryService';
import type { Product } from '../types/product';
import type { Artwork } from '../types/artwork';
import type { BestCrossCompanyMatch, CrossCompanyResultEntry, LabelComparisonRun } from '../types/labelComparisonRecord';
import type { CrossCompanyCandidate } from '../types/comparison';
import type { VisualComparisonResult } from '../types/labelComparison';

export { LabelExtractionError, LabelComparisonError };

// ---------------------------------------------------------------------
// Label selection
// ---------------------------------------------------------------------

export async function getSelectableLabels(): Promise<Product[]> {
  return (await getProducts()).filter((product) => product.status !== 'Inactive');
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

export async function identifyComparisonPlan(productId: string): Promise<ComparisonPlan | undefined> {
  const product = await getProductById(productId);
  if (!product) return undefined;

  const artworks = (await getArtworksByProduct(productId)).filter((artwork) => artwork.status !== 'Archived');
  if (artworks.length === 0) {
    return { status: 'no_artwork', product };
  }

  const candidateArtwork = artworks.sort((a, b) => parseVersionNumber(b.version) - parseVersionNumber(a.version))[0];
  const approvedArtwork = await getLatestApprovedArtworkForProduct(productId, product.marketingCompany);

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

// Logo / Design-Layout (AI module brief §7/§9) — needs the actual image
// bytes of both artworks, which the text-comparison path above never
// touches. Deliberately never throws and never blocks the base comparison:
// a vision-model-style capability being unreachable must cost this one row,
// not the whole run — same principle as aiExtraction.service.ts's fallback.
async function tryCompareVisual(fileA: File | undefined, fileB: File | undefined): Promise<VisualComparisonResult | undefined> {
  if (!fileA || !fileB) return undefined;
  try {
    return await compareVisual(fileA, fileB);
  } catch (error) {
    console.warn('[labelComparisonWorkflowService] Visual comparison did not complete — omitting the Logo/Design row.', error);
    return undefined;
  }
}

// Text comparison only — deliberately does NOT also call compareVisual per
// candidate. With several cross-company candidates, that would re-upload
// and re-hash the identical subject artwork once per candidate; the visual
// side is batched once for the whole list afterwards, see
// attachVisualComparisons below.
async function resolveCandidateText(
  subjectExtraction: LabelExtractionApiResult,
  candidate: CrossCompanyCandidate
): Promise<{ entry: CrossCompanyResultEntry; candidateFile: File | undefined }> {
  const base = {
    candidateProductId: candidate.productId,
    candidateProductName: candidate.productName,
    candidateMarketingCompany: candidate.marketingCompany,
    candidateArtworkId: candidate.artworkId,
    candidateArtworkVersion: candidate.artworkVersion
  };
  const candidateArtwork = await getArtworkById(candidate.artworkId);
  // Also the honest answer when the artwork exists but its file does not: the
  // rows are shared now, the bytes are not, so a candidate uploaded in somebody
  // else's session has no file this browser can read.
  if (!candidateArtwork) return { entry: { ...base, outcome: { status: 'file_unavailable' } }, candidateFile: undefined };
  const candidateFile = await fetchArtworkFile(candidateArtwork);
  if (!candidateFile) return { entry: { ...base, outcome: { status: 'file_unavailable' } }, candidateFile: undefined };
  const candidateExtraction = await extractLabel(candidateFile);
  const result = await compareExtractedLabels(subjectExtraction, candidateExtraction, 'cross_company');
  return { entry: { ...base, outcome: { status: 'success', result } }, candidateFile };
}

// Attaches Artwork Similarity to every successfully-text-compared
// candidate in ONE batched request (see compareVisualBatch's own comment
// on why) rather than one request per candidate. Never throws and never
// drops an entry: a batch failure, or the subject/every candidate having
// no retrievable file, just leaves visualComparison unset on each entry —
// the same outcome a single failed comparison already produces via
// tryCompareVisual elsewhere in this module.
async function attachVisualComparisons(
  subjectFile: File | undefined,
  resolved: { entry: CrossCompanyResultEntry; candidateFile: File | undefined }[]
): Promise<CrossCompanyResultEntry[]> {
  const withFile = resolved.filter(
    (item): item is { entry: CrossCompanyResultEntry; candidateFile: File } => !!item.candidateFile
  );
  if (!subjectFile || withFile.length === 0) return resolved.map((item) => item.entry);

  let visualResults: VisualComparisonResult[];
  try {
    visualResults = await compareVisualBatch(subjectFile, withFile.map((item) => item.candidateFile));
  } catch (error) {
    console.warn('[labelComparisonWorkflowService] Batch visual comparison did not complete — omitting Artwork Similarity for this run.', error);
    return resolved.map((item) => item.entry);
  }

  const visualByArtworkId = new Map(withFile.map((item, index) => [item.entry.candidateArtworkId, visualResults[index]]));
  return resolved.map(({ entry }) => {
    if (entry.outcome.status !== 'success') return entry;
    return { ...entry, outcome: { ...entry.outcome, visualComparison: visualByArtworkId.get(entry.candidateArtworkId) } };
  });
}

// AI module brief §6/§8 — the highest-similarity SUCCESSFUL cross-company
// result, or undefined when there's nothing to pick from (no candidates at
// all, or every candidate's file was unavailable) — "No Comparison
// Available" is still the honest answer for zero real comparisons, never a
// best match named among none.
export function findBestCrossCompanyMatch(results: CrossCompanyResultEntry[]): BestCrossCompanyMatch | undefined {
  let best: BestCrossCompanyMatch | undefined;
  for (const entry of results) {
    if (entry.outcome.status !== 'success') continue;
    const overallPercentage = entry.outcome.result.comparison.overallPercentage;
    if (!best || overallPercentage > best.overallPercentage) {
      best = {
        candidateProductId: entry.candidateProductId,
        candidateProductName: entry.candidateProductName,
        candidateMarketingCompany: entry.candidateMarketingCompany,
        candidateArtworkId: entry.candidateArtworkId,
        candidateArtworkVersion: entry.candidateArtworkVersion,
        overallPercentage
      };
    }
  }
  return best;
}

export type RunOutcome =
  | { status: 'file_unavailable'; artwork: Artwork } // the candidate or approved artwork itself has no retrievable file
  | { status: 'success'; run: LabelComparisonRun };

export async function runComparisonWorkflow(plan: ComparisonPlan, actor: string): Promise<RunOutcome> {
  if (plan.status === 'no_artwork') {
    throw new Error('Cannot run a comparison for a label with no artwork.');
  }

  const candidateArtwork = plan.status === 'up_to_date' ? plan.approvedArtwork : plan.candidateArtwork;
  const candidateFile = await fetchArtworkFile(candidateArtwork);
  if (!candidateFile) return { status: 'file_unavailable', artwork: candidateArtwork };
  const candidateExtraction = await extractLabel(candidateFile);

  let versionComparison: LabelComparisonRun['versionComparison'];
  if (plan.status === 'ready') {
    const approvedFile = await fetchArtworkFile(plan.approvedArtwork);
    if (!approvedFile) return { status: 'file_unavailable', artwork: plan.approvedArtwork };
    const approvedExtraction = await extractLabel(approvedFile);
    const [result, visualComparison] = await Promise.all([
      compareExtractedLabels(candidateExtraction, approvedExtraction, 'same_company'),
      tryCompareVisual(candidateFile, approvedFile)
    ]);
    versionComparison = {
      candidateArtworkId: candidateArtwork.id,
      candidateArtworkVersion: candidateArtwork.version,
      candidateArtworkFileName: candidateArtwork.fileName,
      approvedArtworkId: plan.approvedArtwork.id,
      approvedArtworkVersion: plan.approvedArtwork.version,
      approvedArtworkFileName: plan.approvedArtwork.fileName,
      approvedArtworkStatus: plan.approvedArtwork.status,
      approvedArtworkApprovedDate: plan.approvedArtwork.updatedDate,
      result,
      visualComparison
    };
  }

  const candidates = await getCrossCompanyCandidates(plan.product.id);
  const resolvedCandidates: { entry: CrossCompanyResultEntry; candidateFile: File | undefined }[] = [];
  for (const candidate of candidates) {
    resolvedCandidates.push(await resolveCandidateText(candidateExtraction, candidate));
  }
  const crossCompanyResults = await attachVisualComparisons(candidateFile, resolvedCandidates);

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
    crossCompanyResults,
    bestCrossCompanyMatch: findBestCrossCompanyMatch(crossCompanyResults)
  });

  return { status: 'success', run };
}
