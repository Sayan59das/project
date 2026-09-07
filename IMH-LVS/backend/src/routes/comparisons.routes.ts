// Comparisons and the Label Final -> Technical -> QA -> Manager workflow.
//
// There is no PATCH for a comparison's status. Status only ever changes as part
// of a decision somebody made, and a decision is a status AND an audit entry
// AND the artwork moving with it — recordWorkflowDecision writes all three in
// one transaction. A general-purpose status PATCH would be a way to change the
// first without the other two, which is precisely the defect the transaction
// exists to prevent.

import { Router } from 'express';
import {
  assignApprovalStage,
  createComparison,
  getComparisonById,
  getComparisons,
  getComparisonsByStatus,
  recordWorkflowDecision,
  submitComparisonForReview,
  unassignApprovalStage,
  type ComparisonInput,
  type WorkflowDecision
} from '../repositories/comparison.repository';
import { asyncHandler, orNotFound, requireActor, requireString, requireWorkflowActor, sendData } from '../controllers/http';
import { DomainError, ForbiddenError } from '../middleware/domainError';
import { requireRole } from '../middleware/auth.middleware';
import { ComparisonStatus, WorkflowStage } from '../types/domain';

const router = Router();

/**
 * Every comparison, or the approvals queue for one or more statuses.
 *
 * `?status=Pending%20QA&status=Pending%20Technical` is what each reviewer's
 * Approvals page asks for. Filtering in the query rather than in the client
 * matters here: the queue is the one screen that would otherwise pull every
 * comparison in the system to show a handful.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    const statuses = typeof status === 'string' ? [status] : Array.isArray(status) ? status.map(String) : [];

    if (statuses.length > 0) {
      sendData(res, await getComparisonsByStatus(statuses as ComparisonStatus[]));
      return;
    }
    sendData(res, await getComparisons());
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    sendData(res, orNotFound(await getComparisonById(req.params.id), `Comparison "${req.params.id}"`));
  })
);

/**
 * Persists a completed comparison and its per-parameter results.
 *
 * The scoring itself is not done here — the comparison engine produces the
 * parameters and the aggregates, and this stores what it decided. Recomputing
 * them server-side would be a second implementation of the rule, and the two
 * disagreeing is worse than either being wrong on its own.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    requireString(req.body, 'productId');
    requireString(req.body, 'newArtworkId');
    sendData(res, await createComparison(req.body as ComparisonInput, requireActor(req)), 201);
  })
);

/**
 * Hands a completed comparison off to the Label Final queue — the Account
 * Manager's own entry point into the pipeline, not a decision at one of its
 * four gated stages, so it is its own endpoint rather than a /decisions call.
 *
 * Guarded with requireRole() rather than in the handler, unlike the stage rule
 * below: the role allowed here is fixed by the path, not read out of the body,
 * so there is nothing to decide at request time. Submitting is what starts the
 * approval chain, and letting any signed-in user start one would put work into
 * a reviewer's queue that no Account Manager ever accepted.
 */
router.post(
  '/:id/submit',
  requireRole('account_manager'),
  asyncHandler(async (req, res) => {
    const updated = await submitComparisonForReview(req.params.id, requireActor(req));
    sendData(res, orNotFound(updated, `Comparison "${req.params.id}"`));
  })
);

/**
 * Records one approval decision: status, audit entry and artwork status
 * together, in one transaction.
 *
 * The actor is the full identity (id, name, role) because the history row names
 * all three — an audit trail that records only a display name cannot survive
 * two reviewers with the same name, and cannot be joined back to the user.
 */
router.post(
  '/:id/decisions',
  asyncHandler(async (req, res) => {
    const body = req.body as Omit<WorkflowDecision, 'actor'>;
    const stage = requireString(req.body, 'stage') as WorkflowStage;
    requireString(req.body, 'action');
    requireString(req.body, 'resultingStatus');

    const actor = requireWorkflowActor(req);
    requireStageRole(stage, actor.role);

    const updated = await recordWorkflowDecision(req.params.id, { ...body, actor });
    sendData(res, orNotFound(updated, `Comparison "${req.params.id}"`));
  })
);

/**
 * Each stage of the chain is taken by exactly one role.
 *
 * This is the one authorisation rule the backend owns outright, and it is
 * enforced here rather than in a requireRole() on the route because the
 * allowed role depends on the stage in the BODY, not on the path.
 *
 * It is not a duplicate of the frontend's permission model. src/auth/
 * permissions.ts decides which pages a person is shown; this decides who may
 * sign a step of an approval chain, which is a claim the audit trail makes
 * about a regulated process. A rule enforced only in the UI is a rule that
 * holds until somebody calls the API directly — and before 004_auth.sql, when
 * the role arrived in a header the server believed, there was nothing here to
 * enforce it against anyway.
 *
 * A Manager is NOT given a blanket override. Approving on someone else's
 * behalf and recording it as your own decision is exactly the confusion the
 * chain exists to prevent; if a Manager needs to act for an absent reviewer,
 * that is a reassignment (PUT /assignments/:stage), which leaves a trail
 * saying so.
 */
const ROLE_FOR_STAGE: Record<WorkflowStage, string> = {
  'Label Final': 'label_final',
  Technical: 'technical',
  QA: 'qa',
  Manager: 'manager'
};

function requireStageRole(stage: WorkflowStage, role: string): void {
  const required = ROLE_FOR_STAGE[stage];
  if (!required) {
    throw new DomainError(
      `Unknown workflow stage "${stage}". Valid stages are ${Object.keys(ROLE_FOR_STAGE).join(', ')}.`
    );
  }
  if (role !== required) {
    throw new ForbiddenError(
      `The ${stage} stage is decided by the ${required} role. You are signed in as ${role}.`
    );
  }
}

// One reviewer per stage: assigning again replaces the previous one rather
// than accumulating, so PUT rather than POST.
router.put(
  '/:id/assignments/:stage',
  asyncHandler(async (req, res) => {
    const userId = requireString(req.body, 'userId');
    const updated = await assignApprovalStage(
      req.params.id,
      req.params.stage as WorkflowStage,
      userId,
      requireActor(req)
    );
    sendData(res, orNotFound(updated, `Comparison "${req.params.id}"`));
  })
);

// Clears a stage's assignment back to "unassigned" — the symmetric complement
// to the PUT above, not a general-purpose stage edit.
router.delete(
  '/:id/assignments/:stage',
  asyncHandler(async (req, res) => {
    const updated = await unassignApprovalStage(req.params.id, req.params.stage as WorkflowStage);
    sendData(res, orNotFound(updated, `Comparison "${req.params.id}"`));
  })
);

export default router;
