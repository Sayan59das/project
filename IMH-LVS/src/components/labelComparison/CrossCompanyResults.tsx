// Cross-Company Comparison results â€” always computed as part of the
// workflow run (see labelComparisonWorkflowService.runComparisonWorkflow),
// never a separate manual step the user has to trigger per candidate. This
// is purely a display of already-computed real results: one entry per
// other marketing company's approved artwork for the same product name,
// each with its own real OCR-based similarity score. A score at or above
// 70% is flagged as "Potentially too similar" â€” a threshold, not a claim
// that the system has determined infringement â€” so a reviewer knows where
// to look first without the panel silently deciding anything for them.
import { Box, Paper, Typography } from '@mui/material';
import { StatusChip } from '../StatusChip';
import type { CrossCompanyResultEntry } from '../../types/labelComparisonRecord';

const HIGH_SIMILARITY_THRESHOLD = 70;

function severityColor(percentage: number): string {
  if (percentage >= HIGH_SIMILARITY_THRESHOLD) return 'var(--c-error)';
  if (percentage >= 40) return 'var(--c-warn)';
  return 'var(--c-green)';
}

function formatVersion(version: string): string {
  const digits = version.replace(/\D/g, '');
  return `v${digits || version}`;
}

type Props = {
  results: CrossCompanyResultEntry[];
};

export function CrossCompanyResults({ results }: Props) {
  if (results.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
          No comparable labels from other marketing companies were found for this product.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {results.map((entry) => (
        <Paper key={entry.candidateArtworkId} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {entry.candidateMarketingCompany}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
                {entry.candidateProductName} â€” {formatVersion(entry.candidateArtworkVersion)}
              </Typography>
            </Box>
            {entry.outcome.status === 'success' ? (
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h5" sx={{ fontWeight: 800, color: severityColor(entry.outcome.result.comparison.overallPercentage) }}>
                  {entry.outcome.result.comparison.overallPercentage}%
                </Typography>
                {entry.outcome.result.comparison.overallPercentage >= HIGH_SIMILARITY_THRESHOLD && (
                  <Typography variant="caption" sx={{ color: 'var(--c-error)', fontWeight: 700, display: 'block' }}>
                    Potentially too similar
                  </Typography>
                )}
              </Box>
            ) : (
              <StatusChip status="NOT_COMPARED" />
            )}
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
