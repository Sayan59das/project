// Reporting layer for the Reports module. Every function here reads
// through the existing product/artwork/comparison/user services — never
// localStorage directly — and returns already-filtered, already-sorted rows
// so ReportsPage.tsx only has to render. This keeps Reports' numbers
// identical to Dashboard's (both ultimately read the same comparisons and
// artworks) and keeps filtering/joining logic out of the UI layer.

import { ROLE_LABELS, RoleId } from '../auth/permissions';
import { getUsers } from '../data/usersStore';
import { Artwork, ArtworkStatus } from '../types/artwork';
import { Comparison, ComparisonStatus, WorkflowAction, WorkflowStage } from '../types/comparison';
import { getArtworks, parseVersionNumber } from './artworkService';
import { getAllWorkflowHistory, getComparisons } from './comparisonService';
import { getProducts } from './productService';

// ---------------------------------------------------------------------
// Shared filters + helpers
// ---------------------------------------------------------------------

export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  brand?: string;
  marketingCompany?: string;
  manufacturingCompany?: string;
  status?: string;
  artworkVersion?: string;
  user?: string;
  search?: string;
};

function inDateRange(dateStr: string | undefined, from?: string, to?: string): boolean {
  if (!dateStr) return true;
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return true;
  if (from && time < new Date(from).getTime()) return false;
  if (to && time > new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

function textIncludes(haystack: string | undefined, needle?: string): boolean {
  if (!needle || !needle.trim()) return true;
  return (haystack ?? '').toLowerCase().includes(needle.trim().toLowerCase());
}

function matchesSearch(fields: Array<string | undefined>, search?: string): boolean {
  if (!search || !search.trim()) return true;
  const query = search.trim().toLowerCase();
  return fields.some((field) => (field ?? '').toLowerCase().includes(query));
}

// ---------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------

export type ReportColumn<T> = { key: keyof T; header: string; format?: (value: T[keyof T]) => string };

function escapeCsvCell(value: unknown): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv<T extends Record<string, unknown>>(columns: ReportColumn<T>[], rows: T[]): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.format ? column.format(row[column.key]) : row[column.key])).join(',')
  );
  return [header, ...body].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildReportFilename(reportLabel: string): string {
  const slug = reportLabel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `IMH-LVS-${slug}-Report-${date}.csv`;
}

// ---------------------------------------------------------------------
// 1. Label Comparison Report
// ---------------------------------------------------------------------

export type ComparisonReportRow = {
  comparisonId: string;
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  newArtworkVersion: string;
  referenceArtworkVersion: string;
  overallSimilarity: number;
  overallResult: string;
  status: ComparisonStatus;
  createdDate: string;
  updatedDate: string;
};

export async function getComparisonReport(filters: ReportFilters): Promise<ComparisonReportRow[]> {
  const products = await getProducts();
  const comparisons = await getComparisons();
  return comparisons
    .map((comparison) => {
      const product = products.find((p) => p.id === comparison.productId);
      return {
        comparisonId: comparison.id,
        productId: comparison.productId,
        productName: comparison.productName,
        brand: product?.brandName ?? '—',
        marketingCompany: comparison.newArtworkCompany,
        manufacturingCompany: product?.manufacturingCompany ?? '—',
        newArtworkVersion: comparison.newArtworkVersion,
        referenceArtworkVersion: comparison.referenceArtworkVersion,
        overallSimilarity: comparison.overallSimilarity,
        overallResult: comparison.overallResult,
        status: comparison.status,
        createdDate: comparison.comparisonDate,
        updatedDate: comparison.updatedDate
      };
    })
    .filter(
      (row) =>
        inDateRange(row.updatedDate, filters.dateFrom, filters.dateTo) &&
        (!filters.productId || row.productId === filters.productId) &&
        (!filters.brand || row.brand === filters.brand) &&
        (!filters.marketingCompany || row.marketingCompany === filters.marketingCompany) &&
        (!filters.manufacturingCompany || row.manufacturingCompany === filters.manufacturingCompany) &&
        (!filters.status || row.status === filters.status) &&
        (!filters.artworkVersion || row.newArtworkVersion === filters.artworkVersion) &&
        matchesSearch([row.comparisonId, row.productName, row.brand, row.marketingCompany], filters.search)
    )
    .sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime());
}

// ---------------------------------------------------------------------
// 2. Pending Verification Report
// ---------------------------------------------------------------------

export type PendingVerificationRow = {
  comparisonId: string;
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  artworkVersion: string;
  currentStage: string;
  relevantRole: string;
  similarityScore: number;
  submittedDate: string;
  daysPending: number;
  status: ComparisonStatus;
};

const PENDING_STAGE_MAP: Partial<Record<ComparisonStatus, { stage: string; role: string }>> = {
  'Pending Label Final': { stage: 'Label Final', role: 'Label Final' },
  'Pending Technical': { stage: 'Technical', role: 'Technical' },
  'Pending QA': { stage: 'QA', role: 'QA' },
  'Pending Manager Approval': { stage: 'Manager', role: 'Manager' }
};

export async function getPendingVerificationReport(filters: ReportFilters): Promise<PendingVerificationRow[]> {
  const products = await getProducts();
  const comparisons = await getComparisons();
  return comparisons
    .filter((comparison) => Boolean(PENDING_STAGE_MAP[comparison.status]))
    .map((comparison) => {
      const product = products.find((p) => p.id === comparison.productId);
      const stageInfo = PENDING_STAGE_MAP[comparison.status]!;
      const enteredAt = comparison.history.length > 0 ? comparison.history[comparison.history.length - 1].date : comparison.updatedDate;
      const daysPending = Math.max(0, Math.floor((Date.now() - new Date(enteredAt).getTime()) / (24 * 60 * 60 * 1000)));
      return {
        comparisonId: comparison.id,
        productId: comparison.productId,
        productName: comparison.productName,
        brand: product?.brandName ?? '—',
        marketingCompany: comparison.newArtworkCompany,
        artworkVersion: comparison.newArtworkVersion,
        currentStage: stageInfo.stage,
        relevantRole: stageInfo.role,
        similarityScore: comparison.overallSimilarity,
        submittedDate: enteredAt.slice(0, 10),
        daysPending,
        status: comparison.status
      };
    })
    .filter(
      (row) =>
        inDateRange(row.submittedDate, filters.dateFrom, filters.dateTo) &&
        (!filters.productId || row.productId === filters.productId) &&
        (!filters.brand || row.brand === filters.brand) &&
        (!filters.marketingCompany || row.marketingCompany === filters.marketingCompany) &&
        (!filters.status || row.status === filters.status) &&
        matchesSearch([row.comparisonId, row.productName, row.brand, row.marketingCompany], filters.search)
    )
    .sort((a, b) => b.daysPending - a.daysPending);
}

// ---------------------------------------------------------------------
// 3. Approved Labels Report
// ---------------------------------------------------------------------

export type ApprovedLabelRow = {
  comparisonId: string;
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  artworkVersion: string;
  approvedBy: string;
  approvalDate: string;
  status: ComparisonStatus;
};

export async function getApprovedLabelsReport(filters: ReportFilters): Promise<ApprovedLabelRow[]> {
  const products = await getProducts();
  const comparisons = await getComparisons();
  return comparisons
    .filter((comparison) => comparison.status === 'Final Approved')
    .map((comparison) => {
      const product = products.find((p) => p.id === comparison.productId);
      const approvalEntry = [...comparison.history].reverse().find((entry) => entry.stage === 'Manager' && entry.action === 'Final Approved');
      return {
        comparisonId: comparison.id,
        productId: comparison.productId,
        productName: comparison.productName,
        brand: product?.brandName ?? '—',
        marketingCompany: comparison.newArtworkCompany,
        manufacturingCompany: product?.manufacturingCompany ?? '—',
        artworkVersion: comparison.newArtworkVersion,
        approvedBy: approvalEntry?.actorName ?? comparison.updatedBy,
        approvalDate: approvalEntry?.date ?? comparison.updatedDate,
        status: comparison.status
      };
    })
    .filter(
      (row) =>
        inDateRange(row.approvalDate, filters.dateFrom, filters.dateTo) &&
        (!filters.productId || row.productId === filters.productId) &&
        (!filters.brand || row.brand === filters.brand) &&
        (!filters.marketingCompany || row.marketingCompany === filters.marketingCompany) &&
        (!filters.manufacturingCompany || row.manufacturingCompany === filters.manufacturingCompany) &&
        (!filters.artworkVersion || row.artworkVersion === filters.artworkVersion) &&
        matchesSearch([row.comparisonId, row.productName, row.brand, row.marketingCompany], filters.search)
    )
    .sort((a, b) => new Date(b.approvalDate).getTime() - new Date(a.approvalDate).getTime());
}

// ---------------------------------------------------------------------
// 4. Rejected / Revision Report
// ---------------------------------------------------------------------

export type RevisionScope = 'Rejected' | 'Revision Required' | 'Both';

export type RevisionReportRow = {
  comparisonId: string;
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  artworkVersion: string;
  currentStage: string;
  status: ComparisonStatus;
  lastReviewer: string;
  lastDecision: string;
  remarks: string;
  date: string;
};

export async function getRevisionRejectionReport(filters: ReportFilters, scope: RevisionScope = 'Both'): Promise<RevisionReportRow[]> {
  const products = await getProducts();
  const comparisons = await getComparisons();
  const statuses: ComparisonStatus[] = scope === 'Both' ? ['Rejected', 'Revision Required'] : [scope];
  return comparisons
    .filter((comparison) => statuses.includes(comparison.status))
    .map((comparison) => {
      const product = products.find((p) => p.id === comparison.productId);
      const lastEntry = comparison.history[comparison.history.length - 1];
      return {
        comparisonId: comparison.id,
        productId: comparison.productId,
        productName: comparison.productName,
        brand: product?.brandName ?? '—',
        marketingCompany: comparison.newArtworkCompany,
        artworkVersion: comparison.newArtworkVersion,
        currentStage: lastEntry?.stage ?? '—',
        status: comparison.status,
        lastReviewer: lastEntry?.actorName ?? comparison.updatedBy,
        lastDecision: lastEntry?.action ?? '—',
        remarks: lastEntry?.remarks || comparison.qaRemarks || '—',
        date: lastEntry?.date ?? comparison.updatedDate
      };
    })
    .filter(
      (row) =>
        inDateRange(row.date, filters.dateFrom, filters.dateTo) &&
        (!filters.productId || row.productId === filters.productId) &&
        (!filters.marketingCompany || row.marketingCompany === filters.marketingCompany) &&
        matchesSearch([row.comparisonId, row.productName, row.brand, row.marketingCompany], filters.search)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ---------------------------------------------------------------------
// 5. Artwork History Report
// ---------------------------------------------------------------------

export type ArtworkHistoryRow = {
  artworkId: string;
  productId: string;
  productName: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  version: string;
  status: ArtworkStatus;
  uploadedBy: string;
  uploadDate: string;
  archivedDate: string;
  isLatestVersion: boolean;
};

export async function getArtworkHistoryReport(filters: ReportFilters): Promise<ArtworkHistoryRow[]> {
  const artworks = await getArtworks();
  const groupKey = (artwork: Artwork) => `${artwork.productId}|${artwork.marketingCompany}|${artwork.artworkType}`;
  const latestVersionByGroup = new Map<string, number>();
  artworks.forEach((artwork) => {
    const key = groupKey(artwork);
    const version = parseVersionNumber(artwork.version);
    if (!latestVersionByGroup.has(key) || version > latestVersionByGroup.get(key)!) latestVersionByGroup.set(key, version);
  });

  return artworks
    .map((artwork) => ({
      artworkId: artwork.id,
      productId: artwork.productId,
      productName: artwork.productName,
      brand: artwork.brand,
      marketingCompany: artwork.marketingCompany,
      manufacturingCompany: artwork.manufacturingCompany,
      version: artwork.version,
      status: artwork.status,
      uploadedBy: artwork.uploadedBy,
      uploadDate: artwork.uploadDate,
      archivedDate: artwork.status === 'Archived' ? artwork.updatedDate : '—',
      isLatestVersion: parseVersionNumber(artwork.version) === latestVersionByGroup.get(groupKey(artwork))
    }))
    .filter(
      (row) =>
        inDateRange(row.uploadDate, filters.dateFrom, filters.dateTo) &&
        (!filters.productId || row.productId === filters.productId) &&
        (!filters.brand || row.brand === filters.brand) &&
        (!filters.marketingCompany || row.marketingCompany === filters.marketingCompany) &&
        (!filters.manufacturingCompany || row.manufacturingCompany === filters.manufacturingCompany) &&
        (!filters.status || row.status === filters.status) &&
        (!filters.artworkVersion || row.version === filters.artworkVersion) &&
        matchesSearch([row.artworkId, row.productName, row.brand, row.marketingCompany], filters.search)
    )
    .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
}

// ---------------------------------------------------------------------
// 6. Approval Workflow History Report
// ---------------------------------------------------------------------

export type ApprovalHistoryRow = {
  comparisonId: string;
  productId: string;
  productName: string;
  stage: WorkflowStage;
  action: WorkflowAction;
  resultingStatus: ComparisonStatus;
  approvalUserId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  date: string;
  remarks: string;
};

export async function getApprovalHistoryReport(filters: ReportFilters): Promise<ApprovalHistoryRow[]> {
  const comparisons = await getComparisons();
  const productIdByComparison = new Map(comparisons.map((comparison) => [comparison.id, comparison.productId]));
  const history = await getAllWorkflowHistory();
  return history
    .map((item) => ({
      comparisonId: item.comparisonId,
      productId: productIdByComparison.get(item.comparisonId) ?? '',
      productName: item.productName,
      stage: item.stage,
      action: item.action,
      resultingStatus: item.status,
      approvalUserId: item.approvalUserId ?? 'Unassigned',
      actorId: item.actorId,
      actorName: item.actorName,
      actorRole: item.actorRole,
      date: item.date,
      remarks: item.remarks
    }))
    .filter(
      (row) =>
        inDateRange(row.date, filters.dateFrom, filters.dateTo) &&
        (!filters.productId || row.productId === filters.productId) &&
        (!filters.status || row.resultingStatus === filters.status) &&
        (!filters.user || textIncludes(row.actorName, filters.user)) &&
        matchesSearch([row.comparisonId, row.productName, row.actorName, row.approvalUserId, row.actorId], filters.search)
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ---------------------------------------------------------------------
// 7. User Activity Report
// ---------------------------------------------------------------------

export type UserActivityRow = {
  user: string;
  role: string;
  action: string;
  module: string;
  reference: string;
  date: string;
  status: string;
  approvalUserId?: string;
  actorId?: string;
};

export async function getUserActivityReport(filters: ReportFilters): Promise<UserActivityRow[]> {
  const users = await getUsers();
  const artworks = await getArtworks();
  const comparisons = await getComparisons();
  const history = await getAllWorkflowHistory();

  const roleByName = new Map(users.map((user) => [user.fullName, user.role]));
  const roleLabel = (name: string): string => {
    const role = roleByName.get(name);
    return role ? ROLE_LABELS[role] : '—';
  };
  const workflowRoleLabel = (role: string): string => ROLE_LABELS[role as RoleId] ?? role;

  const artworkEvents: UserActivityRow[] = artworks.map((artwork) => ({
    user: artwork.uploadedBy,
    role: roleLabel(artwork.uploadedBy),
    action: 'Artwork Uploaded',
    module: 'Artwork',
    reference: artwork.id,
    date: artwork.uploadDate,
    status: artwork.status
  }));

  const comparisonEvents: UserActivityRow[] = comparisons.map((comparison) => ({
    user: comparison.comparedBy,
    role: roleLabel(comparison.comparedBy),
    action: 'Comparison Created',
    module: 'Comparison',
    reference: comparison.id,
    date: comparison.comparisonDate,
    status: comparison.status
  }));

  const workflowEvents: UserActivityRow[] = history.map((item) => ({
    user: item.actorName,
    role: workflowRoleLabel(item.actorRole),
    action: `${item.stage}: ${item.action}`,
    module: item.stage,
    reference: item.comparisonId,
    date: item.date,
    status: item.status,
    approvalUserId: item.approvalUserId ?? 'Unassigned',
    actorId: item.actorId
  }));

  return [...artworkEvents, ...comparisonEvents, ...workflowEvents]
    .filter(
      (row) =>
        inDateRange(row.date, filters.dateFrom, filters.dateTo) &&
        (!filters.user || textIncludes(row.user, filters.user)) &&
        matchesSearch([row.user, row.reference, row.action, row.module], filters.search)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
