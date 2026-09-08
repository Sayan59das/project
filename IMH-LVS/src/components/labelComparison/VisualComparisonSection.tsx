// Artwork Similarity (Logo / Design-Layout, AI module brief §7/§9).
// Deliberately its own small section rather than folded into
// DeviationsPanel: that component is built around LabelComparisonFieldResult's
// binary MATCH/DIFFERENT/MISSING/NOT_COMPARED status, while this is a
// genuinely different, continuous similarity score bucketed into
// MATCH/SIMILAR/CONFLICT/MISSING (see types/labelComparison.ts's
// VisualComparisonStatus) — mixing the two would either lose that
// distinction or misrepresent one as the other.
//
// Shown as ONE row, not separate Logo and Design/Layout rows: both are
// driven by the identical whole-image hash today (no logo localisation
// step exists to measure them independently) — see
// imageSimilarity.service.ts's module comment.
import { Box, Paper, Typography } from '@mui/material';
import { StatusChip } from '../StatusChip';
import type { VisualComparisonResult } from '../../types/labelComparison';

type Props = {
  visualComparison: VisualComparisonResult | undefined;
};

// Absent entirely (not a MISSING row) when the visual comparison call
// itself never completed — e.g. one of the two artwork files had no
// retrievable bytes in this session (see artworkService.ts's file-storage
// note) or the comparison service was unreachable. A row that ran and
// simply found nothing comparable would report MISSING instead; this is
// the "did not even attempt it" case, and pretending otherwise would be
// exactly the kind of invented result this whole system avoids.
export function VisualComparisonSection({ visualComparison }: Props) {
  if (!visualComparison) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Artwork Similarity
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
          Not available for this comparison — one of the artwork images could not be read, or the visual comparison
          service did not respond.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        Artwork Similarity
      </Typography>
      <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block', mb: 1.5 }}>
        Compares the artworks' actual images (not extracted text) — covers Logo and Design/Layout together, since
        isolating just the logo region isn't built yet.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
          Logo &amp; Design/Layout
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {typeof visualComparison.similarityPercentage === 'number' && (
            <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
              {visualComparison.similarityPercentage}% similar
            </Typography>
          )}
          <StatusChip status={visualComparison.status} />
        </Box>
      </Box>
    </Paper>
  );
}
