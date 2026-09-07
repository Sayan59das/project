// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { MdArrowBack, MdCancel, MdCheckCircle, MdWarningAmber } from 'react-icons/md';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { ArtworkPreview } from '../components/ArtworkPreview';
import { useAuth } from '../auth/AuthContext';
import { getUserById } from '../data/usersStore';
import { Actor, getArtworkVersionsForSelection, getComparisons, qaRejectComparison, qaVerifyComparison } from '../services/comparisonService';
import { Comparison, ParameterResult } from '../types/comparison';
import { formatDateTime } from '../utils/dateFormat';
import { useMasterData } from '../hooks/useMasterData';

// The QA stage's Approval User ID for this comparison — who is specifically
// responsible for QA verification, distinct from the QA role generally and
// from whoever actually performs the action (see comparisonService's
// Actor/approvalAssignments split).
function qaAssignedUserId(comparison: Comparison): string | undefined {
  return comparison.approvalAssignments.qa;
}

function resultIcon(result: ParameterResult) {
  if (result === 'MATCH') return <MdCheckCircle color="#00A651" size={18} />;
  if (result === 'SIMILAR') return <MdWarningAmber color="#F4C542" size={18} />;
  return <MdCancel color="#D32F2F" size={18} />;
}

// Maps the comparison's overall result/status onto the QA page's own status
// vocabulary (already defined in StatusChip) rather than reusing MATCH/
// REVIEW REQUIRED/CONFLICT verbatim.
function qaStatusLabel(comparison: Comparison): string {
  if (comparison.status === 'Pending Manager Approval') return 'Verified';
  if (comparison.status === 'Revision Required' || comparison.status === 'Rejected') return 'Sent Back';
  if (comparison.overallResult === 'CONFLICT') return 'Conflict Found';
  if (comparison.overallResult === 'REVIEW REQUIRED') return 'Review Required';
  return 'Ready for QA';
}

export function QAPage() {
  const { currentUser, hasPermission } = useAuth();
  const canReview = hasPermission('REVIEW');
  const canVerify = hasPermission('VERIFY');
  const canReject = hasPermission('REJECT');
  const actor: Actor = {
    id: currentUser?.id ?? '',
    name: currentUser?.fullName ?? 'Unknown User',
    role: currentUser?.role ?? 'qa'
  };

  const { comparisons, artworks, refetchComparisons } = useMasterData();
  const refresh = () => refetchComparisons();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [checked, setChecked] = useState(false);

  const queue = useMemo(() => comparisons.filter((comparison) => comparison.status === 'Pending QA'), [comparisons]);

  const summaryCards = useMemo(
    () => [
      { label: 'Pending QA', value: queue.length },
      { label: 'Verified (sent to Manager)', value: comparisons.filter((c) => c.status === 'Pending Manager Approval').length },
      {
        label: 'Sent Back',
        value: comparisons.filter(
          (c) => c.status === 'Revision Required' && c.history.some((entry) => entry.stage === 'QA' && entry.action === 'Revision Requested')
        ).length
      }
    ],
    [comparisons, queue]
  );

  const selectedItem = comparisons.find((comparison) => comparison.id === selectedId) ?? null;

  const referenceArtwork = selectedItem
    ? artworks.find(
        (artwork) => artwork.id === selectedItem.referenceArtworkId
      )
    : undefined;
  const newArtwork = selectedItem
    ? artworks.find(
        (artwork) => artwork.id === selectedItem.newArtworkId
      )
    : undefined;

  const handleOpenItem = (comparison: Comparison) => {
    setSelectedId(comparison.id);
    setRemarks(comparison.qaRemarks ?? '');
    setChecked(false);
  };

  const handleBack = () => {
    setSelectedId(null);
    setRemarks('');
    setChecked(false);
  };

  const handleVerify = () => {
    if (!selectedItem) return;
    qaVerifyComparison(selectedItem.id, remarks, actor);
    refresh();
    handleBack();
  };

  const handleSendBack = () => {
    if (!selectedItem) return;
    qaRejectComparison(selectedItem.id, remarks, actor);
    refresh();
    handleBack();
  };

  return (
    <Box>
      <PageHeader title="QA Verification" subtitle="Verify label comparison results before final approval." />

      {selectedItem ? (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Button startIcon={<MdArrowBack />} onClick={handleBack} sx={{ alignSelf: 'start', color: '#1976D2', textTransform: 'none' }}>
            QA Verification
          </Button>

          <Paper sx={{ p: 4, borderRadius: 4 }}>
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                    {selectedItem.productName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
                    Version {selectedItem.newArtworkVersion} · {selectedItem.newArtworkCompany}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#9EA4AB', mt: 0.5 }}>
                    Approval User ID: <strong>{qaAssignedUserId(selectedItem) ?? 'Unassigned'}</strong>
                    {qaAssignedUserId(selectedItem) && ` (${getUserById(qaAssignedUserId(selectedItem)!)?.fullName ?? 'Unknown User'})`}
                  </Typography>
                </Box>

                <Card sx={{ p: 3, borderRadius: 3, textAlign: 'center', minWidth: 200, bgcolor: '#EEF1F4' }}>
                  <Typography variant="subtitle2" sx={{ color: '#6B7177', letterSpacing: 1.2, mb: 1 }}>
                    Comparison Score
                  </Typography>
                  <Typography variant="h2" sx={{ fontWeight: 800, color: '#E26737' }}>
                    {selectedItem.overallSimilarity}%
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 1,
                      fontWeight: 700,
                      color: selectedItem.overallResult === 'CONFLICT' ? '#D32F2F' : selectedItem.overallResult === 'REVIEW REQUIRED' ? '#B26A00' : '#00A651'
                    }}
                  >
                    {selectedItem.overallResult === 'CONFLICT'
                      ? '✕ Conflict Found'
                      : selectedItem.overallResult === 'REVIEW REQUIRED'
                      ? '⚠ Review Required'
                      : '✓ Generally Matched'}
                  </Typography>
                </Card>
              </Box>

              <Divider sx={{ borderColor: '#D8DDE3' }} />

              <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <Paper sx={{ p: 3, borderRadius: 3, bgcolor: '#EEF1F4' }}>
                  <Typography variant="subtitle2" sx={{ color: '#6B7177', mb: 2, fontWeight: 700 }}>
                    Existing Approved
                  </Typography>
                  <ArtworkPreview artwork={referenceArtwork} />
                </Paper>
                <Paper sx={{ p: 3, borderRadius: 3, bgcolor: '#EEF1F4' }}>
                  <Typography variant="subtitle2" sx={{ color: '#6B7177', mb: 2, fontWeight: 700 }}>
                    Current Label
                  </Typography>
                  <ArtworkPreview artwork={newArtwork} />
                </Paper>
              </Box>

              <Divider sx={{ borderColor: '#D8DDE3' }} />

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Parameter Verification
                </Typography>
                <TableContainer component={Paper} sx={{ boxShadow: 'none', borderRadius: 3, overflow: 'hidden' }}>
                  <Table>
                    <TableHead sx={{ bgcolor: '#FFFFFF' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Parameter</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Result</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>QA Check</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedItem.parameters.map((row) => (
                        <TableRow key={row.parameter} hover sx={{ '&:hover': { bgcolor: '#FFF8F2' } }}>
                          <TableCell>{row.parameter}</TableCell>
                          <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {resultIcon(row.result)} {row.result}
                          </TableCell>
                          <TableCell>
                            <Checkbox checked={row.result === 'MATCH'} disabled />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {canReview && (
                <Box sx={{ display: 'grid', gap: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    QA Remarks
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    placeholder="Enter any verification notes or issues found during QA."
                  />
                  {canVerify && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} />
                      <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
                        I have verified the above label comparison.
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'flex-end' }}>
                {canReject && (
                  <Button variant="outlined" color="error" sx={{ textTransform: 'none' }} onClick={handleSendBack}>
                    Send Back
                  </Button>
                )}
                {canVerify && (
                  <Button
                    variant="contained"
                    disabled={!checked}
                    onClick={handleVerify}
                    sx={{
                      textTransform: 'none',
                      bgcolor: '#00A651',
                      '&:hover': { bgcolor: '#008f45' },
                      '&:disabled': { bgcolor: '#B2DFBC', color: '#FFFFFF' }
                    }}
                  >
                    Verify & Approve
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {summaryCards.map((card) => (
              <Card key={card.label} sx={{ p: 3, borderRadius: 3, bgcolor: '#EEF1F4' }}>
                <Typography variant="subtitle2" sx={{ color: '#6B7177', mb: 1, fontWeight: 700 }}>
                  {card.label}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {card.value}
                </Typography>
              </Card>
            ))}
          </Box>

          <Paper sx={{ p: 2, borderRadius: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              QA Queue
            </Typography>
            {queue.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography variant="body1" sx={{ color: '#9EA4AB' }}>
                  No comparisons are currently pending QA review.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Product Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Party</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Version</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Comparison</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Approval User ID</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Submitted</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2E3135' }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queue.map((item) => (
                      <TableRow key={item.id} hover sx={{ '&:hover': { bgcolor: '#FFF8F2' } }}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{item.newArtworkCompany}</TableCell>
                        <TableCell>{item.newArtworkVersion}</TableCell>
                        <TableCell>{item.overallSimilarity}%</TableCell>
                        <TableCell>{qaAssignedUserId(item) ?? 'Unassigned'}</TableCell>
                        <TableCell>{formatDateTime(item.comparisonDate)}</TableCell>
                        <TableCell>
                          <StatusChip status={qaStatusLabel(item)} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handleOpenItem(item)}
                            sx={{ textTransform: 'none', bgcolor: '#1976D2', '&:hover': { bgcolor: '#135ba1' } }}
                          >
                            Verify
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
