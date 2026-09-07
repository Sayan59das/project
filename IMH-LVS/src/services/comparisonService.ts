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
  WorkflowStage
} from '../types/comparison';
import { SEED_LABEL_ATTRIBUTES } from '../data/comparisons';
import { apiRequest, findOne } from './apiClient';
import {
  getArtworks,
  getArtworksByProduct,
  getLatestApprovedArtwork as getLatestApprovedArtworkFromArtworkService
} from './artworkService';
import { getProducts } from './productService';

// The acting user for every approval-stage decision — id/name for the audit
// trail, role for the service-layer permission check (see canActAtStage).
// UI button visibility is a courtesy; this is the actual gate.
export type Actor = { id: string; name: string; role: RoleId };

const SIMILAR_THRESHOLD = 0.6;
const MATCH_SCORE = 100;
const SIMILAR_SCORE = 65;
const CONFLICT_SCORE = 0;

// ---------------------------------------------------------------------
// Label attributes (structured "extracted" label content)
// ---------------------------------------------------------------------

/**
 * Records what was read off an artwork, against that artwork.
 *
 * Stored server-side now (one row per artwork, replacing any previous
 * reading), so the comparison engine reads the values the uploader verified
 * even when the comparison is run by somebody else on another machine — which
 * is the entire reason this stopped being a localStorage key.
 *
 * `source: 'manual'` because these values reached us through a human who
 * confirmed them on the upload form. An OCR engine's own output is recorded by
 * the extractor with source 'ocr', and a reviewer needs to be able to tell the
 * two apart.
 */
export function saveLabelAttributes(attributes: LabelAttributes): Promise<unknown> {
  const { artworkId, ...values } = attributes;
  return apiRequest(`/artworks/${encodeURIComponent(artworkId)}/label-attributes`, {
    method: 'PUT',
    body: { values, source: 'manual' }
  });
}

/**
 * The artwork's structured label content, without asking the server.
 *
 * Hand-authored seed data first, then a record synthesized from the Product and
 * Artwork fields for artworks that have neither. This is the fallback half of
 * getLabelAttributes below, split out because it is pure: it is what the engine
 * gets for an artwork nobody has ever read, and the regression tests for that
 * case should not need a backend to ask.
 *
 * Fields that cannot be resolved are EMPTY STRINGS, not a placeholder like
 * 'Not specified'. That distinction is load-bearing: a placeholder is just
 * another string to the classifier, so two artworks that had never been read
 * compared equal on it and the engine reported a 100% MATCH across parameters
 * it had never actually seen. An empty value is recognised by
 * classifyParameterValues() as MISSING instead. Render MISSING_VALUE_DISPLAY in
 * the UI where a blank would look broken.
 */
export function buildLabelAttributes(artwork: Artwork, product?: Product): LabelAttributes {
  const seeded = SEED_LABEL_ATTRIBUTES.find((attributes) => attributes.artworkId === artwork.id);
  if (seeded) return seeded;

  return {
    artworkId: artwork.id,
    brandName: artwork.brand,
    productName: artwork.productName,
    address: '',
    customerCareNumber: '',
    customerCareEmail: '',
    colourTheme: '',
    flavour: product?.flavour ?? '',
    claims: '',
    logo: '',
    labelDesign: '',
    nutritionTableFormat: '',
    fssaiNumber: product?.fssaiNumber ?? '',
    ingredients: ''
  };
}

/**
 * The artwork's structured label content: what was actually recorded for it,
 * and only failing that the seeded or synthesized fallback above.
 *
 * A stored reading that exists but is empty is NOT the same as never having
 * been read, and the API preserves that distinction by answering null for the
 * second case. Falling back on null rather than on "no fields" is what keeps
 * an unread artwork reporting MISSING instead of comparing equal to another
 * unread one.
 */
export async function getLabelAttributes(artwork: Artwork, product?: Product): Promise<LabelAttributes> {
  const stored = await apiRequest<LabelAttributes | null>(
    `/artworks/${encodeURIComponent(artwork.id)}/label-attributes`
  );
  return stored ?? buildLabelAttributes(artwork, product);
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
//
// The MISSING check must stay FIRST. Two absent values are equal as strings,
// so an equality test that runs before it reports "both unknown" as a MATCH.
function classifyParameterValues(referenceValue: string, newValue: string): ParameterResult {
  const normalizedReference = referenceValue.trim().toLowerCase();
  const normalizedNew = newValue.trim().toLowerCase();

  // Either side absent: there is nothing to compare. Not agreement, and not
  // a conflict — a label that hasn't been read yet must not generate
  // findings against one that has.
  if (!normalizedReference || !normalizedNew) return 'MISSING';

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
// point value by its result, averaged across the parameters that could
// actually be compared.
//
// MISSING parameters are excluded from the average rather than scored as
// zero. Scoring them as zero would punish a label for data nobody has
// captured yet; counting them as matches would inflate the score. Neither
// is a measurement, so they leave the ratio alone — but note the score is
// then only as meaningful as its coverage, which is why
// countComparableParameters() exists for the UI to report alongside it.
export function calculateSimilarity(parameters: ParameterComparison[]): number {
  const comparable = parameters.filter((param) => param.result !== 'MISSING');
  if (comparable.length === 0) return 0;
  const total = comparable.reduce((sum, param) => {
    if (param.result === 'MATCH') return sum + MATCH_SCORE;
    if (param.result === 'SIMILAR') return sum + SIMILAR_SCORE;
    return sum + CONFLICT_SCORE;
  }, 0);
  return Math.round(total / comparable.length);
}

// How many parameters carried enough data to compare, out of how many were
// attempted. A similarity percentage is misleading without this — 100%
// across two comparable parameters is not the same claim as 100% across
// thirteen.
export function countComparableParameters(parameters: ParameterComparison[]): { comparable: number; total: number } {
  return {
    comparable: parameters.filter((param) => param.result !== 'MISSING').length,
    total: parameters.length
  };
}

// CONFLICT if any parameter conflicts. Otherwise MATCH is reserved for the
// case where every parameter was compared AND every one agreed exactly —
// anything less is REVIEW REQUIRED, because a clean-looking result built on
// parameters nobody could read is exactly the outcome a compliance reviewer
// must not be allowed to rubber-stamp.
export function generateComparisonResult(parameters: ParameterComparison[]): OverallResult {
  if (parameters.some((param) => param.result === 'CONFLICT')) return 'CONFLICT';
  if (parameters.some((param) => param.result === 'SIMILAR')) return 'REVIEW REQUIRED';
  if (parameters.some((param) => param.result === 'MISSING')) return 'REVIEW REQUIRED';
  if (parameters.length === 0) return 'REVIEW REQUIRED';
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
export async function findBestMatch(
  newArtwork: Artwork,
  candidates: Artwork[],
  productLookup?: Product
): Promise<{ artwork: Artwork; similarity: number; parameters: ParameterComparison[] } | undefined> {
  if (candidates.length === 0) return undefined;

  // One read per artwork, all at once: each is an independent request and the
  // candidate list is a handful of labels, so waiting for them in sequence
  // would make the best-match search take as long as the sum of them.
  const [newAttributes, ...candidateAttributes] = await Promise.all([
    getLabelAttributes(newArtwork, productLookup),
    ...candidates.map((candidate) => getLabelAttributes(candidate, productLookup))
  ]);

  const scored = candidates.map((candidate, index) => {
    const parameters = compareParameters(candidateAttributes[index], newAttributes);
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
export async function getCrossCompanyCandidates(productId: string): Promise<CrossCompanyCandidate[]> {
  const products = await getProducts();
  const sourceProduct = products.find((product) => product.id === productId);
  if (!sourceProduct) return [];

  const otherProducts = products.filter(
    (product) =>
      product.id !== productId &&
      product.marketingCompany !== sourceProduct.marketingCompany &&
      product.productName.trim().toLowerCase() === sourceProduct.productName.trim().toLowerCase()
  );

  // One baseline lookup per candidate product, in parallel: each is a separate
  // query and they do not depend on each other. A product with no approved Full
  // Label simply is not a candidate.
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

export function getComparisons(): Promise<Comparison[]> {
  return apiRequest<Comparison[]>('/comparisons');
}

/**
 * One or more statuses — what each reviewer's queue asks for.
 *
 * Filtered in the query rather than by pulling every comparison and filtering
 * here: the approvals queue is the one screen that would otherwise fetch the
 * whole table to show a handful of rows.
 */
export function getComparisonsByStatus(statuses: ComparisonStatus[]): Promise<Comparison[]> {
  return apiRequest<Comparison[]>('/comparisons', { query: { status: statuses } });
}

export function getComparisonById(id: string): Promise<Comparison | undefined> {
  return findOne(apiRequest<Comparison>(`/comparisons/${encodeURIComponent(id)}`));
}

export function getComparisonsByProduct(productId: string): Promise<Comparison[]> {
  return apiRequest<Comparison[]>(`/products/${encodeURIComponent(productId)}/comparisons`);
}

export type CreateComparisonInput = {
  productId: string;
  productName: string;
  stage: ComparisonStage;
  newArtwork: Artwork;
  referenceArtwork: Artwork;
};

/**
 * Runs the engine against the two artworks and stores the result.
 *
 * THE SCORING STAYS ON THE CLIENT and the server stores what it decided. That
 * is the API's own position (see the POST /comparisons comment): recomputing
 * the parameters server-side would be a second implementation of the same
 * rule, and two implementations disagreeing about whether a label matches is
 * worse than either being wrong alone.
 *
 * Only the identifiers and the verdict are sent — product name, artwork
 * versions and companies are columns the server joins for itself, so a client
 * cannot record a comparison that names one artwork and describes another.
 */
export async function createComparison(input: CreateComparisonInput, productLookup?: Product): Promise<Comparison> {
  const referenceAttributes = await getLabelAttributes(input.referenceArtwork, productLookup);
  const newAttributes = await getLabelAttributes(input.newArtwork, productLookup);
  const parameters = compareParameters(referenceAttributes, newAttributes);

  return apiRequest<Comparison>('/comparisons', {
    method: 'POST',
    body: {
      productId: input.productId,
      stage: input.stage,
      newArtworkId: input.newArtwork.id,
      referenceArtworkId: input.referenceArtwork.id,
      parameters,
      overallSimilarity: calculateSimilarity(parameters),
      overallResult: generateComparisonResult(parameters),
      status: 'Completed'
    }
  });
}

// Hands a completed comparison off to the Label Final queue — the entry
// point into the Label Final -> Technical -> QA -> Manager pipeline. Not one
// of the four gated approval stages itself (it's the Account Manager's own
// action, not a stage reviewer's), so it isn't routed through
// canActAtStage/transitionComparison — but it still independently validates
// the actor's role rather than trusting that the UI already hid the button.
export function sendComparisonForReview(id: string, actor: Actor): Promise<Comparison | undefined> {
  // Kept as a fast local check so the UI can explain itself immediately. The
  // rule that actually holds is the API's requireRole('account_manager') on
  // this route: a check only in the client is a check that lasts until somebody
  // calls the endpoint directly.
  if (actor.role !== 'account_manager' && actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to submit a comparison for review.`);
  }

  return findOne(apiRequest<Comparison>(`/comparisons/${encodeURIComponent(id)}/submit`, { method: 'POST' }));
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
  // Local check first, for an immediate and specific message. The server
  // enforces the same rule from the session and is stricter about it: it gives
  // a Manager no override at any stage, because approving on somebody else's
  // behalf and recording it as your own decision is the confusion the chain
  // exists to prevent. A Manager acting for an absent reviewer is a
  // reassignment, which leaves a trail saying so.
  if (!canActAtStage(actor, stageRole)) {
    throw new Error(`Role "${actor.role}" is not authorized to record a ${stage} decision.`);
  }

  // Who was assigned to this stage at the moment of the decision — read from
  // the server's copy rather than a list this tab loaded earlier, because a
  // reassignment made elsewhere must be what the audit entry records.
  const current = await getComparisonById(id);
  if (!current) return undefined;

  return findOne(
    apiRequest<Comparison>(`/comparisons/${encodeURIComponent(id)}/decisions`, {
      method: 'POST',
      body: {
        stage,
        action,
        resultingStatus,
        remarks,
        qaRemarks: remarks,
        approvalUserId: current.approvalAssignments[STAGE_KEY_BY_WORKFLOW_STAGE[stage]],
        // The artwork moves in the SAME TRANSACTION as the status change and
        // the history row. It used to be a separate write that could fail on
        // its own, leaving an approved comparison whose artwork still said
        // Under Review.
        artworkStatus
      }
    })
  );
}

// The four queues, as SELECTORS over a list the screen already holds. The
// Approvals page loads the statuses it is allowed to see in one request (see
// getComparisonsByStatus) and splits them here, rather than making one request
// per queue for rows it has already fetched.
export function selectLabelFinalQueue(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((comparison) => comparison.status === 'Pending Label Final');
}

export function selectTechnicalQueue(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((comparison) => comparison.status === 'Pending Technical');
}

export function selectManagerApprovalQueue(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((comparison) => comparison.status === 'Pending Manager Approval');
}

// Label Final is the first review stage after a comparison is submitted.
// Approve moves it to Technical; it never sets Final Approved.
export function submitLabelFinalDecision(
  id: string,
  action: 'approve' | 'revision',
  remarks: string,
  actor: Actor
): Promise<Comparison | undefined> {
  if (action === 'approve') {
    return transitionComparison(id, actor, 'label_final', 'Label Final', 'Pending Technical', 'Sent to Technical', remarks);
  }
  return transitionComparison(id, actor, 'label_final', 'Label Final', 'Revision Required', 'Revision Requested', remarks, 'Revision Required');
}

// Technical receives Label Final's remarks plus full context. Approve moves
// it to QA; it never sets Final Approved.
export function submitTechnicalDecision(
  id: string,
  action: 'approve' | 'revision',
  remarks: string,
  actor: Actor
): Promise<Comparison | undefined> {
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

export function selectQAQueue(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((comparison) => comparison.status === 'Pending QA');
}

export function qaVerifyComparison(id: string, remarks: string, actor: Actor): Promise<Comparison | undefined> {
  return transitionComparison(id, actor, 'qa', 'QA', 'Pending Manager Approval', 'Sent to Manager', remarks);
}

export function qaRejectComparison(id: string, remarks: string, actor: Actor): Promise<Comparison | undefined> {
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
): Promise<Comparison | undefined> {
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

export function getApprovalSummary(comparisons: Comparison[]): ApprovalSummary {
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
  return (await getArtworksByProduct(productId)).filter((artwork) => artwork.marketingCompany === marketingCompany);
}

// Comparisons the engine has run against but that Account Manager hasn't
// sent into the pipeline yet (see sendComparisonForReview). This is that
// role's own "pending work" queue on the Dashboard/Approvals side of things.
export function selectUnsubmittedComparisons(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((comparison) => comparison.status === 'Completed');
}

// ---------------------------------------------------------------------
// Approval assignment — WHO is responsible for a stage, distinct from
// RBAC (WHAT a role may do) and from WorkflowHistoryEntry.actorId (who
// actually performed a given action). Assigning/reassigning is a Manager
// action, same top-of-pipeline authority already used for Final Approve —
// this does not add a new permission, it reuses the existing 'manager' role
// check already established by canActAtStage.
// ---------------------------------------------------------------------

const WORKFLOW_STAGE_BY_KEY: Record<ApprovalStageKey, WorkflowStage> = {
  labelFinal: 'Label Final',
  technical: 'Technical',
  qa: 'QA',
  manager: 'Manager'
};

export function assignApprovalStage(
  id: string,
  stageKey: ApprovalStageKey,
  userId: string | undefined,
  actor: Actor
): Promise<Comparison | undefined> {
  if (actor.role !== 'manager') {
    throw new Error(`Role "${actor.role}" is not authorized to assign approval stages.`);
  }

  const stage = encodeURIComponent(WORKFLOW_STAGE_BY_KEY[stageKey]);
  const path = `/comparisons/${encodeURIComponent(id)}/assignments/${stage}`;

  // Clearing an assignment is a DELETE, not a PUT of undefined: "nobody is
  // assigned" is the absence of a row, and sending an empty userId would ask
  // the server to assign the user whose id is ''.
  return userId
    ? findOne(apiRequest<Comparison>(path, { method: 'PUT', body: { userId } }))
    : findOne(apiRequest<Comparison>(path, { method: 'DELETE' }));
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
export function selectMyPendingWork(comparisons: Comparison[], userId: string, role: RoleId): Comparison[] {
  const stageInfo = PENDING_STAGE_BY_ROLE[role];
  if (!stageInfo) return [];
  return comparisons.filter((comparison) => {
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
export async function getDashboardSummary(): Promise<DashboardSummary> {
  // Three independent reads, in parallel: none of them depends on another, and
  // running them in sequence made the dashboard wait for the sum of three round
  // trips to show a row of counts.
  const [comparisons, artworks, products] = await Promise.all([getComparisons(), getArtworks(), getProducts()]);
  const approval = getApprovalSummary(comparisons);
  const pendingComparison = artworks.filter((artwork) => artwork.status === 'Pending Comparison').length;
  const pendingApproval = approval.pendingLabelFinal + approval.pendingTechnical + approval.pendingQA + approval.pendingManagerApproval;

  return {
    totalProducts: products.length,
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
export function selectAllWorkflowHistory(comparisons: Comparison[]): RecentActivityItem[] {
  const items: RecentActivityItem[] = [];
  comparisons.forEach((comparison) => {
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

export function selectRecentActivity(comparisons: Comparison[], limit = 10): RecentActivityItem[] {
  return selectAllWorkflowHistory(comparisons).slice(0, limit);
}
