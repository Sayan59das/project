import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { MdArrowBack } from 'react-icons/md';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { ArtworkPreview } from '../components/ArtworkPreview';
import { useAuth } from '../auth/AuthContext';
import { RoleId } from '../auth/permissions';
import { AppUser } from '../types/user';
import { useUserDirectory } from '../hooks/useUserDirectory';
import {
  Actor,
  assignApprovalStage,
  getApprovalSummary,
  getArtworkVersionsForSelection,
  getComparisons,
  submitLabelFinalDecision,
  submitManagerDecision,
  submitTechnicalDecision
} from '../services/comparisonService';
import { ApprovalStageKey, Comparison, ComparisonStatus, MISSING_VALUE_DISPLAY } from '../types/comparison';
import { formatDateTime } from '../utils/dateFormat';

// The four approval stages, in pipeline order â€” reused for both the
// assignment panel (Manager-only editing) and for resolving a comparison's
// CURRENT stage's Approval User ID for display. `label` names the stage
// itself (matches WorkflowStage/status wording elsewhere in the app);
// `teamLabel` is the official business role from the responsibility matrix
// and is what gets shown wherever we're naming WHO is responsible â€” never
// an invented title like "QA Approver".
const APPROVAL_STAGES: { key: ApprovalStageKey; label: string; teamLabel: string; role: RoleId }[] = [
  { key: 'labelFinal', label: 'Label Final', teamLabel: 'Label Final Team', role: 'label_final' },
  { key: 'technical', label: 'Technical', teamLabel: 'Technical Team', role: 'technical' },
  { key: 'qa', label: 'QA', teamLabel: 'QA Team', role: 'qa' },
  { key: 'manager', label: 'Manager', teamLabel: 'Manager', role: 'manager' }
];

const STAGE_KEY_BY_STATUS: Partial<Record<ComparisonStatus, ApprovalStageKey>> = {
  'Pending Label Final': 'labelFinal',
  'Pending Technical': 'technical',
  'Pending QA': 'qa',
  'Pending Manager Approval': 'manager'
};

// The Approval User ID responsible for a comparison's CURRENT stage, for
// the queue table's "Approval User ID" column â€” blank when the status has
// no pending stage (e.g. Final Approved), "Unassigned" when it does but no
// one has been assigned yet.
function assignedUserLabel(comparison: Comparison): string {
  const stageKey = STAGE_KEY_BY_STATUS[comparison.status];
  if (!stageKey) return 'â€”';
  return comparison.approvalAssignments[stageKey] ?? 'Unassigned';
}

// Which pipeline stage a comparison's current status belongs to â€” drives the
// "Current Stage" column and, together with the viewer's role, which action
// buttons the detail view shows.
function currentStageLabel(status: ComparisonStatus): string {
  switch (status) {
    case 'Pending Label Final':
      return 'Label Final';
    case 'Pending Technical':
      return 'Technical';
    case 'Pending QA':
      return 'QA';
    case 'Pending Manager Approval':
      return 'Manager';
    case 'Final Approved':
      return 'Completed';
    case 'Revision Required':
      return 'Revision';
    case 'Rejected':
      return 'Rejected';
    default:
      return 'Comparison';
  }
}

const summaryCardOrder: Array<{ key: keyof ReturnType<typeof getApprovalSummary>; label: string }> = [
  { key: 'pendingLabelFinal', label: 'Pending Label Final' },
  { key: 'pendingTechnical', label: 'Pending Technical' },
  { key: 'pendingQA', label: 'Pending QA' },
  { key: 'pendingManagerApproval', label: 'Pending Manager Approval' },
  { key: 'finalApproved', label: 'Final Approved' },
  { key: 'revisionRequired', label: 'Revision Required' },
  { key: 'rejected', label: 'Rejected' }
];

export function ApprovalsPage() {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const userDirectory = useUserDirectory();
  const { byRole } = userDirectory;
  const role = currentUser?.role;
  const actor: Actor = {
    id: currentUser?.id ?? '',
    name: currentUser?.fullName ?? 'Unknown User',
    role: role ?? 'account_manager'
  };

  const [comparisons, setComparisons] = useState<Comparison[]>(() => getComparisons());
  const refresh = () => setComparisons(getComparisons());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getApprovalSummary(), [comparisons]);

  // Scoped strictly to what this role is meant to act on. Label Final sees
  // Pending Label Final, Technical sees Pending Technical, QA sees Pending
  // QA (acted on via the existing QA Verification page), Manager sees
  // Pending Manager Approval. Any other role (Account Manager) gets a
  // read-only overview of everything already in or through the pipeline.
  const queue = useMemo(() => {
    if (role === 'label_final') return comparisons.filter((c) => c.status === 'Pending Label Final');
    if (role === 'technical') return comparisons.filter((c) => c.status === 'Pending Technical');
    if (role === 'qa') return comparisons.filter((c) => c.status === 'Pending QA');
    if (role === 'manager') return comparisons.filter((c) => c.status === 'Pending Manager Approval');
    return comparisons.filter((c) => c.status !== 'Draft' && c.status !== 'In Progress' && c.status !== 'Completed');
  }, [comparisons, role]);

  const selectedItem = comparisons.find((comparison) => comparison.id === selectedId) ?? null;

  const referenceArtwork = selectedItem
    ? getArtworkVersionsForSelection(selectedItem.productId, selectedItem.referenceArtworkCompany).find(
        (artwork) => artwork.id === selectedItem.referenceArtworkId
      )
    : undefined;
  const newArtwork = selectedItem
    ? getArtworkVersionsForSelection(selectedItem.productId, selectedItem.newArtworkCompany).find(
        (artwork) => artwork.id === selectedItem.newArtworkId
      )
    : undefined;

  const handleOpenItem = (comparison: Comparison) => {
    setSelectedId(comparison.id);
    setRemarks('');
  };

  const handleBack = () => {
    setSelectedId(null);
    setRemarks('');
  };

  const runDecision = (fn: () => void) => {
    fn();
    refresh();
    handleBack();
  };

  // Assignment â€” who is responsible for each stage, distinct from RBAC (who
  // may act) and from the actual actor recorded in history. Manager-only,
  // same authority already gated by assignApprovalStage itself.
  const isManager = role === 'manager';
  // One fetch of the directory serves both the per-stage assignee lists and
  // the name shown against the current assignment; byRole already filters to
  // Active users, so nobody who has been deactivated stays assignable.
  const usersByStage = useMemo(
    () => Object.fromEntries(APPROVAL_STAGES.map((stage) => [stage.key, byRole(stage.role)])) as Record<ApprovalStageKey, AppUser[]>,
    [byRole]
  );
  const handleAssign = (stageKey: ApprovalStageKey, userId: string) => {
    if (!selectedItem) return;
    assignApprovalStage(selectedItem.id, stageKey, userId || undefined, actor);
    refresh();
  };

  const handleLabelFinalApprove = () =>
    selectedItem && runDecision(() => submitLabelFinalDecision(selectedItem.id, 'approve', remarks, actor));
  const handleLabelFinalRevision = () =>
    selectedItem && runDecision(() => submitLabelFinalDecision(selectedItem.id, 'revision', remarks, actor));

  const handleTechnicalApprove = () =>
    selectedItem && runDecision(() => submitTechnicalDecision(selectedItem.id, 'approve', remarks, actor));
  const handleTechnicalRevision = () =>
    selectedItem && runDecision(() => submitTechnicalDecision(selectedItem.id, 'revision', remarks, actor));

  const handleManagerFinalApprove = () =>
    selectedItem && runDecision(() => submitManagerDecision(selectedItem.id, 'approve', remarks, actor));
  const handleManagerReject = () => selectedItem && runDecision(() => submitManagerDecision(selectedItem.id, 'reject', remarks, actor));
  const handleManagerRevision = () =>
    selectedItem && runDecision(() => submitManagerDecision(selectedItem.id, 'revision', remarks, actor));

  const isLabelFinalStage = role === 'label_final' && selectedItem?.status === 'Pending Label Final' && hasPermission('SUBMIT');
  const isTechnicalStage = role === 'technical' && selectedItem?.status === 'Pending Technical' && hasPermission('SUBMIT');
  const isQAStage = role === 'qa' && selectedItem?.status === 'Pending QA';
  const isManagerStage = role === 'manager' && selectedItem?.status === 'Pending Manager Approval' && hasPermission('APPROVE_FINAL');

  return (
    <Box>
      <PageHeader title="Approvals" subtitle="Review and manage labels through the approval workflow." />

      {selectedItem ? (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Button startIcon={<MdArrowBack />} onClick={handleBack} sx={{ alignSelf: 'start', color: 'var(--c-info)', textTransform: 'none' }}>
            Back to Approvals
          </Button>

          <Paper sx={{ p: 4, borderRadius: 4 }}>
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                    {selectedItem.productName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                    {selectedItem.newArtworkCompany} Â· Artwork {selectedItem.newArtworkId} â€” {selectedItem.newArtworkVersion}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mt: 0.5 }}>
                    Reference Artwork {selectedItem.referenceArtworkId} â€” {selectedItem.referenceArtworkVersion} (
                    {selectedItem.referenceArtworkCompany})
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <StatusChip status={selectedItem.status} />
                  <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                    Comparison Score: <strong>{selectedItem.overallSimilarity}%</strong>
                  </Typography>
                  <StatusChip status={selectedItem.overallResult} />
                </Box>
              </Box>

              <Divider sx={{ borderColor: 'var(--c-border)' }} />

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Approval Assignment
                </Typography>

                {(() => {
                  const currentStageKey = STAGE_KEY_BY_STATUS[selectedItem.status];
                  if (!currentStageKey) {
                    return (
                      <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mb: isManager ? 3 : 0 }}>
                        This record is not currently awaiting action at any stage.
                      </Typography>
                    );
                  }
                  const currentStage = APPROVAL_STAGES.find((stage) => stage.key === currentStageKey)!;
                  const assignedId = selectedItem.approvalAssignments[currentStageKey];
                  const assignedUser = userDirectory.byId(assignedId);
                  return (
                    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: isManager ? 3 : 0, borderColor: 'var(--c-border)' }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'var(--c-text-3)', fontWeight: 700 }}>
                            Approval Stage
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 700 }}>
                            {currentStage.label}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'var(--c-text-3)', fontWeight: 700 }}>
                            Approval User ID
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 700 }}>
                            {assignedId ?? 'Unassigned'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'var(--c-text-3)', fontWeight: 700 }}>
                            Assigned User
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 700 }}>
                            {assignedUser?.fullName ?? 'â€”'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'var(--c-text-3)', fontWeight: 700, display: 'block', mb: 0.5 }}>
                            Status
                          </Typography>
                          <StatusChip status={selectedItem.status} />
                        </Box>
                      </Box>
                    </Paper>
                  );
                })()}

                {isManager && (
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                    {APPROVAL_STAGES.map((stage) => (
                      <FormControl key={stage.key} fullWidth size="small">
                        <InputLabel>{stage.teamLabel}</InputLabel>
                        <Select
                          value={selectedItem.approvalAssignments[stage.key] ?? ''}
                          label={stage.teamLabel}
                          onChange={(event: SelectChangeEvent) => handleAssign(stage.key, event.target.value)}
                        >
                          <MenuItem value="">Unassigned</MenuItem>
                          {usersByStage[stage.key].map((user) => (
                            <MenuItem key={user.id} value={user.id}>
                              {user.fullName} ({user.id})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ))}
                  </Box>
                )}
              </Box>

              <Divider sx={{ borderColor: 'var(--c-border)' }} />

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)', mb: 1, fontWeight: 700 }}>
                    Reference Label
                  </Typography>
                  <ArtworkPreview artwork={referenceArtwork} />
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)', mb: 1, fontWeight: 700 }}>
                    New Label
                  </Typography>
                  <ArtworkPreview artwork={newArtwork} />
                </Box>
              </Box>

              <Divider sx={{ borderColor: 'var(--c-border)' }} />

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Comparison Results
                </Typography>
                <TableContainer component={Paper} sx={{ boxShadow: 'none', borderRadius: 3, overflow: 'hidden' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'var(--c-surface)' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Parameter</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Reference Label</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>New Label</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Result</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedItem.parameters.map((param) => (
                        <TableRow key={param.parameter} hover sx={{ '&:hover': { bgcolor: 'var(--c-tint-orange)' } }}>
                          <TableCell>{param.parameter}</TableCell>
                          <TableCell sx={param.referenceValue ? undefined : { color: 'var(--c-text-3)', fontStyle: 'italic' }}>
                            {param.referenceValue || MISSING_VALUE_DISPLAY}
                          </TableCell>
                          <TableCell sx={param.newValue ? undefined : { color: 'var(--c-text-3)', fontStyle: 'italic' }}>
                            {param.newValue || MISSING_VALUE_DISPLAY}
                          </TableCell>
                          <TableCell>
                            <StatusChip status={param.result} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider sx={{ borderColor: 'var(--c-border)' }} />

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Workflow History
                </Typography>
                {selectedItem.history.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                    No stage decisions have been recorded yet.
                  </Typography>
                ) : (
                  <TableContainer component={Paper} sx={{ boxShadow: 'none', borderRadius: 3, overflow: 'hidden' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: 'var(--c-surface)' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Stage</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Approval User ID</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Actual Actor</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Remarks</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedItem.history.map((entry, index) => (
                          <TableRow key={`${entry.stage}-${entry.date}-${index}`} hover sx={{ '&:hover': { bgcolor: 'var(--c-tint-orange)' } }}>
                            <TableCell>{entry.stage}</TableCell>
                            <TableCell>{entry.action}</TableCell>
                            <TableCell>{entry.approvalUserId ?? 'Unassigned'}</TableCell>
                            <TableCell>
                              {entry.actorName} ({entry.actorRole})
                            </TableCell>
                            <TableCell>{formatDateTime(entry.date)}</TableCell>
                            <TableCell>{entry.remarks || 'â€”'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>

              <Divider sx={{ borderColor: 'var(--c-border)' }} />

              <Box sx={{ display: 'grid', gap: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Current Review
                </Typography>

                {isLabelFinalStage || isTechnicalStage || isManagerStage ? (
                  <>
                    <TextField
                      fullWidth
                      multiline
                      minRows={3}
                      placeholder="Add remarks for this decision..."
                      value={remarks}
                      onChange={(event) => setRemarks(event.target.value)}
                    />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'flex-end' }}>
                      {isLabelFinalStage && (
                        <>
                          <Button variant="outlined" color="error" sx={{ textTransform: 'none' }} onClick={handleLabelFinalRevision}>
                            Request Revision
                          </Button>
                          <Button
                            variant="contained"
                            sx={{ bgcolor: 'var(--c-green)', '&:hover': { bgcolor: 'var(--c-green-650)' }, textTransform: 'none' }}
                            onClick={handleLabelFinalApprove}
                          >
                            Send to Technical
                          </Button>
                        </>
                      )}
                      {isTechnicalStage && (
                        <>
                          <Button variant="outlined" color="error" sx={{ textTransform: 'none' }} onClick={handleTechnicalRevision}>
                            Send Back
                          </Button>
                          <Button
                            variant="contained"
                            sx={{ bgcolor: 'var(--c-green)', '&:hover': { bgcolor: 'var(--c-green-650)' }, textTransform: 'none' }}
                            onClick={handleTechnicalApprove}
                          >
                            Approve &amp; Send to QA
                          </Button>
                        </>
                      )}
                      {isManagerStage && (
                        <>
                          <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={handleManagerRevision}>
                            Request Revision
                          </Button>
                          <Button variant="outlined" color="error" sx={{ textTransform: 'none' }} onClick={handleManagerReject}>
                            Reject
                          </Button>
                          <Button
                            variant="contained"
                            sx={{ bgcolor: 'var(--c-green)', '&:hover': { bgcolor: 'var(--c-green-650)' }, textTransform: 'none' }}
                            onClick={handleManagerFinalApprove}
                          >
                            Final Approve
                          </Button>
                        </>
                      )}
                    </Box>
                  </>
                ) : isQAStage ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                      This record is verified from the QA Verification page.
                    </Typography>
                    <Button
                      variant="contained"
                      sx={{ bgcolor: 'var(--c-info)', '&:hover': { bgcolor: 'var(--c-info-700)' }, textTransform: 'none' }}
                      onClick={() => navigate('/qa')}
                    >
                      Open in QA Verification
                    </Button>
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                    No action is available on this record for your role at its current stage.
                  </Typography>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            {summaryCardOrder.map((card) => (
              <Paper key={card.key} sx={{ p: 3, borderRadius: 3, boxShadow: 'var(--c-shadow-card)' }}>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)', mb: 1, fontWeight: 700 }}>
                  {card.label}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {summary[card.key]}
                </Typography>
              </Paper>
            ))}
          </Box>

          <Paper sx={{ p: 2, borderRadius: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Approval Queue
            </Typography>
            {queue.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography variant="body1" sx={{ color: 'var(--c-text-3)' }}>
                  No records in your approval queue right now.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Comparison ID</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Product Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Party</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Artwork Version</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Comparison Result</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Similarity</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Current Stage</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Approval User ID</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Submitted Date</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queue.map((item) => (
                      <TableRow key={item.id} hover sx={{ '&:hover': { bgcolor: 'var(--c-tint-orange)' } }}>
                        <TableCell>{item.id}</TableCell>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{item.newArtworkCompany}</TableCell>
                        <TableCell>{item.newArtworkVersion}</TableCell>
                        <TableCell>
                          <StatusChip status={item.overallResult} />
                        </TableCell>
                        <TableCell>{item.overallSimilarity}%</TableCell>
                        <TableCell>{currentStageLabel(item.status)}</TableCell>
                        <TableCell>{assignedUserLabel(item)}</TableCell>
                        <TableCell>
                          <StatusChip status={item.status} />
                        </TableCell>
                        <TableCell>{formatDateTime(item.comparisonDate)}</TableCell>
                        <TableCell>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handleOpenItem(item)}
                            sx={{ textTransform: 'none', bgcolor: 'var(--c-info)', '&:hover': { bgcolor: 'var(--c-info-700)' } }}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
