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
  // MATCH/SIMILAR/CONFLICT/MISSING is the AI module brief's §8 vocabulary —
  // shared by the older Label Final->Technical->QA->Manager approval
  // pipeline's own ParameterResult (types/comparison.ts) and the newer
  // Quick Label Comparison engine's LabelComparisonFieldStatus/
  // VisualComparisonStatus alike, so one set of chip styles covers both.
  MATCH: { color: 'success', label: 'Match' },
  SIMILAR: { color: 'warning', label: 'Similar' },
  CONFLICT: { color: 'error', label: 'Conflict' },
  MISSING: { color: 'warning', label: 'Missing' },
  NOT_COMPARED: { color: 'default', label: 'Not Compared' },
  'REVIEW REQUIRED': { color: 'warning', label: 'Review Required' },
  Verified: { color: 'success', label: 'Verified' },
  Fixed: { color: 'info', label: 'Fixed' }
};

export function StatusChip({ status }: Props) {
  const config = statusMap[status] || { color: 'default', label: status };

  return <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 700, textTransform: 'none' }} />;
}
