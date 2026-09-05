import { Chip } from '@mui/material';

type Props = {
  status: string;
};

const statusMap: Record<string, { color: 'success' | 'warning' | 'default' | 'error' | 'info'; label: string }> = {
  Approved: { color: 'success', label: 'Approved' },
  Rejected: { color: 'error', label: 'Rejected' },
  'Pending Review': { color: 'warning', label: 'Pending Review' },
  'Pending Label Final': { color: 'warning', label: 'Pending Label Final' },
  'Label Final Approved': { color: 'info', label: 'Label Final Approved' },
  'Pending Technical': { color: 'warning', label: 'Pending Technical' },
  'Technical Approved': { color: 'info', label: 'Technical Approved' },
  'Pending QA': { color: 'warning', label: 'Pending QA' },
  'QA Approved': { color: 'info', label: 'QA Approved' },
  'Pending Manager Approval': { color: 'warning', label: 'Pending Manager Approval' },
  'Final Approved': { color: 'success', label: 'Final Approved' },
  'Revision Required': { color: 'error', label: 'Revision Required' },
  'Ready for QA': { color: 'success', label: 'Ready for QA' },
  'Review Required': { color: 'warning', label: 'Review Required' },
  'Conflict Found': { color: 'error', label: 'Conflict Found' },
  Pending: { color: 'warning', label: 'Pending' },
  Duplicate: { color: 'warning', label: 'Duplicate' },
  'In Review': { color: 'info', label: 'In Review' },
  Open: { color: 'info', label: 'Open' },
  Reviewed: { color: 'success', label: 'Reviewed' },
  Active: { color: 'success', label: 'Active' },
  Inactive: { color: 'default', label: 'Inactive' },
  Restricted: { color: 'error', label: 'Restricted' },
  'On Hold': { color: 'warning', label: 'On Hold' },
  'Pending Approval': { color: 'warning', label: 'Pending Approval' },
  Draft: { color: 'default', label: 'Draft' },
  'Pending Comparison': { color: 'warning', label: 'Pending Comparison' },
  'Under Review': { color: 'info', label: 'Under Review' },
  Archived: { color: 'default', label: 'Archived' },
  'In Progress': { color: 'info', label: 'In Progress' },
  Completed: { color: 'success', label: 'Completed' },
  MATCH: { color: 'success', label: 'Match' },
  DIFFERENT: { color: 'error', label: 'Different' },
  MISSING: { color: 'warning', label: 'Missing' },
  NOT_COMPARED: { color: 'default', label: 'Not Compared' },
  SIMILAR: { color: 'warning', label: 'Similar' },
  CONFLICT: { color: 'error', label: 'Conflict' },
  // Label Comparison Detail's Deviations/Field Comparison terminology — a
  // DIFFERENT field split by its backend-reported `importance`: HIGH is
  // shown as Conflicting, MEDIUM/LOW as Modified (see
  // pages/ComparisonDetailPage.tsx's classifyDeviation).
  MODIFIED: { color: 'warning', label: 'Modified' },
  CONFLICTING: { color: 'error', label: 'Conflicting' },
  'REVIEW REQUIRED': { color: 'warning', label: 'Review Required' },
  Verified: { color: 'success', label: 'Verified' },
  Fixed: { color: 'info', label: 'Fixed' }
};

export function StatusChip({ status }: Props) {
  const config = statusMap[status] || { color: 'default', label: status };

  return <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 700, textTransform: 'none' }} />;
}
