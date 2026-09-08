// "Deviations" review list â€” the redesign's key UX improvement over forcing
// the user to scan a full comparison table: every non-matching field is
// surfaced as a numbered, expandable review item instead. Clicking an item
// reveals its New vs. Latest Approved values (a real, honest "details"
// action); it deliberately does NOT claim to focus/highlight a location on
// the artwork preview, since the extraction pipeline has no coordinate data
// to back that up â€” faking it would be exactly the kind of invented
// functionality this redesign must avoid.
import { useState } from 'react';
import { Box, Collapse, IconButton, Paper, Typography } from '@mui/material';
import { MdExpandLess, MdExpandMore } from 'react-icons/md';
import { StatusChip } from '../StatusChip';
import type { LabelComparisonFieldResult } from '../../types/labelComparison';

export type DeviationStatus = 'SIMILAR' | 'CONFLICT' | 'MISSING' | 'NOT_COMPARED';

// The field's own status IS the real classification now: the backend
// computes SIMILAR vs. CONFLICT itself from actual text similarity (edit
// distance and word overlap, see labelComparison.service.ts's
// isSimilarText), not from a UI-layer guess based on the field's
// importance the way this used to work. This function exists only so call
// sites have one place naming "every non-MATCH status".
export function classifyDeviation(field: LabelComparisonFieldResult): DeviationStatus | 'MATCH' {
  return field.status;
}

type Props = {
  fields: LabelComparisonFieldResult[];
  newLabel: string;
  approvedLabel: string;
};

export function DeviationsPanel({ fields, newLabel, approvedLabel }: Props) {
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const deviations = fields.map((field) => ({ field, status: classifyDeviation(field) })).filter((item) => item.status !== 'MATCH');

  if (deviations.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
          No deviations found â€” every compared field matches the latest approved artwork.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {deviations.map((item, index) => {
        const isOpen = expandedField === item.field.field;
        return (
          <Paper key={item.field.field} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, cursor: 'pointer' }}
              onClick={() => setExpandedField(isOpen ? null : item.field.field)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--c-text-3)', minWidth: 24 }}>
                  {String(index + 1).padStart(2, '0')}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>
                  {item.field.label}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <StatusChip status={item.status} />
                <IconButton size="small">{isOpen ? <MdExpandLess /> : <MdExpandMore />}</IconButton>
              </Box>
            </Box>
            <Collapse in={isOpen}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, px: 2, pb: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                    {newLabel}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                    {item.field.labelA || 'â€”'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                    {approvedLabel}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                    {item.field.labelB || 'â€”'}
                  </Typography>
                </Box>
              </Box>
            </Collapse>
          </Paper>
        );
      })}
    </Box>
  );
}
