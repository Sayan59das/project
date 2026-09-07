// "Start New Comparison" card for the Label Comparison main page.
// Deliberately selection-based, never upload-based: the user picks an
// EXISTING label (Product) already in the system, and the system
// automatically resolves which two (or more) already-stored artworks to
// compare â€” there is no file upload, no approved-artwork upload, and no
// version dropdown anywhere in this flow, matching the business workflow:
// Select Label -> (approved version exists?) -> Version Comparison (or
// skip) -> Cross-Company Comparison -> Final Result.
import { useEffect, useState } from 'react';
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
  const [labels, setLabels] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [plan, setPlan] = useState<ComparisonPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The selectable labels are a request now. A failure is reported in the same
  // place as a comparison failure rather than leaving an empty picker, which
  // would read as "this company has no labels".
  useEffect(() => {
    let cancelled = false;
    getSelectableLabels()
      .then((products) => {
        if (!cancelled) setLabels(products);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the label list.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (product: Product | null) => {
    setSelected(product);
    setError(null);
    setPlan(null);
    if (!product) return;

    // Which artwork this label would be compared against comes from the server;
    // until it answers there is no plan, and the Run button stays disabled.
    identifyComparisonPlan(product.id)
      .then((identified) => setPlan(identified ?? null))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not prepare this comparison.'));
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
      <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mt: 0.5, mb: 2.5 }}>
        Select an existing label to compare it with the latest approved artwork.
      </Typography>

      <Box sx={{ maxWidth: 520 }}>
        <Typography variant="caption" sx={{ color: 'var(--c-text-2)', fontWeight: 700, display: 'block', mb: 1 }}>
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
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Product
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                  {plan.product.productName}
                </Typography>
              </Box>
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Marketing Company
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                  {plan.product.marketingCompany}
                </Typography>
              </Box>
              {(plan.status === 'ready' || plan.status === 'up_to_date') && (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                      Latest Approved Artwork
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                      {formatVersionLabel(plan.approvedArtwork.version)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                      Approved On
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                      {formatDateTime(plan.approvedArtwork.updatedDate)}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>

            {plan.status === 'ready' && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
                Latest approved artwork is automatically selected for comparison.
              </Typography>
            )}
            {plan.status === 'no_approved_baseline' && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'var(--c-warn-800)' }}>
                No previous approved version found. Version comparison has been skipped â€” proceeding directly to Cross-Company
                Comparison.
              </Typography>
            )}
            {plan.status === 'up_to_date' && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'var(--c-warn-800)' }}>
                This label's latest artwork is already the approved version â€” nothing new to compare. Proceeding directly to
                Cross-Company Comparison.
              </Typography>
            )}
          </Paper>

          <Button
            variant="contained"
            startIcon={running ? <CircularProgress size={16} sx={{ color: 'var(--c-paper)' }} /> : <MdCompareArrows />}
            sx={{ bgcolor: 'var(--c-orange)', '&:hover': { bgcolor: 'var(--c-orange-600)' }, textTransform: 'none', mt: 2.5 }}
            disabled={running}
            onClick={handleRun}
          >
            {running ? 'Running comparisonâ€¦' : 'Run Comparison'}
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
