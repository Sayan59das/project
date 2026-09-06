// @ts-nocheck
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { DataGrid, GridColDef, GridRowParams } from '@mui/x-data-grid';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { useAuth } from '../auth/AuthContext';
import { getProducts } from '../services/productService';
import { getArtworks, parseVersionNumber } from '../services/artworkService';
import { getBrands, getManufacturingCompanies, getMarketingCompanies } from '../services/masterService';
import { getUsers } from '../data/usersStore';
import { getSettings } from '../services/settingsService';
import { COMPARISON_STATUS_OPTIONS } from '../types/comparison';
import { ARTWORK_STATUS_OPTIONS } from '../types/artwork';
import {
  ApprovalHistoryRow,
  ApprovedLabelRow,
  ArtworkHistoryRow,
  ComparisonReportRow,
  PendingVerificationRow,
  ReportColumn,
  ReportFilters,
  RevisionReportRow,
  RevisionScope,
  UserActivityRow,
  buildReportFilename,
  downloadCsv,
  getApprovalHistoryReport,
  getApprovedLabelsReport,
  getArtworkHistoryReport,
  getComparisonReport,
  getPendingVerificationReport,
  getRevisionRejectionReport,
  getUserActivityReport,
  toCsv
} from '../services/reportService';
import { formatDateTime } from '../utils/dateFormat';
import { useMasterData } from '../hooks/useMasterData';

// Every field name across the report row types above that holds a date or
// datetime value — used both to format the on-screen DataGrid cell and to
// make the CSV export match it exactly (see handleExportCsv below). Never
// applied to the underlying row data itself, since those same fields feed
// date-range filtering and sorting in reportService.ts.
const DATE_FIELDS = new Set(['createdDate', 'updatedDate', 'submittedDate', 'approvalDate', 'date', 'uploadDate', 'archivedDate']);

function dateCell(params: { value?: unknown }) {
  return formatDateTime(typeof params.value === 'string' ? params.value : '');
}

// ---------------------------------------------------------------------
// Report type configuration — single /reports route, tabs switch what's
// shown. Each report type declares which common filters actually apply to
// it and which status vocabulary its Status dropdown should offer.
// ---------------------------------------------------------------------

type ReportTypeKey = 'comparison' | 'pending' | 'approved' | 'revision' | 'artwork' | 'approvalHistory' | 'userActivity';

const REPORT_TYPES: { key: ReportTypeKey; label: string }[] = [
  { key: 'comparison', label: 'Label Comparison' },
  { key: 'pending', label: 'Pending Verification' },
  { key: 'approved', label: 'Approved Labels' },
  { key: 'revision', label: 'Rejected / Revision' },
  { key: 'artwork', label: 'Artwork History' },
  { key: 'approvalHistory', label: 'Approval History' },
  { key: 'userActivity', label: 'User Activity' }
];

type FilterVisibility = {
  product: boolean;
  brand: boolean;
  marketingCompany: boolean;
  manufacturingCompany: boolean;
  status: boolean;
  artworkVersion: boolean;
  user: boolean;
  revisionScope: boolean;
};

const FILTER_VISIBILITY: Record<ReportTypeKey, FilterVisibility> = {
  comparison: {
    product: true,
    brand: true,
    marketingCompany: true,
    manufacturingCompany: true,
    status: true,
    artworkVersion: true,
    user: false,
    revisionScope: false
  },
  pending: {
    product: true,
    brand: true,
    marketingCompany: true,
    manufacturingCompany: false,
    status: true,
    artworkVersion: false,
    user: false,
    revisionScope: false
  },
  approved: {
    product: true,
    brand: true,
    marketingCompany: true,
    manufacturingCompany: true,
    status: false,
    artworkVersion: true,
    user: false,
    revisionScope: false
  },
  revision: {
    product: true,
    brand: false,
    marketingCompany: true,
    manufacturingCompany: false,
    status: false,
    artworkVersion: false,
    user: false,
    revisionScope: true
  },
  artwork: {
    product: true,
    brand: true,
    marketingCompany: true,
    manufacturingCompany: true,
    status: true,
    artworkVersion: true,
    user: false,
    revisionScope: false
  },
  approvalHistory: {
    product: true,
    brand: false,
    marketingCompany: false,
    manufacturingCompany: false,
    status: true,
    artworkVersion: false,
    user: true,
    revisionScope: false
  },
  userActivity: {
    product: false,
    brand: false,
    marketingCompany: false,
    manufacturingCompany: false,
    status: false,
    artworkVersion: false,
    user: true,
    revisionScope: false
  }
};

const PENDING_STATUS_OPTIONS = ['Pending Label Final', 'Pending Technical', 'Pending QA', 'Pending Manager Approval'];

const STATUS_OPTIONS_BY_TYPE: Partial<Record<ReportTypeKey, string[]>> = {
  comparison: COMPARISON_STATUS_OPTIONS,
  pending: PENDING_STATUS_OPTIONS,
  artwork: ARTWORK_STATUS_OPTIONS,
  approvalHistory: COMPARISON_STATUS_OPTIONS
};

const ALL = 'All';

type FilterDraft = {
  dateFrom: string;
  dateTo: string;
  productId: string;
  brand: string;
  marketingCompany: string;
  manufacturingCompany: string;
  status: string;
  artworkVersion: string;
  user: string;
};

const EMPTY_DRAFT: FilterDraft = {
  dateFrom: '',
  dateTo: '',
  productId: ALL,
  brand: ALL,
  marketingCompany: ALL,
  manufacturingCompany: ALL,
  status: ALL,
  artworkVersion: ALL,
  user: ALL
};

function toReportFilters(draft: FilterDraft, search: string): ReportFilters {
  return {
    dateFrom: draft.dateFrom || undefined,
    dateTo: draft.dateTo || undefined,
    productId: draft.productId === ALL ? undefined : draft.productId,
    brand: draft.brand === ALL ? undefined : draft.brand,
    marketingCompany: draft.marketingCompany === ALL ? undefined : draft.marketingCompany,
    manufacturingCompany: draft.manufacturingCompany === ALL ? undefined : draft.manufacturingCompany,
    status: draft.status === ALL ? undefined : draft.status,
    artworkVersion: draft.artworkVersion === ALL ? undefined : draft.artworkVersion,
    user: draft.user === ALL ? undefined : draft.user,
    search: search.trim() || undefined
  };
}

function statusCell(value: unknown) {
  return <StatusChip status={String(value ?? '')} />;
}

// ---------------------------------------------------------------------
// Column definitions per report type. `field` matches the row-type keys
// reportService returns, so CSV export can reuse these header/key pairs
// directly instead of maintaining a second column list.
// ---------------------------------------------------------------------

const COMPARISON_COLUMNS: GridColDef<ComparisonReportRow>[] = [
  { field: 'comparisonId', headerName: 'Comparison ID', minWidth: 130, flex: 1 },
  { field: 'productName', headerName: 'Product Name', minWidth: 160, flex: 1.3 },
  { field: 'brand', headerName: 'Brand', minWidth: 120, flex: 1 },
  { field: 'marketingCompany', headerName: 'Party', minWidth: 160, flex: 1.2 },
  { field: 'manufacturingCompany', headerName: 'Manufacturing Company', minWidth: 170, flex: 1.2 },
  { field: 'newArtworkVersion', headerName: 'New Artwork', minWidth: 110, flex: 0.7 },
  { field: 'referenceArtworkVersion', headerName: 'Reference Artwork', minWidth: 130, flex: 0.9 },
  { field: 'overallSimilarity', headerName: 'Score', minWidth: 90, flex: 0.6, renderCell: (p) => `${p.value}%` },
  { field: 'overallResult', headerName: 'Result', minWidth: 150, flex: 1, renderCell: (p) => statusCell(p.value) },
  { field: 'status', headerName: 'Current Status', minWidth: 170, flex: 1.2, renderCell: (p) => statusCell(p.value) },
  { field: 'createdDate', headerName: 'Created Date', minWidth: 120, flex: 0.8, renderCell: dateCell },
  { field: 'updatedDate', headerName: 'Last Updated', minWidth: 120, flex: 0.8, renderCell: dateCell }
];

const PENDING_COLUMNS: GridColDef<PendingVerificationRow>[] = [
  { field: 'comparisonId', headerName: 'Comparison ID', minWidth: 130, flex: 1 },
  { field: 'productName', headerName: 'Product Name', minWidth: 160, flex: 1.2 },
  { field: 'artworkVersion', headerName: 'Artwork', minWidth: 100, flex: 0.6 },
  { field: 'currentStage', headerName: 'Current Stage', minWidth: 130, flex: 0.9 },
  { field: 'relevantRole', headerName: 'Relevant Role', minWidth: 130, flex: 0.9 },
  { field: 'similarityScore', headerName: 'Similarity', minWidth: 100, flex: 0.7, renderCell: (p) => `${p.value}%` },
  { field: 'submittedDate', headerName: 'Submitted Date', minWidth: 130, flex: 0.9, renderCell: dateCell },
  { field: 'daysPending', headerName: 'Days Pending', minWidth: 120, flex: 0.7 },
  { field: 'status', headerName: 'Status', minWidth: 170, flex: 1.1, renderCell: (p) => statusCell(p.value) }
];

const APPROVED_COLUMNS: GridColDef<ApprovedLabelRow>[] = [
  { field: 'comparisonId', headerName: 'Comparison ID', minWidth: 130, flex: 1 },
  { field: 'productName', headerName: 'Product Name', minWidth: 160, flex: 1.2 },
  { field: 'brand', headerName: 'Brand', minWidth: 120, flex: 0.9 },
  { field: 'marketingCompany', headerName: 'Party', minWidth: 160, flex: 1.1 },
  { field: 'manufacturingCompany', headerName: 'Manufacturing Company', minWidth: 170, flex: 1.1 },
  { field: 'artworkVersion', headerName: 'Artwork Version', minWidth: 120, flex: 0.7 },
  { field: 'approvedBy', headerName: 'Approved By', minWidth: 140, flex: 0.9 },
  { field: 'approvalDate', headerName: 'Approval Date', minWidth: 130, flex: 0.8, renderCell: dateCell },
  { field: 'status', headerName: 'Status', minWidth: 150, flex: 1, renderCell: (p) => statusCell(p.value) }
];

const REVISION_COLUMNS: GridColDef<RevisionReportRow>[] = [
  { field: 'comparisonId', headerName: 'Comparison ID', minWidth: 130, flex: 1 },
  { field: 'productName', headerName: 'Product Name', minWidth: 160, flex: 1.2 },
  { field: 'artworkVersion', headerName: 'Artwork Version', minWidth: 120, flex: 0.7 },
  { field: 'currentStage', headerName: 'Current Stage', minWidth: 120, flex: 0.8 },
  { field: 'status', headerName: 'Status', minWidth: 150, flex: 1, renderCell: (p) => statusCell(p.value) },
  { field: 'lastReviewer', headerName: 'Last Reviewer', minWidth: 140, flex: 0.9 },
  { field: 'lastDecision', headerName: 'Last Decision', minWidth: 150, flex: 1 },
  { field: 'remarks', headerName: 'Remarks', minWidth: 220, flex: 1.6 },
  { field: 'date', headerName: 'Date', minWidth: 160, flex: 1, renderCell: dateCell }
];

const ARTWORK_COLUMNS: GridColDef<ArtworkHistoryRow>[] = [
  { field: 'artworkId', headerName: 'Artwork ID', minWidth: 120, flex: 0.8 },
  { field: 'productName', headerName: 'Product Name', minWidth: 160, flex: 1.2 },
  { field: 'brand', headerName: 'Brand', minWidth: 120, flex: 0.9 },
  { field: 'marketingCompany', headerName: 'Party', minWidth: 160, flex: 1.1 },
  { field: 'manufacturingCompany', headerName: 'Manufacturing Company', minWidth: 170, flex: 1.1 },
  { field: 'version', headerName: 'Version', minWidth: 90, flex: 0.6 },
  { field: 'status', headerName: 'Status', minWidth: 150, flex: 1, renderCell: (p) => statusCell(p.value) },
  { field: 'uploadedBy', headerName: 'Uploaded By', minWidth: 140, flex: 0.9 },
  { field: 'uploadDate', headerName: 'Uploaded Date', minWidth: 130, flex: 0.8, renderCell: dateCell },
  { field: 'archivedDate', headerName: 'Archived Date', minWidth: 130, flex: 0.8, renderCell: dateCell },
  { field: 'isLatestVersion', headerName: 'Latest Version', minWidth: 120, flex: 0.7, renderCell: (p) => (p.value ? 'Yes' : '—') }
];

const APPROVAL_HISTORY_COLUMNS: GridColDef<ApprovalHistoryRow>[] = [
  { field: 'comparisonId', headerName: 'Comparison ID', minWidth: 130, flex: 1 },
  { field: 'productName', headerName: 'Product Name', minWidth: 160, flex: 1.2 },
  { field: 'stage', headerName: 'Stage', minWidth: 120, flex: 0.8 },
  { field: 'action', headerName: 'Action', minWidth: 160, flex: 1.1 },
  { field: 'resultingStatus', headerName: 'Resulting Status', minWidth: 170, flex: 1.1, renderCell: (p) => statusCell(p.value) },
  { field: 'approvalUserId', headerName: 'Approval User ID', minWidth: 150, flex: 1 },
  { field: 'actorId', headerName: 'Actor ID', minWidth: 110, flex: 0.7 },
  { field: 'actorName', headerName: 'Actor', minWidth: 140, flex: 0.9 },
  { field: 'actorRole', headerName: 'Role', minWidth: 130, flex: 0.8 },
  { field: 'date', headerName: 'Date/Time', minWidth: 180, flex: 1.1, renderCell: dateCell },
  { field: 'remarks', headerName: 'Remarks', minWidth: 220, flex: 1.6 }
];

const USER_ACTIVITY_COLUMNS: GridColDef<UserActivityRow>[] = [
  { field: 'user', headerName: 'User', minWidth: 140, flex: 1 },
  { field: 'role', headerName: 'Role', minWidth: 130, flex: 0.8 },
  { field: 'action', headerName: 'Action', minWidth: 220, flex: 1.4 },
  { field: 'module', headerName: 'Module/Stage', minWidth: 130, flex: 0.9 },
  { field: 'reference', headerName: 'Reference', minWidth: 130, flex: 0.9 },
  { field: 'approvalUserId', headerName: 'Approval User ID', minWidth: 150, flex: 1, renderCell: (p) => p.value ?? '—' },
  { field: 'actorId', headerName: 'Actor ID', minWidth: 110, flex: 0.7, renderCell: (p) => p.value ?? '—' },
  { field: 'date', headerName: 'Date/Time', minWidth: 180, flex: 1.1, renderCell: dateCell },
  { field: 'status', headerName: 'Status', minWidth: 160, flex: 1.1, renderCell: (p) => statusCell(p.value) }
];

function columnsFor(reportType: ReportTypeKey): GridColDef[] {
  switch (reportType) {
    case 'comparison':
      return COMPARISON_COLUMNS as GridColDef[];
    case 'pending':
      return PENDING_COLUMNS as GridColDef[];
    case 'approved':
      return APPROVED_COLUMNS as GridColDef[];
    case 'revision':
      return REVISION_COLUMNS as GridColDef[];
    case 'artwork':
      return ARTWORK_COLUMNS as GridColDef[];
    case 'approvalHistory':
      return APPROVAL_HISTORY_COLUMNS as GridColDef[];
    case 'userActivity':
      return USER_ACTIVITY_COLUMNS as GridColDef[];
    default:
      return [];
  }
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const canExport = hasPermission('EXPORT');
  const defaultPageSize = getSettings(currentUser?.id ?? '').pageSize;

  const [activeReport, setActiveReport] = useState<ReportTypeKey>('comparison');
  const [search, setSearch] = useState('');
  const [filterDraft, setFilterDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(EMPTY_DRAFT);
  const [revisionScope, setRevisionScope] = useState<RevisionScope>('Both');

  // Loaded once per render pass from the existing services — never raw
  // localStorage — and reused for every filter dropdown's option list.
  const [loadError, setLoadError] = useState(false);
  const referenceData = useMemo(() => {
    try {
      return {
        products: products,
        brands: Array.from(new Set(brands.map((b) => b.brandName))).sort(),
        marketingCompanies: Array.from(new Set(marketingCompanies.map((c) => c.companyName))).sort(),
        manufacturingCompanies: Array.from(new Set(manufacturingCompanies.map((c) => c.companyName))).sort(),
        artworkVersions: Array.from(new Set(artworks.map((a) => a.version))).sort((a, b) => parseVersionNumber(a) - parseVersionNumber(b)),
        users: getUsers()
          .map((u) => u.fullName)
          .sort()
      };
    } catch {
      setLoadError(true);
      return { products: [], brands: [], marketingCompanies: [], manufacturingCompanies: [], artworkVersions: [], users: [] };
    }
  }, []);

  const visibility = FILTER_VISIBILITY[activeReport];
  const statusOptions = STATUS_OPTIONS_BY_TYPE[activeReport];
  const effectiveFilters = useMemo(() => toReportFilters(appliedFilters, search), [appliedFilters, search]);

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    let active = true;
    const fetchRows = async () => {
      try {
        let result = [];
        switch (activeReport) {
          case 'comparison':
            result = await getComparisonReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'pending':
            result = await getPendingVerificationReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'approved':
            result = await getApprovedLabelsReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'revision':
            result = await getRevisionRejectionReport(effectiveFilters, revisionScope) as unknown as Record<string, unknown>[];
            break;
          case 'artwork':
            result = await getArtworkHistoryReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'approvalHistory':
            result = await getApprovalHistoryReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'userActivity':
            result = await getUserActivityReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
        }
        if (active) setRows(result);
      } catch {
        if (active) setLoadError(true);
      }
    };
    fetchRows();
    return () => { active = false; };
  }, [activeReport, effectiveFilters, revisionScope]);

  const gridRows = useMemo(() => rows.map((row, index) => ({ id: index, ...row })), [rows]);
  const columns = useMemo(() => columnsFor(activeReport), [activeReport]);

  const summaryCards = useMemo(() => {
    const count = (predicate: (row: Record<string, unknown>) => boolean) => rows.filter(predicate).length;
    const now = new Date();
    switch (activeReport) {
      case 'comparison':
        return [
          { label: 'Total Results', value: rows.length },
          { label: 'Completed', value: count((r) => r.status === 'Completed') },
          { label: 'Pending', value: count((r) => typeof r.status === 'string' && r.status.startsWith('Pending')) },
          { label: 'Final Approved', value: count((r) => r.status === 'Final Approved') },
          { label: 'Revision Required', value: count((r) => r.status === 'Revision Required') },
          { label: 'Rejected', value: count((r) => r.status === 'Rejected') }
        ];
      case 'pending':
        return [
          { label: 'Total Pending', value: rows.length },
          { label: 'Label Final', value: count((r) => r.currentStage === 'Label Final') },
          { label: 'Technical', value: count((r) => r.currentStage === 'Technical') },
          { label: 'QA', value: count((r) => r.currentStage === 'QA') },
          { label: 'Manager', value: count((r) => r.currentStage === 'Manager') }
        ];
      case 'approved':
        return [
          { label: 'Total Approved', value: rows.length },
          {
            label: 'This Month',
            value: count((r) => {
              const d = new Date(String(r.approvalDate));
              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            })
          },
          { label: 'This Year', value: count((r) => new Date(String(r.approvalDate)).getFullYear() === now.getFullYear()) }
        ];
      case 'revision':
        return [
          { label: 'Total Results', value: rows.length },
          { label: 'Revision Required', value: count((r) => r.status === 'Revision Required') },
          { label: 'Rejected', value: count((r) => r.status === 'Rejected') }
        ];
      case 'artwork':
        return [
          { label: 'Total Artwork', value: rows.length },
          { label: 'Latest Versions', value: count((r) => r.isLatestVersion === true) },
          { label: 'Archived', value: count((r) => r.status === 'Archived') }
        ];
      case 'approvalHistory':
        return [
          { label: 'Total Entries', value: rows.length },
          { label: 'Final Approved', value: count((r) => r.action === 'Final Approved') },
          { label: 'Revision / Rejected', value: count((r) => r.action === 'Revision Requested' || r.action === 'Rejected') }
        ];
      case 'userActivity':
        return [
          { label: 'Total Activities', value: rows.length },
          { label: 'Distinct Users', value: new Set(rows.map((r) => r.user)).size }
        ];
      default:
        return [];
    }
  }, [rows, activeReport]);

  const handleApplyFilters = () => setAppliedFilters(filterDraft);
  const handleClearFilters = () => {
    setFilterDraft(EMPTY_DRAFT);
    setAppliedFilters(EMPTY_DRAFT);
    setSearch('');
    setRevisionScope('Both');
  };

  const handleChangeReportType = (_: unknown, value: ReportTypeKey) => {
    setActiveReport(value);
    handleClearFilters();
  };

  const handleRowClick = (params: GridRowParams) => {
    const row = params.row as Record<string, unknown>;
    if (typeof row.comparisonId === 'string') navigate('/comparison');
    else if (typeof row.artworkId === 'string') navigate('/artwork');
    else if (typeof row.reference === 'string' && row.reference.startsWith('ART')) navigate('/artwork');
    else if (typeof row.reference === 'string' && row.reference.startsWith('CMP')) navigate('/comparison');
  };

  const handleExportCsv = () => {
    const reportLabel = REPORT_TYPES.find((type) => type.key === activeReport)?.label ?? 'Report';
    const csvColumns: ReportColumn<Record<string, unknown>>[] = columns.map((column) => ({
      key: column.field as keyof Record<string, unknown>,
      header: column.headerName ?? column.field,
      format: DATE_FIELDS.has(column.field) ? (value: unknown) => formatDateTime(typeof value === 'string' ? value : '') : undefined
    }));
    const csv = toCsv(csvColumns, rows);
    downloadCsv(buildReportFilename(reportLabel), csv);
  };

  const filtersActive =
    search.trim() !== '' ||
    Object.entries(appliedFilters).some(([key, value]) => (key === 'dateFrom' || key === 'dateTo' ? value !== '' : value !== ALL)) ||
    revisionScope !== 'Both';

  return (
    <Box>
      <PageHeader title="Reports" subtitle="View, filter and export label verification and approval activity." />

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Something went wrong loading report data. Please refresh the page.
        </Alert>
      )}

      <Paper sx={{ borderRadius: 3, mb: 3 }}>
        <Tabs
          value={activeReport}
          onChange={handleChangeReportType}
          variant="scrollable"
          scrollButtons="auto"
          textColor="primary"
          indicatorColor="primary"
          sx={{ px: 2, pt: 1 }}
        >
          {REPORT_TYPES.map((type) => (
            <Tab key={type.key} value={type.key} label={type.label} sx={{ textTransform: 'none', fontWeight: 700 }} />
          ))}
        </Tabs>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <TextField
          label="Search"
          placeholder="Search by Comparison ID, Artwork ID, Product, Brand, or Company"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          fullWidth
          sx={{ mb: 3 }}
        />

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#6B7177' }}>
          Filters
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <TextField
            label="Date From"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={filterDraft.dateFrom}
            onChange={(event) => setFilterDraft((prev) => ({ ...prev, dateFrom: event.target.value }))}
            sx={{ minWidth: 160 }}
          />
          <TextField
            label="Date To"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={filterDraft.dateTo}
            onChange={(event) => setFilterDraft((prev) => ({ ...prev, dateTo: event.target.value }))}
            sx={{ minWidth: 160 }}
          />

          {visibility.product && (
            <FormControl sx={{ minWidth: 190 }}>
              <InputLabel>Product</InputLabel>
              <Select
                value={filterDraft.productId}
                label="Product"
                onChange={(event) => setFilterDraft((prev) => ({ ...prev, productId: event.target.value }))}
              >
                <MenuItem value={ALL}>All</MenuItem>
                {referenceData.products.map((product) => (
                  <MenuItem key={product.id} value={product.id}>
                    {product.productName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {visibility.brand && (
            <FormControl sx={{ minWidth: 160 }}>
              <InputLabel>Brand</InputLabel>
              <Select value={filterDraft.brand} label="Brand" onChange={(event) => setFilterDraft((prev) => ({ ...prev, brand: event.target.value }))}>
                <MenuItem value={ALL}>All</MenuItem>
                {referenceData.brands.map((brand) => (
                  <MenuItem key={brand} value={brand}>
                    {brand}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {visibility.marketingCompany && (
            <FormControl sx={{ minWidth: 190 }}>
              <InputLabel>Party</InputLabel>
              <Select
                value={filterDraft.marketingCompany}
                label="Party"
                onChange={(event) => setFilterDraft((prev) => ({ ...prev, marketingCompany: event.target.value }))}
              >
                <MenuItem value={ALL}>All</MenuItem>
                {referenceData.marketingCompanies.map((company) => (
                  <MenuItem key={company} value={company}>
                    {company}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {visibility.manufacturingCompany && (
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Manufacturing Company</InputLabel>
              <Select
                value={filterDraft.manufacturingCompany}
                label="Manufacturing Company"
                onChange={(event) => setFilterDraft((prev) => ({ ...prev, manufacturingCompany: event.target.value }))}
              >
                <MenuItem value={ALL}>All</MenuItem>
                {referenceData.manufacturingCompanies.map((company) => (
                  <MenuItem key={company} value={company}>
                    {company}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {visibility.status && statusOptions && (
            <FormControl sx={{ minWidth: 190 }}>
              <InputLabel>Status</InputLabel>
              <Select value={filterDraft.status} label="Status" onChange={(event) => setFilterDraft((prev) => ({ ...prev, status: event.target.value }))}>
                <MenuItem value={ALL}>All</MenuItem>
                {statusOptions.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {visibility.artworkVersion && (
            <FormControl sx={{ minWidth: 140 }}>
              <InputLabel>Artwork Version</InputLabel>
              <Select
                value={filterDraft.artworkVersion}
                label="Artwork Version"
                onChange={(event) => setFilterDraft((prev) => ({ ...prev, artworkVersion: event.target.value }))}
              >
                <MenuItem value={ALL}>All</MenuItem>
                {referenceData.artworkVersions.map((version) => (
                  <MenuItem key={version} value={version}>
                    {version}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {visibility.user && (
            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel>User / Reviewer</InputLabel>
              <Select value={filterDraft.user} label="User / Reviewer" onChange={(event) => setFilterDraft((prev) => ({ ...prev, user: event.target.value }))}>
                <MenuItem value={ALL}>All</MenuItem>
                {referenceData.users.map((user) => (
                  <MenuItem key={user} value={user}>
                    {user}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {visibility.revisionScope && (
            <FormControl sx={{ minWidth: 190 }}>
              <InputLabel>Show</InputLabel>
              <Select value={revisionScope} label="Show" onChange={(event) => setRevisionScope(event.target.value as RevisionScope)}>
                <MenuItem value="Both">Both</MenuItem>
                <MenuItem value="Rejected">Rejected</MenuItem>
                <MenuItem value="Revision Required">Revision Required</MenuItem>
              </Select>
            </FormControl>
          )}

          <Button variant="contained" sx={{ bgcolor: '#00A651', '&:hover': { bgcolor: '#00913f' } }} onClick={handleApplyFilters}>
            Apply Filters
          </Button>
          <Button variant="outlined" sx={{ borderColor: '#D8DDE3', color: '#9EA4AB' }} onClick={handleClearFilters}>
            Clear Filters
          </Button>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(160px, 1fr))' }, gap: 2, mb: 3 }}>
        {summaryCards.map((card) => (
          <Card key={card.label} sx={{ p: 3, borderRadius: 3, bgcolor: '#EEF1F4' }}>
            <Typography variant="subtitle2" sx={{ color: '#6B7177', mb: 1, fontWeight: 700 }}>
              {card.label}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              {card.value}
            </Typography>
          </Card>
        ))}
      </Box>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {REPORT_TYPES.find((type) => type.key === activeReport)?.label} Report
          </Typography>
          {canExport && (
            <Button variant="outlined" sx={{ borderColor: '#E26737', color: '#2E3135', textTransform: 'none' }} onClick={handleExportCsv} disabled={rows.length === 0}>
              Export CSV
            </Button>
          )}
        </Box>

        {rows.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: '#9EA4AB', mb: 2 }}>
              {filtersActive ? 'No records found.' : 'No activity available.'}
            </Typography>
            {filtersActive && (
              <Button variant="outlined" sx={{ borderColor: '#D8DDE3', color: '#9EA4AB' }} onClick={handleClearFilters}>
                Clear Filters
              </Button>
            )}
          </Box>
        ) : (
          <Box sx={{ height: 560, width: '100%', overflowX: 'auto' }}>
            <DataGrid
              rows={gridRows}
              columns={columns}
              onRowClick={handleRowClick}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: defaultPageSize, page: 0 } } }}
              disableRowSelectionOnClick
              sx={{
                borderRadius: 3,
                borderColor: '#D8DDE3',
                cursor: 'pointer',
                '& .MuiDataGrid-columnHeaders': { bgcolor: '#F3F7FA', borderBottom: '1px solid #D8DDE3' },
                '& .MuiDataGrid-cell': { borderBottom: '1px solid #D8DDE3' }
              }}
            />
          </Box>
        )}
      </Paper>
    </Box>
  );
}
