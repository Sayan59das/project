import { extractLabel, LabelExtractionError, type LabelExtractionApiResult } from './labelExtractionService';
import { compareExtractedLabels, LabelComparisonError } from './labelComparisonService';
import { getArtworkById, getArtworksByProduct, getLatestApprovedArtworkForProduct, parseVersionNumber } from './artworkService';
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

export async function getSelectableLabels(): Promise<Product[]> {
  const products = await getProducts();
  return products.filter((product) => product.status !== 'Inactive');
}

export function formatLabelName(product: Product): string {
  return `${product.brandName} ${product.productName}`.trim();
}

// ---------------------------------------------------------------------
// Step 1 — identify the comparison plan for a selected label.
// ---------------------------------------------------------------------

export type ComparisonPlan =
  | { status: 'no_artwork'; product: Product }
  | { status: 'up_to_date'; product: Product; approvedArtwork: Artwork }
  | { status: 'no_approved_baseline'; product: Product; candidateArtwork: Artwork }
  | { status: 'ready'; product: Product; candidateArtwork: Artwork; approvedArtwork: Artwork };

export async function identifyComparisonPlan(productId: string): Promise<ComparisonPlan | undefined> {
  const product = await getProductById(productId);
  if (!product) return undefined;

  const artworks = await getArtworksByProduct(productId);
  const activeArtworks = artworks.filter((artwork) => artwork.status !== 'Archived');
  if (activeArtworks.length === 0) {
    return { status: 'no_artwork', product };
  }

  const candidateArtwork = activeArtworks.sort((a, b) => parseVersionNumber(b.version) - parseVersionNumber(a.version))[0];
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

// Helper we'll include here since it wasn't moved to the async comparisonService rewrite yet
async function getCrossCompanyCandidatesAsync(productId: string): Promise<CrossCompanyCandidate[]> {
  const product = await getProductById(productId);
  if (!product) return [];
  const products = await getProducts();
  const otherProducts = products.filter((p) => p.brandName === product.brandName && p.marketingCompany !== product.marketingCompany);
  
  const candidates: CrossCompanyCandidate[] = [];
  for (const other of otherProducts) {
    const artwork = await getLatestApprovedArtworkForProduct(other.id, other.marketingCompany);
    if (artwork) {
      candidates.push({
        productId: other.id,
        productName: other.productName,
        marketingCompany: other.marketingCompany,
        artworkId: artwork.id,
        artworkVersion: artwork.version
      });
    }
  }
  return candidates;
}


async function compareCandidate(subjectExtraction: LabelExtractionApiResult, candidate: CrossCompanyCandidate): Promise<CrossCompanyResultEntry> {
  const base = {
    candidateProductId: candidate.productId,
    candidateProductName: candidate.productName,
    candidateMarketingCompany: candidate.marketingCompany,
    candidateArtworkId: candidate.artworkId,
    candidateArtworkVersion: candidate.artworkVersion
  };
  const candidateArtwork = await getArtworkById(candidate.artworkId);
  if (!candidateArtwork) return { ...base, outcome: { status: 'file_unavailable' } };
  const candidateExtraction = await extractArtwork(candidateArtwork);
  if (!candidateExtraction) return { ...base, outcome: { status: 'file_unavailable' } };
  const result = await compareExtractedLabels(subjectExtraction, candidateExtraction);
  return { ...base, outcome: { status: 'success', result } };
}

export type RunOutcome =
  | { status: 'file_unavailable'; artwork: Artwork }
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
    const result = await compareExtractedLabels(candidateExtraction, approvedExtraction);
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

  const candidates = await getCrossCompanyCandidatesAsync(plan.product.id);
  const crossCompanyResults: CrossCompanyResultEntry[] = [];
  for (const candidate of candidates) {
    crossCompanyResults.push(await compareCandidate(candidateExtraction, candidate));
  }

  const run = await saveLabelComparisonRun({
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
