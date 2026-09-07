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
  WorkflowStage
} from '../types/comparison';
import { getArtworks, getLatestApprovedArtwork as getLatestApprovedArtworkFromArtworkService } from './artworkService';
import { getProducts } from './productService';
import apiClient, { actorHeaders, workflowActorHeaders } from './apiClient';

// The acting user for every approval-stage decision — id/name for the audit
// trail, role for the service-layer permission check (see canActAtStage).
// UI button visibility is a courtesy; this is the actual gate.
export type Actor = { id: string; name: string; role: RoleId };

const SIMILAR_THRESHOLD = 0.6;
const MATCH_SCORE = 100;
const SIMILAR_SCORE = 65;
const CONFLICT_SCORE = 0;

async function readAll(): Promise<Comparison[]> {
  const { data } = await apiClient.get('/comparisons');
  return data;
}

// ---------------------------------------------------------------------
// Label attributes (structured "extracted" label content)
// ---------------------------------------------------------------------

// Persists the structured label content captured during label upload (see
// labelIntakeService.submitLabelIntake) against its artwork, so the
// comparison engine reads the actual values the user verified instead of
// falling back to "Not specified". Replaces any prior record for the same
// artwork wholesale — see backend/src/repositories/artwork.repository.ts's
// upsertLabelAttributes.
export async function saveLabelAttributes(attributes: LabelAttributes): Promise<void> {
  const { artworkId, ...values } = attributes;
  await apiClient.put(`/artworks/${artworkId}/label-attributes`, { values, source: 'manual' });
}

// Returns the artwork's structured label content: what was actually
// extracted/recorded for it (see saveLabelAttributes above and the OCR
// extraction pipeline), or — for an artwork that has never been extracted
// (e.g. one created via the legacy Edit path) — a synthesized record built
// from Product/Artwork fields. Those fallback fields read "Not specified"
// rather than guessing, since there is no reading to fall back on.
export async function getLabelAttributes(artwork: Artwork, product?: Product): Promise<LabelAttributes> {
  const { data } = await apiClient.get(`/artworks/${artwork.id}/label-attributes`);
  if (data) return data as LabelAttributes;

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
export async function generateComparisonResult(parameters: ParameterComparison[]): Promise<OverallResult> {
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
export async function getLatestApprovedArtwork(productId: string, marketingCompany: string, artworkType: Artwork['artworkType']) {
  return await getLatestApprovedArtworkFromArtworkService(productId, marketingCompany, artworkType);
}

export async function getReferenceArtwork(productId: string, marketingCompany: string, artworkType: Artwork['artworkType']) {
  return await getLatestApprovedArtwork(productId, marketingCompany, artworkType);
}

// Given one new artwork and a list of candidate reference artworks, scores
// each candidate and returns the highest-similarity one — used when more
// than one existing label could plausibly serve as the reference (e.g.
// several approved versions, or multiple cross-company candidates).
export async function findBestMatch(
  newArtwork: Artwork,
  candidates: Artwork[],
  productLookup?: Product
): Promise<{ artwork: Artwork; similarity: number; parameters: ParameterComparison[] } | undefined> {
  if (candidates.length === 0) return undefined;
  const newAttributes = await getLabelAttributes(newArtwork, productLookup);
  const scored = await Promise.all(candidates.map(async (candidate) => {
    const parameters = compareParameters(await getLabelAttributes(candidate, productLookup), newAttributes);
    return { artwork: candidate, similarity: calculateSimilarity(parameters), parameters };
  }));
  return scored.sort((a, b) => b.similarity - a.similarity)[0];
}

// ---------------------------------------------------------------------
// Stage 2: cross-company candidates
// ---------------------------------------------------------------------

// Other marketing companies' Approved "Full Label" artwork for the exact
// same product name — same-product-name matching only (no semantic/fuzzy
// product matching yet, per spec).
export async function getCrossCompanyCandidates(productId: string): Promise<CrossCompanyCandidate[]> {
  const products = (await getProducts());
  const sourceProduct = products.find((product) => product.id === productId);
  if (!sourceProduct) return [];

  const otherProducts = products.filter(
    (product) =>
      product.id !== productId &&
      product.marketingCompany !== sourceProduct.marketingCompany &&
      product.productName.trim().toLowerCase() === sourceProduct.productName.trim().toLowerCase()
  );

  const candidates = await Promise.all(
    otherProducts.map(async (product) => {
      const artwork = await getLatestApprovedArtwork(product.id, product.marketingCompany, 'Full Label');
      if (!artwork) return undefined;
      return {
        productId: product.id,
        productName: product.productName,
        marketingCompany: product.marketingCompany,
        artworkId: artwork.id,
        artworkVersion: artwork.version
      };
    })
  );

  return candidates.filter((candidate): candidate is CrossCompanyCandidate => Boolean(candidate));
}

// ---------------------------------------------------------------------
// Comparison CRUD
// ---------------------------------------------------------------------

export async function getComparisons(): Promise<Comparison[]> {
  return (await readAll());
}

export async function getComparisonById(id: string): Promise<Comparison | undefined> {
  try {
    const { data } = await apiClient.get(`/comparisons/${id}`);
    return data;
  } catch {
    return undefined;
  }
}

export async function getComparisonsByProduct(productId: string): Promise<Comparison[]> {
  return (await readAll()).filter((comparison) => comparison.productId === productId);
}

export type CreateComparisonInput = {
  productId: string;
  productName: string;
  stage: ComparisonStage;
  newArtwork: Artwork;
  referenceArtwork: Artwork;
};

// Runs the engine against the two artworks and persists the result as a
// new Comparison record. id, version/company display fields, history and
// approvalAssignments are all assigned/joined by the backend — see
// backend/src/repositories/comparison.repository.ts's ComparisonInput.
export async function createComparison(input: CreateComparisonInput, actor: string, productLookup?: Product): Promise<Comparison> {
  const referenceAttributes = await getLabelAttributes(input.referenceArtwork, productLookup);
  const newAttributes = await getLabelAttributes(input.newArtwork, productLookup);
  const parameters = compareParameters(referenceAttributes, newAttributes);
  const overallSimilarity = calculateSimilarity(parameters);
  const overallResult = await generateComparisonResult(parameters);

  const { data } = await apiClient.post(
    '/comparisons',
    {
      productId: input.productId,
      stage: input.stage,
      newArtworkId: input.newArtwork.id,
      // '' means a cross-company comparison found no candidate — the backend
      // wants that absence as a missing field, not an empty string.
      referenceArtworkId: input.referenceArtwork.id || undefined,
      parameters,
      overallSimilarity,
      overallResult,
      status: 'Completed'
    },
    { headers: actorHeaders(actor) }
  );
  return data;
}

// Hands a completed comparison off to the Label Final queue — the entry
// point into the Label Final -> Technical -> QA -> Manager pipeline. Not one
// of the four gated approval stages itself (it's the Account Manager's own
// action, not a stage reviewer's), so it isn't routed through
// canActAtStage/transitionComparison — but it still independently validates
// the actor's role rather than trusting that the UI already hid the button.
// The backend moves the comparison AND its artwork to their next status
// together, in one transaction — see comparisons.routes.ts's /:id/submit.
export async function sendComparisonForReview(id: string, actor: Actor): Promise<Comparison | undefined> {
  if (actor.role !== 'account_manager' && actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to submit a comparison for review.`);
  }

  try {
    const { data } = await apiClient.post(`/comparisons/${id}/submit`, {}, { headers: actorHeaders(actor.name) });
    return data;
  } catch {
    return undefined;
  }
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

const WORKFLOW_STAGE_BY_KEY: Record<ApprovalStageKey, WorkflowStage> = {
  labelFinal: 'Label Final',
  technical: 'Technical',
  qa: 'QA',
  manager: 'Manager'
};

// Records one approval-workflow decision: status, history entry and artwork
// status together, in one backend transaction — see
// comparison.repository.ts's recordWorkflowDecision.
async function transitionComparison(
  id: string,
  actor: Actor,
  stageRole: RoleId,
  stage: WorkflowStage,
  resultingStatus: ComparisonStatus,
  action: WorkflowAction,
  remarks: string,
  artworkStatus?: ArtworkStatus
): Promise<Comparison | undefined> {
  if (!canActAtStage(actor, stageRole)) {
    throw new Error(`Role "${actor.role}" is not authorized to record a ${stage} decision.`);
  }

  // Who was assigned to this stage at the moment of the decision — kept even
  // when a Manager override means the actual actor (the header identity) is
  // a different person.
  const current = await getComparisonById(id);
  if (!current) return undefined;
  const approvalUserId = current.approvalAssignments[STAGE_KEY_BY_WORKFLOW_STAGE[stage]];

  try {
    const { data } = await apiClient.post(
      `/comparisons/${id}/decisions`,
      { stage, action, resultingStatus, remarks, approvalUserId, artworkStatus, qaRemarks: remarks },
      { headers: workflowActorHeaders(actor) }
    );
    return data;
  } catch {
    return undefined;
  }
}

export async function getLabelFinalQueue(): Promise<Comparison[]> {
  return (await readAll()).filter((comparison) => comparison.status === 'Pending Label Final');
}

export async function getTechnicalQueue(): Promise<Comparison[]> {
  return (await readAll()).filter((comparison) => comparison.status === 'Pending Technical');
}

export async function getManagerApprovalQueue(): Promise<Comparison[]> {
  return (await readAll()).filter((comparison) => comparison.status === 'Pending Manager Approval');
}

// Label Final is the first review stage after a comparison is submitted.
// Approve moves it to Technical; it never sets Final Approved.
export async function submitLabelFinalDecision(id: string, action: 'approve' | 'revision', remarks: string, actor: Actor): Promise<Comparison | undefined> {
  if (action === 'approve') {
    return await transitionComparison(id, actor, 'label_final', 'Label Final', 'Pending Technical', 'Sent to Technical', remarks);
  }
  return await transitionComparison(id, actor, 'label_final', 'Label Final', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// Technical receives Label Final's remarks plus full context. Approve moves
// it to QA; it never sets Final Approved.
export async function submitTechnicalDecision(id: string, action: 'approve' | 'revision', remarks: string, actor: Actor): Promise<Comparison | undefined> {
  if (action === 'approve') {
    return await transitionComparison(id, actor, 'technical', 'Technical', 'Pending QA', 'Sent to QA', remarks);
  }
  return await transitionComparison(id, actor, 'technical', 'Technical', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// ---------------------------------------------------------------------
// QA Verification
// ---------------------------------------------------------------------
// QA Approved != Final Approved. Verifying a comparison here routes it to
// Pending Manager Approval — it does NOT set the comparison or the
// underlying artwork to any final/terminal state. Only Manager's
// submitManagerDecision('approve', ...) can ever produce Final Approved.

export async function getQAQueue(): Promise<Comparison[]> {
  return (await readAll()).filter((comparison) => comparison.status === 'Pending QA');
}

export async function qaVerifyComparison(id: string, remarks: string, actor: Actor): Promise<Comparison | undefined> {
  return await transitionComparison(id, actor, 'qa', 'QA', 'Pending Manager Approval', 'Sent to Manager', remarks);
}

export async function qaRejectComparison(id: string, remarks: string, actor: Actor): Promise<Comparison | undefined> {
  return await transitionComparison(id, actor, 'qa', 'QA', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// ---------------------------------------------------------------------
// Manager Approval — the ONLY stage that can produce Final Approved.
// ---------------------------------------------------------------------

export async function submitManagerDecision(
  id: string,
  action: 'approve' | 'reject' | 'revision',
  remarks: string,
  actor: Actor
): Promise<Comparison | undefined> {
  if (action === 'approve') {
    return await transitionComparison(id, actor, 'manager', 'Manager', 'Final Approved', 'Final Approved', remarks, 'Final Approved');
  }
  if (action === 'reject') {
    return await transitionComparison(id, actor, 'manager', 'Manager', 'Rejected', 'Rejected', remarks, 'Rejected');
  }
  return await transitionComparison(id, actor, 'manager', 'Manager', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
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

export async function getApprovalSummary(): Promise<ApprovalSummary> {
  const comparisons = (await readAll());
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
export async function getArtworkVersionsForSelection(productId: string, marketingCompany: string): Promise<Artwork[]> {
  return (await getArtworks()).filter((artwork) => artwork.productId === productId && artwork.marketingCompany === marketingCompany);
}

// Comparisons the engine has run against but that Account Manager hasn't
// sent into the pipeline yet (see sendComparisonForReview). This is that
// role's own "pending work" queue on the Dashboard/Approvals side of things.
export async function getUnsubmittedComparisons(): Promise<Comparison[]> {
  return (await readAll()).filter((comparison) => comparison.status === 'Completed');
}

// ---------------------------------------------------------------------
// Approval assignment — WHO is responsible for a stage, distinct from
// RBAC (WHAT a role may do) and from WorkflowHistoryEntry.actorId (who
// actually performed a given action). Assigning/reassigning is a Manager
// action, same top-of-pipeline authority already used for Final Approve —
// this does not add a new permission, it reuses the existing 'manager' role
// check already established by canActAtStage.
// ---------------------------------------------------------------------

export async function assignApprovalStage(id: string, stageKey: ApprovalStageKey, userId: string | undefined, actor: Actor): Promise<Comparison | undefined> {
  if (actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to assign approval stages.`);
  }
  const stage = WORKFLOW_STAGE_BY_KEY[stageKey];
  try {
    if (userId) {
      const { data } = await apiClient.put(`/comparisons/${id}/assignments/${stage}`, { userId }, { headers: actorHeaders(actor.name) });
      return data;
    }
    const { data } = await apiClient.delete(`/comparisons/${id}/assignments/${stage}`, { headers: actorHeaders(actor.name) });
    return data;
  } catch {
    return undefined;
  }
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
export async function getMyPendingWork(userId: string, role: RoleId): Promise<Comparison[]> {
  const stageInfo = PENDING_STAGE_BY_ROLE[role];
  if (!stageInfo) return [];
  return (await readAll()).filter((comparison) => {
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
// (await getApprovalSummary()) for every workflow-stage count rather than
// recomputing them, and reads Products/Artwork through their own services —
// Dashboard.tsx should never need to filter raw records itself.
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const approval = (await getApprovalSummary());
  const artworks = (await getArtworks());
  const pendingComparison = artworks.filter((artwork) => artwork.status === 'Pending Comparison').length;
  const pendingApproval = approval.pendingLabelFinal + approval.pendingTechnical + approval.pendingQA + approval.pendingManagerApproval;

  return {
    totalProducts: (await getProducts()).length,
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
export async function getAllWorkflowHistory(): Promise<RecentActivityItem[]> {
  const items: RecentActivityItem[] = [];
  (await readAll()).forEach((comparison) => {
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

export async function getRecentActivity(limit = 10): Promise<RecentActivityItem[]> {
  return (await getAllWorkflowHistory()).slice(0, limit);
}
