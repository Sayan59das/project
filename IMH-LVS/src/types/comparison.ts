// Label Comparison data model.
//
// A Comparison links a NEW artwork to a REFERENCE artwork (by id, not by
// duplicating Product/Artwork/Master data) and stores the parameter-by-
// parameter result produced by the comparison engine.
//
// Two independent stages (never mixed into one record):
//   - 'same_company'  — new artwork vs. the latest approved artwork for the
//                        SAME product + SAME marketing company.
//   - 'cross_company'  — a finalized label vs. another marketing company's
//                        artwork for the same product.

export type ParameterResult = 'MATCH' | 'SIMILAR' | 'CONFLICT';

// Fixed set of label parameters this stage compares. Batch Number is
// deliberately excluded — see comparisonService.ts for why.
export const COMPARISON_PARAMETERS = [
  'Brand Name',
  'Product Name',
  'Address',
  'Customer Care Number',
  'Customer Care Email',
  'Colour Theme',
  'Flavour',
  'Claims',
  'Logo',
  'Label Design / Layout',
  'Nutrition Table Format',
  'FSSAI Number',
  'Ingredients'
] as const;

export type ComparisonParameterName = (typeof COMPARISON_PARAMETERS)[number];

export type ParameterComparison = {
  parameter: ComparisonParameterName;
  referenceValue: string;
  newValue: string;
  result: ParameterResult;
};

export type ComparisonStage = 'same_company' | 'cross_company';

// Workflow: Completed (engine ran) -> Pending Label Final -> Pending Technical
// -> Pending QA -> Pending Manager Approval -> Final Approved.
// 'Label Final Approved' / 'Technical Approved' / 'QA Approved' are not
// resting states a queue polls on — a comparison moves straight through them
// into the next 'Pending X' status. They exist so each stage's decision has
// its own distinct name in the audit history (see WorkflowHistoryEntry)
// instead of every stage recording a generic 'Approved'. Revision/rejection
// from any stage always lands on 'Revision Required' (or 'Rejected' for the
// Manager's reject action) and never silently overwrites the status history.
export type ComparisonStatus =
  | 'Draft'
  | 'In Progress'
  | 'Completed'
  | 'Pending Label Final'
  | 'Label Final Approved'
  | 'Pending Technical'
  | 'Technical Approved'
  | 'Pending QA'
  | 'QA Approved'
  | 'Pending Manager Approval'
  | 'Final Approved'
  | 'Revision Required'
  | 'Rejected';

export const COMPARISON_STATUS_OPTIONS: ComparisonStatus[] = [
  'Draft',
  'In Progress',
  'Completed',
  'Pending Label Final',
  'Label Final Approved',
  'Pending Technical',
  'Technical Approved',
  'Pending QA',
  'QA Approved',
  'Pending Manager Approval',
  'Final Approved',
  'Revision Required',
  'Rejected'
];

// One stage of the Label Final -> Technical -> QA -> Manager pipeline. Kept
// distinct from ComparisonStage ('same_company'/'cross_company', the
// reference-selection stage) — same English word, two unrelated concepts.
export type WorkflowStage = 'Label Final' | 'Technical' | 'QA' | 'Manager';

export type WorkflowAction =
  | 'Sent to Technical'
  | 'Sent to QA'
  | 'Sent to Manager'
  | 'Final Approved'
  | 'Rejected'
  | 'Revision Requested';

// The stage-key form of WorkflowStage ('Label Final' -> 'labelFinal', etc.),
// used wherever a compact object key is needed (ApprovalAssignments,
// service-layer stage lookups) instead of the display-friendly WorkflowStage.
export type ApprovalStageKey = 'labelFinal' | 'technical' | 'qa' | 'manager';

// Who is RESPONSIBLE for each stage — a User ID (see data/usersStore.ts),
// never a duplicated user object. Distinct from both RBAC (which decides
// what a role is allowed to do) and WorkflowHistoryEntry.actorId (who
// actually performed a given action, which may be a Manager override acting
// on someone else's assigned stage). Unassigned stages are simply absent —
// existing/legacy comparisons created before this feature have none of these
// set, and every stage remains open to any user with the matching role.
export type ApprovalAssignments = {
  labelFinal?: string;
  technical?: string;
  qa?: string;
  manager?: string;
};

// One append-only audit entry per stage decision. Never edited or removed —
// a revision or rejection adds a new entry, it does not replace an old one.
export type WorkflowHistoryEntry = {
  stage: WorkflowStage;
  action: WorkflowAction;
  resultingStatus: ComparisonStatus;
  // The User ID assigned as responsible for this stage at the moment this
  // decision was recorded (ApprovalAssignments snapshot) — undefined if the
  // stage was unassigned. NOT necessarily the same person as actorId below:
  // an authorized Manager override, for example, still records the actual
  // actor here while this field keeps the original assignment untouched.
  approvalUserId?: string;
  // The user who actually performed this action.
  actorId: string;
  actorName: string;
  actorRole: string;
  date: string;
  remarks: string;
};

// Parameter-level result rolled up into one overall call — independent of
// workflow `status` (see comparisonService.generateComparisonResult).
export type OverallResult = 'MATCH' | 'REVIEW REQUIRED' | 'CONFLICT';

export type Comparison = {
  id: string; // CMP-0001
  productId: string;
  productName: string;
  stage: ComparisonStage;

  newArtworkId: string;
  newArtworkVersion: string;
  newArtworkCompany: string;

  referenceArtworkId: string;
  referenceArtworkVersion: string;
  referenceArtworkCompany: string;

  parameters: ParameterComparison[];
  overallSimilarity: number; // 0-100
  overallResult: OverallResult;
  status: ComparisonStatus;

  // Remarks recorded during QA/Technical/Label Final review — set when the
  // comparison is verified or rejected from the QA Verification queue.
  qaRemarks?: string;

  // Append-only cross-stage audit trail — Label Final, Technical, QA and
  // Manager decisions each add one entry here and never overwrite a prior
  // one. Drives the Approvals page's Workflow History section.
  history: WorkflowHistoryEntry[];

  // Which specific user is responsible for each stage (User IDs, not role
  // names) — see ApprovalAssignments above. Manager assigns/reassigns these;
  // RBAC still separately governs who is ALLOWED to act on a given stage.
  approvalAssignments: ApprovalAssignments;

  comparedBy: string;
  comparisonDate: string;
  updatedBy: string;
  updatedDate: string;
};

// Structured attributes behind each artwork's label content. Today these
// are hand-authored mock records (data/comparisons.ts) standing in for what
// a future OCR/text-extraction step would produce from the actual file —
// see comparisonService.ts for the swap-out point.
export type LabelAttributes = {
  artworkId: string;
  brandName: string;
  productName: string;
  address: string;
  customerCareNumber: string;
  customerCareEmail: string;
  colourTheme: string;
  flavour: string;
  claims: string;
  logo: string;
  labelDesign: string;
  nutritionTableFormat: string;
  fssaiNumber: string;
  ingredients: string;
};

export type CrossCompanyCandidate = {
  productId: string;
  productName: string;
  marketingCompany: string;
  artworkId: string;
  artworkVersion: string;
};
