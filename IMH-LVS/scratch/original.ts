// Label Comparison data access + comparison engine.
//
// SCORING ENGINE — READ BEFORE MODIFYING
// ---------------------------------------------------------------------
// This is a deterministic, structured-text comparison — NOT AI, OCR, or
// image similarity. It compares plain-text label attributes (see
// getLabelAttributes below) parameter by parameter using normalized
// string equality and token (word) overlap:
//
//   - identical (trimmed, case-insensitive)        -> MATCH
//   - overlapping wording, Jaccard token similarity
//     >= SIMILAR_THRESHOLD                          -> SIMILAR
//   - otherwise                                     -> CONFLICT
//
// The overall similarity score averages a fixed point value per
// parameter result (MATCH_SCORE / SIMILAR_SCORE / CONFLICT_SCORE) across
// all compared parameters. Both the classifier and the scoring weights
// are intentionally isolated in this one section so a future OCR/image/
// AI comparison engine can replace them without touching anything else
// in this file or the UI — see classifyParameterValues() and
// calculateSimilarity().
// ---------------------------------------------------------------------

import { Artwork, ArtworkStatus } from '../types/artwork';
import { Product } from '../types/product';
import { RoleId } from '../auth/permissions';
import {
  ApprovalAssignments,
  ApprovalStageKey,
  COMPARISON_PARAMETERS,
  Comparison,
  ComparisonParameterName,
  ComparisonStage,
  ComparisonStatus,
  CrossCompanyCandidate,
  LabelAttributes,
  OverallResult,
  ParameterComparison,
  ParameterResult,
  WorkflowAction,
  WorkflowHistoryEntry,
  WorkflowStage
} from '../types/comparison';
import { SEED_COMPARISONS, SEED_LABEL_ATTRIBUTES } from '../data/comparisons';
import {
  getArtworks,
  getLatestApprovedArtwork as getLatestApprovedArtworkFromArtworkService,
  updateArtwork as updateArtworkStatus
} from './artworkService';
import { getProducts } from './productService';

// The acting user for every approval-stage decision — id/name for the audit
// trail, role for the service-layer permission check (see canActAtStage).
// UI button visibility is a courtesy; this is the actual gate.
export type Actor = { id: string; name: string; role: RoleId };

const STORAGE_KEY = 'imh_lvs_comparisons';

const SIMILAR_THRESHOLD = 0.6;
const MATCH_SCORE = 100;
const SIMILAR_SCORE = 65;
const CONFLICT_SCORE = 0;

// Backfills fields added to the Comparison shape after some browsers already
// had comparisons persisted in localStorage, so older stored records don't
// crash consumers that assume the field is always present.
function withDefaults(comparison: Comparison): Comparison {
  return {
    ...comparison,
    history: comparison.history ?? [],
    approvalAssignments: comparison.approvalAssignments ?? {}
  };
}

function readAll(): Comparison[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_COMPARISONS));
    return SEED_COMPARISONS;
  }
  try {
    return (JSON.parse(raw) as Comparison[]).map(withDefaults);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_COMPARISONS));
    return SEED_COMPARISONS;
  }
}

function writeAll(comparisons: Comparison[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comparisons));
}

function nextComparisonId(existing: Comparison[]): string {
  const maxSeq = existing.reduce((max, comparison) => {
    const match = /^CMP-(\d+)$/.exec(comparison.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `CMP-${String(maxSeq + 1).padStart(4, '0')}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------
// Label attributes (structured "extracted" label content)
// ---------------------------------------------------------------------

const LABEL_ATTRIBUTES_STORAGE_KEY = 'imh_lvs_label_attributes';

function readCustomLabelAttributes(): LabelAttributes[] {
  const raw = localStorage.getItem(LABEL_ATTRIBUTES_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LabelAttributes[];
  } catch {
    return [];
  }
}

function writeCustomLabelAttributes(attributes: LabelAttributes[]) {
  localStorage.setItem(LABEL_ATTRIBUTES_STORAGE_KEY, JSON.stringify(attributes));
}

// Persists the structured label content captured during label upload (see
// labelIntakeService.submitLabelIntake) against its artwork, so the
// comparison engine reads the actual values the user verified instead of
// falling back to "Not specified". Overwrites any prior record for the same
// artworkId.
export function saveLabelAttributes(attributes: LabelAttributes): void {
  const existing = readCustomLabelAttributes().filter((item) => item.artworkId !== attributes.artworkId);
  writeCustomLabelAttributes([...existing, attributes]);
}

// Returns the artwork's structured label content: label-upload-captured
// data first (see saveLabelAttributes above), then hand-authored seed data,
// and only then a synthesized record built from Product/Artwork fields for
// artworks that have neither (e.g. artwork created via the legacy Edit
// path) — those fallback fields read "Not specified" rather than guessing,
// since there is no OCR step yet to actually read the file.
export function getLabelAttributes(artwork: Artwork, product?: Product): LabelAttributes {
  const custom = readCustomLabelAttributes().find((attributes) => attributes.artworkId === artwork.id);
  if (custom) return custom;

  const seeded = SEED_LABEL_ATTRIBUTES.find((attributes) => attributes.artworkId === artwork.id);
  if (seeded) return seeded;

  return {
    artworkId: artwork.id,
    brandName: artwork.brand,
    productName: artwork.productName,
    address: 'Not specified',
    customerCareNumber: 'Not specified',
    customerCareEmail: 'Not specified',
    colourTheme: 'Not specified',
    flavour: product?.flavour ?? 'Not specified',
    claims: 'Not specified',
    logo: 'Not specified',
    labelDesign: 'Not specified',
    nutritionTableFormat: 'Not specified',
    fssaiNumber: product?.fssaiNumber ?? 'Not specified',
    ingredients: 'Not specified'
  };
}

// ---------------------------------------------------------------------
// Comparison engine
// ---------------------------------------------------------------------

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let overlap = 0;
  a.forEach((token) => {
    if (b.has(token)) overlap += 1;
  });
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : overlap / union;
}

// The replaceable classifier: swap this implementation for an OCR/AI-backed
// one later without changing its signature or any caller.
function classifyParameterValues(referenceValue: string, newValue: string): ParameterResult {
  const normalizedReference = referenceValue.trim().toLowerCase();
  const normalizedNew = newValue.trim().toLowerCase();
  if (normalizedReference === normalizedNew) return 'MATCH';

  const similarity = jaccardSimilarity(tokenize(referenceValue), tokenize(newValue));
  return similarity >= SIMILAR_THRESHOLD ? 'SIMILAR' : 'CONFLICT';
}

const ATTRIBUTE_FIELD_BY_PARAMETER: Record<ComparisonParameterName, keyof LabelAttributes> = {
  'Brand Name': 'brandName',
  'Product Name': 'productName',
  Address: 'address',
  'Customer Care Number': 'customerCareNumber',
  'Customer Care Email': 'customerCareEmail',
  'Colour Theme': 'colourTheme',
  Flavour: 'flavour',
  Claims: 'claims',
  Logo: 'logo',
  'Label Design / Layout': 'labelDesign',
  'Nutrition Table Format': 'nutritionTableFormat',
  'FSSAI Number': 'fssaiNumber',
  Ingredients: 'ingredients'
};

// Compares every parameter in COMPARISON_PARAMETERS (Batch Number is
// deliberately not in that list — see types/comparison.ts).
export function compareParameters(reference: LabelAttributes, newLabel: LabelAttributes): ParameterComparison[] {
  return COMPARISON_PARAMETERS.map((parameter) => {
    const field = ATTRIBUTE_FIELD_BY_PARAMETER[parameter];
    const referenceValue = reference[field];
    const newValue = newLabel[field];
    return {
      parameter,
      referenceValue,
      newValue,
      result: classifyParameterValues(referenceValue, newValue)
    };
  });
}

// Documented, transparent scoring: each parameter contributes a fixed
// point value by its result, averaged across all compared parameters.
export function calculateSimilarity(parameters: ParameterComparison[]): number {
  if (parameters.length === 0) return 0;
  const total = parameters.reduce((sum, param) => {
    if (param.result === 'MATCH') return sum + MATCH_SCORE;
    if (param.result === 'SIMILAR') return sum + SIMILAR_SCORE;
    return sum + CONFLICT_SCORE;
  }, 0);
  return Math.round(total / parameters.length);
}

// CONFLICT if any parameter conflicts; REVIEW REQUIRED if no conflicts but
// at least one SIMILAR; MATCH only when every parameter matches exactly.
export function generateComparisonResult(parameters: ParameterComparison[]): OverallResult {
  if (parameters.some((param) => param.result === 'CONFLICT')) return 'CONFLICT';
  if (parameters.some((param) => param.result === 'SIMILAR')) return 'REVIEW REQUIRED';
  return 'MATCH';
}

// ---------------------------------------------------------------------
// Reference artwork / best match
// ---------------------------------------------------------------------

// Stage 1: latest Approved (never Draft/Rejected/Archived) artwork for the
// same product + same marketing company + artwork type. Delegates to
// artworkService, which already owns this rule.
export function getLatestApprovedArtwork(productId: string, marketingCompany: string, artworkType: Artwork['artworkType']) {
  return getLatestApprovedArtworkFromArtworkService(productId, marketingCompany, artworkType);
}

export function getReferenceArtwork(productId: string, marketingCompany: string, artworkType: Artwork['artworkType']) {
  return getLatestApprovedArtwork(productId, marketingCompany, artworkType);
}

// Given one new artwork and a list of candidate reference artworks, scores
// each candidate and returns the highest-similarity one — used when more
// than one existing label could plausibly serve as the reference (e.g.
// several approved versions, or multiple cross-company candidates).
export function findBestMatch(
  newArtwork: Artwork,
  candidates: Artwork[],
  productLookup?: Product
): { artwork: Artwork; similarity: number; parameters: ParameterComparison[] } | undefined {
  if (candidates.length === 0) return undefined;
  const newAttributes = getLabelAttributes(newArtwork, productLookup);
  const scored = candidates.map((candidate) => {
    const parameters = compareParameters(getLabelAttributes(candidate, productLookup), newAttributes);
    return { artwork: candidate, similarity: calculateSimilarity(parameters), parameters };
  });
  return scored.sort((a, b) => b.similarity - a.similarity)[0];
}

// ---------------------------------------------------------------------
// Stage 2: cross-company candidates
// ---------------------------------------------------------------------

// Other marketing companies' Approved "Full Label" artwork for the exact
// same product name — same-product-name matching only (no semantic/fuzzy
// product matching yet, per spec).
export function getCrossCompanyCandidates(productId: string): CrossCompanyCandidate[] {
  const products = getProducts();
  const sourceProduct = products.find((product) => product.id === productId);
  if (!sourceProduct) return [];

  const otherProducts = products.filter(
    (product) =>
      product.id !== productId &&
      product.marketingCompany !== sourceProduct.marketingCompany &&
      product.productName.trim().toLowerCase() === sourceProduct.productName.trim().toLowerCase()
  );

  return otherProducts
    .map((product) => {
      const artwork = getLatestApprovedArtwork(product.id, product.marketingCompany, 'Full Label');
      if (!artwork) return undefined;
      return {
        productId: product.id,
        productName: product.productName,
        marketingCompany: product.marketingCompany,
        artworkId: artwork.id,
        artworkVersion: artwork.version
      };
    })
    .filter((candidate): candidate is CrossCompanyCandidate => Boolean(candidate));
}

// ---------------------------------------------------------------------
// Comparison CRUD
// ---------------------------------------------------------------------

export function getComparisons(): Comparison[] {
  return readAll();
}

export function getComparisonById(id: string): Comparison | undefined {
  return readAll().find((comparison) => comparison.id === id);
}

export function getComparisonsByProduct(productId: string): Comparison[] {
  return readAll().filter((comparison) => comparison.productId === productId);
}

export type CreateComparisonInput = {
  productId: string;
  productName: string;
  stage: ComparisonStage;
  newArtwork: Artwork;
  referenceArtwork: Artwork;
};

// Runs the engine against the two artworks and persists the result as a
// new Comparison record.
export function createComparison(input: CreateComparisonInput, actor: string, productLookup?: Product): Comparison {
  const referenceAttributes = getLabelAttributes(input.referenceArtwork, productLookup);
  const newAttributes = getLabelAttributes(input.newArtwork, productLookup);
  const parameters = compareParameters(referenceAttributes, newAttributes);
  const overallSimilarity = calculateSimilarity(parameters);
  const overallResult = generateComparisonResult(parameters);

  const comparisons = readAll();
  const now = today();
  const newComparison: Comparison = {
    id: nextComparisonId(comparisons),
    productId: input.productId,
    productName: input.productName,
    stage: input.stage,
    newArtworkId: input.newArtwork.id,
    newArtworkVersion: input.newArtwork.version,
    newArtworkCompany: input.newArtwork.marketingCompany,
    referenceArtworkId: input.referenceArtwork.id,
    referenceArtworkVersion: input.referenceArtwork.version,
    referenceArtworkCompany: input.referenceArtwork.marketingCompany,
    parameters,
    overallSimilarity,
    overallResult,
    status: 'Completed',
    history: [],
    approvalAssignments: {},
    comparedBy: actor,
    comparisonDate: now,
    updatedBy: actor,
    updatedDate: now
  };
  writeAll([...comparisons, newComparison]);
  return newComparison;
}

// Hands a completed comparison off to the Label Final queue — the entry
// point into the Label Final -> Technical -> QA -> Manager pipeline. Not one
// of the four gated approval stages itself (it's the Account Manager's own
// action, not a stage reviewer's), so it isn't routed through
// canActAtStage/transitionComparison — but it still independently validates
// the actor's role rather than trusting that the UI already hid the button.
export function sendComparisonForReview(id: string, actor: Actor): Comparison | undefined {
  if (actor.role !== 'account_manager' && actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to submit a comparison for review.`);
  }

  const comparisons = readAll();
  const index = comparisons.findIndex((comparison) => comparison.id === id);
  if (index === -1) return undefined;
  const updated: Comparison = { ...comparisons[index], status: 'Pending Label Final', updatedBy: actor.name, updatedDate: today() };
  comparisons[index] = updated;
  writeAll(comparisons);
  updateArtworkStatus(updated.newArtworkId, { status: 'Under Review' }, actor.name);
  return updated;
}

// ---------------------------------------------------------------------
// Label Final -> Technical -> QA -> Manager Approval workflow
// ---------------------------------------------------------------------
// Every decision at every stage goes through transitionComparison, which:
//   1. Re-validates the actor's role against the stage being acted on
//      (never trusts that the UI already hid the button — a Technical user
//      calling submitManagerDecision, or a QA user calling it directly,
//      is rejected here regardless of what buttons their screen rendered).
//   2. Appends one immutable entry to comparison.history — prior entries
//      are never edited or removed, so the full cross-stage trail always
//      survives a later revision or rejection.
//   3. Optionally carries the outcome through to the underlying Artwork's
//      status, so Artwork Management reflects the same decision.
//
// A role may act at its own stage, or Manager may act at any stage (the one
// permitted override — Manager already sits above every other stage). No
// other cross-role override exists; in particular there is no override at
// all for the Manager stage itself, since Manager is already the top role —
// this is what makes "only Manager can produce Final Approved" hold at the
// function level, not just in the UI.
function canActAtStage(actor: Actor, stageRole: RoleId): boolean {
  return actor.role === stageRole || actor.role === 'manager';
}

// WorkflowStage ('Label Final', display form used in history entries) <->
// ApprovalStageKey ('labelFinal', compact object-key form used in
// ApprovalAssignments) — the two names for the same four stages.
const STAGE_KEY_BY_WORKFLOW_STAGE: Record<WorkflowStage, ApprovalStageKey> = {
  'Label Final': 'labelFinal',
  Technical: 'technical',
  QA: 'qa',
  Manager: 'manager'
};

function transitionComparison(
  id: string,
  actor: Actor,
  stageRole: RoleId,
  stage: WorkflowStage,
  resultingStatus: ComparisonStatus,
  action: WorkflowAction,
  remarks: string,
  artworkStatus?: ArtworkStatus
): Comparison | undefined {
  if (!canActAtStage(actor, stageRole)) {
    throw new Error(`Role "${actor.role}" is not authorized to record a ${stage} decision.`);
  }

  const comparisons = readAll();
  const index = comparisons.findIndex((comparison) => comparison.id === id);
  if (index === -1) return undefined;

  // Snapshot who was assigned to this stage at the moment of the decision —
  // kept even when a Manager override means the actual actor (below) is a
  // different person. The assignment itself is never mutated by acting on
  // it; only assignApprovalStage() changes it.
  const approvalUserId = comparisons[index].approvalAssignments[STAGE_KEY_BY_WORKFLOW_STAGE[stage]];

  const entry: WorkflowHistoryEntry = {
    stage,
    action,
    resultingStatus,
    approvalUserId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    date: nowTimestamp(),
    remarks
  };

  const updated: Comparison = {
    ...comparisons[index],
    status: resultingStatus,
    qaRemarks: remarks,
    history: [...comparisons[index].history, entry],
    updatedBy: actor.name,
    updatedDate: today()
  };
  comparisons[index] = updated;
  writeAll(comparisons);

  if (artworkStatus) updateArtworkStatus(updated.newArtworkId, { status: artworkStatus }, actor.name);
  return updated;
}

export function getLabelFinalQueue(): Comparison[] {
  return readAll().filter((comparison) => comparison.status === 'Pending Label Final');
}

export function getTechnicalQueue(): Comparison[] {
  return readAll().filter((comparison) => comparison.status === 'Pending Technical');
}

export function getManagerApprovalQueue(): Comparison[] {
  return readAll().filter((comparison) => comparison.status === 'Pending Manager Approval');
}

// Label Final is the first review stage after a comparison is submitted.
// Approve moves it to Technical; it never sets Final Approved.
export function submitLabelFinalDecision(id: string, action: 'approve' | 'revision', remarks: string, actor: Actor): Comparison | undefined {
  if (action === 'approve') {
    return transitionComparison(id, actor, 'label_final', 'Label Final', 'Pending Technical', 'Sent to Technical', remarks);
  }
  return transitionComparison(id, actor, 'label_final', 'Label Final', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// Technical receives Label Final's remarks plus full context. Approve moves
// it to QA; it never sets Final Approved.
export function submitTechnicalDecision(id: string, action: 'approve' | 'revision', remarks: string, actor: Actor): Comparison | undefined {
  if (action === 'approve') {
    return transitionComparison(id, actor, 'technical', 'Technical', 'Pending QA', 'Sent to QA', remarks);
  }
  return transitionComparison(id, actor, 'technical', 'Technical', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// ---------------------------------------------------------------------
// QA Verification
// ---------------------------------------------------------------------
// QA Approved != Final Approved. Verifying a comparison here routes it to
// Pending Manager Approval — it does NOT set the comparison or the
// underlying artwork to any final/terminal state. Only Manager's
// submitManagerDecision('approve', ...) can ever produce Final Approved.

export function getQAQueue(): Comparison[] {
  return readAll().filter((comparison) => comparison.status === 'Pending QA');
}

export function qaVerifyComparison(id: string, remarks: string, actor: Actor): Comparison | undefined {
  return transitionComparison(id, actor, 'qa', 'QA', 'Pending Manager Approval', 'Sent to Manager', remarks);
}

export function qaRejectComparison(id: string, remarks: string, actor: Actor): Comparison | undefined {
  return transitionComparison(id, actor, 'qa', 'QA', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// ---------------------------------------------------------------------
// Manager Approval — the ONLY stage that can produce Final Approved.
// ---------------------------------------------------------------------

export function submitManagerDecision(
  id: string,
  action: 'approve' | 'reject' | 'revision',
  remarks: string,
  actor: Actor
): Comparison | undefined {
  if (action === 'approve') {
    return transitionComparison(id, actor, 'manager', 'Manager', 'Final Approved', 'Final Approved', remarks, 'Final Approved');
  }
  if (action === 'reject') {
    return transitionComparison(id, actor, 'manager', 'Manager', 'Rejected', 'Rejected', remarks, 'Rejected');
  }
  return transitionComparison(id, actor, 'manager', 'Manager', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// ---------------------------------------------------------------------
// Approval summary — feeds the Approvals page's cards today, and is the
// intended data source for a future Dashboard's approval-queue counts.
// ---------------------------------------------------------------------

export type ApprovalSummary = {
  pendingLabelFinal: number;
  pendingTechnical: number;
  pendingQA: number;
  pendingManagerApproval: number;
  finalApproved: number;
  revisionRequired: number;
  rejected: number;
};

export function getApprovalSummary(): ApprovalSummary {
  const comparisons = readAll();
  const count = (status: ComparisonStatus) => comparisons.filter((comparison) => comparison.status === status).length;
  return {
    pendingLabelFinal: count('Pending Label Final'),
    pendingTechnical: count('Pending Technical'),
    pendingQA: count('Pending QA'),
    pendingManagerApproval: count('Pending Manager Approval'),
    finalApproved: count('Final Approved'),
    revisionRequired: count('Revision Required'),
    rejected: count('Rejected')
  };
}

// Convenience: all artwork versions (any status) for a product + company,
// used by the "New Comparison" wizard's version picker.
export function getArtworkVersionsForSelection(productId: string, marketingCompany: string): Artwork[] {
  return getArtworks().filter((artwork) => artwork.productId === productId && artwork.marketingCompany === marketingCompany);
}

// Comparisons the engine has run against but that Account Manager hasn't
// sent into the pipeline yet (see sendComparisonForReview). This is that
// role's own "pending work" queue on the Dashboard/Approvals side of things.
export function getUnsubmittedComparisons(): Comparison[] {
  return readAll().filter((comparison) => comparison.status === 'Completed');
}

// ---------------------------------------------------------------------
// Approval assignment — WHO is responsible for a stage, distinct from
// RBAC (WHAT a role may do) and from WorkflowHistoryEntry.actorId (who
// actually performed a given action). Assigning/reassigning is a Manager
// action, same top-of-pipeline authority already used for Final Approve —
// this does not add a new permission, it reuses the existing 'manager' role
// check already established by canActAtStage.
// ---------------------------------------------------------------------

export function assignApprovalStage(id: string, stageKey: ApprovalStageKey, userId: string | undefined, actor: Actor): Comparison | undefined {
  if (actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to assign approval stages.`);
  }
  const comparisons = readAll();
  const index = comparisons.findIndex((comparison) => comparison.id === id);
  if (index === -1) return undefined;

  const updated: Comparison = {
    ...comparisons[index],
    approvalAssignments: { ...comparisons[index].approvalAssignments, [stageKey]: userId },
    updatedBy: actor.name,
    updatedDate: today()
  };
  comparisons[index] = updated;
  writeAll(comparisons);
  return updated;
}

const PENDING_STAGE_BY_ROLE: Partial<Record<RoleId, { status: ComparisonStatus; key: ApprovalStageKey }>> = {
  label_final: { status: 'Pending Label Final', key: 'labelFinal' },
  technical: { status: 'Pending Technical', key: 'technical' },
  qa: { status: 'Pending QA', key: 'qa' },
  manager: { status: 'Pending Manager Approval', key: 'manager' }
};

// The Dashboard's "My Pending Work": comparisons pending at this role's
// stage AND (unassigned OR specifically assigned to this user). RBAC still
// governs whether the role may act at all (see canActAtStage/QA page/
// Approvals page) — this only narrows which pending items are surfaced as
// "mine" so one QA user's Dashboard doesn't fill up with another QA user's
// specifically-assigned work. An unassigned stage stays visible to every
// user with that role, preserving today's behavior for comparisons created
// before assignment existed.
export function getMyPendingWork(userId: string, role: RoleId): Comparison[] {
  const stageInfo = PENDING_STAGE_BY_ROLE[role];
  if (!stageInfo) return [];
  return readAll().filter((comparison) => {
    if (comparison.status !== stageInfo.status) return false;
    const assigned = comparison.approvalAssignments[stageInfo.key];
    return !assigned || assigned === userId;
  });
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

export type DashboardSummary = {
  totalProducts: number;
  totalArtwork: number;
  pendingComparison: number;
  pendingApproval: number;
  finalApproved: number;
  revisionRequired: number;
  rejected: number;
  pendingLabelFinal: number;
  pendingTechnical: number;
  pendingQA: number;
  pendingManagerApproval: number;
};

// Single aggregation point for the Dashboard's top-level numbers. Reuses
// getApprovalSummary() for every workflow-stage count rather than
// recomputing them, and reads Products/Artwork through their own services —
// Dashboard.tsx should never need to filter raw records itself.
export function getDashboardSummary(): DashboardSummary {
  const approval = getApprovalSummary();
  const artworks = getArtworks();
  const pendingComparison = artworks.filter((artwork) => artwork.status === 'Pending Comparison').length;
  const pendingApproval = approval.pendingLabelFinal + approval.pendingTechnical + approval.pendingQA + approval.pendingManagerApproval;

  return {
    totalProducts: getProducts().length,
    totalArtwork: artworks.length,
    pendingComparison,
    pendingApproval,
    finalApproved: approval.finalApproved,
    revisionRequired: approval.revisionRequired,
    rejected: approval.rejected,
    pendingLabelFinal: approval.pendingLabelFinal,
    pendingTechnical: approval.pendingTechnical,
    pendingQA: approval.pendingQA,
    pendingManagerApproval: approval.pendingManagerApproval
  };
}

export type RecentActivityItem = {
  comparisonId: string;
  productName: string;
  stage: WorkflowStage;
  action: WorkflowAction;
  status: ComparisonStatus;
  // Who was assigned to this stage when the decision was made (undefined if
  // unassigned) vs. who actually performed it — see WorkflowHistoryEntry.
  approvalUserId?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  date: string;
  remarks: string;
};

// Flattens every comparison's workflow history into one reverse-chronological
// feed — real records only, nothing synthesized. Comparisons with no history
// yet (never submitted, or seeded before this workflow existed) simply
// contribute nothing. Shared by the Dashboard's "Recent Activity" (via
// getRecentActivity, which just caps this) and by Reports' Approval History
// / User Activity reports, so the flatten-and-sort logic lives in one place.
export function getAllWorkflowHistory(): RecentActivityItem[] {
  const items: RecentActivityItem[] = [];
  readAll().forEach((comparison) => {
    comparison.history.forEach((entry) => {
      items.push({
        comparisonId: comparison.id,
        productName: comparison.productName,
        stage: entry.stage,
        action: entry.action,
        status: entry.resultingStatus,
        approvalUserId: entry.approvalUserId,
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        date: entry.date,
        remarks: entry.remarks
      });
    });
  });
  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getRecentActivity(limit = 10): RecentActivityItem[] {
  return getAllWorkflowHistory().slice(0, limit);
}
