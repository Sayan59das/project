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
 */
router.post(
  '/:id/submit',
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
    requireString(req.body, 'stage');
    requireString(req.body, 'action');
    requireString(req.body, 'resultingStatus');

    const updated = await recordWorkflowDecision(req.params.id, {
      ...body,
      actor: requireWorkflowActor(req)
    });
    sendData(res, orNotFound(updated, `Comparison "${req.params.id}"`));
  })
);

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
