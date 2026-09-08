// Cross-Company Comparison results - always computed as part of the
// workflow run (see labelComparisonWorkflowService.runComparisonWorkflow),
// never a separate manual step the user has to trigger per candidate. This
// is purely a display of already-computed real results: one entry per
// other marketing company's approved artwork for the same product name,
// each with its own real OCR-based similarity score. A score at or above
// 70% is flagged as "Potentially too similar" - a threshold, not a claim
// that the system has determined infringement - so a reviewer knows where
// to look first without the panel silently deciding anything for them.
//
// Sorted highest-similarity-first and the top SUCCESSFUL result is marked
// Best Match (AI module brief §6/§8) - the same selection
// labelComparisonWorkflowService.findBestCrossCompanyMatch already computed
// for the run record and the report, so this display never disagrees with
// what got persisted.
import { Box, Chip, Paper, Typography } from '@mui/material';
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

function overallPercentageOf(entry: CrossCompanyResultEntry): number {
  return entry.outcome.status === 'success' ? entry.outcome.result.comparison.overallPercentage : -1;
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

  const sorted = [...results].sort((a, b) => overallPercentageOf(b) - overallPercentageOf(a));
  const bestArtworkId = sorted.find((entry) => entry.outcome.status === 'success')?.candidateArtworkId;

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {sorted.map((entry) => {
        const isBestMatch = entry.candidateArtworkId === bestArtworkId;
        return (
          <Paper
            key={entry.candidateArtworkId}
            variant="outlined"
            sx={{ p: 2, borderRadius: 3, borderColor: isBestMatch ? 'var(--c-orange)' : undefined, borderWidth: isBestMatch ? 2 : 1 }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {entry.candidateMarketingCompany}
                  </Typography>
                  {isBestMatch && <Chip label="Best Match" size="small" sx={{ bgcolor: 'var(--c-orange)', color: '#fff', fontWeight: 700 }} />}
                </Box>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
                  {entry.candidateProductName} - {formatVersion(entry.candidateArtworkVersion)}
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
                  {entry.outcome.visualComparison && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', mt: 0.5 }}>
                      <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
                        Artwork
                      </Typography>
                      <StatusChip status={entry.outcome.visualComparison.status} />
                    </Box>
                  )}
                </Box>
              ) : (
                <StatusChip status="NOT_COMPARED" />
              )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
