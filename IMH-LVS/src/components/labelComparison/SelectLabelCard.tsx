// "Start New Comparison" card for the Label Comparison main page.
// Deliberately selection-based, never upload-based: the user picks an
// EXISTING label (Product) already in the system, and the system
// automatically resolves which two (or more) already-stored artworks to
// compare — there is no file upload, no approved-artwork upload, and no
// version dropdown anywhere in this flow, matching the business workflow:
// Select Label -> (approved version exists?) -> Version Comparison (or
// skip) -> Cross-Company Comparison -> Final Result.
import { useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import { MdCompareArrows } from 'react-icons/md';
import {
  ComparisonPlan,
  formatLabelName,
  getSelectableLabels,
  identifyComparisonPlan,
  LabelComparisonError,
  LabelExtractionError,
  runComparisonWorkflow
} from '../../services/labelComparisonWorkflowService';
import type { Product } from '../../types/product';
import { formatDateTime } from '../../utils/dateFormat';

function formatVersionLabel(version: string): string {
  const digits = version.replace(/\D/g, '');
  return `Version ${digits || version}`;
}

type Props = {
  actor: string;
  onCompared: (runId: string) => void;
};

export function SelectLabelCard({ actor, onCompared }: Props) {
  const labels = useMemo(() => getSelectableLabels(), []);
  const [selected, setSelected] = useState<Product | null>(null);
  const [plan, setPlan] = useState<ComparisonPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (product: Product | null) => {
    setSelected(product);
    setError(null);
    setPlan(product ? identifyComparisonPlan(product.id) ?? null : null);
  };

  const handleRun = async () => {
    if (!plan || plan.status === 'no_artwork') return;
    setRunning(true);
    setError(null);
    try {
      const outcome = await runComparisonWorkflow(plan, actor);
      if (outcome.status === 'success') {
        onCompared(outcome.run.id);
      } else {
        setError(
          `"${outcome.artwork.fileName || outcome.artwork.version}" does not have a retrievable file in this session, so the comparison could not be run. This is a data limitation, not a comparison failure.`
        );
      }
    } catch (err) {
      setError(
        err instanceof LabelExtractionError || err instanceof LabelComparisonError ? err.message : 'Could not run the comparison. Please try again.'
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Start New Comparison
      </Typography>
      <Typography variant="body2" sx={{ color: '#9EA4AB', mt: 0.5, mb: 2.5 }}>
        Select an existing label to compare it with the latest approved artwork.
      </Typography>

      <Box sx={{ maxWidth: 520 }}>
        <Typography variant="caption" sx={{ color: '#6B7177', fontWeight: 700, display: 'block', mb: 1 }}>
          Select Label
        </Typography>
        <Autocomplete
          options={labels}
          getOptionLabel={(product) => formatLabelName(product)}
          value={selected}
          onChange={(_, value) => handleSelect(value)}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          renderInput={(params) => <TextField {...params} placeholder="Search by brand or product name" />}
        />
      </Box>

      {plan?.status === 'no_artwork' && (
        <Alert severity="warning" sx={{ borderRadius: 2, mt: 2.5, maxWidth: 520 }}>
          No artwork has been uploaded for this label yet. Add an artwork in Artwork Management before running a comparison.
        </Alert>
      )}

      {plan && plan.status !== 'no_artwork' && (
        <Box sx={{ mt: 2.5 }}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, maxWidth: 520 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Selected Label
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                  Product
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                  {plan.product.productName}
                </Typography>
              </Box>
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                  Marketing Company
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                  {plan.product.marketingCompany}
                </Typography>
              </Box>
              {(plan.status === 'ready' || plan.status === 'up_to_date') && (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                      Latest Approved Artwork
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                      {formatVersionLabel(plan.approvedArtwork.version)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                      Approved On
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                      {formatDateTime(plan.approvedArtwork.updatedDate)}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>

            {plan.status === 'ready' && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: '#9EA4AB', fontStyle: 'italic' }}>
                Latest approved artwork is automatically selected for comparison.
              </Typography>
            )}
            {plan.status === 'no_approved_baseline' && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: '#B26A00' }}>
                No previous approved version found. Version comparison has been skipped — proceeding directly to Cross-Company
                Comparison.
              </Typography>
            )}
            {plan.status === 'up_to_date' && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: '#B26A00' }}>
                This label's latest artwork is already the approved version — nothing new to compare. Proceeding directly to
                Cross-Company Comparison.
              </Typography>
            )}
          </Paper>

          <Button
            variant="contained"
            startIcon={running ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <MdCompareArrows />}
            sx={{ bgcolor: '#E26737', '&:hover': { bgcolor: '#d55b2f' }, textTransform: 'none', mt: 2.5 }}
            disabled={running}
            onClick={handleRun}
          >
            {running ? 'Running comparison…' : 'Run Comparison'}
          </Button>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mt: 2.5, maxWidth: 520 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
}
