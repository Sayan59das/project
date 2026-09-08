// Nutrition table row-by-row comparison (AI module brief §7/§12) - a
// changed Protein value is a real, specific CONFLICT on that row, not just
// a difference buried inside the coarse nutritionTableFormat classification
// string (which is still compared separately, as one of the normal 14
// fields - see labelComparison.service.ts's own comment on why this is
// deliberately additional detail, not a replacement).
//
// Absent entirely, not an empty table, when neither side had a structured
// nutrition table to compare at all - today that means the AI backend's
// vision-model fallback never ran or never read one (see
// LabelExtractionResult's nutritionTable comment for exactly when it does).
import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { StatusChip } from '../StatusChip';
import type { NutritionTableComparison } from '../../types/labelComparison';

type Props = {
  nutritionComparison: NutritionTableComparison | undefined;
  newLabel: string;
  approvedLabel: string;
};

export function NutritionComparisonSection({ nutritionComparison, newLabel, approvedLabel }: Props) {
  if (!nutritionComparison) return null;

  return (
    <Paper sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Nutrition Table
      </Typography>
      <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block', mb: 1.5 }}>
        Each nutrient row compared individually, in addition to the overall Nutrition Table Format field above.
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nutrient</TableCell>
              <TableCell>{newLabel}</TableCell>
              <TableCell>{approvedLabel}</TableCell>
              <TableCell>Result</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {nutritionComparison.rows.map((row) => (
              <TableRow key={row.nutrient}>
                <TableCell sx={{ fontWeight: 600 }}>{row.nutrient}</TableCell>
                <TableCell>{row.valueA || '—'}</TableCell>
                <TableCell>{row.valueB || '—'}</TableCell>
                <TableCell>
                  <StatusChip status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
