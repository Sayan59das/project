// Label Comparison — main/list page.
//
// Business workflow: the user selects an EXISTING label (Product) already
// in the system — never uploads a file. The system automatically resolves
// that label's own highest-versioned artwork and its latest APPROVED
// artwork, runs Version Comparison between them when an approved baseline
// exists (skipping it, with a clear reason, when it doesn't), and always
// runs Cross-Company Comparison against every other marketing company's
// approved artwork for the same product name — see
// components/labelComparison/SelectLabelCard.tsx and
// services/labelComparisonWorkflowService.ts.
//
// Comparison History below is fed by labelComparisonHistoryService (a
// store dedicated to this real-OCR-based workflow) — deliberately separate
// from services/comparisonService.ts's `Comparison` records, which power
// the pre-existing Label Final -> Technical -> QA -> Manager approval
// pipeline (Approvals/QA/Dashboard/Reports) via a hand-authored parameter
// model. That pipeline and its data are untouched by this page.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  IconButton,
  Typography
} from '@mui/material';
import { MdRemoveRedEye, MdSearch } from 'react-icons/md';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { SelectLabelCard } from '../components/labelComparison/SelectLabelCard';
import { useAuth } from '../auth/AuthContext';
import { getLabelComparisons } from '../services/labelComparisonHistoryService';
import type { LabelComparisonRun } from '../types/labelComparisonRecord';
import { formatDateTime } from '../utils/dateFormat';

const ALL = 'All';

function formatVersionLabel(version: string): string {
  const digits = version.replace(/\D/g, '');
  return `v${digits || version}`;
}

function comparedAgainstLabel(run: LabelComparisonRun): string {
  if (run.versionComparison) return `Latest Approved ${formatVersionLabel(run.versionComparison.approvedArtworkVersion)}`;
  if (run.crossCompanyResults.length > 0) return 'Cross-Company only';
  return '—';
}

export function ComparisonPage() {
  const { currentUser } = useAuth();
  const actor = currentUser?.fullName ?? 'Unknown User';
  const navigate = useNavigate();

  const [runs, setRuns] = useState<LabelComparisonRun[]>(() => getLabelComparisons());
  const refresh = () => setRuns(getLabelComparisons());

  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState(ALL);
  const [partyFilter, setPartyFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const products = useMemo(() => Array.from(new Set(runs.map((run) => run.productName))).sort(), [runs]);
  const parties = useMemo(() => Array.from(new Set(runs.map((run) => run.marketingCompany))).sort(), [runs]);

  const filteredRuns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return runs.filter((run) => {
      if (productFilter !== ALL && run.productName !== productFilter) return false;
      if (partyFilter !== ALL && run.marketingCompany !== partyFilter) return false;
      if (statusFilter !== ALL && statusFilter !== 'Completed') return false;
      if (dateFrom && run.comparisonDate.slice(0, 10) < dateFrom) return false;
      if (dateTo && run.comparisonDate.slice(0, 10) > dateTo) return false;
      if (term) {
        const haystack = `${run.id} ${run.productName} ${run.marketingCompany} ${run.candidateArtworkFileName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [runs, search, productFilter, partyFilter, statusFilter, dateFrom, dateTo]);

  const handleClearFilters = () => {
    setSearch('');
    setProductFilter(ALL);
    setPartyFilter(ALL);
    setStatusFilter(ALL);
    setDateFrom('');
    setDateTo('');
  };

  const hasAnyHistory = runs.length > 0;
  const hasActiveFilters = Boolean(search || productFilter !== ALL || partyFilter !== ALL || statusFilter !== ALL || dateFrom || dateTo);

  return (
    <Box>
      <PageHeader title="Label Comparison" subtitle="Compare a label against the latest approved artwork." />

      <SelectLabelCard
        actor={actor}
        onCompared={(runId) => {
          refresh();
          navigate(`/comparison/${runId}`);
        }}
      />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Comparison History
        </Typography>

        {hasAnyHistory && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
            <TextField
              size="small"
              placeholder="Search comparisons"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              slotProps={{ input: { startAdornment: <MdSearch style={{ marginRight: 6, color: '#9EA4AB' }} /> } }}
              sx={{ minWidth: 220 }}
            />
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Product</InputLabel>
              <Select label="Product" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
                <MenuItem value={ALL}>All</MenuItem>
                {products.map((product) => (
                  <MenuItem key={product} value={product}>
                    {product}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Party</InputLabel>
              <Select label="Party" value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)}>
                <MenuItem value={ALL}>All</MenuItem>
                {parties.map((party) => (
                  <MenuItem key={party} value={party}>
                    {party}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <MenuItem value={ALL}>All</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="From"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 150 }}
            />
            <TextField
              size="small"
              label="To"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 150 }}
            />
            {hasActiveFilters && (
              <Button variant="outlined" sx={{ borderColor: '#D8DDE3', color: '#6B7177', textTransform: 'none' }} onClick={handleClearFilters}>
                Clear Filters
              </Button>
            )}
          </Box>
        )}

        {!hasAnyHistory ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ fontWeight: 700, color: '#6B7177' }}>
              No comparisons yet
            </Typography>
            <Typography variant="body2" sx={{ color: '#9EA4AB', mt: 0.5 }}>
              Start a new comparison by selecting a label above.
            </Typography>
          </Box>
        ) : filteredRuns.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
              No comparisons match the current filters.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Comparison ID</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Party</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Label Artwork</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Compared Against</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Match %</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Compared On</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRuns.map((run) => (
                  <TableRow key={run.id} hover sx={{ '&:hover': { bgcolor: '#EEF1F4' } }}>
                    <TableCell>
                      <Tooltip title="View">
                        <IconButton size="small" aria-label="View" onClick={() => navigate(`/comparison/${run.id}`)}>
                          <MdRemoveRedEye size={18} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{run.id}</TableCell>
                    <TableCell>{run.productName}</TableCell>
                    <TableCell>{run.marketingCompany}</TableCell>
                    <TableCell>{run.candidateArtworkFileName}</TableCell>
                    <TableCell>{comparedAgainstLabel(run)}</TableCell>
                    <TableCell>{run.versionComparison ? `${run.versionComparison.result.comparison.overallPercentage}%` : '—'}</TableCell>
                    <TableCell>
                      <StatusChip status="Completed" />
                    </TableCell>
                    <TableCell>{formatDateTime(run.comparisonDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
