// Persisted history for the Label Comparison workflow.
//
// One record = one full comparison RUN, matching the business workflow:
//   Select Label -> (approved version exists?)
//     YES -> Version Comparison (candidate artwork vs. latest approved)
//     NO  -> skipped (versionComparison is undefined)
//   -> Cross-Company Comparison (always runs, against every other
//      marketing company's approved artwork for the same product name)
//   -> Final Result
//
// The "candidate" artwork is always an EXISTING Artwork Management record
// (the label's highest-versioned artwork) — this workflow never accepts an
// ad-hoc upload; there is nothing here that wasn't already selected from
// data already in the system. Both the version comparison and every
// cross-company comparison use the real OCR extraction + field comparison
// pipeline (see labelComparisonWorkflowService.ts) — never fabricated
// fields or scores.
//
// Deliberately separate from types/comparison.ts's `Comparison` — the
// pre-existing Label Final -> Technical -> QA -> Manager approval-pipeline
// record, which compares two artworks using a hand-authored 13-parameter
// model that isn't backed by real extraction. That type/workflow/store is
// untouched by this feature.
import type { ArtworkStatus } from './artwork';
import type { LabelComparisonApiResult, VisualComparisonResult } from './labelComparison';

export type CrossCompanyOutcome =
  // The candidate's or the subject's artwork file has no retrievable bytes
  // in this session (see artworkService.ts's file-storage-limitation note).
  | { status: 'file_unavailable' }
  | { status: 'success'; result: LabelComparisonApiResult; visualComparison?: VisualComparisonResult };

export type CrossCompanyResultEntry = {
  candidateProductId: string;
  candidateProductName: string;
  candidateMarketingCompany: string;
  candidateArtworkId: string;
  candidateArtworkVersion: string;
  outcome: CrossCompanyOutcome;
};

// AI module brief §6/§8 — "the system should identify the Best Match Label
// based on similarity" and report its Marketing Company alongside it.
// Undefined when there is nothing to pick a best match from at all (no
// candidates, or every candidate's file was unavailable) — "No Comparison
// Available" stays the honest answer rather than naming a best match among
// zero real comparisons.
export type BestCrossCompanyMatch = {
  candidateProductId: string;
  candidateProductName: string;
  candidateMarketingCompany: string;
  candidateArtworkId: string;
  candidateArtworkVersion: string;
  overallPercentage: number;
};

export type VersionComparisonResult = {
  candidateArtworkId: string;
  candidateArtworkVersion: string;
  candidateArtworkFileName: string;
  approvedArtworkId: string;
  approvedArtworkVersion: string;
  approvedArtworkFileName: string;
  approvedArtworkStatus: ArtworkStatus;
  approvedArtworkApprovedDate: string;
  result: LabelComparisonApiResult;
  // Artwork Similarity (Logo / Design-Layout, AI module brief §7/§9) —
  // undefined only when the visual comparison call itself failed (service
  // unreachable, unsupported file); a readable-but-different image pair
  // still gets a real MATCH/SIMILAR/CONFLICT here, never a silently-skipped
  // row.
  visualComparison?: VisualComparisonResult;
};

export type LabelComparisonRun = {
  id: string; // LC-00001
  productId: string;
  productName: string;
  brandName: string;
  marketingCompany: string;
  comparedBy: string;
  comparisonDate: string; // ISO timestamp
  // The label's own highest-versioned artwork at the time this ran — always
  // present (a label with zero artwork can't be selected for comparison).
  candidateArtworkId: string;
  candidateArtworkVersion: string;
  candidateArtworkFileName: string;
  // Undefined when this label had no Approved/Final Approved artwork to
  // compare against — version comparison is skipped, never faked.
  versionComparison?: VersionComparisonResult;
  // Always attempted, even when versionComparison was skipped — a
  // brand-new label with no approved version of its own can still be
  // checked against other companies' approved labels for the same product
  // name. Empty array (not undefined) when no cross-company candidates
  // exist at all, so the UI can tell "ran, found nothing" apart from
  // "didn't run".
  crossCompanyResults: CrossCompanyResultEntry[];
  // The highest-similarity successful cross-company result — see
  // BestCrossCompanyMatch above. Undefined, never fabricated, when
  // crossCompanyResults has no successful entry to pick from.
  bestCrossCompanyMatch?: BestCrossCompanyMatch;
};
