// Comparison repository — a comparison, its 13 per-parameter results, its
// approval assignments and its audit history.
//
// A comparison spans four tables, which shapes everything here:
//
//   - READS assemble them with one query per table and group in memory, never
//     one query per comparison. A list of 200 comparisons costs four queries,
//     not six hundred.
//   - WRITES that touch more than one table run in a transaction. Recording an
//     approval decision changes the comparison's status, appends its history
//     entry and moves the artwork's status; the frontend does those as three
//     independent localStorage writes today, which is exactly how a comparison
//     ends up reading 'Final Approved' over an artwork nobody approved.
//
// The display fields the frontend shows next to a comparison — product name,
// each artwork's version and company — are NOT stored on the comparison row.
// They are joined from products/artworks on read, so a renamed product or a
// corrected version cannot leave a stale copy behind on historical records.

import { Pool, PoolClient } from 'pg';
import { getPool, withTransaction } from '../db/pool';
import { nullToUndefined, numberToVersion, toDateString } from './mappers';
import {
  ApprovalAssignments,
  ArtworkStatus,
  Comparison,
  ComparisonParameterName,
  ComparisonStage,
  ComparisonStatus,
  OverallResult,
  ParameterComparison,
  ParameterResult,
  WorkflowAction,
  WorkflowHistoryEntry,
  WorkflowStage
} from '../types/domain';
import { ConflictError, DomainError } from '../middleware/domainError';

// See masters.repository.ts for why this is declared locally in every
// repository file instead of imported from one shared place.
export type Queryable = Pick<Pool | PoolClient, 'query'>;

async function inTransaction<T>(db: Queryable, fn: (client: Queryable) => Promise<T>): Promise<T> {
  if (db instanceof Pool) return withTransaction(fn);
  return fn(db);
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function pgErrorConstraint(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('constraint' in error)) return '';
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : '';
}

async function nextComparisonId(client: Queryable): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('comparisons_id'))");
  const { rows } = await client.query<{ next_seq: number }>(
    'SELECT coalesce(max(substring(id from 5)::int), 0) + 1 AS next_seq FROM comparisons'
  );
  return `CMP-${String(rows[0].next_seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------

type ComparisonRow = {
  id: string;
  product_id: string;
  product_name: string;
  stage: ComparisonStage;
  new_artwork_id: string;
  new_artwork_version: number;
  new_artwork_company: string;
  reference_artwork_id: string | null;
  reference_artwork_version: number | null;
  reference_artwork_company: string | null;
  overall_similarity: number | null;
  overall_result: OverallResult | null;
  status: ComparisonStatus;
  qa_remarks: string | null;
  compared_by: string;
  compared_at: Date;
  updated_by: string;
  updated_at: Date;
};

// product_name comes from products, and each artwork's version/company from
// that artwork — the join that keeps display data from drifting. LEFT JOIN on
// the reference: a cross-company comparison may legitimately have found no
// candidate, and an INNER JOIN would silently drop those rows from every list.
const COMPARISON_SELECT = `
  SELECT c.id, c.product_id, p.product_name, c.stage,
         c.new_artwork_id, new_art.version_number AS new_artwork_version,
         new_art.marketing_company AS new_artwork_company,
         c.reference_artwork_id, ref_art.version_number AS reference_artwork_version,
         ref_art.marketing_company AS reference_artwork_company,
         c.overall_similarity, c.overall_result, c.status, c.qa_remarks,
         c.compared_by, c.compared_at, c.updated_by, c.updated_at
    FROM comparisons c
    JOIN products p ON p.id = c.product_id
    JOIN artworks new_art ON new_art.id = c.new_artwork_id
    LEFT JOIN artworks ref_art ON ref_art.id = c.reference_artwork_id`;

type ParameterRow = {
  comparison_id: string;
  parameter: ComparisonParameterName;
  reference_value: string | null;
  new_value: string | null;
  result: ParameterResult;
};

type HistoryRow = {
  comparison_id: string;
  stage: WorkflowStage;
  action: WorkflowAction;
  resulting_status: ComparisonStatus;
  approval_user_id: string | null;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  remarks: string;
  occurred_at: Date;
};

type AssignmentRow = {
  comparison_id: string;
  stage: WorkflowStage;
  user_id: string;
};

const STAGE_TO_ASSIGNMENT: Record<WorkflowStage, keyof ApprovalAssignments> = {
  'Label Final': 'labelFinal',
  Technical: 'technical',
  QA: 'qa',
  Manager: 'manager'
};

// ---------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------

function mapParameter(row: ParameterRow): ParameterComparison {
  return {
    parameter: row.parameter,
    // '' is how the API represents a value the label did not yield; the
    // database stores NULL. The pair is never (absent, MATCH) — a CHECK
    // constraint makes that unrepresentable — so a '' here always travels with
    // a MISSING result.
    referenceValue: row.reference_value ?? '',
    newValue: row.new_value ?? '',
    result: row.result
  };
}

function mapHistory(row: HistoryRow): WorkflowHistoryEntry {
  return {
    stage: row.stage,
    action: row.action,
    resultingStatus: row.resulting_status,
    approvalUserId: nullToUndefined(row.approval_user_id),
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    date: toDateString(row.occurred_at),
    remarks: row.remarks
  };
}

function groupBy<Row extends { comparison_id: string }>(rows: Row[]): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const existing = grouped.get(row.comparison_id);
    if (existing) existing.push(row);
    else grouped.set(row.comparison_id, [row]);
  }
  return grouped;
}

/**
 * Loads the parameters, history and assignments for a set of comparisons and
 * assembles the full records.
 *
 * Three queries for any number of comparisons. The alternative — a query per
 * comparison per child table — is the classic N+1, and on the Comparison list
 * page it would be four hundred round trips to render one screen.
 */
async function assemble(rows: ComparisonRow[], db: Queryable): Promise<Comparison[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [parameters, history, assignments] = await Promise.all([
    db.query<ParameterRow>(
      `SELECT comparison_id, parameter, reference_value, new_value, result
         FROM comparison_parameters WHERE comparison_id = ANY($1)`,
      [ids]
    ),
    db.query<HistoryRow>(
      `SELECT comparison_id, stage, action, resulting_status, approval_user_id,
              actor_id, actor_name, actor_role, remarks, occurred_at
         FROM comparison_workflow_history
        WHERE comparison_id = ANY($1)
        ORDER BY occurred_at, id`,
      [ids]
    ),
    db.query<AssignmentRow>(
      `SELECT comparison_id, stage, user_id
         FROM comparison_approval_assignments WHERE comparison_id = ANY($1)`,
      [ids]
    )
  ]);

  const parametersById = groupBy(parameters.rows);
  const historyById = groupBy(history.rows);
  const assignmentsById = groupBy(assignments.rows);

  return rows.map((row) => {
    const approvalAssignments: ApprovalAssignments = {};
    for (const assignment of assignmentsById.get(row.id) ?? []) {
      approvalAssignments[STAGE_TO_ASSIGNMENT[assignment.stage]] = assignment.user_id;
    }

    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      stage: row.stage,
      newArtworkId: row.new_artwork_id,
      newArtworkVersion: numberToVersion(row.new_artwork_version),
      newArtworkCompany: row.new_artwork_company,
      // '' when a cross-company comparison found no candidate — the same
      // absence the database stores as NULL.
      referenceArtworkId: row.reference_artwork_id ?? '',
      referenceArtworkVersion:
        row.reference_artwork_version === null ? '' : numberToVersion(row.reference_artwork_version),
      referenceArtworkCompany: row.reference_artwork_company ?? '',
      parameters: (parametersById.get(row.id) ?? []).map(mapParameter),
      // The aggregates are a cache of what comparison_parameters already says
      // (migration 001). 0 stands for "not yet scored", which only a row
      // written outside this repository can be — createComparison requires both.
      overallSimilarity: row.overall_similarity ?? 0,
      overallResult: row.overall_result ?? 'REVIEW REQUIRED',
      status: row.status,
      qaRemarks: nullToUndefined(row.qa_remarks),
      history: (historyById.get(row.id) ?? []).map(mapHistory),
      approvalAssignments,
      comparedBy: row.compared_by,
      comparisonDate: toDateString(row.compared_at),
      updatedBy: row.updated_by,
      updatedDate: toDateString(row.updated_at)
    };
  });
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

export async function getComparisons(db: Queryable = getPool()): Promise<Comparison[]> {
  const { rows } = await db.query<ComparisonRow>(`${COMPARISON_SELECT} ORDER BY c.id`);
  return assemble(rows, db);
}

export async function getComparisonById(id: string, db: Queryable = getPool()): Promise<Comparison | undefined> {
  const { rows } = await db.query<ComparisonRow>(`${COMPARISON_SELECT} WHERE c.id = $1`, [id]);
  return (await assemble(rows, db))[0];
}

export async function getComparisonsByProduct(productId: string, db: Queryable = getPool()): Promise<Comparison[]> {
  const { rows } = await db.query<ComparisonRow>(
    `${COMPARISON_SELECT} WHERE c.product_id = $1 ORDER BY c.compared_at DESC, c.id DESC`,
    [productId]
  );
  return assemble(rows, db);
}

// The Approvals queue: everything waiting on one stage's reviewer.
export async function getComparisonsByStatus(
  statuses: readonly ComparisonStatus[],
  db: Queryable = getPool()
): Promise<Comparison[]> {
  const { rows } = await db.query<ComparisonRow>(
    `${COMPARISON_SELECT} WHERE c.status = ANY($1) ORDER BY c.updated_at DESC, c.id`,
    [statuses]
  );
  return assemble(rows, db);
}

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

export type ComparisonInput = {
  productId: string;
  stage: ComparisonStage;
  newArtworkId: string;
  /** Absent for a cross-company comparison that found no candidate. */
  referenceArtworkId?: string;
  parameters: ParameterComparison[];
  overallSimilarity: number;
  overallResult: OverallResult;
  status: ComparisonStatus;
};

function translateComparisonError(error: unknown, input: Partial<ComparisonInput>): unknown {
  const code = pgErrorCode(error);
  const constraint = pgErrorConstraint(error);

  if (code === '23503' && constraint.includes('product_id')) {
    return new DomainError(`Product "${input.productId}" does not exist.`);
  }
  if (code === '23503') return new DomainError('The artwork this comparison references does not exist.');
  if (constraint === 'comparisons_same_company_needs_reference') {
    return new DomainError('A same-company comparison needs a reference artwork to compare against.');
  }
  if (constraint === 'comparisons_no_self_comparison') {
    return new DomainError('An artwork cannot be compared against itself.');
  }
  if (constraint === 'comparison_parameters_absent_is_missing') {
    return new DomainError(
      'A parameter was given a result other than MISSING while one side had no value. ' +
        'When either label did not yield a value the only admissible result is MISSING — ' +
        'reporting a match between two unknowns is the defect this constraint exists to prevent.'
    );
  }
  return error;
}

/**
 * Persists a completed comparison and its per-parameter results together.
 *
 * One transaction: a comparison row without its parameters is a scored verdict
 * with nothing behind it, and the aggregate columns are explicitly a cache of
 * the parameter rows rather than the source of truth.
 */
export async function createComparison(
  input: ComparisonInput,
  actor: string,
  db: Queryable = getPool()
): Promise<Comparison> {
  return inTransaction(db, async (client) => {
    const id = await nextComparisonId(client);

    // Only parameters with a value on both sides count as compared. This is
    // the number a similarity score is meaningful against — 92% over 13
    // parameters and 92% over the 4 that could be read are different claims.
    const comparable = input.parameters.filter(
      (parameter) => parameter.referenceValue !== '' && parameter.newValue !== ''
    ).length;

    try {
      await client.query(
        `INSERT INTO comparisons (
           id, product_id, stage, new_artwork_id, reference_artwork_id,
           overall_similarity, overall_result, comparable_parameter_count,
           total_parameter_count, status, compared_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [
          id,
          input.productId,
          input.stage,
          input.newArtworkId,
          input.referenceArtworkId ?? null,
          input.overallSimilarity,
          input.overallResult,
          comparable,
          input.parameters.length,
          input.status,
          actor
        ]
      );

      if (input.parameters.length > 0) {
        const values = input.parameters
          .map((_, index) => {
            const base = index * 5;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
          })
          .join(', ');

        await client.query(
          `INSERT INTO comparison_parameters (comparison_id, parameter, reference_value, new_value, result)
           VALUES ${values}`,
          input.parameters.flatMap((parameter) => [
            id,
            parameter.parameter,
            // '' is absence and absence is NULL — storing '' would satisfy the
            // absent-is-MISSING CHECK while meaning the opposite.
            parameter.referenceValue === '' ? null : parameter.referenceValue,
            parameter.newValue === '' ? null : parameter.newValue,
            parameter.result
          ])
        );
      }
    } catch (error) {
      throw translateComparisonError(error, input);
    }

    const created = await getComparisonById(id, client);
    // Not a DomainError: this is an internal invariant, not something the
    // caller did wrong, so it must surface as a 500 with its detail kept
    // server-side rather than as advice to the user.
    if (!created) throw new Error(`Comparison ${id} could not be read back after insert.`);
    return created;
  });
}

export type WorkflowDecision = {
  stage: WorkflowStage;
  action: WorkflowAction;
  resultingStatus: ComparisonStatus;
  actor: { id: string; name: string; role: string };
  remarks?: string;
  /** The user this decision assigns the next stage to, when it names one. */
  approvalUserId?: string;
  /** The status the compared artwork moves to, when the decision moves it. */
  artworkStatus?: ArtworkStatus;
  /** QA's verification note, recorded on the comparison itself. */
  qaRemarks?: string;
};

/**
 * Records one approval-workflow decision.
 *
 * The three writes this makes are only correct together — the comparison's new
 * status, the history entry that explains it, and the artwork's status. This is
 * the transaction src/db/pool.ts was written for: a status that lands without
 * its history entry is an audit trail with a hole in it, and an artwork left
 * behind its comparison is how 'Final Approved' ends up over an unapproved
 * label.
 *
 * The history entry is append-only, enforced by a trigger — this function can
 * add to the trail and nothing can rewrite it.
 */
export async function recordWorkflowDecision(
  comparisonId: string,
  decision: WorkflowDecision,
  db: Queryable = getPool()
): Promise<Comparison | undefined> {
  return inTransaction(db, async (client) => {
    const { rows } = await client.query<{ new_artwork_id: string }>(
      `UPDATE comparisons
          SET status = $2,
              qa_remarks = coalesce($3, qa_remarks),
              updated_by = $4,
              updated_at = now()
        WHERE id = $1
        RETURNING new_artwork_id`,
      [comparisonId, decision.resultingStatus, decision.qaRemarks ?? null, decision.actor.name]
    );
    if (rows.length === 0) return undefined;

    await client.query(
      `INSERT INTO comparison_workflow_history
         (comparison_id, stage, action, resulting_status, approval_user_id,
          actor_id, actor_name, actor_role, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        comparisonId,
        decision.stage,
        decision.action,
        decision.resultingStatus,
        decision.approvalUserId ?? null,
        decision.actor.id,
        decision.actor.name,
        decision.actor.role,
        decision.remarks ?? ''
      ]
    );

    if (decision.artworkStatus) {
      await client.query(
        'UPDATE artworks SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1',
        [rows[0].new_artwork_id, decision.artworkStatus, decision.actor.name]
      );
    }

    return getComparisonById(comparisonId, client);
  });
}

/**
 * Assigns (or reassigns) the reviewer for one approval stage.
 *
 * One row per (comparison, stage), so assigning again replaces the previous
 * reviewer rather than accumulating them — a stage has exactly one owner.
 */
export async function assignApprovalStage(
  comparisonId: string,
  stage: WorkflowStage,
  userId: string,
  assignedBy: string,
  db: Queryable = getPool()
): Promise<Comparison | undefined> {
  try {
    const { rowCount } = await db.query(
      `INSERT INTO comparison_approval_assignments (comparison_id, stage, user_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (comparison_id, stage)
       DO UPDATE SET user_id = excluded.user_id, assigned_by = excluded.assigned_by, assigned_at = now()`,
      [comparisonId, stage, userId, assignedBy]
    );
    if (rowCount === 0) return undefined;
  } catch (error) {
    if (pgErrorCode(error) === '23503') {
      const constraint = pgErrorConstraint(error);
      if (constraint.includes('user_id')) return Promise.reject(new DomainError(`User "${userId}" does not exist.`));
      return Promise.reject(new DomainError(`Comparison "${comparisonId}" does not exist.`));
    }
    throw error;
  }

  return getComparisonById(comparisonId, db);
}
